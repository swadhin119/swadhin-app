// Tiny GitHub "contents" API client used to edit app-config.json / the logo and to start an APK build.
export interface Conn { owner: string; repo: string; branch: string; token: string }
const BASE = "https://api.github.com";
const enc = (s: string) => encodeURIComponent(s);

export const validConn = (c: Conn) => /^[A-Za-z0-9-]{1,39}$/.test(c.owner) && /^[A-Za-z0-9._-]{1,100}$/.test(c.repo) && /^[A-Za-z0-9._\/-]{1,100}$/.test(c.branch) && c.token.trim().length > 10;

export const toB64 = (s: string) => {
  const bytes = new TextEncoder().encode(s); let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};
export const fromB64 = (b: string) => {
  const bin = atob(b.replace(/\s/g, "")); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

async function call(c: Conn, path: string, init: RequestInit = {}) {
  const r = await fetch(`${BASE}/repos/${enc(c.owner)}/${enc(c.repo)}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.token.trim()}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(init.headers || {}) },
  });
  return r;
}
async function fail(r: Response, what: string): Promise<never> {
  let msg = ""; try { msg = (await r.json())?.message || ""; } catch { /* ignore */ }
  if (r.status === 401) throw new Error("GitHub rejected the token (401). Create a new one and paste it again.");
  if (r.status === 403) throw new Error("The token has no permission for this (403). It needs Contents: Read & write" + (what.includes("build") ? " and Actions: Read & write." : "."));
  if (r.status === 404) throw new Error(what.includes("build") ? "Workflow or repo not found (404). Check the repo name and that build-apk.yml exists." : "Repo or branch not found (404). Check owner / repo / branch and the token's repo access.");
  if (r.status === 409 || r.status === 422) throw new Error("The file changed on GitHub meanwhile. Tap again to retry. " + msg);
  throw new Error(`GitHub error ${r.status}${msg ? ": " + msg : ""}`);
}

/** Returns the decoded text of a file plus its sha, or null if the file does not exist. */
export async function getFile(c: Conn, path: string): Promise<{ text: string; sha: string } | null> {
  const r = await call(c, `contents/${path.split("/").map(enc).join("/")}?ref=${enc(c.branch)}`);
  if (r.status === 404) {
    // 404 can also mean "repo not visible"; check the repo once so the message is useful
    const repo = await call(c, "");
    if (repo.status === 404) return fail(repo, "repo");
    return null;
  }
  if (!r.ok) return fail(r, "read");
  const j = await r.json();
  return { text: fromB64(j.content || ""), sha: j.sha };
}
export async function getSha(c: Conn, path: string): Promise<string | null> {
  const r = await call(c, `contents/${path.split("/").map(enc).join("/")}?ref=${enc(c.branch)}`);
  if (r.status === 404) return null;
  if (!r.ok) return fail(r, "read");
  return (await r.json()).sha;
}
/** Creates or updates a file. `contentB64` is already base64. */
export async function putFile(c: Conn, path: string, contentB64: string, message: string, sha?: string | null) {
  const r = await call(c, `contents/${path.split("/").map(enc).join("/")}`, { method: "PUT", body: JSON.stringify({ message, content: contentB64, branch: c.branch, ...(sha ? { sha } : {}) }) });
  if (!r.ok) return fail(r, "write");
  return r.json();
}
export async function deleteFile(c: Conn, path: string, message: string) {
  const sha = await getSha(c, path); if (!sha) return;
  const r = await call(c, `contents/${path.split("/").map(enc).join("/")}`, { method: "DELETE", body: JSON.stringify({ message, sha, branch: c.branch }) });
  if (!r.ok) return fail(r, "delete");
}
export async function startBuild(c: Conn, workflowFile = "build-apk.yml") {
  const r = await call(c, `actions/workflows/${enc(workflowFile)}/dispatches`, { method: "POST", body: JSON.stringify({ ref: c.branch }) });
  if (r.status !== 204) return fail(r, "build");
}
export const rawUrl = (c: Conn, path: string, v: number) => `https://raw.githubusercontent.com/${c.owner}/${c.repo}/${c.branch}/${path}?v=${v}`;
