-- AI Trend Radar initial schema draft
-- UTC timestamps are stored as timestamptz; the application renders Asia/Seoul by default.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type public.user_role as enum ('user', 'admin');
create type public.trend_status as enum ('NEW', 'RISING', 'SURGING', 'PEAK', 'STABLE', 'FALLING', 'REVIVAL', 'WATCH');
create type public.entity_visibility as enum ('public', 'private', 'review');
create type public.run_status as enum ('running', 'succeeded', 'partial', 'failed');

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  enabled boolean not null default true,
  collector_type text not null,
  base_url text,
  last_collected_at timestamptz,
  rate_limit_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  enabled boolean not null default true
);

create table public.raw_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id),
  source_item_id text not null,
  title text not null,
  body text,
  url text not null,
  canonical_url text not null,
  author_name text,
  author_id text,
  published_at timestamptz not null,
  raw_metrics_json jsonb not null default '{}'::jsonb,
  raw_payload_json jsonb not null,
  collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, source_item_id)
);

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  canonical_url text not null,
  official_domain text,
  github_url text,
  producthunt_url text,
  logo_url text,
  description text,
  category_id uuid references public.categories(id),
  pricing_type text not null default 'unknown',
  is_open_source boolean not null default false,
  first_detected_at timestamptz not null,
  last_detected_at timestamptz not null,
  status public.trend_status not null default 'WATCH',
  visibility public.entity_visibility not null default 'review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index entities_name_trgm_idx on public.entities using gin (name gin_trgm_ops);
create index entities_official_domain_idx on public.entities (official_domain);

create table public.entity_aliases (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  alias text not null,
  alias_type text not null,
  source_id uuid references public.sources(id),
  created_at timestamptz not null default now(),
  unique (entity_id, alias)
);

create table public.entity_mentions (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  raw_item_id uuid not null references public.raw_items(id) on delete cascade,
  match_method text not null,
  confidence numeric(4, 3) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (entity_id, raw_item_id)
);

create table public.metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  source_id uuid not null references public.sources(id),
  stars bigint,
  forks bigint,
  votes bigint,
  score bigint,
  comments bigint,
  mentions bigint,
  authors bigint,
  engagement numeric,
  measured_at timestamptz not null,
  raw_metrics_json jsonb not null default '{}'::jsonb,
  unique (entity_id, source_id, measured_at)
);
create index metric_snapshots_entity_time_idx on public.metric_snapshots (entity_id, measured_at desc);

create table public.trend_scores (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  score_date date not null,
  total_score numeric(5, 2) not null check (total_score between 0 and 100),
  cross_source_score numeric(5, 2) not null,
  velocity_score numeric(5, 2) not null,
  product_growth_score numeric(5, 2) not null,
  threads_score numeric(5, 2) not null,
  reddit_score numeric(5, 2) not null,
  novelty_score numeric(5, 2) not null,
  instagram_score numeric(5, 2) not null,
  quality_score numeric(5, 2) not null,
  trust_score numeric(5, 2) not null check (trust_score between 0 and 100),
  status public.trend_status not null,
  scoring_version text not null,
  calculated_at timestamptz not null default now(),
  unique (entity_id, score_date, scoring_version)
);

create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  summary text not null,
  why_trending_json jsonb not null,
  target_users_json jsonb not null,
  strengths_json jsonb not null,
  weaknesses_json jsonb not null,
  use_cases_json jsonb not null,
  benchmark_points_json jsonb not null,
  korea_opportunity text,
  business_potential text,
  development_difficulty text,
  model_provider text not null,
  model_name text not null,
  prompt_version text not null,
  generated_at timestamptz not null default now()
);

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  role public.user_role not null default 'user',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table public.user_preferences (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  preferred_categories_json jsonb not null default '[]'::jsonb,
  daily_digest_enabled boolean not null default true,
  surge_alert_enabled boolean not null default true,
  digest_time time not null default '08:00',
  timezone text not null default 'Asia/Seoul',
  theme text not null default 'light' check (theme in ('light'))
);

create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  memo text,
  saved_score numeric(5, 2),
  created_at timestamptz not null default now(),
  unique (watchlist_id, entity_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('daily', 'weekly', 'monthly')),
  report_date date not null,
  title text not null,
  summary text,
  content_json jsonb not null,
  status text not null default 'draft',
  generated_at timestamptz,
  published_at timestamptz,
  unique (report_type, report_date)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  type text not null,
  entity_id uuid references public.entities(id) on delete set null,
  title text not null,
  body text not null,
  channel text not null default 'email',
  status text not null default 'scheduled',
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.collector_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id),
  started_at timestamptz not null,
  finished_at timestamptz,
  status public.run_status not null,
  fetched_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  error_count integer not null default 0,
  api_calls integer not null default 0,
  rate_limit_remaining integer,
  error_log_json jsonb not null default '[]'::jsonb
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only administrators can change user roles';
  end if;
  return new;
end;
$$;

create trigger protect_profile_role_before_update
before update on public.user_profiles
for each row execute function public.protect_profile_role();

alter table public.sources enable row level security;
alter table public.raw_items enable row level security;
alter table public.entities enable row level security;
alter table public.entity_aliases enable row level security;
alter table public.entity_mentions enable row level security;
alter table public.metric_snapshots enable row level security;
alter table public.trend_scores enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.categories enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.collector_runs enable row level security;

create policy "public categories" on public.categories for select using (enabled);
create policy "public entities" on public.entities for select using (visibility = 'public');
create policy "public trend scores" on public.trend_scores for select using (
  exists (select 1 from public.entities e where e.id = entity_id and e.visibility = 'public')
);
create policy "public analyses" on public.ai_analyses for select using (
  exists (select 1 from public.entities e where e.id = entity_id and e.visibility = 'public')
);
create policy "public published reports" on public.reports for select using (status = 'published');

create policy "own profile read" on public.user_profiles for select using (id = auth.uid());
create policy "own profile update" on public.user_profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "own preferences" on public.user_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own watchlists" on public.watchlists for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own watchlist items" on public.watchlist_items for all using (
  exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid())
) with check (
  exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = auth.uid())
);
create policy "own notifications" on public.notifications for select using (user_id = auth.uid());

create policy "admins manage sources" on public.sources for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage raw" on public.raw_items for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage entities" on public.entities for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage aliases" on public.entity_aliases for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage mentions" on public.entity_mentions for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage metrics" on public.metric_snapshots for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage scores" on public.trend_scores for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage analyses" on public.ai_analyses for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage collector runs" on public.collector_runs for all using (public.is_admin()) with check (public.is_admin());

insert into public.sources (code, name, collector_type, base_url) values
  ('product_hunt', 'Product Hunt', 'api', 'https://api.producthunt.com'),
  ('github', 'GitHub', 'api', 'https://api.github.com'),
  ('hacker_news', 'Hacker News', 'api', 'https://hn.algolia.com/api'),
  ('reddit', 'Reddit', 'oauth_api', 'https://oauth.reddit.com'),
  ('threads', 'Threads', 'graph_api', 'https://graph.threads.net'),
  ('instagram', 'Instagram', 'graph_api', 'https://graph.facebook.com');

insert into public.categories (name, slug, sort_order) values
  ('AI 에이전트', 'ai-agents', 1), ('개발·코딩', 'coding', 2), ('이미지', 'image', 3),
  ('영상', 'video', 4), ('음성·음악', 'audio-music', 5), ('문서·RAG', 'document-rag', 6),
  ('생산성', 'productivity', 7), ('데이터 분석', 'data', 8), ('디자인', 'design', 9),
  ('마케팅', 'marketing', 10), ('교육', 'education', 11), ('오픈소스 모델', 'open-models', 12),
  ('자동화', 'automation', 13), ('노코드', 'no-code', 14), ('AI 인프라·API', 'infrastructure-api', 15),
  ('기타', 'other', 99);
