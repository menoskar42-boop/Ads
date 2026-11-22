/**
 * رسائل الشات في الذاكرة — القاعدة بتتقري مرة واحدة لكل مجموعة، مش كل ٨ ثواني.
 *
 * كل عضو فاتح الشات بيسأل كل ٨ ثواني. قبل كده كل سؤال (أو كل ٨ ثواني للمجموعة
 * بعد التجميع) كان استعلام على Supabase بآخر ١٠٠ رسالة + صف المجموعة كامل.
 * دلوقتي:
 *   - آخر ١٠٠ رسالة بتتحمّل مرة، وبعدها كل كتابة (إرسال/حذف/تفاعل/تثبيت) بتتكتب
 *     في القاعدة **وفي الذاكرة** في نفس اللحظة (write-through).
 *   - أي تغيير مش متغطّي هنا (كتم عضو، تغيير اسم) بيمسح نسخة المجموعة، فتتحمّل
 *     تاني من القاعدة في السؤال الجاي.
 *   - وكل `RELOAD_MS` النسخة بتتحمّل من جديد احتياطي.
 *
 * العملية واحدة (Reserved VM)، فمفيش حد تاني بيكتب في نفس الرسائل من ورانا.
 */

export interface ChatMsg {
  id: number;
  userName: string;
  message: string;
  imageUrl: string | null;
  reactions: unknown;
  isPinned: boolean | null;
  [k: string]: unknown;
}

const RELOAD_MS = 15 * 60_000;
const CODE_TTL_MS = 10 * 60_000;
const MAX_GROUPS = 300;
export const CHAT_WINDOW = 100;

interface Entry { at: number; msgs?: ChatMsg[]; loading?: Promise<ChatMsg[]> }
const chats = new Map<number, Entry>();
const codes = new Map<string, { id: number; at: number }>();

function trim<K, V>(m: Map<K, V>) {
  while (m.size > MAX_GROUPS) {
    const oldest = m.keys().next();
    if (oldest.done) return;
    m.delete(oldest.value);
  }
}

/** رقم المجموعة من الكود — من غير ما صف المجموعة كله يتقري مع كل سؤال. null = مش موجودة. */
export async function groupIdByCode(code: string, load: () => Promise<number | null>): Promise<number | null> {
  const key = code.toUpperCase();
  const hit = codes.get(key);
  if (hit && Date.now() - hit.at < CODE_TTL_MS) return hit.id;
  const id = await load();
  if (id) {
    codes.set(key, { id, at: Date.now() });
    trim(codes);
  } else {
    codes.delete(key);
  }
  return id;
}

/** بعد حذف مجموعة/كنيسة — الكود مايفضلش بيشاور على مجموعة اتمسحت. */
export function forgetGroupCodes(): void {
  codes.clear();
}

/** آخر ١٠٠ رسالة (الأقدم الأول). */
export function getChat(groupId: number, load: () => Promise<ChatMsg[]>): Promise<ChatMsg[]> {
  const e = chats.get(groupId);
  if (e?.loading) return e.loading;
  if (e?.msgs && Date.now() - e.at < RELOAD_MS) return Promise.resolve(e.msgs);
  const entry: Entry = { at: Date.now() };
  const loading = load().then(
    (msgs) => {
      // لو حد مسح النسخة وقت التحميل، التحميل ده بقى قديم — مايتحفظش
      if (chats.get(groupId) === entry) {
        entry.msgs = msgs;
        entry.loading = undefined;
        entry.at = Date.now();
      }
      return msgs;
    },
    (err) => {
      if (chats.get(groupId) === entry) chats.delete(groupId);
      throw err;
    },
  );
  entry.loading = loading;
  chats.set(groupId, entry);
  trim(chats);
  return loading;
}

/** النسخة اللي في الذاكرة لو جاهزة (من غير تحميل). */
export function loadedChat(groupId: number): ChatMsg[] | undefined {
  const e = chats.get(groupId);
  return e && !e.loading && e.msgs && Date.now() - e.at < RELOAD_MS ? e.msgs : undefined;
}

function edit(groupId: number, fn: (msgs: ChatMsg[]) => ChatMsg[]): void {
  const e = chats.get(groupId);
  if (!e) return;
  // تعديل وقت التحميل: أسهل وأضمن نمسح ونحمّل تاني
  if (e.loading || !e.msgs) { chats.delete(groupId); return; }
  e.msgs = fn(e.msgs);
}

export function chatAppend(groupId: number, msg: ChatMsg): void {
  edit(groupId, (msgs) => [...msgs.filter((m) => m.id !== msg.id), msg].slice(-CHAT_WINDOW));
}
export function chatRemove(groupId: number, id: number): void {
  edit(groupId, (msgs) => msgs.filter((m) => m.id !== id));
}
export function chatPatch(groupId: number, id: number, patch: Partial<ChatMsg>): void {
  edit(groupId, (msgs) => msgs.map((m) => (m.id === id ? { ...m, ...patch } : m)));
}
/** أي تغيير مش متغطّي (كتم، تغيير اسم): السؤال الجاي يحمّل من القاعدة. */
export function chatDrop(groupId: number): void {
  chats.delete(groupId);
}
