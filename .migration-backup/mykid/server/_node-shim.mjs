// Minimal browser-global shim so warm-tts.js can import the client data/game
// modules under Node. Those modules touch window / document / localStorage at
// load time; the warmer only needs their exported DATA (phrases), not any
// browser behavior — so harmless no-op stand-ins are enough.
// Used as a preload: `node --import ./server/_node-shim.mjs server/warm-tts.js`.
const noop = () => {};
globalThis.window = globalThis.window || { addEventListener: noop, removeEventListener: noop };
globalThis.document = globalThis.document || { addEventListener: noop, createElement: () => ({ style: {} }) };
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: noop, removeItem: noop };
