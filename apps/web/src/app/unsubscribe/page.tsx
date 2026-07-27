import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";
import { unsubscribe } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "구독 해지", robots: { index: false, follow: false } };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string; done?: string }>;
}) {
  const { u, t, done } = await searchParams;

  if (done === "1") {
    return (
      <div className="page content-page">
        <header className="page-heading">
          <div>
            <h1>구독을 해지했습니다</h1>
            <p>매일 아침 요약 메일을 더 이상 보내지 않습니다.</p>
          </div>
        </header>
        <div className="content-actions">
          <Link className="button button-secondary" href="/settings">설정에서 알림 다시 켜기</Link>
        </div>
      </div>
    );
  }

  const valid = typeof u === "string" && u.length > 0 && typeof t === "string" && t.length > 0 && verifyUnsubscribeToken(u, t);
  if (!valid) {
    return (
      <div className="page content-page">
        <header className="page-heading">
          <div>
            <h1>유효하지 않은 링크</h1>
            <p>링크가 잘못되었거나 만료되었습니다. 설정 페이지에서 알림을 직접 변경해주세요.</p>
          </div>
        </header>
        <div className="content-actions">
          <Link className="button button-secondary" href="/settings">설정으로 이동</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page content-page">
      <header className="page-heading">
        <div>
          <h1>매일 아침 요약 메일 구독을 해지할까요?</h1>
          <p>급상승 알림 등 다른 설정은 그대로 유지되며, 언제든 설정에서 다시 켤 수 있습니다.</p>
        </div>
      </header>
      <form action={unsubscribe}>
        <input type="hidden" name="u" value={u} />
        <input type="hidden" name="t" value={t} />
        <SubmitButton className="button button-primary" pendingLabel="처리 중…">구독 해지</SubmitButton>
      </form>
    </div>
  );
}
