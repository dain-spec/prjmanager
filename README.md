# WEHAGO 팀 작업 현황

두 가지 현황을 헤더의 탭으로 오가며 관리하는 사내용 사이트입니다.
**웹 1920 × 1080 해상도**를 기준으로 레이아웃을 맞췄습니다.

| 탭 | 관리 대상 | 컬럼 |
| --- | --- | --- |
| **파일 현황** | 서비스/메뉴별 제작 도구(Figma · XD)와 WHDS 적용 여부 | 서비스명 · 메뉴명 · OS · 유형 · WHDS 적용 · 파일 경로 · zep · 담당자 · 비고 |
| **일일 업무** | 부서에서 들어온 일일 요청업무의 처리 현황 | 요청부서 · 요청자 · 요청내용 · 쪽지 · 서비스명 · 메뉴명 · 파일 경로 · zep · 담당자 · 완료일 |

두 표는 컬럼 구성만 다르고 편집 · 정렬 · 검색 · 순서 변경 동작은 완전히 같습니다.
그래서 컬럼을 `src/app.js` 의 `VIEWS` 에 데이터로 기술하고, 렌더링 · 저장 ·
내보내기를 그 기술에서 만들어 냅니다. **컬럼을 더하거나 빼려면 `VIEWS` 만
고치면 됩니다.**

## 배포된 사이트

<https://dain-spec.github.io/prjmanager/>

`main` 에 푸시하면 GitHub Pages 가 자동으로 다시 빌드합니다. **푸시 전에 반드시
실행하세요:**

```bash
python3 tools/stamp-assets.py
```

Pages 는 `cache-control: max-age=600` 을 보내므로 파일 이름이 그대로면 브라우저가
최대 10분간 이전 버전을 계속 씁니다. 이 스크립트가 `index.html` 의 CSS/JS 링크에
내용 해시를 붙여(`app.js?v=1a2b3c4d`) 바뀐 파일만 즉시 새로 받게 합니다(CSS·JS·파비콘).
타임스탬프가 아니라 내용 해시라서 바뀌지 않은 파일은 캐시를 그대로 활용합니다.

## 로컬 실행

```bash
node tools/serve.mjs 4173
```

`http://localhost:4173` 접속. 빌드 단계나 의존성은 없습니다(정적 HTML/CSS/JS).

## 디자인 시스템 연동

색상 · 타이포 · 간격 · 반경 값은 **직접 하드코딩하지 않고** `wehago.token.json`
(Figma Tokens 포맷)에서 CSS 커스텀 프로퍼티로 변환해 사용합니다.

```bash
python3 tools/build-tokens.py   # wehago.token.json → src/tokens.css, src/favicon.svg
```

파비콘도 여기서 함께 만듭니다. SVG 는 CSS 변수를 읽을 수 없어 색상을 직접 적어야
하는데, 손으로 적으면 토큰과 어긋나므로 스크립트가 생성합니다.

> **`wehago.token.json` 은 이 repo 에 포함되어 있지 않습니다.** 사내 디자인 시스템
> 원본이라 공개 repo 에 올리지 않습니다(`.gitignore` 처리). 변환 결과인
> `src/tokens.css` 는 커밋되어 있으므로 **사이트 실행에는 원본이 필요 없습니다.**
> 토큰을 갱신할 때만 원본을 프로젝트 루트에 두고 위 스크립트를 실행하세요.

- `primitive/Value` → `--color-blue-500`, `--font-heading1` 등 원시 값
- `semantic/Value` → `--color-primary-500`, `--gap-6`, `--radius-medium` 등
- `component/Light` → `--color-text-basic`, `--color-surface-basic` 등 실제 사용 토큰
- `component/Dark` → 라이트와 **값이 다른 토큰만** 다크 모드에서 덮어씁니다.

`src/tokens.css` 는 자동 생성 파일이므로 직접 수정하지 말고 토큰 JSON 을 갱신한 뒤
스크립트를 다시 실행하세요.

### 대비 관련 예외

배지 · 필터 칩은 배경이 모드와 무관하게 고정된 연한 색입니다. 전경에 모드 대응
토큰(`--color-text-primary` 등)을 쓰면 다크 모드에서 색이 밝게 뒤집혀 대비가
3:1 아래로 떨어지므로, 고정 스케일 단계(`--color-blue-700` 등)를 사용해
양쪽 모드에서 4.5:1 이상을 유지합니다.

## 기능

| 기능 | 설명 |
| --- | --- |
| 탭 전환 | 파일 현황 ↔ 일일 업무. 마지막으로 본 탭을 기억한다 |
| 검색 | 그 탭의 모든 컬럼을 대상으로 통합 검색 |
| 정렬 | 헤더 클릭으로 오름 → 내림 → 해제. 정렬을 해제해야 행 순서를 직접 옮길 수 있다 |
| 추가 · 수정 | 테이블 행 안에서 바로 편집(인라인). 별도 모달 없음. Enter 저장 / Esc 취소 |
| 행 추가 | 행 왼쪽 hover 버튼 또는 우클릭 메뉴로 '이 행 아래'에 삽입 |
| 삭제 | 체크박스 선택 후 헤더의 삭제, 또는 행 우클릭 메뉴 |
| 순서 변경 | No 칸을 드래그 |
| 컬럼 폭 | 헤더 경계를 드래그. 탭마다 따로 기억하고, 더블클릭하면 기본값 |
| 담당자 | 조직도(Cell/개인) 팝업에서 복수 선택. 한 Cell 전원이면 'Cell' 로 접어 표시 |
| CSV 내보내기 | 현재 탭의 검색 결과만 내보냄. Excel 한글 대응(BOM 포함) |
| 다크 모드 | 저장된 선택이 없으면 OS 설정(`prefers-color-scheme`)을 따름 |

> 요약 카드 · 필터 칩 · CSV 내보내기는 현재 `hidden` 으로 감춰 두었습니다.
> 마크업과 로직은 남아 있어 `hidden` 만 떼면 다시 나옵니다.

### 집계 규칙

- **서비스 수**는 행(메뉴) 수가 아니라 `서비스명` 기준 고유 개수입니다.
- 한 서비스에 Figma/XD 행이 섞여 있으면 **Figma 를 대표값**으로 집계합니다.
- WHDS 적용률의 분모에서 **'해당 없음'은 제외**합니다
  (XD 원본처럼 WHDS 적용 개념이 없는 파일).

## 데이터 저장

브라우저 `localStorage` 에 탭마다 따로 저장되며 새로고침 후에도 유지됩니다.

| 키 | 내용 |
| --- | --- |
| `wehago-prj-manager/rows/v2` | 파일 현황. 저장값이 없으면 예시 데이터가 로드된다 |
| `wehago-prj-manager/requests/v1` | 일일 업무. 시드가 없어 처음에는 빈 표로 시작한다 |
| `wehago-prj-manager/cols/v2` | 탭별 컬럼 폭 |
| `wehago-prj-manager/view` · `/theme` | 마지막으로 본 탭 · 라이트/다크 선택 |

> 브라우저 로컬 저장이므로 **팀원 간 데이터 공유는 되지 않습니다.** 공유가 필요하면
> `src/app.js` 의 `load()` / `save()` 를 서버 API 로 교체하세요.

## 구조

```
index.html            마크업
src/tokens.css        토큰 → CSS 변수 (자동 생성)
src/favicon.svg       파비콘 (자동 생성)
src/styles.css        레이아웃 · 컴포넌트 스타일
src/app.js            컬럼 기술(VIEWS) · 상태 관리 · 렌더링 · 이벤트
tools/build-tokens.py 토큰 변환 스크립트 (원본 JSON 필요)
tools/stamp-assets.py 배포용 캐시 무효화 (푸시 전 실행)
tools/serve.mjs       로컬 정적 서버
```

브라우저가 실제로 로드하는 파일은 `index.html` + `src/` 세 개뿐입니다.
