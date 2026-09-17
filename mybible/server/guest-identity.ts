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

export type MergeRefusal =
  | 'phone-missing'      // الضيف ما كتبش تليفون
  | 'no-phone-on-file'   // العضو القديم مالوش تليفون مسجّل — مفيش حاجة نطابق عليها
  | 'phone-mismatch';    // كتب تليفون غير المسجّل

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
