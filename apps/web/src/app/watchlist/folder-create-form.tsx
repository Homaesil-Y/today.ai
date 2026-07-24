"use client";

import { FolderPlus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { trackEvent } from "@/lib/analytics";
import { createWatchlist } from "./actions";

const initialState = { error: "" };

// 폴더 생성 폼. 중복 이름 등 검증 실패를 서버 에러 화면이 아니라 인라인으로 표시한다.
export function FolderCreateForm() {
  const [state, formAction] = useActionState(createWatchlist, initialState);
  // useActionState는 액션이 성공적으로 끝날 때마다 새 객체 참조를 반환한다(초기값과 동일하지 않음).
  // 그 변화를 감지해 "이번 제출이 방금 성공했다"는 신호로만 쓴다(값 비교가 아니라 참조 비교).
  const prevState = useRef(state);
  useEffect(() => {
    if (state !== prevState.current && !state.error) trackEvent("create_folder", { page_type: "watchlist" });
    prevState.current = state;
  }, [state]);
  return (
    <form className="folder-create" action={formAction}>
      <label><span className="sr-only">새 폴더 이름</span><input name="name" required maxLength={40} placeholder="새 폴더 이름" /></label>
      <SubmitButton className="button button-secondary" pendingLabel="추가 중…"><FolderPlus size={16} />추가</SubmitButton>
      {state.error && <p className="folder-error" role="alert">{state.error}</p>}
    </form>
  );
}
