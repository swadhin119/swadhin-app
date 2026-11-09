import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { clearConn, loadConn, saveConn } from "./store";
import { deleteFile, getFile, getSha, putFile, rawUrl, startBuild, toB64, validConn, type Conn } from "./github";
import { COLOR_KEYS, DEFAULT_COLORS, LABELS, PRESETS, QUICK, contrast, isHex, type ColorKey, type Colors } from "./theme";

const A = { bg: "#0b0b10", card: "#16161e", card2: "#1f1f2a", line: "#2a2a38", text: "#f4f4f8", sub: "#9a9ab0", accent: "#ff5a36", ok: "#35d07f", danger: "#ff4d6d" };
const CONFIG_PATH = "app-config.json";

export default function App() {
  const [conn, setConn] = useState<Conn | null>(null);
  const [booting, setBooting] = useState(true);
  const [showConn, setShowConn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ t: "ok" | "err"; s: string } | null>(null);

  const [name, setName] = useState("SWADHIN");
  const [tagline, setTagline] = useState("");
  const [colors, setColors] = useState<Colors>(DEFAULT_COLORS);
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFile, setLogoFile] = useState("");
  const [newLogo, setNewLogo] = useState<{ b64: string; ext: string; uri: string } | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);

  const load = useCallback(async (c: Conn) => {
    setLoading(true); setMsg(null);
    try {
      const f = await getFile(c, CONFIG_PATH);
      if (f) {
        const j = JSON.parse(f.text);
        setName(String(j.appName || "SWADHIN")); setTagline(String(j.tagline || "")); setLogoUrl(String(j.logoUrl || "")); setLogoFile(String(j.logoFile || ""));
        const col = { ...DEFAULT_COLORS }; for (const k of COLOR_KEYS) if (isHex(j.colors?.[k] ?? "")) col[k] = String(j.colors[k]).toLowerCase();
        setColors(col);
      } else setMsg({ t: "ok", s: "No app-config.json in the repo yet. Edit the look below and publish to create it." });
    } catch (e: any) { setMsg({ t: "err", s: String(e?.message || e) }); } finally { setLoading(false); }
  }, []);

  useEffect(() => { (async () => { const c = await loadConn(); if (c && validConn(c)) { setConn(c); void load(c); } else setShowConn(true); setBooting(false); })(); }, [load]);

  const pickLogo = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.9, base64: true });
      if (r.canceled || !r.assets?.[0]?.base64) return;
      const a = r.assets[0]; const ext = /png/i.test(a.mimeType || "") || /\.png$/i.test(a.uri) ? "png" : "jpg";
      setNewLogo({ b64: a.base64!, ext, uri: a.uri }); setRemoveLogo(false);
    } catch (e: any) { setMsg({ t: "err", s: "Could not open the gallery: " + String(e?.message || e) }); }
  };

  const bad = COLOR_KEYS.filter((k) => !isHex(colors[k]));
  const lowContrast = isHex(colors.text) && isHex(colors.bg) && contrast(colors.text, colors.bg) < 3;

  const publish = async () => {
    if (!conn) return;
    if (!name.trim()) return setMsg({ t: "err", s: "App name cannot be empty." });
    if (bad.length) return setMsg({ t: "err", s: "Fix the colours marked in red (use 6-digit hex like #ff5a36)." });
    setBusy("Publishing…"); setMsg(null);
    try {
      const now = Date.now(); let lUrl = logoUrl, lFile = logoFile;
      if (newLogo) {
        const path = `app-logo.${newLogo.ext}`;
        await putFile(conn, path, newLogo.b64, "admin: update app logo", await getSha(conn, path));
        lFile = path; lUrl = rawUrl(conn, path, now);
        if (logoFile && logoFile !== path) await deleteFile(conn, logoFile, "admin: remove old logo").catch(() => {});
      } else if (removeLogo && logoFile) { await deleteFile(conn, logoFile, "admin: remove app logo"); lFile = ""; lUrl = ""; }
      const cfg = { version: 1, appName: name.trim(), tagline: tagline.trim(), logoUrl: lUrl, logoFile: lFile, colors: Object.fromEntries(COLOR_KEYS.map((k) => [k, colors[k].toLowerCase()])), updatedAt: now };
      await putFile(conn, CONFIG_PATH, toB64(JSON.stringify(cfg, null, 2) + "\n"), "admin: update app look", await getSha(conn, CONFIG_PATH));
      setLogoUrl(lUrl); setLogoFile(lFile); setNewLogo(null); setRemoveLogo(false);
      setMsg({ t: "ok", s: "Published. Phones that already have the app will download the new look in the background and apply it the next time the app is opened." });
    } catch (e: any) { setMsg({ t: "err", s: String(e?.message || e) }); } finally { setBusy(""); }
  };

  const rebuild = () => {
    if (!conn) return;
    const run = async () => {
      setBusy("Starting build…"); setMsg(null);
      try { await startBuild(conn); setMsg({ t: "ok", s: "Build started. In about 10 minutes the new APK appears on GitHub → Actions → Build APK → Artifacts. Install it over the old app to change the launcher name and icon." }); }
      catch (e: any) { setMsg({ t: "err", s: String(e?.message || e) }); } finally { setBusy(""); }
    };
    const text = "This builds a new APK with the launcher name and icon from your published config. Publish your changes first. Continue?";
    if (Platform.OS === "web") { if (window.confirm(text)) void run(); } else Alert.alert("Rebuild APK", text, [{ text: "Cancel", style: "cancel" }, { text: "Start build", onPress: () => void run() }]);
  };

  const previewLogo = newLogo?.uri || (!removeLogo && logoUrl) || "";
  if (booting) return <View style={[st.root, { alignItems: "center", justifyContent: "center" }]}><ActivityIndicator color={A.accent} /></View>;

  return (
    <View style={st.root}>
      <StatusBar style="light" />
      <View style={st.head}>
        <Text style={st.h1}>SWADHIN Admin</Text>
        <Pressable onPress={() => setShowConn((v) => !v)} style={st.gear}><Text style={st.gearTxt}>{showConn ? "Close" : "GitHub"}</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {showConn || !conn ? <ConnForm initial={conn} onSave={async (c) => { await saveConn(c); setConn(c); setShowConn(false); void load(c); }} onForget={async () => { await clearConn(); setConn(null); setShowConn(true); }} /> : null}

        {conn ? (
          <>
            <Text style={st.repo}>Editing {conn.owner}/{conn.repo} ({conn.branch}) {loading ? "· loading…" : ""}</Text>

            <Text style={st.sec}>Live preview</Text>
            <Preview name={name || "App name"} tagline={tagline} logo={previewLogo} colors={colors} />
            {lowContrast ? <Text style={st.warn}>Text and background colours are very close, the app will be hard to read.</Text> : null}

            <Text style={st.sec}>App name & logo</Text>
            <View style={st.card}>
              <Text style={st.lbl}>App name (shown inside the app)</Text>
              <TextInput style={st.input} value={name} onChangeText={setName} maxLength={30} placeholder="SWADHIN" placeholderTextColor={A.sub} />
              <Text style={[st.lbl, { marginTop: 12 }]}>Tagline (optional)</Text>
              <TextInput style={st.input} value={tagline} onChangeText={setTagline} maxLength={60} placeholder="Watch anything" placeholderTextColor={A.sub} />
              <Text style={[st.lbl, { marginTop: 12 }]}>Logo</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={st.logoBox}>{previewLogo ? <Image source={{ uri: previewLogo }} style={{ width: 64, height: 64 }} resizeMode="contain" /> : <Text style={{ color: A.sub, fontSize: 11 }}>No logo</Text>}</View>
                <Pressable style={st.btnLite} onPress={pickLogo}><Text style={st.btnLiteTxt}>Choose from gallery</Text></Pressable>
                {previewLogo ? <Pressable style={st.btnLite} onPress={() => { setNewLogo(null); setRemoveLogo(true); }}><Text style={[st.btnLiteTxt, { color: A.danger }]}>Remove</Text></Pressable> : null}
              </View>
              <Text style={st.hint}>Use a square PNG (transparent background looks best).</Text>
            </View>

            <Text style={st.sec}>Colours</Text>
            <View style={st.card}>
              <Text style={st.lbl}>Ready-made themes</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
                {PRESETS.map((p) => (
                  <Pressable key={p.name} onPress={() => setColors(p.colors)} style={st.preset}>
                    <View style={{ flexDirection: "row" }}>{(["bg", "card", "accent", "accent2"] as ColorKey[]).map((k) => <View key={k} style={{ width: 18, height: 18, backgroundColor: p.colors[k], borderWidth: 1, borderColor: A.line }} />)}</View>
                    <Text style={st.presetTxt}>{p.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              {COLOR_KEYS.map((k) => (
                <View key={k} style={{ marginTop: 12 }}>
                  <Text style={st.lbl}>{LABELS[k]}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={[st.swatch, { backgroundColor: isHex(colors[k]) ? colors[k] : "#000" }]} />
                    <TextInput style={[st.input, { flex: 1 }, !isHex(colors[k]) && { borderColor: A.danger }]} value={colors[k]} autoCapitalize="none" autoCorrect={false} maxLength={7}
                      onChangeText={(v) => setColors((c) => ({ ...c, [k]: v.startsWith("#") || v === "" ? v : "#" + v }))} />
                  </View>
                  {k === "accent" || k === "accent2" ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      {QUICK.map((q) => <Pressable key={q} onPress={() => setColors((c) => ({ ...c, [k]: q }))} style={[st.quick, { backgroundColor: q }, colors[k].toLowerCase() === q && { borderColor: "#fff", borderWidth: 2 }]} />)}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>

            {msg ? <View style={[st.msg, msg.t === "err" ? { borderColor: A.danger } : { borderColor: A.ok }]}><Text style={{ color: msg.t === "err" ? A.danger : A.ok, fontWeight: "700" }}>{msg.s}</Text></View> : null}

            <Pressable style={[st.btn, !!busy && { opacity: 0.6 }]} disabled={!!busy} onPress={publish}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>Publish to app</Text>}</Pressable>
            <Text style={st.hint}>Name, logo and colours update inside the installed app the next time it is opened (no new APK needed).</Text>

            <Text style={st.sec}>Launcher name & icon</Text>
            <View style={st.card}>
              <Text style={st.hint}>The name under the app icon on the home screen and the icon itself are part of the APK, so they only change when a new APK is built and installed over the old one. Publish first, then:</Text>
              <Pressable style={[st.btnLite, { alignSelf: "flex-start", marginTop: 10 }, !!busy && { opacity: 0.6 }]} disabled={!!busy} onPress={rebuild}><Text style={st.btnLiteTxt}>Rebuild APK with new name & icon</Text></Pressable>
              <Pressable style={{ marginTop: 12 }} onPress={() => Linking.openURL(`https://github.com/${conn.owner}/${conn.repo}/actions`)}><Text style={{ color: A.accent, fontWeight: "700" }}>Open GitHub Actions page</Text></Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Preview({ name, tagline, logo, colors: c }: { name: string; tagline: string; logo: string; colors: Colors }) {
  const ok = (k: ColorKey) => (isHex(c[k]) ? c[k] : "#888888");
  return (
    <View style={{ borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: A.line, backgroundColor: ok("bg") }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {logo ? <Image source={{ uri: logo }} style={{ width: 28, height: 28, borderRadius: 7 }} resizeMode="contain" /> : null}
          <View><Text style={{ color: ok("accent"), fontWeight: "900", fontSize: 20, letterSpacing: 2 }}>{name}</Text>{tagline ? <Text style={{ color: ok("sub"), fontSize: 11 }}>{tagline}</Text> : null}</View>
        </View>
        <View style={{ backgroundColor: ok("card2"), borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: ok("line") }}><Text style={{ color: ok("text"), fontWeight: "700", fontSize: 12 }}>Provider ▾</Text></View>
      </View>
      <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 14 }}>
        {[0, 1, 2].map((i) => <View key={i} style={{ flex: 1, height: 90, borderRadius: 10, backgroundColor: ok("card"), borderWidth: 1, borderColor: ok("line"), justifyContent: "flex-end", padding: 8 }}><Text style={{ color: ok("text"), fontWeight: "700", fontSize: 11 }}>Movie {i + 1}</Text><Text style={{ color: ok("accent2"), fontSize: 11 }}>★ 8.{i + 2}</Text></View>)}
      </View>
      <View style={{ flexDirection: "row", gap: 10, padding: 14 }}>
        <View style={{ backgroundColor: ok("accent"), borderRadius: 20, paddingHorizontal: 18, paddingVertical: 9 }}><Text style={{ color: "#fff", fontWeight: "800" }}>Watch</Text></View>
        <Text style={{ color: ok("sub"), alignSelf: "center" }}>Sample text</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-around", paddingVertical: 10, backgroundColor: ok("card"), borderTopWidth: 1, borderTopColor: ok("line") }}>
        <Text style={{ color: ok("accent"), fontWeight: "800", fontSize: 11 }}>Home</Text><Text style={{ color: ok("sub"), fontSize: 11 }}>Search</Text><Text style={{ color: ok("sub"), fontSize: 11 }}>Downloads</Text><Text style={{ color: ok("sub"), fontSize: 11 }}>Profile</Text>
      </View>
    </View>
  );
}

function ConnForm({ initial, onSave, onForget }: { initial: Conn | null; onSave(c: Conn): void; onForget(): void }) {
  const [owner, setOwner] = useState(initial?.owner ?? "swadhin119");
  const [repo, setRepo] = useState(initial?.repo ?? "swadhin-app");
  const [branch, setBranch] = useState(initial?.branch ?? "main");
  const [token, setToken] = useState(initial?.token ?? "");
  const c = useMemo(() => ({ owner: owner.trim(), repo: repo.trim(), branch: branch.trim(), token: token.trim() }), [owner, repo, branch, token]);
  return (
    <View style={st.card}>
      <Text style={st.h2}>Connect to GitHub</Text>
      <Text style={st.hint}>The admin app saves your look into app-config.json in your repo. The token stays only on this phone (secure storage).</Text>
      <Text style={[st.lbl, { marginTop: 10 }]}>Owner</Text><TextInput style={st.input} value={owner} onChangeText={setOwner} autoCapitalize="none" autoCorrect={false} />
      <Text style={[st.lbl, { marginTop: 10 }]}>Repository</Text><TextInput style={st.input} value={repo} onChangeText={setRepo} autoCapitalize="none" autoCorrect={false} />
      <Text style={[st.lbl, { marginTop: 10 }]}>Branch</Text><TextInput style={st.input} value={branch} onChangeText={setBranch} autoCapitalize="none" autoCorrect={false} />
      <Text style={[st.lbl, { marginTop: 10 }]}>Access token</Text><TextInput style={st.input} value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="github_pat_…" placeholderTextColor={A.sub} />
      <Text style={st.hint}>Create it at GitHub → Settings → Developer settings → Fine-grained tokens. Choose only this repo, and give “Contents: Read and write” and “Actions: Read and write”.</Text>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
        <Pressable style={[st.btn, { flex: 1, marginTop: 0 }, !validConn(c) && { opacity: 0.5 }]} disabled={!validConn(c)} onPress={() => onSave(c)}><Text style={st.btnTxt}>Save & load</Text></Pressable>
        {initial ? <Pressable style={st.btnLite} onPress={onForget}><Text style={[st.btnLiteTxt, { color: A.danger }]}>Forget token</Text></Pressable> : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: A.bg },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: Platform.OS === "web" ? 14 : 44, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: A.line },
  h1: { color: A.text, fontSize: 20, fontWeight: "900" },
  h2: { color: A.text, fontSize: 16, fontWeight: "800" },
  gear: { paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: A.card2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: A.line },
  gearTxt: { color: A.text, fontWeight: "700", fontSize: 13 },
  repo: { color: A.sub, fontSize: 12, marginTop: 4 },
  sec: { color: A.sub, fontSize: 12, fontWeight: "800", marginTop: 20, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.7 },
  card: { backgroundColor: A.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: A.line },
  lbl: { color: A.text, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  input: { backgroundColor: A.card2, color: A.text, borderRadius: 10, borderWidth: 1, borderColor: A.line, paddingHorizontal: 12, height: 44, fontSize: 15 },
  hint: { color: A.sub, fontSize: 12, lineHeight: 17, marginTop: 8 },
  warn: { color: "#ffb020", fontSize: 12.5, marginTop: 8, fontWeight: "700" },
  swatch: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: A.line },
  quick: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: A.line },
  preset: { backgroundColor: A.card2, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: A.line, alignItems: "center", gap: 6 },
  presetTxt: { color: A.text, fontSize: 11.5, fontWeight: "700" },
  logoBox: { width: 72, height: 72, borderRadius: 14, backgroundColor: A.card2, borderWidth: 1, borderColor: A.line, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  btn: { backgroundColor: A.accent, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", marginTop: 18 },
  btnTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
  btnLite: { paddingHorizontal: 14, height: 40, borderRadius: 20, backgroundColor: A.card2, borderWidth: 1, borderColor: A.line, alignItems: "center", justifyContent: "center" },
  btnLiteTxt: { color: A.text, fontWeight: "700", fontSize: 13 },
  msg: { marginTop: 16, padding: 12, borderRadius: 12, borderWidth: 1, backgroundColor: A.card },
});
