const m = new Map();
module.exports = { default: { getItem: async (k) => (m.has(k) ? m.get(k) : null), setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k),
  getAllKeys: async () => [...m.keys()], multiRemove: async (ks) => ks.forEach((k) => m.delete(k)) }, __esModule: true };
