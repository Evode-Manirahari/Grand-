import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleIncomingChat } from "../../packages/connectors/chat-simulator.mjs";
import { handleOpenClawEvent, verifyOpenClawSecret } from "../../packages/connectors/openclaw-bridge.mjs";
import { loadEnvFile } from "../../packages/config/env-file.mjs";
import { getMetrics, approveTask, rejectTask } from "../../packages/core/task-engine.mjs";
import { buildTaskReport, loadState, saveState } from "../../packages/reports/report-store.mjs";
import { runQueuedTasks } from "../../packages/sandbox/safe-runner.mjs";

loadEnvFile();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(__dirname, "public");
const statePath = process.env.GRAND_STATE_PATH || path.join(process.cwd(), "data", "grand-state.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

const state = await loadState(statePath);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, 500, {
      error: error.message
    });
  }
});

server.listen(port, host, () => {
  console.log(`Grand Ops running at http://${host}:${port}`);
});

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, publicState());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/openclaw/events") {
    const auth = verifyOpenClawSecret(request.headers, process.env.GRAND_OPENCLAW_SECRET);

    if (!auth.ok) {
      sendJson(response, 401, {
        error: "OpenClaw bridge authentication failed",
        reason: auth.reason
      });
      return;
    }

    try {
      const body = await readBody(request);
      const events = Array.isArray(body.events) ? body.events : [body];
      const results = events.map((event) => handleOpenClawEvent(state, event));

      await saveState(statePath, state);
      sendJson(response, 202, {
        auth,
        results,
        state: publicState()
      });
    } catch (error) {
      sendJson(response, 400, {
        error: error.message
      });
    }

    return;
  }

  if (request.method === "POST" && url.pathname === "/api/messages") {
    const body = await readBody(request);
    const result = handleIncomingChat(state, {
      channel: body.channel || "webchat",
      from: body.from || "operator",
      text: requireText(body.text),
      url: body.url || null
    });
    await saveState(statePath, state);
    sendJson(response, 201, {
      result,
      state: publicState()
    });
    return;
  }

  const approveMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/approve$/);
  if (request.method === "POST" && approveMatch) {
    const body = await readBody(request);
    const task = approveTask(state, approveMatch[1], body.actor || "operator");
    await saveState(statePath, state);
    sendJson(response, 200, {
      task,
      state: publicState()
    });
    return;
  }

  const rejectMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/reject$/);
  if (request.method === "POST" && rejectMatch) {
    const body = await readBody(request);
    const task = rejectTask(state, rejectMatch[1], body.actor || "operator");
    await saveState(statePath, state);
    sendJson(response, 200, {
      task,
      state: publicState()
    });
    return;
  }

  const reportMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/report$/);
  if (request.method === "GET" && reportMatch) {
    const task = state.tasks.find((candidate) => candidate.id === reportMatch[1]);
    if (!task) {
      sendJson(response, 404, { error: "Task not found" });
      return;
    }

    response.writeHead(200, {
      "content-type": "text/markdown; charset=utf-8"
    });
    response.end(buildTaskReport(task, state));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/run") {
    const results = runQueuedTasks(state);
    await saveState(statePath, state);
    sendJson(response, 200, {
      results,
      state: publicState()
    });
    return;
  }

  sendJson(response, 404, {
    error: "Not found"
  });
}

async function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicRoot, safePath);

  if (!filePath.startsWith(publicRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentType(filePath)
    });
    response.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    throw error;
  }
}

function publicState() {
  return {
    ...state,
    metrics: getMetrics(state)
  };
}

async function readBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};

  return JSON.parse(raw);
}

function requireText(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Message text is required");
  }

  return value;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
