import { useEffect } from 'react';

/**
 * الشاشة ماتنامش طول ما صفحة الجروب مفتوحة (طلب عضو فى جروب درس مار مرقس ٢٠٢٦-١١-٠٢:
 * «الشاشة بتدخل نوم وأنا بقرا»).
 * - المتصفحات الجديدة: Screen Wake Lock API — وبيترجع تانى لما الصفحة ترجع ظاهرة
 *   (المتصفح بيفكّه لوحده لما الصفحة تستخبى أو التليفون يتقفل).
 * - المتصفحات اللى مافيهاش (آيفون قديم): فيديو صغير صامت بيلف مخفى — بيبدأ مع أول لمسة
 *   لأن المتصفح مابيشغّلش فيديو من غير تفاعل.
 * لما الصفحة تتقفل كل ده بيتشال، والشاشة ترجع لإعدادات التليفون العادية.
 */
export function useKeepScreenOn(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    let lock: any = null;
    let video: HTMLVideoElement | null = null;
    let stopped = false;
    const nav: any = navigator;
    const hasWakeLock = !!nav?.wakeLock?.request;

    const requestLock = async () => {
      if (stopped || !hasWakeLock || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        lock = await nav.wakeLock.request('screen');
        if (stopped) { lock.release?.().catch?.(() => {}); lock = null; }
      } catch {
        startVideo(); // مرفوض (مثلاً وضع توفير البطارية) ⇒ الطريقة التانية
      }
    };

    const startVideo = () => {
      if (stopped) return;
      if (!video) {
        video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        video.setAttribute('aria-hidden', 'true');
        video.muted = true;
        video.loop = true;
        video.src = '/keep-awake.mp4';
        video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;bottom:0;left:0;z-index:-1';
        document.body.appendChild(video);
      }
      video.play().catch(() => {});
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (hasWakeLock) requestLock();
      else if (video) video.play().catch(() => {});
    };
    const onFirstTouch = () => {
      if (hasWakeLock) requestLock(); else startVideo();
    };

    requestLock();
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('touchstart', onFirstTouch, { passive: true });
    document.addEventListener('click', onFirstTouch);

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('touchstart', onFirstTouch);
      document.removeEventListener('click', onFirstTouch);
      try { lock?.release?.(); } catch {}
      lock = null;
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); video.remove(); video = null; }
    };
  }, [enabled]);
}
