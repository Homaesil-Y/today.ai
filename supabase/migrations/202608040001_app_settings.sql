-- 관리자가 웹 화면에서 바꿀 수 있는 시스템 설정. 키-값 저장이라 앞으로 다른 설정도
-- 마이그레이션 없이 같은 테이블에 추가할 수 있다. API 키는 여기 저장하지 않는다
-- (여전히 GitHub Secrets/서버 환경변수) — 이 테이블은 "어느 프로바이더를 쓸지"만 담는다.
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

-- 관리자 전용. 공개 노출 없음.
create policy "admins manage app settings" on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

grant all privileges on table public.app_settings to service_role;

-- 트렌드 분석에 쓸 LLM 프로바이더. 지금까지의 기본 동작(Gemini)과 동일하게 시드한다.
insert into public.app_settings (key, value)
values ('trend_analysis_llm', '{"provider": "gemini", "model": "gemini-3.1-flash-lite"}'::jsonb);
