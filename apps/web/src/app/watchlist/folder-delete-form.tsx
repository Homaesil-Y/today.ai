"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";
import { deleteEmptyWatchlist } from "./actions";

const initialState = { error: "" };

// 빈 폴더 삭제 폼. 삭제 불가 상황(기본 폴더·비어있지 않음)을 서버 에러 화면이 아니라 인라인으로 알린다.
export function FolderDeleteForm({ watchlistId }: { watchlistId: string }) {
  const [state, formAction] = useActionState(deleteEmptyWatchlist, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="watchlistId" value={watchlistId} />
      <button className="folder-delete" type="submit"><Trash2 size={15} />빈 폴더 삭제</button>
      {state.error && <p className="folder-error" role="alert">{state.error}</p>}
    </form>
  );
}
