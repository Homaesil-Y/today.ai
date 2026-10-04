-- GitHub Actions 워크플로를 Supabase pg_cron 으로 깨운다.
--
-- 왜: GitHub 의 예약 실행(schedule)은 보장이 아니라 최선 노력이고, 이 저장소에서는 절반 가까이 버려진다.
-- 실측(2026-09-16 ~ 10-04):
--   3시간 × 2개 예약(분석·뉴스)   시도 16/일 → 실행 8.5~8.8/일 (전달률 53~55%), 3시간 초과 공백 절반
--   매시간 예약(파이프라인)        시도 24/일 → 실행 5.3/일 (전달률 22%), 최대 공백 8.6시간
-- 예약 횟수를 늘려도 실행이 늘지 않았다(오히려 줄었다). GitHub 안에서는 더 쓸 수단이 없다.
--
-- pg_cron 은 Postgres 프로세스 안에서 도는 스케줄러라 이런 누락이 없다. 정해진 시각에 pg_net 으로
-- GitHub API(workflow_dispatch)를 호출해 워크플로를 직접 실행시킨다. GitHub 의 schedule 예약은
-- 지우지 않고 예비로 남긴다 — 이쪽이 멈춰도 예전처럼은 돈다. 둘 다 실행돼도 중복 작업은 없다:
--   파이프라인: process:live 가 150분 안에 채점했으면 즉시 종료
--   분석: 대기열이 미분석·재분석 주기 경과분만 고른다
--   뉴스: 이미 저장된 링크는 요약 전에 걸러진다
--
-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 적용 전에 사용자가 할 일 (이 파일만 실행하면 토큰이 없어 호출이 401 로 실패한다)
--
-- 1) GitHub 에서 fine-grained personal access token 을 만든다.
--    https://github.com/settings/personal-access-tokens/new
--      Repository access: Only select repositories → Homaesil-Y/today.ai
--      Permissions → Repository permissions → Actions: Read and write   (이것 하나만)
--      Expiration: 원하는 기간 (만료되면 1)·2)를 다시 하면 된다)
--
-- 2) Supabase SQL Editor 에서 토큰을 Vault 에 넣는다(값은 테이블에 평문으로 남지 않는다).
--      select vault.create_secret('<여기에 토큰>', 'github_dispatch_token', 'today.ai 워크플로 트리거');
--    토큰을 바꿀 때:
--      select vault.update_secret(
--        (select id from vault.secrets where name = 'github_dispatch_token'), '<새 토큰>');
--
-- 3) 이 파일 전체를 SQL Editor 에서 실행한다.
--
-- 확인:   select jobname, schedule, active from cron.job where jobname like 'gh-%';
--         select * from cron.job_run_details order by start_time desc limit 10;
--         select id, status_code, left(content::text, 200) from net._http_response order by created desc limit 10;
--         (status_code 204 = GitHub 이 실행을 접수했다)
-- 되돌리기: select cron.unschedule(jobname) from cron.job where jobname like 'gh-%';
--           drop function if exists public.dispatch_github_workflow(text, jsonb);
-- ───────────────────────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 워크플로 하나를 실행시킨다. 토큰은 Vault 에서 꺼내므로 이 함수 정의나 cron.job 에 노출되지 않는다.
-- security definer: cron 작업이 vault 를 읽을 권한을 함수 소유자 기준으로 갖게 한다.
create or replace function public.dispatch_github_workflow(workflow_file text, inputs jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  token text;
  request_id bigint;
begin
  select decrypted_secret into token from vault.decrypted_secrets where name = 'github_dispatch_token';
  if token is null then
    raise warning 'github_dispatch_token 이 Vault 에 없습니다 — 워크플로 % 를 실행하지 못했습니다', workflow_file;
    return null;
  end if;

  select net.http_post(
    url := format('https://api.github.com/repos/Homaesil-Y/today.ai/actions/workflows/%s/dispatches', workflow_file),
    body := jsonb_build_object('ref', 'main', 'inputs', inputs),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'today-ai-pg-cron',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 10000
  ) into request_id;
  return request_id;
end;
$$;

-- 외부(anon·authenticated)에서는 부를 수 없게 한다. cron 은 postgres 권한으로 돈다.
revoke all on function public.dispatch_github_workflow(text, jsonb) from public, anon, authenticated;

-- 기존 작업이 있으면 지우고 다시 만든다(이 파일을 여러 번 실행해도 안전하도록).
select cron.unschedule(jobname) from cron.job where jobname in ('gh-pipeline', 'gh-analysis', 'gh-news');

-- 시각은 GitHub 예약과 같게 둔다(UTC). 서로 몇 분씩 어긋나게 해 같은 순간에 몰리지 않게 한다.
-- 파이프라인은 run_ai=false — 예약 실행과 같은 경로(수집 → 채점, 분석은 분석 워크플로가 맡는다).
select cron.schedule('gh-pipeline', '17 */3 * * *', $$select public.dispatch_github_workflow('scheduled-pipeline.yml', '{"run_ai":"false"}'::jsonb)$$);
select cron.schedule('gh-analysis', '47 */3 * * *', $$select public.dispatch_github_workflow('hourly-analysis.yml')$$);
select cron.schedule('gh-news',     '7 */3 * * *',  $$select public.dispatch_github_workflow('news.yml')$$);
