-- Least-privilege grants for the server-side normalization/scoring/analysis pipeline.
grant select on table public.categories to service_role;
grant select, insert, update on table public.entities to service_role;
grant select, insert, update on table public.entity_aliases to service_role;
grant select, insert, update on table public.entity_mentions to service_role;
grant select, insert, update on table public.metric_snapshots to service_role;
grant select, insert, update on table public.trend_scores to service_role;
grant select, insert on table public.ai_analyses to service_role;
