// Load emitted API modules with plain Node ESM. Vite and tsx can resolve
// extensionless imports that Vercel's deployed functions cannot.
// No request handler runs, so this check never reads or writes live data.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const entries = readdirSync(join(repo, 'api')).filter(name => name.endsWith('.ts')).sort();
if (!entries.length) throw new Error('No API entries found');
const configFile = ts.readConfigFile(join(repo, 'tsconfig.json'), ts.sys.readFile);
if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repo);
const out = mkdtempSync(join(tmpdir(), 'toyboxes-api-esm-'));
const format = (diagnostics: readonly ts.Diagnostic[]) => ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: file => file,
  getCurrentDirectory: () => repo,
  getNewLine: () => '\n',
});
try {
  const program = ts.createProgram(entries.map(name => join(repo, 'api', name)), {
    ...config.options, noEmit: false, noEmitOnError: true, rootDir: repo, outDir: out,
    declaration: false, sourceMap: false, incremental: false,
  });
  const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
  if (diagnostics.length) throw new Error(format(diagnostics));
  const emitted = program.emit();
  if (emitted.emitSkipped || emitted.diagnostics.length) throw new Error(format(emitted.diagnostics) || 'API emit failed');
  writeFileSync(join(out, 'package.json'), JSON.stringify({ type: 'module' }));
  symlinkSync(join(repo, 'node_modules'), join(out, 'node_modules'));
  const env = { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' };
  for (const name of entries) {
    const url = pathToFileURL(join(out, 'api', name.replace(/\.ts$/, '.js'))).href;
    const source = `const m = await import(${JSON.stringify(url)}); if (typeof m.default !== 'function') throw new Error('API default export is not a handler');`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], { env, encoding: 'utf8', timeout: 15000 });
    if (child.error || child.status !== 0) throw new Error(`Native ESM failed for api/${name}: ${child.error?.message ?? child.stderr.trim()}`);
    console.log(`Native ESM loaded api/${name}`);
  }
  console.log(`Native ESM passed for ${entries.length} API entries without invoking handlers`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
