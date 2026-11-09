// Desktop (Electron) bootstrap: send headers a browser refuses to set (User-Agent, Referer, Origin, Cookie, sec-*)
// as "x-sw-*", and the Electron main process turns them back into the real headers.
const FORBIDDEN = new Set(["user-agent", "referer", "origin", "cookie", "cookie2", "host", "accept-encoding", "connection", "dnt", "te", "upgrade", "via", "keep-alive", "date", "expect"]);
const isForbidden = (n: string) => { const l = n.toLowerCase(); return FORBIDDEN.has(l) || l.startsWith("sec-") || l.startsWith("proxy-"); };
const w: any = typeof window !== "undefined" ? window : undefined;
if (w && w.desktop?.isDesktop && !w.__swPatched) {
  w.__swPatched = true;
  const origSet = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) { return origSet.call(this, isForbidden(name) ? "x-sw-" + name : name, value); };
  const origFetch = w.fetch.bind(w);
  w.fetch = (input: any, init?: any) => {
    try {
      if (init?.headers) {
        const out: Record<string, string> = {};
        const add = (k: string, v: string) => { out[isForbidden(k) ? "x-sw-" + k : k] = v; };
        if (typeof Headers !== "undefined" && init.headers instanceof Headers) init.headers.forEach((v: string, k: string) => add(k, v));
        else if (Array.isArray(init.headers)) init.headers.forEach(([k, v]: [string, string]) => add(k, v));
        else Object.entries(init.headers).forEach(([k, v]) => add(k, String(v)));
        init = { ...init, headers: out };
      }
    } catch { /* fall through with original init */ }
    return origFetch(input, init);
  };
  const openUrl = (u: string) => w.desktop.openExternal(u);
  w.__swOpen = openUrl;
}
