import { appendFileSync } from "node:fs";
import { brotliCompressSync, constants as zlibConstants, deflateSync, gzipSync } from "node:zlib";
import { createMeteredFetch, type EgressTally } from "@ai-trend-radar/types/egress";

/**
 * GitHub Actions 쪽(수집·파이프라인·뉴스·리포트) Supabase 전송량 계량.
 *
 * 각 CLI 가 Supabase 클라이언트를 만들 때 `meteredClientOptions("이름")` 을 섞으면, 그 프로세스가
 * 받은 응답 크기를 이름별로 모은다. 프로세스가 끝날 때(exit) EGRESS_METER_FILE 에 한 줄씩 남기고,
 * 워크플로 마지막 단계(`pnpm egress:report`)가 그 파일을 합쳐 public.egress_meter_daily 에 기록한 뒤
 * 한도를 점검한다. 프로세스마다 따로 DB 에 쓰지 않는 이유: CLI 여러 개가 process.exit() 로 끝나
 * 비동기 기록 기회가 없고, exit 핸들러에서는 동기 파일 쓰기만 가능하다.
 *
 * EGRESS_METER_FILE 이 없으면(로컬 실행) 아무것도 남기지 않는다. 배경은 types/src/egress.ts.
 */

const tallies = new Map<string, EgressTally>();
let exitHookInstalled = false;

/** 압축된 전송 크기 추정. 응답에 Content-Length 가 없을 때만 쓴다(egress.ts 의 wireBytes). */
export function estimateCompressedBytes(body: Uint8Array, encoding: string): number {
  if (body.byteLength === 0) return 0;
  if (encoding.includes("br")) {
    return brotliCompressSync(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } }).byteLength;
  }
  if (encoding.includes("deflate")) return deflateSync(body).byteLength;
  return gzipSync(body).byteLength;
}

export function recordEgress(label: string, bytes: number) {
  const tally = tallies.get(label) ?? { requests: 0, bytes: 0 };
  tally.requests += 1;
  tally.bytes += bytes;
  tallies.set(label, tally);
}

export function meteredFetch(label: string): typeof fetch {
  installExitHook();
  return createMeteredFetch({
    // 전역 fetch 를 호출 시점에 찾는다(테스트가 바꿔 끼울 수 있게).
    fetch: (input, init) => fetch(input, init),
    record: (bytes) => recordEgress(label, bytes),
    estimateCompressed: estimateCompressedBytes,
  });
}

/** supabase-js createClient 옵션에 섞는다: `createClient(url, key, { auth, ...meteredClientOptions("report") })` */
export function meteredClientOptions(label: string) {
  return { global: { fetch: meteredFetch(label) } };
}

/** 지금까지 모은 값(복사본). */
export function egressTallies(): Map<string, EgressTally> {
  return new Map([...tallies].map(([label, tally]) => [label, { ...tally }]));
}

export function resetEgressTallies() {
  tallies.clear();
}

/** 모은 값을 파일에 한 줄씩(JSON) 덧붙인다. 실패는 무시한다 — 계량 때문에 작업이 실패하면 안 된다. */
export function writeEgressTallies(file: string | undefined, at = new Date()) {
  if (!file || tallies.size === 0) return;
  const day = at.toISOString().slice(0, 10);
  const lines = [...tallies]
    .map(([label, tally]) => JSON.stringify({ day, label, requests: tally.requests, bytes: tally.bytes }))
    .join("\n");
  try {
    appendFileSync(file, `${lines}\n`);
  } catch {
    // 기록 실패는 무시한다.
  }
}

function installExitHook() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  // exit 핸들러는 동기 작업만 할 수 있다. process.exit() 로 끝나는 CLI 도 여기를 거친다.
  process.on("exit", () => writeEgressTallies(process.env.EGRESS_METER_FILE));
}
