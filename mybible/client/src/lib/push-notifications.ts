function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerPushSubscription(): Promise<boolean> {
  // 1) مفتاح VAPID من الخادم
  let publicKey: string;
  try {
    const keyRes = await fetch('/api/push/vapid-key');
    if (keyRes.status === 503) {
      throw new Error('الإشعارات غير مُفعّلة على الخادم (مفاتيح VAPID غير موجودة)');
    }
    if (!keyRes.ok) throw new Error('تعذّر جلب مفتاح الإشعارات من الخادم');
    publicKey = (await keyRes.json()).publicKey;
    if (!publicKey) throw new Error('مفتاح الإشعارات فارغ');
  } catch (e) {
    if (e instanceof Error && e.message.includes('VAPID')) throw e;
    throw new Error('تعذّر الاتصال بالخادم لتفعيل الإشعارات');
  }

  // 2) تسجيل الـ service worker
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // 3) الاشتراك (أعد استخدام القائم إن وُجد، وإلا أنشئ جديداً)
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    } catch (e) {
      const name = (e as Error)?.name || '';
      if (name === 'NotAllowedError') throw new Error('تم رفض إذن الإشعارات من المتصفح');
      throw new Error('فشل إنشاء الاشتراك: ' + ((e as Error)?.message || name || 'خطأ غير معروف'));
    }
  }

  // 4) حفظ الاشتراك على الخادم
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error('فشل حفظ الاشتراك على الخادم');
  return true;
}

export async function unregisterPushSubscription(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch('/api/push/unsubscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  }
}

export async function getNotifState(): Promise<'subscribed' | 'idle'> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return 'idle';
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'idle';
}

const WELCOME_KEY = 'push-welcome-last';

// إرسال إشعار تأكيد فوري بعد الاشتراك مباشرة (بدون قيد الـ 24 ساعة)
export async function sendWelcomeNow(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    const res = await fetch('/api/push/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({ sent: false }));
    localStorage.setItem(WELCOME_KEY, String(Date.now()));
    return !!data.sent;
  } catch {
    return false;
  }
}

// يُستدعى عند فتح الموقع — يرسل إشعار ترحيبي للمشترك
export async function maybeSendWelcome(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    // لا ترسل أكثر من مرة كل ٢٤ ساعة
    const last = Number(localStorage.getItem(WELCOME_KEY) ?? '0');
    if (Date.now() - last < 24 * 60 * 60 * 1000) return;

    await fetch('/api/push/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    localStorage.setItem(WELCOME_KEY, String(Date.now()));
  } catch {
    // صامت — الإشعار الترحيبي اختياري
  }
}
