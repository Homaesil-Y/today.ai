-- Supabase 전송량(egress) 계량 테이블.
--
-- 왜: 2026-10-06 22:36Z 에 무료 플랜 egress 한도(월 5GB) 초과로 프로젝트가 차단돼 사이트와 모든
-- 워크플로가 멈췄다. Supabase 는 egress 를 대시보드로만 보여주고 가져올 API 가 없어서, 한도에 다가가는
-- 것을 아무도 몰랐다. 우리 코드(사이트·GitHub Actions)가 받은 응답 크기를 직접 재서 여기에 하루치씩
-- 쌓고, 워크플로 마지막 단계(pnpm egress:report)와 /admin/ops 가 한도와 비교한다.
--
-- 값은 추정이다(압축 크기 추정 ±20%, 대시보드 접속·로그인 등 우리 코드 밖 전송은 빠짐). 정확한 값은
-- 대시보드 Organization → Usage 가 기준이다. 규칙은 packages/types/src/egress.ts.
--
-- 적용: Supabase SQL Editor 에서 이 파일 전체를 실행한다(여러 번 실행해도 안전).
-- 확인: select day, source, requests, pg_size_pretty(bytes) from public.egress_meter_daily order by day desc, bytes desc limit 20;
-- 되돌리기: drop function if exists public.record_egress(date, text, bigint, bigint);
--           drop table if exists public.egress_meter_daily;
--
-- 이 테이블에 쓰는 것은 ingress(들어오는 전송)라 egress 한도를 쓰지 않는다. 기록 응답은 본문이 없다.

create table if not exists public.egress_meter_daily (
  day date not null,
  -- 'web:trends-list', 'gh:pipeline' 처럼 "어디서:무엇을" 형식
  source text not null check (char_length(source) between 1 and 80),
  requests bigint not null default 0 check (requests >= 0),
  bytes bigint not null default 0 check (bytes >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, source)
);

comment on table public.egress_meter_daily is
  '우리 코드가 Supabase 에서 받은 응답 크기 추정치(날짜·출처별 합계). 무료 플랜 egress 한도 감시용.';

-- 정책을 두지 않는다: anon·authenticated 는 읽기·쓰기 불가, service_role(서버 비밀키)만 접근한다.
alter table public.egress_meter_daily enable row level security;
revoke all on table public.egress_meter_daily from anon, authenticated;
grant select, insert, update on table public.egress_meter_daily to service_role;

-- 같은 날·같은 출처는 더한다. 사이트 인스턴스 여러 개와 워크플로가 동시에 불러도 원자적으로 합쳐진다.
create or replace function public.record_egress(p_day date, p_source text, p_requests bigint, p_bytes bigint)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.egress_meter_daily as meter (day, source, requests, bytes, updated_at)
  values (p_day, p_source, greatest(coalesce(p_requests, 0), 0), greatest(coalesce(p_bytes, 0), 0), now())
  on conflict (day, source) do update
    set requests = meter.requests + excluded.requests,
        bytes = meter.bytes + excluded.bytes,
        updated_at = now();
$$;

-- 함수는 기본적으로 PUBLIC 이 실행할 수 있다. 서버 비밀키(service_role)만 부르게 막는다.
revoke all on function public.record_egress(date, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_egress(date, text, bigint, bigint) to service_role;
