'use strict';

// Central configuration for Sokro (sokro.oscardevs.com). Every secret comes
// from the environment — nothing sensitive is hard-coded. The AI model defaults
// to OpenAI, but the provider is swappable via SOKRO_LLM_PROVIDER because all
// calls go through the LLM Abstraction Layer (src ../llm).
const config = {
  origin: process.env.SOKRO_ORIGIN || 'https://sokro.oscardevs.com',
  env: process.env.NODE_ENV || 'development',

  llm: {
    provider: process.env.SOKRO_LLM_PROVIDER || 'openai',
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      // Model per TASK SIZE (cost control): a cheap FAST model for light/frequent
      // work (planning, search summaries, each operate step) and a SMART model only
      // for heavy reasoning (deep reports). Each overridable via env.
      fastModel: process.env.SOKRO_FAST_MODEL || 'gpt-4o-mini',
      planModel: process.env.SOKRO_PLAN_MODEL || process.env.SOKRO_FAST_MODEL || 'gpt-4o-mini',
      smartModel: process.env.SOKRO_SMART_MODEL || 'gpt-5',
    },
  },

  db: { url: process.env.DATABASE_URL || '' },

  // Feature flags — each phase flips its flag on when it ships.
  features: {
    auth: true,
    memory: true,
    planner: true,
    browser: false,
    scheduler: true,
    permissions: true,
    voice: true,
  },
};

module.exports = config;
