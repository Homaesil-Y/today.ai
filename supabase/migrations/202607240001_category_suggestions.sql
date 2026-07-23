-- 제안형 카테고리 확장: '기타'로 분류된 서비스들에서 공통 주제를 발견하면
-- 새 카테고리 후보를 여기에 쌓아두고, 관리자가 승인하면 categories에 반영한다(자동 생성 아님).
create table public.category_suggestions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  rationale text,
  example_names_json jsonb not null default '[]'::jsonb,
  service_count integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index category_suggestions_status_idx on public.category_suggestions (status, created_at desc);

alter table public.category_suggestions enable row level security;

-- 관리자 전용. 공개 노출 없음.
create policy "admins manage category suggestions" on public.category_suggestions
  for all using (public.is_admin()) with check (public.is_admin());

grant all privileges on table public.category_suggestions to service_role;
