# WEHAGO 팀 작업물 현황

서비스/메뉴별 제작 도구(Figma · XD)와 공통 컴포넌트 적용 여부를 한 화면에서 관리하는
사내용 현황 사이트입니다. **웹 1920 × 1080 해상도**를 기준으로 레이아웃을 맞췄습니다.

## 배포된 사이트

<https://dain-spec.github.io/prjmanager/>

## 로컬 실행

```bash
node tools/serve.mjs 4173
```

`http://localhost:4173` 접속. 빌드 단계나 의존성은 없습니다(정적 HTML/CSS/JS).

## 디자인 시스템 연동

색상 · 타이포 · 간격 · 반경 값은 **직접 하드코딩하지 않고** `wehago.token.json`
(Figma Tokens 포맷)에서 CSS 커스텀 프로퍼티로 변환해 사용합니다.

```bash
python3 tools/build-tokens.py   # wehago.token.json → src/tokens.css
```

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
| 요약 카드 | 전체/Figma/XD 서비스 수와 공통 컴포넌트 적용률을 데이터에서 자동 집계 |
| 필터 칩 | Figma · XD · 적용 · 미적용 · 메뉴별 상이. 같은 칩 재클릭 시 해제 |
| 검색 | 서비스명 · 메뉴명 · 파일 경로 · 비고 · 상태 라벨 통합 검색 |
| 정렬 | 서비스명 · 메뉴명 · 파일 유형 · 공통 컴포넌트 적용 (오름/내림 토글) |
| 추가 · 수정 | 테이블 행 안에서 바로 편집(인라인). 별도 모달 없음. Enter 저장 / Esc 취소 |
| 삭제 | 행의 휴지통 아이콘, 확인 후 삭제 |
| 행 액션 | 수정 버튼은 행 hover(또는 키보드 포커스) 시 노출 |
| CSV 내보내기 | 현재 필터·검색 결과만 내보냄. Excel 한글 대응(BOM 포함) |
| 다크 모드 | 저장된 선택이 없으면 OS 설정(`prefers-color-scheme`)을 따름 |

### 집계 규칙

- **서비스 수**는 행(메뉴) 수가 아니라 `서비스명` 기준 고유 개수입니다.
- 한 서비스에 Figma/XD 행이 섞여 있으면 **Figma 를 대표값**으로 집계합니다.
- 공통 컴포넌트 적용률의 분모에서 **'해당 없음'은 제외**합니다
  (XD 원본처럼 공통 컴포넌트 개념이 없는 파일).

## 데이터 저장

브라우저 `localStorage`(키: `wehago-prj-manager/rows/v1`)에 저장되며 새로고침 후에도
유지됩니다. 저장값이 없으면 예시 데이터 10건이 로드됩니다.

> 브라우저 로컬 저장이므로 **팀원 간 데이터 공유는 되지 않습니다.** 공유가 필요하면
> `src/app.js` 의 `load()` / `save()` 를 서버 API 로 교체하세요.

## 구조

```
index.html            마크업
src/tokens.css        토큰 → CSS 변수 (자동 생성)
src/styles.css        레이아웃 · 컴포넌트 스타일
src/app.js            상태 관리 · 렌더링 · 이벤트
tools/build-tokens.py 토큰 변환 스크립트 (원본 JSON 필요)
tools/serve.mjs       로컬 정적 서버
```

브라우저가 실제로 로드하는 파일은 `index.html` + `src/` 세 개뿐입니다.
