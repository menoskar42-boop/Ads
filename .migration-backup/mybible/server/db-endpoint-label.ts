/**
 * وصف مكان القاعدة من غير ما نكشف أي حاجة تخصّنا.
 *
 * `pingMs` بيقول **إن** فيه تأخير، ومابيقولش **ليه**. والسبب الوحيد
 * المعقول لـ١٠٠ مللي هو إن السيرفر والقاعدة في قارتين مختلفتين — وده
 * سؤال إجابته مكتوبة حرفياً في اسم مضيف سوبابيز:
 *
 *     aws-0-eu-central-1.pooler.supabase.com   → المنطقة eu-central-1
 *     db.<project-ref>.supabase.co             → اتصال مباشر
 *
 * لكن `/api/health` راوت **مفتوح**، وحجّتي إنه يفضل مفتوح هي إنه
 * مابيكشفش حاجة. فبنرجّع **المنطقة بس** — لا مستخدم، لا كلمة سر،
 * ولا معرّف المشروع.
 */

export interface DbEndpointLabel {
  /** 'pooler' أو 'direct' أو 'other' — بيقول إزاي بنتصل. */
  kind: 'pooler' | 'direct' | 'other' | 'unset';
  /** اسم المنطقة لو ظاهر في اسم المضيف، وإلا null. */
  region: string | null;
}

export function describeDbEndpoint(url?: string | null): DbEndpointLabel {
  const raw = String(url ?? '').trim();
  if (!raw) return { kind: 'unset', region: null };

  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return { kind: 'other', region: null };
  }

  // aws-0-eu-central-1.pooler.supabase.com
  const pooler = /^aws-\d+-([a-z]{2}-[a-z]+-\d+)\.pooler\.supabase\.com$/.exec(host);
  if (pooler) return { kind: 'pooler', region: pooler[1] };

  // db.<ref>.supabase.co — المعرّف بتاعنا، فمابنرجّعهوش
  if (/^db\.[a-z0-9]+\.supabase\.co$/.test(host)) return { kind: 'direct', region: null };

  if (host.endsWith('.pooler.supabase.com')) return { kind: 'pooler', region: null };
  return { kind: 'other', region: null };
}
