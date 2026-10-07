import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EGRESS_RESPONSE_OVERHEAD_BYTES } from "@ai-trend-radar/types/egress";
import {
  egressTallies,
  estimateCompressedBytes,
  meteredFetch,
  resetEgressTallies,
  writeEgressTallies,
} from "./egress-meter";

/**
 * GitHub Actions 쪽 Supabase 전송량 계량. 2026-10-06 egress 한도 초과 차단의 재발 방지 장치라,
 * 계량이 조용히 0 을 세거나 작업을 깨뜨리면 안 된다.
 */
afterEach(() => {
  resetEgressTallies();
  vi.unstubAllGlobals();
});

describe("계량 fetch", () => {
  it("이름별로 요청 수와 전송 크기를 모은다", async () => {
    const body = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ id: i, name: "서비스" })));
    vi.stubGlobal("fetch", async () => new Response(body));

    const fetchImpl = meteredFetch("pipeline");
    await (await fetchImpl("https://x.supabase.co/rest/v1/entities")).text();
    await (await fetchImpl("https://x.supabase.co/rest/v1/entities")).text();

    const tally = egressTallies().get("pipeline");
    expect(tally?.requests).toBe(2);
    expect(tally?.bytes).toBe(2 * (new TextEncoder().encode(body).byteLength + EGRESS_RESPONSE_OVERHEAD_BYTES));
  });

  it("압축 응답은 다시 압축한 크기로 센다", async () => {
    const body = JSON.stringify(Array.from({ length: 500 }, () => ({ status: "STABLE", scoring_version: "v3-bootstrap" })));
    vi.stubGlobal("fetch", async () => new Response(body, { headers: { "content-encoding": "gzip" } }));

    await (await meteredFetch("report")("https://x.supabase.co/rest/v1/trend_scores")).text();

    const bytes = egressTallies().get("report")?.bytes ?? 0;
    const raw = new TextEncoder().encode(body).byteLength;
    expect(bytes).toBeGreaterThan(EGRESS_RESPONSE_OVERHEAD_BYTES);
    expect(bytes).toBeLessThan(raw / 5); // 반복이 많은 JSON 은 크게 줄어든다
  });
});

describe("파일 기록", () => {
  it("이름마다 JSON 한 줄씩 덧붙인다", async () => {
    vi.stubGlobal("fetch", async () => new Response("[]"));
    await (await meteredFetch("verify")("https://x.supabase.co/rest/v1/x")).text();
    const file = join(mkdtempSync(join(tmpdir(), "egress-")), "meter.jsonl");

    writeEgressTallies(file, new Date("2026-10-07T03:00:00Z"));
    writeEgressTallies(file, new Date("2026-10-07T03:00:00Z"));

    const lines = readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ day: "2026-10-07", label: "verify", requests: 1, bytes: 2 + EGRESS_RESPONSE_OVERHEAD_BYTES });
  });

  it("파일 경로가 없으면(로컬 실행) 아무것도 하지 않는다", () => {
    expect(() => writeEgressTallies(undefined)).not.toThrow();
  });
});

describe("압축 크기 추정", () => {
  it("인코딩별로 추정하고 빈 본문은 0", () => {
    const body = new TextEncoder().encode("a".repeat(10_000));
    expect(estimateCompressedBytes(body, "gzip")).toBeLessThan(200);
    expect(estimateCompressedBytes(body, "br")).toBeLessThan(200);
    expect(estimateCompressedBytes(body, "deflate")).toBeLessThan(200);
    expect(estimateCompressedBytes(new Uint8Array(), "gzip")).toBe(0);
  });
});
