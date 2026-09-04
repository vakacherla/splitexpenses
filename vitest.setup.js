// The test suite runs in plain Node, not a browser or jsdom (this project
// deliberately has no DOM-testing dependency — everything tested is pure
// logic). `localStorage` isn't a Node global, so offlineQueue.js/
// offlineCache.js (the only code that needs it) get a minimal in-memory
// stand-in here rather than pulling in jsdom for one Web Storage API.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}
