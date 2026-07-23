-- AI 뉴스 브리핑: RSS로 수집한 글로벌 AI 뉴스를 한국어 요약과 함께 저장한다.
-- 서비스 트렌드(entities)와 무관한 별도 테이블. 수집 즉시 공개(is_published=true).
create table public.news_items (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  url text not null,
  canonical_url text not null unique,
  original_title text not null,
  ko_title text not null,
  ko_summary text not null,
  published_at timestamptz not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index news_items_published_at_idx on public.news_items (published_at desc);

alter table public.news_items enable row level security;

-- 공개 읽기: 게시된 뉴스만. 관리자는 전체 관리.
create policy "public news" on public.news_items for select using (is_published);
create policy "admins manage news" on public.news_items for all using (public.is_admin()) with check (public.is_admin());

-- RLS는 어떤 행이 보이는지, grant는 어떤 연산이 RLS까지 도달하는지 결정한다.
grant select on table public.news_items to anon, authenticated;
grant all privileges on table public.news_items to service_role;
