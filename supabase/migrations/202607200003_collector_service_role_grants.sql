-- Allow the backend collector to persist raw source data with a Supabase
-- secret/service-role key. Browser roles receive no additional privileges.
grant usage on schema public to service_role;

grant select, update on table public.sources to service_role;
grant select, insert, update on table public.raw_items to service_role;
grant select, insert on table public.collector_runs to service_role;
