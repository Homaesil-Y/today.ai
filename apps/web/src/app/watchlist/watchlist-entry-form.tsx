"use client";

import { Save } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { FormDropdown } from "@/components/form-dropdown";
import { SubmitButton } from "@/components/submit-button";
import { WatchButton } from "@/components/watch-button";
import { trackEvent } from "@/lib/analytics";
import { updateWatchlistEntry } from "./actions";

const initialState = { error: "" };

type Folder = { id: string; name: string };

// 관심 서비스 편집 폼(폴더 이동 · 메모). 폴더 이동 시 중복 등 오류를 인라인으로 표시한다.
export function WatchlistEntryForm({
  itemId,
  entityId,
  slug,
  currentWatchlistId,
  memo,
  folders,
}: {
  itemId: string;
  entityId: string;
  slug: string;
  currentWatchlistId: string;
  memo: string;
  folders: Folder[];
}) {
  const [state, formAction] = useActionState(updateWatchlistEntry, initialState);
  // textarea는 계속 비제어(defaultValue)로 두고, 제출 시점의 값을 ref로 직접 읽는다
  // (제어 컴포넌트로 바꾸면 한글 IME 조합에 영향을 줄 수 있어 피한다).
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const prevState = useRef(state);
  useEffect(() => {
    if (state !== prevState.current && !state.error) {
      trackEvent("update_watchlist_entry", { page_type: "watchlist", has_memo: Boolean(memoRef.current?.value.trim()) });
    }
    prevState.current = state;
  }, [state]);
  return (
    <form className="watchlist-editor" action={formAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <label><span>폴더</span><FormDropdown name="watchlistId" ariaLabel="폴더" placeholder="폴더 선택" defaultValue={currentWatchlistId} options={folders.map((folder) => ({ value: folder.id, label: folder.name }))} /></label>
      <label><span>메모</span><textarea ref={memoRef} name="memo" defaultValue={memo} maxLength={500} placeholder="활용 아이디어나 확인할 내용을 기록하세요." /></label>
      <div><SubmitButton className="button button-primary" pendingLabel="저장 중…"><Save size={16} />변경 저장</SubmitButton><WatchButton entityId={entityId} slug={slug} initialSaved /></div>
      {state.error && <p className="folder-error" role="alert">{state.error}</p>}
    </form>
  );
}
