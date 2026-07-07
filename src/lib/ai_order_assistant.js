// AI order assistant — powered by Groq (OpenAI-compatible chat API).
//
// The customer types naturally ("عايز 2 برجر وعصير" / "2 burgers and a juice")
// and the model maps that onto THIS merchant's menu only, decides quantities,
// and calls the `add_to_cart` tool. The server validates every item id against
// the menu before trusting it, so the model can never invent products or prices.
//
// Groq is used instead of Anthropic because it is cheaper / has a more generous
// free tier (owner's decision). It speaks the OpenAI chat-completions dialect,
// so we call it with the global fetch (Node 18+) — no SDK dependency.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const MAX_TOOL_ROUNDS = 3;

function isEnabled() {
  return Boolean(process.env.GROQ_API_KEY);
}

// Flatten the merchant's outlets → a lookup of available items the model may use.
// Returns { list: [{id,name,name_ar,price,outlet_id,outlet,category}], byId: Map }.
function buildMenu(outlets) {
  const list = [];
  const byId = new Map();
  (outlets || []).forEach((o) => {
    const outletName = o.name_ar || o.name || '';
    const cats = {};
    (o.categories || []).forEach((c) => { cats[c.id] = c.name_ar || c.name || ''; });
    (o.items || []).forEach((it) => {
      if (it.is_available === false) return;
      const row = {
        id: it.id,
        name: it.name || '',
        name_ar: it.name_ar || '',
        price: Number(it.price) || 0,
        outlet_id: o.id,
        outlet: outletName,
        category: cats[it.category_id] || '',
      };
      list.push(row);
      byId.set(String(it.id), row);
    });
  });
  return { list, byId };
}

function menuAsText(list, cur) {
  return list.map((r) => {
    const names = [r.name_ar, r.name].filter(Boolean).join(' / ');
    const cat = r.category ? ` [${r.category}]` : '';
    return `#${r.id} — ${names}${cat} — ${r.price} ${cur}`;
  }).join('\n');
}

function systemPrompt(list, lang, cur, merchantName) {
  const menu = menuAsText(list, cur);
  return [
    `You are the ordering assistant for "${merchantName}", a food/grocery shop.`,
    `Your ONLY job is to help the customer build a cart from the menu below.`,
    ``,
    `STRICT RULES:`,
    `- You may ONLY reference items that appear in the MENU list. Never invent items, prices, or availability.`,
    `- When the customer decides on items, call the add_to_cart tool with the exact item ids and quantities.`,
    `- If a request has no matching item, say so briefly and suggest the closest available items by name.`,
    `- Do not discuss anything unrelated to ordering from this menu. No medical, legal, or off-topic advice.`,
    `- Prices and currency are fixed by the menu; never quote a different price.`,
    `- Reply in the SAME language the customer used (Arabic or English). Keep replies short and friendly.`,
    `- The customer still confirms and pays cash on delivery in the cart; you only prepare it.`,
    ``,
    `MENU (currency: ${cur}):`,
    menu || '(empty)',
  ].join('\n');
}

const ADD_TO_CART_TOOL = {
  type: 'function',
  function: {
    name: 'add_to_cart',
    description: 'Add one or more menu items to the customer cart. Only use item ids from the provided menu.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Items to add to the cart.',
          items: {
            type: 'object',
            properties: {
              item_id: { type: 'integer', description: 'The #id of the menu item.' },
              quantity: { type: 'integer', description: 'How many, at least 1.' },
            },
            required: ['item_id', 'quantity'],
          },
        },
      },
      required: ['items'],
    },
  },
};

async function callGroq(messages, tools) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens: 700,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Groq ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Run one assistant turn. `history` is prior [{role,content}] (user/assistant
// text only). Returns { reply, cart:[{id,qty,name,price}], tokens }.
async function runAssistant({ outlets, history, message, lang, cur, merchantName }) {
  const { list, byId } = buildMenu(outlets);
  const sys = systemPrompt(list, lang, cur || '', merchantName || '');

  const messages = [{ role: 'system', content: sys }];
  (history || []).slice(-8).forEach((m) => {
    if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
      messages.push({ role: m.role, content: m.content });
    }
  });
  messages.push({ role: 'user', content: String(message) });

  const cart = [];
  let tokens = 0;
  let reply = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await callGroq(messages, [ADD_TO_CART_TOOL]);
    tokens += (data.usage && data.usage.total_tokens) || 0;
    const choice = (data.choices && data.choices[0]) || {};
    const msg = choice.message || {};
    const toolCalls = msg.tool_calls || [];

    if (!toolCalls.length) {
      reply = (msg.content || '').trim();
      break;
    }

    // Record the assistant tool-call turn, then answer each call.
    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let added = [];
      try {
        const args = JSON.parse((tc.function && tc.function.arguments) || '{}');
        (args.items || []).forEach((it) => {
          const row = byId.get(String(it.item_id));
          const qty = Math.max(1, Math.min(50, parseInt(it.quantity, 10) || 1));
          if (!row) return;
          const existing = cart.find((c) => c.id === row.id);
          if (existing) existing.qty += qty;
          else cart.push({ id: row.id, qty, name: row.name_ar || row.name, price: row.price, outlet: row.outlet_id });
          added.push({ id: row.id, name: row.name_ar || row.name, qty, price: row.price });
        });
      } catch (e) { /* ignore malformed args */ }
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify({ ok: true, added }),
      });
    }
  }

  if (!reply) {
    reply = lang === 'en'
      ? 'I added those to your cart. Anything else?'
      : 'ضفتهم لسلتك. تحب تضيف حاجة تانية؟';
  }
  return { reply, cart, tokens };
}

module.exports = { isEnabled, runAssistant, buildMenu, DEFAULT_MODEL };
