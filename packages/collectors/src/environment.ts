import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultWorkspaceEnvPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.env.local",
);

export function loadWorkspaceEnvironment(
  envPath = defaultWorkspaceEnvPath,
  target: NodeJS.ProcessEnv = process.env,
) {
  if (!fs.existsSync(envPath)) return target;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || rawValue === undefined || target[key] !== undefined) continue;
    target[key] = rawValue.replace(/^(['"])(.*)\1$/u, "$2");
  }
  return target;
}
