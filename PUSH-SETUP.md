# Instant push notification (optional, free)

Bina iske bhi notification chalta hai (app khula ho to turant, band ho to ~15 min mein).
Agar chahiye ki app band ho tab bhi **1 minute ke andar** notification bar mein aaye, to ye ek baar karo:

1. https://console.firebase.google.com → **Add project** (naam kuch bhi, Google Analytics off).
2. Project ke andar **Add app → Android**. Package name exactly: `com.swadhin.app` (app.json ke `android.package` se match karna). **Register app**.
3. **google-services.json** download karo → `D:\swadhin-app\` ke root mein rakho (app.json ke saath).
4. Firebase → Project settings (gear) → **Service accounts** → **Generate new private key** → ek `.json` file download hogi.
5. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `FCM_SERVICE_ACCOUNT`
   - Secret: us `.json` file ka **poora content** paste karo.
6. Firebase / Google Cloud mein **Firebase Cloud Messaging API (V1)** enabled honi chahiye (default se enabled hoti hai).
7. `git add -A && git commit -m "push" && git push` → naya **Build APK** chalega (isme Firebase apne aap judega) → naya APK install karo.
8. Admin app → **Notify** tab → "Also send instant push" ON karke bhejo.

Notes
- `google-services.json` mein secret nahi hota, repo mein rakhna theek hai. Service account wali `.json` kabhi repo mein mat daalna, sirf GitHub secret mein.
- Package name `com.swadhin.app` agar tumhare app.json mein alag hai to wahi use karo.
