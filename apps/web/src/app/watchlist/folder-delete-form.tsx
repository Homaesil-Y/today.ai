"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { trackEvent } from "@/lib/analytics";
import { deleteEmptyWatchlist } from "./actions";

const initialState = { error: "" };

// 빈 폴더 삭제 폼. 삭제 불가 상황(기본 폴더·비어있지 않음)을 서버 에러 화면이 아니라 인라인으로 알린다.
// 삭제 성공 시 이 폴더는 목록·선택에서 사라지고 페이지가 다른 폴더로 전환되므로,
// 그 사이 아무 반응이 없어 보이지 않도록 SubmitButton으로 pending 상태를 보여준다.
export function FolderDeleteForm({ watchlistId }: { watchlistId: string }) {
  const [state, formAction] = useActionState(deleteEmptyWatchlist, initialState);
  const prevState = useRef(state);
  useEffect(() => {
    if (state !== prevState.current && !state.error) trackEvent("delete_folder", { page_type: "watchlist" });
    prevState.current = state;
  }, [state]);
  return (
    <form action={formAction}>
      <input type="hidden" name="watchlistId" value={watchlistId} />
      <SubmitButton className="folder-delete" pendingLabel="삭제 중…"><Trash2 size={15} />빈 폴더 삭제</SubmitButton>
      {state.error && <p className="folder-error" role="alert">{state.error}</p>}
    </form>
  );
}
