/*
 * ROOMY — 내 방 물건 인벤토리
 * 화면 동작(추가·검색·모아보기·장소/카테고리 관리·백업·잠금)을 담당하는 파일이에요.
 * 연결 정보는 config.js, 아이콘 목록은 icons.js, 디자인(색·글꼴·모양)은 style.css 에 있어요.
 */
(() => {
  'use strict';

  /* ── 기본값 ─────────────────────────────────────────── */

  const APP_NAME = 'ROOMY';
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.min.js';
  const KEY_HEADER = 'x-room-key';
  const PATH_SEP = ' › '; // 큰 장소 › 세부 위치
  const SAVED = {
    items: 'roomy.preview.items',
    locations: 'roomy.preview.locations',
    categories: 'roomy.preview.categories',
    key: 'roomy.key',
    view: 'roomy.view',
    tab: 'roomy.tab',
    collapsed: 'roomy.collapsed',
  };

  // 처음 쓸 때 들어 있는 카테고리 (이름·아이콘·순서는 바꿀 수 있어요)
  const DEFAULT_CATEGORIES = [
    { name: '문구', icon: 'pencil-simple' },
    { name: '전자기기', icon: 'device-mobile' },
    { name: '옷', icon: 't-shirt' },
    { name: '화장품', icon: 'drop' },
    { name: '생활용품', icon: 'house' },
    { name: '기타', icon: 'package' },
  ];
  const FALLBACK_CATEGORY = '기타'; // 지운 카테고리의 물건이 가는 곳
  const STATUSES = [
    { name: '자주 씀', led: 'on' },
    { name: '가끔 씀', led: 'half' },
    { name: '안 씀', led: 'off' },
    { name: '처분 예정', led: 'warn' },
  ];
  const DEFAULT_STATUS = '가끔 씀';
  const NO_LOCATION = '위치 미정';
  const GROUP_LABELS = { all: 'ALL', location: 'LOCATION', category: 'CATEGORY', status: 'STATUS' };

  // 아이콘 목록 (icons.js). 혹시 못 불러왔을 때를 위한 작은 목록도 둬요
  const ICON_GROUPS = Array.isArray(window.ROOMY_ICONS) && window.ROOMY_ICONS.length
    ? window.ROOMY_ICONS
    : [['기본', DEFAULT_CATEGORIES.map((c) => [c.icon, c.name])]];
  const OTHER_ICONS = typeof window.ROOMY_OTHER_ICONS === 'string' ? window.ROOMY_OTHER_ICONS.split(' ') : [];
  const ICON_NAMES = new Map();
  for (const [, list] of ICON_GROUPS) for (const [name, ko] of list) ICON_NAMES.set(name, ko);

  // 장소 아이콘을 고를 때 맨 앞에 보여줄 가구 · 공간 아이콘 (장소 이름으로 찾을 수 있게)
  const PLACE_ICONS = ['장소·가구', [
    ['house-line', '내 방', '방'], ['desk', '책상', ''], ['office-chair', '책상 의자', '의자'], ['bed', '침대', '침대 밑 침실'],
    ['dresser', '서랍장', '협탁 수납장'], ['coat-hanger', '옷장', '행거 드레스룸'], ['archive', '수납장', '서랍 캐비닛'], ['books', '책장', '책꽂이'],
    ['couch', '소파', '거실'], ['armchair', '안락의자', '의자'], ['chair', '의자', ''], ['picnic-table', '식탁', '테이블'],
    ['television-simple', 'TV장', '거실장 티비'], ['lamp', '스탠드', '조명'], ['archive-box', '수납함', '리빙박스'], ['package', '박스', '상자 택배'],
    ['basket', '바구니', ''], ['tray', '트레이', '선반 정리함'], ['treasure-chest', '추억 상자', '보물상자'], ['lockers', '사물함', ''],
    ['vault', '금고', ''], ['suitcase', '캐리어', '여행가방'], ['toolbox', '공구함', ''], ['first-aid-kit', '약상자', '구급함'],
    ['door', '현관', '문 입구'], ['sneaker', '신발장', '신발'], ['bathtub', '욕실', '욕조'], ['toilet', '화장실', ''],
    ['oven', '주방', '부엌'], ['washing-machine', '세탁실', '다용도실 세탁기'], ['potted-plant', '베란다', '발코니 화분'], ['warehouse', '창고', ''],
    ['garage', '차고', ''], ['stairs', '계단', '다락'], ['car', '차', '트렁크'], ['house', '집', ''],
  ]];

  // 임시 저장 모드에서 넣어볼 수 있는 예시 물건
  const SAMPLES = [
    ['가위', '책상 › 서랍 2칸', '문구', 1, '자주 씀', 'scissors', ''],
    ['포스트잇', '책상 › 서랍 2칸', '문구', 5, '가끔 씀', 'sticker', '노랑 3개, 분홍 2개'],
    ['USB 케이블', '책상 › 서랍 2칸', '전자기기', 2, '안 씀', 'usb', '검정, 1m, 충전용'],
    ['무선 이어폰', '책상 › 위', '전자기기', 1, '자주 씀', 'headphones', ''],
    ['건전지 AA', '책상 › 서랍 1칸', '생활용품', 6, '가끔 씀', 'battery-full', ''],
    ['옛날 휴대폰', '책상 › 서랍 1칸', '전자기기', 1, '처분 예정', null, '초기화 완료'],
    ['겨울 니트', '옷장 › 위 박스', '옷', 3, '안 씀', 'hoodie', ''],
    ['전선 뭉치', '옷장 › 위 박스', '기타', 1, '처분 예정', 'plug', '어디 건지 모름'],
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
  const sameName = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
  const byKo = (a, b) => a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
  const bySort = (a, b) => (a.sort - b.sort) || byKo(a.name, b.name);
  const pad3 = (n) => String(n).padStart(3, '0');
  const time = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? 0 : t; };
  const nowIso = () => new Date().toISOString();
  const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const isIconName = (v) => typeof v === 'string' && /^[a-z0-9-]{1,40}$/.test(v);
  const clampQty = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(Math.max(n, 1), 99999) : 1; };
  const toInt = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : 0; };
  // 장소·카테고리 이름: 앞뒤 빈칸 빼고, 경로 구분 기호(›)는 못 쓰게
  const cleanName = (v, max) => String(v ?? '').replace(/›/g, '>').replace(/\s+/g, ' ').trim().slice(0, max);

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

  const status = (name) => STATUSES.find((s) => s.name === name) || STATUSES[1];
  const led = (kind) => `<span class="led led--${kind}" aria-hidden="true"></span>`;
  const icon = (name, cls = '') => `<i class="ph ph-${name}${cls ? ` ${cls}` : ''}" aria-hidden="true"></i>`;
  const label = (en, ko) => `<span class="lbl">${en}${ko ? `<span class="lbl-ko">${ko}</span>` : ''}</span>`;
  const placeOf = (item) => item.location || NO_LOCATION;
  const shortLine = (i) => `${esc(i.name)} · ${esc(placeOf(i))} · ${i.quantity}개`;
  const nextSort = (list) => list.reduce((m, x) => Math.max(m, x.sort), 0) + 1;

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
      category: String(raw.category ?? '').trim().slice(0, 30) || FALLBACK_CATEGORY,
      quantity: clampQty(raw.quantity),
      status: status(raw.status).name,
      icon: isIconName(raw.icon) ? raw.icon : null,
      memo: String(raw.memo ?? '').slice(0, 1000),
      created_at: created,
      updated_at: time(raw.updated_at) ? raw.updated_at : created,
    };
  }

  function cleanLoc(raw) {
    const name = cleanName(raw?.name, 40);
    if (!name) return null;
    return {
      id: isUuid(raw.id) ? raw.id.toLowerCase() : uuid(),
      parent_id: isUuid(raw.parent_id) ? raw.parent_id.toLowerCase() : null,
      name,
      icon: isIconName(raw.icon) ? raw.icon : null,
      sort: toInt(raw.sort),
    };
  }

  function cleanCat(raw) {
    const name = cleanName(raw?.name, 30);
    if (!name) return null;
    return {
      id: isUuid(raw.id) ? raw.id.toLowerCase() : uuid(),
      name,
      icon: isIconName(raw.icon) ? raw.icon : 'package',
      sort: toInt(raw.sort),
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
  const userError = (message) => Object.assign(new Error(message), { code: 'P0001' });
  const dupError = () => Object.assign(new Error('같은 이름이 이미 있어요'), { code: '23505' });

  /* ── 저장소 ① 임시 저장 모드 (이 브라우저 안) ───────── */

  const previewStore = {
    items: null,
    locs: null,
    cats: null,
    all() {
      if (!this.items) {
        const raw = ls.get(SAVED.items, []);
        this.items = Array.isArray(raw) ? raw.map(clean).filter(Boolean) : [];
      }
      return this.items;
    },
    allLocs() {
      if (!this.locs) {
        const raw = ls.get(SAVED.locations, []);
        this.locs = Array.isArray(raw) ? raw.map(cleanLoc).filter(Boolean) : [];
      }
      return this.locs;
    },
    allCats() {
      if (!this.cats) {
        const raw = ls.get(SAVED.categories, null);
        this.cats = Array.isArray(raw)
          ? raw.map(cleanCat).filter(Boolean)
          : DEFAULT_CATEGORIES.map((c, i) => cleanCat({ ...c, sort: i + 1 }));
        if (!Array.isArray(raw)) this.saveCats();
      }
      return this.cats;
    },
    save() { ls.set(SAVED.items, this.items); },
    saveLocs() { ls.set(SAVED.locations, this.locs); },
    saveCats() { ls.set(SAVED.categories, this.cats); },

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

    // 장소 (Supabase 명령문과 똑같이 동작하게 맞춰 뒀어요)
    async listLocations() { return this.allLocs().map((l) => ({ ...l })); },
    async addLocation(row) {
      const locs = this.allLocs();
      const name = cleanName(row.name, 40);
      const parent = row.parent_id || null;
      if (!name) throw userError('이름을 적어주세요');
      if (parent) {
        const p = locs.find((l) => l.id === parent);
        if (!p) throw notFound();
        if (p.parent_id) throw userError('세부 위치 안에는 또 넣을 수 없어요 (2단계까지)');
      }
      if (locs.some((l) => l.parent_id === parent && sameName(l.name, name))) throw dupError();
      const loc = cleanLoc({ id: uuid(), parent_id: parent, name, sort: row.sort, icon: row.icon });
      locs.push(loc);
      this.saveLocs();
      return { ...loc };
    },
    async patchLocation(id, patch) {
      const loc = this.allLocs().find((l) => l.id === id);
      if (!loc) throw notFound();
      if ('sort' in patch) loc.sort = toInt(patch.sort);
      if ('icon' in patch) loc.icon = isIconName(patch.icon) ? patch.icon : null;
      this.saveLocs();
      return { ...loc };
    },
    pathOf(loc) {
      const parent = loc.parent_id ? this.allLocs().find((l) => l.id === loc.parent_id) : null;
      return parent ? `${parent.name}${PATH_SEP}${loc.name}` : loc.name;
    },
    repath(oldPath, newPath, withSpots) {
      for (const it of this.all()) {
        let next = null;
        if (it.location === oldPath) next = newPath;
        else if (withSpots && it.location.startsWith(oldPath + PATH_SEP)) next = newPath + it.location.slice(oldPath.length);
        if (next !== null) { it.location = next; it.updated_at = nowIso(); }
      }
    },
    async renameLocation(id, newName) {
      const locs = this.allLocs();
      const loc = locs.find((l) => l.id === id);
      if (!loc) throw notFound();
      const name = cleanName(newName, 40);
      if (!name) throw userError('이름을 적어주세요');
      if (locs.some((l) => l.id !== id && l.parent_id === loc.parent_id && sameName(l.name, name))) throw dupError();
      const oldPath = this.pathOf(loc);
      loc.name = name;
      this.repath(oldPath, this.pathOf(loc), !loc.parent_id);
      this.saveLocs();
      this.save();
    },
    async moveLocation(id, parentId, newName) {
      const locs = this.allLocs();
      const loc = locs.find((l) => l.id === id);
      if (!loc) throw notFound();
      const parent = parentId || null;
      if (parent) {
        if (parent === id) throw userError('자기 안에는 넣을 수 없어요');
        const target = locs.find((l) => l.id === parent && !l.parent_id);
        if (!target) throw notFound();
        if (locs.some((l) => l.parent_id === id)) throw userError('세부 위치가 있는 장소는 다른 장소 안에 넣을 수 없어요');
      }
      const name = cleanName(newName, 40) || loc.name;
      if (locs.some((l) => l.id !== id && l.parent_id === parent && sameName(l.name, name))) throw dupError();
      const wasPlace = !loc.parent_id;
      const oldPath = this.pathOf(loc);
      loc.parent_id = parent;
      loc.name = name;
      this.repath(oldPath, this.pathOf(loc), wasPlace && !parent);
      this.saveLocs();
      this.save();
    },
    async deleteLocation(id) {
      const locs = this.allLocs();
      const loc = locs.find((l) => l.id === id);
      if (!loc) throw notFound();
      if (!loc.parent_id) {
        for (const it of this.all()) {
          if (it.location === loc.name || it.location.startsWith(loc.name + PATH_SEP)) { it.location = ''; it.updated_at = nowIso(); }
        }
        this.locs = locs.filter((l) => l.id !== id && l.parent_id !== id);
      } else {
        const parent = locs.find((l) => l.id === loc.parent_id);
        this.repath(this.pathOf(loc), parent ? parent.name : '', false);
        this.locs = locs.filter((l) => l.id !== id);
      }
      this.saveLocs();
      this.save();
    },

    // 카테고리
    async listCategories() { return this.allCats().map((c) => ({ ...c })); },
    async addCategory(row) {
      const cats = this.allCats();
      const name = cleanName(row.name, 30);
      if (!name) throw userError('이름을 적어주세요');
      if (cats.some((c) => sameName(c.name, name))) throw dupError();
      const cat = cleanCat({ id: uuid(), name, icon: row.icon, sort: row.sort });
      cats.push(cat);
      this.saveCats();
      return { ...cat };
    },
    async patchCategory(id, patch) {
      const cat = this.allCats().find((c) => c.id === id);
      if (!cat) throw notFound();
      if ('sort' in patch) cat.sort = toInt(patch.sort);
      if ('icon' in patch && isIconName(patch.icon)) cat.icon = patch.icon;
      this.saveCats();
      return { ...cat };
    },
    async renameCategory(id, newName) {
      const cats = this.allCats();
      const cat = cats.find((c) => c.id === id);
      if (!cat) throw notFound();
      const name = cleanName(newName, 30);
      if (!name) throw userError('이름을 적어주세요');
      if (cat.name === FALLBACK_CATEGORY) throw userError('‘기타’는 이름을 바꿀 수 없어요');
      if (cats.some((c) => c.id !== id && sameName(c.name, name))) throw dupError();
      for (const it of this.all()) if (it.category === cat.name) { it.category = name; it.updated_at = nowIso(); }
      cat.name = name;
      this.saveCats();
      this.save();
    },
    async deleteCategory(id) {
      const cats = this.allCats();
      const cat = cats.find((c) => c.id === id);
      if (!cat) throw notFound();
      if (cat.name === FALLBACK_CATEGORY) throw userError('‘기타’는 지울 수 없어요');
      if (!cats.some((c) => c.name === FALLBACK_CATEGORY)) cats.push(cleanCat({ name: FALLBACK_CATEGORY, icon: 'package', sort: 1000 }));
      for (const it of this.all()) if (it.category === cat.name) { it.category = FALLBACK_CATEGORY; it.updated_at = nowIso(); }
      this.cats = cats.filter((c) => c.id !== id);
      this.saveCats();
      this.save();
    },
  };

  /* ── 저장소 ② Supabase ─────────────────────────────── */

  let roomKey = ''; // 비밀 문구를 바꾼 값(해시). 요청마다 함께 보내요

  const remoteStore = {
    client: null,
    table(name = 'items') { return this.client.from(name); },
    async run(promise) {
      const { data, error } = await promise;
      if (error) throw error;
      return data;
    },
    async list() {
      const all = [];
      const size = 1000;
      for (let from = 0; ; from += size) {
        const data = await this.run(this.table().select('*')
          .order('created_at', { ascending: false }).order('id')
          .range(from, from + size - 1));
        all.push(...data);
        if (data.length < size) break;
      }
      return all.map(clean).filter(Boolean);
    },
    async create(item) {
      const data = await this.run(this.table().insert(toRow(item)).select());
      if (!data.length) throw notFound();
      return clean(data[0]);
    },
    async update(id, patch) {
      const data = await this.run(this.table().update(patch).eq('id', id).select());
      if (!data.length) throw notFound();
      return clean(data[0]);
    },
    async remove(id) {
      const data = await this.run(this.table().delete().eq('id', id).select('id'));
      if (!data.length) throw notFound();
    },
    async insertMany(rows) {
      const out = [];
      for (let i = 0; i < rows.length; i += 500) {
        out.push(...await this.run(this.table().insert(rows.slice(i, i + 500).map((r) => toRow(r, true))).select()));
      }
      return out.map(clean).filter(Boolean);
    },

    async listLocations() {
      return (await this.run(this.table('locations').select('*'))).map(cleanLoc).filter(Boolean);
    },
    async addLocation(row) {
      const body = { name: cleanName(row.name, 40), parent_id: row.parent_id || null, sort: toInt(row.sort) };
      if (isIconName(row.icon)) body.icon = row.icon;
      const data = await this.run(this.table('locations').insert(body).select('*'));
      if (!data.length) throw notFound();
      return cleanLoc(data[0]);
    },
    async patchLocation(id, patch) {
      const body = {};
      if ('sort' in patch) body.sort = toInt(patch.sort);
      if ('icon' in patch) body.icon = isIconName(patch.icon) ? patch.icon : null;
      const data = await this.run(this.table('locations').update(body).eq('id', id).select('id'));
      if (!data.length) throw notFound();
    },
    async renameLocation(id, name) { await this.run(this.client.rpc('rename_location', { loc: id, new_name: name })); },
    async moveLocation(id, parentId, name) {
      await this.run(this.client.rpc('move_location', { loc: id, new_parent: parentId || null, new_name: name || null }));
    },
    async deleteLocation(id) { await this.run(this.client.rpc('delete_location', { loc: id })); },

    async listCategories() {
      return (await this.run(this.table('categories').select('*'))).map(cleanCat).filter(Boolean);
    },
    async addCategory(row) {
      const data = await this.run(this.table('categories')
        .insert({ name: cleanName(row.name, 30), icon: isIconName(row.icon) ? row.icon : 'package', sort: toInt(row.sort) })
        .select('*'));
      if (!data.length) throw notFound();
      return cleanCat(data[0]);
    },
    async patchCategory(id, patch) {
      const body = {};
      if ('sort' in patch) body.sort = toInt(patch.sort);
      if ('icon' in patch && isIconName(patch.icon)) body.icon = patch.icon;
      const data = await this.run(this.table('categories').update(body).eq('id', id).select('id'));
      if (!data.length) throw notFound();
    },
    async renameCategory(id, name) { await this.run(this.client.rpc('rename_category', { cat: id, new_name: name })); },
    async deleteCategory(id) { await this.run(this.client.rpc('delete_category', { cat: id })); },
  };

  let store = previewStore;
  let config = { status: 'empty' };

  /* ── 상태 ───────────────────────────────────────────── */

  const state = {
    mode: 'preview', // preview | remote
    phase: 'loading', // loading | ready | error | locked
    error: null,
    items: [],
    locations: [],
    categories: [],
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

  /* ── 장소 · 카테고리 목록 ───────────────────────────── */

  const places = () => state.locations.filter((l) => !l.parent_id).sort(bySort);
  const spotsOf = (id) => state.locations.filter((l) => l.parent_id === id).sort(bySort);
  const locById = (id) => (id && state.locations.find((l) => l.id === id)) || null;
  const categoriesSorted = () => [...state.categories].sort(bySort);

  function pathOf(loc) {
    if (!loc) return '';
    const parent = locById(loc.parent_id);
    return parent ? `${parent.name}${PATH_SEP}${loc.name}` : loc.name;
  }

  function splitPath(text) {
    const s = String(text ?? '');
    const i = s.indexOf(PATH_SEP);
    return i < 0 ? [s.trim(), ''] : [s.slice(0, i).trim(), s.slice(i + PATH_SEP.length).trim()];
  }

  // 같은 이름 → 대소문자만 다른 이름 → 띄어쓰기만 다른 이름 순서로 찾아요
  function findNamed(list, name) {
    return list.find((x) => x.name === name) || list.find((x) => sameName(x.name, name)) || list.find((x) => norm(x.name) === norm(name)) || null;
  }

  const findPlace = (name) => findNamed(places(), name);
  const findSpot = (placeId, name) => findNamed(spotsOf(placeId), name);
  const findCategory = (name) => findNamed(state.categories, name);
  const categoryIcon = (name) => findCategory(name)?.icon || 'package';
  const iconOf = (item) => (isIconName(item.icon) ? item.icon : categoryIcon(item.category));
  const locIcon = (item) => { const r = resolve(item); return r.spot?.icon || r.place?.icon || null; };

  // 물건에 적힌 위치 글자 → 장소 목록의 큰 장소 · 세부 위치
  function resolve(item) {
    const [p, s] = splitPath(item.location);
    const place = p ? findPlace(p) : null;
    const spot = place && s ? findSpot(place.id, s) : null;
    return { place, spot };
  }

  // 물건에 적혀 있는데 목록에 없는 장소·카테고리는 목록에 넣어요 (예전 데이터, 백업 불러오기 등)
  // 이렇게 생긴 장소는 순서 0 → 이름 순서로 보여요 (직접 위·아래로 바꿀 수 있어요)
  async function ensureRegistry() {
    const wanted = new Set(state.items.map((i) => i.category));
    wanted.add(FALLBACK_CATEGORY);
    for (const name of wanted) {
      if (findCategory(name)) continue;
      try {
        state.categories.push(await store.addCategory({ name, icon: 'package', sort: name === FALLBACK_CATEGORY ? 1000 : nextSort(state.categories) }));
      } catch (_) { /* 다음에 다시 */ }
    }
    for (const it of state.items) {
      const [p, s] = splitPath(it.location);
      if (!p) continue;
      let place = findPlace(p);
      if (!place) {
        try {
          place = await store.addLocation({ name: p, parent_id: null, sort: 0 });
          state.locations.push(place);
        } catch (_) { continue; }
      }
      if (s && !findSpot(place.id, s)) {
        try {
          state.locations.push(await store.addLocation({ name: s, parent_id: place.id, sort: 0 }));
        } catch (_) { /* 다음에 다시 */ }
      }
    }
  }

  /* ── 묶기 (가방 만들기) ─────────────────────────────── */

  // 위치는 '›' 를 빼고 비교해요 → '책상 서랍' 으로도 '책상 › 서랍 2칸' 을 찾아요
  const matches = (item, q) => norm(item.name).includes(q) || norm(item.location.replace(/›/g, '')).includes(q);

  // 전체 · 상태별
  function groupBy(items, by) {
    if (by === 'all') {
      return [{ key: 'all', items: [...items].sort((a, b) => time(b.created_at) - time(a.created_at)) }];
    }
    return STATUSES.map((s) => ({ key: s.name, items: items.filter((i) => i.status === s.name).sort((a, b) => byKo(a.name, b.name)) }))
      .filter((g) => g.items.length);
  }

  const isCollapsed = (by, key) => (state.collapsed[by] || []).includes(key);

  function toggleCollapsed(by, key) {
    const set = new Set(state.collapsed[by] || []);
    if (set.has(key)) set.delete(key); else set.add(key);
    state.collapsed[by] = [...set];
    ls.set(SAVED.collapsed, state.collapsed);
  }

  function expand(by, key) {
    if (isCollapsed(by, key)) toggleCollapsed(by, key);
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

    const q = norm(state.query);
    if (q) {
      // 찾는 중에는 어느 탭이든 위치별로 묶어요 (찾는 이유가 '어디 있지?'니까)
      const items = state.items.filter((i) => matches(i, q));
      box.innerHTML = items.length
        ? `<p class="note">↳ ‘${esc(state.query.trim())}’ 찾은 물건 ${items.length}개 · 위치별로 묶었어요</p>${searchBags(items)}`
        : noMatchView(state.query.trim());
      return;
    }
    if (state.tab === 'location') { box.innerHTML = locationBags(); return; }
    if (state.tab === 'category') { box.innerHTML = categoryBags(); return; }
    if (!state.items.length) { box.innerHTML = emptyView(); return; }
    box.innerHTML = groupBy(state.items, state.tab).map((g) => (state.tab === 'all'
      ? bagShell({ by: 'all', key: 'all', title: '<span class="bag-text">전체</span>', count: g.items.length, body: bodyView(g.items, { all: true }, true) })
      : bagShell({
        by: 'status',
        key: g.key,
        title: `${led(status(g.key).led)}<span class="bag-text">${esc(g.key)}</span>`,
        count: g.items.length,
        collapsible: true,
        body: bodyView(g.items, { status: g.key, where: g.key }, true, 'status'),
      }))).join('');
  }

  // 가방 한 개: 제목 줄(+ ⋯ 관리 버튼) + 내용
  function bagShell({ by, key, title, count, body, collapsible = false, manage = '', unset = false }) {
    const collapsed = collapsible && isCollapsed(by, key);
    const head = `
      ${label(GROUP_LABELS[by])}
      <span class="bag-dash" aria-hidden="true"></span>
      <span class="bag-title${unset ? ' is-unset' : ''}">${title}</span>
      <span class="bag-rule" aria-hidden="true"></span>
      <span class="bag-count">${count}</span>
      ${collapsible ? icon('caret-down', 'bag-caret') : ''}`;
    const headEl = collapsible
      ? `<button type="button" class="bag-head" data-toggle="${esc(key)}" aria-expanded="${!collapsed}">${head}</button>`
      : `<div class="bag-head">${head}</div>`;
    const row = manage ? `<div class="bag-row">${headEl}${manage}</div>` : headEl;
    return `<section class="bag${collapsed ? ' is-collapsed' : ''}" data-by="${by}" data-key="${esc(key)}">${row}${collapsed ? '' : body}</section>`;
  }

  const moreButton = (attr, id, name) => `<button type="button" class="key key--icon key--flat bag-more" ${attr}="${id}" aria-label="${esc(name)} 설정" title="설정">${icon('dots-three')}</button>`;

  // 격자 또는 목록. prefill = 빈 칸을 눌렀을 때 미리 채울 값
  function bodyView(items, prefill, withEmpties, by = 'all') {
    return state.view === 'grid' ? gridView(items, prefill, withEmpties) : listView(items, by);
  }

  function gridView(items, prefill, withEmpties) {
    let empties = '';
    if (withEmpties) {
      // 점선 빈 칸: 마지막 줄을 채울 만큼 (최소 1개). 누르면 이 가방으로 바로 추가
      const n = items.length;
      const count = prefill.all ? 1 : (state.cols - (n % state.cols)) % state.cols || 1;
      const attrs = [
        prefill.placeId && ` data-place="${prefill.placeId}"`,
        prefill.spotId && ` data-spot="${prefill.spotId}"`,
        prefill.category && ` data-category="${esc(prefill.category)}"`,
        prefill.status && ` data-status-prefill="${esc(prefill.status)}"`,
      ].filter(Boolean).join('');
      const aria = prefill.where ? `${prefill.where}에 새 물건 추가` : '새 물건 추가';
      for (let i = 0; i < count; i += 1) {
        empties += i === 0
          ? `<button type="button" class="slot slot--empty"${attrs} aria-label="${esc(aria)}">${icon('plus')}</button>`
          : `<span class="slot slot--empty"${attrs} aria-hidden="true"></span>`;
      }
    }
    return `<div class="grid">${items.map(slotView).join('')}${empties}</div>`;
  }

  function slotView(it) {
    const st = status(it.status);
    const lit = st.led === 'on' || st.led === 'warn';
    const cls = ['slot', it.id === state.selectedId && 'is-selected', it.id === state.flashId && 'is-new'].filter(Boolean).join(' ');
    const aria = `${it.name}, ${it.quantity}개, ${it.status}, ${placeOf(it)}`;
    return `<button type="button" class="${cls}" data-id="${it.id}" title="${esc(it.name)}" aria-label="${esc(aria)}">${lit ? led(st.led) : ''}${icon(iconOf(it), 'slot-icon')}<span class="slot-name">${esc(it.name)}</span><span class="slot-qty">${it.quantity > 1 ? `×${it.quantity}` : ''}</span></button>`;
  }

  function listView(items, by) {
    if (!items.length) return '';
    const rows = items.map((it) => {
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

  // 위치별: 큰 장소 = 가방, 세부 위치 = 가방 안 주머니
  function locationBags() {
    const byName = (a, b) => byKo(a.name, b.name);
    const res = new Map(state.items.map((i) => [i.id, resolve(i)]));
    let html = '';
    for (const place of places()) {
      const inPlace = state.items.filter((i) => res.get(i.id).place === place);
      const direct = inPlace.filter((i) => !res.get(i.id).spot).sort(byName);
      const spots = spotsOf(place.id);
      let body = '';
      if (direct.length || !spots.length) {
        const head = spots.length
          ? `<div class="pocket-row"><span class="pocket-head is-direct"><span class="row-arrow" aria-hidden="true">↳</span><span class="bag-text">${esc(place.name)}에 바로</span><span class="bag-rule" aria-hidden="true"></span><span class="bag-count">${direct.length}</span></span></div>`
          : '';
        body += `${head}${bodyView(direct, { placeId: place.id, where: place.name }, true, 'location')}`;
      }
      for (const spot of spots) {
        const list = inPlace.filter((i) => res.get(i.id).spot === spot).sort(byName);
        body += `<div class="pocket">
          <div class="pocket-row">
            <span class="pocket-head"><span class="row-arrow" aria-hidden="true">↳</span>${spot.icon ? icon(spot.icon) : ''}<span class="bag-text">${esc(spot.name)}</span><span class="bag-rule" aria-hidden="true"></span><span class="bag-count">${list.length}</span></span>
            ${moreButton('data-manage-spot', spot.id, spot.name)}
          </div>
          ${bodyView(list, { placeId: place.id, spotId: spot.id, where: pathOf(spot) }, true, 'location')}
        </div>`;
      }
      body += `<button type="button" class="add-line" data-new-spot="${place.id}">${icon('plus')}세부 위치 추가</button>`;
      html += bagShell({
        by: 'location',
        key: place.id,
        title: `${place.icon ? icon(place.icon) : ''}<span class="bag-text">${esc(place.name)}</span>`,
        count: inPlace.length,
        collapsible: true,
        manage: moreButton('data-manage-place', place.id, place.name),
        body,
      });
    }
    // 목록에 없는 위치 글자 (드물어요) · 위치 미정
    const stray = new Map();
    for (const it of state.items) {
      if (!it.location || res.get(it.id).place) continue;
      if (!stray.has(it.location)) stray.set(it.location, []);
      stray.get(it.location).push(it);
    }
    for (const [path, list] of stray) {
      html += bagShell({ by: 'location', key: `stray:${path}`, title: `<span class="bag-text">${esc(path)}</span>`, count: list.length, collapsible: true, body: bodyView(list.sort(byName), {}, false, 'location') });
    }
    const none = state.items.filter((i) => !i.location).sort(byName);
    if (none.length) {
      html += bagShell({ by: 'location', key: '', title: `<span class="bag-text">${NO_LOCATION}</span>`, count: none.length, collapsible: true, unset: true, body: bodyView(none, { where: NO_LOCATION }, true, 'location') });
    }
    if (!places().length && !state.items.length) {
      html += '<div class="state"><p class="state-title">NO PLACES</p><p>아직 장소가 없어요. 책상, 옷장처럼 물건을 두는 곳을 먼저 만들어 보세요.</p></div>';
    }
    return `${html}<button type="button" class="add-line add-line--bag" data-new-place>${icon('plus')}새 장소 만들기</button>`;
  }

  // 카테고리별: 만든 카테고리는 비어 있어도 보여요
  function categoryBags() {
    const byName = (a, b) => byKo(a.name, b.name);
    const groups = new Map(state.categories.map((c) => [c.id, []]));
    const rest = [];
    for (const it of state.items) {
      const cat = findCategory(it.category);
      if (cat) groups.get(cat.id).push(it); else rest.push(it);
    }
    let html = categoriesSorted().map((cat) => {
      const list = groups.get(cat.id).sort(byName);
      return bagShell({
        by: 'category',
        key: cat.id,
        title: `${icon(cat.icon)}<span class="bag-text">${esc(cat.name)}</span>`,
        count: list.length,
        collapsible: true,
        manage: moreButton('data-manage-category', cat.id, cat.name),
        body: bodyView(list, { category: cat.name, where: cat.name }, true, 'category'),
      });
    }).join('');
    if (rest.length) {
      html += bagShell({ by: 'category', key: 'stray', title: '<span class="bag-text">목록에 없는 카테고리</span>', count: rest.length, body: bodyView(rest.sort(byName), {}, false, 'category') });
    }
    return `${html}<button type="button" class="add-line add-line--bag" data-new-category>${icon('plus')}새 카테고리 만들기</button>`;
  }

  // 찾기 결과: 장소 목록 순서대로 '큰 장소 › 세부 위치' 묶음
  function searchBags(items) {
    const order = [];
    for (const p of places()) {
      order.push(p.name);
      for (const s of spotsOf(p.id)) order.push(`${p.name}${PATH_SEP}${s.name}`);
    }
    const groups = new Map();
    const icons = new Map();
    for (const it of items) {
      const r = resolve(it);
      const key = r.place ? pathOf(r.spot || r.place) : it.location;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
      icons.set(key, r.spot?.icon || r.place?.icon || null);
    }
    const rank = (k) => (k === '' ? 1e9 : order.includes(k) ? order.indexOf(k) : 1e6);
    return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || byKo(a[0], b[0])).map(([path, list]) => bagShell({
      by: 'location',
      key: `search:${path}`,
      title: `${icons.get(path) ? icon(icons.get(path)) : ''}<span class="bag-text">${esc(path || NO_LOCATION)}</span>`,
      count: list.length,
      unset: !path,
      body: bodyView(list.sort((a, b) => byKo(a.name, b.name)), {}, false, 'location'),
    })).join('');
  }

  function loadingView() {
    return '<div class="state"><p class="state-title">LOADING<span class="dots" aria-hidden="true"></span></p><p>불러오는 중이에요.</p></div>';
  }

  function emptyView() {
    const slots = Array.from({ length: 8 }, (_, i) => (i === 0
      ? `<button type="button" class="slot slot--empty" aria-label="새 물건 추가">${icon('plus')}</button>`
      : '<span class="slot slot--empty" aria-hidden="true"></span>')).join('');
    const sample = state.mode === 'preview'
      ? `<button type="button" class="key key--sm" data-menu="samples-add">${icon('sparkle')}예시 물건 넣어보기</button>`
      : '';
    return `<div class="state"><p class="state-title">EMPTY BAG</p><p>아직 물건이 없어요. 빈 칸이나 <b>＋ 추가</b>를 눌러 시작하세요.</p><p class="hint">↳ 위치별 탭에서 장소(책상, 옷장…)를 먼저 만들어 둘 수도 있어요.</p>${sample}</div><div class="grid">${slots}</div>`;
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
    upgrade: {
      title: 'UPDATE NEEDED',
      text: '앱이 새로워져서 Supabase 명령문을 한 번 더 실행해야 해요.',
      tips: ['supabase.sql 을 고치지 말고 그대로 SQL Editor 에서 다시 실행해 주세요. (설정안내.md 3단계-1단계)', '이미 넣은 물건과 비밀 문구는 그대로 남아요.'],
    },
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
          <div><dt>CATEGORY</dt><dd>${icon(categoryIcon(it.category))}${esc(it.category)}</dd></div>
          <div><dt>LOCATION</dt><dd>${it.location ? `${locIcon(it) ? icon(locIcon(it)) : ''}${esc(it.location)}` : `<span class="unset">${NO_LOCATION}</span>`}</dd></div>
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
    if (!el && !norm(state.query)) {
      if (state.tab === 'location') expand('location', resolve(it).place?.id || '');
      else if (state.tab === 'category') expand('category', findCategory(it.category)?.id || '');
      else if (state.tab === 'status') expand('status', it.status);
      renderInventory();
      el = els.inventory.querySelector(`[data-id="${id}"]`);
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
      openForm('add', null, {
        placeId: empty.dataset.place || null,
        spotId: empty.dataset.spot || null,
        category: empty.dataset.category || null,
        status: empty.dataset.statusPrefill || null,
      });
      return;
    }
    const manage = t.closest('[data-manage-place], [data-manage-spot], [data-manage-category]');
    if (manage) {
      if (manage.dataset.managePlace) managePlace(manage.dataset.managePlace);
      else if (manage.dataset.manageSpot) manageSpot(manage.dataset.manageSpot);
      else manageCategory(manage.dataset.manageCategory);
      return;
    }
    if (t.closest('[data-new-place]')) { newPlace(); return; }
    const newSpotBtn = t.closest('[data-new-spot]');
    if (newSpotBtn) { newSpot(newSpotBtn.dataset.newSpot); return; }
    if (t.closest('[data-new-category]')) { newCategory(); return; }
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

  /* ── 장소 · 카테고리 관리 ───────────────────────────── */

  // 관리 작업을 한 뒤에는 목록을 새로 불러와서 화면을 맞춰요
  async function runOp(op, message) {
    try {
      await op();
    } catch (err) {
      if (!(await maybeLocked(err))) toast(friendlyMessage(err));
      return false;
    }
    await refresh();
    if (message) toast(message);
    return true;
  }

  const countIn = (path, exact) => state.items.filter((i) => i.location === path || (!exact && i.location.startsWith(path + PATH_SEP))).length;

  async function newPlace() {
    const name = await askText({ en: 'NEW PLACE', ko: '새 장소', placeholder: '예: 책상, 옷장, 침대 밑', okText: '만들기', max: 40 });
    if (!name) return;
    const same = findPlace(name);
    if (same) { toast(`‘${same.name}’은(는) 이미 있어요`); return; }
    const picked = await pickIcon(null, `‘${name}’의 아이콘을 골라주세요. (없어도 돼요)`, { place: true, keepText: '아이콘 없이 만들기' });
    if (await runOp(() => store.addLocation({ name, parent_id: null, sort: nextSort(places()), icon: picked || null }), `‘${name}’ 장소를 만들었어요`)) {
      if (state.tab !== 'location') setTab('location');
    }
  }

  async function newSpot(placeId) {
    const place = locById(placeId);
    if (!place) return;
    const name = await askText({ en: 'NEW SPOT', ko: '세부 위치', note: `‘${esc(place.name)}’ 안에 만들어요.`, placeholder: '예: 서랍 1칸, 위 박스', okText: '만들기', max: 40 });
    if (!name) return;
    const same = findSpot(place.id, name);
    if (same) { toast(`‘${pathOf(same)}’은(는) 이미 있어요`); return; }
    expand('location', place.id);
    await runOp(() => store.addLocation({ name, parent_id: place.id, sort: nextSort(spotsOf(place.id)) }), `‘${place.name}${PATH_SEP}${name}’을(를) 만들었어요`);
  }

  async function newCategory() {
    const name = await askText({ en: 'NEW CATEGORY', ko: '새 카테고리', placeholder: '예: 주방용품, 취미', okText: '다음', max: 30 });
    if (!name) return;
    const same = findCategory(name);
    if (same) { toast(`‘${same.name}’은(는) 이미 있어요`); return; }
    const picked = await pickIcon('package', `‘${name}’의 대표 아이콘을 골라주세요.`);
    await runOp(() => store.addCategory({ name, icon: picked || 'package', sort: nextSort(state.categories) }), `‘${name}’ 카테고리를 만들었어요`);
  }

  // 위로 · 아래로: 순서를 1, 2, 3… 으로 다시 매기고 이웃과 자리 바꾸기
  async function reorder(list, id, dir, patch) {
    const i = list.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) { toast(dir < 0 ? '이미 맨 위예요' : '이미 맨 아래예요'); return; }
    const order = list.map((x) => x.id);
    [order[i], order[j]] = [order[j], order[i]];
    await runOp(async () => {
      for (let k = 0; k < order.length; k += 1) {
        const row = list.find((x) => x.id === order[k]);
        if (row.sort !== k + 1) await patch(order[k], { sort: k + 1 });
      }
    });
  }

  // 큰 장소를 다른 장소 안에 넣을 때 '책상 서랍 2칸' → '책상 › 서랍 2칸' 처럼 겹치는 앞말은 빼요
  function stripPrefix(name, parentName) {
    const rest = name.startsWith(`${parentName} `) ? name.slice(parentName.length).trim() : '';
    return rest || name;
  }

  async function managePlace(id) {
    const place = locById(id);
    if (!place) return;
    const spots = spotsOf(id);
    const n = countIn(place.name, false);
    const choice = await ask({
      en: 'PLACE',
      ko: '장소',
      html: `<p class="ask-title">${esc(place.name)}</p><p class="quote">↳ 물건 ${n}개 · 세부 위치 ${spots.length}개</p>`,
      grid: true,
      buttons: [
        { text: '이름 바꾸기', value: 'rename', half: true },
        { text: '아이콘 바꾸기', value: 'icon', half: true },
        { text: '세부 위치 추가', value: 'spot' },
        { text: '↑ 위로', value: 'up', half: true },
        { text: '↓ 아래로', value: 'down', half: true },
        ...(spots.length || places().length < 2 ? [] : [{ text: '다른 장소 안으로 넣기', value: 'move' }]),
        { text: '삭제', value: 'delete' },
        { text: '닫기', value: 'close' },
      ],
    });
    if (choice === 'rename') {
      const name = await askText({ en: 'RENAME', ko: '이름 바꾸기', value: place.name, max: 40, note: n ? `안에 있는 물건 ${n}개의 위치도 같이 바뀌어요.` : '' });
      if (name && name !== place.name) await runOp(() => store.renameLocation(id, name), '이름을 바꿨어요');
    } else if (choice === 'icon') {
      await changeLocIcon(place);
    } else if (choice === 'spot') {
      await newSpot(id);
    } else if (choice === 'up' || choice === 'down') {
      await reorder(places(), id, choice === 'up' ? -1 : 1, (x, p) => store.patchLocation(x, p));
    } else if (choice === 'move') {
      const parent = locById(await askPick({ en: 'MOVE', ko: '어디 안으로 넣을까요?', options: places().filter((p) => p.id !== id).map((p) => ({ value: p.id, text: p.name })) }));
      if (!parent) return;
      const name = stripPrefix(place.name, parent.name);
      await runOp(() => store.moveLocation(id, parent.id, name), `‘${parent.name}${PATH_SEP}${name}’(으)로 옮겼어요`);
    } else if (choice === 'delete') {
      const ok = await ask({
        en: 'DELETE',
        ko: '장소 삭제',
        warn: true,
        html: `<p>‘${esc(place.name)}’ 장소를 지울까요?</p>${spots.length ? `<p class="quote">↳ 세부 위치 ${spots.length}개도 같이 지워져요</p>` : ''}${n ? `<p class="quote">↳ 안에 있던 물건 ${n}개는 ‘${NO_LOCATION}’으로 가요</p>` : ''}`,
        buttons: [{ text: '삭제', value: 'yes', dark: true }, { text: '취소', value: 'no' }],
      });
      if (ok === 'yes') await runOp(() => store.deleteLocation(id), '장소를 지웠어요');
    }
  }

  async function manageSpot(id) {
    const spot = locById(id);
    const parent = locById(spot?.parent_id);
    if (!spot || !parent) return;
    const path = pathOf(spot);
    const n = countIn(path, true);
    const others = places().filter((p) => p.id !== parent.id);
    const choice = await ask({
      en: 'SPOT',
      ko: '세부 위치',
      html: `<p class="ask-title">${esc(path)}</p><p class="quote">↳ 물건 ${n}개</p>`,
      grid: true,
      buttons: [
        { text: '이름 바꾸기', value: 'rename', half: true },
        { text: '아이콘 바꾸기', value: 'icon', half: true },
        { text: '↑ 위로', value: 'up', half: true },
        { text: '↓ 아래로', value: 'down', half: true },
        ...(others.length ? [{ text: '다른 장소로 옮기기', value: 'move' }] : []),
        { text: '큰 장소로 꺼내기', value: 'promote' },
        { text: '삭제', value: 'delete' },
        { text: '닫기', value: 'close' },
      ],
    });
    if (choice === 'rename') {
      const name = await askText({ en: 'RENAME', ko: '이름 바꾸기', value: spot.name, max: 40, note: n ? `안에 있는 물건 ${n}개의 위치도 같이 바뀌어요.` : '' });
      if (name && name !== spot.name) await runOp(() => store.renameLocation(id, name), '이름을 바꿨어요');
    } else if (choice === 'icon') {
      await changeLocIcon(spot);
    } else if (choice === 'up' || choice === 'down') {
      await reorder(spotsOf(parent.id), id, choice === 'up' ? -1 : 1, (x, p) => store.patchLocation(x, p));
    } else if (choice === 'move') {
      const target = locById(await askPick({ en: 'MOVE', ko: '어느 장소로 옮길까요?', options: others.map((p) => ({ value: p.id, text: p.name })) }));
      if (target) await runOp(() => store.moveLocation(id, target.id, null), `‘${target.name}${PATH_SEP}${spot.name}’(으)로 옮겼어요`);
    } else if (choice === 'promote') {
      await runOp(() => store.moveLocation(id, null, null), `‘${spot.name}’을(를) 큰 장소로 꺼냈어요`);
    } else if (choice === 'delete') {
      const ok = await ask({
        en: 'DELETE',
        ko: '세부 위치 삭제',
        warn: true,
        html: `<p>‘${esc(path)}’을(를) 지울까요?</p>${n ? `<p class="quote">↳ 안에 있던 물건 ${n}개는 ‘${esc(parent.name)}’에 바로 놓여요</p>` : ''}`,
        buttons: [{ text: '삭제', value: 'yes', dark: true }, { text: '취소', value: 'no' }],
      });
      if (ok === 'yes') await runOp(() => store.deleteLocation(id), '세부 위치를 지웠어요');
    }
  }

  async function changeLocIcon(loc) {
    const picked = await pickIcon(loc.icon, `‘${pathOf(loc)}’의 아이콘을 골라주세요.`, { place: true, removable: Boolean(loc.icon) });
    if (picked === null || picked === loc.icon) return;
    await runOp(() => store.patchLocation(loc.id, { icon: picked || null }), picked ? '아이콘을 바꿨어요' : '아이콘을 뺐어요');
  }

  async function manageCategory(id) {
    const cat = state.categories.find((c) => c.id === id);
    if (!cat) return;
    const fixed = cat.name === FALLBACK_CATEGORY;
    const n = state.items.filter((i) => findCategory(i.category) === cat).length;
    const choice = await ask({
      en: 'CATEGORY',
      ko: '카테고리',
      html: `<p class="ask-title">${icon(cat.icon)} ${esc(cat.name)}</p><p class="quote">↳ 물건 ${n}개${fixed ? ' · ‘기타’는 지운 카테고리의 물건이 가는 곳이라 이름을 바꾸거나 지울 수 없어요' : ''}</p>`,
      grid: true,
      buttons: [
        ...(fixed ? [] : [{ text: '이름 바꾸기', value: 'rename' }]),
        { text: '아이콘 바꾸기', value: 'icon' },
        { text: '↑ 위로', value: 'up', half: true },
        { text: '↓ 아래로', value: 'down', half: true },
        ...(fixed ? [] : [{ text: '삭제', value: 'delete' }]),
        { text: '닫기', value: 'close' },
      ],
    });
    if (choice === 'rename') {
      const name = await askText({ en: 'RENAME', ko: '이름 바꾸기', value: cat.name, max: 30, note: n ? `이 카테고리 물건 ${n}개도 같이 바뀌어요.` : '' });
      if (name && name !== cat.name) await runOp(() => store.renameCategory(id, name), '이름을 바꿨어요');
    } else if (choice === 'icon') {
      const picked = await pickIcon(cat.icon, `‘${cat.name}’의 대표 아이콘을 골라주세요.`);
      if (picked && picked !== cat.icon) await runOp(() => store.patchCategory(id, { icon: picked }), '아이콘을 바꿨어요');
    } else if (choice === 'up' || choice === 'down') {
      await reorder(categoriesSorted(), id, choice === 'up' ? -1 : 1, (x, p) => store.patchCategory(x, p));
    } else if (choice === 'delete') {
      const ok = await ask({
        en: 'DELETE',
        ko: '카테고리 삭제',
        warn: true,
        html: `<p>‘${esc(cat.name)}’ 카테고리를 지울까요?</p>${n ? `<p class="quote">↳ 이 카테고리 물건 ${n}개는 ‘${FALLBACK_CATEGORY}’로 가요</p>` : ''}`,
        buttons: [{ text: '삭제', value: 'yes', dark: true }, { text: '취소', value: 'no' }],
      });
      if (ok === 'yes') await runOp(() => store.deleteCategory(id), '카테고리를 지웠어요');
    }
  }

  /* ── 아이콘 고르기 (찾기 포함) ─────────────────────── */

  function iconPickerHTML(current, prefix = '', place = false) {
    const hint = place ? '아이콘 찾기 (예: 옷장, 책상, 신발장)' : '아이콘 찾기 (예: 양말, 컵, 화분)';
    return `<div class="icon-picker">
      <div class="search search--sm">${icon('magnifying-glass')}<input class="input" data-icon-search placeholder="${hint}" aria-label="아이콘 찾기" autocomplete="off" enterkeyhint="search"></div>
      <div class="icon-results" data-icon-results data-current="${esc(current || '')}" data-prefix="${esc(prefix)}"${place ? ' data-place="1"' : ''}>${iconResultsHTML('', current, prefix, place)}</div>
    </div>`;
  }

  function iconResultsHTML(query, current, prefix, place = false) {
    const groups = place ? [PLACE_ICONS, ...ICON_GROUPS] : ICON_GROUPS;
    const q = norm(query);
    const button = (name, text, named) => `<button type="button" class="icon-opt${name === current ? ' is-on' : ''}${named ? ' icon-opt--named' : ''}" data-icon="${name}"${prefix ? ` data-value="${prefix}${name}"` : ''} title="${esc(text)}" aria-label="${esc(text)}">${icon(name)}${named ? `<span>${esc(text)}</span>` : ''}</button>`;
    if (!q) {
      return groups.map(([group, list]) => `<p class="icon-group">${esc(group)}</p>${list.map(([name, ko]) => button(name, ko, false)).join('')}`).join('');
    }
    const hits = [];
    const seen = new Set();
    for (const [, list] of groups) {
      for (const [name, ko, keys = ''] of list) {
        if (seen.has(name) || !norm(`${ko} ${keys} ${name}`).includes(q)) continue;
        seen.add(name);
        hits.push(button(name, ko, true));
      }
    }
    const english = /^[a-z0-9-]+$/.test(q) ? OTHER_ICONS.filter((n) => n.includes(q)).slice(0, 60).map((n) => button(n, n, true)) : [];
    if (!hits.length && !english.length) return `<p class="icon-empty">‘${esc(query.trim())}’ 아이콘이 없어요. 다른 말이나 영어로 찾아보세요. (예: cup, sock)</p>`;
    return hits.join('') + (english.length ? `<p class="icon-group">영어 이름으로 찾은 아이콘</p>${english.join('')}` : '');
  }

  function onIconSearch(e) {
    const input = e.target.closest('[data-icon-search]');
    if (!input) return;
    const results = input.closest('.icon-picker').querySelector('[data-icon-results]');
    results.innerHTML = iconResultsHTML(input.value, results.dataset.current, results.dataset.prefix, results.dataset.place === '1');
  }

  // 확인 창에서 아이콘 하나 고르기 → 이름 ('' = 아이콘 빼기, null = 안 고름)
  async function pickIcon(current, note, { place = false, removable = false, keepText = '그대로 두기' } = {}) {
    const v = await ask({
      en: 'ICON',
      ko: '아이콘 고르기',
      html: `${note ? `<p>${esc(note)}</p>` : ''}${iconPickerHTML(current, 'icon:', place)}`,
      buttons: [...(removable ? [{ text: '아이콘 빼기', value: 'icon:' }] : []), { text: keepText, value: 'keep' }],
    });
    return v && v.startsWith('icon:') ? v.slice(5) : null;
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

  const form = { mode: 'add', id: null, original: null, icon: null, busy: false, placeId: null, spotId: null, category: FALLBACK_CATEGORY };

  const selectedStatus = () => els.itemForm.elements.status.value || DEFAULT_STATUS;

  function setRadio(name, value) {
    for (const r of els.itemForm.elements[name]) r.checked = r.value === value;
  }

  function openForm(mode, item = null, prefill = {}) {
    form.mode = mode;
    form.id = item?.id || null;
    form.original = item;
    form.busy = false;
    if (item) {
      const r = resolve(item);
      form.placeId = r.place?.id || null;
      form.spotId = r.spot?.id || null;
      form.category = findCategory(item.category)?.name || item.category;
    } else {
      const spot = locById(prefill.spotId);
      form.placeId = locById(prefill.placeId) ? prefill.placeId : null;
      form.spotId = spot && spot.parent_id === form.placeId ? spot.id : null;
      form.category = findCategory(prefill.category)?.name || findCategory(FALLBACK_CATEGORY)?.name || categoriesSorted()[0]?.name || FALLBACK_CATEGORY;
    }
    const src = item || { name: prefill.name || '', quantity: 1, status: prefill.status || DEFAULT_STATUS, icon: null, memo: '' };
    form.icon = isIconName(src.icon) ? src.icon : null;

    els.formTitle.innerHTML = mode === 'add' ? label('NEW ITEM', '새 물건') : label('EDIT ITEM', '물건 수정');
    els.fName.value = src.name;
    els.fQty.value = src.quantity;
    els.fMemo.value = src.memo;
    setRadio('status', src.status);
    els.formDelete.hidden = mode !== 'edit';
    els.formAdded.hidden = mode !== 'edit';
    if (item) els.formAdded.textContent = `ADDED ${ymd(item.created_at)}`;
    els.formError.hidden = true;
    for (const kind of ['place', 'spot', 'category']) hideInlineAdd(kind);
    toggleIconGrid(false);
    renderCategoryChips();
    renderPlaceChips();
    renderFormIcon();
    renderNameHint();
    setBusy(false);

    els.formDialog.showModal();
    els.formBody.scrollTop = 0;
    if (mode === 'add' && !src.name) els.fName.focus();
  }

  function renderCategoryChips() {
    els.catChips.innerHTML = categoriesSorted().map((c) => {
      const on = sameName(c.name, form.category);
      return `<button type="button" class="chip" data-pick-category="${esc(c.name)}" aria-pressed="${on}">${icon(c.icon)}<span>${esc(c.name)}</span></button>`;
    }).join('') + `<button type="button" class="chip chip--add" data-inline="category">${icon('plus')}<span>새 카테고리</span></button>`;
  }

  function renderPlaceChips() {
    const place = locById(form.placeId);
    els.placeChips.innerHTML = [
      `<button type="button" class="chip" data-pick-place="" aria-pressed="${!place}">${NO_LOCATION}</button>`,
      ...places().map((p) => `<button type="button" class="chip" data-pick-place="${p.id}" aria-pressed="${p.id === form.placeId}">${p.icon ? icon(p.icon) : ''}<span>${esc(p.name)}</span></button>`),
      `<button type="button" class="chip chip--add" data-inline="place">${icon('plus')}<span>새 장소</span></button>`,
    ].join('');
    els.spotField.hidden = !place;
    if (!place) return;
    els.spotLabel.textContent = `↳ ${place.name} 안 어디에?`;
    els.spotChips.innerHTML = [
      `<button type="button" class="chip" data-pick-spot="" aria-pressed="${!form.spotId}">${esc(place.name)}에 바로</button>`,
      ...spotsOf(place.id).map((s) => `<button type="button" class="chip" data-pick-spot="${s.id}" aria-pressed="${s.id === form.spotId}">${s.icon ? icon(s.icon) : ''}<span>${esc(s.name)}</span></button>`),
      `<button type="button" class="chip chip--add" data-inline="spot">${icon('plus')}<span>새 세부 위치</span></button>`,
    ].join('');
  }

  function onFormChipClick(e) {
    const t = e.target;
    const cat = t.closest('[data-pick-category]');
    if (cat) { form.category = cat.dataset.pickCategory; renderCategoryChips(); renderFormIcon(); return; }
    const place = t.closest('[data-pick-place]');
    if (place) {
      const id = place.dataset.pickPlace || null;
      if (id !== form.placeId) form.spotId = null;
      form.placeId = id;
      hideInlineAdd('spot');
      renderPlaceChips();
      return;
    }
    const spot = t.closest('[data-pick-spot]');
    if (spot) { form.spotId = spot.dataset.pickSpot || null; renderPlaceChips(); return; }
    const inline = t.closest('[data-inline]');
    if (inline) { showInlineAdd(inline.dataset.inline); return; }
    const ok = t.closest('[data-inline-ok]');
    if (ok) { confirmInlineAdd(ok.dataset.inlineOk); return; }
    const cancel = t.closest('[data-inline-cancel]');
    if (cancel) hideInlineAdd(cancel.dataset.inlineCancel);
  }

  const inlineBox = (kind) => els[`${kind}Add`];

  function showInlineAdd(kind) {
    const box = inlineBox(kind);
    box.hidden = false;
    const input = box.querySelector('input');
    input.value = '';
    input.focus();
  }

  function hideInlineAdd(kind) {
    const box = inlineBox(kind);
    if (box) box.hidden = true;
  }

  // 입력 창 안에서 장소 · 세부 위치 · 카테고리를 바로 만들고 골라요
  async function confirmInlineAdd(kind) {
    const input = inlineBox(kind).querySelector('input');
    const name = cleanName(input.value, kind === 'category' ? 30 : 40);
    if (!name) { input.focus(); return; }
    els.formError.hidden = true;
    try {
      if (kind === 'place') {
        let loc = findPlace(name);
        if (!loc) {
          loc = await store.addLocation({ name, parent_id: null, sort: nextSort(places()) });
          state.locations.push(loc);
        }
        form.placeId = loc.id;
        form.spotId = null;
      } else if (kind === 'spot') {
        const place = locById(form.placeId);
        if (!place) return;
        let loc = findSpot(place.id, name);
        if (!loc) {
          loc = await store.addLocation({ name, parent_id: place.id, sort: nextSort(spotsOf(place.id)) });
          state.locations.push(loc);
        }
        form.spotId = loc.id;
      } else {
        let cat = findCategory(name);
        if (!cat) {
          cat = await store.addCategory({ name, icon: 'package', sort: nextSort(state.categories) });
          state.categories.push(cat);
        }
        form.category = cat.name;
        renderFormIcon();
      }
    } catch (err) {
      if (!(await maybeLocked(err))) showFormError(friendlyMessage(err));
      return;
    }
    hideInlineAdd(kind);
    renderCategoryChips();
    renderPlaceChips();
  }

  function renderFormIcon() {
    const name = form.icon || categoryIcon(form.category);
    els.formIcon.innerHTML = icon(name);
    els.iconAuto.textContent = form.icon ? (ICON_NAMES.get(form.icon) || '직접 고름') : '카테고리 기본';
    els.iconReset.hidden = !form.icon;
    if (!els.iconGrid.hidden) markIconGrid();
  }

  function toggleIconGrid(open = els.iconGrid.hidden) {
    els.iconGrid.hidden = !open;
    els.iconToggle.setAttribute('aria-expanded', String(open));
    els.iconToggle.textContent = open ? '접기' : '바꾸기';
    if (open) {
      els.iconGrid.innerHTML = iconPickerHTML(form.icon || categoryIcon(form.category));
      els.iconGrid.querySelector('.is-on')?.scrollIntoView({ block: 'nearest' });
    } else {
      els.iconGrid.innerHTML = '';
    }
  }

  function markIconGrid() {
    const cur = form.icon || categoryIcon(form.category);
    const results = els.iconGrid.querySelector('[data-icon-results]');
    if (results) results.dataset.current = cur;
    for (const b of $$('[data-icon]', els.iconGrid)) b.classList.toggle('is-on', b.dataset.icon === cur);
  }

  function onIconPick(e) {
    const b = e.target.closest('[data-icon]');
    if (!b) return;
    // 카테고리 대표 아이콘을 고르면 '자동'으로 둬요 (카테고리를 바꾸면 따라 바뀜)
    form.icon = b.dataset.icon === categoryIcon(form.category) ? null : b.dataset.icon;
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
    const place = locById(form.placeId);
    const spot = place && form.spotId ? locById(form.spotId) : null;
    return {
      name: els.fName.value.trim().slice(0, 100),
      location: spot ? pathOf(spot) : place ? place.name : '',
      category: form.category || FALLBACK_CATEGORY,
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
    const inline = t.closest('.inline-add');
    if (inline) { confirmInlineAdd(inline.id.replace('Add', '')); return; }
    if (t === els.fName) els.fQty.focus();
    else if (t === els.fQty) els.fMemo.focus();
  }

  function stepQty(delta) {
    els.fQty.value = clampQty(clampQty(els.fQty.value) + delta);
  }

  /* ── 확인 창 ────────────────────────────────────────── */

  // buttons: [{ text, value, dark, half }] → 누른 버튼의 value (닫으면 null)
  // 확인 창이 연달아 열려도 앞 창의 '닫힘' 신호가 뒤 창을 닫지 않게, 닫기는 직접 처리해요
  let askDone = null;

  function ask({ en, ko, warn = false, html, buttons, grid = false }) {
    if (askDone) askDone(null);
    const d = els.askDialog;
    d.innerHTML = `
      <div class="modal-box">
        <header class="modal-head">${warn ? led('warn') : ''}${label(en, ko)}</header>
        ${html ? `<div class="modal-body ask-body">${html}</div>` : ''}
        <footer class="modal-foot modal-foot--stack${grid ? ' modal-foot--grid' : ''}">${buttons.map((b) => `<button type="button" class="key${b.dark ? ' key--dark' : ''}${b.half ? ' key--half' : ''}" data-value="${esc(b.value)}">${esc(b.text)}</button>`).join('')}</footer>
      </div>`;
    return new Promise((resolve) => {
      const done = (value) => {
        if (askDone !== done) return;
        askDone = null;
        d.removeEventListener('click', onClick);
        d.removeEventListener('cancel', onCancel);
        d.removeEventListener('keydown', onKey);
        if (d.open) d.close();
        resolve(value);
      };
      const onClick = (e) => {
        const b = e.target.closest('[data-value]');
        if (b) done(b.dataset.value);
        else if (e.target === d) done(null);
      };
      const onCancel = (e) => { // Esc
        e.preventDefault();
        done(null);
      };
      const onKey = (e) => {
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
        if (e.target.matches('[data-ask-input]')) { e.preventDefault(); done('ok'); }
        else if (e.target.matches('[data-icon-search]')) e.preventDefault();
      };
      askDone = done;
      d.addEventListener('click', onClick);
      d.addEventListener('cancel', onCancel);
      d.addEventListener('keydown', onKey);
      d.showModal();
      const input = d.querySelector('[data-ask-input]');
      if (input) { input.focus(); input.select(); } else [...d.querySelectorAll('.modal-foot .key')].pop()?.focus();
    });
  }

  // 이름 하나 입력받기 → 다듬은 이름 (취소하면 null)
  async function askText({ en, ko, value = '', placeholder = '', okText = '저장', max = 40, note = '' }) {
    const v = await ask({
      en,
      ko,
      html: `${note ? `<p>${note}</p>` : ''}<input class="input" data-ask-input maxlength="${max}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="done" aria-label="${esc(ko)}">`,
      buttons: [{ text: okText, value: 'ok', dark: true }, { text: '취소', value: 'cancel' }],
    });
    if (v !== 'ok') return null;
    return cleanName(els.askDialog.querySelector('[data-ask-input]')?.value, max) || null;
  }

  // 여러 개 중 하나 고르기 → value (취소하면 null)
  async function askPick({ en, ko, options }) {
    const v = await ask({
      en,
      ko,
      html: '',
      buttons: [...options.map((o) => ({ text: o.text, value: `pick:${o.value}` })), { text: '취소', value: 'cancel' }],
    });
    return v && v.startsWith('pick:') ? v.slice(5) : null;
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
    if (!state.items.length && !state.locations.length) { toast('백업할 내용이 아직 없어요'); return; }
    const payload = {
      app: APP_NAME,
      version: 2,
      exported_at: nowIso(),
      count: state.items.length,
      items: state.items.map((i) => toRow(i, true)),
      // 장소 · 카테고리는 이름으로 적어둬요 (다른 곳에 불러와도 맞춰지게)
      locations: state.locations.map((l) => ({ name: l.name, parent: locById(l.parent_id)?.name || null, icon: l.icon, sort: l.sort })),
      categories: state.categories.map((c) => ({ name: c.name, icon: c.icon, sort: c.sort })),
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
    const regLocs = Array.isArray(parsed.locations) ? parsed.locations : [];
    const regCats = Array.isArray(parsed.categories) ? parsed.categories : [];

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
    const newCats = regCats.filter((c) => cleanName(c?.name, 30) && !findCategory(cleanName(c.name, 30)));
    const newPlaces = regLocs.filter((l) => !l?.parent && cleanName(l?.name, 40) && !findPlace(cleanName(l.name, 40)));
    if (!rows.length && !newCats.length && !newPlaces.length) {
      toast(skipped ? `새로 불러올 물건이 없어요 (${skipped}개는 이미 있어요)` : '불러올 물건이 없어요');
      return;
    }
    const answer = await ask({
      en: 'RESTORE',
      ko: '불러오기',
      html: `<p>물건 ${rows.length}개를 불러올까요?</p>${skipped ? `<p class="quote">↳ ${skipped}개는 이미 있어서 건너뛰어요</p>` : ''}<p class="quote">↳ 백업에 있던 장소 · 카테고리 중 없는 것도 더해요</p>`,
      buttons: [{ text: '불러오기', value: 'yes', dark: true }, { text: '취소', value: 'no' }],
    });
    if (answer !== 'yes') return;
    try {
      for (const c of regCats) {
        const name = cleanName(c?.name, 30);
        if (name && !findCategory(name)) state.categories.push(await store.addCategory({ name, icon: c.icon, sort: toInt(c.sort) || nextSort(state.categories) }));
      }
      for (const l of regLocs.filter((x) => x && !x.parent)) {
        const name = cleanName(l.name, 40);
        if (name && !findPlace(name)) state.locations.push(await store.addLocation({ name, parent_id: null, icon: l.icon, sort: toInt(l.sort) || nextSort(places()) }));
      }
      for (const l of regLocs.filter((x) => x && x.parent)) {
        const parent = findPlace(cleanName(l.parent, 40));
        const name = cleanName(l.name, 40);
        if (parent && name && !findSpot(parent.id, name)) state.locations.push(await store.addLocation({ name, parent_id: parent.id, icon: l.icon, sort: toInt(l.sort) || nextSort(spotsOf(parent.id)) }));
      }
      const saved = rows.length ? await store.insertMany(rows) : [];
      await refresh();
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
    await ensureRegistry();
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
    // 예시 때문에 생긴 빈 장소도 정리해요
    const samplePaths = new Set(SAMPLES.map((s) => s.location).filter(Boolean));
    const used = (path) => state.items.some((i) => i.location === path || i.location.startsWith(path + PATH_SEP));
    for (const spot of state.locations.filter((l) => l.parent_id && samplePaths.has(pathOf(l)) && !used(pathOf(l)))) {
      await store.deleteLocation(spot.id).catch(() => {});
    }
    state.locations = await store.listLocations();
    const samplePlaces = new Set([...samplePaths].map((p) => splitPath(p)[0]));
    for (const place of places().filter((p) => samplePlaces.has(p.name) && !spotsOf(p.id).length && !used(p.name))) {
      await store.deleteLocation(place.id).catch(() => {});
    }
    await refresh();
    toast(`예시 물건 ${targets.length}개를 지웠어요`);
  }

  /* ── 오류 다루기 ────────────────────────────────────── */

  function classify(err) {
    const msg = String(err?.message || err || '');
    const code = String(err?.code || '');
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'network';
    if (/api key|apikey|jwt/i.test(msg)) return 'apikey';
    if (['PGRST205', 'PGRST202', 'PGRST204', '42P01', '42703', '42883'].includes(code) && /location|categor/i.test(msg)) return 'upgrade';
    if (['PGRST202', 'PGRST205', '42P01', '42883', 'PGRST106'].includes(code) || /schema cache|does not exist/i.test(msg)) return 'setup';
    return 'unknown';
  }

  function friendlyMessage(err) {
    const code = String(err?.code || '');
    if (code === '23505') return '같은 이름이 이미 있어요';
    if (code === 'P0001' && /[가-힣]/.test(err?.message || '')) return err.message; // 명령문이 알려준 이유 그대로
    const kind = classify(err);
    if (kind === 'network') return '연결하지 못했어요. 인터넷을 확인해 주세요';
    if (kind === 'apikey') return '연결 정보의 열쇠(key)를 확인해 주세요';
    if (kind === 'upgrade') return 'Supabase 명령문(supabase.sql)을 한 번 더 실행해 주세요';
    if (kind === 'setup') return 'Supabase 설정을 확인해 주세요 (설정안내 3단계)';
    return '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요';
  }

  const failure = (err) => ({ kind: classify(err), detail: String(err?.message || err || '').slice(0, 200) });

  // 저장이 막혔을 때: 비밀 문구가 바뀌었는지, 다른 기기에서 지웠는지 확인
  async function maybeLocked(err) {
    if (state.mode !== 'remote') return false;
    if (!['42501', 'NOROWS', 'PGRST116', 'PGRST301', 'P0002'].includes(String(err?.code || ''))) return false;
    let ok;
    try { ok = await checkKey(roomKey); } catch (_) { return false; }
    if (ok) {
      closeDialogs();
      toast('다른 기기에서 바뀐 내용이 있어서 새로 불러왔어요');
      await loadAll();
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
    if (askDone) askDone(null);
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

  // 물건 · 장소 · 카테고리를 한꺼번에 불러와요. quiet = 화면을 '불러오는 중'으로 바꾸지 않기
  async function loadAll(quiet = false) {
    if (!quiet) {
      state.phase = 'loading';
      render();
    }
    try {
      const [items, locations, categories] = await Promise.all([store.list(), store.listLocations(), store.listCategories()]);
      state.items = items;
      state.locations = locations;
      state.categories = categories;
      await ensureRegistry();
      state.loadedAt = Date.now();
      state.phase = 'ready';
      if (state.selectedId && !selectedItem()) state.selectedId = null;
      render();
    } catch (err) {
      if (quiet && state.phase === 'ready') { toast(friendlyMessage(err)); return; }
      fail(failure(err));
      return;
    }
    if (state.mode === 'remote' && !quiet) offerPreviewMove();
  }

  const refresh = () => loadAll(true);

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
        ls.del(SAVED.items);
        await refresh();
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
    await loadAll();
  }

  function lock(message) {
    roomKey = '';
    state.items = [];
    state.locations = [];
    state.categories = [];
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
      await loadAll();
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
    else loadAll();
  }

  // 다른 기기에서 바꾼 내용: 이 탭으로 돌아오면 조용히 새로 불러와요
  async function onVisible() {
    if (document.visibilityState !== 'visible') return;
    if (state.mode !== 'remote' || state.phase !== 'ready') return;
    if (Date.now() - state.loadedAt < 30000 || document.querySelector('dialog[open]')) return;
    await refresh();
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
      'categoryAdd', 'placeChips', 'placeAdd', 'spotField', 'spotLabel', 'spotChips', 'spotAdd',
      'formIcon', 'iconAuto', 'iconToggle', 'iconReset', 'iconGrid', 'fQty', 'statusChips',
      'fMemo', 'formAdded', 'formError', 'formDelete', 'formSave', 'askDialog', 'toast', 'restoreInput',
      'lockForm', 'lockInput', 'lockShow', 'lockSubmit', 'lockError',
    ];
    for (const id of ids) els[id] = document.getElementById(id);
  }

  function buildStatic() {
    els.statusChips.innerHTML = STATUSES
      .map((s) => `<label class="chip"><input type="radio" name="status" value="${s.name}">${led(s.led)}<span>${s.name}</span></label>`).join('');
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
      if (s) { stepQty(Number(s.dataset.step)); return; }
      onFormChipClick(e);
    });
    els.fName.addEventListener('input', () => { renderNameHint(); updateSaveState(); });
    els.fQty.addEventListener('blur', () => { els.fQty.value = clampQty(els.fQty.value); });
    els.iconToggle.addEventListener('click', () => toggleIconGrid());
    els.iconReset.addEventListener('click', () => { form.icon = null; renderFormIcon(); });
    els.iconGrid.addEventListener('click', onIconPick);
    els.iconGrid.addEventListener('input', onIconSearch);
    els.askDialog.addEventListener('input', onIconSearch);
    els.formDelete.addEventListener('click', onFormDelete);
    // 입력 창에서 장소 · 카테고리를 새로 만들었을 수 있어서 닫을 때 다시 그려요
    els.formDialog.addEventListener('close', () => { if (state.phase === 'ready') renderInventory(); });

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
      loadAll();
    } else if (config.status === 'invalid') {
      state.mode = 'remote';
      fail({ kind: 'config' });
    } else {
      startRemote();
    }
  }

  init();
})();
