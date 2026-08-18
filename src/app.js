/* WEHAGO 팀 작업물 현황 — 상태 관리 / 렌더링
   데이터는 localStorage 에 저장되므로 새로고침해도 유지된다. */
(() => {
  "use strict";

  const STORAGE_KEY = "wehago-prj-manager/rows/v1";
  const THEME_KEY = "wehago-prj-manager/theme";

  /** 공통 컴포넌트 적용 상태 라벨 */
  const COMPONENT_LABEL = {
    applied: "적용",
    missing: "미적용",
    partial: "메뉴별 상이",
    none: "해당 없음",
  };

  /** 적용률 계산 대상 — '해당 없음'은 분모에서 제외한다. */
  const RATE_TARGET = ["applied", "missing", "partial"];

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
  let editingId = null;
  const filters = { tool: null, component: null };
  let search = "";
  let sort = { key: null, dir: "asc" };

  const $ = (id) => document.getElementById(id);
  const els = {
    tbody: $("tbody"),
    empty: $("empty"),
    rowCount: $("row-count"),
    search: $("search"),
    modal: $("modal"),
    form: $("form"),
    modalTitle: $("modal-title"),
    btnDelete: $("btn-delete"),
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
    els.tbody.replaceChildren();

    let prevService = null;
    list.forEach((row, index) => {
      const tr = document.createElement("tr");
      const continued = row.service === prevService;
      prevService = row.service;

      tr.append(
        cell(String(index + 1), "cell--no"),
        serviceCell(row, continued),
        cell(row.menu || "—", row.menu ? "" : "cell--muted"),
        badgeCell(row.tool === "Figma" ? "figma" : "xd", row.tool),
        componentCell(row.component),
        cell(row.path || "—", row.path ? "cell--path" : "cell--muted"),
        cell(row.note || "", "cell--note"),
        actionCell(row.id),
      );
      els.tbody.append(tr);
    });

    els.empty.hidden = list.length > 0;
    els.rowCount.textContent =
      list.length === rows.length ? `${rows.length}건` : `${list.length}건 / 전체 ${rows.length}건`;
  }

  function cell(text, className) {
    const td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = text;
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

  function actionCell(id) {
    const td = document.createElement("td");
    td.className = "cell--center";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--ghost btn--small";
    btn.textContent = "수정";
    btn.dataset.edit = id;
    td.append(btn);
    return td;
  }

  function render() {
    renderStats();
    renderTable();
  }

  // ── 모달 ────────────────────────────────────────────────

  function openModal(id) {
    editingId = id ?? null;
    const row = id ? rows.find((r) => r.id === id) : null;

    els.modalTitle.textContent = row ? "작업물 수정" : "작업물 추가";
    els.btnDelete.hidden = !row;
    els.form.reset();

    if (row) {
      els.form.service.value = row.service;
      els.form.menu.value = row.menu;
      els.form.component.value = row.component;
      els.form.path.value = row.path;
      els.form.note.value = row.note;
      for (const radio of els.form.tool) radio.checked = radio.value === row.tool;
    }

    els.modal.showModal();
    els.form.service.focus();
  }

  function closeModal() {
    els.modal.close();
    editingId = null;
  }

  function submit(event) {
    event.preventDefault();
    const data = new FormData(els.form);
    const service = String(data.get("service") || "").trim();
    if (!service) return;

    const next = {
      service,
      menu: String(data.get("menu") || "").trim(),
      tool: String(data.get("tool") || "Figma"),
      component: String(data.get("component") || "applied"),
      path: String(data.get("path") || "").trim(),
      note: String(data.get("note") || "").trim(),
    };

    if (editingId) {
      const i = rows.findIndex((r) => r.id === editingId);
      rows[i] = { ...rows[i], ...next };
      toast(`'${service}' 항목을 수정했습니다.`);
    } else {
      rows.push({ id: uid(), ...next });
      toast(`'${service}' 항목을 추가했습니다.`);
    }

    save();
    render();
    closeModal();
  }

  function remove() {
    const row = rows.find((r) => r.id === editingId);
    if (!row) return;
    if (!confirm(`'${row.service}' 항목을 삭제할까요?`)) return;
    rows = rows.filter((r) => r.id !== editingId);
    save();
    render();
    closeModal();
    toast("항목을 삭제했습니다.");
  }

  // ── CSV 내보내기 ────────────────────────────────────────

  function exportCsv() {
    const head = ["No", "서비스명", "메뉴명", "파일 유형", "공통 컴포넌트 적용", "파일 경로", "비고"];
    const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
    const body = visibleRows().map((row, i) =>
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
    toast(`${visibleRows().length}건을 CSV 로 내보냈습니다.`);
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

  // 헤더와 테이블 툴바 두 곳의 추가 버튼이 같은 모달을 연다.
  for (const btn of document.querySelectorAll('[data-action="add"]')) {
    btn.addEventListener("click", () => openModal(null));
  }
  $("btn-cancel").addEventListener("click", closeModal);
  $("btn-close").addEventListener("click", closeModal);
  els.btnDelete.addEventListener("click", remove);
  els.form.addEventListener("submit", submit);
  $("btn-export").addEventListener("click", exportCsv);

  els.tbody.addEventListener("click", (event) => {
    const id = event.target.closest("[data-edit]")?.dataset.edit;
    if (id) openModal(id);
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

  // 테마 — 저장된 선택이 없으면 OS 설정을 따른다.
  const themeBtn = $("btn-theme");
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) document.documentElement.dataset.theme = saved;
  else document.documentElement.removeAttribute("data-theme");

  themeBtn.addEventListener("click", () => {
    const isDark =
      document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  });

  render();
})();
