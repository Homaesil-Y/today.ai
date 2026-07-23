import { PageSkeleton } from "@/components/skeleton";

// 라우트 전환/서버 렌더 대기 동안 보여줄 기본 스켈레톤.
// 하위 세그먼트에 별도 loading.tsx가 없으면 이 화면이 사용된다.
export default function Loading() {
  return <PageSkeleton />;
}
