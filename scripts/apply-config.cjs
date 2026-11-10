// Runs in the "Build APK" workflow BEFORE `expo prebuild`: copies the launcher name + icon from app-config.json / the logo
// into app.json and assets/, so a rebuilt APK shows the new name and icon on the phone's home screen.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
let cfg;
try { cfg = read("app-config.json"); } catch { console.log("apply-config: no app-config.json, nothing to do"); process.exit(0); }
const app = read("app.json"); const e = app.expo;
const HEX = /^#[0-9a-fA-F]{6}$/;
const bg = HEX.test(cfg.colors?.bg || "") ? cfg.colors.bg : "#0b0b10";

if (typeof cfg.appName === "string" && cfg.appName.trim()) { e.name = cfg.appName.trim().slice(0, 30); console.log("apply-config: launcher name ->", e.name); }
e.backgroundColor = bg;
if (e.splash) e.splash.backgroundColor = bg;

const logo = cfg.logoFile && /^app-logo\.(png|jpg)$/.test(cfg.logoFile) ? path.join(root, cfg.logoFile) : null;
if (logo && fs.existsSync(logo)) {
  const im = ["magick", "convert"].find((c) => { try { execFileSync(c, ["-version"], { stdio: "ignore" }); return true; } catch { return false; } });
  if (!im) console.log("apply-config: ImageMagick not found, keeping the old icon");
  else {
    const run = (args) => execFileSync(im, args, { stdio: "inherit" });
    const A = (f) => path.join(root, "assets", f);
    try {
      // Android adaptive icon: logo in the safe zone on a transparent canvas, solid background colour behind it
      run([logo, "-resize", "640x640", "-background", "none", "-gravity", "center", "-extent", "1024x1024", A("android-icon-foreground.png")]);
      run([logo, "-resize", "820x820", "-background", bg, "-gravity", "center", "-extent", "1024x1024", "-alpha", "remove", A("icon.png")]);
      run([logo, "-resize", "400x400", "-background", "none", "-gravity", "center", "-extent", "512x512", A("splash-icon.png")]);
      run([logo, "-resize", "48x48", "-background", "none", "-gravity", "center", "-extent", "48x48", A("favicon.png")]);
      e.android = e.android || {}; e.android.adaptiveIcon = { ...(e.android.adaptiveIcon || {}), foregroundImage: "./assets/android-icon-foreground.png", backgroundColor: bg };
      delete e.android.adaptiveIcon.backgroundImage; delete e.android.adaptiveIcon.monochromeImage;
      console.log("apply-config: icon generated from", cfg.logoFile);
    } catch (err) { console.log("apply-config: icon generation failed, keeping old icon:", String(err.message || err)); }
  }
} else console.log("apply-config: no logo file, keeping the current icon");

fs.writeFileSync(path.join(root, "app.json"), JSON.stringify(app, null, 2) + "\n");
