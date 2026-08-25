/* WEHAGO 팀 작업 현황 — 상태 관리 / 렌더링
   두 개의 표(파일 현황 · 일일 업무 현황)를 탭으로 전환한다. 두 표는 컬럼 구성만
   다르고 편집·정렬·검색·순서 변경 동작은 완전히 같으므로, 컬럼을 데이터(VIEWS)로
   기술하고 렌더링·저장·내보내기를 그 기술에서 만들어 낸다.
   추가·수정은 별도 다이얼로그 없이 테이블 행 안에서 바로 처리한다.
   데이터는 localStorage 에 저장되므로 새로고침해도 유지된다. */
(() => {
  "use strict";

  const THEME_KEY = "wehago-prj-manager/theme";
  const VIEW_KEY = "wehago-prj-manager/view";
  const COL_KEY = "wehago-prj-manager/cols/v2";

  /** 신규 행(아직 저장되지 않은 행)에 쓰는 임시 id */
  const NEW_ID = "__new__";

  /** OS (W=Web / M=Mobile / C=C/S). 컬럼이 좁아 한 글자로 쓴다. */
  const PLATFORM_OPTIONS = ["W", "M", "C"];

  /** 예전에 저장된 긴 이름을 한 글자로 옮기는 표. load() 에서만 쓴다. */
  const PLATFORM_LEGACY = { Web: "W", Mobile: "M", "C/S": "C" };

  /** 담당자 — 1Unit 조직도. Cell 을 그룹으로 묶고, 개인뿐 아니라
      Cell 자체도 담당자로 고를 수 있게 각 그룹 첫 항목에 Cell 을 넣는다.
      직급([리더/차장] 등)은 담당자 컬럼 폭에 들어가지 않아 이름만 쓴다. */
  const OWNER_GROUPS = [
    { cell: "1Cell", members: ["강혜진", "김세인", "김명지", "박소원"] },
    { cell: "2Cell", members: ["강다인", "유은혜", "황원정", "김유빈"] },
  ];

  /** 조직도의 개인 이름 전체 */
  const OWNER_MEMBERS = OWNER_GROUPS.flatMap((g) => g.members);

  /* 담당자는 '사람 이름' 으로만 저장한다. Cell 은 '그 Cell 전원' 을 뜻하는 입력
     편의이므로, 고를 때 구성원으로 펼치고(expandOwners) 보여줄 때 다시 접는다
     (ownerTokens). 저장에 Cell 과 개인이 섞이면 같은 뜻을 두 방식으로 담게 된다. */

  /** Cell 이름이 섞여 있으면 구성원으로 펼친다. */
  function expandOwners(values) {
    const out = [];
    for (const value of values ?? []) {
      const group = OWNER_GROUPS.find((g) => g.cell === value);
      if (group) out.push(...group.members);
      else out.push(value);
    }
    return [...new Set(out)];
  }

  /** 표시용 토큰 — 어떤 Cell 의 구성원이 전부 선택돼 있으면 Cell 이름으로 접는다.
      순서는 조직도 순서를 따르고, 조직도에 없는 값은 뒤에 붙인다. */
  function ownerTokens(owners) {
    const remaining = new Set(owners ?? []);
    const tokens = [];
    for (const group of OWNER_GROUPS) {
      const whole = group.members.length && group.members.every((m) => remaining.has(m));
      if (whole) {
        tokens.push(group.cell);
        for (const m of group.members) remaining.delete(m);
      } else {
        for (const m of group.members) {
          if (remaining.delete(m)) tokens.push(m);
        }
      }
    }
    return [...tokens, ...remaining];
  }

  /** 담당자 표시 — 토큰이 여러 개면 '첫 토큰 +N'. 컬럼이 90px 라 다 못 넣는다. */
  function ownerLabel(owners) {
    const tokens = ownerTokens(owners);
    if (!tokens.length) return "—";
    return tokens.length === 1 ? tokens[0] : `${tokens[0]} +${tokens.length - 1}`;
  }

  /** WHDS 적용 상태 라벨 */
  const COMPONENT_LABEL = {
    applied: "적용",
    missing: "미적용",
    partial: "메뉴별 상이",
    none: "해당 없음",
  };

  /** 적용률 계산 대상 — '해당 없음'은 분모에서 제외한다. */
  const RATE_TARGET = ["applied", "missing", "partial"];

  // ── 컬럼 기술 ───────────────────────────────────────────
  /* 컬럼 한 칸은 다음 속성으로 기술한다.
       key         행 객체의 필드명
       header      헤더 라벨
       width       고정 폭. 생략한 컬럼 하나가 남는 폭을 전부 흡수한다.
       type        text | note | select | owners | path | link | date
       align       "center" 면 보기·편집 모두 가운데 정렬
       sortable    헤더를 정렬 버튼으로 만든다
       required    비어 있으면 저장을 막는다
       badge       select 값 → 배지 종류. null 이면 배지 없이 글자로 둔다
       labels      select 값 → 표시 라벨
       rank        정렬 순서를 값 순서가 아니라 이 표로 정한다
       suggest     "menu" 면 같은 서비스의 기존 메뉴명을 자동완성으로 제안한다 */

  const WORK_COLUMNS = [
    { key: "service", header: "서비스명", width: "190px", type: "text", sortable: true,
      required: true, placeholder: "서비스명", className: "cell--service" },
    { key: "menu", header: "메뉴명", width: "140px", type: "text", sortable: true,
      placeholder: "메뉴명 (비우면 서비스 전체)", emptyTitle: "서비스 전체", suggest: "menu" },
    // 헤더 27 + 좌우 패딩 24, 한 글자 드롭다운 31 이 들어간다.
    { key: "platform", header: "OS", width: "56px", type: "select", align: "center",
      sortable: true, options: PLATFORM_OPTIONS.map((v) => [v, v]), freeValue: true },
    // 편집 드롭다운 55 + 좌우 패딩 24 = 79 가 하한.
    { key: "tool", header: "유형", width: "80px", type: "select", align: "center", sortable: true,
      options: [["Figma", "Figma"], ["XD", "XD"]], badge: (v) => (v === "Figma" ? "figma" : "xd") },
    // 헤더 94, 드롭다운은 104 필요해 더 줄이지 않는다.
    { key: "component", header: "WHDS 적용", width: "96px", type: "select", align: "center",
      sortable: true, options: Object.entries(COMPONENT_LABEL), labels: COMPONENT_LABEL,
      // '해당 없음'은 상태가 아니라 대상 제외이므로 배지 없이 흐린 글자로 둔다.
      badge: (v) => (v === "none" ? null : v), mutedValues: ["none"],
      // 가나다순이 아니라 '조치가 필요한 순서'로 정렬한다.
      rank: { applied: 0, partial: 1, missing: 2, none: 3 } },
    { key: "path", header: "파일 경로", width: "266px", type: "path",
      placeholder: "피그마 주소 또는 XD 경로" },
    { key: "zeplin", header: "zep", width: "52px", type: "link", align: "center",
      placeholder: "제플린 주소" },
    { key: "owners", header: "담당자", width: "90px", type: "owners", align: "center", sortable: true },
    { key: "note", header: "비고", type: "note", placeholder: "비고 (Shift+Enter 로 줄 추가)" },
  ];

  const REQUEST_COLUMNS = [
    // 요청이 들어온 날. 새 행은 오늘로 채워 두고 다른 날이면 고치게 한다.
    { key: "requested", header: "요청일", width: "116px", type: "date", align: "center",
      sortable: true, defaultToday: true },
    { key: "requester", header: "요청자", width: "80px", type: "text", sortable: true,
      placeholder: "요청자" },
    // 폭을 주지 않아 남는 공간을 전부 가져간다. 요청내용이 가장 길고 중요한 값이다.
    { key: "content", header: "요청내용", type: "note", required: true,
      placeholder: "요청내용 (Shift+Enter 로 줄 추가)" },
    { key: "message", header: "쪽지", width: "52px", type: "link", align: "center",
      placeholder: "쪽지 링크" },
    { key: "service", header: "서비스명", width: "150px", type: "text", sortable: true,
      placeholder: "서비스명" },
    { key: "menu", header: "메뉴명", width: "120px", type: "text",
      placeholder: "메뉴명", suggest: "menu" },
    { key: "path", header: "파일 경로", width: "200px", type: "path",
      placeholder: "피그마 주소 또는 XD 경로" },
    { key: "zeplin", header: "zep", width: "52px", type: "link", align: "center",
      placeholder: "제플린 주소" },
    { key: "owners", header: "담당자", width: "90px", type: "owners", align: "center", sortable: true },
    // 네이티브 날짜 입력(달력 아이콘 포함)이 들어가려면 116px 가 필요하다.
    { key: "done", header: "완료일", width: "116px", type: "date", align: "center", sortable: true },
  ];

  /* 시드 데이터는 팀 현황표(프로젝트/유형/주소링크/공통 반영 버전/반영 상태/작업자/
     Figma 이관 여부/비고)를 이 테이블의 컬럼에 매핑한 것이다. 매핑 규칙:
       OS                ← 유형(W=Web/M=Mobile/C=C/S). 같은 서비스의 행을 구분하는 값이다.
       유형               ← 주소링크 종류 (figma.com → Figma, 로컬 경로 → XD)
       WHDS 적용 ← 반영 상태 (완료 → 적용, 진행중 → 미적용, 해당사항 없음 → 해당 없음)
       담당자            ← 작업자
       비고              ← 원래 비고 + 이 테이블에 칸이 없는 값(공통 반영 버전 /
                          Figma 이관 필요)을 잃지 않도록 함께 적었다. */
  const FIGMA = "https://www.figma.com/design";
  const WORK_SEED = [
    { service: "WEHAGO Web 2.0 공통", menu: "", platform: "W", tool: "Figma", component: "none",
      path: `${FIGMA}/vVNdCTvO5nvN88byoPuYkV/WEHAGO-Web-2.0_DSG?m=auto&node-id=6556-35225&t=NrDWMe3BToXAjWwM-1`,
      zeplin: "",
      owners: ["2Cell"], note: "" },
    { service: "WEHAGO Mobile 2.0 공통", menu: "", platform: "M", tool: "Figma", component: "none",
      path: `${FIGMA}/2hjgaltgwo1dIYAyMFxwDZ/WEHAGO-Mobile-2.0_DSG?m=auto&node-id=0-1&t=5WN7aFvvOpyG3MKk-1`,
      zeplin: "",
      owners: ["2Cell"], note: "" },
    { service: "WEHAGO Main 1.5", menu: "", platform: "W", tool: "XD", component: "none",
      path: "XD : WEHAGO 1.0 메인_개선안(Cloud)",
      zeplin: "",
      owners: ["홍길동"], note: "" },
    { service: "WEHAGO Main 2.0", menu: "", platform: "W", tool: "Figma", component: "none",
      path: `${FIGMA}/nQnqiG4WPBVxC4t38nBEW2/WEHAGO-2.0-Web-%EB%A9%94%EC%9D%B8?node-id=723-6341&t=R4SN6APFALqVIQbX-1`,
      zeplin: "",
      owners: ["홍길동"], note: "" },
    { service: "WEHAGO AI Edition", menu: "", platform: "W", tool: "Figma", component: "none",
      path: `${FIGMA}/nQnqiG4WPBVxC4t38nBEW2/WEHAGO-2.0-Web-%EB%A9%94%EC%9D%B8?node-id=4028-42604&t=R4SN6APFALqVIQbX-1`,
      zeplin: "",
      owners: ["홍길동"], note: "WEHAGO 2.0 Web 메인 피그마 파일에 포함" },
    { service: "WEHAGO T", menu: "", platform: "W", tool: "XD", component: "none",
      path: "XD : \\UXUI Unit\\2025\\WEHAGO T, Tedge\\작업물",
      zeplin: "",
      owners: ["홍길동"], note: "" },
    { service: "WEHAGO T AI Edition", menu: "", platform: "W", tool: "Figma", component: "missing",
      path: `${FIGMA}/qmWWQbn78V9VZeya9zmFBJ/WEHAGO-T?node-id=1-32&t=pIe1aQCojb8OETiP-1`,
      zeplin: "",
      owners: ["2Cell"], note: "WEHAGO T 피그마 파일에 포함 / 수임처 AI 연말정산, 수임처관리, 수임처관리 리뉴얼 버전(holding) 혼재 / WHDS W v2.0 반영 진행중" },
    { service: "ProActive AI", menu: "", platform: "W", tool: "Figma", component: "applied",
      path: `${FIGMA}/ZKzpwsavMCqZM48Mvb730d/WEHAGO-Web-Proactive-AI?node-id=1178-16981&t=3y7IUc8MEWu3EEAj-1`,
      zeplin: "",
      owners: ["2Cell"], note: "WHDS 2.0 완료 이전 작업물 / WHDS W v1.0" },
    { service: "ONE AI", menu: "", platform: "W", tool: "Figma", component: "applied",
      path: `${FIGMA}/brhXNqFg9rpqSNI0yK05zM/WEHAGO-Web-ONE-AI?node-id=169-2211&t=jWIchZl5pxcl09qL-1`,
      zeplin: "",
      owners: ["2Cell"], note: "WHDS 2.0 완료 이전 작업물 / WHDS W v1.0 / Figma 이관 필요" },
    { service: "ONE AI", menu: "", platform: "M", tool: "Figma", component: "applied",
      path: `${FIGMA}/jTkk4w5HWRH5zRrelHRKm9/WEHAGO-Mobile-ONE-AI?node-id=1-18&t=tTY327hL8syzZoxz-1`,
      zeplin: "",
      owners: ["2Cell"], note: "WHDS 2.0 완료 이전 작업물 / WHDS W v1.0 / Figma 이관 필요" },
    { service: "ONE AI CUBE", menu: "", platform: "W", tool: "Figma", component: "missing",
      path: `${FIGMA}/fUfs6M2MqStNtESlVAR3p4/WEHAGO-Web-ONE-AI-CUBE?node-id=390-13900&t=J8CId3uoQkbWrSED-1`,
      zeplin: "",
      owners: ["2Cell"], note: "WHDS W v2.0 반영 진행중" },
    { service: "ONE AI Flow", menu: "", platform: "W", tool: "Figma", component: "missing",
      path: `${FIGMA}/DiIjSe99UXUVDl7pgilfZy/ONE-AI-Flow?node-id=1-10&t=hPMX3yI7fEr02kOF-1`,
      zeplin: "",
      owners: ["2Cell"], note: "WHDS W v2.0 반영 진행중" },
    { service: "Agent Market", menu: "", platform: "W", tool: "Figma", component: "applied",
      path: `${FIGMA}/e7cVdc0Ev8irKt8axNuzqy/Agent-Market?node-id=1-10&t=eJhSUAwnoVyY5NTX-1`,
      zeplin: "",
      owners: ["2Cell"], note: "WHDS W v2.0" },
    { service: "메신저", menu: "", platform: "W", tool: "Figma", component: "applied",
      path: `${FIGMA}/wgWUkgyGkZWG7GxevnLivm/WEHAGO-Web-%EB%A9%94%EC%8B%A0%EC%A0%80-%EC%9B%B9-%EC%84%A4%EC%B9%98%ED%98%95-?node-id=4427-2&t=bKujBqg9BLqYEpyt-1`,
      zeplin: "",
      owners: ["2Cell"], note: "WHDS 2.0 최종 버전으로 업데이트 필요 / WHDS W v2.0" },
    { service: "메신저", menu: "", platform: "C", tool: "Figma", component: "applied",
      path: `${FIGMA}/wgWUkgyGkZWG7GxevnLivm/WEHAGO-Web-%EB%A9%94%EC%8B%A0%EC%A0%80-%EC%9B%B9-%EC%84%A4%EC%B9%98%ED%98%95-?node-id=4512-2363&t=bKujBqg9BLqYEpyt-1`,
      zeplin: "",
      owners: ["2Cell"], note: "WEHAGO Web 메신저 피그마 파일에 포함 / WHDS 2.0 최종 버전으로 업데이트 필요 / WHDS W v2.0" },
    { service: "화상회의", menu: "", platform: "W", tool: "Figma", component: "applied",
      path: `${FIGMA}/aesogzuumvDi1EneInUZCt/WEHAGO-Web-%ED%99%94%EC%83%81%ED%9A%8C%EC%9D%98-Meet-?node-id=1-5312&t=pflCrCYHVNHPPnWo-1`,
      zeplin: "",
      owners: ["2Cell"], note: "WHDS 2.0 최종 버전으로 업데이트 필요 / WHDS W v2.0" },
    { service: "화상회의", menu: "", platform: "M", tool: "Figma", component: "applied",
      path: `${FIGMA}/cNrqG2nLmmAt9klnanGBnl/WEHAGO-Meet-Mobile--%EB%A6%AC%EB%89%B4%EC%96%BC-?node-id=1-3063&t=NUPWIqx5l1LBcb6Z-1`,
      zeplin: "",
      owners: ["2Cell"], note: "WHDS 2.0 완료 이전 작업물 / WHDS M v1.0" },
  ];

  /** 파일 현황 저장값을 현재 스키마로 옮긴다. */
  function migrateWorkRow({ menu, owner, ...row }) {
    /* menu 필드의 뜻이 두 번 바뀌었다.
         예전: platform 이 없고 menu 에 Web/Mobile 이 들어 있었다
         지금: platform 이 따로 있고 menu 는 서비스 하위 메뉴명이다
       platform 유무로 구분한다. */
    const legacy = row.platform === undefined;
    const platform = row.platform ?? menu ?? "";
    return {
      ...row,
      // 'Web'/'Mobile'/'C/S' 로 저장된 값을 'W'/'M'/'C' 로 옮긴다.
      platform: PLATFORM_LEGACY[platform] ?? platform,
      menu: legacy ? "" : menu ?? "",
      // 담당자가 한 명(문자열)에서 여러 명(배열)으로 바뀌었고,
      // Cell 이름('2Cell')이 저장돼 있으면 구성원으로 펼친다.
      owners: expandOwners(row.owners ?? (owner ? [owner] : [])),
    };
  }

  const VIEWS = [
    {
      id: "works",
      label: "파일 현황",
      noun: "작업물",
      nameKey: "service",
      // 담당자 컬럼이 추가되며 스키마가 바뀌어 키가 v2 다.
      storageKey: "wehago-prj-manager/rows/v2",
      searchHint: "서비스명, 메뉴명, OS, 파일 경로, 제플린, 담당자, 비고 검색",
      csvName: "wehago-파일-현황.csv",
      columns: WORK_COLUMNS,
      seed: WORK_SEED,
      migrate: migrateWorkRow,
      stats: true,
    },
    {
      id: "requests",
      label: "일일 업무",
      noun: "요청업무",
      nameKey: "content",
      storageKey: "wehago-prj-manager/requests/v1",
      searchHint: "요청일, 요청자, 요청내용, 서비스명, 메뉴명, 담당자 검색",
      csvName: "wehago-일일-업무.csv",
      columns: REQUEST_COLUMNS,
      seed: [],
    },
  ];

  // ── 상태 ────────────────────────────────────────────────

  /** 뷰별 행 목록. 탭을 오갈 때 다시 읽지 않도록 여기 담아 둔다. */
  const store = new Map();

  let view = VIEWS[0];
  let rows = [];

  /* 컬럼 값 필터. 필터 칩 UI 는 제거된 상태이며 visibleRows() 의 필터 로직은
     향후 UI 를 다시 붙일 때를 위해 남겨둔다. { 컬럼키: 값 } 형태다. */
  let filters = {};
  let search = "";
  let sort = { key: null, dir: "asc" };

  /** 체크박스로 선택된 행 id 집합 */
  const selected = new Set();

  /** 편집 중인 행 id (신규는 NEW_ID). null 이면 편집 중이 아니다. */
  let editingId = null;
  /** 편집 중 입력값. 입력 즉시 여기에 반영되므로 재렌더링에도 값이 남는다. */
  let draft = null;
  /** 신규 행을 이 id 의 행 바로 뒤에 넣는다. null 이면 목록 끝에 붙인다. */
  let insertAfterId = null;

  const $ = (id) => document.getElementById(id);
  const menuList = () => $("menu-options");
  const els = {
    tbody: $("tbody"),
    empty: $("empty"),
    emptyText: $("empty-text"),
    addFirst: $("btn-add-first"),
    selectionCount: $("selection-count"),
    search: $("search"),
    toast: $("toast"),
    tabs: $("tabs"),
    stats: $("stats"),
    colgroup: document.querySelector(".table colgroup"),
    thead: document.querySelector(".table thead"),
    headRow: document.querySelector(".table thead tr"),
  };

  /* 전체 선택 체크박스는 헤더를 다시 그릴 때마다 새 th 로 옮겨 붙이므로
     한 번만 만들어 두고 재사용한다(리스너도 한 번만 붙는다). */
  const checkAll = document.createElement("input");
  checkAll.type = "checkbox";
  checkAll.className = "check";
  checkAll.id = "check-all";
  checkAll.setAttribute("aria-label", "전체 선택");

  function uid() {
    return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  /** 오늘 날짜(YYYY-MM-DD). toISOString 은 UTC 라 KST 밤 9시 이후에는
      하루 앞선 날짜가 나오므로 로컬 값으로 직접 만든다. */
  function today() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  /** 컬럼 기술에 맞춰 빠진 필드를 채운다(저장값이 예전 스키마여도 깨지지 않게). */
  function normalize(row) {
    const out = { id: row.id ?? uid() };
    for (const col of view.columns) {
      out[col.key] = col.type === "owners" ? expandOwners(row[col.key]) : row[col.key] ?? "";
    }
    return out;
  }

  function load(target) {
    try {
      const raw = localStorage.getItem(target.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        // 스키마가 바뀔 때 저장 키를 올려 데이터를 버리는 대신 옛 필드를 옮긴다.
        if (Array.isArray(parsed) && parsed.length) {
          return parsed.map((row) => (target.migrate ? target.migrate(row) : row));
        }
      }
    } catch {
      /* 저장값이 손상된 경우 시드 데이터로 대체한다. */
    }
    return target.seed.map((row) => ({ id: uid(), ...row, owners: expandOwners(row.owners) }));
  }

  function save() {
    try {
      localStorage.setItem(view.storageKey, JSON.stringify(rows));
    } catch {
      toast("브라우저 저장 공간에 기록하지 못했습니다.");
    }
  }

  /** rows 를 통째로 갈아끼울 때 store 와 어긋나지 않게 한 곳에서 처리한다. */
  function setRows(list) {
    rows = list;
    store.set(view.id, rows);
  }

  // ── 뷰 전환 ─────────────────────────────────────────────

  function useView(id) {
    const next = VIEWS.find((v) => v.id === id) ?? VIEWS[0];
    if (next === view && store.has(view.id)) return;

    // 편집·선택·정렬은 컬럼 구성에 매여 있으므로 탭을 옮길 때 정리한다.
    closeOwnerPicker();
    editingId = null;
    draft = null;
    insertAfterId = null;
    selected.clear();
    filters = {};
    sort = { key: null, dir: "asc" };

    view = next;
    if (!store.has(view.id)) store.set(view.id, load(view));
    rows = store.get(view.id);

    localStorage.setItem(VIEW_KEY, view.id);
    for (const tab of els.tabs.querySelectorAll("[data-view]")) {
      tab.setAttribute("aria-selected", String(tab.dataset.view === view.id));
    }
    els.search.placeholder = view.searchHint;
    els.stats.hidden = true; // 대시보드는 추후 제공 예정
    buildHead();
    render();
  }

  // ── 헤더 · 컬럼 폭 ──────────────────────────────────────

  const MIN_COL_WIDTH = 44;

  /** 선택 · No 는 데이터 컬럼이 아니라 항상 붙는 구조 컬럼이다. */
  function layout() {
    return [
      { key: "__check", width: "44px", structural: "check" },
      { key: "__no", width: "44px", header: "No", align: "center", structural: "no" },
      ...view.columns,
    ];
  }

  let cols = [];
  let headCells = [];
  let defaultColWidths = [];

  function buildHead() {
    const spec = layout();
    defaultColWidths = spec.map((col) => col.width ?? "");

    els.colgroup.replaceChildren(
      ...spec.map((col) => {
        const el = document.createElement("col");
        if (col.width) el.style.width = col.width;
        return el;
      }),
    );

    els.headRow.replaceChildren(
      ...spec.map((col, index) => {
        const th = document.createElement("th");
        th.scope = "col";
        const classes = [];
        if (col.structural === "check") classes.push("cell--check");
        if (col.align === "center") classes.push("cell--center");
        if (classes.length) th.className = classes.join(" ");

        if (col.structural === "check") {
          th.append(checkAll);
        } else if (col.sortable) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "th-sort";
          btn.dataset.sort = col.key;
          btn.textContent = col.header;
          if (sort.key === col.key) btn.dataset.dir = sort.dir;
          th.append(btn);
        } else {
          th.textContent = col.header ?? "";
        }

        // 폭이 지정된 컬럼만 조절할 수 있다(유동 컬럼은 남는 폭을 흡수한다).
        if (col.width) {
          const handle = document.createElement("div");
          handle.className = "col-resize";
          handle.dataset.col = index;
          handle.title = "드래그해서 폭 조절 (더블클릭 시 기본값)";
          th.append(handle);
        }
        return th;
      }),
    );

    cols = [...els.colgroup.children];
    headCells = [...els.headRow.children];
    applySavedColWidths();
  }

  /* 마지막에 폭을 주지 않은 컬럼이 남는 공간을 흡수한다. 전 컬럼에 고정 폭을 주면
     table-layout: fixed 가 100% 를 채우려고 폭을 비례 확대해 지정값과 어긋난다. */
  function readColWidths() {
    try {
      return JSON.parse(localStorage.getItem(COL_KEY) ?? "{}");
    } catch {
      return {}; // 저장값이 손상된 경우 기본 폭을 쓴다
    }
  }

  function applySavedColWidths() {
    const saved = readColWidths()[view.id] ?? {};
    for (const [index, px] of Object.entries(saved)) {
      if (cols[index] && defaultColWidths[index]) cols[index].style.width = `${px}px`;
    }
  }

  function saveColWidths() {
    const mine = {};
    cols.forEach((col, index) => {
      if (!defaultColWidths[index]) return; // 유동 컬럼은 저장하지 않는다
      const px = Math.round(parseFloat(col.style.width));
      if (px && `${px}px` !== defaultColWidths[index]) mine[index] = px;
    });
    try {
      localStorage.setItem(COL_KEY, JSON.stringify({ ...readColWidths(), [view.id]: mine }));
    } catch {
      /* 저장 공간 문제는 폭 조절 자체를 막지 않는다 */
    }
  }

  // ── 파생 데이터 ─────────────────────────────────────────

  /** 토스트·삭제 확인에 쓰는 행 이름. 요청내용처럼 길 수 있으므로 줄여 쓴다. */
  function rowLabel(row) {
    const raw = String(row?.[view.nameKey] ?? "").replace(/\s+/g, " ").trim();
    if (!raw) return "이름 없는 항목";
    return raw.length > 20 ? `${raw.slice(0, 20)}…` : raw;
  }

  /** 서비스 단위 집계 — 한 서비스에 Figma/XD 가 섞이면 Figma 를 대표값으로 본다. */
  function serviceSummary(list) {
    const byService = new Map();
    for (const row of list) {
      const key = row.service.trim() || "(미지정)";
      if (!byService.has(key)) byService.set(key, []);
      byService.get(key).push(row);
    }
    let figma = 0;
    let xd = 0;
    for (const group of byService.values()) {
      if (group.some((row) => row.tool === "Figma")) figma += 1;
      else xd += 1;
    }
    return { services: byService.size, figma, xd };
  }

  /** 검색 대상 문자열 — 화면에 보이는 값을 그대로 찾을 수 있게 라벨을 쓴다. */
  function searchText(row) {
    const parts = [];
    for (const col of view.columns) {
      const value = row[col.key];
      if (col.type === "owners") parts.push((value ?? []).join(" "));
      else parts.push(col.labels?.[value] ?? value ?? "");
      // 화면에는 디코딩된 파일명이 보이는데 저장값은 퍼센트 인코딩 상태다.
      if (col.type === "path" && value) parts.push(figmaLabel(value)?.name ?? "");
    }
    return parts.join(" ").toLowerCase();
  }

  function sortValue(row, col) {
    if (col.type === "owners") return (row[col.key] ?? []).join(", ");
    return String(col.labels?.[row[col.key]] ?? row[col.key] ?? "");
  }

  function visibleRows() {
    const q = search.trim().toLowerCase();
    let list = rows.filter((row) => {
      // 편집 중인 행은 필터/검색으로 사라지지 않게 항상 남긴다.
      if (row.id === editingId) return true;
      for (const [key, value] of Object.entries(filters)) {
        if (value && row[key] !== value) return false;
      }
      if (!q) return true;
      return searchText(row).includes(q);
    });

    if (sort.key) {
      const dir = sort.dir === "asc" ? 1 : -1;
      const col = view.columns.find((c) => c.key === sort.key);
      const menuCol = view.columns.find((c) => c.key === "menu");
      list = [...list].sort((a, b) => {
        const cmp = col.rank
          ? col.rank[a[col.key]] - col.rank[b[col.key]]
          : sortValue(a, col).localeCompare(sortValue(b, col), "ko");
        if (cmp !== 0) return cmp * dir;
        // 같은 서비스 안에서는 메뉴명 순으로 묶어 보이게 한다.
        if (sort.key === "service" && menuCol) {
          return String(a.menu ?? "").localeCompare(String(b.menu ?? ""), "ko") * dir;
        }
        return 0;
      });
    }
    return list;
  }

  // ── 렌더링 ──────────────────────────────────────────────

  function renderStats() {
    if (!view.stats) return;
    const { services, figma, xd } = serviceSummary(rows);
    const pct = (n) => (services ? Math.round((n / services) * 100) : 0);

    const target = rows.filter((row) => RATE_TARGET.includes(row.component));
    const applied = target.filter((row) => row.component === "applied").length;
    const rate = target.length ? Math.round((applied / target.length) * 100) : 0;

    $("stat-total").textContent = services;
    $("stat-total-aside").textContent = `메뉴 ${rows.length}건`;
    $("stat-figma").textContent = figma;
    $("stat-figma-pct").textContent = `${pct(figma)}%`;
    $("stat-xd").textContent = xd;
    $("stat-xd-pct").textContent = `${pct(xd)}%`;
    $("stat-rate").textContent = `${rate}%`;
    $("stat-rate-bar").style.width = `${rate}%`;
    $("stat-rate-foot").textContent =
      `적용 ${applied} / 대상 ${target.length}건 (해당 없음 ${rows.length - target.length}건 제외)`;
  }

  function renderTable() {
    const list = visibleRows();
    // 신규 행은 아직 rows 에 없으므로 화면에서만 끼워 넣는다.
    let display = list;
    if (editingId === NEW_ID) {
      const anchor = insertAfterId ? list.findIndex((r) => r.id === insertAfterId) : -1;
      const at = anchor >= 0 ? anchor + 1 : list.length;
      display = [...list.slice(0, at), { id: NEW_ID }, ...list.slice(at)];
    }

    els.tbody.replaceChildren();

    display.forEach((row, index) => {
      els.tbody.append(row.id === editingId ? editRow(index + 1) : displayRow(row, index + 1));
    });

    els.empty.hidden = display.length > 0;
    if (!els.empty.hidden) {
      // 데이터가 아예 없으면 hover·우클릭으로 행을 넣을 대상이 없으므로
      // 그 경우에만 추가 버튼을 내보낸다.
      const noData = rows.length === 0;
      els.emptyText.textContent = noData
        ? `아직 등록된 ${view.noun}이 없습니다.`
        : `조건에 맞는 ${view.noun}이 없습니다. 검색어를 조정해 보세요.`;
      els.addFirst.hidden = !noData;
    }
    syncSelectionUi();
  }

  /** 보기 모드 셀 — 컬럼 type 에 따라 다르게 그린다. */
  function displayCell(row, col) {
    const value = row[col.key];
    const base = [col.className, col.align === "center" ? "cell--center" : ""]
      .filter(Boolean)
      .join(" ");
    const muted = (cls) => (cls ? `${cls} cell--muted` : "cell--muted");

    switch (col.type) {
      case "path":
        return pathCell(value, base);
      case "link":
        return linkCell(value, base);
      case "owners":
        return cell(ownerLabel(value), value?.length ? base : muted(base), value?.join(", "));
      case "note":
        // 비고·요청내용은 줄바꿈되어 전체가 보이므로 title(툴팁)을 달지 않는다.
        return cell(value || "", `${base} cell--note`.trim());
      case "date":
        return value ? cell(value, base) : cell("—", muted(base));
      case "select": {
        const kind = col.badge?.(value);
        const label = col.labels?.[value] ?? value ?? "";
        if (kind) return badgeCell(kind, label, base);
        const dim = !value || col.mutedValues?.includes(value);
        return cell(label || "—", dim ? muted(base) : base);
      }
      default:
        return cell(value || "—", value ? base : muted(base), value || col.emptyTitle);
    }
  }

  function displayRow(row, no) {
    const tr = document.createElement("tr");
    tr.append(
      checkboxCell(row.id),
      handleCell(no),
      ...view.columns.map((col) => displayCell(row, col)),
    );
    if (selected.has(row.id)) tr.dataset.selected = "true";
    return tr;
  }

  /** 편집 모드 셀 */
  function editCell(col) {
    switch (col.type) {
      case "owners":
        return ownerPickCell(col);
      case "note":
        return textareaCell(col);
      case "select":
        return selectCell(col);
      case "date":
        return dateCell(col);
      case "path":
        return inputCell(col, "cell--path");
      case "link":
        // 링크는 길어서 가운데 정렬하면 URL 앞부분이 보이지 않는다. 왼쪽에 둔다.
        return inputCell(col, "cell--zeplin");
      default:
        return inputCell(col, col.align === "center" ? "cell--center" : "");
    }
  }

  /** 편집 행 — 각 칸을 입력 컨트롤로 바꾼다. */
  function editRow(no) {
    const tr = document.createElement("tr");
    tr.dataset.editing = "true";
    tr.append(
      // 편집 중인 행은 선택 대상이 아니므로 체크박스 없이 칸만 맞춘다.
      cell("", "cell--check"),
      cell(editingId === NEW_ID ? "신규" : String(no), "cell--no cell--center"),
      ...view.columns.map(editCell),
    );
    return tr;
  }

  /** No 셀 = 순서 변경 핸들. 정렬·검색이 걸려 있으면 옮길 수 없으므로 잠근다. */
  function handleCell(no) {
    const td = cell(String(no), "cell--no cell--center");
    if (reorderable()) {
      td.title = "드래그해서 순서 변경";
    } else {
      td.dataset.locked = "true";
      td.title = "정렬·검색을 해제하면 순서를 변경할 수 있습니다";
    }
    return td;
  }

  /** 표시 순서와 실제 저장 순서가 같을 때만 순서를 바꿀 수 있다. */
  function reorderable() {
    return (
      sort.key === null &&
      search.trim() === "" &&
      Object.values(filters).every((value) => !value)
    );
  }

  /** dragged 행을 target 행의 앞/뒤로 옮긴다. */
  function moveRow(draggedId, targetId, after) {
    if (draggedId === targetId) return;
    const from = rows.findIndex((r) => r.id === draggedId);
    if (from < 0) return;
    const [moved] = rows.splice(from, 1);
    // splice 로 배열이 줄었으므로 target 위치를 다시 찾는다.
    const to = rows.findIndex((r) => r.id === targetId);
    if (to < 0) {
      rows.splice(from, 0, moved); // 되돌린다
      return;
    }
    rows.splice(to + (after ? 1 : 0), 0, moved);
    save();
    render();
    toast(`'${rowLabel(moved)}' 순서를 옮겼습니다.`);
  }

  /** 선택 체크박스 셀 */
  function checkboxCell(id) {
    const td = document.createElement("td");
    td.className = "cell--check";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "check";
    box.checked = selected.has(id);
    box.dataset.check = id;
    box.setAttribute("aria-label", "행 선택");
    td.append(box);
    return td;
  }

  /** Figma URL 에서 사람이 식별할 수 있는 부분만 뽑는다.
      https://www.figma.com/design/<파일키>/<파일명>?node-id=<노드>
      앞의 도메인 29자 + 파일키 22자는 모든 행이 동일해 식별에 쓸모없으므로 버린다.
      같은 파일의 다른 프레임을 가리키는 행이 있으므로 node-id 는 남긴다.
      파싱할 수 없으면 null 을 돌려주고 호출부가 원본 URL 을 그대로 쓴다. */
  function figmaLabel(url) {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.endsWith("figma.com")) return null;
      const segments = parsed.pathname.split("/").filter(Boolean); // [design, 키, 파일명]
      if (segments.length < 3) return null;
      // 파일명에 한글이 들어가면 퍼센트 인코딩되어 있다.
      return { name: decodeURIComponent(segments[2]), node: parsed.searchParams.get("node-id") };
    } catch {
      return null;
    }
  }

  /** 파일 경로 — http 로 시작하면 클릭 가능한 링크, 아니면(XD 로컬 경로 등) 일반 텍스트 */
  function pathCell(value, base) {
    if (!value) return cell("—", `${base} cell--muted`.trim());
    if (!/^https?:\/\//.test(value)) return cell(value, `${base} cell--path`.trim(), value);

    const td = document.createElement("td");
    td.className = `${base} cell--path`.trim();
    td.title = value; // 전체 URL 은 마우스 오버로 확인한다
    const a = document.createElement("a");
    a.href = value;
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const label = figmaLabel(value);
    if (label) {
      a.append(document.createTextNode(label.name));
      if (label.node) {
        const node = document.createElement("span");
        node.className = "path-node";
        node.textContent = ` #${label.node}`;
        a.append(node);
      }
    } else {
      a.textContent = value;
    }
    td.append(a);
    return td;
  }

  /** 링크 컬럼(제플린 · 쪽지) — 주소에 사람이 읽을 부분이 없고 모든 행이 비슷해
      보이므로 '열기' 링크로만 두고 전체 URL 은 title 로 남긴다.
      URL 이 아니면(메모 등) 그대로 보여준다. */
  function linkCell(url, base) {
    if (!url) return cell("—", `${base} cell--muted`.trim());
    if (!/^https?:\/\//.test(url)) return cell(url, `${base} cell--plain`.trim(), url);

    const td = document.createElement("td");
    td.className = `${base} cell--zeplin`.trim();
    td.title = url;
    const a = document.createElement("a");
    a.href = url;
    a.textContent = "열기";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    td.append(a);
    return td;
  }

  function cell(text, className, title) {
    const td = document.createElement("td");
    if (className) td.className = className;
    // 한 줄로 잘리는 칸은 전체 내용을 title 로 남긴다.
    if (title) td.title = title;
    td.textContent = text;
    return td;
  }

  function inputCell(col, className) {
    const td = document.createElement("td");
    if (className) td.className = className;
    const input = document.createElement("input");
    input.className = "input--cell";
    input.name = col.key;
    input.value = draft[col.key] ?? "";
    input.placeholder = col.placeholder ?? col.header;
    // 주소·긴 문장은 60자로 자르면 잘려 나가므로 넉넉히 둔다.
    input.maxLength = col.type === "path" || col.type === "link" ? 500 : 60;
    if (col.required) input.required = true;
    if (col.suggest === "menu") {
      refreshMenuOptions();
      input.setAttribute("list", "menu-options");
    }
    input.setAttribute("aria-label", col.header);
    td.append(input);
    return td;
  }

  /** 여러 줄 칸(비고 · 요청내용) — Shift+Enter 로 줄을 추가할 수 있게 textarea 를 쓴다. */
  function textareaCell(col) {
    const td = document.createElement("td");
    td.className = "cell--note";
    const area = document.createElement("textarea");
    area.className = "input--cell";
    area.name = col.key;
    area.rows = 1;
    area.value = draft[col.key] ?? "";
    area.placeholder = col.placeholder ?? col.header;
    area.maxLength = 500;
    if (col.required) area.required = true;
    area.setAttribute("aria-label", col.header);
    td.append(area);
    // 렌더 직후에는 아직 레이아웃 전이라 scrollHeight 가 0 이므로 다음 프레임에 맞춘다.
    requestAnimationFrame(() => autoGrow(area));
    return td;
  }

  /** 내용에 맞춰 textarea 높이를 늘린다. 그 행만 32px 보다 커진다. */
  function autoGrow(area) {
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }

  function dateCell(col) {
    const td = document.createElement("td");
    td.className = "cell--center";
    const input = document.createElement("input");
    input.type = "date";
    input.className = "input--cell";
    input.name = col.key;
    input.value = draft[col.key] ?? "";
    input.setAttribute("aria-label", col.header);
    td.append(input);
    return td;
  }

  /** 편집 행의 담당자 칸. 셀 전체가 선택 팝업을 여는 버튼이다. */
  function ownerPickCell(col) {
    const td = document.createElement("td");
    td.className = "cell--center";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "owner-pick";
    btn.dataset.ownerPick = col.key;
    btn.setAttribute("aria-label", `${col.header} 선택`);
    syncOwnerButton(btn);
    td.append(btn);
    return td;
  }

  function syncOwnerButton(btn) {
    const owners = draft?.owners ?? [];
    btn.textContent = ownerLabel(owners);
    btn.title = owners.length ? owners.join(", ") : "담당자 선택";
    btn.toggleAttribute("data-empty", owners.length === 0);
  }

  /** 팝업에 보여줄 그룹.
      조직도에 없는 기존 값('홍길동' 등)은 '기타' 로 함께 보여 지울 수 있게 한다. */
  function ownerPickerGroups() {
    const groups = OWNER_GROUPS.map((g) => ({
      label: g.cell,
      cell: g.cell,
      values: [g.cell, ...g.members],
    }));
    const extra = (draft?.owners ?? []).filter((v) => !OWNER_MEMBERS.includes(v));
    if (extra.length) groups.push({ label: "기타", cell: null, values: extra });
    return groups;
  }

  /** 같은 서비스에서 이미 쓴 메뉴명을 자동완성으로 제안한다.
      '전표입력' / '전표 입력' 처럼 표기가 갈리는 것을 줄이기 위한 것이다. */
  function refreshMenuOptions() {
    const service = (draft?.service ?? "").trim();
    const used = [
      ...new Set(
        rows
          .filter((r) => r.id !== editingId && (r.service ?? "").trim() === service && r.menu)
          .map((r) => r.menu),
      ),
    ].sort((a, b) => a.localeCompare(b, "ko"));

    menuList().replaceChildren(
      ...used.map((value) => {
        const option = document.createElement("option");
        option.value = value;
        return option;
      }),
    );
  }

  /** select 옵션. freeValue 컬럼(OS)은 예전에 자유 입력이었으므로 현재 값이
      표준 옵션에 없으면 그 값도 옵션에 넣는다. 그러지 않으면 편집만 해도
      값이 조용히 첫 옵션으로 바뀌어 버린다. */
  function optionsFor(col) {
    const current = draft?.[col.key];
    if (!col.freeValue || !current) return col.options;
    if (col.options.some(([value]) => value === current)) return col.options;
    return [...col.options, [current, current]];
  }

  function selectCell(col) {
    const td = document.createElement("td");
    if (col.align === "center") td.className = "cell--center";
    const select = document.createElement("select");
    select.className = "input--cell";
    select.name = col.key;
    select.setAttribute("aria-label", col.header);
    for (const [value, text] of optionsFor(col)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      if (draft[col.key] === value) option.selected = true;
      select.append(option);
    }
    td.append(select);
    return td;
  }

  function badgeCell(kind, label, className) {
    const td = document.createElement("td");
    if (className) td.className = className;
    const span = document.createElement("span");
    span.className = `badge badge--${kind}`;
    span.textContent = label;
    td.append(span);
    return td;
  }

  function render() {
    renderStats();
    renderTable();
    syncSelectionUi();
  }

  // ── 편집 동작 ───────────────────────────────────────────

  /** columnIndex 를 주면 그 칸의 입력 컨트롤로 바로 포커스한다(셀 클릭 진입). */
  function startEdit(id, columnIndex) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    editingId = id;
    draft = normalize(row);
    renderTable();
    syncToolbar();
    focusCell(columnIndex);
  }

  function startCreate(afterId) {
    editingId = NEW_ID;
    insertAfterId = afterId ?? null;
    draft = {};
    for (const col of view.columns) {
      if (col.type === "owners") draft[col.key] = [];
      else if (col.type === "select") draft[col.key] = col.options[0][0];
      else if (col.defaultToday) draft[col.key] = today();
      else draft[col.key] = "";
    }
    renderTable();
    syncToolbar();
    focusCell();
  }

  /** 편집 행에서 columnIndex 번째 칸에 포커스한다. 없으면 첫 입력 칸으로. */
  function focusCell(columnIndex) {
    const tr = els.tbody.querySelector("tr[data-editing]");
    if (!tr) return;
    const SELECTOR = "[name], [data-owner-pick]";
    const field =
      (columnIndex !== undefined && tr.children[columnIndex]?.querySelector(SELECTOR)) ||
      tr.querySelector(SELECTOR);
    if (!field) return;
    field.focus();
    tr.scrollIntoView({ block: "nearest" });

    if (field.dataset.ownerPick) {
      // 담당자 칸은 커스텀 팝업이라 바로 펼친다.
      openOwnerPicker(field);
    } else if (field.tagName === "SELECT" || field.type === "date") {
      /* 클릭으로 들어왔으면 목록·달력을 바로 펼친다. showPicker 는 사용자 제스처
         안에서만 허용되고 구형 브라우저에는 없으므로 실패는 무시한다. */
      try {
        field.showPicker?.();
      } catch {
        /* 제스처 밖 호출이거나 미지원 — 포커스만 남는다 */
      }
    } else if (field.select) {
      // 텍스트는 전체 선택 상태로 둔다(스프레드시트처럼 타이핑하면 대체된다).
      field.select();
    }
  }

  function commit() {
    const next = {};
    for (const col of view.columns) {
      const raw = draft[col.key];
      if (col.type === "owners") next[col.key] = expandOwners(raw);
      else if (col.type === "select") next[col.key] = raw || col.options[0][0];
      else next[col.key] = (raw ?? "").trim();
    }

    const missing = view.columns.find((col) => col.required && !next[col.key]);
    if (missing) {
      toast(`${missing.header}을(를) 입력해 주세요.`);
      els.tbody.querySelector(`tr[data-editing] [name="${missing.key}"]`)?.focus();
      return false;
    }

    if (editingId === NEW_ID) {
      const row = { id: uid(), ...next };
      const anchor = insertAfterId ? rows.findIndex((r) => r.id === insertAfterId) : -1;
      rows.splice(anchor >= 0 ? anchor + 1 : rows.length, 0, row);
      toast(`'${rowLabel(row)}' 항목을 추가했습니다.`);
    } else {
      const i = rows.findIndex((r) => r.id === editingId);
      rows[i] = { ...rows[i], ...next };
      toast(`'${rowLabel(rows[i])}' 항목을 수정했습니다.`);
    }

    closeOwnerPicker();
    editingId = null;
    draft = null;
    insertAfterId = null;
    save();
    render();
    return true;
  }

  function cancelEdit() {
    closeOwnerPicker();
    editingId = null;
    draft = null;
    insertAfterId = null;
    renderTable();
    syncToolbar();
  }

  /** 주어진 id 들의 행을 삭제한다. 헤더 삭제와 우클릭 삭제가 함께 쓴다. */
  function removeRows(ids) {
    const targets = rows.filter((r) => ids.has(r.id));
    if (!targets.length) return;

    const label =
      targets.length === 1 ? `'${rowLabel(targets[0])}' 항목을` : `선택한 ${targets.length}건을`;
    if (!confirm(`${label} 삭제할까요?`)) return;

    setRows(rows.filter((r) => !ids.has(r.id)));
    if (editingId && ids.has(editingId)) {
      editingId = null;
      draft = null;
    }
    for (const id of ids) selected.delete(id);
    const count = targets.length;
    save();
    render();
    toast(`${count}건을 삭제했습니다.`);
  }

  function removeSelected() {
    removeRows(new Set(selected));
  }

  /** 체크박스 상태 → selected 집합 */
  function toggleSelect(id, checked) {
    if (checked) selected.add(id);
    else selected.delete(id);
    syncSelectionUi();
  }

  /** 헤더 체크박스 — 현재 목록(필터·검색 결과)만 전체 선택/해제한다. */
  function toggleSelectAll(checked) {
    const ids = visibleRows().map((r) => r.id);
    for (const id of ids) {
      if (checked) selected.add(id);
      else selected.delete(id);
    }
    for (const box of els.tbody.querySelectorAll("[data-check]")) {
      box.checked = selected.has(box.dataset.check);
      box.closest("tr").toggleAttribute("data-selected", box.checked);
    }
    syncSelectionUi();
  }

  /** 선택 표시(행 배경·헤더 체크박스)와 헤더 버튼을 현재 상태에 맞춘다. */
  function syncSelectionUi() {
    for (const box of els.tbody.querySelectorAll("[data-check]")) {
      box.closest("tr").toggleAttribute("data-selected", box.checked);
    }
    const visible = visibleRows().map((r) => r.id);
    const picked = visible.filter((id) => selected.has(id)).length;
    checkAll.checked = visible.length > 0 && picked === visible.length;
    // 일부만 선택된 상태는 indeterminate 로 표시한다.
    checkAll.indeterminate = picked > 0 && picked < visible.length;
    syncToolbar();
  }

  /** 헤더 버튼 표시 — 기본 / 선택 / 편집 세 가지 상태가 있다. */
  function syncToolbar() {
    const editing = editingId !== null;
    const count = selected.size;
    const show = (el, on) => el.toggleAttribute("hidden", !on);

    show(els.selectionCount, !editing && count > 0);
    show($("btn-delete-selected"), !editing && count > 0);

    show($("btn-save"), editing);
    show($("btn-cancel"), editing);

    els.selectionCount.textContent = `${count}개 선택`;
  }

  // ── CSV 내보내기 ────────────────────────────────────────

  function exportCsv() {
    const head = ["No", ...view.columns.map((col) => col.header)];
    const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
    const list = visibleRows();
    const body = list.map((row, i) =>
      [
        i + 1,
        ...view.columns.map((col) => {
          if (col.type === "owners") return (row[col.key] ?? []).join(", ");
          return col.labels?.[row[col.key]] ?? row[col.key] ?? "";
        }),
      ]
        .map(escape)
        .join(","),
    );
    // Excel 에서 한글이 깨지지 않도록 BOM 을 붙인다.
    const blob = new Blob(["﻿" + [head.map(escape).join(","), ...body].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = view.csvName;
    a.click();
    URL.revokeObjectURL(url);
    toast(`${list.length}건을 CSV 로 내보냈습니다.`);
  }

  // ── 토스트 ──────────────────────────────────────────────

  let toastTimer;
  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.hidden = true;
    }, 2600);
  }

  // ── 이벤트 바인딩 ───────────────────────────────────────

  // ── 탭 ────────────────────────────────────────────────
  els.tabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-view]");
    if (!tab || tab.dataset.view === view.id) return;
    // 편집 중이면 먼저 저장한다. 저장이 실패하면(필수값 누락) 탭을 옮기지 않는다.
    if (editingId !== null && !commit()) return;
    useView(tab.dataset.view);
  });

  // ── 컬럼 폭 조절 ──────────────────────────────────────
  let resizeCol = null;
  let resizeStartX = 0;
  let resizeStartWidth = 0;

  els.thead.addEventListener("mousedown", (event) => {
    const handle = event.target.closest(".col-resize");
    if (!handle || event.button !== 0) return;
    resizeCol = Number(handle.dataset.col);
    resizeStartX = event.clientX;
    resizeStartWidth = headCells[resizeCol].getBoundingClientRect().width;
    document.body.dataset.colResizing = "true";
    handle.classList.add("col-resize--active");
    event.preventDefault(); // 정렬 클릭·텍스트 선택을 막는다
  });

  document.addEventListener("mousemove", (event) => {
    if (resizeCol === null) return;
    const width = Math.max(
      MIN_COL_WIDTH,
      Math.round(resizeStartWidth + event.clientX - resizeStartX),
    );
    cols[resizeCol].style.width = `${width}px`;
  });

  document.addEventListener("mouseup", () => {
    if (resizeCol === null) return;
    resizeCol = null;
    delete document.body.dataset.colResizing;
    document.querySelector(".col-resize--active")?.classList.remove("col-resize--active");
    saveColWidths();
  });

  // 손잡이를 더블클릭하면 그 컬럼만 기본 폭으로 되돌린다.
  els.thead.addEventListener("dblclick", (event) => {
    const handle = event.target.closest(".col-resize");
    if (!handle) return;
    const index = Number(handle.dataset.col);
    cols[index].style.width = defaultColWidths[index];
    saveColWidths();
    toast("컬럼 폭을 기본값으로 되돌렸습니다.");
  });

  // ── 정렬 ──────────────────────────────────────────────
  els.thead.addEventListener("click", (event) => {
    const th = event.target.closest(".th-sort");
    if (!th) return;
    const key = th.dataset.sort;
    // 오름 → 내림 → 해제 순으로 돌린다. 정렬을 해제해야 행 순서를 직접 바꿀 수 있다.
    if (sort.key !== key) sort = { key, dir: "asc" };
    else if (sort.dir === "asc") sort = { key, dir: "desc" };
    else sort = { key: null, dir: "asc" };

    for (const other of els.thead.querySelectorAll(".th-sort")) delete other.dataset.dir;
    if (sort.key) th.dataset.dir = sort.dir;
    renderTable();
  });

  // ── hover 한 행 왼쪽(표 바깥)의 행 추가 버튼 ───────────
  const insertBtn = $("row-insert");
  const tableWrap = document.querySelector(".table-wrap");
  let insertAnchorId = null;

  els.tbody.addEventListener("mouseover", (event) => {
    // 편집 중이거나 정렬·검색 중이면 '이 행 아래' 가 모호하므로 내보내지 않는다.
    if (editingId !== null || !reorderable()) return hideInsert();
    const tr = event.target.closest("tr");
    const id = tr?.querySelector("[data-check]")?.dataset.check;
    if (!id) return;
    insertAnchorId = id;
    placeInsert(tr);
  });

  /** 버튼을 행의 세로 중앙 · 표 왼쪽 바깥에 놓는다. */
  function placeInsert(tr) {
    const row = tr.getBoundingClientRect();
    const wrap = tableWrap.getBoundingClientRect();
    const middle = row.top + row.height / 2;
    // sticky 헤더에 가려진 행이나 스크롤 영역을 벗어난 행에는 붙이지 않는다.
    if (middle < wrap.top || middle > wrap.bottom) return hideInsert();

    insertBtn.hidden = false;
    const size = insertBtn.offsetWidth;
    const table = els.tbody.closest("table").getBoundingClientRect();
    // 1440 에서 좌측 여백이 24px 뿐이라 화면 밖으로 나가지 않게 하한을 둔다.
    insertBtn.style.left = `${Math.max(4, table.left - size - 4)}px`;
    insertBtn.style.top = `${middle - size / 2}px`;
  }

  function hideInsert() {
    insertBtn.hidden = true;
    insertAnchorId = null;
  }

  // 표를 벗어나면 숨긴다. 단 버튼으로 이동하는 중이면 유지한다(버튼이 표 밖에 있다).
  tableWrap.addEventListener("mouseleave", (event) => {
    if (event.relatedTarget === insertBtn) return;
    hideInsert();
  });
  insertBtn.addEventListener("mouseleave", (event) => {
    if (event.relatedTarget?.closest?.("#tbody")) return;
    hideInsert();
  });

  insertBtn.addEventListener("click", () => {
    const id = insertAnchorId;
    hideInsert();
    if (id) startCreate(id);
  });

  // 스크롤·리사이즈 후에는 좌표가 어긋나므로 숨긴다.
  tableWrap.addEventListener("scroll", hideInsert);
  addEventListener("resize", hideInsert);

  // ── 담당자 복수 선택 팝업 ─────────────────────────────
  const ownerPicker = $("owner-picker");

  els.tbody.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-owner-pick]");
    if (trigger) openOwnerPicker(trigger);
  });

  /* 팝업을 여는 클릭은 계속 전파되어 document 의 '팝업 밖 클릭' 판정에 걸린다.
     타이머(setTimeout/rAF)로 미루는 방식은 탭이 비활성이면 실행이 지연돼
     신뢰할 수 없으므로, 그 한 번의 판정만 건너뛰도록 표시해 둔다. */
  let pickerJustOpened = false;

  /** 팝업이 따라다닐 기준 셀 */
  let pickerTrigger = null;

  function openOwnerPicker(trigger) {
    pickerJustOpened = true;
    pickerTrigger = trigger;
    ownerPicker.replaceChildren();
    for (const group of ownerPickerGroups()) {
      const box = document.createElement("div");
      box.className = "picker__group";
      const label = document.createElement("p");
      label.className = "picker__label";
      label.textContent = group.label;
      box.append(label);
      for (const value of group.values) {
        const item = document.createElement("label");
        item.className = "picker__item";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "check";
        check.value = value;
        // Cell 항목은 값이 아니라 '전원 토글' 컨트롤이다.
        if (value === group.cell) check.dataset.cell = group.cell;
        item.append(check, document.createTextNode(value));
        box.append(item);
      }
      ownerPicker.append(box);
    }

    syncPickerChecks();
    ownerPicker.hidden = false;
    placePicker();
    ownerPicker.querySelector("input")?.focus();
  }

  /** 기준 셀 바로 아래에 붙이고 화면 밖으로 넘치지 않게 보정한다.
      스크롤 때 닫지 않고 따라가게 하는 이유: focusCell 의 scrollIntoView 가
      스크롤을 유발해, 닫는 방식이면 방금 열린 팝업이 곧바로 닫혀버린다. */
  function placePicker() {
    if (ownerPicker.hidden || !pickerTrigger) return;
    const anchor = pickerTrigger.getBoundingClientRect();
    const wrap = tableWrap.getBoundingClientRect();
    // 기준 셀이 표 밖으로 스크롤돼 나가면 닫는다.
    if (anchor.bottom < wrap.top || anchor.top > wrap.bottom) return closeOwnerPicker();

    const box = ownerPicker.getBoundingClientRect();
    ownerPicker.style.left = `${Math.min(anchor.left, innerWidth - box.width - 8)}px`;
    ownerPicker.style.top = `${Math.min(anchor.bottom + 4, innerHeight - box.height - 8)}px`;
  }

  function closeOwnerPicker() {
    ownerPicker.hidden = true;
    pickerTrigger = null;
  }

  ownerPicker.addEventListener("change", (event) => {
    const check = event.target.closest("input[type=checkbox]");
    if (!check || !draft) return;

    const owners = new Set(draft.owners ?? []);
    const cell = check.dataset.cell;
    if (cell) {
      // Cell 체크는 그 Cell 전원을 한 번에 켜고 끈다.
      const members = OWNER_GROUPS.find((g) => g.cell === cell).members;
      for (const m of members) {
        if (check.checked) owners.add(m);
        else owners.delete(m);
      }
    } else if (check.checked) {
      owners.add(check.value);
    } else {
      owners.delete(check.value);
    }

    // 조직도 순서를 유지하고, 조직도에 없는 값은 뒤에 둔다.
    const ordered = OWNER_MEMBERS.filter((v) => owners.has(v));
    const extra = [...owners].filter((v) => !OWNER_MEMBERS.includes(v));
    draft.owners = [...ordered, ...extra];

    syncPickerChecks();
    const trigger = els.tbody.querySelector("[data-owner-pick]");
    if (trigger) syncOwnerButton(trigger);
  });

  /** 팝업 체크 상태를 draft 에 맞춘다.
      Cell 체크박스는 전원 선택이면 checked, 일부면 indeterminate 로 표시한다. */
  function syncPickerChecks() {
    const owners = new Set(draft?.owners ?? []);
    for (const check of ownerPicker.querySelectorAll("input[type=checkbox]")) {
      const cell = check.dataset.cell;
      if (!cell) {
        check.checked = owners.has(check.value);
        continue;
      }
      const members = OWNER_GROUPS.find((g) => g.cell === cell).members;
      const picked = members.filter((m) => owners.has(m)).length;
      check.checked = picked === members.length;
      check.indeterminate = picked > 0 && picked < members.length;
    }
  }

  document.addEventListener("click", (event) => {
    const justOpened = pickerJustOpened;
    pickerJustOpened = false;
    if (ownerPicker.hidden || justOpened) return;
    if (event.target.closest("#owner-picker") || event.target.closest("[data-owner-pick]")) return;
    closeOwnerPicker();
  });

  tableWrap.addEventListener("scroll", placePicker);
  addEventListener("resize", placePicker);

  // ── 행 우클릭 메뉴 ────────────────────────────────────
  const rowMenu = $("row-menu");
  let menuRowId = null;

  els.tbody.addEventListener("contextmenu", (event) => {
    if (editingId !== null) return; // 편집 중에는 브라우저 기본 메뉴를 그대로 둔다
    const tr = event.target.closest("tr");
    const id = tr?.querySelector("[data-check]")?.dataset.check;
    if (!id) return;
    event.preventDefault();
    menuRowId = id;

    // '아래에 행 추가' 는 표시 순서와 저장 순서가 같을 때만 의미가 있다.
    // 삭제는 순서와 무관하므로 정렬·검색 중에도 쓸 수 있게 둔다.
    const canInsert = reorderable();
    $("menu-insert").hidden = !canInsert;
    $("menu-divider").hidden = !canInsert;

    rowMenu.hidden = false;
    // 항목 표시를 먼저 정한 뒤 크기를 재야 위치가 어긋나지 않는다.
    const box = rowMenu.getBoundingClientRect();
    rowMenu.style.left = `${Math.min(event.clientX, innerWidth - box.width - 8)}px`;
    rowMenu.style.top = `${Math.min(event.clientY, innerHeight - box.height - 8)}px`;
  });

  rowMenu.addEventListener("click", (event) => {
    const item = event.target.closest("[data-menu]");
    if (!item) return;
    const id = menuRowId;
    closeRowMenu();
    if (!id) return;

    if (item.dataset.menu === "insert-below") {
      startCreate(id);
    } else if (item.dataset.menu === "delete") {
      // 우클릭한 행이 선택에 포함돼 있으면 선택 전체를, 아니면 그 행만 삭제한다.
      removeRows(selected.has(id) ? new Set(selected) : new Set([id]));
    }
  });

  function closeRowMenu() {
    rowMenu.hidden = true;
    menuRowId = null;
  }

  // 메뉴 밖 클릭 / Esc / 표 스크롤 시 닫는다.
  document.addEventListener("click", (event) => {
    if (!rowMenu.hidden && !event.target.closest("#row-menu")) closeRowMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeRowMenu();
  });
  tableWrap.addEventListener("scroll", closeRowMenu);

  /* 빈 상태의 추가 버튼은 렌더 시점에 따라 존재 여부가 달라지므로 위임으로 받는다.
     startCreate 를 리스너로 그대로 넘기면 click 이벤트가 afterId 인자로 들어간다. */
  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="add"]')) startCreate();
  });

  // 편집 행 입력값을 즉시 draft 에 반영해 재렌더링에도 값이 유지되게 한다.
  els.tbody.addEventListener("input", (event) => {
    const field = event.target.closest("[name]");
    if (!field || !draft) return;
    draft[field.name] = field.value;
    if (field.tagName === "TEXTAREA") autoGrow(field);
    // 서비스가 바뀌면 제안할 메뉴명도 달라진다.
    if (field.name === "service") refreshMenuOptions();
  });
  // 편집 필드용 (체크박스는 name 이 없어 여기 걸리지 않는다)
  els.tbody.addEventListener("change", (event) => {
    const field = event.target.closest("[name]");
    if (field && draft) draft[field.name] = field.value;
  });

  // 체크박스 선택
  els.tbody.addEventListener("change", (event) => {
    const box = event.target.closest("[data-check]");
    if (box) toggleSelect(box.dataset.check, box.checked);
  });

  checkAll.addEventListener("change", (event) => toggleSelectAll(event.target.checked));

  // ── 행 순서 변경 (No 칸을 핸들로 드래그) ────────────────
  // HTML5 drag-and-drop 대신 마우스 이벤트로 구현한다. HTML5 DnD 는 브라우저가
  // 만드는 네이티브 드래그 제스처가 필요해 자동 검증이 불가능하고, 드래그 이미지·
  // dropEffect·Firefox 의 setData 요구 같은 브라우저별 차이도 많다.
  let dragId = null;

  els.tbody.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return; // 우클릭은 컨텍스트 메뉴용이므로 드래그를 시작하지 않는다
    if (editingId !== null || !reorderable()) return;
    const handle = event.target.closest(".cell--no");
    if (!handle) return;
    const tr = handle.closest("tr");
    dragId = tr?.querySelector("[data-check]")?.dataset.check ?? null;
    if (!dragId) return;
    tr.dataset.dragging = "true";
    document.body.dataset.reordering = "true";
    event.preventDefault(); // 드래그 중 텍스트가 선택되지 않게 한다
  });

  document.addEventListener("mousemove", (event) => {
    if (!dragId) return;
    clearDropMarks();
    const tr = rowAt(event.clientY);
    if (!tr || tr.dataset.dragging) return;
    const box = tr.getBoundingClientRect();
    tr.dataset.drop = event.clientY > box.top + box.height / 2 ? "after" : "before";
  });

  document.addEventListener("mouseup", (event) => {
    if (!dragId) return;
    const tr = rowAt(event.clientY);
    const targetId = tr?.querySelector("[data-check]")?.dataset.check;
    const after = tr?.dataset.drop === "after";
    const moved = dragId;
    endDrag();
    if (targetId) moveRow(moved, targetId, after);
  });

  // 드래그 중 Esc 로 취소
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dragId) endDrag();
  });

  /** 화면 y 좌표에 걸리는 행 */
  function rowAt(clientY) {
    return (
      [...els.tbody.querySelectorAll("tr")].find((tr) => {
        const box = tr.getBoundingClientRect();
        return clientY >= box.top && clientY <= box.bottom;
      }) ?? null
    );
  }

  function endDrag() {
    clearDropMarks();
    for (const tr of els.tbody.querySelectorAll("tr[data-dragging]")) delete tr.dataset.dragging;
    delete document.body.dataset.reordering;
    dragId = null;
  }

  function clearDropMarks() {
    for (const tr of els.tbody.querySelectorAll("tr[data-drop]")) delete tr.dataset.drop;
  }

  els.tbody.addEventListener("click", (event) => {
    // 링크는 원래 동작(Figma 열기)을 유지한다
    if (event.target.closest("a")) return;

    // 체크박스 칸은 선택 전용. 칸의 빈 영역을 눌러도 토글되게 한다.
    const checkCell = event.target.closest(".cell--check");
    if (checkCell) {
      // 체크박스를 직접 누른 경우는 change 이벤트가 처리하므로 중복 토글을 막는다
      if (event.target.closest("[data-check]")) return;
      const box = checkCell.querySelector("[data-check]");
      if (box && editingId === null) {
        box.checked = !box.checked;
        toggleSelect(box.dataset.check, box.checked);
      }
      return;
    }

    // No 칸은 순서 변경 핸들이므로 편집 진입에서 제외한다.
    if (event.target.closest(".cell--no")) return;

    // 그 밖의 셀을 클릭하면 그 칸이 바로 편집 상태가 된다.
    const td = event.target.closest("td");
    const tr = td?.closest("tr");
    if (!tr) return;

    // 이미 편집 중인 행 안의 클릭은 입력 컨트롤이 알아서 포커스를 받는다.
    if (tr.dataset.editing) return;

    // 다른 행을 편집 중이면 먼저 저장한다. 저장이 실패하면(필수값 누락) 이동하지 않는다.
    if (editingId !== null && !commit()) return;

    const id = tr.querySelector("[data-check]")?.dataset.check;
    if (id) startEdit(id, [...tr.children].indexOf(td));
  });

  $("btn-delete-selected").addEventListener("click", removeSelected);
  $("btn-save").addEventListener("click", commit);
  $("btn-cancel").addEventListener("click", cancelEdit);

  // Enter 저장 / Esc 취소. 담당자 팝업은 body 레벨에 있어 tbody 로 이벤트가
  // 올라오지 않으므로 document 에서 듣는다.
  document.addEventListener("keydown", (event) => {
    if (!editingId) return;

    /* 한글 입력 중(IME 조합 중)의 Enter 는 조합을 확정하는 키다. 이때 저장으로
       가로채면 preventDefault 가 조합 확정을 막아 마지막 글자가 날아가고,
       사용자에게는 'Enter 가 안 먹는다' 로 보인다. 조합 중에는 넘긴다. */
    if (event.isComposing || event.keyCode === 229) return;

    if (event.key === "Escape") {
      event.preventDefault();
      // 팝업이 열려 있으면 먼저 팝업만 닫고, 편집은 유지한다.
      if (!ownerPicker.hidden) closeOwnerPicker();
      else cancelEdit();
      return;
    }

    if (event.key !== "Enter") return;
    // 여러 줄 칸에서 Shift+Enter 는 저장이 아니라 줄바꿈이다(기본 동작을 그대로 둔다).
    if (event.shiftKey && event.target.tagName === "TEXTAREA") return;
    // 담당자 팝업의 체크박스에서 Enter 는 저장으로 본다(체크는 Space 로 한다).
    event.preventDefault();
    commit();
  });

  // ── 검색 (헤더 버튼) ──────────────────────────────────
  const searchBtn = $("btn-search");

  /** 입력칸을 펼치거나 접는다. 검색어가 남아 있으면 접지 않는다. */
  function toggleSearch(open) {
    const show = open ?? els.search.hidden;
    if (!show && els.search.value.trim()) return; // 필터가 걸린 상태를 숨기지 않는다
    els.search.hidden = !show;
    searchBtn.setAttribute("aria-expanded", String(show));
    if (show) els.search.focus();
  }

  searchBtn.addEventListener("click", () => toggleSearch());

  els.search.addEventListener("input", (event) => {
    search = event.target.value;
    // 검색어가 있으면 접혀 있어도 알 수 있도록 버튼을 강조한다.
    searchBtn.toggleAttribute("data-active", search.trim() !== "");
    renderTable();
  });

  els.search.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation(); // 편집 취소로 번지지 않게 한다
    els.search.value = "";
    search = "";
    searchBtn.removeAttribute("data-active");
    renderTable();
    toggleSearch(false);
    searchBtn.focus();
  });

  // 빈 상태로 포커스를 잃으면 접는다.
  els.search.addEventListener("blur", () => {
    if (!els.search.value.trim()) toggleSearch(false);
  });

  $("btn-export").addEventListener("click", exportCsv);

  // 테마 — 저장된 선택이 없으면 OS 설정을 따른다.
  $("btn-theme").addEventListener("click", () => {
    const isDark =
      document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  });

  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  else document.documentElement.removeAttribute("data-theme");

  useView(localStorage.getItem(VIEW_KEY) ?? VIEWS[0].id);
})();
