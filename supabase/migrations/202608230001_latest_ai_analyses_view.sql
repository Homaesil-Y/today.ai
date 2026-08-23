-- 엔티티별 "가장 최근 AI 분석" 한 행만 돌려주는 뷰.
--
-- 공개 목록(getPublishedTrends)은 엔티티마다 최신 분석 1건만 쓰는데, ai_analyses 에는 재분석
-- 이력이 계속 쌓인다. 그래서 앱이 필요한 762행을 얻으려고 5,247행(약 4.4MB)을 받아 클라이언트에서
-- 최신만 골라내고 있었다. 이력은 72시간 주기 재분석마다 늘어나므로 이 낭비도 함께 커진다.
--
-- PostgREST 로는 "그룹별 최신 1건"을 표현할 수 없어(distinct on / window 함수 미지원) 뷰로 만든다.
--
-- security_invoker = on: 뷰를 조회하는 사용자의 권한과 RLS 로 평가된다. 기본값(security_definer
-- 유사 동작)이면 뷰 소유자 권한으로 실행돼 ai_analyses 의 RLS 를 우회할 수 있다.
create or replace view public.latest_ai_analyses
with (security_invoker = on) as
select distinct on (entity_id)
  entity_id,
  summary,
  why_trending_json,
  target_users_json,
  strengths_json,
  weaknesses_json,
  use_cases_json,
  korea_opportunity,
  model_name,
  prompt_version,
  generated_at
from public.ai_analyses
order by entity_id, generated_at desc;

comment on view public.latest_ai_analyses is
  '엔티티별 최신 ai_analyses 1행. 공개 목록이 이력 전체를 받아오지 않게 하기 위한 뷰.';

-- 기반 테이블과 동일한 읽기 권한. 행 접근 여부는 ai_analyses 의 RLS 가 계속 결정한다.
grant select on table public.latest_ai_analyses to anon, authenticated, service_role;

-- distinct on (entity_id) ... order by entity_id, generated_at desc 를 인덱스로 받쳐준다.
create index if not exists ai_analyses_entity_generated_at_idx
  on public.ai_analyses (entity_id, generated_at desc);
