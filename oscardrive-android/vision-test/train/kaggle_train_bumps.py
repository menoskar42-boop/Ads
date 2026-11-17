# Oscar Drive — تدريب موديل المطبات والحفر على Kaggle (خلية واحدة · ٢٠٢٦-١١-١٧)
# الموديل: YOLOX-Nano (رخصة Apache-2.0 — مش Ultralytics/AGPL). الداتا: road_anomaly_ds (MIT) — Pothole · Speedbump · Crack.
# قبل التشغيل: من اليمين «Add Input» ← دوّر على road-anomaly-ds ← Add. والإعدادات: GPU T4 x2 · Internet on.
# الناتج فى /kaggle/working/oscar_bumps: الموديل (pth + onnx) + تقرير الدقة لكل نوع.
import os, sys, glob, json, random, shutil, subprocess, time

EPOCHS = int(os.environ.get("EPOCHS", "40"))   # ٤٠ لفة ≈ ساعة إلى ساعتين على T4 x2
IMG = 416                                       # نفس مقاس الموبايل
OUT = "/kaggle/working/oscar_bumps"
WORK = "/kaggle/working/yolox_work"
os.makedirs(OUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)

def sh(cmd, cwd=None):
    print("$", cmd, flush=True)
    r = subprocess.run(cmd, shell=True, cwd=cwd)
    if r.returncode != 0:
        raise SystemExit(f"فشل الأمر: {cmd}")

# ── ١) لقّى الداتا (YOLO TXT) ────────────────────────────────────────────────
IMG_EXT = (".jpg", ".jpeg", ".png", ".bmp", ".webp")
def find_dataset(root="/kaggle/input"):
    imgs = [p for p in glob.glob(f"{root}/**/*", recursive=True) if p.lower().endswith(IMG_EXT)]
    if not imgs:
        raise SystemExit("مفيش صور فى /kaggle/input — اعمل Add Input لـ road-anomaly-ds الأول")
    return imgs

def label_for(img):
    base = os.path.splitext(img)[0]
    for cand in (base.replace("/images/", "/labels/") + ".txt", base + ".txt"):
        if os.path.exists(cand):
            return cand
    return None

def class_names(root="/kaggle/input"):
    for y in glob.glob(f"{root}/**/*.yaml", recursive=True):
        txt = open(y, encoding="utf-8", errors="ignore").read()
        if "names" in txt:
            import re
            m = re.search(r"names\s*:\s*\[([^\]]*)\]", txt)
            if m:
                return [n.strip().strip("'\"") for n in m.group(1).split(",") if n.strip()]
            lines = txt.split("names:", 1)[1].splitlines()
            names = []
            for ln in lines[1:]:
                ln = ln.strip()
                if not ln or (":" not in ln and not ln.startswith("-")):
                    break
                names.append(ln.split(":", 1)[-1].strip().lstrip("-").strip().strip("'\""))
            if names:
                return names
    return ["Pothole", "Speedbump", "Crack"]

def split_of(path):
    p = path.lower()
    for s, keys in (("val", ("/valid/", "/val/", "/validation/")), ("test", ("/test/",)), ("train", ("/train/",))):
        if any(k in p for k in keys):
            return s
    return None

# ── ٢) YOLO TXT ← COCO JSON (اللى YOLOX بيقراه) ──────────────────────────────
def to_coco(pairs, names, out_json, img_dir):
    from PIL import Image
    os.makedirs(img_dir, exist_ok=True)
    images, anns, aid = [], [], 1
    for i, (img, lab) in enumerate(pairs, 1):
        try:
            w, h = Image.open(img).size
        except Exception:
            continue
        fn = f"{i:06d}{os.path.splitext(img)[1].lower()}"
        dst = os.path.join(img_dir, fn)
        if not os.path.exists(dst):
            os.symlink(img, dst)
        images.append({"id": i, "file_name": fn, "width": w, "height": h})
        for line in open(lab, encoding="utf-8", errors="ignore"):
            parts = line.split()
            if len(parts) < 5:
                continue
            c, cx, cy, bw, bh = int(float(parts[0])), *map(float, parts[1:5])
            if not (0 <= c < len(names)) or bw <= 0 or bh <= 0:
                continue
            x, y = (cx - bw / 2) * w, (cy - bh / 2) * h
            anns.append({"id": aid, "image_id": i, "category_id": c + 1, "bbox": [x, y, bw * w, bh * h],
                         "area": bw * w * bh * h, "iscrowd": 0})
            aid += 1
    json.dump({"images": images, "annotations": anns,
               "categories": [{"id": k + 1, "name": n} for k, n in enumerate(names)]}, open(out_json, "w"))
    return len(images), len(anns)

def prepare():
    names = class_names()
    pairs = [(p, label_for(p)) for p in find_dataset()]
    pairs = [(i, l) for i, l in pairs if l]
    print(f"صور ليها مربعات: {len(pairs)} · الأنواع: {names}")
    by = {"train": [], "val": []}
    loose = []
    for p in pairs:
        s = split_of(p[0])
        (by["val"] if s in ("val", "test") else by["train"] if s == "train" else loose).append(p)
    random.seed(7)
    random.shuffle(loose)
    if not by["val"]:   # مفيش تقسيم جاهز ⇒ ١٥٪ للتقييم
        k = max(1, int(len(loose) * 0.15))
        by["val"], loose = loose[:k], loose[k:]
    by["train"] += loose
    data = f"{WORK}/coco"
    os.makedirs(f"{data}/annotations", exist_ok=True)
    for s in ("train", "val"):
        n, a = to_coco(by[s], names, f"{data}/annotations/instances_{s}2017.json", f"{data}/{s}2017")
        print(f"{s}: {n} صورة · {a} مربع")
    return names, data

# ── ٣) YOLOX (من غير onnx-simplifier اللى بيوقّع التثبيت) + أوزان Nano ────────
def install_yolox():
    if not os.path.exists(f"{WORK}/YOLOX"):
        sh(f"git clone --depth 1 https://github.com/Megvii-BaseDetection/YOLOX.git {WORK}/YOLOX")
    sh("pip install -q loguru thop tabulate pycocotools ninja tqdm")
    sh("pip install -q -e . --no-deps --no-build-isolation", cwd=f"{WORK}/YOLOX")
    w = f"{WORK}/yolox_nano.pth"
    if not os.path.exists(w):
        sh(f"wget -q -O {w} https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.pth")
    return w

EXP = '''
import os
from yolox.exp import Exp as MyExp
import torch.nn as nn

class Exp(MyExp):
    def __init__(self):
        super().__init__()
        self.depth, self.width = 0.33, 0.25
        self.input_size = self.test_size = ({img}, {img})
        self.random_size = (10, 20)
        self.mosaic_scale = (0.5, 1.5)
        self.enable_mixup = False
        self.num_classes = {nc}
        self.max_epoch = {ep}
        self.no_aug_epochs = 5
        self.eval_interval = 5
        self.data_num_workers = 4
        self.data_dir = "{data}"
        self.train_ann, self.val_ann = "instances_train2017.json", "instances_val2017.json"
        self.exp_name = "oscar_bumps"
        self.output_dir = "{work}/out"

    def get_model(self, sublinear=False):
        def init_yolo(M):
            for m in M.modules():
                if isinstance(m, nn.BatchNorm2d):
                    m.eps, m.momentum = 1e-3, 0.03
        if "model" not in self.__dict__:
            from yolox.models import YOLOX, YOLOPAFPN, YOLOXHead
            in_channels = [256, 512, 1024]
            backbone = YOLOPAFPN(self.depth, self.width, in_channels=in_channels, act=self.act, depthwise=True)
            head = YOLOXHead(self.num_classes, self.width, in_channels=in_channels, act=self.act, depthwise=True)
            self.model = YOLOX(backbone, head)
        self.model.apply(init_yolo)
        self.model.head.initialize_biases(1e-2)
        return self.model
'''

def main():
    t0 = time.time()
    names, data = prepare()
    weights = install_yolox()
    exp = f"{WORK}/oscar_bumps_exp.py"
    open(exp, "w").write(EXP.format(img=IMG, nc=len(names), ep=EPOCHS, data=data, work=WORK))
    import torch
    gpus = max(1, torch.cuda.device_count())
    print(f"GPU: {gpus} · لفات: {EPOCHS}")
    sh(f"python tools/train.py -f {exp} -d {gpus} -b {16 * gpus} --fp16 -o -c {weights}", cwd=f"{WORK}/YOLOX")
    best = glob.glob(f"{WORK}/out/oscar_bumps/best_ckpt.pth")[0]
    shutil.copy(best, f"{OUT}/oscar_bumps_yolox_nano.pth")
    # تقرير الدقة على صور التقييم (AP لكل نوع)
    sh(f"python tools/eval.py -f {exp} -c {best} -b 16 -d 1 --conf 0.001 > {OUT}/eval.txt 2>&1 || true", cwd=f"{WORK}/YOLOX")
    # ONNX للموبايل (ncnn/onnxruntime بعدين)
    sh(f"python tools/export_onnx.py -f {exp} -c {best} --output-name {OUT}/oscar_bumps_yolox_nano.onnx --no-onnxsim || true",
       cwd=f"{WORK}/YOLOX")
    json.dump({"classes": names, "input": IMG, "epochs": EPOCHS, "minutes": round((time.time() - t0) / 60)},
              open(f"{OUT}/model.json", "w"), ensure_ascii=False)
    print(open(f"{OUT}/eval.txt").read()[-3000:])
    print("خلص ✓ — الملفات فى", OUT, os.listdir(OUT))

if __name__ == "__main__" and "--dry" not in sys.argv:
    main()
