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

  /** 플랫폼 (Web / Mobile / C/S) */
  const PLATFORM_OPTIONS = ["Web", "Mobile", "C/S"];

  /** 담당자 — 1Unit 조직도. Cell 을 optgroup 으로 묶고, 개인뿐 아니라
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

  /* 시드 데이터는 팀 현황표(프로젝트/유형/주소링크/공통 반영 버전/반영 상태/작업자/
     Figma 이관 여부/비고)를 이 테이블의 컬럼에 매핑한 것이다. 매핑 규칙:
       플랫폼            ← 유형(Web/Mobile/C/S). 같은 서비스의 행을 구분하는 값이다.
       파일 유형         ← 주소링크 종류 (figma.com → Figma, 로컬 경로 → XD)
       WHDS 적용 ← 반영 상태 (완료 → 적용, 진행중 → 미적용, 해당사항 없음 → 해당 없음)
       담당자            ← 작업자
       비고              ← 원래 비고 + 이 테이블에 칸이 없는 값(공통 반영 버전 /
                          Figma 이관 필요)을 잃지 않도록 함께 적었다. */
  const FIGMA = "https://www.figma.com/design";
  const SEED = [
    { service: "WEHAGO Web 2.0 공통", platform: "Web", tool: "Figma", component: "none",
      path: `${FIGMA}/vVNdCTvO5nvN88byoPuYkV/WEHAGO-Web-2.0_DSG?m=auto&node-id=6556-35225&t=NrDWMe3BToXAjWwM-1`,
      owners: ["2Cell"], note: "" },
    { service: "WEHAGO Mobile 2.0 공통", platform: "Mobile", tool: "Figma", component: "none",
      path: `${FIGMA}/2hjgaltgwo1dIYAyMFxwDZ/WEHAGO-Mobile-2.0_DSG?m=auto&node-id=0-1&t=5WN7aFvvOpyG3MKk-1`,
      owners: ["2Cell"], note: "" },
    { service: "WEHAGO Main 1.5", platform: "Web", tool: "XD", component: "none",
      path: "XD : WEHAGO 1.0 메인_개선안(Cloud)",
      owners: ["홍길동"], note: "" },
    { service: "WEHAGO Main 2.0", platform: "Web", tool: "Figma", component: "none",
      path: `${FIGMA}/nQnqiG4WPBVxC4t38nBEW2/WEHAGO-2.0-Web-%EB%A9%94%EC%9D%B8?node-id=723-6341&t=R4SN6APFALqVIQbX-1`,
      owners: ["홍길동"], note: "" },
    { service: "WEHAGO AI Edition", platform: "Web", tool: "Figma", component: "none",
      path: `${FIGMA}/nQnqiG4WPBVxC4t38nBEW2/WEHAGO-2.0-Web-%EB%A9%94%EC%9D%B8?node-id=4028-42604&t=R4SN6APFALqVIQbX-1`,
      owners: ["홍길동"], note: "WEHAGO 2.0 Web 메인 피그마 파일에 포함" },
    { service: "WEHAGO T", platform: "Web", tool: "XD", component: "none",
      path: "XD : \\UXUI Unit\\2025\\WEHAGO T, Tedge\\작업물",
      owners: ["홍길동"], note: "" },
    { service: "WEHAGO T AI Edition", platform: "Web", tool: "Figma", component: "missing",
      path: `${FIGMA}/qmWWQbn78V9VZeya9zmFBJ/WEHAGO-T?node-id=1-32&t=pIe1aQCojb8OETiP-1`,
      owners: ["2Cell"], note: "WEHAGO T 피그마 파일에 포함 / 수임처 AI 연말정산, 수임처관리, 수임처관리 리뉴얼 버전(holding) 혼재 / WHDS W v2.0 반영 진행중" },
    { service: "ProActive AI", platform: "Web", tool: "Figma", component: "applied",
      path: `${FIGMA}/ZKzpwsavMCqZM48Mvb730d/WEHAGO-Web-Proactive-AI?node-id=1178-16981&t=3y7IUc8MEWu3EEAj-1`,
      owners: ["2Cell"], note: "WHDS 2.0 완료 이전 작업물 / WHDS W v1.0" },
    { service: "ONE AI", platform: "Web", tool: "Figma", component: "applied",
      path: `${FIGMA}/brhXNqFg9rpqSNI0yK05zM/WEHAGO-Web-ONE-AI?node-id=169-2211&t=jWIchZl5pxcl09qL-1`,
      owners: ["2Cell"], note: "WHDS 2.0 완료 이전 작업물 / WHDS W v1.0 / Figma 이관 필요" },
    { service: "ONE AI", platform: "Mobile", tool: "Figma", component: "applied",
      path: `${FIGMA}/jTkk4w5HWRH5zRrelHRKm9/WEHAGO-Mobile-ONE-AI?node-id=1-18&t=tTY327hL8syzZoxz-1`,
      owners: ["2Cell"], note: "WHDS 2.0 완료 이전 작업물 / WHDS W v1.0 / Figma 이관 필요" },
    { service: "ONE AI CUBE", platform: "Web", tool: "Figma", component: "missing",
      path: `${FIGMA}/fUfs6M2MqStNtESlVAR3p4/WEHAGO-Web-ONE-AI-CUBE?node-id=390-13900&t=J8CId3uoQkbWrSED-1`,
      owners: ["2Cell"], note: "WHDS W v2.0 반영 진행중" },
    { service: "ONE AI Flow", platform: "Web", tool: "Figma", component: "missing",
      path: `${FIGMA}/DiIjSe99UXUVDl7pgilfZy/ONE-AI-Flow?node-id=1-10&t=hPMX3yI7fEr02kOF-1`,
      owners: ["2Cell"], note: "WHDS W v2.0 반영 진행중" },
    { service: "Agent Market", platform: "Web", tool: "Figma", component: "applied",
      path: `${FIGMA}/e7cVdc0Ev8irKt8axNuzqy/Agent-Market?node-id=1-10&t=eJhSUAwnoVyY5NTX-1`,
      owners: ["2Cell"], note: "WHDS W v2.0" },
    { service: "메신저", platform: "Web", tool: "Figma", component: "applied",
      path: `${FIGMA}/wgWUkgyGkZWG7GxevnLivm/WEHAGO-Web-%EB%A9%94%EC%8B%A0%EC%A0%80-%EC%9B%B9-%EC%84%A4%EC%B9%98%ED%98%95-?node-id=4427-2&t=bKujBqg9BLqYEpyt-1`,
      owners: ["2Cell"], note: "WHDS 2.0 최종 버전으로 업데이트 필요 / WHDS W v2.0" },
    { service: "메신저", platform: "C/S", tool: "Figma", component: "applied",
      path: `${FIGMA}/wgWUkgyGkZWG7GxevnLivm/WEHAGO-Web-%EB%A9%94%EC%8B%A0%EC%A0%80-%EC%9B%B9-%EC%84%A4%EC%B9%98%ED%98%95-?node-id=4512-2363&t=bKujBqg9BLqYEpyt-1`,
      owners: ["2Cell"], note: "WEHAGO Web 메신저 피그마 파일에 포함 / WHDS 2.0 최종 버전으로 업데이트 필요 / WHDS W v2.0" },
    { service: "화상회의", platform: "Web", tool: "Figma", component: "applied",
      path: `${FIGMA}/aesogzuumvDi1EneInUZCt/WEHAGO-Web-%ED%99%94%EC%83%81%ED%9A%8C%EC%9D%98-Meet-?node-id=1-5312&t=pflCrCYHVNHPPnWo-1`,
      owners: ["2Cell"], note: "WHDS 2.0 최종 버전으로 업데이트 필요 / WHDS W v2.0" },
    { service: "화상회의", platform: "Mobile", tool: "Figma", component: "applied",
      path: `${FIGMA}/cNrqG2nLmmAt9klnanGBnl/WEHAGO-Meet-Mobile--%EB%A6%AC%EB%89%B4%EC%96%BC-?node-id=1-3063&t=NUPWIqx5l1LBcb6Z-1`,
      owners: ["2Cell"], note: "WHDS 2.0 완료 이전 작업물 / WHDS M v1.0" },
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
  /** 신규 행을 이 id 의 행 바로 뒤에 넣는다. null 이면 목록 끝에 붙인다. */
  let insertAfterId = null;

  const $ = (id) => document.getElementById(id);
  const els = {
    tbody: $("tbody"),
    empty: $("empty"),
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
        // 스키마가 바뀔 때 저장 키를 올려 데이터를 버리는 대신 옛 필드를 옮긴다.
        //   menu(자유 입력) → platform(드롭다운), owner(문자열) → owners(배열)
        if (Array.isArray(parsed) && parsed.length) {
          return parsed.map(({ menu, owner, ...row }) => ({
            ...row,
            platform: row.platform ?? menu ?? "",
            // 담당자가 한 명(문자열)에서 여러 명(배열)으로 바뀌었다.
            // Cell 이름('2Cell')이 저장돼 있으면 구성원으로 펼친다.
            owners: expandOwners(row.owners ?? (owner ? [owner] : [])),
          }));
        }
      }
    } catch {
      /* 저장값이 손상된 경우 시드 데이터로 대체한다. */
    }
    return SEED.map((row) => ({ id: uid(), ...row, owners: expandOwners(row.owners) }));
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
      return [row.service, row.platform, row.path, label?.name ?? "", (row.owners ?? []).join(" "), row.note,
              COMPONENT_LABEL[row.component], row.tool]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    if (sort.key) {
      const dir = sort.dir === "asc" ? 1 : -1;
      // 적용 상태는 가나다순이 아니라 '조치가 필요한 순서'로 정렬한다.
      const rank = { applied: 0, partial: 1, missing: 2, none: 3 };
      const sortValue = (row, key) =>
        key === "owner" ? (row.owners ?? []).join(", ") : String(row[key] ?? "");
      list = [...list].sort((a, b) => {
        const cmp =
          sort.key === "component"
            ? rank[a.component] - rank[b.component]
            : sortValue(a, sort.key).localeCompare(sortValue(b, sort.key), "ko");
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
    // 신규 행은 아직 rows 에 없으므로 화면에서만 끼워 넣는다.
    let display = list;
    if (editingId === NEW_ID) {
      const anchor = insertAfterId ? list.findIndex((r) => r.id === insertAfterId) : -1;
      const at = anchor >= 0 ? anchor + 1 : list.length;
      display = [...list.slice(0, at), { id: NEW_ID }, ...list.slice(at)];
    }

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
    syncSelectionUi();
  }

  function displayRow(row, no, continued) {
    const tr = document.createElement("tr");
    tr.append(
      checkboxCell(row.id),
      handleCell(no),
      serviceCell(row, continued),
      cell(row.platform || "—", row.platform ? "cell--center" : "cell--center cell--muted"),
      badgeCell(row.tool === "Figma" ? "figma" : "xd", row.tool, "cell--center"),
      componentCell(row.component),
      pathCell(row.path),
      cell(ownerLabel(row.owners),
        row.owners?.length ? "cell--center" : "cell--center cell--muted",
        row.owners?.join(", ")),
      // 비고는 줄바꿈되어 전체가 보이므로 title(툴팁)을 달지 않는다.
      cell(row.note || "", "cell--note"),
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
      selectCell("platform", platformOptions(), "플랫폼", "cell--center"),
      selectCell("tool", [["Figma", "Figma"], ["XD", "XD"]], "파일 유형", "cell--center"),
      selectCell("component", Object.entries(COMPONENT_LABEL), "WHDS 적용", "cell--center"),
      inputCell("path", "피그마 주소 또는 XD 경로", { className: "cell--path" }),
      ownerPickCell(),
      textareaCell("note", "비고 (Shift+Enter 로 줄 추가)"),
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
    return sort.key === null && search.trim() === "" && !filters.type && !filters.status;
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
    toast(`'${moved.service}' 순서를 옮겼습니다.`);
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

  /** 플랫폼 드롭다운 옵션.
      이 컬럼은 예전에 자유 입력('전체', '메뉴 1' 등)이었으므로, 현재 값이 표준
      옵션에 없으면 그 값도 옵션에 넣는다. 그러지 않으면 편집만 해도 값이 조용히
      Web 으로 바뀌어 버린다. */
  /** 편집 행의 담당자 칸. 셀 전체가 선택 팝업을 여는 버튼이다. */
  function ownerPickCell() {
    const td = document.createElement("td");
    td.className = "cell--center";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "owner-pick";
    btn.dataset.ownerPick = "true";
    btn.setAttribute("aria-label", "담당자 선택");
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

  function platformOptions() {
    const current = draft?.platform;
    const values = PLATFORM_OPTIONS.includes(current) || !current
      ? PLATFORM_OPTIONS
      : [...PLATFORM_OPTIONS, current];
    return values.map((value) => [value, value]);
  }

  function selectCell(name, options, label, className) {
    const td = document.createElement("td");
    if (className) td.className = className;
    const select = document.createElement("select");
    select.className = "input--cell";
    select.name = name;
    select.setAttribute("aria-label", label);
    const build = (value, text) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      if (draft[name] === value) option.selected = true;
      return option;
    };

    // options 는 [value, label] 쌍이거나 { group, values } (optgroup) 이다.
    for (const entry of options) {
      if (entry.group) {
        const group = document.createElement("optgroup");
        group.label = entry.group;
        for (const value of entry.values) group.append(build(value, value));
        select.append(group);
      } else {
        select.append(build(entry[0], entry[1]));
      }
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

  function startCreate(afterId) {
    editingId = NEW_ID;
    insertAfterId = afterId ?? null;
    draft = { service: "", platform: PLATFORM_OPTIONS[0], tool: "Figma",
              component: "applied", path: "", owners: [], note: "" };
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
    } else if (field.tagName === "SELECT") {
      /* 클릭으로 들어왔으면 목록을 바로 펼친다. showPicker 는 사용자 제스처
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
    const service = (draft.service || "").trim();
    if (!service) {
      toast("서비스명을 입력해 주세요.");
      els.tbody.querySelector('tr[data-editing] input[name="service"]')?.focus();
      return false;
    }

    const next = {
      service,
      platform: draft.platform || PLATFORM_OPTIONS[0],
      tool: draft.tool || "Figma",
      component: draft.component || "applied",
      path: (draft.path || "").trim(),
      owners: expandOwners(draft.owners),
      note: (draft.note || "").trim(),
    };

    if (editingId === NEW_ID) {
      const row = { id: uid(), ...next };
      const anchor = insertAfterId ? rows.findIndex((r) => r.id === insertAfterId) : -1;
      rows.splice(anchor >= 0 ? anchor + 1 : rows.length, 0, row);
      toast(`'${service}' 항목을 추가했습니다.`);
    } else {
      const i = rows.findIndex((r) => r.id === editingId);
      rows[i] = { ...rows[i], ...next };
      toast(`'${service}' 항목을 수정했습니다.`);
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

  /** 주어진 id 들의 행을 삭제한다. 툴바 삭제와 우클릭 삭제가 함께 쓴다. */
  function removeRows(ids) {
    const targets = rows.filter((r) => ids.has(r.id));
    if (!targets.length) return;

    const label = targets.length === 1 ? `'${targets[0].service}' 항목을` : `선택한 ${targets.length}건을`;
    if (!confirm(`${label} 삭제할까요?`)) return;

    rows = rows.filter((r) => !ids.has(r.id));
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
    const head = ["No", "서비스명", "플랫폼", "파일 유형", "WHDS 적용", "파일 경로", "담당자", "비고"];
    const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
    const list = visibleRows();
    const body = list.map((row, i) =>
      [i + 1, row.service, row.platform, row.tool, COMPONENT_LABEL[row.component], row.path, (row.owners ?? []).join(", "), row.note]
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
  document.querySelector(".table-wrap").addEventListener("scroll", closeRowMenu);

  for (const btn of document.querySelectorAll('[data-action="add"]')) {
    // startCreate 를 그대로 넘기면 click 이벤트가 afterId 인자로 들어간다.
    btn.addEventListener("click", () => startCreate());
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

  // Enter 로 저장, Esc 로 취소
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
    // 비고에서 Shift+Enter 는 저장이 아니라 줄바꿈이다(기본 동작을 그대로 둔다).
    if (event.shiftKey && event.target.name === "note") return;
    // 담당자 팝업의 체크박스에서 Enter 는 저장으로 본다(체크는 Space 로 한다).
    event.preventDefault();
    commit();
  });

  els.search.addEventListener("input", (event) => {
    search = event.target.value;
    renderTable();
  });

  for (const th of document.querySelectorAll(".th-sort")) {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      // 오름 → 내림 → 해제 순으로 돌린다. 정렬을 해제해야 행 순서를 직접 바꿀 수 있다.
      if (sort.key !== key) sort = { key, dir: "asc" };
      else if (sort.dir === "asc") sort = { key, dir: "desc" };
      else sort = { key: null, dir: "asc" };

      for (const other of document.querySelectorAll(".th-sort")) delete other.dataset.dir;
      if (sort.key) th.dataset.dir = sort.dir;
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
