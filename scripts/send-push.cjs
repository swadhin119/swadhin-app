// Sends one push notification to everybody who has the app (Firebase topic "all").
// Needs the secret FCM_SERVICE_ACCOUNT (the whole service-account JSON from Firebase). No dependencies.
const crypto = require("crypto");
const b64u = (b) => Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

async function main() {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Secret FCM_SERVICE_ACCOUNT is missing. Add it in GitHub: Settings > Secrets and variables > Actions.");
  const sa = JSON.parse(raw);
  const title = (process.env.TITLE || "").slice(0, 80), body = (process.env.BODY || "").slice(0, 300), url = process.env.URL_LINK || "";
  if (!title) throw new Error("Title is empty");
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3000 }));
  const sig = b64u(crypto.createSign("RSA-SHA256").update(head + "." + claim).sign(sa.private_key));
  const tr = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + head + "." + claim + "." + sig });
  const tj = await tr.json();
  if (!tj.access_token) throw new Error("Google rejected the service account: " + JSON.stringify(tj));
  const msg = { message: { topic: "all", notification: { title, body }, data: { url }, android: { priority: "HIGH", notification: { channel_id: "updates", color: "#ff5a36" } } } };
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, { method: "POST", headers: { Authorization: "Bearer " + tj.access_token, "Content-Type": "application/json" }, body: JSON.stringify(msg) });
  const out = await r.text();
  if (!r.ok) throw new Error("FCM error " + r.status + ": " + out);
  console.log("Sent:", out);
}
main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
