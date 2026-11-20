// «أوسكار مش فاهم» ⇒ ذكاء اصطناعى (المالك ٢٠٢٦-١١-٢٠: «لازم ذكاء اصطناعى لما الكلام يبقى غير مطابق لأى أمر»).
// برنامج التعرّف بيكتب الكلام غلط («يا اوس سجل مطعمنا» = «يا أوسكار سجّل مطب هنا»)، والقواعد الثابتة مش هتغطّى كل غلطة.
// لما القواعد ماتفهمش: النص بس (من غير مكان ولا أى بيانات تانية) بيروح لـGroq (نفس مفتاح GROQ_API_KEY المستخدم فى الموقع)
// ويرجع أمر واحد من قايمة ثابتة. الأمر بيتنفّذ بنفس الطريق العادى (والاتصال/الطوارئ بتأكيد زى ما هو). مفيش مفتاح ⇒ null.
'use strict';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_INTENT_MODEL || 'llama-3.1-8b-instant';
const key = () => process.env.GROQ_API_KEY || process.env.GROQ_KEY || process.env.GROQ || '';

const CMDS = ['bump', 'bump1', 'pothole', 'pothole1', 'radar', 'danger', 'shot', 'park', 'findpark', 'fuel', 'fuel_list', 'near',
  'goto', 'call', 'placecall', 'fuelleft', 'maint', 'speed', 'odo', 'unknown'];
const NEAR = ['fuel', 'pharmacy', 'hospital', 'atm', 'bank', 'church', 'mosque', 'restaurant', 'cafe', 'market', 'mechanic', 'tires', 'wash',
  'police', 'parking', 'hotel'];

const SYSTEM = `You understand voice commands for "Oscar", a driving assistant in Egypt. The text comes from speech recognition and often has
mistakes (Egyptian Arabic or English, sometimes mixed; the wake word "يا أوسكار" may be misheard as "يا اوس", "يا أذكر", "يا اسكار").
Pick exactly ONE command:
bump = record a speed bump here (مطب) · bump1 = one-way speed bump (مطب اتجاه واحد) · pothole = pothole (حفرة/جورة/نقرة) ·
pothole1 = one-way pothole · radar = speed camera · danger = dangerous spot · shot = take a road photo (صوّر الطريق/اسكرين شوت) ·
park = I parked here · findpark = where is my car · fuel = go to the nearest gas station · fuel_list = show gas stations ·
near = go to the nearest place of a kind (arg = one of: ${NEAR.join(', ')}) · goto = navigate to a place (arg = the place name as said) ·
call = phone a contact (arg = the contact name exactly as heard, without the word اتصل/كلم; how = "wa" if WhatsApp is asked, else null) ·
placecall = call the place we just found · fuelleft = how much fuel is left · maint = next oil change/service · speed = my speed ·
odo = odometer · unknown = anything else, small talk, or not a command.
For call: if the contact name is an English word or name written in Arabic letters (for example "ماذر موبايل"), also give latin = its
English spelling ("Mother mobile"), else latin = null.
Reply with JSON only: {"cmd": string, "arg": string|null, "how": "wa"|null, "latin": string|null}`;

const clean = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

/** النص ⇒ { cmd, arg, how, latin } أو null (مفيش مفتاح / غلط / مش أمر). */
async function understand(text, opts = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const k = opts.key !== undefined ? opts.key : key();
  if (!t || !k) return null;
  const doFetch = opts.fetch || fetch;
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), opts.timeoutMs || 6000);
  try {
    const r = await doFetch(GROQ_URL, {
      method: 'POST', signal: ctl.signal,
      headers: { authorization: 'Bearer ' + k, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 80, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: t }] }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return parse(j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content);
  } catch (e) { return null; } finally { clearTimeout(tm); }
}

/** رد الموديل ⇒ أمر سليم من القايمة بس (أى حاجة تانية = null). */
function parse(content) {
  let o;
  try { o = typeof content === 'string' ? JSON.parse(content) : content; } catch (e) { return null; }
  if (!o || !CMDS.includes(o.cmd) || o.cmd === 'unknown') return null;
  const out = { cmd: o.cmd, arg: clean(o.arg, 60), how: o.how === 'wa' ? 'wa' : null, latin: clean(o.latin, 60) };
  if (out.cmd === 'near' && !NEAR.includes(out.arg)) return null;
  if ((out.cmd === 'goto' || out.cmd === 'call') && !out.arg) return null;
  return out;
}

module.exports = { understand, parse, CMDS, NEAR, available: () => !!key() };
