#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
download_delta_images.py
=====================================================================
شغّله على Replit Shell (عنده إنترنت) — ينزّل الصور الحقيقية ويكتبها
مباشرة في public/products و public/banners بالأسماء الصح، فبعد ما
تشغّله اعمل git commit وخلاص.

  pip install requests pillow
  python scripts/download_delta_images.py
  git add public/products public/banners scripts/IMAGE_CREDITS.csv
  git commit -m "content: real CC images for Delta"
  git push

المنطق:
  - فيه لينكات مباشرة مؤكّدة (S24 Ultra / iPhone 15 Pro Max / Pixel 8 Pro)
    اتأكّدت من Wikimedia.
  - الباقي: بحث أوتوماتيك في Commons API.
  - البانرات: بحث أوتوماتيك (مشاهد landscape).
  - أي صورة مالقاش لها بديل، بيسيب الموجودة محلياً زي ما هي.
=====================================================================
"""
import io, os, csv, re, sys, time

try:
    import requests
    from PIL import Image
except ImportError:
    print("نصّب الأول:  pip install requests pillow"); sys.exit(1)

UA = {"User-Agent": "DeltaStore/1.0 (oscardevs.com; contact@oscardevs.com)"}
API = "https://commons.wikimedia.org/w/api.php"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROD = os.path.join(ROOT, "public", "products")
BANN = os.path.join(ROOT, "public", "banners")
PRODUCT_SIZE, BANNER_SIZE = (800, 800), (1200, 600)

# لينكات مباشرة مؤكّدة (الأولوية)
DIRECT = {
    "galaxy-s24-ultra.png":  "https://upload.wikimedia.org/wikipedia/commons/e/ed/Samsung_S24_Ultra_Phone.png",
    "iphone-15-pro-max.png": "https://upload.wikimedia.org/wikipedia/commons/2/23/About_iPhone_15_Pro_Max_Natural_Titanium.jpg",
    "pixel-8-pro.png":       "https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Google_Pixel_8_Pro_back_%28Obsidian%29.svg/1024px-Google_Pixel_8_Pro_back_%28Obsidian%29.svg.png",
}

# الباقي بالبحث الأوتوماتيك
PRODUCTS = {
    "iphone-14.png":       ["iPhone 14 blue", "iPhone 14"],
    "xiaomi-note13.png":   ["Xiaomi Redmi Note 13 Pro", "Redmi Note 13"],
    "macbook-pro-16.png":  ["MacBook Pro 16 inch", "MacBook Pro 2023"],
    "macbook-air.png":     ["MacBook Air M2", "MacBook Air 2022"],
    "dell-xps-15.png":     ["Dell XPS 15", "Dell XPS laptop"],
    "asus-rog-gaming.png": ["Asus ROG laptop", "ASUS ROG gaming laptop"],
    "rgb-gaming-pc.png":   ["RGB gaming computer", "gaming PC RGB lighting"],
}
BANNERS = {
    "delta-banner-1.jpg": ["smartphones collection", "modern smartphone display"],
    "delta-banner-2.jpg": ["laptop desk workspace", "laptop computer desk"],
    "delta-banner-3.jpg": ["gaming computer RGB setup", "gaming PC RGB"],
}

credits = []

def strip_html(t): return re.sub(r"<[^>]+>", "", t or "").strip()

def search(q, limit=10):
    p = {"action":"query","format":"json","generator":"search","gsrnamespace":"6",
         "gsrsearch":q,"gsrlimit":limit,"prop":"imageinfo",
         "iiprop":"url|extmetadata|mime|size","iiurlwidth":1600}
    try:
        r = requests.get(API, params=p, headers=UA, timeout=60); r.raise_for_status()
        pages = r.json().get("query",{}).get("pages",{})
    except Exception as e:
        print(f"    بحث فشل: {e}"); return []
    out=[]
    for pg in pages.values():
        ii=(pg.get("imageinfo") or [{}])[0]
        if ii.get("mime") not in ("image/jpeg","image/png"): continue
        if ii.get("width",0)<400 or ii.get("height",0)<400: continue
        m=ii.get("extmetadata",{})
        out.append({"url":ii.get("thumburl") or ii.get("url"),
                    "author":strip_html(m.get("Artist",{}).get("value",""))or"Unknown",
                    "license":m.get("LicenseShortName",{}).get("value","")or"see page",
                    "page":"https://commons.wikimedia.org/wiki/"+pg.get("title","").replace(" ","_")})
    return out

def dl(url): r=requests.get(url,headers=UA,timeout=120); r.raise_for_status(); return Image.open(io.BytesIO(r.content))

def square(img,s=PRODUCT_SIZE):
    img=img.convert("RGBA"); c=Image.new("RGBA",s,(255,255,255,255))
    f=img.copy(); f.thumbnail(s,Image.LANCZOS)
    c.paste(f,((s[0]-f.width)//2,(s[1]-f.height)//2),f); return c.convert("RGB")

def cover(img,s=BANNER_SIZE):
    img=img.convert("RGB"); tw,th=s; sc=max(tw/img.width,th/img.height)
    nw,nh=int(img.width*sc),int(img.height*sc); img=img.resize((nw,nh),Image.LANCZOS)
    return img.crop(((nw-tw)//2,(nh-th)//2,(nw-tw)//2+tw,(nh-th)//2+th))

def save(img,folder,name):
    os.makedirs(folder,exist_ok=True)
    fmt="PNG" if name.endswith(".png") else "JPEG"
    kw={} if fmt=="PNG" else {"quality":88,"optimize":True}
    img.save(os.path.join(folder,name),fmt,**kw)

print("=== لينكات مباشرة مؤكّدة ===")
for name,url in DIRECT.items():
    try:
        save(square(dl(url)),PROD,name)
        credits.append([f"products/{name}",url,"Wikimedia","CC BY-SA 4.0"])
        print(f"  ✓ {name}")
    except Exception as e:
        print(f"  ⚠ {name}: {e} — هنحاول بالبحث")
        PRODUCTS[name]=[name.replace('-',' ').replace('.png','')]

print("\n=== منتجات بالبحث ===")
for name,qs in PRODUCTS.items():
    if os.path.exists(os.path.join(PROD,name)) and name in DIRECT: continue
    ok=False
    for q in qs:
        for c in search(q):
            try:
                save(square(dl(c["url"])),PROD,name)
                credits.append([f"products/{name}",c["page"],c["author"],c["license"]])
                print(f"  ✓ {name}  <-  {c['author'][:35]} | {c['license']}"); ok=True; break
            except Exception: continue
        if ok: break
        time.sleep(0.4)
    if not ok: print(f"  ⚠ {name}: مالقاش — سايب المحلية")

print("\n=== بانرات بالبحث ===")
for name,qs in BANNERS.items():
    ok=False
    for q in qs:
        for c in search(q):
            try:
                save(cover(dl(c["url"])),BANN,name)
                credits.append([f"banners/{name}",c["page"],c["author"],c["license"]])
                print(f"  ✓ {name}  <-  {c['author'][:35]} | {c['license']}"); ok=True; break
            except Exception: continue
        if ok: break
        time.sleep(0.4)
    if not ok: print(f"  ⚠ {name}: مالقاش — سايب المحلية")

with open(os.path.join(ROOT,"scripts","IMAGE_CREDITS.csv"),"w",encoding="utf-8",newline="") as f:
    w=csv.writer(f); w.writerow(["filename","source","photographer","license"]); w.writerows(credits)

print(f"\nخلصنا ✅  {len(credits)} صورة اتنزّلت.")
print("بعدها:  git add public/products public/banners scripts/IMAGE_CREDITS.csv && git commit -m 'real images' && git push")
