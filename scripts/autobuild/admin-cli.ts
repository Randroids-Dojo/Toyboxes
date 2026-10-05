// Small admin actions for the autobuild runbook.
//
//   npx tsx scripts/autobuild/admin-cli.ts status <roomId> <pageId> requested|building|available
//   npx tsx scripts/autobuild/admin-cli.ts note <roomId> <pageId> "<text>"
//   npx tsx scripts/autobuild/admin-cli.ts seen <roomId> <pageId>
//   npx tsx scripts/autobuild/admin-cli.ts content-get <roomId> [file]
//   npx tsx scripts/autobuild/admin-cli.ts content-put <roomId> <file>   (content JSON with the current rev)

import { readFileSync, writeFileSync } from 'node:fs';
import { admin } from './client';

const [cmd, roomId, a, b] = process.argv.slice(2);
switch (cmd) {
  case 'status':
    await admin('POST', '', { action: 'pageStatus', roomId, pageId: a, status: b });
    console.log(`page ${a} is ${b}`);
    break;
  case 'note':
    await admin('POST', '', { action: 'pageNote', roomId, pageId: a, note: b ?? '' });
    console.log('note saved');
    break;
  case 'seen':
    await admin('POST', '', { action: 'markSeen', roomId, pageId: a });
    console.log('marked seen');
    break;
  case 'content-get': {
    const d = await admin('GET', `?view=room&id=${encodeURIComponent(roomId)}`);
    const json = JSON.stringify(d.content, null, 2);
    if (a) writeFileSync(a, json);
    else console.log(json);
    break;
  }
  case 'content-put': {
    const content = JSON.parse(readFileSync(a, 'utf8'));
    const r = await admin('POST', '', { action: 'saveContent', roomId, content });
    console.log(`published content rev ${r.content.rev}: ${r.content.areas.map((x: { name: string; published: boolean }) => `${x.name}${x.published ? '' : ' (draft)'}`).join(', ')}`);
    break;
  }
  default:
    console.log('usage: status|note|seen|content-get|content-put');
    process.exit(1);
}
