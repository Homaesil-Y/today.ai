-- "오래된 후보 정리"로 자동 내려간 후보와, 관리자가 직접 "보류"한 후보를 구분한다.
--
-- 둘 다 visibility='private'이 되는데 의미가 완전히 다르다:
--   - 자동 정리: 48시간 넘게 재수집되지 않아 내려간 것. 원본이 다시 트렌드에 오르면 복구해야 한다.
--   - 수동 보류: 관리자가 의도적으로 배제한 것. 재수집돼도 되살아나면 안 된다
--     (되살아나면 계속 수집되는 항목을 3시간마다 다시 보류해야 한다).
--
-- 구분이 없으면 파이프라인이 둘을 같이 취급할 수밖에 없어, 복구를 켜면 수동 보류가 무력화되고
-- 복구를 끄면 자동 정리된 후보를 되살릴 방법이 아예 없다(관리자 화면의 승인/보류 액션도
-- visibility='review'만 대상으로 하므로 private는 UI로 복구 불가).
alter table public.entities
  add column if not exists dismissed_as_stale_at timestamptz;

comment on column public.entities.dismissed_as_stale_at is
  '"오래된 후보 정리"로 자동 private 처리된 시각. 수동 보류는 null. 재수집 시 이 값이 있는 후보만 review로 복구한다.';

-- 기존 private 행은 자동 정리분과 수동 보류분을 사후에 구별할 수 없으므로 null(수동 보류로 간주)로
-- 남긴다. 지금 있는 8건은 대부분 의도적 배제이거나 2주 넘게 재수집되지 않은 항목이라 복구 대상이 아니다.
