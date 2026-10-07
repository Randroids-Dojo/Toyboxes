// Kart boards for the Toybox Grand Prix: the best time-trial lap per circuit.
// Every lap arrives with its ghost (the path, ten samples a second), and the
// server re-checks the lap from it before it goes on a board. Ghosts of the
// top ten stay so others can race them.
//
// Keys (under keyPrefix()):
//   lap:<roomId>:<areaId>                    the area's own track (room 1: Block Town), as before
//   kartlap:<roomId>:<areaId>:<circuit>      the other circuits, browser key -> best lap ms
//   kartbody:<roomId>:<areaId>:<circuit>:<bk>  {body} of that best lap
//   kartghost:<roomId>:<areaId>:<circuit>:<bk> its ghost, while it is in the top ten

import { EMPTY_CONTENT, publishedContent, type Area, type RoomContent } from '../src/shared/model.js';
import { areaCircuits, circuitLine, isCircuitId, type HomeId } from '../src/shared/kart/circuits.js';
import { lapProblem, type Ghost } from '../src/shared/kart/ghost.js';
import { BODIES, type BodyId } from '../src/shared/kart/rules.js';
import { cleanName } from '../src/shared/model.js';
import { browserKey } from './crypto.js';
import { ApiError, limit } from './http.js';
import { loadRoom } from './rooms.js';
import { getStore } from './store.js';

export const KART_BOARD_SIZE = 10;

export interface KartRow {
  name: string;
  value: number;
  you: boolean;
  body: BodyId;
  ghost: boolean;
}

type KartArea = Area & { experience: { kind: 'kart'; track: number[]; laps: number } };

async function kartArea(roomId: string, areaId: string): Promise<KartArea> {
  await loadRoom(roomId);
  const content = (await getStore().get<RoomContent>(`content:${roomId}`)) ?? EMPTY_CONTENT;
  const area = publishedContent(content).areas.find((a) => a.id === areaId);
  if (!area || area.experience?.kind !== 'kart') throw new ApiError(404, 'no_area', 'That track is closed');
  return area as KartArea;
}

/** The centre line of a circuit this area offers, or an error. */
function lineFor(area: KartArea, circuit: string): number[] {
  const offered = areaCircuits(area.experience.track);
  if (!offered.includes(circuit as HomeId)) throw new ApiError(400, 'bad_circuit', 'That circuit is not raced here');
  return circuit === offered[0] ? area.experience.track : circuitLine(circuit as Parameters<typeof circuitLine>[0]);
}

/** The area's own track keeps the board it always had. */
function boardKey(area: KartArea, roomId: string, areaId: string, circuit: string): string {
  return circuit === areaCircuits(area.experience.track)[0] ? `lap:${roomId}:${areaId}` : `kartlap:${roomId}:${areaId}:${circuit}`;
}

export async function recordKartLap(roomId: string, areaId: string, browserId: string, name: string, circuit: string, body: string, ms: number, posted: unknown) {
  const ghost = posted as Ghost;
  const area = await kartArea(roomId, areaId);
  const key = browserKey(browserId);
  await limit(`lap:${key}`, 40, 60, 'Too many laps at once');
  if (!(body in BODIES)) throw new ApiError(400, 'bad_body', 'That kart does not exist');
  const flat = lineFor(area, circuit);
  if (ghost?.c !== circuit) throw new ApiError(400, 'bad_lap', 'That lap was on another circuit');
  const problem = lapProblem(flat, ghost, ms);
  if (problem) throw new ApiError(400, 'bad_lap', problem);
  const store = getStore();
  const z = boardKey(area, roomId, areaId, circuit);
  const before = await store.zscore(z, key);
  const improved = before === null || ms < before;
  const tag = `${roomId}:${areaId}:${circuit}`;
  if (improved) {
    const top = await store.zrange(z, 0, KART_BOARD_SIZE - 1);
    await store.zadd(z, ms, key);
    await store.set(`kartbody:${tag}:${key}`, { body });
    const now = await store.zrange(z, 0, KART_BOARD_SIZE - 1);
    if (now.includes(key)) await store.set(`kartghost:${tag}:${key}`, ghost);
    // Whoever fell out of the top ten no longer needs a ghost kept.
    const out = top.filter((k) => !now.includes(k));
    if (out.length) await store.del(...out.map((k) => `kartghost:${tag}:${k}`));
  }
  const name2 = cleanName(name) ?? 'Player';
  await store.set(`scorename:${key}`, name2);
  const top = await store.zrange(z, 0, KART_BOARD_SIZE - 1);
  const rank = top.indexOf(key);
  return { best: improved ? ms : before!, improved, rank: rank >= 0 ? rank + 1 : null };
}

/** Every circuit's board for an area, with this browser's bests. */
export async function kartBoards(roomId: string, areaId: string, browserId: string | undefined) {
  const area = await kartArea(roomId, areaId);
  const store = getStore();
  const me = browserId ? browserKey(browserId) : '';
  const boards: Record<string, { board: KartRow[]; best: number | null }> = {};
  for (const circuit of areaCircuits(area.experience.track)) {
    const z = boardKey(area, roomId, areaId, circuit);
    const ids = await store.zrange(z, 0, KART_BOARD_SIZE - 1);
    const tag = `${roomId}:${areaId}:${circuit}`;
    const [names, bodies] = await Promise.all([store.mget<string>(ids.map((id) => `scorename:${id}`)), store.mget<{ body: BodyId }>(ids.map((id) => `kartbody:${tag}:${id}`))]);
    const values = await Promise.all(ids.map((id) => store.zscore(z, id)));
    // Ghosts are only kept for the top ten, so a body record marks one (older laps have neither).
    boards[circuit] = {
      board: ids.map((id, i) => ({ name: names[i] ?? 'Player', value: values[i] ?? 0, you: id === me, body: bodies[i]?.body ?? 'classic', ghost: !!bodies[i] })),
      best: me ? await store.zscore(z, me) : null,
    };
  }
  return { kind: 'kart2' as const, circuits: areaCircuits(area.experience.track), boards };
}

/** The ghost of a board place, by rank only (no browser keys leave the server). */
export async function kartGhost(roomId: string, areaId: string, circuit: string, rank: number) {
  const area = await kartArea(roomId, areaId);
  lineFor(area, circuit);
  if (!Number.isInteger(rank) || rank < 1 || rank > KART_BOARD_SIZE) throw new ApiError(400, 'bad_rank', 'Pick a place on the board');
  const store = getStore();
  const z = boardKey(area, roomId, areaId, circuit);
  const ids = await store.zrange(z, rank - 1, rank - 1);
  const ghost = ids[0] ? await store.get<Ghost>(`kartghost:${roomId}:${areaId}:${circuit}:${ids[0]}`) : null;
  if (!ghost) throw new ApiError(404, 'no_ghost', 'No ghost for that place yet');
  const name = (await store.get<string>(`scorename:${ids[0]}`)) ?? 'Player';
  return { ghost, name };
}

/** Every kart board key of an area, for the creator's "clear scores" tool. */
export async function kartKeys(roomId: string, areaId: string): Promise<string[]> {
  const store = getStore();
  const keys: string[] = [];
  for (const circuit of ['blocktown', 'picnic', 'cove', 'bedroom', 'sketch']) {
    const tag = `${roomId}:${areaId}:${circuit}`;
    const z = `kartlap:${tag}`;
    const ids = [...(await store.zrange(z, 0, -1)), ...(await store.zrange(`lap:${roomId}:${areaId}`, 0, -1))];
    keys.push(z, ...ids.flatMap((id) => [`kartbody:${tag}:${id}`, `kartghost:${tag}:${id}`]));
  }
  return keys;
}

export { isCircuitId };
