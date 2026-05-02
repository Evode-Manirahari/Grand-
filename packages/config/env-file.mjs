import { readFileSync } from "node:fs";
import path from "node:path";

export function loadEnvFile(filePath = path.join(process.cwd(), ".env"), env = process.env) {
  let raw;

  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        loaded: false,
        path: filePath,
        keys: []
      };
    }

    throw error;
  }

  const values = parseEnvFile(raw);
  const keys = [];

  for (const [key, value] of Object.entries(values)) {
    if (env[key] === undefined) {
      env[key] = value;
      keys.push(key);
    }
  }

  return {
    loaded: true,
    path: filePath,
    keys
  };
}

export function parseEnvFile(raw) {
  const values = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    values[match[1]] = parseEnvValue(match[2]);
  }

  return values;
}

function parseEnvValue(rawValue) {
  const value = rawValue.trim();

  if (value.startsWith('"') && value.endsWith('"')) {
    return value
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value.replace(/\s+#.*$/, "").trim();
}
