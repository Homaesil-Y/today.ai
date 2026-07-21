-- Create the minimum application profile when Supabase Auth creates a user.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  profile_name text;
begin
  profile_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  insert into public.user_profiles (
    id,
    email,
    display_name,
    avatar_url,
    last_login_at
  ) values (
    new.id,
    coalesce(new.email, ''),
    profile_name,
    new.raw_user_meta_data ->> 'avatar_url',
    now()
  ) on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.user_profiles.display_name, excluded.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.user_profiles.avatar_url),
    last_login_at = now();

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.watchlists (user_id, name, sort_order)
  select new.id, '전체', 0
  where not exists (
    select 1 from public.watchlists where user_id = new.id and name = '전체'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of last_sign_in_at on auth.users
for each row execute function public.handle_new_auth_user();
