-- Allow the web app to read only rows permitted by the existing RLS policies.
grant select on table public.categories to anon, authenticated;
grant select on table public.entities to anon, authenticated;
grant select on table public.trend_scores to anon, authenticated;
grant select on table public.ai_analyses to anon, authenticated;

-- Authenticated users need profile reads for the own-profile/admin checks.
grant select on table public.user_profiles to authenticated;

-- Only rows allowed by the existing `admins manage entities` RLS policy can be updated.
grant update on table public.entities to authenticated;

-- One-time owner bootstrap: promote the oldest existing profile only when no admin exists.
-- The role-protection trigger is disabled only for this tightly scoped migration update.
alter table public.user_profiles disable trigger protect_profile_role_before_update;

update public.user_profiles
set role = 'admin', updated_at = now()
where id = (
  select id
  from public.user_profiles
  order by created_at asc
  limit 1
)
and not exists (
  select 1 from public.user_profiles where role = 'admin'
);

alter table public.user_profiles enable trigger protect_profile_role_before_update;
