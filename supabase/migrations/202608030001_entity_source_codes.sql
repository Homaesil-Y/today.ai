-- 엔티티가 실제로 어느 수집 채널에서 들어왔는지 기록한다.
--
-- 웹 화면은 지금까지 github_url이 있으면 GitHub, 없으면 Hacker News로 출처를 "추측"했다
-- (apps/web/src/data/live-trends.ts inferSources). 채널이 두 개였을 때는 맞았지만 Product Hunt·
-- Reddit이 추가된 뒤로는 사실과 다른 출처를 사용자에게 보여주게 됐다.
--
-- 실제 출처는 entity_mentions → raw_items → sources 조인으로 알 수 있는데, 이 세 테이블은
-- 익명(anon) 역할에 SELECT 권한이 없다(게시물 본문 등 공개할 필요 없는 데이터가 들어 있다).
-- 공개 노출 면을 넓히는 대신, 파이프라인이 후보를 저장할 때 채널 코드를 엔티티에 함께 남긴다.
alter table public.entities
  add column if not exists source_codes text[] not null default '{}';

comment on column public.entities.source_codes is
  '이 엔티티가 관측된 수집 채널 코드 목록(sources.code). 파이프라인이 upsert 시 누적한다.';

-- 기존 행 백필: entity_mentions에 남아 있는 실제 유입 기록으로 채운다.
update public.entities as e
set source_codes = coalesce(m.codes, '{}')
from (
  select em.entity_id, array_agg(distinct s.code order by s.code) as codes
  from public.entity_mentions em
  join public.raw_items ri on ri.id = em.raw_item_id
  join public.sources s on s.id = ri.source_id
  group by em.entity_id
) as m
where m.entity_id = e.id;

-- 화면에서 채널 필터로 자주 조회하므로 배열 포함 검색용 인덱스를 둔다.
create index if not exists entities_source_codes_idx on public.entities using gin (source_codes);
