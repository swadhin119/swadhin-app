// Runs in CI only when google-services.json is in the repo: switches on Firebase for instant push.
const fs = require("fs");
const a = JSON.parse(fs.readFileSync("app.json", "utf8"));
const e = a.expo;
e.android = e.android || {};
e.android.googleServicesFile = "./google-services.json";
e.plugins = e.plugins || [];
if (!e.plugins.includes("@react-native-firebase/app")) e.plugins.push("@react-native-firebase/app");
fs.writeFileSync("app.json", JSON.stringify(a, null, 2));
console.log("Firebase push enabled for this build");
