-- RLS decides which rows are accessible; SQL grants decide which operations may reach RLS.
grant usage on schema public to anon, authenticated, service_role;

grant select on table
  public.categories,
  public.entities,
  public.trend_scores,
  public.ai_analyses,
  public.reports
to anon, authenticated;

grant select, update on table public.user_profiles to authenticated;
grant select, insert, update, delete on table
  public.user_preferences,
  public.watchlists,
  public.watchlist_items
to authenticated;
grant select on table public.notifications to authenticated;

grant all privileges on table
  public.sources,
  public.raw_items,
  public.entities,
  public.entity_aliases,
  public.entity_mentions,
  public.metric_snapshots,
  public.trend_scores,
  public.ai_analyses,
  public.categories,
  public.user_profiles,
  public.user_preferences,
  public.watchlists,
  public.watchlist_items,
  public.reports,
  public.notifications,
  public.collector_runs
to service_role;

grant execute on function public.is_admin() to authenticated, service_role;

