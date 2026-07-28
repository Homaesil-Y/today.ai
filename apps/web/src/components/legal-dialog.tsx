"use client";

import { X } from "lucide-react";
import { useRef } from "react";

// 온보딩 동의 체크박스에서 약관·개인정보처리방침을 화면 이탈 없이 확인할 수 있도록 모달로 보여준다.
// source-preview-dialog와 동일한 다이얼로그 스타일을 재사용한다.
export function LegalDialog({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="legal-dialog-trigger" onClick={() => dialogRef.current?.showModal()}>
        {label}
      </button>
      <dialog
        className="source-preview-dialog"
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="source-preview-panel">
          <header>
            <div><h2>{title}</h2></div>
            <button className="icon-button" type="button" aria-label="닫기" onClick={() => dialogRef.current?.close()}>
              <X size={20} />
            </button>
          </header>
          <section>{children}</section>
          <footer>
            <button className="button button-secondary" type="button" onClick={() => dialogRef.current?.close()}>닫기</button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
