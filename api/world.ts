// GET /api/world -> who holds each entrance, for drawing the town.

import { route } from '../server/http.js';
import { world } from '../server/rooms.js';

export default route({
  GET: async () => ({ slots: await world(), now: Date.now() }),
});
