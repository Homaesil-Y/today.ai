import type { Metadata, Route } from "next";
import Link from "next/link";
import { Bookmark, Folder, LogIn, Trash2 } from "lucide-react";
import { getPublishedTrends } from "@/data/live-trends";
import { getWatchlistOverview } from "@/data/watchlist";
import { deleteEmptyWatchlist } from "./actions";
import { FolderCreateForm } from "./folder-create-form";
import { WatchlistEntryForm } from "./watchlist-entry-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "관심 목록", robots: { index: false, follow: false } };

export default async function WatchlistPage({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const [{ user, folders, entries }, trends, params] = await Promise.all([getWatchlistOverview(), getPublishedTrends(), searchParams]);
  if (!user) return <div className="page"><section className="page-heading"><div><h1>관심 목록</h1><p>주목할 AI 서비스를 저장하고 점수 변화를 추적하세요.</p></div></section><section className="empty-state"><LogIn size={30} /><h2>로그인이 필요합니다</h2><p>Google 로그인 후 관심 서비스와 저장 당시 점수를 본인 계정에 안전하게 보관할 수 있습니다.</p><Link className="button button-primary" href="/login?next=/watchlist">Google 로그인</Link></section></div>;

  const selectedFolder = folders.find(({ id }) => id === params.folder) ?? folders[0];
  const selectedEntries = selectedFolder ? entries.filter(({ watchlistId }) => watchlistId === selectedFolder.id) : [];
  const trendMap = new Map(trends.map((trend) => [trend.id, trend]));
  const folderCounts = new Map(folders.map((folder) => [folder.id, entries.filter(({ watchlistId }) => watchlistId === folder.id).length]));

  return <div className="page"><section className="page-heading"><div><h1>관심 목록</h1><p>폴더와 메모로 정리하고 저장 당시 점수와 현재 점수를 비교하세요.</p></div><div className="admin-summary"><Bookmark size={20} /><strong>{entries.length}</strong><span>저장된 서비스</span></div></section><div className="watchlist-layout"><aside className="folder-panel panel"><div className="folder-heading"><h2>폴더</h2><span>{folders.length}개</span></div><nav className="folder-list" aria-label="관심 목록 폴더">{folders.map((folder) => <Link className={folder.id === selectedFolder?.id ? "active" : ""} href={`/watchlist?folder=${folder.id}` as Route} key={folder.id}><Folder size={17} /><span>{folder.name}</span><strong>{folderCounts.get(folder.id) ?? 0}</strong></Link>)}</nav><FolderCreateForm />{selectedFolder && selectedFolder.sortOrder !== 0 && (folderCounts.get(selectedFolder.id) ?? 0) === 0 && <form action={deleteEmptyWatchlist}><input type="hidden" name="watchlistId" value={selectedFolder.id} /><button className="folder-delete" type="submit"><Trash2 size={15} />빈 폴더 삭제</button></form>}</aside><section className="watchlist-content"><div className="watchlist-content-heading"><div><h2>{selectedFolder?.name ?? "전체"}</h2><p>{selectedEntries.length}개 서비스</p></div><Link className="button button-secondary" href="/explore">서비스 추가</Link></div>{selectedEntries.length ? <div className="watchlist-grid">{selectedEntries.map((entry) => { const trend = trendMap.get(entry.entityId); if (!trend) return null; const difference = entry.savedScore === null ? null : Math.round((trend.trendScore - entry.savedScore) * 10) / 10; return <article className="panel watchlist-card" key={entry.id}><div className="watchlist-main"><span className="category-chip">{trend.category}</span><Link href={`/services/${trend.slug}`}><h3>{trend.name}</h3></Link><p>{trend.tagline}</p><small>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" }).format(new Date(entry.createdAt))} 저장</small></div><div className="score-compare"><div><span>저장 당시</span><strong>{entry.savedScore ?? "—"}</strong></div><div><span>현재</span><strong>{trend.trendScore}</strong></div><em className={difference === null ? "" : difference >= 0 ? "positive" : "negative"}>{difference === null ? "비교 대기" : `${difference >= 0 ? "+" : ""}${difference}`}</em></div><WatchlistEntryForm itemId={entry.id} entityId={trend.id} currentWatchlistId={entry.watchlistId} memo={entry.memo ?? ""} folders={folders} /></article>; })}</div> : <section className="empty-state watchlist-empty"><Folder size={30} /><h2>이 폴더는 비어 있습니다</h2><p>트렌드에서 관심 등록한 뒤 이곳으로 이동하거나 새 서비스를 추가하세요.</p><Link className="button button-primary" href="/explore">AI 서비스 탐색</Link></section>}</section></div></div>;
}
