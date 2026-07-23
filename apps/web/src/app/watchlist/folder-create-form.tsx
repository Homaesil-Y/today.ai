"use client";

import { FolderPlus } from "lucide-react";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { createWatchlist } from "./actions";

const initialState = { error: "" };

// 폴더 생성 폼. 중복 이름 등 검증 실패를 서버 에러 화면이 아니라 인라인으로 표시한다.
export function FolderCreateForm() {
  const [state, formAction] = useActionState(createWatchlist, initialState);
  return (
    <form className="folder-create" action={formAction}>
      <label><span className="sr-only">새 폴더 이름</span><input name="name" required maxLength={40} placeholder="새 폴더 이름" /></label>
      <SubmitButton className="button button-secondary" pendingLabel="추가 중…"><FolderPlus size={16} />추가</SubmitButton>
      {state.error && <p className="folder-error" role="alert">{state.error}</p>}
    </form>
  );
}
