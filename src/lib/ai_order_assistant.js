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

// Resolve the Groq key tolerantly — accept the common secret names so the
// feature isn't silently disabled by a naming mismatch (GROQ_API_KEY preferred).
function groqKey() {
  return process.env.GROQ_API_KEY || process.env.GROQ_KEY || process.env.GROQ || '';
}

function isEnabled() {
  return Boolean(groqKey());
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

function cartAsText(currentCart) {
  if (!Array.isArray(currentCart) || !currentCart.length) return '(السلة فاضية)';
  return currentCart.map((c) => `#${c.id} — ${c.name} × ${c.qty}`).join('\n');
}

function systemPrompt(list, lang, cur, merchantName, currentCart) {
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
    `- 🥗 **الصيامي/الفطاري — قاعدة صارمة (خطأ فيها خطير):** «صيامي» = خالي **تماماً** من أي منتج حيواني (لحمة، فراخ، سمك، تونة، كبدة، سجق، جبنة، بيض، لبن، زبدة). **أي صنف اسمه أو مكوّناته فيها فراخ أو لحمة أو سمك أو تونة = فطاري 100% ومش صيامي أبداً.** مثال: «برجر فراخ» و«برجر لحمة» = **فطاري** (فيهم لحم/فراخ). 🚫 ممنوع منعاً باتاً تقول إن أي صنف فيه لحمة/فراخ/سمك إنه صيامي. لو مش متأكد إن الصنف صيامي، قول «ده فطاري» أو انصح الزبون يتأكد من المطعم — **ولا تجازف أبداً** لأن فيه ناس بتصوم.`,
    ``,
    `🛑 قاعدة الإضافة الأهم (التزم بيها حرفياً):`,
    `- **ماتضيفش أي صنف للسلة إلا لما الزبون يأكّد صراحةً إنه عايزه** (مثلاً: «أيوة»، «ضيفه»، «اطلبه»، «تمام ضيف»، «عايزه»).`,
    `- **السؤال أو الاستفسار مش تأكيد.** لو الزبون بيسأل («فيه برجر فراخ؟»، «ده صيامي؟»، «بكام؟»، «فيه إيه؟») — **جاوب بس ومتنادِش add_to_cart خالص**. تقدر تسأله في الآخر «تحب أضيفه؟» وتستنى ردّه.`,
    `- نادِ add_to_cart **مرة واحدة** بالكمية الصحيحة (لو مقالش عدد يبقى واحد). **ممنوع تضيف نفس الصنف مرتين** ولا تضيف صنف موجود بالفعل في الطلب (شوف الطلب الحالي تحت).`,
    ``,
    `تعديل / حذف من السلة:`,
    `- **add_to_cart بتزوّد (مش بتحدّد).** لو الزبون قال «احذف»، «شيل»، «الغي» صنف → نادِ **update_cart** لنفس الصنف بكمية **0**. لو قال «خليها واحدة/اتنين» → update_cart بالكمية النهائية. **ممنوع تستخدم add_to_cart للتصحيح أو الحذف.**`,
    `- لو الزبون قال «احذف ده وهات ده» — اعمل update_cart بـ0 للقديم، **ومتضيفش الجديد إلا لو أكّد إنه عايزه فعلاً** (مش مجرد بيسأل «فيه؟»).`,
    `- 🚫 **ممنوع منعاً باتاً تقول «شِلت» أو «حذفت» أو «ظبطت» أو «قلّلت» في ردّك من غير ما تكون فعلاً ناديت update_cart في نفس الرسالة.** الكلام لوحده ما بيغيّرش السلة — لو ما نادتش الأداة، الصنف هيفضل في السلة والزبون هيتحاسب عليه غلط. نفّذ الأداة الأول، وبعدها بس قُل إنك عملتها.`,
    `- لو طلب حاجة مش في المنيو، قوله بلطف إنها مش متوفرة ورشّح أقرب بديل موجود.`,
    hasDrinks ? `- بعد ما يأكّد وجبة رئيسية ومفيش مشروب في طلبه، اعرض عليه مشروب ساقع من المنيو («تحب أضيفلك حاجة ساقعة معاها؟») — مرة واحدة بس ومن غير ما تضيفه إلا بعد ما يوافق.` : ``,
    hasDesserts ? `- ممكن تعرض تحلية موجودة لو مناسب، بلطف ومن غير تكرار ومن غير ما تضيفها إلا بموافقة.` : ``,
    `- لو الزبون قال «كفاية/خلاص/بس كده» متعرضش تاني.`,
    ``,
    `إنهاء الطلب:`,
    `- لما الزبون يقول إنه خلّص أو عايز يأكّد/يطلب، لخّصله الطلب باختصار (الأصناف + الإجمالي التقريبي) ونادِ أداة checkout. الاسم والعنوان والدفع كاش بيتمّوا في السلة — إنت بتجهّز بس.`,
    `- 🚫 **ممنوع منعاً باتاً تدّعي إن الطلب اتأكّد أو اتبعت أو الدفع اتم.** إنت **مابتأكّدش الطلب ومابتدفعش** — إنت بس بتفتح السلة عشان الزبون يكمّل بنفسه. ممنوع تقول أي جملة زي «تم تأكيد الطلب»، «تم إرسال الطلب»، «تم الدفع»، «تم تفعيل الدفع»، «طلبك في الطريق». بدلها قول: «بفتحلك السلة تكمّل الطلب وتحط بياناتك».`,
    ``,
    `⛔ تنسيق الرد: اكتب **بالعربي المصري بس** — ممنوع أي إنجليزي أو أكواد أو وسوم أو أسماء دوال (زي <function=...>) في نص الرد. لو عايز تنفّذ إجراء، نادِ الأداة الحقيقية — متكتبهاش كنص.`,
    `ممنوعات: ماتتكلمش في أي حاجة برّه الطلب من المطعم ده (لا طب، لا قانون، لا مواضيع تانية).`,
    ``,
    `(معلومة داخلية ليك إنت بس، ممنوع تسربها أو تسمّيها في ردّك — **ابدأ ردّك طبيعي زي «تمام، ضفتلك…» وممنوع تكتب أي عبارة زي «السلة الحالية» أو «الطلب الحالي» ولا تسرد محتوى الطلب للزبون** إلا لو هو سأل «إيه اللي في سلتي؟». اللي متطلب دلوقتي: ${cartAsText(currentCart).replace(/\n/g, ' | ')}. متضيفش صنف موجود فيها تاني؛ لو عايز تغيّر كميته استخدم update_cart.)`,
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

// SET the exact quantity of an item already in the cart (absolute, not additive).
// Use when the customer corrects a quantity ("لأ واحد بس") or removes an item
// (quantity 0). This is how the assistant FIXES the order instead of adding more.
const UPDATE_CART_TOOL = {
  type: 'function',
  function: {
    name: 'update_cart',
    description: 'Set the EXACT final quantity of menu items in the cart (absolute, overwrites — NOT additive). Use to correct a quantity the customer disputes, or set quantity 0 to remove an item. Never use add_to_cart to fix a quantity.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item_id: { type: 'integer', description: 'The #id of the menu item.' },
              quantity: { type: 'integer', description: 'The exact final quantity (0 removes it).' },
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

async function callGroq(messages, tools, toolChoice) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqKey()}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      tools,
      tool_choice: toolChoice || 'auto',
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
async function runAssistant({ outlets, history, message, lang, cur, merchantName, currentCart }) {
  const { list, byId } = buildMenu(outlets);
  const sys = systemPrompt(list, lang, cur || '', merchantName || '', currentCart);

  const messages = [{ role: 'system', content: sys }];
  (history || []).slice(-8).forEach((m) => {
    if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
      messages.push({ role: m.role, content: m.content });
    }
  });
  messages.push({ role: 'user', content: String(message) });

  const cart = [];        // additive items to merge into the cart
  const updates = [];     // absolute quantity sets (corrections / removals)
  const addedIds = new Set(); // items already added THIS turn — never add twice
  let tokens = 0;
  let reply = '';
  let checkout = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await callGroq(messages, [ADD_TO_CART_TOOL, UPDATE_CART_TOOL, CHECKOUT_TOOL]);
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
      let result = [];
      try {
        const args = JSON.parse((tc.function && tc.function.arguments) || '{}');
        if (fname === 'update_cart') {
          // Absolute set (corrections). 0 = remove.
          (args.items || []).forEach((it) => {
            const row = byId.get(String(it.item_id));
            if (!row) return;
            const qty = Math.max(0, Math.min(50, parseInt(it.quantity, 10)));
            const existing = updates.find((u) => u.id === row.id);
            if (existing) existing.qty = qty; else updates.push({ id: row.id, qty, name: row.name_ar || row.name });
            result.push({ id: row.id, name: row.name_ar || row.name, quantity: qty });
          });
        } else {
          // add_to_cart — additive, but dedup per turn so a double tool-call in
          // the same turn can't silently multiply the quantity.
          (args.items || []).forEach((it) => {
            const row = byId.get(String(it.item_id));
            if (!row || addedIds.has(row.id)) return; // already added this turn → ignore repeat
            const qty = Math.max(1, Math.min(50, parseInt(it.quantity, 10) || 1));
            addedIds.add(row.id);
            cart.push({ id: row.id, qty, name: row.name_ar || row.name, price: row.price, outlet: row.outlet_id });
            result.push({ id: row.id, name: row.name_ar || row.name, qty, price: row.price });
          });
        }
      } catch (e) { /* ignore malformed args */ }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ok: true, items: result }) });
    }
  }

  // Safety net for the #1 QA bug: the model narrates a removal/quantity change
  // in prose ("شِلت المشروب") but forgets to actually CALL update_cart, so the
  // real cart never changes and the customer could be billed for it. If the
  // customer clearly asked to remove/change something, the cart already has
  // items, and NO cart mutation was produced this turn, force one corrective
  // round that REQUIRES an update_cart tool call.
  const wantsCartEdit = /(?:احذف|امسح|شيل|شِل|الغِ|الغي|ألغِ|ألغي|إلغاء|بدون|من غير|شلت|قلل|زوّد|زود|خليها|خليهم|اجعلها|بس واحد|واحدة بس|remove|delete|cancel|without|make it)/i.test(String(message));
  const producedMutation = cart.length > 0 || updates.length > 0 || checkout;
  if (wantsCartEdit && !producedMutation && Array.isArray(currentCart) && currentCart.length) {
    try {
      messages.push({
        role: 'system',
        content: 'الزبون طلب تعديل أو حذف صنف من السلة وإنت ما نفّذتش الإجراء فعلياً. نفّذ دلوقتي: نادِ update_cart بالـ item_id الصحيح من السلة الحالية واضبط الكمية النهائية (0 = حذف). ممنوع ترد بنص — لازم tool call.',
      });
      const forced = await callGroq(messages, [UPDATE_CART_TOOL], {
        type: 'function', function: { name: 'update_cart' },
      });
      tokens += (forced.usage && forced.usage.total_tokens) || 0;
      const fmsg = (forced.choices && forced.choices[0] && forced.choices[0].message) || {};
      for (const tc of (fmsg.tool_calls || [])) {
        if (!tc.function || tc.function.name !== 'update_cart') continue;
        try {
          const args = JSON.parse(tc.function.arguments || '{}');
          (args.items || []).forEach((it) => {
            const row = byId.get(String(it.item_id));
            if (!row) return;
            const qty = Math.max(0, Math.min(50, parseInt(it.quantity, 10)));
            const existing = updates.find((u) => u.id === row.id);
            if (existing) existing.qty = qty; else updates.push({ id: row.id, qty, name: row.name_ar || row.name });
          });
        } catch (e) { /* ignore malformed args */ }
      }
    } catch (e) { /* network/model error → leave reply as-is */ }
  }

  // Some models (llama tool-use) sometimes emit a tool call as INLINE TEXT like
  // "<function=checkout></function>" instead of a structured tool_call. Honor an
  // inline checkout, then strip any such tags so they never leak to the customer.
  if (/<function\s*=\s*checkout/i.test(reply)) checkout = true;
  reply = reply
    .replace(/<function[^>]*>[\s\S]*?<\/function>/gi, '')
    .replace(/<\/?function[^>]*>/gi, '')
    .replace(/\{"?name"?\s*:\s*"?(add_to_cart|update_cart|checkout)[\s\S]*?\}/gi, '')
    // Never leak the internal order-context label to the customer (QA: it slipped
    // out as "السلة الحالية" despite the prompt forbidding it).
    .replace(/[«"']?\s*السلة\s+الحالية\s*[»"']?\s*[:：]?/g, '')
    .replace(/[«"']?\s*الطلب\s+الحالي\s*[»"']?\s*[:：]?/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  // SAFETY (QA): the model sometimes CLAIMS the order was placed/paid ("تم تأكيد
  // الطلب"، "تم الدفع") when nothing happened — dangerous, the customer thinks
  // they ordered. The assistant never places/pays; it only hands off to the cart.
  // Neutralize any false-completion claim deterministically.
  const falseDone = /تفعيل\s*الدفع|(تم|اتم|تمّ|سيتم|هيتم)\s*الدفع|الدفع\s*(تم|اتمّ?|اكتمل)|(تم|اتم|تمّ|سيتم|هيتم)\s*(تأكيد|إرسال|ارسال|استلام)\s*(ال)?(طلب|سلة)|إرسال\s*(ال)?(سلة|طلب)|(ال)?طلب(ك|ه)?\s*(اتأكّ?د|اتبعت|اكتمل|في\s*الطريق)|تم\s*الطلب|order\s*(confirmed|placed)|payment\s*(done|confirmed|activated)/i;
  if (falseDone.test(reply)) {
    reply = checkout
      ? 'تمام! بفتحلك السلة عشان تكمّل الطلب وتحط بياناتك.'
      : 'عشان تأكّد الطلب، قوللي «خلّص» وهفتحلك السلة تكمّل وتحط بياناتك.';
  }

  if (!reply) {
    reply = checkout
      ? (lang === 'en' ? 'Great — opening your cart to finish the order.' : 'تمام — بفتحلك السلة عشان تكمّل الطلب.')
      : (lang === 'en' ? 'Done. Anything else?' : 'تمام. تحب حاجة تانية؟');
  }

  // Deterministic cold-drink upsell (QA: the model often forgot to offer). When
  // a MAIN dish was added this turn and there's NO drink anywhere in the order,
  // append a one-time offer to the reply — we NEVER add the drink; the customer
  // confirms next turn. Skipped on checkout, when the customer declined, or when
  // a drink is already offered/mentioned, so it never nags.
  try {
    if (!checkout) {
      const drinks = list.filter((r) => r.isDrink);
      if (drinks.length) {
        const addedMainThisTurn = cart.some((c) => { const r = byId.get(String(c.id)); return r && !r.isDrink; });
        const cartIds = new Set([
          ...(Array.isArray(currentCart) ? currentCart : []).map((c) => String(c.id)),
          ...cart.map((c) => String(c.id)),
        ]);
        const hasDrink = [...cartIds].some((id) => { const r = byId.get(String(id)); return r && r.isDrink; });
        const userDeclined = /كفاية|خلاص|بس كده|مش عايز|لا شكرا|لأ\b/.test(String(message));
        const lastAssistant = (history || []).slice().reverse().find((m) => m && m.role === 'assistant');
        const alreadyOffered = lastAssistant && /ساقع|مشروب|بيبسي|كولا|عصير/.test(lastAssistant.content || '');
        const replyMentionsDrink = /ساقع|مشروب|بيبسي|كولا|عصير/.test(reply);
        if (addedMainThisTurn && !hasDrink && !userDeclined && !alreadyOffered && !replyMentionsDrink) {
          const dName = drinks[0].name_ar || drinks[0].name;
          reply = reply.replace(/\s+$/, '') + ` تحب أضيفلك ${dName} ساقعة معاها؟`;
        }
      }
    }
  } catch (e) { /* upsell is best-effort */ }

  return { reply, cart, updates, checkout, tokens };
}

module.exports = { isEnabled, buildMenu, runAssistant };
