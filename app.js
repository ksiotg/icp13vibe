/*
 * ROOMY — 내 방 물건 인벤토리
 * 화면 동작(추가·검색·모아보기·백업·잠금)을 담당하는 파일이에요.
 * 연결 정보는 config.js, 디자인(색·글꼴·모양)은 style.css 에 있어요.
 */
(() => {
  'use strict';

  /* ── 기본값 ─────────────────────────────────────────── */

  const APP_NAME = 'ROOMY';
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.min.js';
  const KEY_HEADER = 'x-room-key';
  const SAVED = {
    items: 'roomy.preview.items',
    key: 'roomy.key',
    view: 'roomy.view',
    tab: 'roomy.tab',
    collapsed: 'roomy.collapsed',
  };

  const CATEGORIES = [
    { name: '문구', icon: 'pencil-simple' },
    { name: '전자기기', icon: 'device-mobile' },
    { name: '옷', icon: 't-shirt' },
    { name: '화장품', icon: 'drop' },
    { name: '생활용품', icon: 'house' },
    { name: '기타', icon: 'package' },
  ];
  const STATUSES = [
    { name: '자주 씀', led: 'on' },
    { name: '가끔 씀', led: 'half' },
    { name: '안 씀', led: 'off' },
    { name: '처분 예정', led: 'warn' },
  ];
  const DEFAULT_CATEGORY = '기타';
  const DEFAULT_STATUS = '가끔 씀';
  const NO_LOCATION = '위치 미정';
  const GROUP_LABELS = { all: 'ALL', location: 'LOCATION', category: 'CATEGORY', status: 'STATUS' };

  // 직접 고를 수 있는 아이콘 (Phosphor Icons 이름)
  const ICON_GROUPS = [
    ['문구', ['pencil-simple', 'scissors', 'book', 'notebook', 'paperclip', 'ruler', 'highlighter', 'eraser', 'sticker']],
    ['전자기기', ['device-mobile', 'laptop', 'headphones', 'plug', 'battery-full', 'camera', 'game-controller', 'keyboard', 'mouse-simple', 'monitor', 'usb', 'printer']],
    ['옷·소지품', ['t-shirt', 'hoodie', 'pants', 'sneaker', 'baseball-cap', 'coat-hanger', 'handbag', 'backpack', 'eyeglasses', 'watch', 'wallet']],
    ['화장품', ['drop', 'flower', 'sparkle', 'hand-soap', 'spray-bottle', 'paint-brush', 'sun']],
    ['생활용품', ['house', 'lightbulb', 'lamp', 'fan', 'first-aid-kit', 'pill', 'bandaids', 'key', 'umbrella', 'coffee', 'fork-knife', 'broom', 'basket', 'toilet-paper', 'bed']],
    ['기타', ['package', 'gift', 'wrench', 'hammer', 'toolbox', 'plant', 'star', 'heart', 'music-notes', 'puzzle-piece', 'dice-five', 'bicycle', 'folder', 'envelope']],
  ];

  // 임시 저장 모드에서 넣어볼 수 있는 예시 물건
  const SAMPLES = [
    ['가위', '책상 서랍 2칸', '문구', 1, '자주 씀', 'scissors', ''],
    ['포스트잇', '책상 서랍 2칸', '문구', 5, '가끔 씀', 'sticker', '노랑 3개, 분홍 2개'],
    ['USB 케이블', '책상 서랍 2칸', '전자기기', 2, '안 씀', 'usb', '검정, 1m, 충전용'],
    ['무선 이어폰', '책상 위', '전자기기', 1, '자주 씀', 'headphones', ''],
    ['건전지 AA', '책상 서랍 1칸', '생활용품', 6, '가끔 씀', 'battery-full', ''],
    ['옛날 휴대폰', '책상 서랍 1칸', '전자기기', 1, '처분 예정', null, '초기화 완료'],
    ['겨울 니트', '옷장 위 박스', '옷', 3, '안 씀', 'hoodie', ''],
    ['전선 뭉치', '옷장 위 박스', '기타', 1, '처분 예정', 'plug', '어디 건지 모름'],
    ['선크림', '화장대', '화장품', 1, '자주 씀', 'sun', ''],
    ['구급상자', '', '생활용품', 1, '가끔 씀', 'first-aid-kit', ''],
  ].map(([name, location, cat, quantity, st, ic, memo], i) => ({
    id: `5a3f0000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    name, location, category: cat, quantity, status: st, icon: ic, memo,
  }));

  /* ── 작은 도구들 ────────────────────────────────────── */

  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // 띄어쓰기·대소문자를 무시하고 비교하기 위한 글자
  const norm = (v) => String(v ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, '');
  const byKo = (a, b) => a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
  const pad3 = (n) => String(n).padStart(3, '0');
  const time = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? 0 : t; };
  const nowIso = () => new Date().toISOString();
  const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const isIconName = (v) => typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test(v);
  const clampQty = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(Math.max(n, 1), 99999) : 1; };

  function ymd(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function uuid() {
    if (typeof crypto.randomUUID === 'function') {
      try { return crypto.randomUUID(); } catch (_) { /* https가 아니면 아래 방법으로 */ }
    }
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // 브라우저 저장 (막혀 있는 브라우저에서도 앱이 멈추지 않게)
  const ls = {
    get(key, fallback = null) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
    },
    del(key) {
      try { localStorage.removeItem(key); } catch (_) { /* 무시 */ }
    },
  };

  const category = (name) => CATEGORIES.find((c) => c.name === name) || CATEGORIES[CATEGORIES.length - 1];
  const status = (name) => STATUSES.find((s) => s.name === name) || STATUSES[1];
  const iconOf = (item) => (isIconName(item.icon) ? item.icon : category(item.category).icon);
  const placeOf = (item) => item.location || NO_LOCATION;

  const led = (kind) => `<span class="led led--${kind}" aria-hidden="true"></span>`;
  const icon = (name, cls = '') => `<i class="ph ph-${name}${cls ? ` ${cls}` : ''}" aria-hidden="true"></i>`;
  const label = (en, ko) => `<span class="lbl">${en}${ko ? `<span class="lbl-ko">${ko}</span>` : ''}</span>`;
  const shortLine = (i) => `${esc(i.name)} · ${esc(placeOf(i))} · ${i.quantity}개`;

  // 어디서 온 데이터든 앱이 쓰는 모양으로 다듬기
  function clean(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name ?? '').trim().slice(0, 100);
    if (!name) return null;
    const created = time(raw.created_at) ? raw.created_at : nowIso();
    return {
      id: isUuid(raw.id) ? raw.id.toLowerCase() : uuid(),
      name,
      location: String(raw.location ?? '').trim().slice(0, 100),
      category: category(raw.category).name,
      quantity: clampQty(raw.quantity),
      status: status(raw.status).name,
      icon: isIconName(raw.icon) ? raw.icon : null,
      memo: String(raw.memo ?? '').slice(0, 1000),
      created_at: created,
      updated_at: time(raw.updated_at) ? raw.updated_at : created,
    };
  }

  function toRow(item, keepDates = false) {
    const row = {
      id: item.id,
      name: item.name,
      location: item.location,
      category: item.category,
      quantity: item.quantity,
      status: item.status,
      icon: item.icon,
      memo: item.memo,
    };
    if (keepDates) {
      row.created_at = item.created_at;
      row.updated_at = item.updated_at;
    }
    return row;
  }

  const notFound = () => Object.assign(new Error('물건을 찾지 못했어요'), { code: 'NOROWS' });

  /* ── 저장소 ① 임시 저장 모드 (이 브라우저 안) ───────── */

  const previewStore = {
    items: null,
    all() {
      if (!this.items) {
        const raw = ls.get(SAVED.items, []);
        this.items = Array.isArray(raw) ? raw.map(clean).filter(Boolean) : [];
      }
      return this.items;
    },
    save() { ls.set(SAVED.items, this.items); },
    async list() { return this.all().map((i) => ({ ...i })); },
    async create(item) {
      const row = clean({ ...item, created_at: nowIso(), updated_at: nowIso() });
      this.all().push(row);
      this.save();
      return { ...row };
    },
    async update(id, patch) {
      const items = this.all();
      const i = items.findIndex((x) => x.id === id);
      if (i < 0) throw notFound();
      items[i] = clean({ ...items[i], ...patch, id, updated_at: nowIso() });
      this.save();
      return { ...items[i] };
    },
    async remove(id) {
      const items = this.all();
      const i = items.findIndex((x) => x.id === id);
      if (i < 0) throw notFound();
      items.splice(i, 1);
      this.save();
    },
    async insertMany(rows) {
      const added = rows.map(clean).filter(Boolean);
      this.all().push(...added);
      this.save();
      return added.map((i) => ({ ...i }));
    },
  };

  /* ── 저장소 ② Supabase ─────────────────────────────── */

  let roomKey = ''; // 비밀 문구를 바꾼 값(해시). 요청마다 함께 보내요

  const remoteStore = {
    client: null,
    table() { return this.client.from('items'); },
    async list() {
      const all = [];
      const size = 1000;
      for (let from = 0; ; from += size) {
        const { data, error } = await this.table().select('*')
          .order('created_at', { ascending: false }).order('id')
          .range(from, from + size - 1);
        if (error) throw error;
        all.push(...data);
        if (data.length < size) break;
      }
      return all.map(clean).filter(Boolean);
    },
    async create(item) {
      const { data, error } = await this.table().insert(toRow(item)).select();
      if (error) throw error;
      if (!data.length) throw notFound();
      return clean(data[0]);
    },
    async update(id, patch) {
      const { data, error } = await this.table().update(patch).eq('id', id).select();
      if (error) throw error;
      if (!data.length) throw notFound();
      return clean(data[0]);
    },
    async remove(id) {
      const { data, error } = await this.table().delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data.length) throw notFound();
    },
    async insertMany(rows) {
      const out = [];
      for (let i = 0; i < rows.length; i += 500) {
        const { data, error } = await this.table().insert(rows.slice(i, i + 500).map((r) => toRow(r, true))).select();
        if (error) throw error;
        out.push(...data);
      }
      return out.map(clean).filter(Boolean);
    },
  };

  let store = previewStore;
  let config = { status: 'empty' };

  /* ── 상태 ───────────────────────────────────────────── */

  const state = {
    mode: 'preview', // preview | remote
    phase: 'loading', // loading | ready | error | locked
    error: null,
    items: [],
    tab: 'all', // all | location | category | status
    view: 'grid', // grid | list
    query: '',
    selectedId: null,
    collapsed: {},
    cols: 4,
    flashId: null,
    loadedAt: 0,
  };

  const els = {};
  const desktop = window.matchMedia('(min-width: 900px)');
  const phone = window.matchMedia('(max-width: 599px)');
  const canPopover = 'showPopover' in HTMLElement.prototype;

  function restorePrefs() {
    const view = ls.get(SAVED.view);
    if (view === 'grid' || view === 'list') state.view = view;
    const tab = ls.get(SAVED.tab);
    if (typeof tab === 'string' && Object.hasOwn(GROUP_LABELS, tab)) state.tab = tab;
    const collapsed = ls.get(SAVED.collapsed, {});
    if (collapsed && typeof collapsed === 'object') state.collapsed = collapsed;
  }

  const selectedItem = () => state.items.find((i) => i.id === state.selectedId) || null;
  const findItem = (id) => state.items.find((i) => i.id === id) || null;

  function replaceItem(saved) {
    const i = state.items.findIndex((x) => x.id === saved.id);
    if (i >= 0) state.items[i] = saved;
  }

  function locationCounts() {
    const m = new Map();
    for (const i of state.items) if (i.location) m.set(i.location, (m.get(i.location) || 0) + 1);
    return m;
  }

  // "책상서랍2칸"처럼 띄어쓰기만 다른 위치는 가장 많이 쓴 이름으로 맞춰요
  function canonicalLocation(loc) {
    if (!loc) return '';
    const n = norm(loc);
    let best = loc;
    let count = 0;
    for (const [k, c] of locationCounts()) {
      if (norm(k) === n && c > count) { best = k; count = c; }
    }
    return best;
  }

  /* ── 묶기 (가방 만들기) ─────────────────────────────── */

  const matches = (item, q) => norm(item.name).includes(q) || norm(item.location).includes(q);

  function groupBy(items, by) {
    if (by === 'all') {
      return [{ key: 'all', title: '전체', items: [...items].sort((a, b) => time(b.created_at) - time(a.created_at)) }];
    }
    const map = new Map();
    for (const it of items) {
      const key = by === 'location' ? norm(it.location) : by === 'category' ? it.category : it.status;
      if (!map.has(key)) map.set(key, { key, items: [], spellings: new Map() });
      const g = map.get(key);
      g.items.push(it);
      g.spellings.set(it.location, (g.spellings.get(it.location) || 0) + 1);
    }
    const groups = [...map.values()];
    for (const g of groups) {
      g.items.sort((a, b) => byKo(a.name, b.name));
      g.title = by === 'location' ? [...g.spellings].sort((a, b) => b[1] - a[1])[0][0] : g.key;
    }
    if (by === 'location') {
      groups.sort((a, b) => (a.key === '') - (b.key === '') || byKo(a.title, b.title));
    } else {
      const order = (by === 'category' ? CATEGORIES : STATUSES).map((x) => x.name);
      groups.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    }
    return groups;
  }

  const isCollapsed = (by, key) => (state.collapsed[by] || []).includes(key);

  function toggleCollapsed(by, key) {
    const set = new Set(state.collapsed[by] || []);
    if (set.has(key)) set.delete(key); else set.add(key);
    state.collapsed[by] = [...set];
    ls.set(SAVED.collapsed, state.collapsed);
  }

  /* ── 그리기 ─────────────────────────────────────────── */

  function render() {
    renderChrome();
    renderInventory();
    renderDetail();
  }

  function renderChrome() {
    document.body.dataset.phase = state.phase;
    document.body.dataset.mode = state.mode;
    els.banner.hidden = state.mode !== 'preview';

    const dispose = state.items.filter((i) => i.status === '처분 예정').length;
    els.summary.innerHTML = state.phase === 'ready'
      ? `<span>${pad3(state.items.length)} ITEMS</span>${dispose
        ? `<span aria-hidden="true">·</span><button type="button" class="summary-link" data-jump="처분 예정">${led('warn')}처분 예정 ${pad3(dispose)}</button>`
        : ''}`
      : '';

    const searching = Boolean(norm(state.query));
    for (const b of $$('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
    for (const b of $$('[data-tab]')) b.setAttribute('aria-pressed', String(!searching && b.dataset.tab === state.tab));
    els.searchClear.hidden = !state.query;

    for (const el of $$('[data-only]', els.menu)) {
      el.hidden = el.dataset.only !== state.mode || (el.dataset.menu === 'lock' && !remoteStore.client);
    }
    els.menuNote.textContent = state.mode === 'preview' ? 'MODE · PREVIEW' : 'MODE · SUPABASE';
  }

  function renderInventory() {
    const box = els.inventory;
    if (state.phase === 'loading') { box.innerHTML = loadingView(); return; }
    if (state.phase === 'error') { box.innerHTML = errorView(state.error); return; }
    if (state.phase !== 'ready') { box.innerHTML = ''; return; }
    if (!state.items.length) { box.innerHTML = emptyView(); return; }

    const q = norm(state.query);
    const items = q ? state.items.filter((i) => matches(i, q)) : state.items;
    if (!items.length) { box.innerHTML = noMatchView(state.query.trim()); return; }

    // 찾는 중에는 어느 탭이든 위치별로 묶어요 (찾는 이유가 '어디 있지?'니까)
    const by = q ? 'location' : state.tab;
    const note = q ? `<p class="note">↳ ‘${esc(state.query.trim())}’ 찾은 물건 ${items.length}개 · 위치별로 묶었어요</p>` : '';
    box.innerHTML = note + groupBy(items, by).map((g) => bagView(g, by, Boolean(q))).join('');
  }

  function bagView(g, by, searching) {
    const collapsible = by !== 'all' && !searching;
    const collapsed = collapsible && isCollapsed(by, g.key);
    const unset = by === 'location' && !g.key;
    const head = `
      ${label(GROUP_LABELS[by])}
      <span class="bag-dash" aria-hidden="true"></span>
      <span class="bag-title${unset ? ' is-unset' : ''}">${bagTitle(g, by)}</span>
      <span class="bag-rule" aria-hidden="true"></span>
      <span class="bag-count">${g.items.length}</span>
      ${collapsible ? icon('caret-down', 'bag-caret') : ''}`;
    const headEl = collapsible
      ? `<button type="button" class="bag-head" data-toggle="${esc(g.key)}" aria-expanded="${!collapsed}">${head}</button>`
      : `<div class="bag-head">${head}</div>`;
    const body = collapsed ? '' : state.view === 'grid' ? gridView(g, by, searching) : listView(g, by);
    return `<section class="bag${collapsed ? ' is-collapsed' : ''}" data-by="${by}" data-key="${esc(g.key)}">${headEl}${body}</section>`;
  }

  function bagTitle(g, by) {
    if (by === 'all') return '<span class="bag-text">전체</span>';
    if (by === 'location') return `<span class="bag-text">${esc(g.title || NO_LOCATION)}</span>`;
    if (by === 'category') return `${icon(category(g.key).icon)}<span class="bag-text">${esc(g.key)}</span>`;
    return `${led(status(g.key).led)}<span class="bag-text">${esc(g.key)}</span>`;
  }

  function gridView(g, by, searching) {
    let empties = '';
    if (!searching) {
      // 점선 빈 칸: 마지막 줄을 채울 만큼 (최소 1개). 누르면 이 가방으로 바로 추가
      const n = g.items.length;
      const count = by === 'all' ? 1 : (state.cols - (n % state.cols)) % state.cols || 1;
      const value = by === 'location' ? g.title : g.key;
      const prefill = by === 'all' ? '' : ` data-prefill-by="${by}" data-prefill="${esc(value)}"`;
      const where = by === 'location' ? (g.title || NO_LOCATION) : g.key;
      const aria = by === 'all' ? '새 물건 추가' : `${where}에 새 물건 추가`;
      for (let i = 0; i < count; i += 1) {
        empties += i === 0
          ? `<button type="button" class="slot slot--empty"${prefill} aria-label="${esc(aria)}">${icon('plus')}</button>`
          : `<span class="slot slot--empty"${prefill} aria-hidden="true"></span>`;
      }
    }
    return `<div class="grid">${g.items.map(slotView).join('')}${empties}</div>`;
  }

  function slotView(it) {
    const st = status(it.status);
    const lit = st.led === 'on' || st.led === 'warn';
    const cls = ['slot', it.id === state.selectedId && 'is-selected', it.id === state.flashId && 'is-new'].filter(Boolean).join(' ');
    const aria = `${it.name}, ${it.quantity}개, ${it.status}, ${placeOf(it)}`;
    return `<button type="button" class="${cls}" data-id="${it.id}" title="${esc(it.name)}" aria-label="${esc(aria)}">${lit ? led(st.led) : ''}${icon(iconOf(it), 'slot-icon')}<span class="slot-name">${esc(it.name)}</span><span class="slot-qty">${it.quantity > 1 ? `×${it.quantity}` : ''}</span></button>`;
  }

  function listView(g, by) {
    const rows = g.items.map((it) => {
      const st = status(it.status);
      const meta = [by !== 'category' && it.category, by !== 'location' && placeOf(it)].filter(Boolean).join(' · ');
      const cls = ['row', it.id === state.selectedId && 'is-selected', it.id === state.flashId && 'is-new'].filter(Boolean).join(' ');
      return `<li><button type="button" class="${cls}" data-id="${it.id}">
        <span class="row-arrow" aria-hidden="true">↳</span>${icon(iconOf(it), 'row-icon')}
        <span class="row-main"><span class="row-name">${esc(it.name)}</span><span class="row-meta">${esc(meta)}</span></span>
        <span class="row-qty">${it.quantity}개</span>
        <span class="row-status">${led(st.led)}<span>${esc(it.status)}</span></span>
      </button></li>`;
    });
    return `<ul class="rows">${rows.join('')}</ul>`;
  }

  function loadingView() {
    return `<div class="state"><p class="state-title">LOADING<span class="dots" aria-hidden="true"></span></p><p>불러오는 중이에요.</p></div>`;
  }

  function emptyView() {
    const slots = Array.from({ length: 8 }, (_, i) => (i === 0
      ? `<button type="button" class="slot slot--empty" aria-label="새 물건 추가">${icon('plus')}</button>`
      : '<span class="slot slot--empty" aria-hidden="true"></span>')).join('');
    const sample = state.mode === 'preview'
      ? `<button type="button" class="key key--sm" data-menu="samples-add">${icon('sparkle')}예시 물건 넣어보기</button>`
      : '';
    return `<div class="state"><p class="state-title">EMPTY BAG</p><p>아직 물건이 없어요. 빈 칸이나 <b>＋ 추가</b>를 눌러 시작하세요.</p>${sample}</div><div class="grid">${slots}</div>`;
  }

  function noMatchView(q) {
    return `<div class="state"><p class="state-title">NO MATCH</p><p>‘${esc(q)}’에 맞는 물건이 없어요.</p>
      <button type="button" class="key key--sm" data-add-name="${esc(q)}">${icon('plus')}‘${esc(q)}’ 추가하기</button></div>`;
  }

  const ERRORS = {
    network: {
      title: 'CONNECTION ERROR',
      text: 'Supabase에 연결하지 못했어요.',
      tips: ['인터넷 연결을 확인해 주세요.', '일주일 넘게 안 열었다면 프로젝트가 잠시 멈췄을 수 있어요. Supabase 사이트에서 프로젝트를 열고 Restore를 눌러주세요.'],
    },
    apikey: { title: 'KEY ERROR', text: '연결 정보의 열쇠(key)가 맞지 않아요.', tips: ['config.js의 SUPABASE_KEY를 다시 복사해서 붙여넣어 주세요.'] },
    setup: { title: 'SETUP NEEDED', text: 'Supabase에 물건 표가 아직 없어요.', tips: ['설정안내.md 3단계(명령문 실행)를 해주세요.'] },
    config: { title: 'CONFIG ERROR', text: 'config.js의 연결 정보를 확인해 주세요.', tips: ['주소는 https:// 로 시작해야 해요.', '주소와 열쇠 모두 따옴표 안에 있어야 해요.'] },
    script: { title: 'LOAD ERROR', text: '연결 도구를 불러오지 못했어요.', tips: ['인터넷 연결을 확인하고 다시 시도해 주세요.'] },
    secure: { title: 'HTTPS NEEDED', text: '이 주소에서는 비밀 문구를 확인할 수 없어요.', tips: ['https:// 로 시작하는 주소(GitHub Pages)로 열어주세요.'] },
    unknown: { title: 'ERROR', text: '문제가 생겼어요.', tips: ['잠시 뒤 다시 시도해 주세요.'] },
  };

  function errorView(err) {
    const e = ERRORS[err?.kind] || ERRORS.unknown;
    const tips = e.tips.map((t) => `<li>↳ ${esc(t)}</li>`).join('');
    const detail = err?.detail ? `<p class="state-detail">${esc(err.detail)}</p>` : '';
    const retry = err?.kind === 'config' ? '' : `<button type="button" class="key key--sm" data-retry>${icon('arrow-clockwise')}다시 시도</button>`;
    return `<div class="state"><p class="state-title">${led('warn')}${e.title}</p><p>${e.text}</p><ul class="tips">${tips}</ul>${detail}${retry}</div>`;
  }

  /* ── 설명창 ─────────────────────────────────────────── */

  function detailView(it) {
    const st = status(it.status);
    const lit = st.led === 'on' || st.led === 'warn';
    const picks = STATUSES.map((s) => {
      const on = s.name === it.status;
      return `<button type="button" class="chip${on ? ' is-on' : ''}" data-status="${s.name}" aria-pressed="${on}">${led(s.led)}${s.name}</button>`;
    }).join('');
    return `
      <div class="detail">
        <div class="detail-head" data-grip>
          <span class="slot slot--big" aria-hidden="true">${lit ? led(st.led) : ''}${icon(iconOf(it))}</span>
          <div>
            <h2 class="detail-name">${esc(it.name)}</h2>
            <p class="detail-qty">×${it.quantity}</p>
          </div>
        </div>
        <dl class="spec">
          <div><dt>CATEGORY</dt><dd>${icon(category(it.category).icon)}${esc(it.category)}</dd></div>
          <div><dt>LOCATION</dt><dd>${it.location ? esc(it.location) : `<span class="unset">${NO_LOCATION}</span>`}</dd></div>
          <div class="is-stack"><dt>STATUS</dt><dd><div class="status-pick" role="group" aria-label="상태 바꾸기">${picks}</div></dd></div>
          ${it.memo ? `<div><dt>MEMO</dt><dd class="memo">${esc(it.memo)}</dd></div>` : ''}
          <div><dt>ADDED</dt><dd class="mono">${ymd(it.created_at)}</dd></div>
        </dl>
        <div class="detail-actions">
          <button type="button" class="key" data-act="edit">${icon('pencil-simple')}수정</button>
          <button type="button" class="key" data-act="delete">${icon('trash')}삭제</button>
          ${it.status === '처분 예정' ? `<button type="button" class="key" data-act="dispose">${led('warn')}처분 완료</button>` : ''}
        </div>
      </div>`;
  }

  function renderDetail() {
    if (!desktop.matches) { renderSheet(); return; }
    const it = selectedItem();
    els.panel.innerHTML = it
      ? detailView(it)
      : '<div class="detail-empty"><p class="state-title">SELECT AN ITEM</p><p>칸을 누르면 여기에 설명이 보여요.</p></div>';
  }

  function renderSheet() {
    if (!els.sheet.open) return;
    const it = selectedItem();
    if (!it) { els.sheet.close(); return; }
    els.sheetBody.innerHTML = detailView(it);
  }

  function syncSelection() {
    for (const el of $$('[data-id]', els.inventory)) el.classList.toggle('is-selected', el.dataset.id === state.selectedId);
  }

  function select(id) {
    state.selectedId = id;
    syncSelection();
    if (desktop.matches) { renderDetail(); return; }
    els.sheetBody.innerHTML = detailView(selectedItem());
    if (!els.sheet.open) els.sheet.showModal();
    els.sheetBody.scrollTop = 0;
  }

  function flash(id) {
    state.flashId = id;
    setTimeout(() => {
      if (state.flashId !== id) return;
      state.flashId = null;
      for (const el of $$('.is-new', els.inventory)) el.classList.remove('is-new');
    }, 2200);
  }

  // 방금 저장한 물건이 보이도록 (접힌 가방이면 펼쳐서) 스크롤
  function reveal(id) {
    const it = findItem(id);
    if (!it) return;
    let el = els.inventory.querySelector(`[data-id="${id}"]`);
    if (!el && !norm(state.query) && state.tab !== 'all') {
      const key = state.tab === 'location' ? norm(it.location) : state.tab === 'category' ? it.category : it.status;
      if (isCollapsed(state.tab, key)) {
        toggleCollapsed(state.tab, key);
        renderInventory();
        el = els.inventory.querySelector(`[data-id="${id}"]`);
      }
    }
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ── 상호작용: 목록 ─────────────────────────────────── */

  function onInventoryClick(e) {
    const t = e.target;
    const item = t.closest('[data-id]');
    if (item) { select(item.dataset.id); return; }
    const empty = t.closest('.slot--empty');
    if (empty) {
      const by = empty.dataset.prefillBy;
      openForm('add', null, by ? { [by]: empty.dataset.prefill ?? '' } : {});
      return;
    }
    const toggle = t.closest('[data-toggle]');
    if (toggle) {
      toggleCollapsed(toggle.closest('.bag').dataset.by, toggle.dataset.toggle);
      renderInventory();
      return;
    }
    const addName = t.closest('[data-add-name]');
    if (addName) { openForm('add', null, { name: addName.dataset.addName }); return; }
    if (t.closest('[data-retry]')) { retry(); return; }
    const menuBtn = t.closest('[data-menu]');
    if (menuBtn) runMenu(menuBtn.dataset.menu);
  }

  function setView(view) {
    state.view = view;
    ls.set(SAVED.view, view);
    renderChrome();
    renderInventory();
  }

  function setTab(tab) {
    state.tab = tab;
    ls.set(SAVED.tab, tab);
    if (state.query) { state.query = ''; els.search.value = ''; }
    renderChrome();
    renderInventory();
    if (window.scrollY > 0) window.scrollTo(0, 0);
  }

  function clearSearch() {
    state.query = '';
    els.search.value = '';
    renderChrome();
    renderInventory();
  }

  function jumpToStatus(name) {
    state.collapsed.status = (state.collapsed.status || []).filter((k) => k !== name);
    ls.set(SAVED.collapsed, state.collapsed);
    setTab('status');
    const section = $$('.bag', els.inventory).find((s) => s.dataset.key === name);
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── 상호작용: 설명창 ───────────────────────────────── */

  function onDetailClick(e) {
    const it = selectedItem();
    if (!it) return;
    const pick = e.target.closest('[data-status]');
    if (pick) { changeStatus(it, pick.dataset.status); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'edit') {
      if (els.sheet.open) els.sheet.close();
      openForm('edit', it);
    } else if (act === 'delete') {
      deleteItem(it, false);
    } else if (act === 'dispose') {
      deleteItem(it, true);
    }
  }

  function onSheetClose() {
    if (desktop.matches) return;
    state.selectedId = null;
    syncSelection();
  }

  function onLayoutChange() {
    if (desktop.matches) {
      if (els.sheet.open) els.sheet.close();
    } else {
      state.selectedId = null;
    }
    syncSelection();
    renderDetail();
  }

  async function changeStatus(it, next) {
    if (it.status === next) return;
    const before = it.status;
    it.status = next; // 바로 보여주고, 저장은 뒤에서
    render();
    try {
      replaceItem(await store.update(it.id, { status: next }));
      render();
    } catch (err) {
      const cur = findItem(it.id);
      if (cur) cur.status = before;
      render();
      handleError(err);
    }
  }

  async function deleteItem(it, disposed) {
    const answer = await ask({
      en: disposed ? 'DISPOSE' : 'DELETE',
      ko: disposed ? '처분 완료' : '삭제',
      warn: disposed,
      html: `<p>${disposed ? '처분했나요? 목록에서 지울게요.' : '정말 삭제할까요?'}</p><p class="quote">↳ ${shortLine(it)}</p>`,
      buttons: [{ text: disposed ? '처분 완료' : '삭제', value: 'yes', dark: true }, { text: '취소', value: 'no' }],
    });
    if (answer !== 'yes') return false;
    try {
      await store.remove(it.id);
    } catch (err) {
      handleError(err);
      return false;
    }
    state.items = state.items.filter((i) => i.id !== it.id);
    if (state.selectedId === it.id) {
      state.selectedId = null;
      if (els.sheet.open) els.sheet.close();
    }
    render();
    toast(disposed ? '처분 완료! 목록에서 지웠어요' : '삭제했어요', { text: '되돌리기', run: () => undoDelete(it) });
    return true;
  }

  async function undoDelete(it) {
    try {
      const [saved] = await store.insertMany([it]);
      state.items.push(saved);
      flash(saved.id);
      render();
      reveal(saved.id);
      toast('되돌렸어요');
    } catch (err) {
      handleError(err);
    }
  }

  // 폰: 설명창을 아래로 쓸어내리면 닫혀요
  function enableSwipeClose(dialog) {
    const box = dialog.querySelector('.modal-box');
    let startY = null;
    const reset = () => { startY = null; box.style.transform = ''; };
    dialog.addEventListener('pointerdown', (e) => {
      if (!phone.matches || !e.target.closest('[data-grip]')) return;
      startY = e.clientY;
      e.target.setPointerCapture?.(e.pointerId);
    });
    dialog.addEventListener('pointermove', (e) => {
      if (startY === null) return;
      box.style.transform = `translateY(${Math.max(0, e.clientY - startY)}px)`;
    });
    dialog.addEventListener('pointerup', (e) => {
      if (startY === null) return;
      const moved = e.clientY - startY;
      reset();
      if (moved > 90) dialog.close();
    });
    dialog.addEventListener('pointercancel', reset);
  }

  /* ── 추가 · 수정 창 ─────────────────────────────────── */

  const form = { mode: 'add', id: null, original: null, icon: null, busy: false };

  const selectedCategory = () => els.itemForm.elements.category.value || DEFAULT_CATEGORY;
  const selectedStatus = () => els.itemForm.elements.status.value || DEFAULT_STATUS;

  function setRadio(name, value) {
    for (const r of els.itemForm.elements[name]) r.checked = r.value === value;
  }

  function openForm(mode, item = null, prefill = {}) {
    form.mode = mode;
    form.id = item?.id || null;
    form.original = item;
    form.busy = false;
    const src = item || {
      name: prefill.name || '',
      location: prefill.location || '',
      category: prefill.category || DEFAULT_CATEGORY,
      quantity: 1,
      status: prefill.status || DEFAULT_STATUS,
      icon: null,
      memo: '',
    };
    form.icon = isIconName(src.icon) ? src.icon : null;

    els.formTitle.innerHTML = mode === 'add' ? label('NEW ITEM', '새 물건') : label('EDIT ITEM', '물건 수정');
    els.fName.value = src.name;
    els.fLocation.value = src.location;
    els.fQty.value = src.quantity;
    els.fMemo.value = src.memo;
    setRadio('category', src.category);
    setRadio('status', src.status);
    els.formDelete.hidden = mode !== 'edit';
    els.formAdded.hidden = mode !== 'edit';
    if (item) els.formAdded.textContent = `ADDED ${ymd(item.created_at)}`;
    els.formError.hidden = true;
    toggleIconGrid(false);
    renderFormIcon();
    renderNameHint();
    renderLocChips();
    setBusy(false);

    els.formDialog.showModal();
    els.formBody.scrollTop = 0;
    if (mode === 'add') (src.name ? els.fLocation : els.fName).focus();
  }

  function renderFormIcon() {
    const name = form.icon || category(selectedCategory()).icon;
    els.formIcon.innerHTML = icon(name);
    els.iconAuto.textContent = form.icon ? '직접 고름' : '카테고리 기본';
    els.iconReset.hidden = !form.icon;
    if (!els.iconGrid.hidden) markIconGrid();
  }

  function toggleIconGrid(open = els.iconGrid.hidden) {
    els.iconGrid.hidden = !open;
    els.iconToggle.setAttribute('aria-expanded', String(open));
    els.iconToggle.textContent = open ? '접기' : '바꾸기';
    if (open) {
      markIconGrid();
      els.iconGrid.querySelector('.is-on')?.scrollIntoView({ block: 'nearest' });
    }
  }

  function markIconGrid() {
    const cur = form.icon || category(selectedCategory()).icon;
    for (const b of $$('[data-icon]', els.iconGrid)) b.classList.toggle('is-on', b.dataset.icon === cur);
  }

  function onIconPick(e) {
    const b = e.target.closest('[data-icon]');
    if (!b) return;
    // 카테고리 기본 아이콘을 고르면 '자동'으로 둬요 (카테고리를 바꾸면 따라 바뀜)
    form.icon = b.dataset.icon === category(selectedCategory()).icon ? null : b.dataset.icon;
    renderFormIcon();
    toggleIconGrid(false);
  }

  function renderNameHint() {
    const v = norm(els.fName.value);
    const others = state.items.filter((i) => i.id !== form.id);
    let html = '';
    let warn = false;
    if (v) {
      const same = others.filter((i) => norm(i.name) === v);
      if (same.length) {
        warn = true;
        html = `${led('warn')}<span>이미 있어요: ${same.slice(0, 3).map(shortLine).join(' / ')}</span>`;
      } else if (v.length >= 2) {
        const similar = others.filter((i) => {
          const n = norm(i.name);
          return n.includes(v) || (n.length >= 2 && v.includes(n));
        }).slice(0, 3);
        if (similar.length) html = `<span>↳ 비슷한 물건: ${similar.map(shortLine).join(' / ')}</span>`;
      }
    }
    els.nameHint.innerHTML = html;
    els.nameHint.classList.toggle('is-warn', warn);
  }

  function renderLocChips() {
    const typed = els.fLocation.value.trim();
    const t = norm(typed);
    let list = [...locationCounts()].sort((a, b) => b[1] - a[1] || byKo(a[0], b[0])).map(([k]) => k);
    if (t) list = list.filter((k) => norm(k).includes(t) && k !== typed);
    els.locChips.innerHTML = list.slice(0, 8)
      .map((k) => `<button type="button" class="chip chip--sm" data-loc="${esc(k)}">${esc(k)}</button>`).join('');
  }

  function updateSaveState() {
    els.formSave.disabled = form.busy || !els.fName.value.trim();
  }

  function setBusy(busy) {
    form.busy = busy;
    els.formSave.textContent = busy ? '저장 중…' : '저장';
    updateSaveState();
  }

  function showFormError(message) {
    els.formError.innerHTML = `${led('warn')}<span>${esc(message)}</span>`;
    els.formError.hidden = false;
  }

  function readForm() {
    return {
      name: els.fName.value.trim().slice(0, 100),
      location: canonicalLocation(els.fLocation.value.trim().slice(0, 100)),
      category: selectedCategory(),
      quantity: clampQty(els.fQty.value),
      status: selectedStatus(),
      icon: form.icon,
      memo: els.fMemo.value.trim().slice(0, 1000),
    };
  }

  async function onFormSubmit(e) {
    e.preventDefault();
    if (form.busy) return;
    const data = readForm();
    if (!data.name) { els.fName.focus(); return; }
    els.formError.hidden = true;

    const renamed = form.mode === 'add' || norm(form.original.name) !== norm(data.name);
    const dupes = renamed ? state.items.filter((i) => i.id !== form.id && norm(i.name) === norm(data.name)) : [];
    if (dupes.length) {
      const answer = await askDuplicate(data, dupes);
      if (!answer || answer === 'cancel') return;
      if (answer.startsWith('bump:')) { await bump(answer.slice(5), data.quantity); return; }
    }
    await saveForm(data);
  }

  function askDuplicate(data, dupes) {
    const adding = form.mode === 'add';
    const one = dupes.length === 1;
    const lines = dupes.map((d) => `<li><span>↳ ${shortLine(d)} · ${esc(d.status)}</span>${adding && !one
      ? `<button type="button" class="key key--sm" data-value="bump:${d.id}">+${data.quantity}</button>` : ''}</li>`).join('');
    const buttons = [];
    if (adding && one) buttons.push({ text: `기존 물건 수량 +${data.quantity}`, value: `bump:${dupes[0].id}`, dark: true });
    buttons.push({ text: adding ? '그래도 새로 추가' : '그래도 저장', value: 'force' }, { text: '취소', value: 'cancel' });
    return ask({
      en: 'ALREADY EXISTS',
      ko: '이미 있어요',
      warn: true,
      html: `<p>‘${esc(data.name)}’ — 이미 등록돼 있어요.</p><ul class="dupes">${lines}</ul>`,
      buttons,
    });
  }

  async function bump(id, add) {
    const it = findItem(id);
    if (!it) return;
    setBusy(true);
    try {
      const saved = await store.update(id, { quantity: clampQty(it.quantity + add) });
      replaceItem(saved);
      els.formDialog.close();
      flash(saved.id);
      render();
      reveal(saved.id);
      toast(`${saved.name} 수량이 ${saved.quantity}개가 되었어요`);
    } catch (err) {
      if (!(await maybeLocked(err))) showFormError(friendlyMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveForm(data) {
    setBusy(true);
    try {
      let saved;
      if (form.mode === 'add') {
        saved = await store.create({ id: uuid(), ...data });
        state.items.unshift(saved);
      } else {
        saved = await store.update(form.id, data);
        replaceItem(saved);
      }
      els.formDialog.close();
      flash(saved.id);
      if (desktop.matches) state.selectedId = saved.id;
      render();
      reveal(saved.id);
      toast('저장했어요');
    } catch (err) {
      if (!(await maybeLocked(err))) showFormError(friendlyMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onFormDelete() {
    const it = findItem(form.id);
    if (it && await deleteItem(it, false)) els.formDialog.close();
  }

  function onFormKeydown(e) {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    if (e.metaKey || e.ctrlKey) { e.preventDefault(); els.formSave.click(); return; }
    const t = e.target;
    if (t.tagName !== 'INPUT') return;
    // 한 줄 입력칸에서 Enter = 다음 칸으로 (실수로 저장되지 않게)
    e.preventDefault();
    if (t === els.fName) els.fLocation.focus();
    else if (t === els.fLocation) els.fQty.focus();
    else if (t === els.fQty) els.fMemo.focus();
  }

  function stepQty(delta) {
    els.fQty.value = clampQty(clampQty(els.fQty.value) + delta);
  }

  /* ── 확인 창 ────────────────────────────────────────── */

  function ask({ en, ko, warn = false, html, buttons }) {
    const d = els.askDialog;
    d.innerHTML = `
      <div class="modal-box">
        <header class="modal-head">${warn ? led('warn') : ''}${label(en, ko)}</header>
        <div class="modal-body ask-body">${html}</div>
        <footer class="modal-foot modal-foot--stack">${buttons.map((b) => `<button type="button" class="key${b.dark ? ' key--dark' : ''}" data-value="${esc(b.value)}">${esc(b.text)}</button>`).join('')}</footer>
      </div>`;
    return new Promise((resolve) => {
      const done = (value) => {
        d.removeEventListener('click', onClick);
        d.removeEventListener('close', onClose);
        if (d.open) d.close();
        resolve(value);
      };
      const onClick = (e) => {
        const b = e.target.closest('[data-value]');
        if (b) done(b.dataset.value);
        else if (e.target === d) done(null);
      };
      const onClose = () => done(null);
      d.addEventListener('click', onClick);
      d.addEventListener('close', onClose);
      d.showModal();
      [...d.querySelectorAll('.modal-foot .key')].pop()?.focus();
    });
  }

  /* ── 알림 말풍선 ────────────────────────────────────── */

  let toastTimer = 0;

  function toast(message, action = null) {
    const t = els.toast;
    t.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" class="toast-act">${esc(action.text)}</button>` : ''}`;
    if (action) t.querySelector('.toast-act').addEventListener('click', () => { hideToast(); action.run(); }, { once: true });
    if (canPopover) {
      try {
        if (t.matches(':popover-open')) t.hidePopover();
        t.showPopover(); // 열린 창보다 위에 보이게
      } catch (_) { t.classList.add('is-shown'); }
    } else {
      t.classList.add('is-shown');
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 5000 : 2400);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    const t = els.toast;
    if (canPopover) {
      try { if (t.matches(':popover-open')) t.hidePopover(); } catch (_) { /* 무시 */ }
    }
    t.classList.remove('is-shown');
  }

  /* ── 메뉴 · 백업 · 예시 물건 ───────────────────────── */

  function toggleMenu(open) {
    els.menu.hidden = !open;
    els.menuBtn.setAttribute('aria-expanded', String(open));
    if (open) els.menu.querySelector('button:not([hidden])')?.focus();
  }

  function runMenu(action) {
    toggleMenu(false);
    if (action === 'backup') backup();
    else if (action === 'restore') els.restoreInput.click();
    else if (action === 'samples-add') addSamples();
    else if (action === 'samples-remove') removeSamples();
    else if (action === 'lock') { ls.del(SAVED.key); lock(''); }
  }

  function backup() {
    if (!state.items.length) { toast('백업할 물건이 아직 없어요'); return; }
    const payload = {
      app: APP_NAME,
      version: 1,
      exported_at: nowIso(),
      count: state.items.length,
      items: state.items.map((i) => toRow(i, true)),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${APP_NAME.toLowerCase()}-${ymd(nowIso())}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('백업 파일을 내려받았어요');
  }

  async function restore(file) {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (_) {
      toast('백업 파일을 읽지 못했어요');
      return;
    }
    const raw = Array.isArray(parsed) ? parsed : parsed?.items;
    if (!Array.isArray(raw)) { toast(`${APP_NAME} 백업 파일이 아니에요`); return; }

    const have = new Set(state.items.map((i) => i.id));
    const rows = [];
    let skipped = 0;
    for (const r of raw) {
      const item = clean(r);
      if (!item) continue;
      if (have.has(item.id)) { skipped += 1; continue; }
      have.add(item.id);
      rows.push(item);
    }
    if (!rows.length) {
      toast(skipped ? `새로 불러올 물건이 없어요 (${skipped}개는 이미 있어요)` : '불러올 물건이 없어요');
      return;
    }
    const answer = await ask({
      en: 'RESTORE',
      ko: '불러오기',
      html: `<p>물건 ${rows.length}개를 불러올까요?</p>${skipped ? `<p class="quote">↳ ${skipped}개는 이미 있어서 건너뛰어요</p>` : ''}`,
      buttons: [{ text: '불러오기', value: 'yes', dark: true }, { text: '취소', value: 'no' }],
    });
    if (answer !== 'yes') return;
    try {
      const saved = await store.insertMany(rows);
      state.items.push(...saved);
      render();
      toast(`${saved.length}개를 불러왔어요${skipped ? ` (${skipped}개는 이미 있어서 건너뜀)` : ''}`);
    } catch (err) {
      handleError(err);
    }
  }

  async function addSamples() {
    const have = new Set(state.items.map((i) => i.id));
    const day = 86400000;
    const rows = SAMPLES.filter((s) => !have.has(s.id))
      .map((s, i) => clean({ ...s, created_at: new Date(Date.now() - (i + 1) * day).toISOString() }));
    if (!rows.length) { toast('예시 물건이 이미 들어 있어요'); return; }
    const saved = await store.insertMany(rows);
    state.items.push(...saved);
    render();
    toast(`예시 물건 ${saved.length}개를 넣었어요`);
  }

  async function removeSamples() {
    const ids = new Set(SAMPLES.map((s) => s.id));
    const targets = state.items.filter((i) => ids.has(i.id));
    if (!targets.length) { toast('지울 예시 물건이 없어요'); return; }
    for (const t of targets) await store.remove(t.id);
    state.items = state.items.filter((i) => !ids.has(i.id));
    if (ids.has(state.selectedId)) state.selectedId = null;
    render();
    toast(`예시 물건 ${targets.length}개를 지웠어요`);
  }

  /* ── 오류 다루기 ────────────────────────────────────── */

  function classify(err) {
    const msg = String(err?.message || err || '');
    const code = String(err?.code || '');
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'network';
    if (/api key|apikey|jwt/i.test(msg)) return 'apikey';
    if (['PGRST202', 'PGRST205', '42P01', '42883', 'PGRST106'].includes(code) || /schema cache|does not exist/i.test(msg)) return 'setup';
    return 'unknown';
  }

  function friendlyMessage(err) {
    const kind = classify(err);
    if (kind === 'network') return '연결하지 못했어요. 인터넷을 확인해 주세요';
    if (kind === 'apikey') return '연결 정보의 열쇠(key)를 확인해 주세요';
    if (kind === 'setup') return 'Supabase 설정을 확인해 주세요 (설정안내 3단계)';
    return '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요';
  }

  const failure = (err) => ({ kind: classify(err), detail: String(err?.message || err || '').slice(0, 200) });

  // 저장이 막혔을 때: 비밀 문구가 바뀌었는지, 다른 기기에서 지웠는지 확인
  async function maybeLocked(err) {
    if (state.mode !== 'remote') return false;
    if (!['42501', 'NOROWS', 'PGRST116', 'PGRST301'].includes(String(err?.code || ''))) return false;
    let ok;
    try { ok = await checkKey(roomKey); } catch (_) { return false; }
    if (ok) {
      closeDialogs();
      toast('다른 기기에서 바뀐 내용이 있어서 새로 불러왔어요');
      await loadItems();
      return true;
    }
    ls.del(SAVED.key);
    lock('비밀 문구가 바뀌었어요. 새 문구를 입력해 주세요.');
    return true;
  }

  async function handleError(err) {
    if (await maybeLocked(err)) return;
    toast(friendlyMessage(err));
  }

  function closeDialogs() {
    for (const d of $$('dialog[open]')) d.close();
  }

  /* ── 불러오기 · 잠금 ────────────────────────────────── */

  function readConfig() {
    /* global SUPABASE_URL, SUPABASE_KEY */
    const url = String(typeof SUPABASE_URL === 'undefined' ? '' : SUPABASE_URL).trim();
    const key = String(typeof SUPABASE_KEY === 'undefined' ? '' : SUPABASE_KEY).trim();
    const blank = (v) => !v || v.includes('여기에');
    if (blank(url) && blank(key)) return { status: 'empty' };
    const base = url.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    const okUrl = /^https:\/\/[^\s/]+$/.test(base) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base);
    if (blank(url) || blank(key) || !okUrl) return { status: 'invalid' };
    return { status: 'ok', url: base, key };
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('script'));
      document.head.append(s);
    });
  }

  function createRemoteClient() {
    return window.supabase.createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        // 모든 요청에 비밀 문구(해시)를 붙여 보내요. Supabase 잠금 규칙이 이걸 확인해요
        fetch: (input, init = {}) => {
          const headers = new Headers(init.headers || {});
          if (roomKey) headers.set(KEY_HEADER, roomKey);
          return fetch(input, { ...init, headers });
        },
      },
    });
  }

  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text.trim().normalize('NFC'));
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function checkKey(hash) {
    roomKey = hash;
    const { data, error } = await remoteStore.client.rpc('room_key_ok');
    if (error) throw error;
    return data === true;
  }

  function fail(error) {
    state.phase = 'error';
    state.error = error;
    render();
  }

  async function loadItems() {
    state.phase = 'loading';
    render();
    try {
      state.items = await store.list();
      state.loadedAt = Date.now();
      state.phase = 'ready';
      if (state.selectedId && !selectedItem()) state.selectedId = null;
      render();
    } catch (err) {
      fail(failure(err));
      return;
    }
    if (state.mode === 'remote') offerPreviewMove();
  }

  // 연결하기 전에 임시 저장 모드에서 넣은 물건이 이 브라우저에 남아 있으면 옮길지 물어봐요
  async function offerPreviewMove() {
    const raw = ls.get(SAVED.items, []);
    if (!Array.isArray(raw) || !raw.length) return;
    const sampleIds = new Set(SAMPLES.map((x) => x.id));
    const have = new Set(state.items.map((i) => i.id));
    const rows = raw.map(clean).filter((i) => i && !sampleIds.has(i.id) && !have.has(i.id));
    if (!rows.length) { ls.del(SAVED.items); return; } // 예시 물건이나 이미 옮긴 것뿐
    const names = rows.slice(0, 3).map((i) => esc(i.name)).join(', ') + (rows.length > 3 ? ' …' : '');
    const answer = await ask({
      en: 'MOVE ITEMS',
      ko: '물건 옮기기',
      html: `<p>연결하기 전에 이 브라우저에 임시로 저장해 둔 물건 ${rows.length}개가 있어요. Supabase로 옮길까요?</p><p class="quote">↳ ${names}</p>`,
      buttons: [
        { text: `${rows.length}개 옮기기`, value: 'move', dark: true },
        { text: '옮기지 않고 지우기', value: 'drop' },
        { text: '나중에', value: 'later' },
      ],
    });
    if (answer === 'move') {
      try {
        const saved = await store.insertMany(rows);
        state.items.push(...saved);
        ls.del(SAVED.items);
        render();
        toast(`${saved.length}개를 옮겼어요`);
      } catch (err) {
        handleError(err);
      }
    } else if (answer === 'drop') {
      ls.del(SAVED.items);
      toast('임시로 저장한 물건을 지웠어요');
    }
  }

  async function startRemote() {
    state.mode = 'remote';
    store = remoteStore;
    state.phase = 'loading';
    render();
    if (!window.crypto?.subtle) { fail({ kind: 'secure' }); return; }
    try {
      if (!window.supabase?.createClient) await loadScript(SUPABASE_JS);
    } catch (_) {
      fail({ kind: 'script' });
      return;
    }
    if (!remoteStore.client) remoteStore.client = createRemoteClient();

    const saved = ls.get(SAVED.key);
    if (typeof saved !== 'string' || !/^[0-9a-f]{64}$/.test(saved)) { lock(''); return; }
    try {
      if (!(await checkKey(saved))) {
        ls.del(SAVED.key);
        lock('비밀 문구가 바뀌었어요. 새 문구를 입력해 주세요.');
        return;
      }
    } catch (err) {
      fail(failure(err));
      return;
    }
    await loadItems();
  }

  function lock(message) {
    roomKey = '';
    state.items = [];
    state.selectedId = null;
    state.phase = 'locked';
    closeDialogs();
    render();
    els.lockInput.value = '';
    showLockError(message);
    setTimeout(() => els.lockInput.focus(), 50);
  }

  function showLockError(message) {
    els.lockError.innerHTML = message ? `${led('warn')}<span>${esc(message)}</span>` : '';
    els.lockError.hidden = !message;
  }

  async function onLockSubmit(e) {
    e.preventDefault();
    const phrase = els.lockInput.value;
    if (!phrase.trim()) { els.lockInput.focus(); return; }
    els.lockSubmit.disabled = true;
    els.lockSubmit.textContent = '확인 중…';
    try {
      const hash = await sha256Hex(phrase);
      if (!(await checkKey(hash))) {
        roomKey = '';
        showLockError('비밀 문구가 달라요. 대소문자와 띄어쓰기를 확인해 주세요.');
        els.lockInput.select();
        return;
      }
      ls.set(SAVED.key, hash);
      els.lockInput.value = '';
      showLockError('');
      await loadItems();
    } catch (err) {
      roomKey = '';
      const kind = classify(err);
      showLockError(kind === 'network' ? '연결하지 못했어요. 인터넷을 확인해 주세요.'
        : kind === 'setup' ? 'Supabase 설정(설정안내 3단계 명령문)을 먼저 해주세요.'
          : kind === 'apikey' ? 'config.js의 열쇠(key)를 확인해 주세요.'
            : '확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      els.lockSubmit.disabled = false;
      els.lockSubmit.textContent = '열기';
    }
  }

  function toggleLockShow() {
    const show = els.lockInput.type === 'password';
    els.lockInput.type = show ? 'text' : 'password';
    els.lockShow.setAttribute('aria-pressed', String(show));
    els.lockShow.setAttribute('aria-label', show ? '문구 가리기' : '문구 보기');
    els.lockShow.innerHTML = icon(show ? 'eye-slash' : 'eye');
    els.lockInput.focus();
  }

  function retry() {
    if (state.mode === 'remote') startRemote();
    else loadItems();
  }

  // 다른 기기에서 바꾼 내용: 이 탭으로 돌아오면 조용히 새로 불러와요
  async function onVisible() {
    if (document.visibilityState !== 'visible') return;
    if (state.mode !== 'remote' || state.phase !== 'ready') return;
    if (Date.now() - state.loadedAt < 30000 || document.querySelector('dialog[open]')) return;
    try {
      state.items = await store.list();
      state.loadedAt = Date.now();
      if (state.selectedId && !selectedItem()) state.selectedId = null;
      render();
    } catch (_) { /* 다음에 다시 */ }
  }

  function onGlobalKeydown(e) {
    if (e.key === 'Escape' && !els.menu.hidden) {
      toggleMenu(false);
      els.menuBtn.focus();
      return;
    }
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (state.phase !== 'ready' || document.querySelector('dialog[open]')) return;
    e.preventDefault();
    els.search.focus();
  }

  /* ── 시작 ───────────────────────────────────────────── */

  function cacheEls() {
    const ids = [
      'banner', 'summary', 'search', 'searchClear', 'inventory', 'panel', 'menu', 'menuBtn', 'menuNote', 'addBtn',
      'sheet', 'sheetBody', 'formDialog', 'itemForm', 'formTitle', 'formBody', 'fName', 'nameHint', 'catChips',
      'formIcon', 'iconAuto', 'iconToggle', 'iconReset', 'iconGrid', 'fLocation', 'locChips', 'fQty', 'statusChips',
      'fMemo', 'formAdded', 'formError', 'formDelete', 'formSave', 'askDialog', 'toast', 'restoreInput',
      'lockForm', 'lockInput', 'lockShow', 'lockSubmit', 'lockError',
    ];
    for (const id of ids) els[id] = document.getElementById(id);
  }

  function buildStatic() {
    els.catChips.innerHTML = CATEGORIES
      .map((c) => `<label class="chip"><input type="radio" name="category" value="${c.name}">${icon(c.icon)}<span>${c.name}</span></label>`).join('');
    els.statusChips.innerHTML = STATUSES
      .map((s) => `<label class="chip"><input type="radio" name="status" value="${s.name}">${led(s.led)}<span>${s.name}</span></label>`).join('');
    els.iconGrid.innerHTML = ICON_GROUPS
      .map(([name, list]) => `<p class="icon-group">${esc(name)}</p>${list
        .map((n) => `<button type="button" class="icon-opt" data-icon="${n}" aria-label="${n}" title="${n}">${icon(n)}</button>`).join('')}`).join('');
  }

  function computeCols() {
    const w = els.inventory.clientWidth || window.innerWidth - 32;
    const gap = 8;
    const min = w < 560 ? 76 : 88;
    return Math.max(3, Math.min(10, Math.floor((w + gap) / (min + gap))));
  }

  function onResize() {
    const cols = computeCols();
    if (cols === state.cols) return;
    state.cols = cols;
    els.inventory.style.setProperty('--cols', cols);
    if (state.phase === 'ready' && state.view === 'grid') renderInventory();
  }

  function bindEvents() {
    for (const b of $$('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
    for (const b of $$('[data-tab]')) b.addEventListener('click', () => setTab(b.dataset.tab));

    els.search.addEventListener('input', () => {
      state.query = els.search.value;
      renderChrome();
      renderInventory();
    });
    els.search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.search.value) { e.preventDefault(); clearSearch(); }
      // 폰 키보드의 '검색'을 누르면 키보드를 내려 결과가 보이게
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) els.search.blur();
    });
    els.searchClear.addEventListener('click', () => { clearSearch(); els.search.focus(); });
    els.summary.addEventListener('click', (e) => {
      const b = e.target.closest('[data-jump]');
      if (b) jumpToStatus(b.dataset.jump);
    });

    els.addBtn.addEventListener('click', () => openForm('add'));
    els.menuBtn.addEventListener('click', () => toggleMenu(els.menu.hidden));
    els.menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-menu]');
      if (b) runMenu(b.dataset.menu);
    });
    document.addEventListener('click', (e) => {
      if (!els.menu.hidden && !e.target.closest('.menu-wrap')) toggleMenu(false);
    });

    els.inventory.addEventListener('click', onInventoryClick);
    els.panel.addEventListener('click', onDetailClick);
    els.sheetBody.addEventListener('click', onDetailClick);
    els.sheet.addEventListener('click', (e) => { if (e.target === els.sheet) els.sheet.close(); });
    els.sheet.addEventListener('close', onSheetClose);
    for (const b of $$('[data-close]')) b.addEventListener('click', () => b.closest('dialog').close());
    enableSwipeClose(els.sheet);

    els.itemForm.addEventListener('submit', onFormSubmit);
    els.itemForm.addEventListener('keydown', onFormKeydown);
    els.itemForm.addEventListener('click', (e) => {
      const s = e.target.closest('[data-step]');
      if (s) stepQty(Number(s.dataset.step));
    });
    els.fName.addEventListener('input', () => { renderNameHint(); updateSaveState(); });
    els.fLocation.addEventListener('input', renderLocChips);
    els.fQty.addEventListener('blur', () => { els.fQty.value = clampQty(els.fQty.value); });
    els.locChips.addEventListener('click', (e) => {
      const b = e.target.closest('[data-loc]');
      if (!b) return;
      els.fLocation.value = b.dataset.loc;
      renderLocChips();
    });
    els.catChips.addEventListener('change', renderFormIcon);
    els.iconToggle.addEventListener('click', () => toggleIconGrid());
    els.iconReset.addEventListener('click', () => { form.icon = null; renderFormIcon(); });
    els.iconGrid.addEventListener('click', onIconPick);
    els.formDelete.addEventListener('click', onFormDelete);

    els.restoreInput.addEventListener('change', () => {
      const file = els.restoreInput.files?.[0];
      els.restoreInput.value = '';
      if (file) restore(file);
    });

    els.lockForm.addEventListener('submit', onLockSubmit);
    els.lockShow.addEventListener('click', toggleLockShow);

    document.addEventListener('keydown', onGlobalKeydown);
    document.addEventListener('visibilitychange', onVisible);
    desktop.addEventListener('change', onLayoutChange);
    new ResizeObserver(onResize).observe(els.inventory);
  }

  function init() {
    cacheEls();
    restorePrefs();
    buildStatic();
    bindEvents();
    state.cols = computeCols();
    els.inventory.style.setProperty('--cols', state.cols);

    config = readConfig();
    if (config.status === 'empty') {
      state.mode = 'preview';
      store = previewStore;
      loadItems();
    } else if (config.status === 'invalid') {
      state.mode = 'remote';
      fail({ kind: 'config' });
    } else {
      startRemote();
    }
  }

  init();
})();
