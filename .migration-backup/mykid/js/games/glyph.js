// ===== مساعد عرض الكائن: صورة إن وُجدت، وإلا إيموجي =====
// إن أضفت ملف صورة في assets/animals/<id>.png ووضعت img:"animals/<id>.png"
// في بيانات العنصر، تظهر الصورة بدل الإيموجي تلقائياً.
const IMG_BASE = "/assets/";

/** HTML لعرض العنصر: صورة (it.img) أو إيموجي (it.emoji)
 *  عند فشل تحميل الصورة (غير موجودة بعد) يرجع تلقائياً للإيموجي. */
export function glyphMarkup(it, cls = "item-glyph") {
  if (it.img) {
    const fallback = `&lt;span class='${cls}'&gt;${it.emoji}&lt;/span&gt;`;
    return `<img class="${cls} item-img" src="${IMG_BASE}${it.img}" alt="${it.name || ""}" loading="lazy" onerror="this.outerHTML='${fallback}'" />`;
  }
  return `<span class="${cls}">${it.emoji}</span>`;
}

/** يعرض الإيموجي دائماً (للظل/silhouette: الصور الفوتوغرافية المستطيلة
 *  تتحوّل إلى مربّع أسود مع brightness(0)، بينما الإيموجي يعطي شكلاً ظليّاً سليماً). */
export function glyphEmoji(it, cls = "item-glyph") {
  return `<span class="${cls}">${it.emoji || ""}</span>`;
}

/** للأماكن التي تحتاج عنصر DOM جاهز */
export function glyphNode(it, cls = "item-glyph") {
  const wrap = document.createElement("span");
  wrap.innerHTML = glyphMarkup(it, cls);
  return wrap.firstElementChild;
}
