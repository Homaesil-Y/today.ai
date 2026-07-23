"use client";

import { Check, X } from "lucide-react";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { approveSuggestion, dismissSuggestion, type SuggestionActionState } from "./actions";

const initial: SuggestionActionState = { error: "" };

// 제안 승인/기각 버튼. 검증·중복 오류를 인라인으로 표시한다.
export function SuggestionActions({ id }: { id: string }) {
  const [approveState, approve] = useActionState(approveSuggestion, initial);
  const [dismissState, dismiss] = useActionState(dismissSuggestion, initial);
  const message = approveState.error || dismissState.error;
  return (
    <div className="suggestion-actions">
      <div className="suggestion-buttons">
        <form action={approve}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton className="button button-primary" pendingLabel="추가 중…"><Check size={15} />카테고리로 추가</SubmitButton>
        </form>
        <form action={dismiss}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton className="button button-secondary" pendingLabel="처리 중…"><X size={15} />무시</SubmitButton>
        </form>
      </div>
      {message && <p className="folder-error" role="alert">{message}</p>}
    </div>
  );
}
