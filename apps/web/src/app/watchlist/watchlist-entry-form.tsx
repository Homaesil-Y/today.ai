"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { FormDropdown } from "@/components/form-dropdown";
import { WatchButton } from "@/components/watch-button";
import { updateWatchlistEntry } from "./actions";

const initialState = { error: "" };

type Folder = { id: string; name: string };

// 관심 서비스 편집 폼(폴더 이동 · 메모). 폴더 이동 시 중복 등 오류를 인라인으로 표시한다.
export function WatchlistEntryForm({
  itemId,
  entityId,
  currentWatchlistId,
  memo,
  folders,
}: {
  itemId: string;
  entityId: string;
  currentWatchlistId: string;
  memo: string;
  folders: Folder[];
}) {
  const [state, formAction] = useActionState(updateWatchlistEntry, initialState);
  return (
    <form className="watchlist-editor" action={formAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <label><span>폴더</span><FormDropdown name="watchlistId" ariaLabel="폴더" placeholder="폴더 선택" defaultValue={currentWatchlistId} options={folders.map((folder) => ({ value: folder.id, label: folder.name }))} /></label>
      <label><span>메모</span><textarea name="memo" defaultValue={memo} maxLength={500} placeholder="활용 아이디어나 확인할 내용을 기록하세요." /></label>
      <div><button className="button button-primary" type="submit"><Save size={16} />변경 저장</button><WatchButton entityId={entityId} initialSaved /></div>
      {state.error && <p className="folder-error" role="alert">{state.error}</p>}
    </form>
  );
}
