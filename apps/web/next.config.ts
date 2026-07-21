import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The workspace keeps one environment file at the repository root so the web
// app and the future worker share the same provider configuration.
const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceEnvPath = path.resolve(configDirectory, "../../.env.local");

if (fs.existsSync(workspaceEnvPath)) {
  for (const line of fs.readFileSync(workspaceEnvPath, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || rawValue === undefined || process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/u, "$2");
  }
}

const nextConfig: NextConfig = {
  transpilePackages: ["@ai-trend-radar/types"],
  typedRoutes: true,
};

export default nextConfig;
