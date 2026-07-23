"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

// 폼 제출 중 pending 상태를 표시·비활성화하는 공용 버튼.
// 반드시 <form> 내부에서 사용해야 useFormStatus가 해당 폼의 상태를 읽는다.
export function SubmitButton({
  children,
  pendingLabel,
  className = "button button-primary",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <Loader2 size={16} className="spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
