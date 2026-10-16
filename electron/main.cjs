// QuillForge desktop app (Windows, macOS, Linux, Raspberry Pi OS): Electron main process.
//
// The web build (dist/) is served from the privileged app:// scheme so module workers, fetch and
// IndexedDB behave as on the web. The renderer is sandboxed with context isolation and no Node;
// electron/preload.cjs exposes `window.quillDesktop`, the same interface as the Android plugin.
// File access is limited to files the user opened or saved through a dialog, or opened the app
// with, so document content cannot use the bridge to read or overwrite arbitrary files.
'use strict';
const { app, BrowserWindow, protocol, net, ipcMain, dialog, shell, clipboard, safeStorage, powerSaveBlocker, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { pathToFileURL, fileURLToPath } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');
const SCHEME = 'app';
const ORIGIN = `${SCHEME}://quillforge`;
const OPENABLE = ['docx', 'docm', 'dotx', 'dotm', 'doc', 'dot', 'wbk', 'asd', 'odt', 'ott', 'fodt', 'rtf', 'html', 'htm', 'md', 'markdown', 'txt', 'epub', 'qfd', 'qfde', 'json'];

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

/** @type {BrowserWindow | null} */
let win = null;
let pendingLaunch = null; // file opened before the window was ready
let wakeId = -1;

// ------------------------------------------------------------------------------------------
// Files the renderer may read and write

const grantsFile = () => path.join(app.getPath('userData'), 'granted-files.json');
let grants = new Set();
function loadGrants() {
  try { grants = new Set(JSON.parse(fs.readFileSync(grantsFile(), 'utf8'))); } catch { grants = new Set(); }
}
function grant(p) {
  grants.add(path.resolve(p));
  // Keep the most recent 200 (enough for the recent-files list).
  const list = [...grants].slice(-200);
  grants = new Set(list);
  try { fs.writeFileSync(grantsFile(), JSON.stringify(list)); } catch { /* read-only profile */ }
}
function grantedPath(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('file:')) throw new Error('Not a file address');
  const p = path.resolve(fileURLToPath(uri));
  if (!grants.has(p)) throw new Error('QuillForge has no permission for this file; open it again.');
  return p;
}
const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text', rtf: 'application/rtf', html: 'text/html', htm: 'text/html', md: 'text/markdown', txt: 'text/plain', epub: 'application/epub+zip', doc: 'application/msword', json: 'application/json' };
function fileResult(p) {
  const data = fs.readFileSync(p);
  const ext = path.extname(p).slice(1).toLowerCase();
  return { uri: pathToFileURL(p).href, name: path.basename(p), mime: MIME[ext] || 'application/octet-stream', data: data.toString('base64') };
}
function fileFromArgs(argv) {
  for (const a of argv.slice(1)) {
    if (!a || a.startsWith('-')) continue;
    const ext = path.extname(a).slice(1).toLowerCase();
    if (OPENABLE.includes(ext) && fs.existsSync(a)) return path.resolve(a);
  }
  return null;
}
function openExternalFile(p) {
  grant(p);
  if (win && !win.webContents.isLoading()) win.webContents.send('qf:fileOpened', fileResult(p));
  else pendingLaunch = p;
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
}

// ------------------------------------------------------------------------------------------
// Secure storage (API keys): encrypted with the OS keychain / DPAPI / libsecret via safeStorage

const secureFile = () => path.join(app.getPath('userData'), 'secure.json');
function readSecure() { try { return JSON.parse(fs.readFileSync(secureFile(), 'utf8')); } catch { return {}; } }
function writeSecure(o) { fs.writeFileSync(secureFile(), JSON.stringify(o), { mode: 0o600 }); }
function seal(v) {
  return safeStorage.isEncryptionAvailable() ? { enc: true, v: safeStorage.encryptString(v).toString('base64') } : { enc: false, v };
}
function unseal(rec) {
  if (!rec) return null;
  return rec.enc ? safeStorage.decryptString(Buffer.from(rec.v, 'base64')) : rec.v;
}

// ------------------------------------------------------------------------------------------
// OAuth loopback (OpenRouter PKCE), as on Android: one-shot listener on 127.0.0.1 only

let loop = null;
function stopLoop() { if (loop) { clearTimeout(loop.timer); try { loop.server.close(); } catch { /* */ } loop = null; } }

// ------------------------------------------------------------------------------------------
// IPC

const safeUrl = (u) => typeof u === 'string' && /^(https?|mailto|tel|ftp|sms|geo):/i.test(u.trim());
function handle(name, fn) {
  ipcMain.handle('qf:' + name, async (e, opts) => {
    if (!win || e.sender !== win.webContents || !e.senderFrame || !e.senderFrame.url.startsWith(ORIGIN)) throw new Error('Refused');
    return fn(opts || {});
  });
}

function registerIpc() {
  handle('openDocument', async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: OPENABLE }, { name: 'All files', extensions: ['*'] }],
    });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    grant(r.filePaths[0]);
    return fileResult(r.filePaths[0]);
  });
  handle('saveAs', async ({ name, data }) => {
    const ext = path.extname(String(name || '')).slice(1);
    const r = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath('documents'), path.basename(String(name || 'document'))),
      filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }, { name: 'All files', extensions: ['*'] }] : undefined,
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    fs.writeFileSync(r.filePath, Buffer.from(String(data || ''), 'base64'));
    grant(r.filePath);
    return { uri: pathToFileURL(r.filePath).href, name: path.basename(r.filePath) };
  });
  handle('writeUri', async ({ uri, data }) => {
    const p = grantedPath(uri);
    // Write a temporary file first, so a failed write never truncates the document.
    const tmp = p + '.qf-saving';
    fs.writeFileSync(tmp, Buffer.from(String(data || ''), 'base64'));
    fs.renameSync(tmp, p);
    return { ok: true };
  });
  handle('readUri', async ({ uri }) => fileResult(grantedPath(uri)));
  handle('print', async () => new Promise((res) => win.webContents.print({}, () => res())));
  handle('share', async ({ name, data }) => {
    // Desktops have no share sheet: offer Save As.
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), path.basename(String(name || 'document'))) });
    if (!r.canceled && r.filePath) { fs.writeFileSync(r.filePath, Buffer.from(String(data || ''), 'base64')); grant(r.filePath); }
  });
  handle('getLaunchFile', async () => {
    const p = pendingLaunch;
    pendingLaunch = null;
    return p ? fileResult(p) : {};
  });
  handle('keepAwake', async ({ on }) => {
    if (on && wakeId < 0) wakeId = powerSaveBlocker.start('prevent-display-sleep');
    if (!on && wakeId >= 0) { powerSaveBlocker.stop(wakeId); wakeId = -1; }
  });
  handle('secureSet', async ({ key, value }) => { const o = readSecure(); o[String(key)] = seal(String(value)); writeSecure(o); });
  handle('secureGet', async ({ key }) => { try { return { value: unseal(readSecure()[String(key)]) }; } catch { return { value: null }; } });
  handle('secureRemove', async ({ key }) => { const o = readSecure(); delete o[String(key)]; writeSecure(o); });
  handle('readClipboard', async () => ({ text: clipboard.readText() }));
  handle('writeClipboard', async ({ text }) => { clipboard.writeText(String(text ?? '')); });
  handle('startLoopback', async ({ timeoutMs, successHtml }) => {
    stopLoop();
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(typeof successHtml === 'string' ? successHtml : '<p>You can close this tab.</p>');
      const port = server.address().port;
      if (win) win.webContents.send('qf:oauthCallback', { url: `http://127.0.0.1:${port}${req.url}` });
      if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
      setTimeout(stopLoop, 500);
    });
    await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res); });
    loop = { server, timer: setTimeout(stopLoop, Math.min(Number(timeoutMs) || 300000, 900000)) };
    return { port: server.address().port };
  });
  handle('stopLoopback', async () => stopLoop());
  handle('openExternal', async ({ url }) => { if (safeUrl(url)) await shell.openExternal(url); });
  handle('http', async ({ url, method, headers, data }) => {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) throw new Error('Only https requests are allowed');
    const res = await net.fetch(url, { method: method || 'GET', headers: headers || {}, body: data == null ? undefined : typeof data === 'string' ? data : JSON.stringify(data) });
    return { status: res.status, text: await res.text() };
  });
}

// ------------------------------------------------------------------------------------------
// Window

// Content Security Policy for the app. 'unsafe-eval' is needed by user macros (Developer tab);
// cdn.jsdelivr.net and wasm are for the optional on-device AI model; http to localhost is for
// Ollama and LM Studio. Inline scripts and plugins are never allowed.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:* data: blob:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-src 'none'",
].join('; ');

function serveApp() {
  protocol.handle(SCHEME, async (req) => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(DIST, rel);
    if (!file.startsWith(DIST + path.sep) && file !== DIST) return new Response('Forbidden', { status: 403 });
    const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(DIST, 'index.html');
    const res = await net.fetch(pathToFileURL(target).href);
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', CSP);
    return new Response(res.body, { status: res.status, headers });
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }])] },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 480,
    title: 'QuillForge',
    backgroundColor: '#ffffff',
    autoHideMenuBar: process.platform !== 'darwin',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false, // QuillForge has its own spelling checker
    },
  });
  // Links open in the system browser; the window never navigates away from the app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (safeUrl(url)) void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (safeUrl(url)) void shell.openExternal(url); } });
  // The page asks before unloading with unsaved documents: confirm here, as the browser would.
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Close without saving', 'Cancel'], defaultId: 1, cancelId: 1, title: 'Unsaved changes', message: 'Some documents have unsaved changes. Close QuillForge anyway?' });
    if (choice === 0) e.preventDefault();
  });
  win.on('closed', () => { win = null; });
  void win.loadURL(`${ORIGIN}/index.html`);
}

app.on('second-instance', (_e, argv) => {
  const p = fileFromArgs(argv);
  if (p) openExternalFile(p);
  else if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
// macOS: files opened from Finder (before or after launch).
app.on('open-file', (e, p) => { e.preventDefault(); if (app.isReady()) openExternalFile(p); else pendingLaunch = p; });

app.whenReady().then(() => {
  loadGrants();
  const p = pendingLaunch || fileFromArgs(process.argv);
  if (p) { grant(p); pendingLaunch = p; }
  serveApp();
  registerIpc();
  buildMenu();
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('window-all-closed', () => { stopLoop(); if (process.platform !== 'darwin') app.quit(); });
