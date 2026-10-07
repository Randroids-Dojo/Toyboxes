// Creator tools: review sketchbook pages, look after claims and publish games
// and inner areas into rooms.

import '@fontsource/lilita-one';
import '@fontsource-variable/atkinson-hyperlegible-next';
import './admin.css';

import {
  FLOOR_COLORS,
  MAX_AREAS,
  PROP_KINDS,
  PROP_SPECS,
  ROOM,
  SKETCH_COLORS,
  SKETCH_WIDTHS,
  SLOT_COUNT,
  TRIM_COLORS,
  WALL_COLORS,
  areaDoorX,
  contentProblem,
  exhibitProblem,
  type Experience,
  placementProblem,
  type Area,
  type Exhibit,
  type Page,
  type PageStatus,
  type PropKind,
  type PropPlacement,
  type RoomContent,
  type RoomTheme,
  type Stroke,
} from '../shared/model';
import { grandPrixTrack } from '../shared/circuits';
import { trackFromSketch, trackProblem } from '../shared/track';

// ---------------------------------------------------------------------------
// Plumbing

type Child = Node | string | null | undefined | false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | undefined> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids) if (k !== null && k !== undefined && k !== false) e.append(typeof k === 'string' ? document.createTextNode(k) : k);
  return e;
}

function btn(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', { class: `b ${cls}`.trim(), type: 'button' }, label);
  b.addEventListener('click', onClick);
  return b;
}

interface Res<T> {
  ok: boolean;
  status: number;
  data: T & { error?: string; code?: string };
}

async function call<T>(method: 'GET' | 'POST', query: string, body?: unknown): Promise<Res<T>> {
  try {
    const r = await fetch(`/api/admin${query}`, {
      method,
      headers: { 'x-toyboxes-admin': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'No connection' } as T & { error: string } };
  }
}

const post = <T = { ok: true }>(action: string, body: Record<string, unknown> = {}) => call<T>('POST', '', { action, ...body });

function ago(t: number | null | undefined): string {
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

function rid(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 9);
}

const root = document.getElementById('admin')!;
let flashTimer = 0;
const flashEl = el('div', { class: 'flash hidden', role: 'status' });
document.body.appendChild(flashEl);
function flash(text: string, bad = false): void {
  flashEl.textContent = text;
  flashEl.classList.toggle('bad', bad);
  flashEl.classList.remove('hidden');
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => flashEl.classList.add('hidden'), 3200);
}

// ---------------------------------------------------------------------------
// Types from the API

interface FeedItem {
  roomId: string;
  pageId: string;
  slot: number;
  ownerName: string;
  roomStatus: string;
  n: number;
  excerpt: string;
  strokes: number;
  updatedAt: number;
  rev: number;
  status: PageStatus;
  seen: boolean;
  removed: boolean;
}

interface RoomRow {
  id: string;
  slot: number;
  ownerName: string;
  claimedAt: number;
  updatedAt: number;
  releasedAt: number | null;
  status: string;
  pages: number;
  props: number;
}

interface DetailPage extends Page {
  removed?: boolean;
  seen: boolean;
  note?: string;
  history: (Page & { savedAt: number; by: string })[];
}

interface Detail {
  room: { id: string; slot: number; ownerName: string; claimedAt: number; updatedAt: number; status: string; layout: PropPlacement[]; theme: RoomTheme; releasedAt?: number };
  pin: { epoch: number; setAt: number; setBy: string; recentFailures: number } | null;
  content: RoomContent;
  pages: DetailPage[];
  log: { at: number; by: string; what: string }[];
}

// ---------------------------------------------------------------------------
// Sign-in

async function boot(): Promise<void> {
  const s = await call<{ admin: boolean }>('GET', '?view=session');
  if (s.ok && s.data.admin) shell();
  else signIn();
}

function signIn(msg = ''): void {
  const input = el('input', { type: 'password', class: 'in', autocomplete: 'current-password', 'aria-label': 'Password' }) as HTMLInputElement;
  const err = el('p', { class: 'err' }, msg);
  const form = el('form', { class: 'signin' }, el('h1', {}, 'Toyboxes admin'), el('label', {}, 'Password', input), err, el('button', { class: 'b primary', type: 'submit' }, 'Sign in'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await post('login', { password: input.value });
    if (r.ok) shell();
    else {
      err.textContent = r.data.error ?? 'Sign-in failed';
      input.select();
    }
  });
  root.replaceChildren(form);
  input.focus();
}

// ---------------------------------------------------------------------------
// Shell

let tab: 'feed' | 'rooms' | 'released' = 'feed';
let unseenOnly = true;
const listEl = el('div', { class: 'list' });
const detailEl = el('div', { class: 'detail' }, el('p', { class: 'empty' }, 'Pick a page or a room.'));
let openRoom: string | null = null;

function shell(): void {
  const tabs = el('nav', { class: 'tabs' });
  const mk = (id: typeof tab, label: string) => {
    const b = btn(label, () => {
      tab = id;
      tabs.querySelectorAll('.b').forEach((x) => x.classList.toggle('on', x === b));
      void loadList();
    }, id === tab ? 'on' : '');
    return b;
  };
  tabs.append(mk('feed', 'Pages'), mk('rooms', 'Rooms'), mk('released', 'Released'));
  const out = btn('Sign out', async () => {
    await post('logout');
    signIn();
  }, 'ghost');
  root.replaceChildren(el('header', { class: 'top' }, el('h1', {}, 'Toyboxes admin'), tabs, el('a', { href: '/', class: 'b ghost', target: '_blank' }, 'Open the town'), out), el('main', { class: 'cols' }, listEl, detailEl));
  void loadList();
}

async function loadList(): Promise<void> {
  listEl.replaceChildren(el('p', { class: 'empty' }, 'Loading...'));
  if (tab === 'feed') {
    const r = await call<{ feed: FeedItem[] }>('GET', '?view=feed');
    if (r.status === 401) return signIn('Signed out. Sign in again.');
    if (!r.ok) return void listEl.replaceChildren(el('p', { class: 'err' }, r.data.error ?? 'Failed'));
    const toggle = el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: unseenOnly }), ' Only new and changed');
    toggle.querySelector('input')!.addEventListener('change', (e) => {
      unseenOnly = (e.target as HTMLInputElement).checked;
      void loadList();
    });
    const items = r.data.feed.filter((f) => !unseenOnly || !f.seen);
    listEl.replaceChildren(
      toggle,
      ...(items.length ? [] : [el('p', { class: 'empty' }, unseenOnly ? 'Nothing new. Nice.' : 'No pages yet.')]),
      ...items.map((f) =>
        el(
          'button',
          { class: `row${f.seen ? '' : ' unseen'}${f.removed ? ' removed' : ''}`, type: 'button', 'data-room': f.roomId },
          el('div', { class: 'row-top' }, el('strong', {}, `Room ${f.slot + 1} · ${f.ownerName}`), el('span', { class: `pill ${f.status}` }, f.status), !f.seen ? el('span', { class: 'pill new' }, f.rev > 1 ? 'changed' : 'new') : null),
          el('div', { class: 'row-sub' }, `Page ${f.n} · ${ago(f.updatedAt)}${f.strokes ? ` · ${f.strokes} strokes` : ''}${f.roomStatus !== 'active' ? ' · room released' : ''}`),
          el('div', { class: 'row-text' }, f.excerpt),
        ),
      ),
    );
    listEl.querySelectorAll<HTMLElement>('.row').forEach((row, i) => row.addEventListener('click', () => void loadRoom(items[i].roomId, items[i].pageId)));
    return;
  }
  const r = await call<{ rooms: RoomRow[] }>('GET', `?view=${tab}`);
  if (r.status === 401) return signIn('Signed out. Sign in again.');
  if (!r.ok) return void listEl.replaceChildren(el('p', { class: 'err' }, r.data.error ?? 'Failed'));
  const rooms = r.data.rooms.sort((a, b) => a.slot - b.slot);
  listEl.replaceChildren(
    ...(rooms.length ? [] : [el('p', { class: 'empty' }, tab === 'rooms' ? 'No rooms claimed yet.' : 'No released rooms.')]),
    ...rooms.map((rm) => {
      const b = el(
        'button',
        { class: 'row', type: 'button' },
        el('div', { class: 'row-top' }, el('strong', {}, `Room ${rm.slot + 1} · ${rm.ownerName}`)),
        el('div', { class: 'row-sub' }, `${rm.pages} pages · ${rm.props} toys · claimed ${ago(rm.claimedAt)}${rm.releasedAt ? ` · released ${ago(rm.releasedAt)}` : ''}`),
      );
      b.addEventListener('click', () => void loadRoom(rm.id));
      return b;
    }),
  );
}

// ---------------------------------------------------------------------------
// Room detail

let detail: Detail | null = null;
let content: RoomContent | null = null;
let contentDirty = false;
let space = 'main';
let selected: { type: 'exhibit' | 'prop'; id: string } | null = null;

async function loadRoom(id: string, focusPage?: string): Promise<void> {
  openRoom = id;
  detailEl.replaceChildren(el('p', { class: 'empty' }, 'Loading...'));
  const r = await call<Detail>('GET', `?view=room&id=${encodeURIComponent(id)}`);
  if (r.status === 401) return signIn('Signed out. Sign in again.');
  if (!r.ok) return void detailEl.replaceChildren(el('p', { class: 'err' }, r.data.error ?? 'Failed'));
  detail = r.data;
  content = structuredClone(r.data.content);
  contentDirty = false;
  space = 'main';
  selected = null;
  renderDetail();
  if (focusPage) {
    const node = detailEl.querySelector(`[data-page="${focusPage}"]`);
    node?.scrollIntoView({ block: 'start' });
    node?.classList.add('focus');
    // Opening a page from the feed counts as reading it.
    const p = detail.pages.find((x) => x.id === focusPage);
    if (p && !p.seen) {
      await post('markSeen', { roomId: id, pageId: focusPage });
      p.seen = true;
      void loadList();
    }
  }
}

async function act(action: string, body: Record<string, unknown>, done: string, confirmText?: string): Promise<void> {
  if (confirmText && !confirm(confirmText)) return;
  const r = await post(action, body);
  if (!r.ok) return flash(r.data.error ?? 'Failed', true);
  flash(done);
  if (openRoom) await loadRoom(openRoom);
  void loadList();
}

function renderDetail(): void {
  if (!detail || !content) return;
  const d = detail;
  const room = d.room;
  const active = room.status === 'active';
  const pinIn = el('input', { class: 'in short', inputmode: 'numeric', maxlength: '4', placeholder: '0000', 'aria-label': 'New PIN' }) as HTMLInputElement;
  const nameIn = el('input', { class: 'in', maxlength: '16', value: room.ownerName, 'aria-label': 'Owner label' }) as HTMLInputElement;
  const slotSel = el('select', { class: 'in short', 'aria-label': 'Entrance' }) as HTMLSelectElement;
  for (let i = 0; i < SLOT_COUNT; i++) slotSel.append(el('option', { value: String(i), selected: i === room.slot }, `Entrance ${i + 1}`));

  const actions = el(
    'section',
    { class: 'box' },
    el('h3', {}, 'Claim'),
    el('div', { class: 'kv' }, el('span', {}, 'PIN'), el('span', {}, d.pin ? `set by ${d.pin.setBy} ${ago(d.pin.setAt)}${d.pin.recentFailures ? ` · ${d.pin.recentFailures} recent wrong tries` : ''}` : 'none')),
    el(
      'div',
      { class: 'line' },
      pinIn,
      btn('Set new PIN', () => {
        if (!/^\d{4}$/.test(pinIn.value)) return flash('Four digits please', true);
        void act('setPin', { roomId: room.id, pin: pinIn.value }, 'PIN changed. Old edit sessions are signed out.');
      }),
    ),
    el('div', { class: 'line' }, nameIn, btn('Change owner label', () => void act('setOwnerName', { roomId: room.id, name: nameIn.value }, 'Owner label changed'))),
    active
      ? el('div', { class: 'line' }, slotSel, btn('Move room', () => void act('moveSlot', { roomId: room.id, slot: Number(slotSel.value) }, 'Moved')))
      : el('div', { class: 'line' }, slotSel, btn('Restore room', () => void act('restore', { roomId: room.id, slot: Number(slotSel.value) }, 'Restored'))),
    el(
      'div',
      { class: 'line wrap' },
      btn('Let their browser claim again', () => void act('clearOwnerBinding', { roomId: room.id }, 'That browser can claim another room')),
      btn('Clear toy layout', () => void act('resetLayout', { roomId: room.id }, 'Layout cleared', 'Remove every toy the owner placed?')),
      active ? btn('Release claim', () => void act('release', { roomId: room.id }, 'Released. Pages and content are kept.', `Release room ${room.slot + 1}? The entrance becomes free.`), 'danger') : null,
    ),
  );

  const pages = el('section', { class: 'box' }, el('h3', {}, `Sketchbook (${d.pages.length})`), ...(d.pages.length ? d.pages.map(renderPage) : [el('p', { class: 'empty' }, 'No pages yet.')]));
  const log = el('section', { class: 'box' }, el('h3', {}, 'History'), el('ul', { class: 'log' }, ...d.log.map((l) => el('li', {}, el('span', { class: 'when' }, ago(l.at)), el('span', { class: `who ${l.by}` }, l.by), ' ', l.what))));

  detailEl.replaceChildren(
    el(
      'div',
      { class: 'detail-head' },
      el('h2', {}, `Room ${room.slot + 1} · ${room.ownerName}`),
      el('span', { class: `pill ${active ? 'available' : 'removed'}` }, room.status),
      active ? el('a', { class: 'b ghost', href: `/?room=${encodeURIComponent(room.id)}`, target: '_blank' }, 'Visit') : null,
    ),
    el('p', { class: 'sub' }, `Claimed ${new Date(room.claimedAt).toLocaleString()} · updated ${ago(room.updatedAt)}`),
    renderContent(),
    pages,
    actions,
    log,
  );
}

function strokesCanvas(sketch: Stroke[], size = 180): HTMLCanvasElement {
  const c = el('canvas', { class: 'thumb', width: String(size * 2), height: String(size * 2) }) as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fffdf7';
  g.fillRect(0, 0, c.width, c.height);
  g.lineCap = g.lineJoin = 'round';
  const s = c.width / 1000;
  for (const st of sketch) {
    g.strokeStyle = SKETCH_COLORS[st.c];
    g.lineWidth = SKETCH_WIDTHS[st.w] * (c.width / 500);
    g.beginPath();
    for (let i = 0; i < st.p.length; i += 2) {
      if (i === 0) g.moveTo(st.p[i] * s, st.p[i + 1] * s);
      else g.lineTo(st.p[i] * s, st.p[i + 1] * s);
    }
    if (st.p.length === 2) g.lineTo(st.p[0] * s + 0.5, st.p[1] * s);
    g.stroke();
  }
  return c;
}

function renderPage(p: DetailPage): HTMLElement {
  const roomId = detail!.room.id;
  const status = el('select', { class: 'in short', 'aria-label': 'Status' }) as HTMLSelectElement;
  for (const s of ['requested', 'building', 'available'] as PageStatus[]) status.append(el('option', { value: s, selected: s === p.status }, s));
  status.addEventListener('change', () => void act('pageStatus', { roomId, pageId: p.id, status: status.value }, `Page ${p.n} marked ${status.value}`));
  const hist = el(
    'details',
    {},
    el('summary', {}, `Earlier versions (${p.history.length})`),
    ...p.history.map((v, i) =>
      el(
        'div',
        { class: 'version' },
        el('div', { class: 'row-sub' }, `${ago(v.savedAt)} by ${v.by}`),
        el('div', { class: 'text' }, v.text),
        btn('Make this the current version', () => void act('revertPage', { roomId, pageId: p.id, index: i }, `Page ${p.n} reverted`, 'Replace the current page with this version? The current text is kept in history.'), 'small'),
      ),
    ),
  );
  return el(
    'article',
    { class: `page${p.removed ? ' removed' : ''}`, 'data-page': p.id },
    el(
      'div',
      { class: 'page-head' },
      el('strong', {}, `Page ${p.n}`),
      p.seen ? null : el('span', { class: 'pill new' }, 'unseen'),
      p.removed ? el('span', { class: 'pill removed' }, 'removed') : null,
      el('span', { class: 'row-sub' }, `rev ${p.rev} · ${ago(p.updatedAt)}`),
      el('span', { class: 'grow' }),
      status,
      p.seen ? null : btn('Mark seen', () => void act('markSeen', { roomId, pageId: p.id }, 'Marked seen'), 'small'),
      btn(p.removed ? 'Restore' : 'Remove', () => void act('removePage', { roomId, pageId: p.id, removed: !p.removed }, p.removed ? 'Restored' : 'Removed', p.removed ? undefined : 'Hide this page from the owner?'), 'small'),
    ),
    el('div', { class: 'page-body' }, p.sketch.length ? strokesCanvas(p.sketch) : null, el('div', { class: 'text' }, p.text)),
    p.note ? el('p', { class: 'page-note' }, p.note) : null,
    p.history.length ? hist : null,
  );
}

// ---------------------------------------------------------------------------
// Content editor: games (cabinets) and inner areas on a top-down map

function areaOf(id: string): Area | undefined {
  return content!.areas.find((a) => a.id === id);
}

function markDirty(): void {
  contentDirty = true;
  renderDetail();
}

function freeSpot(kind: 'main' | 'area', test: (x: number, z: number) => boolean): { x: number; z: number } | null {
  for (let ring = 0; ring < 14; ring++) {
    const r = ring * 0.7;
    const steps = Math.max(1, ring * 8);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(Math.sin(a) * r * 10) / 10;
      const z = Math.round((Math.cos(a) * r - 1.5) * 10) / 10;
      if (test(x, z)) return { x, z };
    }
  }
  void kind;
  return null;
}

function renderContent(): HTMLElement {
  const c = content!;
  const spaces = el('div', { class: 'spaces' });
  const addSpace = (id: string, label: string) => {
    const b = btn(label, () => {
      space = id;
      selected = null;
      renderDetail();
    }, space === id ? 'on' : '');
    spaces.append(b);
  };
  addSpace('main', 'Main room');
  for (const a of c.areas) addSpace(a.id, `${a.name}${a.published ? '' : ' (draft)'}`);
  if (c.areas.length < MAX_AREAS) {
    spaces.append(
      btn('+ Inner area', () => {
        const a: Area = { id: rid('a'), name: `Area ${c.areas.length + 1}`, theme: { wall: 3, floor: 2, trim: 2 }, props: [], published: false };
        c.areas.push(a);
        space = a.id;
        selected = null;
        markDirty();
      }, 'ghost'),
    );
  }

  const area = space === 'main' ? undefined : areaOf(space);
  const areaFields = area ? renderAreaFields(area) : null;

  const exhibits = c.exhibits.filter((e) => e.area === space);
  const addGame = btn('+ Game cabinet here', () => {
    const kind = space === 'main' ? 'main' : 'area';
    const others = c.exhibits.filter((e) => e.area === space);
    const props = space === 'main' ? detail!.room.layout : (area?.props ?? []);
    const ok = (x: number, z: number) => !exhibitProblem({ x, z }, kind) && others.every((o) => Math.hypot(o.x - x, o.z - z) > 2) && props.every((p) => Math.hypot(p.x - x, p.z - z) > PROP_SPECS[p.kind].radius + 1);
    // Prefer spots along the walls, then anywhere free.
    const wallSpots = [
      [5.4, -2.6], [-5.4, -2.6], [5.4, 3.8], [-5.4, 3.8], [3.4, 4.2], [-3.4, 4.2], [5.4, -0.6], [-5.4, -0.6],
    ].map(([x, z]) => ({ x, z }));
    const spot = wallSpots.find((p) => ok(p.x, p.z)) ?? freeSpot(kind, ok);
    if (!spot) return flash('No free space for another cabinet', true);
    // Face the middle of the room.
    const rot = Math.round(Math.atan2(-spot.x, -spot.z) * 1000) / 1000;
    const e: Exhibit = { id: rid('g'), title: 'New game', blurb: '', url: 'https://', area: space, x: spot.x, z: spot.z, rot, color: 2, pages: [], published: false };
    c.exhibits.push(e);
    selected = { type: 'exhibit', id: e.id };
    markDirty();
  });
  const addProps = area
    ? el(
        'div',
        { class: 'line wrap' },
        el('span', { class: 'row-sub' }, 'Add toy:'),
        ...PROP_KINDS.map((k) =>
          btn(PROP_SPECS[k].name, () => {
            const ctx = { kind: 'area' as const, exhibits: c.exhibits.filter((e) => e.area === area.id) };
            const spot = freeSpot('area', (x, z) => !placementProblem({ kind: k, x, z }, ctx, area.props));
            if (!spot) return flash('No free space', true);
            const p: PropPlacement = { id: rid(k), kind: k, x: spot.x, z: spot.z, rot: 0 };
            area.props.push(p);
            selected = { type: 'prop', id: p.id };
            markDirty();
          }, 'small'),
        ),
      )
    : null;

  const problem = contentProblem(c);
  const save = btn(contentDirty ? 'Save and publish' : 'Saved', () => void saveContent(), 'primary');
  save.disabled = !contentDirty || !!problem;
  const revert = btn('Undo changes', () => {
    content = structuredClone(detail!.content);
    contentDirty = false;
    selected = null;
    renderDetail();
  }, 'ghost');
  revert.disabled = !contentDirty;

  return el(
    'section',
    { class: 'box content' },
    el('h3', {}, 'Built content'),
    el('p', { class: 'row-sub' }, 'Place game cabinets in the main room or in inner areas. Only items marked published show to visitors. Owner toys in the main room are shown faded.'),
    spaces,
    areaFields,
    area?.experience ? el('div', { class: 'editor' }, renderExperiencePreview(area)) : el('div', { class: 'editor' }, renderMap(exhibits, area), renderInspector()),
    area?.experience ? null : el('div', { class: 'line wrap' }, addGame, addProps),
    problem ? el('p', { class: 'err' }, problem) : null,
    el('div', { class: 'line' }, el('span', { class: 'grow' }), revert, save),
  );
}

function colorSelect(colors: string[], value: number, onChange: (v: number) => void, label: string): HTMLElement {
  const wrap = el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': label });
  colors.forEach((col, i) => {
    const b = el('button', { type: 'button', class: `sw${i === value ? ' on' : ''}`, 'aria-label': `${label} ${i + 1}`, style: `--c:${col}` });
    b.addEventListener('click', () => onChange(i));
    wrap.append(b);
  });
  return wrap;
}

function renderAreaFields(a: Area): HTMLElement {
  const name = el('input', { class: 'in', value: a.name, maxlength: '30', 'aria-label': 'Area name' }) as HTMLInputElement;
  name.addEventListener('change', () => {
    a.name = name.value.trim() || a.name;
    markDirty();
  });
  const pub = el('input', { type: 'checkbox', checked: a.published }) as HTMLInputElement;
  pub.addEventListener('change', () => {
    a.published = pub.checked;
    markDirty();
  });
  const del = btn('Delete area', () => {
    if (!confirm(`Delete ${a.name}? Games inside it move to the main room as drafts.`)) return;
    content!.areas = content!.areas.filter((x) => x.id !== a.id);
    for (const e of content!.exhibits) if (e.area === a.id) Object.assign(e, { area: 'main', published: false });
    space = 'main';
    selected = null;
    markDirty();
  }, 'danger small');
  const theme = (key: keyof RoomTheme, colors: string[], label: string) =>
    el(
      'div',
      { class: 'kv' },
      el('span', {}, label),
      colorSelect(colors, a.theme[key], (v) => {
        a.theme = { ...a.theme, [key]: v };
        markDirty();
      }, label),
    );
  return el(
    'div',
    { class: 'area-fields' },
    el('div', { class: 'line' }, name, el('label', { class: 'check' }, pub, ' Published'), del),
    renderExperienceFields(a),
    a.experience ? null : theme('wall', WALL_COLORS, 'Walls'),
    a.experience ? null : theme('floor', FLOOR_COLORS, 'Floor'),
    theme('trim', TRIM_COLORS, 'Door colour'),
    renderAreaPages(a),
  );
}

/** What the area is: a room with toys, a kart track drawn on a page, or a casino. */
function renderExperienceFields(a: Area): HTMLElement {
  const kind = el('select', { class: 'in short', 'aria-label': 'Area kind' }) as HTMLSelectElement;
  for (const [v, label] of [
    ['room', 'Room with toys'],
    ['kart', 'Kart track'],
    ['casino', 'Casino'],
    ['galaxy', 'Black hole galaxy'],
    ['neon', 'Neon space party'],
    ['fart', 'Fart simulator'],
  ]) kind.append(el('option', { value: v, selected: (a.experience?.kind ?? 'room') === v }, label));
  const sketched = detail!.pages.filter((p) => p.sketch.length);
  const pickTrack = (pageId: string): number[] | null => {
    const page = detail!.pages.find((p) => p.id === pageId);
    const track = page ? trackFromSketch(page.sketch) : null;
    if (!track) {
      flash('That drawing has no loop long enough to race on', true);
      return null;
    }
    const why = trackProblem(track);
    if (why) {
      flash(`${why}. Pick another drawing.`, true);
      return null;
    }
    return track;
  };
  kind.addEventListener('change', () => {
    const v = kind.value as 'room' | Experience['kind'];
    if (v !== 'room' && (a.props.length || content!.exhibits.some((e) => e.area === a.id))) {
      if (!confirm(`Turning ${a.name} into a ${v === 'kart' ? 'kart track' : 'casino'} puts its toys away and moves its cabinets to the main room as drafts.`)) {
        kind.value = a.experience?.kind ?? 'room';
        return;
      }
      a.props = [];
      for (const e of content!.exhibits) if (e.area === a.id) Object.assign(e, { area: 'main', published: false });
    }
    if (v === 'room') a.experience = null;
    else if (v === 'casino') a.experience = { kind: 'casino' };
    else if (v === 'galaxy') a.experience = { kind: 'galaxy' };
    else if (v === 'neon') a.experience = { kind: 'neon' };
    else if (v === 'fart') a.experience = { kind: 'fart' };
    else {
      // The designed circuit unless a drawing is picked below.
      a.experience = { kind: 'kart', track: grandPrixTrack(), laps: 3 };
    }
    selected = null;
    markDirty();
  });
  const row = el('div', { class: 'line wrap' }, el('span', { class: 'row-sub' }, 'This area is a'), kind);
  if (a.experience?.kind === 'kart') {
    const exp = a.experience;
    const from = el('select', { class: 'in short', 'aria-label': 'Track drawing' }) as HTMLSelectElement;
    from.append(el('option', { value: '' }, 'Change the course...'));
    from.append(el('option', { value: '@grand-prix' }, 'Toybox Grand Prix circuit'));
    for (const p of sketched) from.append(el('option', { value: p.id }, `The drawing on page ${p.n}: ${p.text.slice(0, 40)}`));
    from.addEventListener('change', () => {
      if (!from.value) return;
      if (from.value === '@grand-prix') {
        exp.track = grandPrixTrack();
        markDirty();
        return;
      }
      const t = pickTrack(from.value);
      if (!t) return;
      exp.track = t;
      if (!(a.pages ?? []).includes(from.value)) a.pages = [...(a.pages ?? []), from.value];
      markDirty();
    });
    const laps = el('select', { class: 'in short', 'aria-label': 'Race laps' }) as HTMLSelectElement;
    for (let n = 1; n <= 5; n++) laps.append(el('option', { value: String(n), selected: exp.laps === n }, `${n} lap race`));
    laps.addEventListener('change', () => {
      exp.laps = Number(laps.value);
      markDirty();
    });
    row.append(from, laps, btn('Clear lap times', () => void clearScoresFor(a, 'Lap times cleared'), 'small'));
  } else if (a.experience?.kind === 'casino') {
    row.append(btn('Reset everyone\u2019s credits', () => void clearScoresFor(a, 'Credits reset'), 'small'));
  }
  return row;
}

async function clearScoresFor(a: Area, done: string): Promise<void> {
  if (!detail || !confirm(`${done.replace(' cleared', '').replace(' reset', '')} for ${a.name}: this cannot be undone. Continue?`)) return;
  const r = await post('clearScores', { roomId: detail.room.id, areaId: a.id });
  flash(r.ok ? done : (r.data.error ?? 'Failed'), !r.ok);
}

/** Which sketchbook pages an area was built from. */
function renderAreaPages(a: Area): HTMLElement | null {
  if (!detail!.pages.length) return null;
  return el(
    'details',
    { class: 'area-pages', open: !!(a.pages && a.pages.length) },
    el('summary', {}, `Built from (${(a.pages ?? []).length})`),
    ...detail!.pages.map((p) => {
      const cb = el('input', { type: 'checkbox', checked: (a.pages ?? []).includes(p.id) }) as HTMLInputElement;
      cb.addEventListener('change', () => {
        a.pages = cb.checked ? [...(a.pages ?? []), p.id] : (a.pages ?? []).filter((x) => x !== p.id);
        markDirty();
      });
      return el('label', { class: 'check' }, cb, ` Page ${p.n}: ${p.text.slice(0, 60)}`);
    }),
  );
}

/** A kart track's shape, or a note for a casino. */
function renderExperiencePreview(a: Area): HTMLElement {
  const exp = a.experience!;
  if (exp.kind === 'fart') {
    return el('div', { class: 'inspector' }, el('h4', {}, 'Fart simulator'), el('p', { class: 'row-sub' }, 'Time cartoon puffs to clear five gold hoops in thirty seconds. Local solo rounds with a pressure meter, sound, results and replay.'));
  }
  if (exp.kind === 'neon') {
    return el('div', { class: 'inspector' }, el('h4', {}, 'Neon space party'), el('p', { class: 'row-sub' }, 'Tag moving drones with lasers and glowing batons, then dance on the lit floor panels. One local round against robot dancers.'));
  }
  if (exp.kind === 'galaxy') {
    return el('div', { class: 'inspector' }, el('h4', {}, 'Black hole galaxy'), el('p', { class: 'row-sub' }, 'A floating crystal platform in another dimension. Kick glowing orbs off the edge into the black hole; feeding frenzies are 60-second rounds with a best-score board.'));
  }
  if (exp.kind === 'casino') {
    return el('div', { class: 'inspector' }, el('h4', {}, 'Casino'), el('p', { class: 'row-sub' }, 'A giant slot machine with a lever, a credits kiosk with each player\u2019s balance over time, and a top balances board. Players start with 1,000 play credits and get a free refill when they run out.'));
  }
  const cv = el('canvas', { class: 'map', width: '1120', height: '760' }) as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < exp.track.length; i += 2) {
    xs.push(exp.track[i]);
    zs.push(exp.track[i + 1]);
  }
  const minX = Math.min(...xs) - 10;
  const maxX = Math.max(...xs) + 10;
  const minZ = Math.min(...zs) - 10;
  const maxZ = Math.max(...zs) + 10;
  const sc = Math.min(cv.width / (maxX - minX), cv.height / (maxZ - minZ));
  const ox = (cv.width - (maxX - minX) * sc) / 2;
  const oz = (cv.height - (maxZ - minZ) * sc) / 2;
  const X = (x: number) => ox + (x - minX) * sc;
  const Z = (z: number) => oz + (z - minZ) * sc;
  g.fillStyle = '#7fc25a';
  g.fillRect(0, 0, cv.width, cv.height);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  for (const [w, c] of [
    [10.8, '#e8574a'],
    [9, '#4b4e5e'],
  ] as const) {
    g.strokeStyle = c;
    g.lineWidth = w * sc;
    g.beginPath();
    xs.forEach((x, i) => (i ? g.lineTo(X(x), Z(zs[i])) : g.moveTo(X(x), Z(zs[i]))));
    g.closePath();
    g.stroke();
  }
  g.fillStyle = '#fffaf0';
  g.beginPath();
  g.arc(X(xs[0]), Z(zs[0]), 9, 0, Math.PI * 2);
  g.fill();
  g.font = '600 26px Atkinson Hyperlegible Next Variable, sans-serif';
  g.fillText('Start', X(xs[0]) + 14, Z(zs[0]) + 8);
  const len = xs.reduce((sum, x, i) => sum + Math.hypot(x - xs[(i + 1) % xs.length], zs[i] - zs[(i + 1) % zs.length]), 0);
  return el('div', { class: 'inspector' }, cv, el('p', { class: 'row-sub' }, `${Math.round(len)} m lap, ${exp.laps} lap race against three computer drivers. Laps are timed and the best go on the board.`));
}

function renderMap(exhibits: Exhibit[], area: Area | undefined): HTMLCanvasElement {
  const W = 560;
  const H = Math.round((W * (ROOM.halfD * 2 + 2)) / (ROOM.halfW * 2 + 2));
  const cv = el('canvas', { class: 'map', width: String(W * 2), height: String(H * 2) }) as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const s = (W * 2) / (ROOM.halfW * 2 + 2);
  const X = (x: number) => (x + ROOM.halfW + 1) * s;
  const Z = (z: number) => (z + ROOM.halfD + 1) * s;
  const props = area ? area.props : detail!.room.layout;
  const theme = area ? area.theme : detail!.room.theme;

  const draw = () => {
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#efe3cf';
    g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = FLOOR_COLORS[theme.floor];
    g.fillRect(X(-ROOM.halfW), Z(-ROOM.halfD), ROOM.halfW * 2 * s, ROOM.halfD * 2 * s);
    g.strokeStyle = TRIM_COLORS[theme.trim];
    g.lineWidth = 0.3 * s;
    g.strokeRect(X(-ROOM.halfW), Z(-ROOM.halfD), ROOM.halfW * 2 * s, ROOM.halfD * 2 * s);
    // Doorway corridor.
    g.fillStyle = 'rgba(232,87,74,0.18)';
    g.fillRect(X(-ROOM.corridor.halfW), Z(ROOM.corridor.fromZ), ROOM.corridor.halfW * 2 * s, (ROOM.halfD - ROOM.corridor.fromZ) * s);
    g.fillStyle = '#2b2340';
    g.font = `${0.45 * s}px Atkinson Hyperlegible Next Variable, sans-serif`;
    g.textAlign = 'center';
    g.fillText('door', X(0), Z(ROOM.halfD) - 0.25 * s);
    if (!area) {
      for (const [f, label] of [
        [ROOM.lectern, 'book'],
        [ROOM.chest, 'toys'],
      ] as const) {
        g.fillStyle = 'rgba(43,35,64,0.25)';
        g.beginPath();
        g.arc(X(f.x), Z(f.z), f.r * s, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#2b2340';
        g.fillText(label, X(f.x), Z(f.z) + 0.15 * s);
      }
      content!.areas.forEach((a, i) => {
        const dx = areaDoorX(i);
        if (dx === undefined) return;
        g.fillStyle = a.published ? TRIM_COLORS[a.theme.trim] : 'rgba(43,35,64,0.3)';
        g.fillRect(X(dx - 0.75), Z(-ROOM.halfD) - 0.15 * s, 1.5 * s, 0.4 * s);
        g.fillStyle = '#2b2340';
        g.fillText(a.name, X(dx), Z(-ROOM.halfD) + 0.8 * s);
      });
    }
    for (const p of props) {
      const sel = selected?.type === 'prop' && selected.id === p.id;
      g.globalAlpha = area ? 1 : 0.45;
      g.fillStyle = sel ? '#f4b740' : '#fffaf0';
      g.strokeStyle = '#2b2340';
      g.lineWidth = 0.06 * s;
      g.beginPath();
      g.arc(X(p.x), Z(p.z), PROP_SPECS[p.kind].radius * s, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#2b2340';
      g.fillText(PROP_SPECS[p.kind].name.split(' ')[0], X(p.x), Z(p.z) + 0.15 * s);
      g.globalAlpha = 1;
    }
    for (const e of exhibits) {
      const sel = selected?.type === 'exhibit' && selected.id === e.id;
      g.save();
      g.translate(X(e.x), Z(e.z));
      g.rotate(-e.rot);
      g.fillStyle = TRIM_COLORS[e.color];
      g.strokeStyle = sel ? '#f4b740' : '#2b2340';
      g.lineWidth = (sel ? 0.18 : 0.08) * s;
      g.fillRect(-0.55 * s, -0.42 * s, 1.1 * s, 0.85 * s);
      g.strokeRect(-0.55 * s, -0.42 * s, 1.1 * s, 0.85 * s);
      g.fillStyle = '#2b2340';
      g.beginPath();
      g.moveTo(0, 0.85 * s);
      g.lineTo(-0.2 * s, 0.5 * s);
      g.lineTo(0.2 * s, 0.5 * s);
      g.fill();
      g.restore();
      g.fillStyle = e.published ? '#2b2340' : '#8a6bd1';
      g.fillText(e.title + (e.published ? '' : ' (draft)'), X(e.x), Z(e.z) - 0.6 * s);
    }
  };
  draw();

  let drag: { type: 'exhibit' | 'prop'; id: string } | null = null;
  const pt = (ev: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * cv.width / s - ROOM.halfW - 1, z: ((ev.clientY - r.top) / r.height) * cv.height / s - ROOM.halfD - 1 };
  };
  cv.addEventListener('pointerdown', (ev) => {
    const p = pt(ev);
    const ex = exhibits.find((e) => Math.hypot(e.x - p.x, e.z - p.z) < 0.8);
    const pr = area ? props.find((q) => Math.hypot(q.x - p.x, q.z - p.z) < PROP_SPECS[q.kind].radius + 0.2) : undefined;
    selected = ex ? { type: 'exhibit', id: ex.id } : pr ? { type: 'prop', id: pr.id } : null;
    drag = selected;
    if (drag) cv.setPointerCapture(ev.pointerId);
    draw();
  });
  cv.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const p = pt(ev);
    const x = Math.round(Math.max(-ROOM.halfW, Math.min(ROOM.halfW, p.x)) * 10) / 10;
    const z = Math.round(Math.max(-ROOM.halfD, Math.min(ROOM.halfD, p.z)) * 10) / 10;
    if (drag.type === 'exhibit') {
      const e = exhibits.find((q) => q.id === drag!.id);
      if (e) Object.assign(e, { x, z });
    } else {
      const q = props.find((r) => r.id === drag!.id);
      if (q) Object.assign(q, { x, z });
    }
    contentDirty = true;
    draw();
  });
  cv.addEventListener('pointerup', () => {
    if (drag) {
      drag = null;
      renderDetail();
    }
  });
  return cv;
}

function renderInspector(): HTMLElement {
  const c = content!;
  if (!selected) return el('div', { class: 'inspector' }, el('p', { class: 'row-sub' }, 'Select a cabinet or a toy on the map, or drag it to move it.'));
  if (selected.type === 'prop') {
    const area = areaOf(space);
    const p = area?.props.find((q) => q.id === selected!.id);
    if (!area || !p) return el('div', { class: 'inspector' });
    return el(
      'div',
      { class: 'inspector' },
      el('h4', {}, PROP_SPECS[p.kind as PropKind].name),
      el('div', { class: 'line' }, btn('Turn left', () => {
        p.rot -= Math.PI / 4;
        markDirty();
      }, 'small'), btn('Turn right', () => {
        p.rot += Math.PI / 4;
        markDirty();
      }, 'small')),
      btn('Remove toy', () => {
        area.props = area.props.filter((q) => q.id !== p.id);
        selected = null;
        markDirty();
      }, 'danger small'),
    );
  }
  const e = c.exhibits.find((q) => q.id === selected!.id);
  if (!e) return el('div', { class: 'inspector' });
  const field = (label: string, input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => el('label', { class: 'field' }, el('span', {}, label), input);
  const title = el('input', { class: 'in', value: e.title, maxlength: '40' }) as HTMLInputElement;
  title.addEventListener('change', () => {
    e.title = title.value.trim() || e.title;
    markDirty();
  });
  const blurb = el('textarea', { class: 'in', maxlength: '140', rows: '2' }) as HTMLTextAreaElement;
  blurb.value = e.blurb;
  blurb.addEventListener('change', () => {
    e.blurb = blurb.value;
    markDirty();
  });
  const url = el('input', { class: 'in', value: e.url, maxlength: '400', placeholder: 'https://... or /games/...' }) as HTMLInputElement;
  url.addEventListener('change', () => {
    e.url = url.value.trim();
    markDirty();
  });
  const where = el('select', { class: 'in' }) as HTMLSelectElement;
  where.append(el('option', { value: 'main', selected: e.area === 'main' }, 'Main room'));
  for (const a of c.areas) where.append(el('option', { value: a.id, selected: e.area === a.id }, a.name));
  where.addEventListener('change', () => {
    e.area = where.value;
    space = where.value;
    markDirty();
  });
  const pub = el('input', { type: 'checkbox', checked: e.published }) as HTMLInputElement;
  pub.addEventListener('change', () => {
    e.published = pub.checked;
    markDirty();
  });
  const links = el(
    'div',
    { class: 'links' },
    ...detail!.pages.map((p) => {
      const cb = el('input', { type: 'checkbox', checked: e.pages.includes(p.id) }) as HTMLInputElement;
      cb.addEventListener('change', () => {
        e.pages = cb.checked ? [...e.pages, p.id] : e.pages.filter((x) => x !== p.id);
        markDirty();
      });
      return el('label', { class: 'check' }, cb, ` Page ${p.n}: ${p.text.slice(0, 50)}`);
    }),
  );
  return el(
    'div',
    { class: 'inspector' },
    el('h4', {}, 'Game cabinet'),
    field('Title', title),
    field('One line about it', blurb),
    field('Link', url),
    field('Stands in', where),
    el('div', { class: 'kv' }, el('span', {}, 'Colour'), colorSelect(TRIM_COLORS, e.color, (v) => {
      e.color = v;
      markDirty();
    }, 'Colour')),
    el('div', { class: 'line' }, btn('Turn left', () => {
      e.rot = Math.round((e.rot + Math.PI / 4) * 1000) / 1000;
      markDirty();
    }, 'small'), btn('Turn right', () => {
      e.rot = Math.round((e.rot - Math.PI / 4) * 1000) / 1000;
      markDirty();
    }, 'small')),
    detail!.pages.length ? el('div', { class: 'field' }, el('span', {}, 'Built from'), links) : null,
    el('label', { class: 'check' }, pub, ' Published'),
    btn('Delete cabinet', () => {
      c.exhibits = c.exhibits.filter((q) => q.id !== e.id);
      selected = null;
      markDirty();
    }, 'danger small'),
  );
}

async function saveContent(): Promise<void> {
  if (!detail || !content) return;
  const r = await post<{ content: RoomContent }>('saveContent', { roomId: detail.room.id, content });
  if (!r.ok) {
    if (r.status === 409) flash('Someone else saved this room first. Reload it to see theirs.', true);
    else flash(r.data.error ?? 'Save failed', true);
    return;
  }
  detail.content = r.data.content;
  content = structuredClone(r.data.content);
  contentDirty = false;
  flash('Saved. Visitors see the published items now.');
  renderDetail();
}

addEventListener('beforeunload', (e) => {
  if (contentDirty) e.preventDefault();
});

void boot();
