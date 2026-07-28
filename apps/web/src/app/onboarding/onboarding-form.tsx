"use client";

import { ArrowRight, Bell } from "lucide-react";
import { useActionState } from "react";
import { completeOnboarding, type OnboardingFormState } from "@/app/settings/actions";
import { LegalDialog } from "@/components/legal-dialog";
import { PrivacyContent, TermsContent } from "@/components/legal-content";
import { SubmitButton } from "@/components/submit-button";

const initialState: OnboardingFormState = { error: "" };

export function OnboardingForm({ categories, nextPath }: { categories: { name: string; slug: string }[]; nextPath: string }) {
  const [state, formAction] = useActionState(completeOnboarding, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="next" value={nextPath} />
      <div className="choice-grid onboarding-choices">
        {categories.map((category) => (
          <label className="choice-card" key={category.slug}>
            <input type="checkbox" name="categories" value={category.slug} />
            <span>{category.name}</span>
          </label>
        ))}
      </div>
      <div className="onboarding-alert">
        <Bell size={18} />
        <label><input type="checkbox" name="dailyDigest" defaultChecked />매일 아침 주요 AI 트렌드 요약 받기</label>
        <input type="hidden" name="surgeAlert" value="on" />
        <input type="hidden" name="digestTime" value="08:00" />
      </div>
      <label className="onboarding-consent">
        <input type="checkbox" name="agreeTerms" />
        <span>
          [필수] <LegalDialog label="이용약관" title="이용약관"><TermsContent /></LegalDialog> 및{" "}
          <LegalDialog label="개인정보처리방침" title="개인정보처리방침"><PrivacyContent /></LegalDialog>에 동의합니다.
        </span>
      </label>
      {state.error && <p className="folder-error" role="alert">{state.error}</p>}
      <SubmitButton className="button button-primary onboarding-submit" pendingLabel="설정 저장 중…">
        설정 완료하고 시작하기 <ArrowRight size={17} />
      </SubmitButton>
    </form>
  );
}
