// ============================================================================
// أيقونة Service Flow على نوافذ الطباعة / PDF
//
// كل تقارير الطباعة (والخطابات) بتفتح window.open("") وتكتب الـHTML جوّاها. النافذة دى
// مالهاش أيقونة، فالمتصفح بيجيب /favicon.ico من **جذر الدومين** — واللى بيرد عليه أوسكار
// ديفز، فالتاب كان بيطلع لوجو أوسكار ديفز بدل Service Flow (نفس مشكلة apple-touch-icon فى
// index.html). اللفّة دى بتحط أيقونة Service Flow فى أى نافذة فاضية بتتفتح، وبعد ما الكود
// يقفل الكتابة (document.close) — لأن document.write بيمسح الـhead اللى كان فيها.
// ============================================================================
import { withBase } from "./base-path";

export const sfIconHref = () => new URL(withBase("/favicon.png"), window.location.origin).href;

export function addSfIcon(doc: Document) {
  try {
    const head = doc.head || doc.getElementsByTagName("head")[0];
    if (!head) return;
    head.querySelectorAll('link[rel~="icon"]').forEach((l) => l.remove());
    const link = doc.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = sfIconHref();
    head.appendChild(link);
  } catch { /* نافذة اتقفلت أو من أصل تانى */ }
}

export function installPrintWindowIcon() {
  const origOpen = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const w = origOpen(url as any, target, features);
    const u = String(url ?? "");
    if (w && (u === "" || u === "about:blank")) {
      try {
        const doc = w.document;
        const origClose = doc.close.bind(doc);
        doc.close = () => { origClose(); addSfIcon(w.document); };
        addSfIcon(doc);
      } catch { /* مش مهم — الطباعة نفسها تكمّل */ }
    }
    return w;
  }) as typeof window.open;
}
