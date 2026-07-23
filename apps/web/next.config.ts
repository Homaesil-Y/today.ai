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

// 전역 보안 응답 헤더. 하이드레이션을 깨지 않는 범위(스크립트/스타일 소스를 강제하지 않음)에서
// 클릭재킹·MIME 스니핑·리퍼러 유출·권한 남용을 차단한다. 스크립트 소스까지 제한하는 완전한 CSP는
// nonce 도입이 필요해 별도 후속으로 다룬다.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@ai-trend-radar/types"],
  typedRoutes: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
