import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadEnvFile, parseEnvFile } from "./env-file.mjs";

test("parses common .env forms", () => {
  assert.deepEqual(
    parseEnvFile(`
# ignored
GRAND_URL=http://127.0.0.1:4173
export GRAND_OPENCLAW_SECRET="line\\nsecret"
SINGLE='literal value'
BARE=value # inline comment
`),
    {
      GRAND_URL: "http://127.0.0.1:4173",
      GRAND_OPENCLAW_SECRET: "line\nsecret",
      SINGLE: "literal value",
      BARE: "value"
    }
  );
});

test("loads missing .env files as a no-op", () => {
  const result = loadEnvFile(path.join(os.tmpdir(), "grand-missing-env-file"), {});

  assert.equal(result.loaded, false);
  assert.deepEqual(result.keys, []);
});

test("loads .env values without overriding existing env", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "grand-env-"));
  const filePath = path.join(dir, ".env");
  const env = {
    GRAND_URL: "http://existing.local"
  };

  try {
    writeFileSync(filePath, "GRAND_URL=http://new.local\nGRAND_OPENCLAW_SECRET=secret\n");

    const result = loadEnvFile(filePath, env);

    assert.equal(result.loaded, true);
    assert.deepEqual(result.keys, ["GRAND_OPENCLAW_SECRET"]);
    assert.equal(env.GRAND_URL, "http://existing.local");
    assert.equal(env.GRAND_OPENCLAW_SECRET, "secret");
  } finally {
    rmSync(dir, {
      recursive: true,
      force: true
    });
  }
});
