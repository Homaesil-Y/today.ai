#!/usr/bin/env bash
# Supabase 가 프로젝트를 제한(402) 중인지 확인해 GITHUB_OUTPUT 에 available=true|false 를 쓴다.
#
# 왜: 2026-10-06 22:36Z 에 무료 플랜 egress 한도 초과로 프로젝트가 제한됐다. 제한 중에는 모든 API 가
# 402 로 거절돼 워크플로가 매번 실패하고, 실패 메일만 하루 20통 가까이 쌓였다. 제한은 결제 주기가 바뀌어
# 사용량이 다시 채워지면 Supabase 가 스스로 푼다(Billing FAQ: "Restrictions due to usage limits are
# lifted once your quota refills at the start of the next billing cycle"). 그래서 제한 중이면 실행을
# 건너뛰고(실패가 아니라 성공으로 끝나 메일이 가지 않는다), 풀리면 다음 실행부터 저절로 다시 돈다.
#
# 요청은 1건이다(sources 1행 — 제한 중 응답은 1KB 미만). 판단할 수 없으면(네트워크 오류·인증 오류 등)
# 실행하는 쪽으로 둔다. 진짜 장애는 본 작업이 실패해 메일로 드러나야 하기 때문이다.
#
# 로컬 검증: bash .github/actions/supabase-status/check.sh --self-test   (CI 에서도 돈다)
set -u

# $1 = HTTP 상태, $2 = 응답 본문 앞부분
is_restricted() {
  [ "$1" = "402" ] && return 0
  printf '%s' "$2" | grep -qiE 'restricted due to the following violations|exceed_[a-z_]+_quota' && return 0
  return 1
}

if [ "${1:-}" = "--self-test" ]; then
  failures=0
  expect() { # $1 = 기대(restricted|available), $2 = 상태, $3 = 본문
    if is_restricted "$2" "$3"; then actual=restricted; else actual=available; fi
    if [ "$actual" != "$1" ]; then
      echo "실패: 상태 '$2' 본문 '$3' → $actual (기대 $1)"
      failures=$((failures + 1))
    fi
  }
  expect restricted 402 '{"message":"Service for this project is restricted due to the following violations: exceed_egress_quota."}'
  expect restricted 402 ''
  expect restricted 403 '{"message":"Service for this project is restricted due to the following violations: exceed_db_size_quota"}'
  expect available 200 '[{"id":"00000000-0000-0000-0000-000000000000"}]'
  expect available 401 '{"message":"Invalid API key"}'
  expect available 503 'upstream connect error'
  expect available 000 ''
  if [ "$failures" -gt 0 ]; then echo "자체 검사 실패 ${failures}건"; exit 1; fi
  echo "자체 검사 통과"
  exit 0
fi

body_file="$(mktemp)"
code="$(curl -sS -o "$body_file" -w '%{http_code}' --max-time 15 \
  -H "apikey: ${SUPABASE_KEY:-}" \
  "${SUPABASE_URL%/}/rest/v1/sources?select=id&limit=1" 2>/dev/null || true)"
body="$(head -c 500 "$body_file" 2>/dev/null || true)"
rm -f "$body_file"

if is_restricted "$code" "$body"; then
  echo "available=false" >> "$GITHUB_OUTPUT"
  echo "::warning title=Supabase 제한 중::Supabase 가 프로젝트를 제한하고 있어(HTTP ${code}) 이번 실행을 건너뜁니다. 결제 주기가 바뀌어 풀리면 다음 실행부터 자동으로 다시 돕니다."
else
  echo "available=true" >> "$GITHUB_OUTPUT"
  echo "Supabase 응답 HTTP ${code:-없음} — 실행합니다."
fi
exit 0
