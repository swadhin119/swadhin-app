const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  setStreamHeaders: (h) => ipcRenderer.invoke("sw:streamHeaders", h || null),
  openExternal: (u) => ipcRenderer.invoke("sw:open", u),
  download: (job) => ipcRenderer.invoke("dl:start", job),
  cancel: (id) => ipcRenderer.invoke("dl:cancel", id),
  remove: (u) => ipcRenderer.invoke("dl:remove", u),
  show: (u) => ipcRenderer.invoke("dl:show", u),
  exists: (u) => ipcRenderer.invoke("dl:exists", u),
  onProgress: (cb) => { const f = (_e, d) => cb(d); ipcRenderer.on("dl:progress", f); return () => ipcRenderer.removeListener("dl:progress", f); },
});
