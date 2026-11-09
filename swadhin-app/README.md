# SWADHIN (React Native / Expo)

Movie/series streaming app. Providers (vega-providers) **app ke andar** chalte hain, PC server nahi chahiye.

## Chalane ka tareeka (Expo Go)
1. PC par Node.js 20+ install karo.
2. Phone par **Expo Go** app install karo (Play Store / App Store). Latest version chahiye (Expo SDK 58).
3. PC aur phone same WiFi par.
4. Is folder me terminal kholo:
   ```
   npm install
   npx expo start
   ```
5. QR code Expo Go se scan karo (Android) ya Camera se (iPhone).

Agar QR na chale: `npx expo start --tunnel`

## Kaise kaam karta hai
- App `manifest.json` aur provider JS files GitHub (`Zenda-Cross/vega-providers`) se download karke cache karta hai.
- Provider code app ke JS engine me chalta hai (`src/engine/engine.ts`), cheerio aur axios ke saath.
- Home: hero slider, Top-10, rows, Continue Watching, My List.  Search: live results.  Library: sections + genres.
- Detail: seasons/quality chips, episodes, resume.  Player: HLS/MP4/MKV, server switch (auto-fallback), subtitles (VTT/SRT), next episode, double-tap seek, resume.
- Profile: provider badlo, History, My List, custom provider source URL, cache saaf.

## Limits (jaan lo)
- Jin providers ko Cloudflare browser-verification chahiye, wo is app me nahi chalenge (app saaf error dikhata hai). Doosra provider chuno.
- Provider code sandbox me nahi chalta (Vega app jaisa isolation nahi). Sirf trusted source URL use karo.
- MKV me AC3/DTS audio kuch phones par bina awaaz chal sakta hai. Server badal ke MP4/HLS chuno.
- "Embed" wale servers WebView me khulte hain.
- Torrent aur YouTube providers skip kiye gaye hain.

## APK banana
`npm i -g eas-cli && eas build -p android --profile preview` (Expo account chahiye), ya `npx expo prebuild` ke baad Android Studio se.

## Dev checks
`npx tsc --noEmit`, `node scripts/bundle-cheerio.mjs` (cheerio vendor file dobara banata hai).
