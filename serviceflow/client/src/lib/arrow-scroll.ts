// أسهم الكيبورد يمين/شمال بتحرّك الجدول العريض (المالك ٢٠٢٦-١٠-٢٨: «لما بحرّك التقرير بالأسهم يمين
// ويسار مش بيتحرك إلا من خلال الاسكرول»).
//
// المتصفح بيحرّك بالأسهم بس العنصر اللى عليه الفوكس، وجدول التقرير مش بياخد فوكس بالضغط
// عليه — فالأسهم كانت مابتعملش حاجة. هنا: السهم بيحرّك أقرب جدول/صندوق بيتحرّك بالعرض
// للمكان اللى اتضغط فيه آخر مرة، ولو مفيش — أكبر واحد ظاهر فى الشاشة.
// ومابيلمسش الأسهم جوّه خانات الكتابة والقوايم والتابات (ليها شغلها هناك).

const STEP = 90; // بكسل كل ضغطة

/** العنصر بيتحرّك بالعرض فعلاً؟ */
export function scrollsX(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.scrollWidth <= el.clientWidth + 1) return false;
  const ox = getComputedStyle(el).overflowX;
  return ox === "auto" || ox === "scroll";
}

/** أقرب صندوق بيتحرّك بالعرض من العنصر ده لفوق. */
export function horizontalScrollerFrom(start: Element | null): HTMLElement | null {
  for (let el: Element | null = start; el && el !== document.documentElement; el = el.parentElement) {
    if (scrollsX(el)) return el;
  }
  return null;
}

/** أكبر صندوق ظاهر فى الشاشة بيتحرّك بالعرض (لو المستخدم ماضغطش جوّه جدول لسه). */
function biggestVisibleScroller(): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestArea = 0;
  const vh = window.innerHeight, vw = window.innerWidth;
  document.querySelectorAll<HTMLElement>("div, table, section, main").forEach((el) => {
    if (!scrollsX(el)) return;
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    if (w * h > bestArea) { bestArea = w * h; best = el; }
  });
  return best;
}

/** الأسهم ليها شغل تانى هنا (كتابة، قايمة، تابات، سلايدر…) — سيبها. */
function ownsArrows(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.closest("input, textarea, select")) return true;
  return !!el.closest('[role="tablist"], [role="menu"], [role="menubar"], [role="listbox"], [role="radiogroup"], [role="slider"], [role="combobox"], [role="grid"], [role="dialog"] [role="option"]');
}

export function installArrowScroll(): void {
  let lastTarget: Element | null = null;
  document.addEventListener("pointerdown", (e) => { lastTarget = e.target as Element; }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (ownsArrows(document.activeElement)) return;
    const box = (lastTarget && lastTarget.isConnected ? horizontalScrollerFrom(lastTarget) : null) || biggestVisibleScroller();
    if (!box) return;
    // scrollBy بإشارة سالبة = شمال فى الشاشة، فى العربى (RTL) والإنجليزى زى بعض
    const dx = e.key === "ArrowLeft" ? -STEP : STEP;
    const before = box.scrollLeft;
    box.scrollBy({ left: dx });
    if (box.scrollLeft !== before) e.preventDefault();
  });
}
