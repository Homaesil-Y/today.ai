-- 회원가입 시점의 약관·개인정보처리방침 동의를 증빙으로 남긴다.
-- terms_agreed_at이 null인 계정은 "동의를 마치지 않은 미완성 가입"으로 취급하고,
-- auth 콜백이 그 자리에서 계정을 삭제해 가입이 성립하지 않게 한다.
alter table public.user_profiles
  add column if not exists terms_agreed_at timestamptz,
  add column if not exists privacy_agreed_at timestamptz,
  add column if not exists agreed_policy_version text;

-- 이 기능 도입 전에 가입한 기존 회원은 동의 기록이 없다. 그대로 두면 다음 로그인 때
-- 위 규칙에 걸려 계정이 삭제되므로, 가입 시점으로 소급 기록해 유지한다.
-- 'legacy-backfill'은 명시적 동의가 아니라 소급 처리분임을 구분하기 위한 표시다.
update public.user_profiles
set terms_agreed_at = created_at,
    privacy_agreed_at = created_at,
    agreed_policy_version = 'legacy-backfill'
where terms_agreed_at is null;
