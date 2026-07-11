// Central AI call layer — all OpenAI chat completions route through callAI().
// Priority: call-site override > feature default > global serverAiConfig > system default

const SYSTEM_DEFAULT = { model: 'gpt-4o-mini', temperature: 0.7, max_tokens: 800 };

// Per-feature tuned defaults (match original hardcoded values).
// Call-site overrides still take precedence.
const FEATURE_CFG = {
  'detect-specialty':     { temperature: 0,   max_tokens: 20  },
  'specialty-consult':    { temperature: 0.1, max_tokens: 350 },
  'doctor-suitability':   { temperature: 0.3, max_tokens: 120 },
  'generate-soap-note':   { temperature: 0.3, max_tokens: 600 },
  'suggest-medications':  { temperature: 0.2, max_tokens: 500 },
  'clinic-insights':      { temperature: 0.4, max_tokens: 400 },
  'generate-message':     { temperature: 0.5, max_tokens: 200 },
  'analyze-feedback':     { temperature: 0.3, max_tokens: 400 },
  'medical-search':       { temperature: 0.2, max_tokens: 600 },
  'generate-protocol':    { temperature: 0.2, max_tokens: 600 },
  'assess-urgency':       { temperature: 0,   max_tokens: 150 },
  'drug-autofill':        { temperature: 0,   max_tokens: 150 },
  'smart-patient-search': { temperature: 0,   max_tokens: 300 },
  'ai-scribe':            { temperature: 0.3, max_tokens: 400 },
  'medical-assistant':    { temperature: 0.2, max_tokens: 500 },
  'financial-forecast':   { temperature: 0.3, max_tokens: 300 },
  'chatbot-reply':        { temperature: 0.5, max_tokens: 120 },
  'chatbot-scenarios':    { temperature: 0.7, max_tokens: 600 },
  'extract-intent':       { temperature: 0,   max_tokens: 120 },
};

// Token cost per 1K tokens in USD (OpenAI pricing ~2024)
const MODEL_COST = {
  'gpt-4o':        { input: 0.005,   output: 0.015  },
  'gpt-4o-mini':   { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005,  output: 0.0015 },
};

function estimateCost(model, promptTokens, completionTokens) {
  const rates = MODEL_COST[model] || MODEL_COST['gpt-4o-mini'];
  return (promptTokens / 1000) * rates.input + (completionTokens / 1000) * rates.output;
}

// In-memory ring buffer — fallback when Supabase is unavailable (max 1000 entries)
const _aiLogBuffer = [];
const _AI_LOG_MAX  = 1000;

function _bufferLog(entry) {
  _aiLogBuffer.push(entry);
  if (_aiLogBuffer.length > _AI_LOG_MAX) _aiLogBuffer.shift();
}

export function getAILogBuffer() { return [..._aiLogBuffer]; }

/**
 * initAICaller(openaiClient, getConfig, getDb?)
 *
 * getDb — optional, returns { supabaseAdmin, supabaseReady }
 *
 * Returns callAI({ type, messages, clinicId?, max_tokens?, temperature?, response_format? })
 * which resolves to a raw OpenAI chat completion response (same shape as before).
 */
export function initAICaller(openaiClient, getConfig, getDb, onUsage) {
  if (!openaiClient) return null;

  return async function callAI({ type, messages, clinicId, max_tokens, temperature, response_format }) {
    const cfg    = getConfig();
    const feat   = FEATURE_CFG[type] || {};

    const model  = cfg.model       || SYSTEM_DEFAULT.model;
    const temp   = temperature     ?? feat.temperature ?? cfg.temperature ?? SYSTEM_DEFAULT.temperature;
    const maxTok = max_tokens      ?? feat.max_tokens  ?? cfg.maxTokens   ?? SYSTEM_DEFAULT.max_tokens;

    const params = { model, messages, temperature: temp, max_tokens: maxTok };
    if (response_format) params.response_format = response_format;

    const t0       = Date.now();
    const response = await openaiClient.chat.completions.create(params);
    const elapsed  = Date.now() - t0;

    const usage   = response.usage || {};
    const prompt  = usage.prompt_tokens     ?? 0;
    const compl   = usage.completion_tokens ?? 0;
    const total   = usage.total_tokens      ?? 0;
    const costUsd = estimateCost(model, prompt, compl);

    // STEP 6 logging
    console.log(
      `[AI] type=${type} model=${model} prompt=${prompt} ` +
      `completion=${compl} total=${total} cost=$${costUsd.toFixed(5)} ${elapsed}ms`
    );

    const logEntry = {
      clinic_id:         clinicId || null,
      feature:           type,
      model,
      prompt_tokens:     prompt,
      completion_tokens: compl,
      total_tokens:      total,
      cost_usd:          costUsd,
      response_ms:       elapsed,
      created_at:        new Date().toISOString(),
    };

    // STEP 4: increment subscription usage counter
    if (onUsage && clinicId) onUsage(clinicId, 'ai_requests');

    // Always write to in-memory buffer
    _bufferLog(logEntry);

    // Fire-and-forget to Supabase if available
    if (getDb) {
      const { supabaseAdmin, supabaseReady } = getDb();
      if (supabaseReady && supabaseAdmin) {
        supabaseAdmin.from('ai_logs').insert(logEntry).then(({ error }) => {
          if (error) console.warn('[AI] ai_logs insert failed:', error.message);
        });
      }
    }

    return response;
  };
}
