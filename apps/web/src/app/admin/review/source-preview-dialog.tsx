"use client";

import { ExternalLink, FileText, X } from "lucide-react";
import { useRef } from "react";

type Props = {
  serviceName: string;
  title: string;
  body: string;
  url: string;
  author: string | null;
  publishedAt: string | null;
};

export function SourcePreviewDialog({ serviceName, title, body, url, author, publishedAt }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const publishedLabel = publishedAt
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(publishedAt))
    : null;

  return (
    <>
      <button className="source-preview-trigger" type="button" onClick={() => dialogRef.current?.showModal()}>
        원문 보기 <FileText size={14} />
      </button>
      <dialog className="source-preview-dialog" ref={dialogRef} onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}>
        <div className="source-preview-panel">
          <header>
            <div><span>수집 원문</span><h2>{serviceName}</h2></div>
            <button className="icon-button" type="button" aria-label="원문 팝업 닫기" onClick={() => dialogRef.current?.close()}><X size={20} /></button>
          </header>
          <section>
            <h3>{title}</h3>
            {(author || publishedLabel) && <p className="source-preview-meta">{[author, publishedLabel].filter(Boolean).join(" · ")}</p>}
            <p className="source-preview-body">{body}</p>
          </section>
          <footer>
            <button className="button button-secondary" type="button" onClick={() => dialogRef.current?.close()}>닫기</button>
            <a className="button button-primary" href={url} target="_blank" rel="noreferrer">원문 사이트 열기 <ExternalLink size={15} /></a>
          </footer>
        </div>
      </dialog>
    </>
  );
}
