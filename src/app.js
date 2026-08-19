/* WEHAGO 팀 작업물 현황 — 상태 관리 / 렌더링
   추가·수정은 별도 다이얼로그 없이 테이블 행 안에서 바로 처리한다.
   데이터는 localStorage 에 저장되므로 새로고침해도 유지된다. */
(() => {
  "use strict";

  /* 담당자 컬럼이 추가되어 스키마가 바뀌었으므로 키를 v2 로 올린다. */
  const STORAGE_KEY = "wehago-prj-manager/rows/v2";
  const THEME_KEY = "wehago-prj-manager/theme";

  /** 신규 행(아직 저장되지 않은 행)에 쓰는 임시 id */
  const NEW_ID = "__new__";

  /** WHDS 적용 상태 라벨 */
  const COMPONENT_LABEL = {
    applied: "적용",
    missing: "미적용",
    partial: "메뉴별 상이",
    none: "해당 없음",
  };

  /** 적용률 계산 대상 — '해당 없음'은 분모에서 제외한다. */
  const RATE_TARGET = ["applied", "missing", "partial"];

  /* 시드 데이터는 팀 현황표(프로젝트/유형/주소링크/공통 반영 버전/반영 상태/작업자/
     Figma 이관 여부/비고)를 이 테이블의 컬럼에 매핑한 것이다. 매핑 규칙:
       메뉴명            ← 유형(Web/Mobile/C/S). 같은 서비스의 행을 구분하는 값이다.
       파일 유형         ← 주소링크 종류 (figma.com → Figma, 로컬 경로 → XD)
       WHDS 적용 ← 반영 상태 (완료 → 적용, 진행중 → 미적용, 해당사항 없음 → 해당 없음)
       담당자            ← 작업자
       비고              ← 원래 비고 + 이 테이블에 칸이 없는 값(공통 반영 버전 /
                          Figma 이관 필요)을 잃지 않도록 함께 적었다. */
  const FIGMA = "https://www.figma.com/design";
  const SEED = [
    { service: "WEHAGO Web 2.0 공통", menu: "Web", tool: "Figma", component: "none",
      path: `${FIGMA}/vVNdCTvO5nvN88byoPuYkV/WEHAGO-Web-2.0_DSG?m=auto&node-id=6556-35225&t=NrDWMe3BToXAjWwM-1`,
      owner: "2Cell", note: "" },
    { service: "WEHAGO Mobile 2.0 공통", menu: "Mobile", tool: "Figma", component: "none",
      path: `${FIGMA}/2hjgaltgwo1dIYAyMFxwDZ/WEHAGO-Mobile-2.0_DSG?m=auto&node-id=0-1&t=5WN7aFvvOpyG3MKk-1`,
      owner: "2Cell", note: "" },
    { service: "WEHAGO Main 1.5", menu: "Web", tool: "XD", component: "none",
      path: "XD : WEHAGO 1.0 메인_개선안(Cloud)",
      owner: "홍길동", note: "" },
    { service: "WEHAGO Main 2.0", menu: "Web", tool: "Figma", component: "none",
      path: `${FIGMA}/nQnqiG4WPBVxC4t38nBEW2/WEHAGO-2.0-Web-%EB%A9%94%EC%9D%B8?node-id=723-6341&t=R4SN6APFALqVIQbX-1`,
      owner: "홍길동", note: "" },
    { service: "WEHAGO AI Edition", menu: "Web", tool: "Figma", component: "none",
      path: `${FIGMA}/nQnqiG4WPBVxC4t38nBEW2/WEHAGO-2.0-Web-%EB%A9%94%EC%9D%B8?node-id=4028-42604&t=R4SN6APFALqVIQbX-1`,
      owner: "홍길동", note: "WEHAGO 2.0 Web 메인 피그마 파일에 포함" },
    { service: "WEHAGO T", menu: "Web", tool: "XD", component: "none",
      path: "XD : \\UXUI Unit\\2025\\WEHAGO T, Tedge\\작업물",
      owner: "홍길동", note: "" },
    { service: "WEHAGO T AI Edition", menu: "Web", tool: "Figma", component: "missing",
      path: `${FIGMA}/qmWWQbn78V9VZeya9zmFBJ/WEHAGO-T?node-id=1-32&t=pIe1aQCojb8OETiP-1`,
      owner: "2Cell", note: "WEHAGO T 피그마 파일에 포함 / 수임처 AI 연말정산, 수임처관리, 수임처관리 리뉴얼 버전(holding) 혼재 / WHDS W v2.0 반영 진행중" },
    { service: "ProActive AI", menu: "Web", tool: "Figma", component: "applied",
      path: `${FIGMA}/ZKzpwsavMCqZM48Mvb730d/WEHAGO-Web-Proactive-AI?node-id=1178-16981&t=3y7IUc8MEWu3EEAj-1`,
      owner: "2Cell", note: "WHDS 2.0 완료 이전 작업물 / WHDS W v1.0" },
    { service: "ONE AI", menu: "Web", tool: "Figma", component: "applied",
      path: `${FIGMA}/brhXNqFg9rpqSNI0yK05zM/WEHAGO-Web-ONE-AI?node-id=169-2211&t=jWIchZl5pxcl09qL-1`,
      owner: "2Cell", note: "WHDS 2.0 완료 이전 작업물 / WHDS W v1.0 / Figma 이관 필요" },
    { service: "ONE AI", menu: "Mobile", tool: "Figma", component: "applied",
      path: `${FIGMA}/jTkk4w5HWRH5zRrelHRKm9/WEHAGO-Mobile-ONE-AI?node-id=1-18&t=tTY327hL8syzZoxz-1`,
      owner: "2Cell", note: "WHDS 2.0 완료 이전 작업물 / WHDS W v1.0 / Figma 이관 필요" },
    { service: "ONE AI CUBE", menu: "Web", tool: "Figma", component: "missing",
      path: `${FIGMA}/fUfs6M2MqStNtESlVAR3p4/WEHAGO-Web-ONE-AI-CUBE?node-id=390-13900&t=J8CId3uoQkbWrSED-1`,
      owner: "2Cell", note: "WHDS W v2.0 반영 진행중" },
    { service: "ONE AI Flow", menu: "Web", tool: "Figma", component: "missing",
      path: `${FIGMA}/DiIjSe99UXUVDl7pgilfZy/ONE-AI-Flow?node-id=1-10&t=hPMX3yI7fEr02kOF-1`,
      owner: "2Cell", note: "WHDS W v2.0 반영 진행중" },
    { service: "Agent Market", menu: "Web", tool: "Figma", component: "applied",
      path: `${FIGMA}/e7cVdc0Ev8irKt8axNuzqy/Agent-Market?node-id=1-10&t=eJhSUAwnoVyY5NTX-1`,
      owner: "2Cell", note: "WHDS W v2.0" },
    { service: "메신저", menu: "Web", tool: "Figma", component: "applied",
      path: `${FIGMA}/wgWUkgyGkZWG7GxevnLivm/WEHAGO-Web-%EB%A9%94%EC%8B%A0%EC%A0%80-%EC%9B%B9-%EC%84%A4%EC%B9%98%ED%98%95-?node-id=4427-2&t=bKujBqg9BLqYEpyt-1`,
      owner: "2Cell", note: "WHDS 2.0 최종 버전으로 업데이트 필요 / WHDS W v2.0" },
    { service: "메신저", menu: "C/S", tool: "Figma", component: "applied",
      path: `${FIGMA}/wgWUkgyGkZWG7GxevnLivm/WEHAGO-Web-%EB%A9%94%EC%8B%A0%EC%A0%80-%EC%9B%B9-%EC%84%A4%EC%B9%98%ED%98%95-?node-id=4512-2363&t=bKujBqg9BLqYEpyt-1`,
      owner: "2Cell", note: "WEHAGO Web 메신저 피그마 파일에 포함 / WHDS 2.0 최종 버전으로 업데이트 필요 / WHDS W v2.0" },
    { service: "화상회의", menu: "Web", tool: "Figma", component: "applied",
      path: `${FIGMA}/aesogzuumvDi1EneInUZCt/WEHAGO-Web-%ED%99%94%EC%83%81%ED%9A%8C%EC%9D%98-Meet-?node-id=1-5312&t=pflCrCYHVNHPPnWo-1`,
      owner: "2Cell", note: "WHDS 2.0 최종 버전으로 업데이트 필요 / WHDS W v2.0" },
    { service: "화상회의", menu: "Mobile", tool: "Figma", component: "applied",
      path: `${FIGMA}/cNrqG2nLmmAt9klnanGBnl/WEHAGO-Meet-Mobile--%EB%A6%AC%EB%89%B4%EC%96%BC-?node-id=1-3063&t=NUPWIqx5l1LBcb6Z-1`,
      owner: "2Cell", note: "WHDS 2.0 완료 이전 작업물 / WHDS M v1.0" },
  ];

  // ── 상태 ────────────────────────────────────────────────

  let rows = load();
  /* 파일 유형 / WHDS 적용 필터. 필터 칩 UI 는 제거된 상태이며
     visibleRows() 의 필터 로직은 향후 UI 를 다시 붙일 때를 위해 남겨둔다. */
  const filters = { tool: null, component: null };
  let search = "";
  let sort = { key: null, dir: "asc" };

  /** 체크박스로 선택된 행 id 집합 */
  const selected = new Set();

  /** 편집 중인 행 id (신규는 NEW_ID). null 이면 편집 중이 아니다. */
  let editingId = null;
  /** 편집 중 입력값. 입력 즉시 여기에 반영되므로 재렌더링에도 값이 남는다. */
  let draft = null;

  const $ = (id) => document.getElementById(id);
  const els = {
    tbody: $("tbody"),
    empty: $("empty"),
    rowCount: $("row-count"),
    selectionCount: $("selection-count"),
    checkAll: $("check-all"),
    search: $("search"),
    toast: $("toast"),
  };

  function uid() {
    return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {
      /* 저장값이 손상된 경우 시드 데이터로 대체한다. */
    }
    return SEED.map((row) => ({ id: uid(), ...row }));
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch {
      toast("브라우저 저장 공간에 기록하지 못했습니다.");
    }
  }

  // ── 파생 데이터 ─────────────────────────────────────────

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

  function visibleRows() {
    const q = search.trim().toLowerCase();
    let list = rows.filter((row) => {
      // 편집 중인 행은 필터/검색으로 사라지지 않게 항상 남긴다.
      if (row.id === editingId) return true;
      if (filters.tool && row.tool !== filters.tool) return false;
      if (filters.component && row.component !== filters.component) return false;
      if (!q) return true;
      // 화면에는 디코딩된 파일명이 보이는데 row.path 는 퍼센트 인코딩 상태다.
      // 보이는 그대로 검색되도록 디코딩된 라벨도 대상에 넣는다.
      const label = figmaLabel(row.path);
      return [row.service, row.menu, row.path, label?.name ?? "", row.owner, row.note,
              COMPONENT_LABEL[row.component], row.tool]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    if (sort.key) {
      const dir = sort.dir === "asc" ? 1 : -1;
      // 적용 상태는 가나다순이 아니라 '조치가 필요한 순서'로 정렬한다.
      const rank = { applied: 0, partial: 1, missing: 2, none: 3 };
      list = [...list].sort((a, b) => {
        const cmp =
          sort.key === "component"
            ? rank[a.component] - rank[b.component]
            : String(a[sort.key] ?? "").localeCompare(String(b[sort.key] ?? ""), "ko");
        return cmp * dir;
      });
    }
    return list;
  }

  // ── 렌더링 ──────────────────────────────────────────────

  function renderStats() {
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
    // 신규 행은 아직 rows 에 없으므로 목록 끝에 붙여 보여준다.
    const display = editingId === NEW_ID ? [...list, { id: NEW_ID }] : list;

    els.tbody.replaceChildren();

    let prevService = null;
    display.forEach((row, index) => {
      if (row.id === editingId) {
        els.tbody.append(editRow(index + 1));
        prevService = null; // 편집 행 다음 행은 서비스명을 다시 표시한다.
        return;
      }
      const tr = displayRow(row, index + 1, row.service === prevService);
      prevService = row.service;
      els.tbody.append(tr);
    });

    els.empty.hidden = display.length > 0;
    els.rowCount.textContent =
      list.length === rows.length ? `${rows.length}건` : `${list.length}건 / 전체 ${rows.length}건`;
    syncSelectionUi();
  }

  function displayRow(row, no, continued) {
    const tr = document.createElement("tr");
    tr.append(
      checkboxCell(row.id),
      cell(String(no), "cell--no cell--center"),
      serviceCell(row, continued),
      cell(row.menu || "—", row.menu ? "cell--center" : "cell--center cell--muted"),
      badgeCell(row.tool === "Figma" ? "figma" : "xd", row.tool, "cell--center"),
      componentCell(row.component),
      pathCell(row.path),
      cell(row.owner || "—", row.owner ? "cell--center" : "cell--center cell--muted", row.owner),
      cell(row.note || "", "cell--note", row.note),
    );
    if (selected.has(row.id)) tr.dataset.selected = "true";
    return tr;
  }

  /** 편집 행 — 각 칸을 입력 컨트롤로 바꾼다. */
  function editRow(no) {
    const tr = document.createElement("tr");
    tr.dataset.editing = "true";

    tr.append(
      // 편집 중인 행은 선택 대상이 아니므로 체크박스 없이 칸만 맞춘다.
      cell("", "cell--check"),
      cell(editingId === NEW_ID ? "신규" : String(no), "cell--no cell--center"),
      inputCell("service", "서비스명", { required: true }),
      inputCell("menu", "메뉴명", { className: "cell--center" }),
      selectCell("tool", [["Figma", "Figma"], ["XD", "XD"]], "파일 유형", "cell--center"),
      selectCell("component", Object.entries(COMPONENT_LABEL), "WHDS 적용", "cell--center"),
      inputCell("path", "피그마 주소 또는 XD 경로", { className: "cell--path" }),
      inputCell("owner", "담당자", { className: "cell--center" }),
      textareaCell("note", "비고 (Shift+Enter 로 줄 추가)"),
    );
    return tr;
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
  function pathCell(value) {
    if (!value) return cell("—", "cell--muted");
    if (!/^https?:\/\//.test(value)) return cell(value, "cell--path", value);

    const td = document.createElement("td");
    td.className = "cell--path";
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

  function componentCell(value) {
    if (value === "none") return cell("해당 없음", "cell--center cell--muted");
    return badgeCell(value, COMPONENT_LABEL[value], "cell--center");
  }

  function cell(text, className, title) {
    const td = document.createElement("td");
    if (className) td.className = className;
    // 한 줄로 잘리는 칸은 전체 내용을 title 로 남긴다.
    if (title) td.title = title;
    td.textContent = text;
    return td;
  }

  function inputCell(name, placeholder, { required = false, className = "" } = {}) {
    const td = document.createElement("td");
    if (className) td.className = className;
    const input = document.createElement("input");
    input.className = "input--cell";
    input.name = name;
    input.value = draft[name] ?? "";
    input.placeholder = placeholder;
    input.maxLength = name === "note" || name === "path" ? 500 : 60;
    if (required) input.required = true;
    input.setAttribute("aria-label", placeholder);
    td.append(input);
    return td;
  }

  /** 비고 — Shift+Enter 로 줄을 추가할 수 있도록 textarea 를 쓴다. */
  function textareaCell(name, placeholder) {
    const td = document.createElement("td");
    td.className = "cell--note";
    const area = document.createElement("textarea");
    area.className = "input--cell";
    area.name = name;
    area.rows = 1;
    area.value = draft[name] ?? "";
    area.placeholder = placeholder;
    area.maxLength = 500;
    area.setAttribute("aria-label", placeholder);
    td.append(area);
    // 렌더 직후에는 아직 레이아웃 전이라 scrollHeight 가 0 이므로 다음 프레임에 맞춘다.
    requestAnimationFrame(() => autoGrow(area));
    return td;
  }

  /** 내용에 맞춰 textarea 높이를 늘린다. 그 행만 40px 보다 커진다. */
  function autoGrow(area) {
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }

  function selectCell(name, options, label, className) {
    const td = document.createElement("td");
    if (className) td.className = className;
    const select = document.createElement("select");
    select.className = "input--cell";
    select.name = name;
    select.setAttribute("aria-label", label);
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      if (draft[name] === value) option.selected = true;
      select.append(option);
    }
    td.append(select);
    return td;
  }

  function serviceCell(row, continued) {
    const td = cell(continued ? "↳ 동일 서비스" : row.service, "cell--service");
    if (continued) {
      td.dataset.continued = "true";
      td.title = row.service;
    }
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
    draft = { ...row };
    renderTable();
    syncToolbar();
    focusCell(columnIndex);
  }

  function startCreate() {
    editingId = NEW_ID;
    draft = { service: "", menu: "", tool: "Figma", component: "applied", path: "", owner: "", note: "" };
    renderTable();
    syncToolbar();
    focusCell();
  }

  /** 편집 행에서 columnIndex 번째 칸에 포커스한다. 없으면 첫 입력 칸으로. */
  function focusCell(columnIndex) {
    const tr = els.tbody.querySelector("tr[data-editing]");
    if (!tr) return;
    const field =
      (columnIndex !== undefined && tr.children[columnIndex]?.querySelector("[name]")) ||
      tr.querySelector("[name]");
    if (!field) return;
    field.focus();
    // 클릭으로 들어왔을 때 기존 값이 통째로 지워지지 않도록 커서를 끝에 둔다.
    if (field.setSelectionRange && field.type !== "checkbox") {
      const end = field.value.length;
      field.setSelectionRange(end, end);
    }
    tr.scrollIntoView({ block: "nearest" });
  }

  function commit() {
    const service = (draft.service || "").trim();
    if (!service) {
      toast("서비스명을 입력해 주세요.");
      els.tbody.querySelector('tr[data-editing] input[name="service"]')?.focus();
      return false;
    }

    const next = {
      service,
      menu: (draft.menu || "").trim(),
      tool: draft.tool || "Figma",
      component: draft.component || "applied",
      path: (draft.path || "").trim(),
      owner: (draft.owner || "").trim(),
      note: (draft.note || "").trim(),
    };

    if (editingId === NEW_ID) {
      rows.push({ id: uid(), ...next });
      toast(`'${service}' 항목을 추가했습니다.`);
    } else {
      const i = rows.findIndex((r) => r.id === editingId);
      rows[i] = { ...rows[i], ...next };
      toast(`'${service}' 항목을 수정했습니다.`);
    }

    editingId = null;
    draft = null;
    save();
    render();
    return true;
  }

  function cancelEdit() {
    editingId = null;
    draft = null;
    renderTable();
    syncToolbar();
  }

  /** 선택된 행들을 한 번에 삭제한다. */
  function removeSelected() {
    const targets = rows.filter((r) => selected.has(r.id));
    if (!targets.length) return;

    const label = targets.length === 1 ? `'${targets[0].service}' 항목을` : `선택한 ${targets.length}건을`;
    if (!confirm(`${label} 삭제할까요?`)) return;

    rows = rows.filter((r) => !selected.has(r.id));
    if (editingId && selected.has(editingId)) {
      editingId = null;
      draft = null;
    }
    const count = targets.length;
    selected.clear();
    save();
    render();
    toast(`${count}건을 삭제했습니다.`);
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

  /** 선택 표시(행 배경·헤더 체크박스)와 툴바를 현재 상태에 맞춘다. */
  function syncSelectionUi() {
    for (const box of els.tbody.querySelectorAll("[data-check]")) {
      box.closest("tr").toggleAttribute("data-selected", box.checked);
    }
    const visible = visibleRows().map((r) => r.id);
    const picked = visible.filter((id) => selected.has(id)).length;
    els.checkAll.checked = visible.length > 0 && picked === visible.length;
    // 일부만 선택된 상태는 indeterminate 로 표시한다.
    els.checkAll.indeterminate = picked > 0 && picked < visible.length;
    syncToolbar();
  }

  /** 툴바 버튼 표시 — 기본 / 선택 / 편집 세 가지 상태가 있다. */
  function syncToolbar() {
    const editing = editingId !== null;
    const count = selected.size;
    const show = (el, on) => el.toggleAttribute("hidden", !on);

    show(els.selectionCount, !editing && count > 0);
    show($("btn-delete-selected"), !editing && count > 0);

    show($("btn-save"), editing);
    show($("btn-cancel"), editing);

    // 편집 중이거나 선택 중에는 '추가'를 숨겨 동작이 섞이지 않게 한다.
    show(document.querySelector('[data-action="add"]'), !editing && count === 0);

    els.selectionCount.textContent = `${count}개 선택`;
  }

  // ── CSV 내보내기 ────────────────────────────────────────

  function exportCsv() {
    const head = ["No", "서비스명", "메뉴명", "파일 유형", "WHDS 적용", "파일 경로", "담당자", "비고"];
    const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
    const list = visibleRows();
    const body = list.map((row, i) =>
      [i + 1, row.service, row.menu, row.tool, COMPONENT_LABEL[row.component], row.path, row.owner, row.note]
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
    a.download = "wehago-작업물-현황.csv";
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

  for (const btn of document.querySelectorAll('[data-action="add"]')) {
    btn.addEventListener("click", startCreate);
  }

  // 편집 행 입력값을 즉시 draft 에 반영해 재렌더링에도 값이 유지되게 한다.
  els.tbody.addEventListener("input", (event) => {
    const field = event.target.closest("[name]");
    if (!field || !draft) return;
    draft[field.name] = field.value;
    if (field.tagName === "TEXTAREA") autoGrow(field);
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

  els.checkAll.addEventListener("change", (event) => toggleSelectAll(event.target.checked));

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

  // Enter 로 저장, Esc 로 취소
  els.tbody.addEventListener("keydown", (event) => {
    if (!editingId) return;
    if (event.key === "Enter") {
      // 비고에서 Shift+Enter 는 저장이 아니라 줄바꿈이다(기본 동작을 그대로 둔다).
      if (event.shiftKey && event.target.name === "note") return;
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  });

  els.search.addEventListener("input", (event) => {
    search = event.target.value;
    renderTable();
  });

  for (const th of document.querySelectorAll(".th-sort")) {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      sort = sort.key === key && sort.dir === "asc" ? { key, dir: "desc" } : { key, dir: "asc" };
      for (const other of document.querySelectorAll(".th-sort")) delete other.dataset.dir;
      th.dataset.dir = sort.dir;
      renderTable();
    });
  }

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

  const saved = localStorage.getItem(THEME_KEY);
  if (saved) document.documentElement.dataset.theme = saved;
  else document.documentElement.removeAttribute("data-theme");

  render();
})();
