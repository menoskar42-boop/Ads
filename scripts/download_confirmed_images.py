#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
download_confirmed_images.py
=====================================================================
ينزّل الصور المؤكّدة فقط من اللينكات المباشرة (مفيش بحث، مفيش agents).
يحفظها بالأسماء اللي متجر Delta بيدوّر عليها بالظبط (امتداد .png).

  pip install requests pillow
  python scripts/download_confirmed_images.py
  git add public/products public/credits.txt
  git commit -m "content: confirmed CC product images for Delta"
  git push

البانرات: سيبها فاضية دلوقتي — لما تجيب لينكاتها المباشرة، حطّها في
BANNERS تحت وشغّل السكربت تاني.
=====================================================================
"""
import io, os, sys

try:
    import requests
    from PIL import Image
except ImportError:
    print("نصّب الأول:  pip install requests pillow"); sys.exit(1)

UA = {"User-Agent": "DeltaStore/1.0 (oscardevs.com; contact@oscardevs.com)"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROD = os.path.join(ROOT, "public", "products")
BANN = os.path.join(ROOT, "public", "banners")
PRODUCT_SIZE = (800, 800)
BANNER_SIZE = (1200, 600)

# ── المنتجات المؤكّدة (لينك مباشر) ───────────────────────────────────
# المفتاح = اسم الملف اللي الموقع بيستخدمه فعلاً (.png مش .jpg)
PRODUCTS = {
    "galaxy-s24-ultra.png": {
        "url": "https://upload.wikimedia.org/wikipedia/commons/e/ed/Samsung_S24_Ultra_Phone.png",
        "author": "FarihF10",
        "license": "CC BY-SA 4.0",
        "page": "https://commons.wikimedia.org/wiki/File:Samsung_S24_Ultra_Phone.png",
    },
    "iphone-15-pro-max.png": {
        "url": "https://upload.wikimedia.org/wikipedia/commons/2/23/About_iPhone_15_Pro_Max_Natural_Titanium.jpg",
        "author": "see file page",
        "license": "CC (see page)",
        "page": "https://commons.wikimedia.org/wiki/File:About_iPhone_15_Pro_Max_Natural_Titanium.jpg",
    },
    "pixel-8-pro.png": {
        # نسخة PNG 1024px من ملف SVG (الأقواس URL-encoded عشان ما يحصلش 404)
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Google_Pixel_8_Pro_back_%28Obsidian%29.svg/1024px-Google_Pixel_8_Pro_back_%28Obsidian%29.svg.png",
        "author": "Wikimedia contributors",
        "license": "CC BY-SA 4.0",
        "page": "https://commons.wikimedia.org/wiki/File:Google_Pixel_8_Pro_back_(Obsidian).svg",
    },
}

# ── البانرات (1200x600) — حط اللينكات المباشرة هنا لما تجيبها ────────
# مثال:
#   "delta-banner-1.jpg": {"url": "https://images.unsplash.com/photo-XXXX",
#                          "author": "Name", "license": "Unsplash License",
#                          "page": "https://unsplash.com/photos/XXXX"},
BANNERS = {
    # "delta-banner-1.jpg": {...},
    # "delta-banner-2.jpg": {...},
    # "delta-banner-3.jpg": {...},
}

credits = []


def download(url):
    r = requests.get(url, headers=UA, timeout=120)
    r.raise_for_status()
    return Image.open(io.BytesIO(r.content))


def to_square(img, size=PRODUCT_SIZE, bg=(255, 255, 255)):
    """contain داخل مربّع بخلفية بيضاء (مفيش قص للمنتج)."""
    img = img.convert("RGBA")
    canvas = Image.new("RGBA", size, bg + (255,))
    fit = img.copy()
    fit.thumbnail(size, Image.LANCZOS)
    canvas.paste(fit, ((size[0]-fit.width)//2, (size[1]-fit.height)//2), fit)
    return canvas.convert("RGB")


def to_cover(img, size=BANNER_SIZE):
    """cover يملأ كامل البانر مع قص الزيادة."""
    img = img.convert("RGB")
    tw, th = size
    s = max(tw/img.width, th/img.height)
    nw, nh = int(img.width*s), int(img.height*s)
    img = img.resize((nw, nh), Image.LANCZOS)
    return img.crop(((nw-tw)//2, (nh-th)//2, (nw-tw)//2+tw, (nh-th)//2+th))


def run(folder, mapping, transformer):
    os.makedirs(folder, exist_ok=True)
    for name, item in mapping.items():
        try:
            img = transformer(download(item["url"]))
            fmt = "PNG" if name.endswith(".png") else "JPEG"
            kw = {} if fmt == "PNG" else {"quality": 88, "optimize": True}
            img.save(os.path.join(folder, name), fmt, **kw)
            credits.append((name, item["author"], item["license"], item["page"]))
            print(f"  ✓ {name}  <-  {item['author']} | {item['license']}")
        except Exception as e:
            print(f"  ⚠ {name}: فشل — {e}  (سايب المحلية زي ما هي)")


print("=== المنتجات المؤكّدة ===")
run(PROD, PRODUCTS, to_square)

if BANNERS:
    print("\n=== البانرات ===")
    run(BANN, BANNERS, to_cover)
else:
    print("\n(البانرات فاضية — حط لينكاتها في BANNERS وشغّل تاني)")

# credits.txt
with open(os.path.join(ROOT, "public", "credits.txt"), "w", encoding="utf-8") as f:
    f.write("Delta store image credits\n")
    f.write("=========================\n\n")
    for name, author, lic, page in credits:
        f.write(f"{name}\n  Photographer: {author}\n  License: {lic}\n  Source: {page}\n\n")

print(f"\nخلصنا ✅  {len(credits)} صورة.  credits في public/credits.txt")
print("بعدها:  git add public/products public/credits.txt && git commit -m 'real images' && git push")
