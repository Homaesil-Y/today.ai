-- 순위에 넣을 만한 신호가 있는 스냅샷인지 표시한다.
--
-- 배경: 공개 793건 중 459건(58%)이 대형 동점 그룹에 몰려 있었다 — 60건이 정확히 같은 점수를
-- 받아 그 구간의 "순위"가 사실상 임의 순서였다. 원인은 공식이 아니라 입력이다. HN 에 2점·댓글
-- 0으로 올라온 항목은 다른 항목과 구분할 근거 자체가 없다.
--
-- 그래서 반응 신호(velocity + comments + productGrowth + crossSource)가 하한 미달인 스냅샷은
-- 순위에서 빼고, 검색·카테고리에서는 그대로 보이게 한다. 실측으로 하한 0.5 면 순위 대상 521건이
-- 남고 대형 동점 그룹이 13% → 0%(최대 동점 40 → 16)로 사라진다.
--
-- default true: 이 컬럼이 채워지기 전의 기존 행은 지금처럼 순위에 남는다(배포 순서와 무관하게
-- 화면이 비지 않도록). 다음 파이프라인 실행이 실제 값으로 덮는다.
--
-- 되돌리기: alter table public.trend_scores drop column ranked;
alter table public.trend_scores
  add column if not exists ranked boolean not null default true;

comment on column public.trend_scores.ranked is
  '순위 노출 대상 여부. false 면 검색·카테고리에는 나오지만 순위표에서는 제외된다.';
