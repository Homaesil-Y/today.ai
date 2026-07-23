"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { deleteAccount, type DeleteAccountState } from "./actions";

const initialState: DeleteAccountState = { error: "" };

// 회원 탈퇴 2단계 확인: 이해 확인 체크박스 + "탈퇴" 문구 직접 입력.
// 검증 실패는 서버 에러 화면 대신 인라인 메시지로 보여준다.
export function AccountDeleteForm() {
  const [state, formAction] = useActionState(deleteAccount, initialState);
  return (
    <form className="danger-form" action={formAction}>
      <label className="danger-confirm">
        <input type="checkbox" name="confirm" required />
        <span>위 내용을 이해했으며 내 계정과 모든 개인 데이터를 영구 삭제합니다.</span>
      </label>
      <label className="danger-typed">
        <span>계속하려면 <strong>탈퇴</strong>를 입력하세요.</span>
        <input type="text" name="confirmText" autoComplete="off" placeholder="탈퇴" aria-label="확인 문구 입력" />
      </label>
      <SubmitButton className="button button-danger" pendingLabel="처리 중…">회원 탈퇴</SubmitButton>
      {state.error && <p className="folder-error" role="alert">{state.error}</p>}
    </form>
  );
}
