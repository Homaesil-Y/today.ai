"use client";

import { useState } from "react";
import { LLM_PROVIDERS, type LlmProvider, PROVIDER_DEFAULT_MODELS, PROVIDER_LABELS } from "./model-defaults";

// 프로바이더를 바꾸면 모델 입력칸을 비운다. 안 그러면 "Groq로 바꿨는데 모델은
// gemini-3.1-flash-lite로 남아있는" 상태로 저장되어 다음 분석이 전부 잘못된 모델명으로 실패한다
// (실제로 한 번 이렇게 저장됐다). 직접 모델명을 입력하고 싶으면 프로바이더를 먼저 고른 뒤 입력한다.
export function LlmProviderFields({ initialProvider, initialModel }: { initialProvider: LlmProvider; initialModel: string }) {
  const [provider, setProvider] = useState<LlmProvider>(initialProvider);
  const [model, setModel] = useState(initialModel);

  return (
    <>
      <fieldset className="llm-provider-choices">
        {LLM_PROVIDERS.map((option) => (
          <label className="llm-provider-card" key={option}>
            <input
              type="radio"
              name="provider"
              value={option}
              checked={provider === option}
              onChange={() => { setProvider(option); setModel(""); }}
              required
            />
            <div>
              <strong>{PROVIDER_LABELS[option]}</strong>
              <small>기본 모델: {PROVIDER_DEFAULT_MODELS[option]}</small>
            </div>
          </label>
        ))}
      </fieldset>

      <label className="llm-model-field">
        <span>모델 이름(선택)</span>
        <input
          type="text"
          name="model"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder={`비워두면 ${PROVIDER_DEFAULT_MODELS[provider]}를 사용합니다`}
          maxLength={120}
        />
      </label>
    </>
  );
}
