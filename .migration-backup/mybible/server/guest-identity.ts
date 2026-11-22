/**
 * هوية الضيف: إمتى يحق لضيف ياخد حساب عضو موجود.
 *
 * الغلط اللي الملف ده اتعمل عشانه: `guest-register` كان لما يلاقي عضو
 * بنفس الاسم **بيسلّم الضيف مفتاح العضو ده على طول** — `memberKey`
 * و`isAdmin` بتوعه — من غير أي تحقّق. و`memberKey` هو نفسه صلاحية
 * الأدمن في `isAdminByLeaderKey`. يعني أي حد معاه لينك المجموعة يكتب
 * اسم القائد ويطلع أدمن: يمسح أعضاء، يرقّي، يمسح رسايل، يغيّر إعدادات.
 * الحاجة الوحيدة اللي كانت بتحميه إنه يعرف الاسم حرف بحرف — ودي مش
 * حماية، الأسامي معروضة لأي حد معاه اللينك أصلاً.
 *
 * الشرط دلوقتي: **التليفون لازم يطابق التليفون المسجّل مع الاسم**.
 * ولو العضو القديم مالوش تليفون مسجّل، مفيش طريقة نتحقّق بيها —
 * فالدمج **بيترفض** ويتحوّل لقائد المجموعة. الإعداد الناقص مايفتحش باب.
 *
 * الدوال هنا خالصة (مفيش قاعدة بيانات) عشان الحارس
 * `check-guest-merge-phone` يقدر ينفّذها فعلاً بدل ما يدوّر على نص.
 */

/**
 * توحيد شكل رقم الموبايل المصري عشان المقارنة.
 * بيشيل المسافات والشرط وكود الدولة، ويرجّع الشكل المحلي (٠١…).
 * الأرقام اللي مش على الشكل المصري بترجع بأرقامها زي ما هي — بنقارن
 * ولا نخمّن.
 */
export function normalizePhone(raw?: string | null): string {
  const digits = String(raw ?? '')
    // الأرقام العربية-الهندية زي ما بتتكتب من كيبورد الموبايل
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\D/g, '');

  if (!digits) return '';
  // 00201XXXXXXXXX
  if (digits.length === 14 && digits.startsWith('0020')) return '0' + digits.slice(4);
  // 201XXXXXXXXX
  if (digits.length === 12 && digits.startsWith('20')) return '0' + digits.slice(2);
  // 1XXXXXXXXX (من غير الصفر)
  if (digits.length === 10 && digits.startsWith('1')) return '0' + digits;
  return digits;
}

/**
 * مفتاح مقارنة الأسامى: «ميري سامي» و«ميرى  سامي » و«ميري سامي» بحرف مخفى = نفس الاسم.
 * (حالة حقيقية ٢٠٢٦-١٠-٢٠: عضوة سجّلت اسمها على حساب جديد وطلع اسمين «ميري سامي» —
 * الفرق مش باين للعين، والمقارنة بالحرف عدّته.) للمقارنة بس — الاسم بيتحفظ زى ما اتكتب.
 */
export function nameKey(raw?: string | null): string {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u0640]/g, '') // حروف مخفية + تطويل
    .replace(/[\u064B-\u0652\u0670]/g, '')                                      // تشكيل
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

export type MergeRefusal =
  | 'phone-missing'      // الضيف ما كتبش تليفون
  | 'no-phone-on-file'   // العضو القديم مالوش تليفون مسجّل — مفيش حاجة نطابق عليها
  | 'phone-mismatch'     // كتب تليفون غير المسجّل
  | 'guest-number';      // «عضو N» مابيرجعش بالاسم — بالرسالة على الجروب بس («أنا عضو N»)

export type MergeDecision =
  | { ok: true }
  | { ok: false; reason: MergeRefusal; message: string };

/**
 * هل الضيف ده يستاهل ياخد حساب `existing`؟
 * بيرجّع `ok: true` **في حالة واحدة بس**: تليفون مكتوب، وتليفون مسجّل
 * مع العضو، والاتنين بيطابقوا بعد التوحيد.
 */
export function canMergeGuest(
  existing: { phone?: string | null },
  submittedPhone?: string | null,
): MergeDecision {
  const given = normalizePhone(submittedPhone);
  if (!given) {
    return {
      ok: false,
      reason: 'phone-missing',
      message: 'الاسم ده مسجّل قبل كده. اكتب رقم الموبايل المسجّل معاه عشان نتأكد إنه حسابك.',
    };
  }

  const onFile = normalizePhone(existing.phone);
  if (!onFile) {
    return {
      ok: false,
      reason: 'no-phone-on-file',
      message: 'الاسم ده مسجّل قبل كده ومفيش رقم موبايل متسجّل معاه، '
        + 'فمش قادرين نتأكد إنه حسابك. كلّم قائد المجموعة أو اكتب اسم تاني.',
    };
  }

  if (onFile !== given) {
    return {
      ok: false,
      reason: 'phone-mismatch',
      message: 'الرقم ده مش مطابق للرقم المسجّل مع الاسم ده. '
        + 'راجع الرقم أو كلّم قائد المجموعة.',
    };
  }

  return { ok: true };
}

export type AdminProfileDecision =
  | { ok: true; userName: string; phone: string }
  | { ok: false; message: string };

/**
 * الأدمن بيسجّل الاسم والموبايل لعضو (المالك ٢٠٢٦-١٠-١٩) — «بالظبط كأن العضو سجّلهم بنفسه».
 * بعدها العضو لو غيّر موبايله يرجع لحسابه بالاسم والرقم (`canMergeGuest` فوق).
 *
 * الشرطين اللي بيمنعوا دمج شخصين: الاسم والرقم مايكونوش متسجّلين لعضو **تاني**
 * في نفس المجموعة. الدمج المقصود له زرار لوحده («تعديل / تصحيح الاسم»).
 */
export function checkAdminProfile(
  members: { id: number; userName: string; phone?: string | null }[],
  targetId: number,
  rawName?: string | null,
  rawPhone?: string | null,
): AdminProfileDecision {
  const userName = String(rawName ?? '').trim().replace(/\s+/g, ' ');
  if (!userName) return { ok: false, message: 'اكتب اسم العضو' };
  if (userName.length > 60) return { ok: false, message: 'الاسم طويل — ٦٠ حرف بالكتير' };
  if (isSystemName(userName)) return { ok: false, message: 'الاسم ده محجوز للنظام' };
  const phone = normalizePhone(rawPhone);
  if (phone.length < 10) return { ok: false, message: 'رقم الموبايل غير صحيح' };

  const others = members.filter((m) => m.id !== targetId);
  if (others.some((m) => nameKey(m.userName) === nameKey(userName))) {
    return { ok: false, message: 'الاسم ده مسجّل لعضو تاني. لو هو نفس الشخص استخدم «تعديل / تصحيح الاسم» عشان تدمجهم' };
  }
  if (others.some((m) => normalizePhone(m.phone) === phone)) {
    return { ok: false, message: 'الرقم ده مسجّل لعضو تاني في المجموعة' };
  }
  return { ok: true, userName, phone };
}

/**
 * الانضمام برابط الدعوة/بالكود باسم عضو موجود (المالك ٢٠٢٦-١٠-١٩: «مش عاوز غلط يأثر على قراءات
 * الأعضاء»): العضو العادى اللى **مالوش رقم متسجّل** بيرجع لحسابه بالاسم زى الأول (ورقمه
 * بيتسجّل) — عشان مايتعملّوش حساب جديد وقراياته تتقسم. الأدمن، أو أى عضو ليه رقم متسجّل،
 * لازم الرقم يطابق — كان أى حد يكتب اسم الأدمن بأى رقم ياخد صلاحيته.
 */
export function canRejoinByName(
  existing: { userName?: string | null; phone?: string | null; isAdmin?: boolean | null },
  submittedPhone?: string | null,
): MergeDecision & { setPhone?: boolean } {
  /* المالك ٢٠٢٦-١١-٠١: «عضو N» (ضيف ماسجّلش) كان بيرجع لأى حد يكتب الاسم ده برابط الدعوة من غير ما حد
   * يشوف. دلوقتى الرجوع ليه بالرسالة على الجروب بس («أنا عضو N») — قدام الكل. */
  if (/^عضو \d+$/.test(String((existing as any).userName ?? '')) && !normalizePhone(existing.phone)) {
    return { ok: false, reason: 'guest-number', message: `ده رقم عضوية. لو هو عضويتك القديمة ادخل الجروب وابعت فيه «أنا ${(existing as any).userName}».` };
  }
  if (!normalizePhone(existing.phone) && existing.isAdmin !== true) {
    return { ok: true, setPhone: !!normalizePhone(submittedPhone) };
  }
  return canMergeGuest(existing, submittedPhone);
}

// ===== «أنا عضو 372» — استرجاع عضوية قديمة من الجروب (المالك ٢٠٢٦-١١-٠١) =====
// العضو اللى ماسجّلش اسمه ورقمه وفتح من متصفح تانى بياخد رقم جديد (عضو 1001). يبعت على الجروب
// «أنا عضو 372» (أو «انا عضو 372») من غير ولا حرف زيادة ⇒ السيستم بيضم قرايات العضويتين على 372
// ويرجّع المتصفح الجديد عضو 372، ويرد على رسالته «تم الدمج». الرسالة على الجروب قدام الكل هى
// الحماية من التلاعب (اللى يدّعى رقم مش بتاعه الكل شايفه برقمه الجديد) — زى ما المالك قرّر.
// الشروط اللى بتقفل الباب على الحسابات المهمة:
//   • العضوية القديمة لسه «عضو N» من غير رقم موبايل ومش أدمن (المتسجّل بيرجع باسمه ورقمه بس).
//   • اللى بيبعت مش أدمن، وعضويته انضمت **بعد** القديمة. لو كان سجّل اسم للجديدة اسمه هو اللى بيفضل.

/** اسم السيستم فى الرسايل — محجوز: مفيش عضو يقدر يبعت بيه. */
export const SYSTEM_SENDER = 'النظام';
export const isSystemName = (name?: string | null) => nameKey(name) === nameKey(SYSTEM_SENDER);

const GUEST_NAME = /^عضو (\d+)$/;
const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

/**
 * رقم العضوية من الرسالة لو هى «أنا عضو N» أو «انا العضو N» (أرقام إنجليزى أو عربى).
 * المسافات براحتها (المالك: «ممكن تتكتب انا عضو372 — راعى الغلط فى المسافات»): من غير مسافة، أو أكتر من
 * واحدة، أو حروف الكيبورد المخفية. بس أى **حرف** زيادة (نقطة، كلمة، إيموجى، رقم تانى) ⇒ null.
 */
export function parseMemberClaim(text?: string | null): number | null {
  const plain = String(text ?? '').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, ' ');
  // «أنا/انا/إنا/آنا عضو N» أو «… العضو N» — الهمزة مابتفرقش (المالك: «مع تجاهل المسافات والهمزة»)
  const m = plain.trim().match(/^[اأإآ]نا\s*(?:[اأإآ]ل\s*)?عضو\s*([0-9٠-٩۰-۹]{1,7})$/u);
  if (!m) return null;
  const n = Number(toLatin(m[1]));
  return Number.isInteger(n) && n > 0 ? n : null;
}

type ClaimMember = { id: number; userName: string; phone?: string | null; isAdmin?: boolean | null; joinedAt?: Date | string | null };
export type ClaimDecision =
  /** keep: target = المتصفح الجديد بيرجع «عضو N» القديمة · sender = العضوية الجديدة متسجّلة باسم ⇒ الاسم ده اللى بيفضل */
  | { ok: true; target: ClaimMember; keep: 'target' | 'sender' }
  | { ok: false; reason: 'admin-sender' | 'self' | 'no-target' | 'registered-target' | 'newer-target'; message: string };

const isPlainGuest = (m: ClaimMember) => GUEST_NAME.test(m.userName) && !normalizePhone(m.phone) && m.isAdmin !== true;
const joinedMs = (m: ClaimMember) => (m.joinedAt ? new Date(m.joinedAt).getTime() : 0);

/**
 * هل `sender` (صاحب المفتاح اللى بعت الرسالة) يقدر ياخد عضوية «عضو n»؟ اللى بيبعت أى عضو مش أدمن:
 * لو لسه «عضو M» ⇒ بيرجع «عضو n» (keep target)، ولو سجّل اسم للجديدة ⇒ اسمه بيفضل (keep sender — المالك ٢٠٢٦-١١-٠١).
 */
export function decideMemberClaim(members: ClaimMember[], sender: ClaimMember, n: number): ClaimDecision {
  const targetName = `عضو ${n}`;
  if (sender.isAdmin === true) {
    return { ok: false, reason: 'admin-sender', message: 'الأدمن مايستخدمش الطريقة دى — الدمج من «تعديل / تصحيح الاسم».' };
  }
  if (sender.userName === targetName) return { ok: false, reason: 'self', message: `ده رقم عضويتك الحالى (${targetName}).` };
  const target = members.find((m) => m.userName === targetName);
  if (!target) return { ok: false, reason: 'no-target', message: `مفيش ${targetName} فى المجموعة.` };
  if (!isPlainGuest(target)) {
    return { ok: false, reason: 'registered-target', message: `${targetName} متسجّل باسم ورقم — ارجع له من «سجّل اسمك» بنفس الاسم والرقم، أو كلّم الأدمن.` };
  }
  if (joinedMs(target) && joinedMs(sender) && joinedMs(target) >= joinedMs(sender)) {
    return { ok: false, reason: 'newer-target', message: `${targetName} أحدث من عضويتك — ابعت الرسالة من العضوية الجديدة.` };
  }
  return { ok: true, target, keep: isPlainGuest(sender) ? 'target' : 'sender' };
}

/** رد السيستم بعد الدمج (بيتبعت كرد على رسالة العضو). */
export const claimDoneText = (from: string, to: string, keep: 'target' | 'sender' = 'target') => (keep === 'target'
  ? `تم الدمج — قرايات ${from} اتضمّت على ${to}، والمتصفح ده رجع ${to}.`
  : `تم الدمج — قرايات ${to} اتضمّت على ${from}.`);
