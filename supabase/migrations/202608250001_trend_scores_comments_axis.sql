-- 토론 깊이(댓글 수) 축을 점수에 추가한다.
--
-- 댓글 수는 수집 시점부터 raw_items.raw_metrics_json 에 저장하고 있었지만 점수에 쓰인 적이 없다.
-- 반응 크기(HN points·PH votes)와는 다른 신호다 — 500점/댓글 2개와 50점/댓글 300개는 성격이
-- 다르다. 실측(2026-08-25, 793건)으로 이 축을 넣으면 대형 동점 그룹이 30% → 13% 로 줄어든다.
--
-- 되돌리기: alter table public.trend_scores drop column comments_score;
alter table public.trend_scores
  add column if not exists comments_score numeric(5, 2) not null default 0;

comment on column public.trend_scores.comments_score is
  '채널 내 댓글 수 백분위 기반 토론 깊이 점수. 상한은 scoring 패키지의 limits 를 따른다.';
