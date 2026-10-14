#!/usr/bin/env bash
# Supabase 가 프로젝트를 제한(402) 중인지 확인해 GITHUB_OUTPUT 에 available=true|false 를 쓴다.
#
# 왜: 2026-10-06 22:36Z 에 무료 플랜 egress 한도 초과로 프로젝트가 제한됐다. 제한 중에는 모든 API 가
# 402 로 거절돼 워크플로가 매번 실패하고, 실패 메일만 하루 20통 가까이 쌓였다. 제한은 결제 주기가 바뀌어
# 사용량이 다시 채워지면 Supabase 가 스스로 푼다(Billing FAQ: "Restrictions due to usage limits are
# lifted once your quota refills at the start of the next billing cycle"). 그래서 제한 중이면 실행을
# 건너뛰고(실패가 아니라 성공으로 끝나 메일이 가지 않는다), 풀리면 다음 실행부터 저절로 다시 돈다.
#
# 일시 중지(paused)도 건너뛴다. 2026-10-13 경 제한이 일주일 이어지자 Supabase 가 프로젝트를 "비활성"으로 보고
# 일시 중지했다. 일시 중지된 프로젝트는 주소(DNS)가 사라져 응답 자체가 없다(Supabase 문서: "A paused project
# stops serving its hostname, so connections to it resolve as NXDOMAIN"). 이 확인은 처음에 402 만 알아봐서,
# 응답 없음을 "일시 장애"로 보고 실행했다가 매번 실패해 실패 메일이 다시 쏟아졌다. 일시 중지는 저절로 풀리지
# 않는다 — 대시보드에서 "Resume project" 를 눌러야 한다(그 뒤에는 다음 실행부터 자동으로 다시 돈다).
#
# 요청은 1건이다(sources 1행 — 제한 중 응답은 1KB 미만). 그 밖에 판단할 수 없는 경우(시간 초과·연결 거부·
# 인증 오류·5xx)는 실행하는 쪽으로 둔다. 진짜 장애는 본 작업이 실패해 메일로 드러나야 하기 때문이다.
#
# 로컬 검증: bash .github/actions/supabase-status/check.sh --self-test   (CI 에서도 돈다)
set -u

# $1 = HTTP 상태, $2 = curl 종료 코드, $3 = 응답 본문 앞부분 → restricted | paused | available
classify() {
  # curl 6 = 호스트 이름을 찾지 못함(NXDOMAIN). 일시 중지된 프로젝트가 이렇게 보인다.
  if [ "$2" = "6" ]; then echo paused; return; fi
  if [ "$1" = "402" ]; then echo restricted; return; fi
  if printf '%s' "$3" | grep -qiE 'restricted due to the following violations|exceed_[a-z_]+_quota'; then echo restricted; return; fi
  echo available
}

if [ "${1:-}" = "--self-test" ]; then
  failures=0
  expect() { # $1 = 기대, $2 = 상태, $3 = curl 종료 코드, $4 = 본문
    actual="$(classify "$2" "$3" "$4")"
    if [ "$actual" != "$1" ]; then
      echo "실패: 상태 '$2' curl '$3' 본문 '$4' → $actual (기대 $1)"
      failures=$((failures + 1))
    fi
  }
  expect restricted 402 0 '{"message":"Service for this project is restricted due to the following violations: exceed_egress_quota."}'
  expect restricted 402 0 ''
  expect restricted 403 0 '{"message":"Service for this project is restricted due to the following violations: exceed_db_size_quota"}'
  expect paused 000 6 ''
  expect available 200 0 '[{"id":"00000000-0000-0000-0000-000000000000"}]'
  expect available 401 0 '{"message":"Invalid API key"}'
  expect available 503 0 'upstream connect error'
  expect available 000 28 ''   # 시간 초과
  expect available 000 7 ''    # 연결 거부
  if [ "$failures" -gt 0 ]; then echo "자체 검사 실패 ${failures}건"; exit 1; fi
  echo "자체 검사 통과"
  exit 0
fi

body_file="$(mktemp)"
code="$(curl -sS -o "$body_file" -w '%{http_code}' --max-time 15 \
  -H "apikey: ${SUPABASE_KEY:-}" \
  "${SUPABASE_URL%/}/rest/v1/sources?select=id&limit=1" 2>/dev/null)"
rc=$?
body="$(head -c 500 "$body_file" 2>/dev/null || true)"
rm -f "$body_file"

case "$(classify "$code" "$rc" "$body")" in
  restricted)
    echo "available=false" >> "$GITHUB_OUTPUT"
    echo "::warning title=Supabase 제한 중::Supabase 가 프로젝트를 제한하고 있어(HTTP ${code}) 이번 실행을 건너뜁니다. 결제 주기가 바뀌어 풀리면 다음 실행부터 자동으로 다시 돕니다."
    ;;
  paused)
    echo "available=false" >> "$GITHUB_OUTPUT"
    echo "::warning title=Supabase 일시 중지::Supabase 프로젝트 주소를 찾을 수 없습니다(일시 중지로 보임). 이번 실행을 건너뜁니다. 대시보드에서 Resume project 를 누르면 다음 실행부터 다시 돕니다."
    ;;
  *)
    echo "available=true" >> "$GITHUB_OUTPUT"
    echo "Supabase 응답 HTTP ${code:-없음}(curl ${rc}) — 실행합니다."
    ;;
esac
exit 0
