const stateUrl = "/api/state";
const columns = [
  { key: "needs_approval", label: "Needs Approval" },
  { key: "queued", label: "Queued" },
  { key: "completed", label: "Completed" }
];

let currentState = null;

const refs = {
  form: document.querySelector("#messageForm"),
  channel: document.querySelector("#channelInput"),
  from: document.querySelector("#fromInput"),
  text: document.querySelector("#textInput"),
  lastReply: document.querySelector("#lastReply"),
  refreshButton: document.querySelector("#refreshButton"),
  runButton: document.querySelector("#runButton"),
  taskColumns: document.querySelector("#taskColumns"),
  eventList: document.querySelector("#eventList"),
  updatedAt: document.querySelector("#updatedAt"),
  reportDialog: document.querySelector("#reportDialog"),
  reportOutput: document.querySelector("#reportOutput"),
  closeReportButton: document.querySelector("#closeReportButton"),
  metrics: {
    total: document.querySelector("#metricTotal"),
    queued: document.querySelector("#metricQueued"),
    approval: document.querySelector("#metricApproval"),
    completed: document.querySelector("#metricCompleted"),
    blocked: document.querySelector("#metricBlocked")
  }
};

refs.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  refs.lastReply.textContent = "Adding message...";

  const payload = {
    channel: refs.channel.value,
    from: refs.from.value,
    text: refs.text.value
  };
  const response = await postJson("/api/messages", payload);
  currentState = response.state;
  refs.lastReply.textContent = response.result.reply;
  render();
});

refs.refreshButton.addEventListener("click", loadState);
refs.runButton.addEventListener("click", async () => {
  refs.lastReply.textContent = "Running queued work...";
  const response = await postJson("/api/run", {});
  currentState = response.state;
  refs.lastReply.textContent = summarizeRun(response.results);
  render();
});

refs.closeReportButton.addEventListener("click", () => refs.reportDialog.close());

await loadState();

async function loadState() {
  refs.lastReply.textContent = "Refreshing...";
  const response = await fetch(stateUrl);
  currentState = await response.json();
  refs.lastReply.textContent = "Ready";
  render();
}

function render() {
  renderMetrics();
  renderTasks();
  renderEvents();
  refs.updatedAt.textContent = currentState ? formatDate(currentState.updatedAt) : "Not loaded";
}

function renderMetrics() {
  const metrics = currentState.metrics;
  refs.metrics.total.textContent = metrics.total;
  refs.metrics.queued.textContent = metrics.queued;
  refs.metrics.approval.textContent = metrics.needsApproval;
  refs.metrics.completed.textContent = metrics.completed;
  refs.metrics.blocked.textContent = metrics.blocked;
}

function renderTasks() {
  refs.taskColumns.innerHTML = "";

  for (const column of columns) {
    const tasks = currentState.tasks.filter((task) => task.status === column.key);
    const element = document.createElement("section");
    element.className = "task-column";
    element.innerHTML = `
      <div class="column-title">
        <span>${column.label}</span>
        <span>${tasks.length}</span>
      </div>
    `;

    for (const task of tasks) {
      element.appendChild(renderTaskCard(task));
    }

    refs.taskColumns.appendChild(element);
  }

  const otherTasks = currentState.tasks.filter(
    (task) => !columns.some((column) => column.key === task.status)
  );

  if (otherTasks.length > 0) {
    const element = document.createElement("section");
    element.className = "task-column";
    element.innerHTML = `
      <div class="column-title">
        <span>Other</span>
        <span>${otherTasks.length}</span>
      </div>
    `;

    for (const task of otherTasks) {
      element.appendChild(renderTaskCard(task));
    }

    refs.taskColumns.appendChild(element);
  }
}

function renderTaskCard(task) {
  const card = document.createElement("article");
  card.className = "task-card";
  card.innerHTML = `
    <h3>${escapeHtml(task.title)}</h3>
    <div class="task-meta">
      <span class="badge">${escapeHtml(task.id)}</span>
      <span class="badge ${riskClass(task)}">${escapeHtml(task.risk.level)}</span>
      <span class="badge">${escapeHtml(task.source.channel)}</span>
    </div>
    <p class="task-source">${escapeHtml(task.source.text)}</p>
    <div class="task-actions"></div>
  `;

  const actions = card.querySelector(".task-actions");

  if (task.status === "needs_approval") {
    actions.appendChild(button("Approve", "secondary-button", () => approve(task.id)));
    actions.appendChild(button("Reject", "danger-button", () => reject(task.id)));
  }

  actions.appendChild(button("Report", "secondary-button", () => showReport(task.id)));

  return card;
}

function renderEvents() {
  refs.eventList.innerHTML = "";

  for (const event of currentState.events.slice(0, 18)) {
    const item = document.createElement("li");
    item.innerHTML = `
      <strong>${escapeHtml(event.summary)}</strong>
      <time>${formatDate(event.at)}</time>
    `;
    refs.eventList.appendChild(item);
  }
}

async function approve(taskId) {
  const response = await postJson(`/api/tasks/${encodeURIComponent(taskId)}/approve`, {
    actor: refs.from.value || "operator"
  });
  currentState = response.state;
  refs.lastReply.textContent = `${taskId} approved`;
  render();
}

async function reject(taskId) {
  const response = await postJson(`/api/tasks/${encodeURIComponent(taskId)}/reject`, {
    actor: refs.from.value || "operator"
  });
  currentState = response.state;
  refs.lastReply.textContent = `${taskId} rejected`;
  render();
}

async function showReport(taskId) {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/report`);
  refs.reportOutput.textContent = await response.text();
  refs.reportDialog.showModal();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }

  return body;
}

function button(label, className, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

function riskClass(task) {
  if (task.risk.level === "blocked") return "blocked";
  if (task.risk.level === "approval") return "approval";
  return "safe";
}

function summarizeRun(results) {
  if (results.length === 0) return "No queued work was ready.";
  const completed = results.filter((result) => result.outcome === "completed").length;
  const waiting = results.filter((result) => result.outcome === "waiting").length;
  const blocked = results.filter((result) => result.outcome === "blocked").length;
  return `${completed} completed · ${waiting} waiting · ${blocked} blocked`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
