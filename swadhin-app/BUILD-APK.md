# SWADHIN ka APK banao (tablet me install, laptop ki zarurat nahi)

APK ek baar banta hai, phir tablet me install hone ke baad app akela chalta hai.

## Tareeka 1: Expo cloud build (sabse aasaan, ~15 min, free)
1. https://expo.dev par free account banao.
2. PowerShell me:
   ```
   cd D:\swadhin-app
   npm install
   npm install -g eas-cli
   eas login
   eas init
   eas build -p android --profile preview
   ```
   (`eas init` me "Create project?" -> Y)
3. Build cloud me hota hai (queue me free plan par thoda wait lag sakta hai). Ant me ek **download link / QR** milega.
4. Wo link tablet ke browser me kholo, **.apk** download karo, install karo ("Unknown sources" allow karna padega).

## Tareeka 2: GitHub Actions (Expo account nahi chahiye)
1. GitHub par ek naya private repo banao, is folder ka poora code push karo.
2. Repo -> **Actions** -> **Build APK** -> **Run workflow**.
3. 10-15 min baad run me **Artifacts -> swadhin-apk** download karo, zip kholo, APK tablet me install karo.

## Dhyan do
- Dono tareeke jaise-ke-taise mere sandbox me test nahi hue (wahan Android build tools blocked hain). Pehli baar build fail ho to error log bhej do.
- APK debug-key se sign hota hai: personal use / sideload ke liye theek, Play Store ke liye nahi.
- Update chahiye to naya APK bana ke upar se install kar do.
