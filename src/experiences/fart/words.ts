// Comic lettering and speech bubbles pinned to points in the world. Every
// sound has one of these as its visual twin, so muted play loses nothing.

import * as THREE from 'three';
import { h } from '../../ui/ui';

interface Pinned {
  el: HTMLElement;
  at: THREE.Vector3;
  follow?: () => THREE.Vector3 | null;
  age: number;
  life: number;
  rise: number;
  kind: 'word' | 'bubble' | 'icon';
}

export class Words {
  readonly root: HTMLElement;
  private list: Pinned[] = [];
  private v = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.root = h('div', { class: 'puff-words' });
    parent.appendChild(this.root);
  }

  /** A comic word: "TOOT!", "PARP!", "KA-PARP!". */
  word(text: string, at: { x: number; y: number; z: number }, opts: { color?: string; size?: number; life?: number; tilt?: number; tiny?: boolean } = {}): void {
    const el = h('div', { class: `puff-word${opts.tiny ? ' tiny' : ''}` }, text);
    el.style.setProperty('--c', opts.color ?? '#8fd14f');
    el.style.setProperty('--s', String(opts.size ?? 1));
    el.style.setProperty('--r', `${opts.tilt ?? (Math.random() - 0.5) * 18}deg`);
    this.add({ el, at: new THREE.Vector3(at.x, at.y, at.z), age: 0, life: opts.life ?? 1.1, rise: 0.9, kind: 'word' });
  }

  /** A speech bubble over someone's head. */
  bubble(text: string, follow: () => THREE.Vector3 | null, opts: { life?: number; tone?: 'shout' | 'say' | 'think' } = {}): void {
    // One bubble per speaker: replace an older one following the same function.
    for (const p of this.list) if (p.follow === follow && p.kind === 'bubble') p.age = p.life;
    const el = h('div', { class: `puff-bubble ${opts.tone ?? 'say'}` }, text);
    const at = follow() ?? new THREE.Vector3();
    this.add({ el, at: at.clone(), follow, age: 0, life: opts.life ?? 1.8, rise: 0, kind: 'bubble' });
  }

  /** A small floating icon: "?", "!", stink lines. */
  icon(text: string, follow: () => THREE.Vector3 | null, opts: { life?: number; cls?: string } = {}): void {
    for (const p of this.list) if (p.follow === follow && p.kind === 'icon') p.age = p.life;
    const el = h('div', { class: `puff-icon ${opts.cls ?? ''}` }, text);
    const at = follow() ?? new THREE.Vector3();
    this.add({ el, at: at.clone(), follow, age: 0, life: opts.life ?? 1.2, rise: 0, kind: 'icon' });
  }

  private add(p: Pinned): void {
    this.root.appendChild(p.el);
    this.list.push(p);
    if (this.list.length > 40) {
      const old = this.list.shift()!;
      old.el.remove();
    }
  }

  update(dt: number, cam: THREE.Camera): void {
    if (!this.list.length) return;
    const w = innerWidth;
    const hh = innerHeight;
    this.list = this.list.filter((p) => {
      p.age += dt;
      if (p.age >= p.life) {
        p.el.remove();
        return false;
      }
      if (p.follow) {
        const f = p.follow();
        if (f) p.at.copy(f);
      }
      const t = p.age / p.life;
      this.v.copy(p.at);
      this.v.y += p.rise * (1 - (1 - t) * (1 - t));
      this.v.project(cam);
      const behind = this.v.z > 1 || Math.abs(this.v.x) > 1.3 || Math.abs(this.v.y) > 1.3;
      const appear = Math.min(1, p.age * 9);
      const pop = p.kind === 'word' ? 0.4 + appear * 0.75 - Math.max(0, appear - 0.85) * 0.6 : 0.6 + appear * 0.4;
      p.el.style.opacity = behind ? '0' : String(Math.min(1, (1 - t) * 3));
      p.el.style.transform = `translate(${((this.v.x + 1) / 2) * w}px, ${((1 - this.v.y) / 2) * hh}px) translate(-50%, -100%) scale(${pop})`;
      return true;
    });
  }

  clear(): void {
    for (const p of this.list) p.el.remove();
    this.list = [];
  }

  dispose(): void {
    this.clear();
    this.root.remove();
  }
}
