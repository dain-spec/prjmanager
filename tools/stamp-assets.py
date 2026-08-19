#!/usr/bin/env python3
"""index.html 의 CSS/JS 링크에 내용 해시를 붙인다.

GitHub Pages 는 `cache-control: max-age=600` 을 보내므로 파일 이름이 그대로면
브라우저가 최대 10분간 이전 버전을 계속 쓴다. 배포 직후 팀원이 옛 화면을 보는
원인이 이것이다.

내용 해시를 쿼리로 붙이면(`app.js?v=1a2b3c4d`) 바뀐 파일만 URL 이 달라져 즉시
새로 받고, 바뀌지 않은 파일은 URL 이 그대로여서 캐시를 계속 활용한다.
타임스탬프가 아니라 내용 해시를 쓰는 이유가 이것이다.

푸시 전에 실행한다:

    python3 tools/stamp-assets.py
"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / "index.html"

# href="src/…​.css" / src="src/…​.js" — 기존 ?v=… 는 무시하고 다시 붙인다.
LINK = re.compile(r'(?P<attr>href|src)="(?P<path>src/[^"?]+\.(?:css|js))(?:\?[^"]*)?"')


def main() -> int:
    html = HTML.read_text(encoding="utf-8")
    stamped = []

    def stamp(match: re.Match) -> str:
        rel = match.group("path")
        target = ROOT / rel
        if not target.exists():
            print(f"  ! {rel} 파일이 없어 건너뜁니다")
            return match.group(0)
        digest = hashlib.sha256(target.read_bytes()).hexdigest()[:8]
        stamped.append((rel, digest))
        return f'{match.group("attr")}="{rel}?v={digest}"'

    new_html, count = LINK.subn(stamp, html)
    if not count:
        print("index.html 에서 src/ 아래 CSS·JS 링크를 찾지 못했습니다")
        return 1

    for rel, digest in stamped:
        print(f"  {rel} → ?v={digest}")

    if new_html == html:
        print("변경 없음 (이미 최신 해시)")
        return 0

    HTML.write_text(new_html, encoding="utf-8")
    print(f"index.html 갱신 — 링크 {count}개")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
