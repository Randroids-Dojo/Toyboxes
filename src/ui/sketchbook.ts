// The room's sketchbook: one page per idea, turn to a fresh page for a new
// request, and edit an older page to revise it. Pages keep their identity.
// Every visitor can read the book; writing needs the room PIN.

import { sfx } from '../audio/sfx';
import * as local from '../core/local';
import type { Input, MenuAction } from '../input/input';
import { api, retryText } from '../net/api';
import { MAX_PAGE_TEXT, MAX_SKETCH_POINTS, SKETCH_COLORS, SKETCH_WIDTHS, type Page, type Stroke } from '../shared/model';
import { choose, confirmBox } from './dialogs';
import { openKeyboard } from './osk';
import { button, h, type Panel, type UI } from './ui';

export interface EditSession {
  token(): string | null;
  touch(): void;
  /** Asks for the PIN again; resolves to a fresh token or null. */
  unlock(reason: string): Promise<string | null>;
}

interface Sheet {
  page: Page | null;
  text: string;
  sketch: Stroke[];
  /** Server rev this edit is based on. 0 for a new page. */
  baseRev: number;
  recovered: boolean;
}

const STATUS_LABEL: Record<string, string> = { requested: 'Requested', building: 'Being built', available: 'Ready to play' };

function sameSketch(a: Stroke[], b: Stroke[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pointCount(s: Stroke[]): number {
  return s.reduce((n, st) => n + st.p.length / 2, 0);
}

export async function openSketchbook(ui: UI, input: Input, opts: { roomId: string; ownerName: string; session: EditSession; onClose?: () => void }): Promise<void> {
  const { roomId, session } = opts;
  let pages: Page[] = [];
  let index = 0;
  let sheet: Sheet = { page: null, text: '', sketch: [], baseRev: 0, recovered: false };
  let saving = false;
  let color = 0;
  let width = 1;
  let drawing: Stroke | null = null;
  let padMode = false;
  /** The A press that starts pen mode must be released before it draws. */
  let waitRelease = false;
  const cursor = { x: 500, y: 500, down: false };
  /** False while reading; the PIN switches the open book to editing. */
  let editable = !!session.token();

  // ---- DOM
  const pageLabel = h('span', { class: 'book-page' });
  const stamp = h('span', { class: 'stamp hidden' });
  const statusEl = h('span', { class: 'save-state' });
  const retryBtn = button('Retry', () => void save(), 'ghost tiny hidden');
  const canvas = h('canvas', { class: 'sketch', 'data-nav': '', tabindex: '0', 'aria-label': 'Sketch area' }) as HTMLCanvasElement;
  const padHint = h('div', { class: 'sketch-pad-hint hidden' });
  const textarea = h('textarea', { class: 'field page-text', maxlength: String(MAX_PAGE_TEXT), rows: '7', placeholder: 'What should this game or space be like? Who is in it, what do you do, how do you win?', 'aria-label': 'Describe your idea' }) as HTMLTextAreaElement;
  const kbBtn = button('Keyboard', () => openKeyboard(ui, textarea, () => onEdit()), 'ghost tiny osk-open');
  const prevBtn = button('‹ Back', () => void flip(index - 1), 'ghost');
  const nextBtn = button('Next ›', () => void flip(index + 1), 'ghost');
  const newBtn = button('New page', () => void flip(pages.length), '');
  const saveBtn = button('Save page', () => void save(), 'primary');
  const editBtn = button('Write or edit', () => void startEditing(), 'primary');
  const closeBtn = button('Close', () => void close(), 'ghost');
  const emptyNote = h('p', { class: 'book-empty hidden' });

  const swatches = SKETCH_COLORS.map((c, i) => {
    const b = button('', () => {
      color = i;
      paintTools();
    }, 'swatch');
    b.style.setProperty('--c', c);
    b.setAttribute('aria-label', `Colour ${i + 1}`);
    return b;
  });
  const sizes = SKETCH_WIDTHS.map((w, i) => {
    const b = button('', () => {
      width = i;
      paintTools();
    }, 'size');
    b.append(h('i', {}));
    b.style.setProperty('--w', `${4 + w * 1.1}px`);
    b.setAttribute('aria-label', ['Thin pen', 'Medium pen', 'Thick pen'][i]);
    return b;
  });
  const undoBtn = button('Undo', () => {
    sheet.sketch = sheet.sketch.slice(0, -1);
    onEdit();
    render();
  }, 'ghost tiny');
  const clearBtn = button('Clear', async () => {
    if (!sheet.sketch.length) return;
    if (await confirmBox(ui, { title: 'Clear this drawing?', body: 'The words on the page stay.', ok: 'Clear drawing', danger: true })) {
      sheet.sketch = [];
      onEdit();
      render();
    }
  }, 'ghost tiny');

  const pageHeading = h('label', { class: 'page-label' }, 'Describe your idea');
  const el = h(
    'div',
    { class: 'book' },
    h('div', { class: 'book-head' }, h('h2', {}, `${opts.ownerName}'s sketchbook`), pageLabel, closeBtn),
    h(
      'div',
      { class: 'book-spread' },
      h(
        'div',
        { class: 'page page-left' },
        h('div', { class: 'sketch-wrap' }, canvas, padHint),
        h('div', { class: 'tools' }, h('div', { class: 'swatches' }, ...swatches), h('div', { class: 'sizes' }, ...sizes), undoBtn, clearBtn),
      ),
      h(
        'div',
        { class: 'page page-right' },
        h('div', { class: 'page-top' }, pageHeading, stamp),
        emptyNote,
        textarea,
        h('div', { class: 'page-meta' }, statusEl, retryBtn, kbBtn),
      ),
    ),
    h('div', { class: 'book-foot' }, prevBtn, newBtn, saveBtn, editBtn, nextBtn),
  );

  // ---- state helpers

  const dirty = () => {
    const p = sheet.page;
    if (!p) return sheet.text.trim().length > 0 || sheet.sketch.length > 0;
    return sheet.text !== p.text || !sameSketch(sheet.sketch, p.sketch) || sheet.recovered;
  };

  const pageKey = () => sheet.page?.id ?? 'new';

  let draftTimer = 0;
  const onEdit = () => {
    session.touch();
    clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => {
      if (dirty()) local.saveDraft(roomId, pageKey(), { text: sheet.text, sketch: sheet.sketch, baseRev: sheet.baseRev, at: Date.now() });
      else local.clearDraft(roomId, pageKey());
    }, 300);
    paintStatus();
  };

  const paintTools = () => {
    swatches.forEach((b, i) => b.classList.toggle('on', i === color));
    sizes.forEach((b, i) => b.classList.toggle('on', i === width));
  };

  const paintStatus = (override?: { text: string; kind: 'ok' | 'bad' | 'busy' }) => {
    const isDirty = dirty();
    let text: string;
    let kind: string;
    if (override) {
      text = override.text;
      kind = override.kind;
    } else if (!editable) {
      text = sheet.page ? `Written ${new Date(sheet.page.updatedAt).toLocaleDateString()}` : '';
      kind = '';
    } else if (saving) {
      text = 'Saving...';
      kind = 'busy';
    } else if (isDirty) {
      text = sheet.recovered ? 'Recovered your unsaved changes' : 'Not saved yet';
      kind = 'warn';
    } else if (sheet.page) {
      text = 'Saved';
      kind = 'ok';
    } else {
      text = 'Blank page';
      kind = '';
    }
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
    retryBtn.classList.toggle('hidden', kind !== 'bad');
    saveBtn.disabled = saving || !isDirty;
    const total = pages.length;
    const last = editable ? total : total - 1;
    pageLabel.textContent = sheet.page ? `Page ${sheet.page.n} · ${index + 1} of ${total}` : editable ? 'New page' : 'No pages yet';
    prevBtn.disabled = index === 0 || saving;
    nextBtn.disabled = index >= last || saving;
    nextBtn.textContent = editable && index === total - 1 ? 'New page ›' : 'Next ›';
    // On the last page, Next already turns to a fresh page.
    newBtn.classList.toggle('hidden', !editable || index >= total - 1);
    saveBtn.classList.toggle('hidden', !editable);
    editBtn.classList.toggle('hidden', editable);
    el.classList.toggle('reading', !editable);
    textarea.readOnly = !editable;
    pageHeading.textContent = editable ? 'Describe your idea' : 'The idea';
    const empty = !editable && total === 0;
    emptyNote.classList.toggle('hidden', !empty);
    emptyNote.textContent = empty ? `${opts.ownerName} hasn't written any ideas yet.` : '';
    textarea.classList.toggle('hidden', empty);
    const st = sheet.page?.status;
    stamp.classList.toggle('hidden', !st);
    if (st) {
      stamp.textContent = STATUS_LABEL[st] ?? st;
      stamp.dataset.status = st;
    }
  };

  const load = (i: number) => {
    index = Math.max(0, Math.min(editable ? pages.length : Math.max(0, pages.length - 1), i));
    const page = pages[index] ?? null;
    const d = editable ? local.draft(roomId, page?.id ?? 'new') : null;
    if (d && (!page || d.at > page.updatedAt || d.baseRev === page.rev) && (d.text !== (page?.text ?? '') || !sameSketch(d.sketch, page?.sketch ?? []))) {
      sheet = { page, text: d.text, sketch: d.sketch, baseRev: page ? d.baseRev || page.rev : 0, recovered: true };
    } else {
      if (d && editable) local.clearDraft(roomId, page?.id ?? 'new');
      sheet = { page, text: page?.text ?? '', sketch: page ? structuredClone(page.sketch) : [], baseRev: page?.rev ?? 0, recovered: false };
    }
    textarea.value = sheet.text;
    el.classList.remove('turn');
    void el.offsetWidth;
    el.classList.add('turn');
    render();
    paintStatus();
  };

  const flip = async (to: number) => {
    if (saving || to === index || to < 0 || to > (editable ? pages.length : pages.length - 1)) return;
    if (dirty()) {
      const ok = await save();
      if (!ok) return;
    }
    sfx.page();
    load(to);
    session.touch();
  };

  /** Switches the open book from reading to writing after a PIN check. */
  const startEditing = async () => {
    const t = session.token() ?? (await session.unlock('Enter the room PIN to write in this book.'));
    if (!t) return;
    editable = true;
    // An empty book opens on a fresh page; otherwise stay on the page being read.
    load(pages.length ? index : 0);
    textarea.focus({ preventScroll: true });
  };

  const tokenOrUnlock = async (): Promise<string | null> => {
    const t = session.token();
    if (t) return t;
    return session.unlock('Enter the PIN to keep editing');
  };

  const save = async (): Promise<boolean> => {
    if (saving) return false;
    if (!dirty()) return true;
    if (!sheet.text.trim()) {
      paintStatus({ text: 'Write a few words about the idea first', kind: 'bad' });
      retryBtn.classList.add('hidden');
      sfx.error();
      textarea.focus();
      return false;
    }
    const token = await tokenOrUnlock();
    if (!token) {
      paintStatus({ text: 'Locked. Your changes are kept on this device.', kind: 'bad' });
      return false;
    }
    saving = true;
    paintStatus();
    const key = pageKey();
    const r = sheet.page ? await api.updatePage(roomId, token, sheet.page.id, sheet.text, sheet.sketch, sheet.baseRev) : await api.createPage(roomId, token, sheet.text, sheet.sketch);
    saving = false;
    if (r.ok) {
      const page = r.data.page;
      const at = pages.findIndex((p) => p.id === page.id);
      if (at >= 0) pages[at] = page;
      else pages.push(page);
      local.clearDraft(roomId, key);
      index = pages.findIndex((p) => p.id === page.id);
      sheet = { page, text: page.text, sketch: structuredClone(page.sketch), baseRev: page.rev, recovered: false };
      sfx.confirm();
      paintStatus();
      return true;
    }
    if (r.status === 401) {
      session.unlock('Editing timed out. Enter the PIN to save.').then((t) => {
        if (t) void save();
      });
      paintStatus({ text: 'Locked. Your changes are kept on this device.', kind: 'bad' });
      return false;
    }
    if (r.status === 409 && r.extra.page) {
      const theirs = r.extra.page as Page;
      const pick = await choose(ui, {
        title: 'This page changed somewhere else',
        body: `The saved page says: "${theirs.text.slice(0, 120)}${theirs.text.length > 120 ? '…' : ''}"`,
        options: [
          { label: 'Keep my version', value: 'mine', note: 'Replaces the saved page with what you wrote here', primary: true },
          { label: 'Use the saved version', value: 'theirs', note: 'Drops what you wrote here' },
        ],
        cancel: 'Decide later',
      });
      const at = pages.findIndex((p) => p.id === theirs.id);
      if (at >= 0) pages[at] = theirs;
      if (pick === 'mine') {
        sheet.page = theirs;
        sheet.baseRev = theirs.rev;
        return save();
      }
      if (pick === 'theirs') {
        local.clearDraft(roomId, theirs.id);
        load(at >= 0 ? at : index);
        return true;
      }
      paintStatus({ text: 'Not saved: this page changed elsewhere', kind: 'bad' });
      return false;
    }
    local.saveDraft(roomId, key, { text: sheet.text, sketch: sheet.sketch, baseRev: sheet.baseRev, at: Date.now() });
    paintStatus({ text: `Couldn't save. ${r.error}.${retryText(r)}`, kind: 'bad' });
    sfx.error();
    return false;
  };

  const close = async () => {
    if (dirty() && !saving) {
      const ok = await save();
      if (!ok) {
        const leave = await confirmBox(ui, { title: 'Close without saving?', body: 'Your changes stay on this device and come back next time you open the book.', ok: 'Close book', cancel: 'Keep editing' });
        if (!leave) return;
      }
    }
    stopLoop();
    ui.close(panel);
    opts.onClose?.();
  };

  // ---- drawing

  const ctx = canvas.getContext('2d')!;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(10, Math.round(r.width * dpr));
    const hh = Math.max(10, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== hh) {
      canvas.width = w;
      canvas.height = hh;
    }
    render();
  };
  const render = () => {
    const w = canvas.width;
    const hh = canvas.height;
    ctx.clearRect(0, 0, w, hh);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const sx = w / 1000;
    const sy = hh / 1000;
    const strokes = drawing ? [...sheet.sketch, drawing] : sheet.sketch;
    for (const s of strokes) {
      ctx.strokeStyle = SKETCH_COLORS[s.c];
      ctx.lineWidth = SKETCH_WIDTHS[s.w] * (w / 500);
      ctx.beginPath();
      for (let i = 0; i < s.p.length; i += 2) {
        const x = s.p[i] * sx;
        const y = s.p[i + 1] * sy;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if (s.p.length === 2) ctx.lineTo(s.p[0] * sx + 0.1, s.p[1] * sy);
      ctx.stroke();
    }
    if (padMode) {
      ctx.strokeStyle = SKETCH_COLORS[color];
      ctx.lineWidth = 2 * (w / 500);
      ctx.beginPath();
      ctx.arc(cursor.x * sx, cursor.y * sy, (SKETCH_WIDTHS[width] + 6) * (w / 500), 0, Math.PI * 2);
      ctx.stroke();
    }
  };
  const toPage = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.round(Math.max(0, Math.min(1000, ((e.clientX - r.left) / r.width) * 1000))),
      y: Math.round(Math.max(0, Math.min(1000, ((e.clientY - r.top) / r.height) * 1000))),
    };
  };
  const startStroke = (x: number, y: number) => {
    if (pointCount(sheet.sketch) >= MAX_SKETCH_POINTS - 10) {
      paintStatus({ text: 'This drawing is full. Undo or clear to draw more.', kind: 'bad' });
      retryBtn.classList.add('hidden');
      return;
    }
    drawing = { c: color, w: width, p: [x, y] };
  };
  const extend = (x: number, y: number) => {
    if (!drawing) return;
    const n = drawing.p.length;
    const dx = x - drawing.p[n - 2];
    const dy = y - drawing.p[n - 1];
    if (dx * dx + dy * dy < 9) return;
    if (pointCount(sheet.sketch) + n / 2 >= MAX_SKETCH_POINTS) return;
    drawing.p.push(x, y);
  };
  const endStroke = () => {
    if (!drawing) return;
    sheet.sketch = [...sheet.sketch, drawing];
    drawing = null;
    onEdit();
    render();
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!editable) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = toPage(e);
    startStroke(p.x, p.y);
    render();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    for (const ce of e.getCoalescedEvents?.() ?? [e]) {
      const p = toPage(ce);
      extend(p.x, p.y);
    }
    render();
  });
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  // Controllers and remotes: A on the canvas starts pen mode; the stick or
  // arrows move the pen, A (or OK) puts it down and lifts it, B leaves.
  const setPadMode = (on: boolean) => {
    padMode = on;
    waitRelease = on;
    padHint.classList.toggle('hidden', !on);
    padHint.textContent = ui.device === 'pad' ? 'Stick moves the pen. Hold A to draw. B when done.' : 'Arrows move the pen. OK puts it down or lifts it. Back when done.';
    canvas.classList.toggle('pen', on);
    if (!on) {
      cursor.down = false;
      endStroke();
    }
    render();
  };
  canvas.addEventListener('click', () => {
    if (editable && ui.device !== 'touch' && ui.device !== 'kbm') setPadMode(true);
  });
  canvas.addEventListener('keydown', (e) => {
    if (editable && e.key === 'Enter' && !padMode) {
      e.preventDefault();
      setPadMode(true);
    }
  });

  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!padMode) return;
    const st = input.padStick();
    if (st && ui.device === 'pad') {
      cursor.x = Math.max(0, Math.min(1000, cursor.x + st.x * 520 * dt));
      cursor.y = Math.max(0, Math.min(1000, cursor.y + st.y * 520 * dt));
      if (waitRelease) {
        if (!st.a) waitRelease = false;
      } else if (st.a && !cursor.down) {
        cursor.down = true;
        startStroke(Math.round(cursor.x), Math.round(cursor.y));
      } else if (!st.a && cursor.down) {
        cursor.down = false;
        endStroke();
      }
    }
    if (cursor.down) extend(Math.round(cursor.x), Math.round(cursor.y));
    render();
  };
  const stopLoop = () => cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);

  const capture = (a: MenuAction): boolean => {
    if (!padMode) return false;
    if (a === 'back' || a === 'pause') {
      setPadMode(false);
      canvas.focus();
      return true;
    }
    if (ui.device === 'pad') return a !== 'alt' ? true : false;
    // Remote: arrows step the pen, OK toggles it.
    const step = 25;
    if (a === 'left') cursor.x = Math.max(0, cursor.x - step);
    if (a === 'right') cursor.x = Math.min(1000, cursor.x + step);
    if (a === 'up') cursor.y = Math.max(0, cursor.y - step);
    if (a === 'down') cursor.y = Math.min(1000, cursor.y + step);
    if (a === 'confirm') {
      cursor.down = !cursor.down;
      if (cursor.down) startStroke(Math.round(cursor.x), Math.round(cursor.y));
      else endStroke();
    }
    render();
    return true;
  };

  textarea.addEventListener('input', () => {
    sheet.text = textarea.value;
    onEdit();
  });
  textarea.addEventListener('focus', () => {
    setTimeout(() => textarea.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
  });

  const panel: Panel = {
    el,
    onBack: () => void close(),
    onPrev: () => void flip(index - 1),
    onNext: () => void flip(index + 1),
    initial: () => (editable ? textarea : !nextBtn.disabled ? nextBtn : editBtn),
    capture,
  };
  ui.open(panel);
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  paintTools();

  // ---- fetch pages
  statusEl.textContent = 'Opening...';
  paintStatus({ text: 'Opening...', kind: 'busy' });
  const r = await api.pages(roomId);
  if (!r.ok) {
    paintStatus({ text: `Couldn't open the book. ${r.error}`, kind: 'bad' });
    retryBtn.onclick = () => {
      stopLoop();
      ui.close(panel);
      void openSketchbook(ui, input, opts);
    };
    retryBtn.classList.remove('hidden');
    return;
  }
  pages = r.data.pages;
  // Writers open on the newest page (or a fresh one); readers start at page one.
  load(editable ? (pages.length ? pages.length - 1 : 0) : 0);
  if (!editable) (!nextBtn.disabled ? nextBtn : editBtn).focus({ preventScroll: true });
}
