// Picnic Panic: Mr. Sprout wants his prize lawn back. Clear twelve
// picnickers in 90 seconds with cabbage clouds, reading the wind (the
// weathercock, the streaming leaves and the arrow all show it, and it
// wobbles before it turns). Crop-dust the parasol family from above.

import * as THREE from 'three';
import { music } from '../../../audio/music';
import { h } from '../../../ui/ui';
import { formatLap } from '../../common';
import type { PlayerState, SpaceAction, CaptureLabels } from '../../../world/space';
import { SPOTS } from '../layout';
import { extra, Person, type PersonSpec } from '../people';
import { Picnic, type PicnicEvent } from '../sim/picnic';
import { rng } from '../sim/rng';
import { PICNIC_WALTZ } from '../songs';
import { fx, voices } from '../toots';
import type { Figures } from '../figures';
import type { Trial, TrialWorld } from './trial';

interface Cast {
  people: Person[];
  whiffs: number[];
  parasol: number;
}

const casts = new WeakMap<Figures, Cast>();

export class PicnicPanic implements Trial {
  readonly id = 'picnic' as const;
  private phase: 'intro' | 'count' | 'run' | 'done' = 'intro';
  private sim: Picnic;
  private cast: Cast;
  private ticket: Promise<string | null>;
  private windEl: HTMLElement;
  private windSvg: SVGElement;
  private windText: HTMLElement;
  private m = new THREE.Matrix4();
  private short: boolean;

  constructor(
    private w: TrialWorld,
    opts: Record<string, unknown>,
  ) {
    this.short = !!opts.short;
    this.sim = new Picnic(rng((opts.seed as number) ?? (Date.now() & 0xffff)), { short: this.short });
    let cast = casts.get(w.figures);
    if (!cast) {
      const r = rng(55);
      const people: Person[] = [];
      const whiffs: number[] = [];
      for (let i = 0; i < 12; i++) {
        const spec: PersonSpec = i === 4 ? { ...extra(`pp${i}`, r), name: 'Grandad', hat: 'cap', extras: ['peg'], height: 1.95, voice: 120 } : { ...extra(`pp${i}`, r), held: i % 3 === 0 ? 'basket' : null };
        people.push(new Person(w.figures, spec, 0, 0, 0));
        whiffs.push(w.figures.add('whiff', 0xb7e36a, { outline: false }));
      }
      cast = { people, whiffs, parasol: w.figures.add('parasol', 0xffffff) };
      casts.set(w.figures, cast);
    }
    this.cast = cast;
    w.vil.showPicnickers(false);
    w.clouds.clear();
    // Start by the stall with a full tank of cabbage.
    w.ctx.teleport(SPOTS.picnic.x, SPOTS.picnic.z + 0.4, -Math.PI / 2);
    w.mover.tank.eat('cabbage');
    w.mover.reset();
    w.ph.trial(true);
    w.hud.strip([
      { id: 'left', label: 'Picnickers', value: String(this.sim.people.length) },
      { id: 'time', label: 'Time', value: formatLap(this.sim.limit * 1000), wide: true },
    ]);
    w.hud.objective('Stink everyone off the lawn');
    // Wind arrow.
    this.windEl = h('div', { class: 'pf-wind' });
    this.windEl.innerHTML = '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" fill="none" stroke="rgba(43,29,58,0.25)" stroke-width="2"/><path d="M22 6 L32 24 L24 21 L24 38 L20 38 L20 21 L12 24 Z" fill="#9b7bd6" stroke="#2b1d3a" stroke-width="2.5" stroke-linejoin="round"/></svg>';
    this.windText = h('small', {}, 'Wind');
    this.windEl.append(this.windText);
    this.windSvg = this.windEl.querySelector('svg')!;
    w.ph.root.appendChild(this.windEl);
    this.ticket = this.short ? Promise.resolve(null) : w.boards.ticket('picnic');
    music.play(PICNIC_WALTZ, { fadeIn: 0.8 });
    music.filter(20000, 0.2);
    w.words.bubble("They're sitting on my prize lawn!", () => w.vil.head('sprout'), { life: 3, tone: 'shout' });
    void this.intro().then(() => {
      this.phase = 'count';
      return w.hud.countdown(3, { go: 'PEE-YEW!' });
    }).then(() => {
      if (this.phase === 'count') this.phase = 'run';
    });
    this.pose(0, 0);
  }

  get tooting(): boolean {
    return this.phase === 'run';
  }

  private async intro(): Promise<void> {
    await this.w.hud.intro({
      key: 'fart-picnic',
      title: 'Picnic Panic',
      tagline: 'Twelve picnickers on the prize lawn. Pee-yew them all away!',
      tips: [
        { keys: ['kick'], touch: 'Toot', text: 'Cabbage clouds drift on the wind. Toot upwind of them.' },
        { keys: ['move'], text: 'Watch the wind arrow: it wobbles before it turns.' },
        { keys: ['jump'], touch: 'Boost', text: 'Hover over the parasol family to drop stink from above.' },
      ],
      button: 'Pee-yew!',
    });
  }

  holdsTime(): boolean {
    return this.phase !== 'done';
  }

  captureInput(): CaptureLabels | null {
    return this.phase === 'count' || this.phase === 'intro' ? { action: null, kick: null, jump: null, prompt: 'Get ready...' } : null;
  }

  actions(): SpaceAction[] {
    if (this.phase !== 'run') return [];
    return [{ ...SPOTS.cabbage, label: 'Eat cabbage', short: 'Eat', run: () => {
      this.w.mover.tank.eat('cabbage');
      fx.nom();
      this.w.words.bubble('More cabbage? Go on then!', () => this.w.vil.head('sprout'));
    } }];
  }

  step(hs: number, _p: PlayerState): void {
    if (this.phase !== 'run') return;
    this.w.clouds.wind = this.sim.wind;
    this.sim.step(hs, this.w.clouds.list);
    for (const e of this.sim.takeEvents()) this.onEvent(e);
    this.w.hud.set('time', formatLap(Math.max(0, this.sim.limit - this.sim.time) * 1000), { bump: false });
    this.w.hud.set('left', String(this.sim.left));
  }

  private onEvent(e: PicnicEvent): void {
    const w = this.w;
    switch (e.kind) {
      case 'cleared': {
        const i = this.sim.people.findIndex((p) => p.id === e.id);
        const person = this.cast.people[i];
        const pp = this.sim.people[i];
        voices.peeyew(person?.spec.voice ?? 220);
        w.words.bubble('Pee-yew!', () => (person ? new THREE.Vector3(person.p.x, person.top + 0.1, person.p.z) : null), { tone: 'shout', life: 1.6 });
        w.hud.judge(`${this.sim.left} left`, '#9b7bd6');
        w.sparks.burst({ at: { x: pp.x, y: 1.6, z: pp.z }, count: 14, speed: [1, 3], color: [0xb7e36a, 0x9b7bd6], size: [0.08, 0.14], life: [0.4, 0.8], drag: 2 });
        fx.whoosh();
        break;
      }
      case 'whiff': {
        const i = this.sim.people.findIndex((p) => p.id === e.id);
        const person = this.cast.people[i];
        voices.sniff();
        w.words.icon('?', () => (person ? new THREE.Vector3(person.p.x, person.top + 0.2, person.p.z) : null), { life: 1.2 });
        break;
      }
      case 'windWarn':
        this.windEl.classList.add('wobble');
        fx.whoosh();
        break;
      case 'wind':
        this.windEl.classList.remove('wobble');
        w.ctx.ui.toast('The wind has changed!', 'info', 1600);
        break;
      case 'end':
        void this.finish(e.done);
        break;
    }
  }

  private async finish(done: boolean): Promise<void> {
    if (this.phase === 'done') return;
    this.phase = 'done';
    const w = this.w;
    const ms = Math.round((this.sim.clearedAt ?? this.sim.limit) * 1000);
    const beans = this.sim.beans();
    w.clouds.wind = { x: 0.35, z: 0.1 };
    music.duck(0.3, 2);
    if (done) {
      fx.fanfare();
      w.hud.banner('Lawn cleared!', { sub: formatLap(ms), size: 'xl', ms: 1800 });
      w.words.bubble('My prize lawn! Thank you!', () => w.vil.head('sprout'), { tone: 'shout', life: 3 });
      const p = w.player();
      if (p) w.confetti.burst({ at: { x: p.x, y: p.y + 3, z: p.z }, count: 120, shape: 'up', speed: [3, 7], color: [0xb7e36a, 0x9b7bd6], size: [0.1, 0.18], life: [1.6, 2.6], gravity: 5, drag: 1.2, sizeEnd: 1 });
    } else {
      fx.sadTrombone();
      w.hud.banner('Time up!', { sub: `${this.sim.left} still picnicking`, size: 'l' });
    }
    const full = !this.short;
    const res = w.trialBeans('picnic', full ? beans : 0, done && full ? ms : null, 'lower');
    const ticket = await this.ticket;
    const posted = done && full ? await w.boards.post('picnic', ms, ticket) : null;
    await new Promise((r) => setTimeout(r, 2100));
    const choice = await w.hud.results({
      title: done ? 'Lawn cleared!' : 'Time up',
      subtitle: done ? `${this.sim.people.length} picnickers in ${formatLap(ms)}` : `${this.sim.people.length - this.sim.left} of ${this.sim.people.length} cleared`,
      stars: beans,
      rows: [
        { label: 'Time', value: done ? formatLap(ms) : '--', best: res.newBest },
        { label: 'Your best', value: formatLap(w.save.trials.picnic.best) },
        { label: 'Golden beans', value: `${w.save.trials.picnic.beans} of 3` },
      ],
      badges: [...(res.newBest ? ['New best!'] : []), ...(res.newBeans ? [`+${res.newBeans} golden bean${res.newBeans > 1 ? 's' : ''}`] : []), ...(posted?.rank ? [`Number ${posted.rank} on the board`] : [])],
      board: { title: posted?.error ? `Fastest picnic (${posted.error})` : 'Fastest picnic', rows: posted?.rows ?? w.boards.rows('picnic') },
      buttons: [
        { id: 'again', label: 'Play again', primary: true },
        { id: 'next', label: 'Next: Rocket Rings' },
        { id: 'leave', label: 'Back to the fete' },
      ],
    });
    w.endTrial(choice === 'again' ? 'again' : choice === 'next' ? 'rings' : undefined);
  }

  /** Poses the picnickers, their whiff bubbles and the parasol. */
  private pose(dt: number, t: number): void {
    const f = this.w.figures;
    this.sim.people.forEach((s, i) => {
      const p = this.cast.people[i];
      const pp = p.p;
      pp.visible = s.state !== 'gone';
      pp.x = s.x;
      pp.z = s.z;
      pp.yaw = s.yaw;
      pp.floorSit = s.state === 'sit';
      pp.sit = s.state === 'sit' ? 1 : 0;
      pp.stride = s.state === 'flee' ? 1.2 : 0;
      pp.walk += dt * 12;
      pp.lean = s.state === 'flee' ? 0.25 : 0;
      const k = s.whiff / s.need;
      pp.face = s.state === 'sit' ? (k > 0.6 ? 'peeyew' : k > 0.2 ? 'suspicious' : 'happy') : 'peeyew';
      pp.armR = s.state === 'sit' ? { x: k > 0.4 ? 1.9 : 0.6, z: k > 0.4 ? 0.2 + Math.sin(t * 14) * 0.3 : 0.3 } : { x: 0.6, z: 0.3 };
      pp.armL = s.state === 'pack' ? { x: 1.2, z: 0.2 } : s.state === 'flee' ? { x: 0.3, z: 1.4 } : { x: 0.5, z: 0.35 };
      pp.headRoll = s.state === 'sit' ? Math.sin(t * 0.8 + i) * 0.08 : 0;
      p.update();
      // The whiff bubble fills and turns from green to purple.
      const wid = this.cast.whiffs[i];
      const show = s.state === 'sit' && s.whiff > 0.02;
      f.show(wid, show);
      if (show) {
        const sc = 0.12 + k * 0.16;
        this.m.compose(new THREE.Vector3(s.x, p.top + 0.35 + Math.sin(t * 3 + i) * 0.04, s.z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc));
        f.set(wid, this.m);
        f.color(wid, k > 0.66 ? 0x9b7bd6 : k > 0.33 ? 0xc3d36a : 0xb7e36a);
      }
    });
    // The parasol over the family on blanket 3.
    const fam = this.sim.people.find((p) => p.shade);
    f.show(this.cast.parasol, !!fam);
    if (fam) {
      this.m.compose(new THREE.Vector3(fam.x + 0.7, 0, fam.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.35)), new THREE.Vector3(1, 1, 1));
      f.set(this.cast.parasol, this.m);
    }
  }

  update(dt: number, t: number): void {
    this.pose(dt, t);
    // Wind: the arrow points the way it blows, relative to your view.
    const wnd = this.sim.wind;
    const ang = Math.atan2(wnd.x, wnd.z) - this.w.ctx.cameraYaw();
    this.windSvg.style.transform = `rotate(${-ang * (180 / Math.PI) + 180}deg)`;
    this.windText.textContent = this.sim.wobbling ? 'Turning...' : `Turns in ${Math.ceil(this.sim.windIn)}`;
    this.w.village.weathercock.rotation.y = Math.atan2(wnd.x, wnd.z) - Math.PI / 2;
    // Leaves streaming on the wind round the park.
    const p = this.w.player();
    if (p && this.phase === 'run' && Math.random() < dt * 14) {
      this.w.dust.burst({ at: { x: p.x - wnd.x * 6 + (Math.random() - 0.5) * 10, y: 0.5 + Math.random() * 2.5, z: p.z - wnd.z * 6 + (Math.random() - 0.5) * 10 }, count: 1, speed: [0.2, 0.5], inherit: { x: wnd.x * 2.2, y: 0.1, z: wnd.z * 2.2 }, color: [0x8fcf5a, 0xd9a03f], size: [0.08, 0.14], sizeEnd: 1, life: [2.5, 3.5], alpha: 0.9 });
    }
  }

  dispose(): void {
    for (const p of this.cast.people) {
      p.p.visible = false;
      p.update();
    }
    for (const id of this.cast.whiffs) this.w.figures.show(id, false);
    this.w.figures.show(this.cast.parasol, false);
    this.w.vil.showPicnickers(true);
    this.windEl.remove();
    this.w.clouds.wind = { x: 0.35, z: 0.1 };
    this.w.hud.strip([]);
    this.w.hud.objective(null);
  }

  debug(): Record<string, unknown> {
    const s = this.sim;
    return {
      phase: this.phase,
      time: +s.time.toFixed(2),
      left: s.left,
      wind: s.wind,
      windIn: +s.windIn.toFixed(2),
      people: s.people.map((p) => ({ id: p.id, x: +p.x.toFixed(2), z: p.z, whiff: +p.whiff.toFixed(2), need: p.need, state: p.state, shade: !!p.shade })),
      clearedAt: s.clearedAt,
    };
  }

  /** Playtests: a cabbage cloud on every blanket. */
  debugStinkAll(): void {
    const wd = this.sim.wind;
    for (const p of this.sim.people) if (p.state === 'sit') this.w.clouds.add('cabbage', p.x - wd.x * 0.8, p.shade ? 2.4 : 1.1, p.z - wd.z * 0.8, { big: 0.9, vx: 0, vz: 0 });
  }

  /** Playtests: run the sim forward with the current clouds. */
  debugFastForward(seconds: number): void {
    const step = 1 / 30;
    for (let k = 0; k < seconds / step && !this.sim.ended; k++) {
      this.w.clouds.wind = this.sim.wind;
      this.w.clouds.step(step);
      this.sim.step(step, this.w.clouds.list);
      for (const e of this.sim.takeEvents()) this.onEvent(e);
    }
  }
}
