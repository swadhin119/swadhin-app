const c = require("crypto");
module.exports = { digestStringAsync: async (a, s) => c.createHash(a.replace("-", "").toLowerCase()).update(s).digest("hex"), CryptoDigestAlgorithm: { SHA256: "SHA-256" } };
