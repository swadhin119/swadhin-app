# SWADHIN Desktop (Windows) app

Same app, wrapped in Electron. Providers run inside the app (no laptop backend needed).
Downloads are saved in `Videos\SWADHIN` (HLS downloads are joined into one mp4 with ffmpeg).

## Easiest: GitHub Actions (no setup on your PC)
1. `git add . && git commit -m "desktop" && git push`
2. GitHub repo -> **Actions** -> **Build Windows App** -> **Run workflow**
3. After ~10 min open the run -> **Artifacts** -> `swadhin-windows`
   - `SWADHIN-Setup-x.y.z.exe`  (installer)
   - `SWADHIN-Portable-x.y.z.exe` (no install, just run)

## On your own PC (Node 20+)
```
cd D:\swadhin-app
npm install
npm run desktop:build        # exports the web app into desktop\dist
cd desktop
npm install                  # electron, electron-builder, ffmpeg
npm start                    # run the app now
npm run dist                 # make the .exe files in desktop\release
```

## Keys
Space / K play-pause · Left / Right seek 10 s · F or F11 fullscreen

## Notes
- The Android app is unchanged (`npm run android` / the Build APK workflow).
- Desktop uses the same screens as the phone app, just on a big window.
- Windows SmartScreen may warn on first run (the .exe is not code-signed): More info -> Run anyway.
