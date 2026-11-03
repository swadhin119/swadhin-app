// cheerio (slim = htmlparser2) ko ek CommonJS file me bundle karta hai, taaki React Native (Hermes) me Node-only modules na lagein.
import { build } from "esbuild";
await build({
  stdin: { contents: 'export * from "cheerio/slim";', resolveDir: process.cwd(), loader: "js" },
  bundle: true, format: "cjs", platform: "neutral", mainFields: ["module", "main"], conditions: ["import", "default"],
  target: "es2019", outfile: "src/vendor/cheerio.js", legalComments: "none", minify: true,
});
console.log("src/vendor/cheerio.js ready");
