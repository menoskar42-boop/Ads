'use strict';

// ── LLM Abstraction Layer ────────────────────────────────────────────────────
// Every provider (OpenAI, Claude, Gemini, Groq, local) implements the SAME
// interface, so the planner, actions and skills never bind to a vendor. Swap the
// active provider with SOKRO_LLM_PROVIDER — no caller changes.
//
//   interface LLMProvider {
//     chat({ messages, model?, json?, temperature? }): Promise<{ text, raw }>
//     embed(texts: string[]): Promise<number[][]>   // optional (memory search)
//   }
//
// Adapters register themselves here; the real OpenAI adapter lands in Phase 4.
const factories = {}; // name -> () => LLMProvider

function register(name, factory) { factories[name] = factory; }

function get(name) {
  const key = name || require('../core/config').llm.provider;
  const f = factories[key];
  if (!f) throw new Error('[sokro/llm] provider not registered: ' + key);
  return f();
}

function available() { return Object.keys(factories); }

module.exports = { register, get, available };
