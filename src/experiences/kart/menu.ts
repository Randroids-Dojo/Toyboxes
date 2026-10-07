// The Grand Prix's menus, all through UI.open so arrows, d-pad, OK, A, tap,
// Back, B and Escape work everywhere: the race menu (circuit, class, mode),
// the garage, assists, how to race, the boards, results, standings, the
// trophy cabinet, the framed sketch and the podium card.

import { CIRCUITS, circuitLine, type HomeId } from '../../shared/kart/circuits';
import { BODIES, BODY_ORDER, CLASSES, CLASS_ORDER, MEDAL_NAMES, cupOrder, pointsFor, type ClassId } from '../../shared/kart/rules';
import { confirmBox } from '../../ui/dialogs';
import { button, h, type Panel } from '../../ui/ui';
import { formatLap, ordinal } from '../common';
import { buildBody } from './racekart';
import type { Racer } from './racer';
import { FLAMES, PAINTS } from './save';
import { kartSfx } from './sounds';
import type { KartWorld } from './world';

const CIRCUIT_NAME = (_w: KartWorld, id: HomeId) => (id === 'sketch' ? 'Home circuit' : CIRCUITS[id].name);
const CIRCUIT_BLURB = (id: HomeId) => (id === 'sketch' ? 'The track from this room\'s sketchbook.' : CIRCUITS[id].blurb);
const LAPS = (w: KartWorld, id: HomeId) => (id === 'sketch' ? (w.ctx.area.experience?.kind === 'kart' ? w.ctx.area.experience.laps : 3) : CIRCUITS[id].laps);
const MEDAL_COLORS = ['', '#d9905a', '#d6dbe6', '#f5c542', '#7ef0ff'];

function card(...children: (Node | string | null | false)[]): HTMLElement {
  return h('div', { class: 'card xk-card xk-card-dark km' }, ...children);
}

/** A tiny map of a circuit for the menu card. */
function circuitArt(w: KartWorld, id: HomeId): HTMLCanvasElement {
  const c = h('canvas', { class: 'km-art', width: 240, height: 150 });
  const g = c.getContext('2d')!;
  const line = id === w.c.id ? w.c.path : null;
  let pts: number[] = [];
  if (line) for (let i = 0; i < line.n; i++) pts.push(line.x[i], line.z[i]);
  else pts = id === 'sketch' ? (w.ctx.area.experience as { track: number[] }).track : circuitLineCache(id);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]);
    maxX = Math.max(maxX, pts[i]);
    minZ = Math.min(minZ, pts[i + 1]);
    maxZ = Math.max(maxZ, pts[i + 1]);
  }
  const k = Math.min(200 / (maxX - minX), 120 / (maxZ - minZ));
  const ox = 120 - ((minX + maxX) / 2) * k;
  const oz = 75 - ((minZ + maxZ) / 2) * k;
  const theme = id === 'sketch' ? 'playroom' : CIRCUITS[id].theme;
  const bg = { playroom: '#d9a066', garden: '#7fc25a', beach: '#f2d49b', bedroom: '#1b1f4a' }[theme];
  g.fillStyle = bg;
  g.fillRect(0, 0, 240, 150);
  g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i <= pts.length; i += 2) {
    const j = i % pts.length;
    const x = ox + pts[j] * k;
    const y = oz + pts[j + 1] * k;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.strokeStyle = '#1d1830';
  g.lineWidth = 11;
  g.stroke();
  g.strokeStyle = theme === 'bedroom' ? '#7ef0ff' : '#fffaf0';
  g.lineWidth = 5;
  g.stroke();
  g.fillStyle = '#e8574a';
  g.beginPath();
  g.arc(ox + pts[0] * k, oz + pts[1] * k, 6, 0, Math.PI * 2);
  g.fill();
  return c;
}

function circuitLineCache(id: HomeId): number[] {
  return circuitLine(id as Parameters<typeof circuitLine>[0]);
}

/** A kart preview: the body shape painted, drawn side on. */
function kartPreview(body: string, paint: string): HTMLCanvasElement {
  const c = h('canvas', { class: 'km-kart', width: 220, height: 110 });
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(0, 0, 220, 110);
  const shape = buildBody(body as never, paint);
  // A side view: sort parts back to front, draw each as a rounded block.
  const parts = shape.parts
    .map((p) => {
      const pos = { x: p.m.elements[12], y: p.m.elements[13], z: p.m.elements[14] };
      const geo = p.geo;
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      const sx = Math.hypot(p.m.elements[8], p.m.elements[9], p.m.elements[10]);
      const sy = Math.hypot(p.m.elements[4], p.m.elements[5], p.m.elements[6]);
      return { pos, d: (bb.max.z - bb.min.z) * sx, hgt: (bb.max.y - bb.min.y) * sy, color: String(p.color) };
    })
    .sort((a, b) => a.pos.x - b.pos.x);
  const k = 72;
  for (const p of parts) {
    g.fillStyle = p.color;
    const x = 110 + p.pos.z * k - (p.d * k) / 2;
    const y = 92 - p.pos.y * k - (p.hgt * k) / 2;
    g.beginPath();
    g.roundRect(x, y, Math.max(2, p.d * k), Math.max(2, p.hgt * k), 6);
    g.fill();
  }
  g.fillStyle = '#24212e';
  for (const z of [-0.62, 0.62]) {
    g.beginPath();
    g.arc(110 + z * k, 92 - 0.24 * k, (z > 0 ? 0.22 : 0.27) * k, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#d8d4e0';
  for (const z of [-0.62, 0.62]) {
    g.beginPath();
    g.arc(110 + z * k, 92 - 0.24 * k, 0.1 * k, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

let menuCircuit: HomeId | null = null;

export function openRaceMenu(w: KartWorld): void {
  const ui = w.ctx.ui;
  const d = w.save.d;
  menuCircuit = menuCircuit && w.circuits.includes(menuCircuit) ? menuCircuit : w.c.id;
  let cls: ClassId = d.cls === 'rocket' && !w.save.rocketOpen() ? 'battery' : d.cls;
  const body = h('div', { class: 'km-body' });
  let focusId = 'cup';
  const panel: Panel = {
    el: card(h('div', { class: 'xk-card-kicker' }, 'Toybox Grand Prix'), h('h2', {}, 'Race menu'), body),
    onBack: () => ui.close(panel),
    onPrev: () => flip(-1),
    onNext: () => flip(1),
    initial: () => body.querySelector<HTMLElement>(`[data-id="${focusId}"]`) ?? body.querySelector('button'),
  };
  const flip = (dir: number) => {
    const i = w.circuits.indexOf(menuCircuit!);
    menuCircuit = w.circuits[(i + dir + w.circuits.length) % w.circuits.length];
    kartSfx.tick();
    focusId = dir < 0 ? 'prev' : 'next';
    render();
  };
  const start = (kind: 'cup' | 'single' | 'trial') => {
    d.cls = cls;
    w.save.save();
    ui.close(panel);
    if (kind === 'cup') void w.startSession({ kind: 'cup', circuit: w.circuits[0], cls, items: true }, w.newCup());
    else void w.startSession({ kind, circuit: menuCircuit!, cls: kind === 'trial' ? 'battery' : cls, items: kind === 'single' ? d.items : false });
  };
  const render = () => {
    const id = menuCircuit!;
    const best = d.bestLap[id];
    const med = d.medals[id] ?? 0;
    const lead = w.boards[id]?.board[0];
    const tag = (cid: string) => (el: HTMLElement) => {
      el.dataset.id = cid;
      return el;
    };
    const prev = tag('prev')(button('‹', () => flip(-1), 'ghost km-arrow'));
    prev.setAttribute('aria-label', 'Previous circuit');
    const next = tag('next')(button('›', () => flip(1), 'ghost km-arrow'));
    next.setAttribute('aria-label', 'Next circuit');
    const info = h(
      'div',
      { class: 'km-circuit' },
      circuitArt(w, id),
      h('div', { class: 'km-cname' }, CIRCUIT_NAME(w, id)),
      h('div', { class: 'km-cblurb' }, CIRCUIT_BLURB(id)),
      h(
        'div',
        { class: 'km-cfacts' },
        h('span', {}, `${LAPS(w, id)} laps`),
        h('span', {}, best ? `Your best ${formatLap(best)}` : 'No lap yet'),
        med ? h('span', { class: 'km-medal', style: `--m:${MEDAL_COLORS[med]}` }, MEDAL_NAMES[med]) : null,
        lead ? h('span', {}, `Board: ${lead.name} ${formatLap(lead.value)}`) : null,
      ),
    );
    const classes = h(
      'div',
      { class: 'km-row km-classes' },
      ...CLASS_ORDER.map((c) => {
        const locked = c === 'rocket' && !w.save.rocketOpen();
        const b = tag(`cls-${c}`)(button(locked ? `${CLASSES[c].name} (locked)` : CLASSES[c].name, () => {
          if (locked) {
            ui.toast('Win a Battery trophy to open Rocket', 'info');
            return;
          }
          cls = c;
          focusId = `cls-${c}`;
          render();
        }, c === cls ? 'primary' : 'ghost'));
        if (c === cls) b.setAttribute('aria-pressed', 'true');
        return b;
      }),
    );
    const modes = h(
      'div',
      { class: 'km-grid' },
      tag('cup')(button('Toybox Cup', () => start('cup'), 'primary km-big')),
      tag('single')(button('Single race', () => start('single'), 'km-big')),
      tag('trial')(button('Time trial', () => start('trial'), 'km-big')),
    );
    const more = h(
      'div',
      { class: 'km-row' },
      tag('items')(button(`Items: ${d.items ? 'on' : 'off'}`, () => {
        d.items = !d.items;
        w.save.save();
        focusId = 'items';
        render();
      }, 'ghost')),
      tag('garage')(button('Garage', () => garage(w, () => render()), 'ghost')),
      tag('assists')(button('Assists', () => assists(w), 'ghost')),
      tag('help')(button('How to race', () => help(w), 'ghost')),
      tag('boards')(button('Boards', () => openBoards(w, id), 'ghost')),
      tag('warm')(button('Warm-up lap', () => {
        ui.close(panel);
        void w.startSession({ kind: 'warmup', circuit: w.circuits[0], cls: 'windup', items: true });
      }, 'ghost')),
    );
    const out = h(
      'div',
      { class: 'km-row km-foot' },
      tag('free')(button('Free drive', () => ui.close(panel), 'ghost')),
      tag('out')(button('Get out of the kart', () => w.getOut(), 'ghost')),
    );
    body.replaceChildren(h('div', { class: 'km-carousel' }, prev, info, next), h('div', { class: 'km-label' }, CLASSES[cls].name, h('small', {}, ` ${CLASSES[cls].blurb}`)), classes, modes, more, out);
    requestAnimationFrame(() => {
      const el = body.querySelector<HTMLElement>(`[data-id="${focusId}"]`);
      if (el && ui.device !== 'touch') el.focus({ preventScroll: true });
    });
  };
  render();
  ui.open(panel);
}

function subPanel(w: KartWorld, title: string, content: HTMLElement, done?: () => void): Panel {
  const ui = w.ctx.ui;
  const back = button('Done', () => ui.close(panel), 'primary');
  const panel: Panel = {
    el: card(h('div', { class: 'xk-card-kicker' }, 'Toybox Grand Prix'), h('h2', {}, title), content, h('div', { class: 'actions' }, back)),
    onBack: () => ui.close(panel),
    onClose: () => done?.(),
    initial: () => content.querySelector('button') ?? back,
  };
  ui.open(panel);
  return panel;
}

function garage(w: KartWorld, done: () => void): void {
  const d = w.save.d;
  const content = h('div', { class: 'km-garage' });
  const render = (focus?: string) => {
    const k = d.kart;
    const paint = PAINTS.find((p) => p.id === k.paint)!;
    const tag = (id: string, el: HTMLElement) => ((el.dataset.id = id), el);
    content.replaceChildren(
      kartPreview(k.body, paint.color),
      h('div', { class: 'km-label' }, 'Kart'),
      h(
        'div',
        { class: 'km-row' },
        ...BODY_ORDER.map((b) => {
          const own = d.bodies.includes(b);
          return tag(`b-${b}`, button(own ? BODIES[b].name : `${BODIES[b].name} (locked)`, () => {
            if (!own) return w.ctx.ui.toast(b === 'zippy' ? 'Finish a cup to unlock Zippy' : 'Win the Battery cup to unlock Chunky', 'info');
            d.kart.body = b;
            apply(w);
            render(`b-${b}`);
          }, k.body === b ? 'primary' : 'ghost'));
        }),
      ),
      h('div', { class: 'km-note' }, BODIES[k.body].blurb),
      h('div', { class: 'km-label' }, 'Paint'),
      h(
        'div',
        { class: 'km-swatches' },
        ...PAINTS.map((p) => {
          const own = d.paints.includes(p.id);
          const b = tag(`p-${p.id}`, button('', () => {
            if (!own) return w.ctx.ui.toast(`${p.name}: ${p.how}`, 'info');
            d.kart.paint = p.id;
            apply(w);
            render(`p-${p.id}`);
          }, `km-swatch${k.paint === p.id ? ' on' : ''}${own ? '' : ' locked'}`));
          b.style.setProperty('--sw', p.color);
          b.setAttribute('aria-label', own ? p.name : `${p.name}, locked: ${p.how}`);
          b.title = own ? p.name : `${p.name}: ${p.how}`;
          return b;
        }),
      ),
      h('div', { class: 'km-label' }, 'Boost flame'),
      h(
        'div',
        { class: 'km-row' },
        ...FLAMES.map((f) => {
          const own = d.flames.includes(f.id);
          const b = tag(`f-${f.id}`, button(own ? f.name : `${f.name} (locked)`, () => {
            if (!own) return w.ctx.ui.toast(`${f.name} flame: ${f.how}`, 'info');
            d.kart.flame = f.id;
            w.save.save();
            render(`f-${f.id}`);
          }, d.kart.flame === f.id ? 'primary' : 'ghost'));
          return b;
        }),
      ),
    );
    if (focus && w.ctx.ui.device !== 'touch') requestAnimationFrame(() => content.querySelector<HTMLElement>(`[data-id="${focus}"]`)?.focus({ preventScroll: true }));
  };
  render();
  subPanel(w, 'Garage', content, done);
}

/** Puts the saved kart setup on your kart. */
function apply(w: KartWorld): void {
  const k = w.save.d.kart;
  const paint = PAINTS.find((p) => p.id === k.paint)!.color;
  w.kart.setup(k.body, paint, CLASSES.battery);
  w.you.color = paint;
  w.save.save();
  kartSfx.horn('you');
}

function assists(w: KartWorld): void {
  const d = w.save.d;
  const content = h('div', { class: 'km-assists' });
  const rows: { key: keyof typeof d.assists; name: string; note: string }[] = [
    { key: 'autoGas', name: 'Auto gas', note: 'The kart drives forward by itself. Pull back to brake.' },
    { key: 'easyDrift', name: 'Easy drift', note: 'Hold a full turn at speed to slide. Straighten up for the boost.' },
    { key: 'steerAssist', name: 'Steer assist', note: 'Near the edge, the steering helps you back.' },
    { key: 'remote', name: 'Remote layout', note: 'For TV remotes: OK drifts and boosts, Up uses your item, Down brakes.' },
  ];
  const render = (focus?: string) => {
    content.replaceChildren(
      ...rows.map((r) => {
        const on = d.assists[r.key];
        const b = button(`${r.name}: ${on ? 'on' : 'off'}`, () => {
          d.assists[r.key] = !d.assists[r.key];
          w.kart.assists = { ...d.assists };
          w.save.save();
          render(r.key);
        }, on ? 'primary' : 'ghost');
        b.dataset.id = r.key;
        return h('div', { class: 'km-assist' }, b, h('div', { class: 'km-note' }, r.note));
      }),
      h('p', { class: 'km-note' }, 'Assists never make a kart faster, so assisted laps count on the boards.'),
    );
    if (focus && w.ctx.ui.device !== 'touch') requestAnimationFrame(() => content.querySelector<HTMLElement>(`[data-id="${focus}"]`)?.focus({ preventScroll: true }));
  };
  render();
  subPanel(w, 'Assists', content);
}

function help(w: KartWorld): void {
  const ui = w.ctx.ui;
  const remote = w.kart.assists.remote;
  const dev = remote ? 'remote' : ui.device;
  const map: Record<string, [string, string][]> = {
    kbm: [
      ['W or Up', 'Gas'],
      ['A D or Left Right', 'Steer'],
      ['S or Down', 'Brake, reverse'],
      ['Space or F while turning', 'Drift. Let go for a boost'],
      ['E or Enter', 'Use your item'],
      ['Space in the air', 'Trick'],
      ['Gas on the last red light', 'Rocket start'],
      ['Esc', 'Pause'],
    ],
    touch: [
      ['Stick', 'Steer (gas is automatic)'],
      ['Stick down', 'Brake'],
      ['Brake while turning', 'Drift. Let go for a boost'],
      ['Action', 'Use your item'],
      ['Brake in the air', 'Trick'],
      ['Stick up on the last light', 'Rocket start'],
    ],
    pad: [
      ['RT or stick up', 'Gas'],
      ['Left stick', 'Steer'],
      ['LT', 'Brake'],
      ['X or Y while turning', 'Drift. Let go for a boost'],
      ['A', 'Use your item'],
      ['X in the air', 'Trick'],
      ['B', 'Leave the race (asks first)'],
    ],
    remote: [
      ['Left Right', 'Steer (gas is automatic)'],
      ['Down', 'Brake'],
      ['OK while turning', 'Drift. OK again for the boost'],
      ['Up', 'Use your item'],
      ['OK in the air', 'Trick'],
      ['Up on the last light', 'Rocket start'],
      ['Back', 'Pause'],
    ],
  };
  const list = h('dl', { class: 'xk-rows km-help' }, ...(map[dev] ?? map.kbm).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
  const content = h(
    'div',
    {},
    list,
    h('h3', { class: 'km-h3' }, 'Racing'),
    h('p', { class: 'km-note' }, 'Drift sparks go white, blue, then orange: the longer the drift, the bigger the boost. Orange pads, slipstreams (tuck in behind a kart) and clean trick landings boost you too.'),
    h('h3', { class: 'km-h3' }, 'Fair play'),
    h('p', { class: 'km-note' }, 'On Windup and Battery, a computer driver far ahead of you eases off a little to keep races close. Rocket has no help. Items never target first place from far behind, and every hit is followed by a moment of safety.'),
    h('p', { class: 'km-note' }, 'Shared boards take time trial laps on Battery. The server checks every lap from its path.'),
  );
  subPanel(w, 'How to race', content);
}

export function openBoards(w: KartWorld, start?: HomeId): void {
  const ui = w.ctx.ui;
  let id: HomeId = start ?? w.c.id;
  const content = h('div', { class: 'km-boards' });
  const flip = (dir: number) => {
    const i = w.circuits.indexOf(id);
    id = w.circuits[(i + dir + w.circuits.length) % w.circuits.length];
    render('next');
  };
  const render = (focus?: string) => {
    const b = w.boards[id];
    const rows = b?.board ?? [];
    const prev = button('‹', () => flip(-1), 'ghost km-arrow');
    const next = button('›', () => flip(1), 'ghost km-arrow');
    next.dataset.id = 'next';
    const list = rows.length
      ? h(
          'ol',
          { class: 'km-board' },
          ...rows.map((r, i) =>
            h(
              'li',
              { class: r.you ? 'you' : '' },
              h('span', { class: 'km-bname' }, r.name),
              h('small', {}, BODIES[r.body]?.name ?? 'Classic'),
              h('b', {}, formatLap(r.value)),
              r.ghost
                ? button('Race ghost', () => {
                    if (!w.kart.ridden) return ui.toast('Get in your kart to race a ghost', 'info');
                    ui.closeAll();
                    void w.startSession({ kind: 'trial', circuit: id, cls: 'battery', items: false, ghostRank: i + 1 });
                  }, 'ghost km-ghostbtn')
                : null,
            ),
          ),
        )
      : h('p', { class: 'muted' }, 'No laps yet. Set the first one in Time trial!');
    content.replaceChildren(h('div', { class: 'km-carousel km-small' }, prev, h('div', { class: 'km-cname' }, CIRCUIT_NAME(w, id)), next), list, h('p', { class: 'km-note' }, b?.best ? `Your best on the board: ${formatLap(b.best)}` : 'Board laps come from Time trial.'));
    if (focus && ui.device !== 'touch') requestAnimationFrame(() => content.querySelector<HTMLElement>(`[data-id="${focus}"]`)?.focus({ preventScroll: true }));
  };
  render();
  const p = subPanel(w, 'Lap boards', content);
  p.onPrev = () => flip(-1);
  p.onNext = () => flip(1);
  void w.loadBoards().then(() => render());
}

export function openTrophies(w: KartWorld): void {
  const d = w.save.d;
  const cupRow = (c: ClassId) => {
    const p = d.cups[c];
    const txt = p === undefined ? 'Not raced yet' : p === 1 ? 'Gold trophy' : p === 2 ? 'Silver trophy' : p === 3 ? 'Bronze trophy' : 'Finished';
    return [h('dt', {}, `${CLASSES[c].name} cup`), h('dd', { class: p && p <= 3 ? 'best' : '' }, txt)];
  };
  const medalRow = (id: HomeId) => {
    const m = d.medals[id] ?? 0;
    const t = d.trialLap[id];
    return [h('dt', {}, CIRCUIT_NAME(w, id)), h('dd', { class: m ? 'best' : '' }, m ? `${MEDAL_NAMES[m]}, ${formatLap(t)}` : t ? formatLap(t) : 'No medal yet')];
  };
  const s = d.stats;
  const content = h(
    'div',
    {},
    h('dl', { class: 'xk-rows' }, ...CLASS_ORDER.flatMap(cupRow)),
    h('h3', { class: 'km-h3' }, 'Time trial medals'),
    h('dl', { class: 'xk-rows' }, ...w.circuits.flatMap(medalRow)),
    h('h3', { class: 'km-h3' }, 'Your stats'),
    h(
      'dl',
      { class: 'xk-rows' },
      ...([
        ['Races', s.races],
        ['Wins', s.wins],
        ['Podiums', s.podiums],
        ['Cups', s.cups],
        ['Mini-turbos', s.turbos],
        ['Items used', s.items],
        ['Hits landed', s.hits],
        ['Laps', s.laps],
        ['Distance', `${(s.metres / 1000).toFixed(1)} km`],
      ] as [string, number | string][]).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))]),
    ),
    h('p', { class: 'km-note' }, `Unlocked: ${d.bodies.length} of 3 karts, ${d.paints.length} of ${PAINTS.length} paints, ${d.flames.length} of ${FLAMES.length} flames, ${d.beaten.length} of 7 horns.`),
  );
  subPanel(w, 'Trophy cabinet', content);
}

export function openSketch(w: KartWorld): void {
  const src = (w.cs.paddock.sketch.material as { map?: { image?: HTMLCanvasElement } }).map?.image;
  const img = h('canvas', { class: 'km-sketch', width: 512, height: 376 });
  if (src) img.getContext('2d')!.drawImage(src, 0, 0);
  subPanel(w, 'Where it all began', h('div', {}, img, h('p', { class: 'km-note' }, `${w.ctx.ownerName} drew this track in the sketchbook. The Toybox Grand Prix grew from it.`)));
}

/** Results after a race or time trial. Resolves with the choice. */
export async function showResults(w: KartWorld, order: Racer[]): Promise<string> {
  const s = w.session!;
  const kind = s.opts.kind;
  const you = w.you;
  const place = you.place;
  const cup = s.cup;
  const time = you.finishedAt !== null ? formatLap(you.finishedAt * 1000) : '--';
  if (kind === 'trial') {
    const id = w.c.id;
    const med = w.save.d.medals[id] ?? 0;
    const best = s.bestLap;
    return w.hud.results({
      title: 'Time trial',
      subtitle: w.c.name,
      stars: med >= 3 ? 3 : med,
      rows: [
        { label: 'Best lap', value: formatLap(best), best: !!best && best <= (w.save.d.trialLap[id] ?? Infinity) },
        ...s.lapTimes.map((ms, i) => ({ label: `Lap ${i + 1}`, value: formatLap(ms) })),
        { label: 'Medal', value: med ? MEDAL_NAMES[med] : 'None yet' },
        ...(w.c.def ? [{ label: 'Next medal', value: med < 4 ? formatLap(w.c.def.medals[med]) : 'All won' }] : []),
      ],
      board: { title: 'Board', rows: (w.boards[id]?.board ?? []).slice(0, 5).map((r) => ({ name: r.name, value: formatLap(r.value), you: r.you })), empty: 'No laps yet' },
      buttons: [
        { id: 'again', label: 'Go again', primary: true },
        { id: 'leave', label: 'Done' },
      ],
    });
  }
  const pts = cup ? pointsFor(place) : null;
  const stars = place === 1 ? 3 : place <= 3 ? 2 : place <= 5 ? 1 : 0;
  const rows = [
    { label: 'Place', value: ordinal(place), best: place === 1 },
    { label: 'Time', value: time },
    { label: 'Best lap', value: formatLap(s.bestLap), best: !!s.bestLap && s.bestLap <= (w.save.d.bestLap[w.c.id] ?? Infinity) },
    ...(pts !== null ? [{ label: 'Points', value: `+${pts}` }] : []),
  ];
  const badges: string[] = [];
  if (s.rival) {
    const rv = order.find((r) => r.id === s.rival);
    if (rv && rv.place > place) badges.push(`Beat your rival ${rv.name}`);
  }
  if (you.hitsDealt) badges.push(`${you.hitsDealt} hit${you.hitsDealt > 1 ? 's' : ''} landed`);
  const last = cup ? cup.index + 1 >= cup.circuits.length : true;
  return w.hud.results({
    title: place === 1 ? 'You won!' : `You finished ${ordinal(place)}`,
    subtitle: cup ? `${w.c.name}, race ${cup.index + 1} of ${cup.circuits.length}` : `${w.c.name}. Time trial puts laps on the board.`,
    stars,
    badges,
    rows,
    board: {
      title: 'Finishing order',
      rows: order.map((r) => ({ name: r.you ? 'You' : r.name, value: r.finishedAt !== null ? formatLap(r.finishedAt * 1000) : gap(w, r), you: r.you })),
    },
    buttons: cup ? [{ id: 'next', label: last ? 'See the standings' : 'Next race', primary: true }, ...(last ? [] : [{ id: 'leave', label: 'Leave the cup' }])] : [{ id: 'again', label: 'Race again', primary: true }, { id: 'trial', label: 'Time trial' }, { id: 'leave', label: 'Done' }],
  });
}

/** A kart still racing: its expected gap to you, from how far it has left at its pace. */
function gap(w: KartWorld, r: Racer): string {
  const s = w.session;
  if (!s || w.you.finishedAt === null) return 'Racing';
  const left = s.laps * w.c.length - (r.raced - r.toLine);
  const est = s.t + Math.max(0, left) / Math.max(6, r.kart.speed);
  return `+${Math.max(0.1, est - w.you.finishedAt).toFixed(1)}s`;
}

export async function showStandings(w: KartWorld, cup: { index: number; circuits: HomeId[]; points: Record<string, number>; last: Record<string, number> }): Promise<void> {
  const rows = cupOrder(w.racers.map((r) => ({ id: r.id, points: cup.points[r.id] ?? 0, last: cup.last[r.id] ?? 9, r })));
  const done = cup.index + 1 >= cup.circuits.length;
  const next = done ? null : cup.circuits[cup.index + 1];
  await w.hud.results({
    title: done ? 'Final standings' : 'Cup standings',
    subtitle: next ? `Next: ${CIRCUIT_NAME(w, next)}` : `${CLASSES[w.session!.opts.cls].name} class`,
    board: { title: 'Points', rows: rows.map((x) => ({ name: x.r.you ? 'You' : x.r.name, value: String(x.points), you: x.r.you })) },
    buttons: [{ id: 'ok', label: next ? 'Next race' : 'Continue', primary: true }],
  });
}

export async function podiumCard(w: KartWorld, place: number, cls: ClassId, unlocks: string[]): Promise<void> {
  const trophy = place === 1 ? 'Gold trophy' : place === 2 ? 'Silver trophy' : place === 3 ? 'Bronze trophy' : null;
  await w.hud.results({
    title: trophy ?? `You finished ${ordinal(place)}`,
    subtitle: `Toybox Cup, ${CLASSES[cls].name} class`,
    stars: place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : 0,
    badges: unlocks.map((u) => `Unlocked: ${u}`),
    rows: trophy ? [{ label: 'In your cabinet', value: trophy, best: true }] : [{ label: 'Try again', value: 'Top three wins a trophy' }],
    buttons: [{ id: 'ok', label: 'Back to the paddock', primary: true }],
  });
}

export async function warmupDone(w: KartWorld): Promise<'cup' | 'free'> {
  const r = await w.hud.results({
    title: "You're ready!",
    subtitle: 'Boost pads, drifts and items: you have seen them all.',
    stars: 3,
    buttons: [
      { id: 'cup', label: 'Start the Toybox Cup', primary: true },
      { id: 'free', label: 'Free drive' },
    ],
  });
  return r === 'cup' ? 'cup' : 'free';
}

export function confirmLeave(w: KartWorld, title: string, body: string, ok = 'Yes', cancel = 'No'): Promise<boolean> {
  return confirmBox(w.ctx.ui, { title, body, ok, cancel });
}
