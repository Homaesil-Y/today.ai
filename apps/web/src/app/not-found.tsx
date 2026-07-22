import { Compass } from "lucide-react";
import Link from "next/link";

// 존재하지 않는 경로에 대한 404. 앱 셸(사이드바·헤더) 안에서 렌더된다.
export default function NotFound() {
  return (
    <div className="page">
      <section className="page-heading">
        <div>
          <h1>페이지를 찾을 수 없습니다</h1>
          <p>요청하신 주소가 없거나 이동되었을 수 있습니다.</p>
        </div>
      </section>
      <div className="empty-state">
        <Compass size={30} />
        <h2>존재하지 않는 페이지입니다</h2>
        <p>주소를 다시 확인하시거나, 오늘의 레이더에서 최신 AI 트렌드를 확인해보세요.</p>
        <Link className="button button-primary" href="/">오늘의 레이더 보기</Link>
      </div>
    </div>
  );
}
