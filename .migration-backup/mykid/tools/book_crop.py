#!/usr/bin/env python3
"""قصّ رسمة كلمة من صورة صفحة كتاب البنت ← mykid/assets/book/en/<word>.webp (نفس طريقة N و I و C، ٢٠٢٦-١١-١٦).

الاستخدام (من جذر المستودع):
    python3 mykid/tools/book_crop.py docs/book-photos/english/p01-M.jpg mom 380 220 530 420

الأرقام = مربع الرسمة (x0 y0 x1 y1)، ورقم خامس اختيارى = حساسية الخلفية (افتراضى ٣٤؛ قلّله لـ١٤–٢٠ لو الرسمة
فاتحة قريبة من لون الورق زى الأرنب والنعامة، عشان جسمها مايتشالش مع الخلفية).
الأرقام بالبكسل فى ملف الـjpg نفسه (عرضه ١٦٠٠ أو ١٢٠٠ للصفحة الطولى).
المربع يحوط الرسمة بس — من غير الكلمة المكتوبة تحتها ولا حروف كبيرة جنبها.
الخطوات: قص بهامش ٦٪ ← تكبير ×٢ ← شيل خلفية الورق المتصلة بالحافة بس (الأبيض جوّه الرسمة يفضل) ← شيل النقط
الصغيرة ← قص الفاضى ← ألوان أوضح ← أقصى ٣٢٠ بكسل ← WebP بخلفية شفافة. محتاج Pillow و numpy.
"""
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

OUT = "mykid/assets/book/en/"


def crop_word(page_path, word, box, pad=0.06, out_dir=OUT, tol=34):
    im = Image.open(page_path).convert("RGB")
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    im = im.crop((int(max(0, x0 - w * pad)), int(max(0, y0 - h * pad)),
                  int(min(im.width, x1 + w * pad)), int(min(im.height, y1 + h * pad))))
    im = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
    a = np.asarray(im).astype(float)
    border = np.concatenate([a[:3].reshape(-1, 3), a[-3:].reshape(-1, 3), a[:, :3].reshape(-1, 3), a[:, -3:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    # .copy(): الصورة اللى طالعة من numpy بتشارك نفس الذاكرة، والـfloodfill مابيكتبش فيها من غيرها
    near = Image.fromarray(((np.sqrt(((a - bg) ** 2).sum(-1)) < tol) * 255).astype(np.uint8), "L").copy()
    W, H = near.size
    for x in range(0, W, 3):
        for y in (0, H - 1):
            if near.getpixel((x, y)) == 255:
                ImageDraw.floodfill(near, (x, y), 128)
    for y in range(0, H, 3):
        for x in (0, W - 1):
            if near.getpixel((x, y)) == 255:
                ImageDraw.floodfill(near, (x, y), 128)
    alpha = Image.fromarray(np.where(np.asarray(near) == 128, 0, 255).astype(np.uint8), "L")
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    # النقط الصغيرة (بواقى حروف مطبوعة) تتشال: نسيب المساحات ≥ ٣٪ من أكبر واحدة
    al = np.array(alpha)
    on = al > 40
    lab = np.zeros(on.shape, int)
    sizes = [0]
    k = 0
    for yy in range(H):
        for xx in range(W):
            if on[yy, xx] and not lab[yy, xx]:
                k += 1
                q = deque([(yy, xx)])
                lab[yy, xx] = k
                c = 0
                while q:
                    cy, cx = q.popleft()
                    c += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and on[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = k
                            q.append((ny, nx))
                sizes.append(c)
    if k:
        big = max(sizes)
        keep = np.array([False] + [s >= big * 0.03 for s in sizes[1:]])
        al = np.where((lab > 0) & ~keep[lab], 0, al).astype(np.uint8)
    rgb = ImageEnhance.Color(im).enhance(1.35)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.15)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.4)
    o = rgb.convert("RGBA")
    o.putalpha(Image.fromarray(al, "L"))
    bb = Image.fromarray(((al > 40) * 255).astype(np.uint8)).getbbox()
    if bb:
        o = o.crop((max(0, bb[0] - 4), max(0, bb[1] - 4), min(W, bb[2] + 4), min(H, bb[3] + 4)))
    o.thumbnail((320, 320))
    path = out_dir + word.lower() + ".webp"
    o.save(path, "WEBP", quality=88, method=6)
    return path, o.size


if __name__ == "__main__":
    page, word, *nums = sys.argv[1:]
    tol = float(nums.pop()) if len(nums) == 5 else 34
    print(*crop_word(page, word, tuple(float(n) for n in nums[:4]), tol=tol))
