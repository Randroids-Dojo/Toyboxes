// Progress kept on this device for one world: stars, unlocks, settings,
// personal bests before the server has them. Shared boards go through
// api.score (src/shared/score-modes.ts); this is the player's own save.
//
//   const save = new Progress('neon', ctx.roomId, ctx.area.id, { stars: {} as Record<string, number>, outfit: 'classic' });
//   save.data.stars.tag = 3;
//   save.save();

export class Progress<T extends object> {
  readonly data: T;
  private readonly key: string;

  constructor(kind: string, roomId: string, areaId: string, defaults: T, version = 1) {
    this.key = `toyboxes.progress.${kind}.${roomId}.${areaId}.v${version}`;
    let saved: Partial<T> = {};
    try {
      saved = JSON.parse(localStorage.getItem(this.key) ?? '{}') as Partial<T>;
    } catch {
      saved = {};
    }
    this.data = { ...structuredClone(defaults), ...saved };
  }

  save(): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch {
      // Storage full or private mode: progress lasts for this visit.
    }
  }

  update(f: (d: T) => void): void {
    f(this.data);
    this.save();
  }

  /** Forget everything, e.g. from a "Reset progress" option. */
  reset(defaults: T): void {
    for (const k of Object.keys(this.data)) delete (this.data as Record<string, unknown>)[k];
    Object.assign(this.data, structuredClone(defaults));
    this.save();
  }
}
