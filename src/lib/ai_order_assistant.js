// AI order assistant — a natural, human-like restaurant RECEPTIONIST that takes
// orders inside the storefront (not WhatsApp). Powered by Groq (OpenAI-compatible
// chat API — cheaper / generous free tier, owner's decision).
//
// It behaves like a real front-desk employee: greets warmly, knows every dish on
// THIS merchant's menu, infers likely ingredients from the dish name when the
// owner didn't write a description, knows the exact prices, upsells naturally
// ("تحب أضيفلك حاجة ساقعة معاها؟"), and when the customer is done it hands the
// built cart over to checkout — all grounded strictly in the real menu.
//
// Groq speaks the OpenAI chat-completions dialect, so we call it with global
// fetch (Node 18+) — no SDK dependency.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// A strong, tool-capable, Arabic-fluent default. Override with GROQ_MODEL.
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const MAX_TOOL_ROUNDS = 4;

function isEnabled() {
  return Boolean(process.env.GROQ_API_KEY);
}

// Words that mark a category/item as a drink / dessert / side — used to steer
// upsell suggestions ("something cold with that?").
const DRINK_HINTS = ['مشروب', 'عصير', 'كولا', 'بيبسي', 'مياه', 'ساقع', 'ساقعة', 'صودا', 'شاي', 'قهوة', 'drink', 'juice', 'soda', 'cola', 'water', 'beverage', 'coffee', 'tea'];
const DESSERT_HINTS = ['حلو', 'تحلية', 'حلويات', 'كيك', 'ايس كريم', 'آيس', 'dessert', 'cake', 'ice cream', 'sweet'];

function matchesHints(text, hints) {
  const t = String(text || '').toLowerCase();
  return hints.some((h) => t.includes(h));
}

// Flatten the merchant's outlets → a lookup of available items the model may use.
function buildMenu(outlets) {
  const list = [];
  const byId = new Map();
  (outlets || []).forEach((o) => {
    const outletName = o.name_ar || o.name || '';
    const cats = {};
    (o.categories || []).forEach((c) => { cats[c.id] = c.name_ar || c.name || ''; });
    (o.items || []).forEach((it) => {
      if (it.is_available === false) return;
      const category = cats[it.category_id] || '';
      const nameBlob = [it.name, it.name_ar, category].join(' ');
      const row = {
        id: it.id,
        name: it.name || '',
        name_ar: it.name_ar || '',
        price: Number(it.price) || 0,
        description: (it.description || '').trim(),
        outlet_id: o.id,
        outlet: outletName,
        category,
        isDrink: matchesHints(nameBlob, DRINK_HINTS),
        isDessert: matchesHints(nameBlob, DESSERT_HINTS),
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
    const desc = r.description ? ` — ${r.description}` : '';
    return `#${r.id} — ${names}${cat} — ${r.price} ${cur}${desc}`;
  }).join('\n');
}

function systemPrompt(list, lang, cur, merchantName) {
  const menu = menuAsText(list, cur);
  const hasDrinks = list.some((r) => r.isDrink);
  const hasDesserts = list.some((r) => r.isDessert);
  return [
    `أنت موظف استقبال الطلبات في مطعم "${merchantName}". اسمك مش مهم — المهم إنك بتتكلم زي موظف بشري حقيقي، ودود ومحترف وسريع.`,
    `بتساعد الزبون يطلب أكله من المنيو اللي تحت، وتبني له السلة، وفي الآخر تساعده يكمّل الطلب.`,
    ``,
    `أسلوبك (مهم جداً):`,
    `- اتكلم باللهجة المصرية الطبيعية الدافئة زي موظف استقبال شاطر (مثال: «أهلاً بيك! تحب تطلب إيه النهاردة؟»).`,
    `- ردود قصيرة وطبيعية، من غير رسمية زايدة ومن غير قوائم طويلة. سؤال واحد في المرة.`,
    `- افهم الطلب حتى لو مكتوب بشكل عامي أو فيه أخطاء، ورشّح أقرب صنف من المنيو.`,
    ``,
    `معرفتك بالأكل:`,
    `- إنت عارف كل أصناف المنيو وأسعارها بالظبط (السعر ثابت زي ما مكتوب — ممنوع تغيّره أو تخترع سعر).`,
    `- لو الزبون سأل عن مكوّنات صنف وفيه وصف مكتوب، استخدمه.`,
    `- لو مفيش وصف مكتوب، تقدر تتوقّع المكوّنات الشائعة من اسم الصنف وتقولها كـ«غالباً بيكون فيه…» — ووضّح إنها توقّع، ولو حابب يتأكد من مكوّن معيّن (خصوصاً حساسية) يسأل المطعم. ممنوع تجزم بمكوّن مش متأكد منه أو تخترع معلومة تحسّس.`,
    ``,
    `بناء الطلب:`,
    `- لما الزبون يقرّر أصناف، نادِ أداة add_to_cart بالـids والكميات الصحيحة من المنيو بس.`,
    `- لو طلب حاجة مش في المنيو، قوله بلطف إنها مش متوفرة ورشّح أقرب بديل موجود.`,
    hasDrinks ? `- بعد ما يضيف وجبة رئيسية ومفيش مشروب في طلبه، اعرض عليه بشكل طبيعي مشروب ساقع من المنيو («تحب أضيفلك حاجة ساقعة معاها؟»). مرة واحدة بس، ومن غير إلحاح.` : ``,
    hasDesserts ? `- ممكن كمان تعرض تحلية موجودة في المنيو لو مناسب، بلطف ومن غير تكرار.` : ``,
    `- لو الزبون قال «كفاية/خلاص/بس كده» متعرضش تاني.`,
    ``,
    `إنهاء الطلب:`,
    `- لما الزبون يقول إنه خلّص أو عايز يأكّد/يطلب، لخّصله الطلب باختصار (الأصناف + الإجمالي التقريبي) ونادِ أداة checkout عشان ننقله لإتمام الطلب (الاسم والعنوان والدفع بيتمّوا في السلة).`,
    `- الدفع كاش عند الاستلام من خلال السلة — إنت بتجهّز الطلب بس.`,
    ``,
    `ممنوعات: ماتتكلمش في أي حاجة برّه الطلب من المطعم ده (لا طب، لا قانون، لا مواضيع تانية). اردّ بنفس لغة الزبون (عربي أو إنجليزي).`,
    ``,
    `المنيو (العملة: ${cur}):`,
    menu || '(المنيو فاضي حالياً)',
  ].filter(Boolean).join('\n');
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

const CHECKOUT_TOOL = {
  type: 'function',
  function: {
    name: 'checkout',
    description: 'Call this ONLY when the customer has finished choosing and explicitly wants to place/confirm the order. Signals the storefront to open the cart for name/address/payment.',
    parameters: { type: 'object', properties: {}, required: [] },
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
      temperature: 0.5,
      max_tokens: 800,
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
// text only). Returns { reply, cart:[{id,qty,name,price}], checkout, tokens }.
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
  let checkout = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await callGroq(messages, [ADD_TO_CART_TOOL, CHECKOUT_TOOL]);
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
      const fname = (tc.function && tc.function.name) || '';
      if (fname === 'checkout') {
        checkout = true;
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ok: true, checkout: true }) });
        continue;
      }
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
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ok: true, added }) });
    }
  }

  if (!reply) {
    reply = checkout
      ? (lang === 'en' ? 'Great — opening your cart to finish the order.' : 'تمام — بفتحلك السلة عشان تكمّل الطلب.')
      : (lang === 'en' ? 'Added to your cart. Anything else?' : 'ضفتهم لسلتك. تحب حاجة تانية؟');
  }
  return { reply, cart, checkout, tokens };
}

module.exports = { isEnabled, buildMenu, runAssistant };
