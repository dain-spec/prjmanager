/* WEHAGO 팀 작업물 현황 — 상태 관리 / 렌더링
   추가·수정은 별도 다이얼로그 없이 테이블 행 안에서 바로 처리한다.
   데이터는 localStorage 에 저장되므로 새로고침해도 유지된다. */
(() => {
  "use strict";

  const STORAGE_KEY = "wehago-prj-manager/rows/v1";
  const THEME_KEY = "wehago-prj-manager/theme";

  /** 신규 행(아직 저장되지 않은 행)에 쓰는 임시 id */
  const NEW_ID = "__new__";

  /** 공통 컴포넌트 적용 상태 라벨 */
  const COMPONENT_LABEL = {
    applied: "적용",
    missing: "미적용",
    partial: "메뉴별 상이",
    none: "해당 없음",
  };

  /** 적용률 계산 대상 — '해당 없음'은 분모에서 제외한다. */
  const RATE_TARGET = ["applied", "missing", "partial"];

  /** 휴지통 아이콘 path (viewBox 16×16) */
  const ICON_TRASH = [
    "M2.5 4.5h11",
    "M6.5 4.5V3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1.5",
    "M4 4.5l.6 8a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8",
    "M6.8 7.2v3.6",
    "M9.2 7.2v3.6",
  ];

  const SEED = [
    { service: "회계관리",   menu: "전체",       tool: "Figma", component: "applied", path: "Figma > WEHAGO > 회계관리",            note: "전체 메뉴 동일 컴포넌트 사용" },
    { service: "회계관리",   menu: "전표입력",   tool: "Figma", component: "applied", path: "Figma > WEHAGO > 회계관리 > 전표입력", note: "2026-07 최신화" },
    { service: "인사관리",   menu: "메뉴 1",     tool: "Figma", component: "missing", path: "Figma > WEHAGO > 인사관리",            note: "공통 컴포넌트 교체 예정" },
    { service: "인사관리",   menu: "메뉴 2",     tool: "XD",    component: "none",    path: "XD > 인사관리_메뉴2.xd",               note: "XD 원본 파일 (컴포넌트 해당 없음)" },
    { service: "급여관리",   menu: "전체",       tool: "XD",    component: "none",    path: "XD > 급여관리.xd",                     note: "Figma 이관 대기" },
    { service: "전자세금계산서", menu: "전체",   tool: "Figma", component: "partial", path: "Figma > WEHAGO > 전자세금계산서",      note: "메뉴별 적용 여부 상이" },
    { service: "자산관리",   menu: "전체",       tool: "Figma", component: "applied", path: "Figma > WEHAGO > 자산관리",            note: "" },
    { service: "그룹웨어",   menu: "메일",       tool: "Figma", component: "applied", path: "Figma > WEHAGO > 그룹웨어 > 메일",     note: "" },
    { service: "그룹웨어",   menu: "결재",       tool: "Figma", component: "missing", path: "Figma > WEHAGO > 그룹웨어 > 결재",     note: "레거시 컴포넌트 잔존" },
    { service: "영업관리",   menu: "전체",       tool: "XD",    component: "none",    path: "XD > 영업관리.xd",                     note: "" },
  ];

  // ── 상태 ────────────────────────────────────────────────

  let rows = load();
  const filters = { tool: null, component: null };
  let search = "";
  let sort = { key: null, dir: "asc" };

  /** 편집 중인 행 id (신규는 NEW_ID). null 이면 편집 중이 아니다. */
  let editingId = null;
  /** 편집 중 입력값. 입력 즉시 여기에 반영되므로 재렌더링에도 값이 남는다. */
  let draft = null;

  const $ = (id) => document.getElementById(id);
  const els = {
    tbody: $("tbody"),
    empty: $("empty"),
    rowCount: $("row-count"),
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
      return [row.service, row.menu, row.path, row.note, COMPONENT_LABEL[row.component], row.tool]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    if (sort.key) {
      const dir = sort.dir === "asc" ? 1 : -1;
      const rank = { applied: 0, partial: 1, missing: 2, none: 3 };
      list = [...list].sort((a, b) => {
        let cmp;
        if (sort.key === "component") {
          cmp = rank[a.component] - rank[b.component];
        } else {
          cmp = String(a[sort.key]).localeCompare(String(b[sort.key]), "ko");
        }
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
  }

  function displayRow(row, no, continued) {
    const tr = document.createElement("tr");
    tr.append(
      cell(String(no), "cell--no"),
      serviceCell(row, continued),
      cell(row.menu || "—", row.menu ? "" : "cell--muted"),
      badgeCell(row.tool === "Figma" ? "figma" : "xd", row.tool),
      componentCell(row.component),
      cell(row.path || "—", row.path ? "cell--path" : "cell--muted", row.path),
      cell(row.note || "", "cell--note", row.note),
      actionCell([
        // 수정은 행 hover(또는 포커스) 시에만 노출된다.
        { label: "수정", action: "edit", cls: "btn--ghost row-action--hover" },
        { label: "삭제", action: "delete", cls: "btn--ghost btn--icon-small btn--delete", icon: ICON_TRASH },
      ], row.id),
    );
    return tr;
  }

  /** 편집 행 — 각 칸을 입력 컨트롤로 바꾼다. */
  function editRow(no) {
    const tr = document.createElement("tr");
    tr.dataset.editing = "true";

    tr.append(
      cell(editingId === NEW_ID ? "신규" : String(no), "cell--no"),
      inputCell("service", "서비스명", { required: true }),
      inputCell("menu", "메뉴명 (전체일 경우 '전체')"),
      selectCell("tool", [["Figma", "Figma"], ["XD", "XD"]]),
      selectCell("component", Object.entries(COMPONENT_LABEL)),
      inputCell("path", "파일 경로", { className: "cell--path" }),
      inputCell("note", "비고", { className: "cell--note" }),
      actionCell([
        { label: "저장", action: "save", cls: "btn--primary" },
        { label: "취소", action: "cancel", cls: "btn--ghost" },
      ]),
    );
    return tr;
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
    input.className = "input input--cell";
    input.name = name;
    input.value = draft[name] ?? "";
    input.placeholder = placeholder;
    input.maxLength = name === "note" || name === "path" ? 300 : 60;
    if (required) input.required = true;
    input.setAttribute("aria-label", placeholder);
    td.append(input);
    return td;
  }

  function selectCell(name, options) {
    const td = document.createElement("td");
    const select = document.createElement("select");
    select.className = "input input--cell";
    select.name = name;
    select.setAttribute("aria-label", name === "tool" ? "파일 유형" : "공통 컴포넌트 적용");
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

  function badgeCell(kind, label) {
    const td = document.createElement("td");
    const span = document.createElement("span");
    span.className = `badge badge--${kind}`;
    span.textContent = label;
    td.append(span);
    return td;
  }

  function componentCell(value) {
    if (value === "none") return cell("해당 없음", "cell--muted");
    return badgeCell(value, COMPONENT_LABEL[value]);
  }

  function actionCell(buttons, id) {
    const td = document.createElement("td");
    td.className = "cell--center";
    const wrap = document.createElement("div");
    wrap.className = "cell-actions";
    for (const { label, action, cls, icon } of buttons) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn btn--small ${cls}`;
      btn.dataset.action = action;
      if (id) btn.dataset.id = id;
      if (icon) {
        // 아이콘만 있는 버튼은 이름을 읽을 수 없으므로 aria-label 과 툴팁을 준다.
        btn.append(svgIcon(icon));
        btn.setAttribute("aria-label", label);
        btn.title = label;
      } else {
        btn.textContent = label;
      }
      wrap.append(btn);
    }
    td.append(wrap);
    return td;
  }

  function svgIcon(paths) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    for (const d of paths) {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  }

  function render() {
    renderStats();
    renderTable();
  }

  // ── 편집 동작 ───────────────────────────────────────────

  function startEdit(id) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    editingId = id;
    draft = { ...row };
    renderTable();
    focusFirstField();
  }

  function startCreate() {
    editingId = NEW_ID;
    draft = { service: "", menu: "", tool: "Figma", component: "applied", path: "", note: "" };
    renderTable();
    focusFirstField();
  }

  function focusFirstField() {
    const input = els.tbody.querySelector('tr[data-editing] input[name="service"]');
    if (!input) return;
    input.focus();
    input.closest("tr").scrollIntoView({ block: "nearest" });
  }

  function commit() {
    const service = (draft.service || "").trim();
    if (!service) {
      toast("서비스명을 입력해 주세요.");
      els.tbody.querySelector('tr[data-editing] input[name="service"]')?.focus();
      return;
    }

    const next = {
      service,
      menu: (draft.menu || "").trim(),
      tool: draft.tool || "Figma",
      component: draft.component || "applied",
      path: (draft.path || "").trim(),
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
  }

  function cancelEdit() {
    editingId = null;
    draft = null;
    renderTable();
  }

  function remove(id) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (!confirm(`'${row.service}' 항목을 삭제할까요?`)) return;
    rows = rows.filter((r) => r.id !== id);
    if (editingId === id) {
      editingId = null;
      draft = null;
    }
    save();
    render();
    toast("항목을 삭제했습니다.");
  }

  // ── CSV 내보내기 ────────────────────────────────────────

  function exportCsv() {
    const head = ["No", "서비스명", "메뉴명", "파일 유형", "공통 컴포넌트 적용", "파일 경로", "비고"];
    const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
    const list = visibleRows();
    const body = list.map((row, i) =>
      [i + 1, row.service, row.menu, row.tool, COMPONENT_LABEL[row.component], row.path, row.note]
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
    if (field && draft) draft[field.name] = field.value;
  });
  els.tbody.addEventListener("change", (event) => {
    const field = event.target.closest("[name]");
    if (field && draft) draft[field.name] = field.value;
  });

  els.tbody.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === "edit") startEdit(id);
    else if (action === "delete") remove(id);
    else if (action === "save") commit();
    else if (action === "cancel") cancelEdit();
  });

  // Enter 로 저장, Esc 로 취소
  els.tbody.addEventListener("keydown", (event) => {
    if (!editingId) return;
    if (event.key === "Enter") {
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

  for (const chip of document.querySelectorAll(".chip")) {
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => {
      const { filter, value } = chip.dataset;
      // 같은 칩을 다시 누르면 해제, 같은 그룹의 다른 칩을 누르면 교체
      filters[filter] = filters[filter] === value ? null : value;
      syncChips();
      renderTable();
    });
  }

  function syncChips() {
    for (const chip of document.querySelectorAll(".chip")) {
      const active = filters[chip.dataset.filter] === chip.dataset.value;
      chip.setAttribute("aria-pressed", String(active));
    }
  }

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
