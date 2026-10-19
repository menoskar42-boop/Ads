/**
 * بيانات المجموعة اللى بتطلع لأى حد معاه كود المجموعة (الكود فى لينك الدعوة المنشور).
 *
 * ⛔ الغلط اللى الملف ده اتعمل عشانه: `GET /api/groups/:code` كان بيبعت للكل **رقم موبايل
 * كل عضو ومفتاحه، ومفتاح القائد** — والمفتاح هو نفسه صلاحية الأدمن (`isAdminByLeaderKey`).
 * يعنى أى حد معاه اللينك ياخد أرقام الـ٧٠٠ عضو ويبقى أدمن.
 *
 * دلوقتى: مفيش مفتاح لحد، والأرقام للأدمن بس (زرار «تسجيل الاسم والموبايل»)، واللى بيسأل
 * بياخد بياناته هو فى `me` — عرفناه من مفتاحه فى هيدر `X-Member-Key`.
 * دوال خالصة عشان الحارس `check-mybible-group-privacy` ينفّذها فعلاً.
 */

/** المجموعة من غير مفتاح القائد — لأى رد بيروح لحد مش هو القائد. */
export function publicGroup<T extends { leaderKey?: unknown }>(group: T): Omit<T, 'leaderKey'> {
  const { leaderKey: _k, ...g } = group;
  return g;
}

/** نسخة الرد للى بيسأل بمفتاحه `key` (فاضى = زائر). مابتعدّلش الكاش المشترك. */
export function groupViewFor(payload: { group: any; members: any[]; [k: string]: any }, key: string) {
  const leaderKey = payload.group?.leaderKey;
  const meRow = key ? payload.members.find((m) => m.memberKey === key) : null;
  const isLeader = !!key && leaderKey === key;
  const admin = isLeader || meRow?.isAdmin === true;
  const members = payload.members.map(({ memberKey: _k, phone, ...m }) => (admin ? { ...m, phone } : m));
  const me = meRow
    ? { id: meRow.id, userName: meRow.userName, isAdmin: meRow.isAdmin === true, isMuted: meRow.isMuted === true, phone: meRow.phone || null }
    : null;
  return { ...payload, group: publicGroup(payload.group), members, me, isLeader };
}
