#!/usr/bin/env node
// Builds src/proof/dictionary-catalog.json: every Hunspell dictionary published as an npm package
// by the wooorm/dictionaries project (sourced from LibreOffice, Mozilla and the best maintained
// upstream word lists), with its version, license, file sizes, SHA-256 of index.aff and index.dic,
// npm's SHA-512 tarball integrity, and measured Hunspell (WebAssembly) load time and memory.
//
// The app downloads a dictionary only when the user asks for it (Review ▸ Spelling Dictionaries),
// from cdn.jsdelivr.net (files) or registry.npmjs.org (tarball), and verifies it against these hashes.
//
// Usage: node scripts/gen-dictionary-catalog.mjs [--no-timing]
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const timing = !process.argv.includes('--no-timing');
const BUNDLED = new Set(['en', 'en-gb', 'en-ca', 'en-au']);

const search = await (await fetch('https://registry.npmjs.org/-/v1/search?text=maintainer:wooorm%20dictionary&size=250')).json();
const names = search.objects.map((o) => o.package.name).filter((n) => /^dictionary-[a-z-]+$/.test(n)).sort();

/** npm package id -> BCP 47 tag used for the document language. */
function tagFor(id) {
  if (id === 'ca-valencia') return 'ca-ES-valencia';
  if (id === 'el-polyton') return 'el-polyton';
  if (id === 'sr-latn') return 'sr-Latn';
  if (id === 'tlh-latn') return 'tlh-Latn';
  if (id === 'pt') return 'pt-BR';
  const [l, r] = id.split('-');
  return r ? `${l}-${r.toUpperCase()}` : l;
}
const en = new Intl.DisplayNames(['en'], { type: 'language' });
function names2(id, tag) {
  const base = tag.replace('-polyton', '').replace('-valencia', '').replace('-ES', '');
  let name = en.of(base);
  if (id === 'el-polyton') name = 'Greek (Polytonic)';
  if (id === 'ca-valencia') name = 'Catalan (Valencian)';
  if (id === 'pt') name = 'Portuguese (Brazil)';
  if (id === 'hyw') name = 'Western Armenian';
  let native = '';
  try { native = new Intl.DisplayNames([base], { type: 'language' }).of(base) || ''; } catch { /* unknown locale */ }
  if (native.toLowerCase() === name.toLowerCase() || native === base) native = '';
  return { name, native };
}

/** Minimal tar reader: returns the bytes of package/<file>. */
function tarFile(tar, want) {
  for (let off = 0; off + 512 <= tar.length;) {
    const name = tar.subarray(off, off + 100).toString('utf8').replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(tar.subarray(off + 124, off + 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0', 8);
    const prefix = tar.subarray(off + 345, off + 500).toString('utf8').replace(/\0.*$/s, '');
    const full = prefix ? `${prefix}/${name}` : name;
    if (full === want) return tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${want} not in tarball`);
}

const tmp = mkdtempSync(join(tmpdir(), 'qf-dicts-'));
const out = [];
for (const pkgName of names) {
  const id = pkgName.slice('dictionary-'.length);
  const meta = await (await fetch(`https://registry.npmjs.org/${pkgName}/latest`)).json();
  const tgz = Buffer.from(await (await fetch(meta.dist.tarball)).arrayBuffer());
  const [algo, b64] = meta.dist.integrity.split('-');
  if (algo !== 'sha512' || createHash('sha512').update(tgz).digest('base64') !== b64) throw new Error(`${pkgName}: integrity mismatch`);
  const tar = gunzipSync(tgz);
  const aff = tarFile(tar, 'package/index.aff');
  const dic = tarFile(tar, 'package/index.dic');
  const tag = tagFor(id);
  const entry = {
    id, tag, ...names2(id, tag), pkg: pkgName, version: meta.version, license: meta.license || 'see package',
    aff: { size: aff.length, sha256: createHash('sha256').update(aff).digest('hex') },
    dic: { size: dic.length, sha256: createHash('sha256').update(dic).digest('hex') },
    tarball: meta.dist.tarball, integrity: meta.dist.integrity,
    ...(BUNDLED.has(id) ? { bundled: true } : {}),
  };
  if (timing) {
    // Load time and memory with Hunspell (WebAssembly), the engine the app uses for these, measured
    // in a fresh process each time (WebAssembly memory grows and is never returned).
    writeFileSync(join(tmp, 'a'), aff);
    writeFileSync(join(tmp, 'd'), dic);
    const r = execFileSync(process.execPath, ['-e', `
      const fs = require('fs'); const { loadModule } = require(${JSON.stringify(join(root, 'node_modules/hunspell-asm'))});
      loadModule().then((f) => { const before = process.memoryUsage().rss; const t = Date.now();
        const h = f.create(f.mountBuffer(fs.readFileSync(${JSON.stringify(join(tmp, 'a'))}), 'x.aff'), f.mountBuffer(fs.readFileSync(${JSON.stringify(join(tmp, 'd'))}), 'x.dic'));
        h.spell('test'); console.log(JSON.stringify({ ms: Date.now() - t, mb: Math.round((process.memoryUsage().rss - before) / 1e6) })); });`], { timeout: 180000, encoding: 'utf8' });
    const { ms, mb } = JSON.parse(r.trim().split('\n').pop());
    entry.loadSec = Math.round(ms / 100) / 10;
    entry.memoryMB = Math.max(1, mb);
  }
  out.push(entry);
  console.log(id, entry.version, entry.license, entry.loadSec ?? '', entry.memoryMB ?? '');
}
rmSync(tmp, { recursive: true, force: true });
const file = join(root, 'src/proof/dictionary-catalog.json');
const prev = (() => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } })();
writeFileSync(file, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: 'https://github.com/wooorm/dictionaries', dictionaries: out }, null, 1) + '\n');
console.log(`wrote ${out.length} dictionaries${prev ? ` (was ${prev.dictionaries.length})` : ''}`);
