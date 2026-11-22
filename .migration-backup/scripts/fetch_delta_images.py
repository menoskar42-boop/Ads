#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_delta_images.py
=====================================================================
سكربت "اشتغل لوحدك" — يجيب صور حقيقية من Wikimedia Commons (CC-licensed)
بدون أي إدخال يدوي، ويطلّع ملف ZIP واحد فيه كل الصور بالأسماء بالظبط
اللي متجر Delta بيدوّر عليها.

الاستخدام (في أي بيئة عندها إنترنت):
    pip install requests pillow
    python fetch_delta_images.py

الناتج:
    delta-images.zip
      ├── products/
      │   ├── iphone-15-pro-max.png   (800x800)
      │   ├── galaxy-s24-ultra.png
      │   ├── pixel-8-pro.png
      │   ├── iphone-14.png
      │   ├── xiaomi-note13.png
      │   ├── macbook-pro-16.png
      │   ├── macbook-air.png
      │   ├── dell-xps-15.png
      │   ├── asus-rog-gaming.png
      │   └── rgb-gaming-pc.png
      ├── banners/
      │   ├── delta-banner-1.jpg       (1200x600 — موبايلات)
      │   ├── delta-banner-2.jpg       (1200x600 — لابتوبات)
      │   └── delta-banner-3.jpg       (1200x600 — جيمنج)
      └── CREDITS.csv   (اسم المصوّر + الترخيص لكل صورة، مقروء من المصدر)

كل صورة بترخيصها الحقيقي من Commons (مفيش تلفيق). لو منتج مالقاش صورة،
بيتكتب في الـCREDITS إنه "NOT FOUND" عشان تعرف تدوّرله يدوي.
=====================================================================
"""
import io, os, csv, re, sys, time, zipfile

try:
    import requests
    from PIL import Image
except ImportError:
    print("نصّب الأول:  pip install requests pillow"); sys.exit(1)

HEADERS = {"User-Agent": "DeltaStore/1.0 (oscardevs.com; contact@oscardevs.com)"}
API = "https://commons.wikimedia.org/w/api.php"

OUT_ZIP = "delta-images.zip"
PRODUCT_SIZE = (800, 800)
BANNER_SIZE = (1200, 600)

# اسم الملف اللي الموقع بيستخدمه  ->  كلمات بحث مرتّبة بالأفضلية
PRODUCTS = {
    "iphone-15-pro-max.png": ["iPhone 15 Pro Max", "iPhone 15 Pro"],
    "galaxy-s24-ultra.png":  ["Samsung Galaxy S24 Ultra", "Galaxy S24 Ultra"],
    "pixel-8-pro.png":       ["Google Pixel 8 Pro", "Pixel 8 Pro"],
    "iphone-14.png":         ["iPhone 14 blue", "iPhone 14"],
    "xiaomi-note13.png":     ["Xiaomi Redmi Note 13 Pro", "Redmi Note 13"],
    "macbook-pro-16.png":    ["MacBook Pro 16 inch", "MacBook Pro 2023"],
    "macbook-air.png":       ["MacBook Air M2", "MacBook Air 2022"],
    "dell-xps-15.png":       ["Dell XPS 15", "Dell XPS laptop"],
    "asus-rog-gaming.png":   ["Asus ROG laptop", "ASUS ROG gaming laptop"],
    "rgb-gaming-pc.png":     ["RGB gaming computer", "gaming PC RGB lighting"],
}

# البانرات (مشاهد افقية لكل قسم)
BANNERS = {
    "delta-banner-1.jpg": ["smartphones collection display", "modern smartphone"],
    "delta-banner-2.jpg": ["laptop desk workspace", "laptop computer desk setup"],
    "delta-banner-3.jpg": ["gaming computer setup RGB", "gaming PC RGB setup"],
}


def strip_html(t):
    return re.sub(r"<[^>]+>", "", t or "").strip()


def search(query, limit=10):
    params = {
        "action": "query", "format": "json", "generator": "search",
        "gsrnamespace": "6", "gsrsearch": query, "gsrlimit": limit,
        "prop": "imageinfo", "iiprop": "url|extmetadata|mime|size", "iiurlwidth": 1600,
    }
    try:
        r = requests.get(API, params=params, headers=HEADERS, timeout=60)
        r.raise_for_status()
        pages = r.json().get("query", {}).get("pages", {})
    except Exception as e:
        print(f"    بحث فشل: {e}"); return []
    out = []
    for p in pages.values():
        ii = (p.get("imageinfo") or [{}])[0]
        if ii.get("mime") not in ("image/jpeg", "image/png"): continue
        if ii.get("width", 0) < 400 or ii.get("height", 0) < 400: continue
        m = ii.get("extmetadata", {})
        out.append({
            "url": ii.get("thumburl") or ii.get("url"),
            "author": strip_html(m.get("Artist", {}).get("value", "")) or "Unknown",
            "license": m.get("LicenseShortName", {}).get("value", "") or "see page",
            "license_url": m.get("LicenseUrl", {}).get("value", ""),
            "page": "https://commons.wikimedia.org/wiki/" + p.get("title", "").replace(" ", "_"),
        })
    return out


def download(url):
    r = requests.get(url, headers=HEADERS, timeout=120); r.raise_for_status()
    return Image.open(io.BytesIO(r.content))


def to_square(img, size=PRODUCT_SIZE):
    img = img.convert("RGBA")
    c = Image.new("RGBA", size, (255, 255, 255, 255))
    f = img.copy(); f.thumbnail(size, Image.LANCZOS)
    c.paste(f, ((size[0]-f.width)//2, (size[1]-f.height)//2), f)
    return c.convert("RGB")


def to_cover(img, size=BANNER_SIZE):
    img = img.convert("RGB"); tw, th = size
    s = max(tw/img.width, th/img.height)
    nw, nh = int(img.width*s), int(img.height*s)
    img = img.resize((nw, nh), Image.LANCZOS)
    return img.crop(((nw-tw)//2, (nh-th)//2, (nw-tw)//2+tw, (nh-th)//2+th))


def build(zf, folder, mapping, transformer):
    credits = []
    for name, queries in mapping.items():
        ok = False
        for q in queries:
            for cand in search(q):
                try:
                    img = transformer(download(cand["url"]))
                    buf = io.BytesIO()
                    fmt = "PNG" if name.endswith(".png") else "JPEG"
                    kw = {} if fmt == "PNG" else {"quality": 88, "optimize": True}
                    img.save(buf, fmt, **kw)
                    zf.writestr(f"{folder}/{name}", buf.getvalue())
                    credits.append([f"{folder}/{name}", cand["page"], cand["author"],
                                    f'{cand["license"]} ({cand["license_url"]})'])
                    print(f"  ✓ {folder}/{name}  <-  {cand['author'][:40]} | {cand['license']}")
                    ok = True; break
                except Exception:
                    continue
            if ok: break
            time.sleep(0.4)
        if not ok:
            credits.append([f"{folder}/{name}", "NOT FOUND", "", ""])
            print(f"  ⚠ {folder}/{name}: مالقاش صورة")
    return credits


def main():
    with zipfile.ZipFile(OUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        print("=== المنتجات ===")
        c1 = build(zf, "products", PRODUCTS, to_square)
        print("\n=== البانرات ===")
        c2 = build(zf, "banners", BANNERS, to_cover)
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["filename", "source_url", "photographer", "license"])
        w.writerows(c1 + c2)
        zf.writestr("CREDITS.csv", buf.getvalue())
    print(f"\nخلصنا ✅  الملف: {OUT_ZIP}")
    print("ابعت الملف ده لـClaude اللي بيساعدك في الموقع.")


if __name__ == "__main__":
    main()
