const { app, BrowserWindow, ipcMain, session, shell, Menu } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { pathToFileURL, fileURLToPath } = require("url");
const { startDownload } = require("./downloader.cjs");

const PORT = 38417; // fixed, so the app's saved data (localStorage) stays under one origin
const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2", ".map": "application/json", ".wasm": "application/wasm", ".txt": "text/plain" };
let win = null, streamHeaders = null, appPort = PORT;
const jobs = new Map();

// ---- tiny static server for the exported web app (SPA fallback to index.html) ----
function serve(dir) {
  return new Promise((resolve) => {
    const handler = (req, res) => {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      let f = path.normalize(path.join(dir, p));
      if (!f.startsWith(dir)) { res.statusCode = 403; return res.end(); }
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, "index.html");
      res.setHeader("Content-Type", MIME[path.extname(f).toLowerCase()] || "application/octet-stream");
      fs.createReadStream(f).on("error", () => { res.statusCode = 500; res.end(); }).pipe(res);
    };
    const s = http.createServer(handler);
    s.on("error", () => { const s2 = http.createServer(handler); s2.listen(0, "127.0.0.1", () => resolve(s2.address().port)); });
    s.listen(PORT, "127.0.0.1", () => resolve(PORT));
  });
}

// ---- headers the browser would refuse to set (Referer, Origin, User-Agent...) are sent as x-sw-* and restored here ----
function setupNetwork() {
  const ses = session.defaultSession;
  ses.setUserAgent(CHROME_UA);
  ses.webRequest.onBeforeSendHeaders({ urls: ["http://*/*", "https://*/*"] }, (d, cb) => {
    const h = d.requestHeaders;
    if (d.url.startsWith(`http://127.0.0.1:${appPort}/`)) return cb({ requestHeaders: h });
    for (const k of Object.keys(h)) {
      if (k.toLowerCase().startsWith("x-sw-") && k.toLowerCase() !== "x-sw-stream") { h[k.slice(5)] = h[k]; delete h[k]; }
    }
    if (streamHeaders && (h["x-sw-stream"] || d.resourceType === "media")) for (const [k, v] of Object.entries(streamHeaders)) h[k] = v;
    delete h["x-sw-stream"];
    cb({ requestHeaders: h });
  });
  ses.webRequest.onHeadersReceived({ urls: ["http://*/*", "https://*/*"] }, (d, cb) => {
    const h = d.responseHeaders || {};
    for (const k of Object.keys(h)) { const l = k.toLowerCase(); if (l === "x-frame-options" || l === "content-security-policy" || l === "content-security-policy-report-only") delete h[k]; }
    cb({ responseHeaders: h });
  });
}

function setupIpc() {
  ipcMain.handle("sw:streamHeaders", (_e, h) => { streamHeaders = h && typeof h === "object" ? h : null; return true; });
  ipcMain.handle("sw:open", (_e, url) => { if (/^https?:/i.test(url)) shell.openExternal(url); return true; });
  ipcMain.handle("dl:start", async (e, job) => {
    const ac = new AbortController(); jobs.set(job.id, ac);
    try {
      const outDir = path.join(app.getPath("videos"), "SWADHIN");
      const r = await startDownload({ ...job, outDir }, ac.signal, (p) => { try { e.sender.send("dl:progress", p); } catch { /* window closed */ } });
      return { ok: true, url: pathToFileURL(r.filePath).href, filePath: r.filePath, bytes: r.bytes, kind: r.kind };
    } catch (err) { return { ok: false, aborted: ac.signal.aborted, error: String((err && err.message) || err) }; }
    finally { jobs.delete(job.id); }
  });
  ipcMain.handle("dl:cancel", (_e, id) => { const a = jobs.get(id); if (a) a.abort(); return true; });
  ipcMain.handle("dl:remove", (_e, u) => { try { const f = u.startsWith("file:") ? fileURLToPath(u) : u; if (f && f.startsWith(path.join(app.getPath("videos"), "SWADHIN"))) fs.rmSync(f, { force: true }); } catch { /* ignore */ } return true; });
  ipcMain.handle("dl:show", (_e, u) => { try { shell.showItemInFolder(u.startsWith("file:") ? fileURLToPath(u) : u); } catch { /* ignore */ } return true; });
  ipcMain.handle("dl:exists", (_e, u) => { try { return fs.existsSync(u.startsWith("file:") ? fileURLToPath(u) : u); } catch { return false; } });
}

async function createWindow() {
  const port = await serve(path.join(__dirname, "dist")); appPort = port;
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600, backgroundColor: "#0b0b10", title: "SWADHIN", autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, webSecurity: false, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (ev, url) => { if (!url.startsWith(`http://127.0.0.1:${port}`)) { ev.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  win.webContents.on("before-input-event", (_e, i) => { if (i.type === "keyDown" && i.key === "F11") win.setFullScreen(!win.isFullScreen()); if (i.type === "keyDown" && i.key === "F12" && process.env.SWADHIN_DEVTOOLS) win.webContents.toggleDevTools(); });
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit(); else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { setupNetwork(); setupIpc(); createWindow(); });
  app.on("window-all-closed", () => app.quit());
}
