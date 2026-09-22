const sharp = require('sharp');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const DATA_DIR = require('./datadir');
const r2 = require('./r2');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ── Image upload ──────────────────────────────────────────────────────────────

const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('يُسمح برفع الصور فقط.'));
    }
    cb(null, true);
  },
});

async function compressAndSave(buffer, prefix) {
  ensureUploadDir();
  const filename = `${prefix}_${Date.now()}.jpg`;
  const dest = path.join(UPLOAD_DIR, filename);
  await sharp(buffer)
    .rotate()
    .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: true })
    .toFile(dest);
  return filename;
}

async function compressToBuffer(buffer, prefix) {
  const filename = `${prefix}_${Date.now()}.jpg`;
  const data = await sharp(buffer)
    .rotate()
    .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: true })
    .toBuffer();
  try {
    ensureUploadDir();
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), data);
  } catch {}
  return { filename, data };
}

/**
 * بيحاول يحطّ الملف على Cloudflare R2. بيرجّع اللى يتكتب فى الصف:
 *   نجح   → { storageKey: '<key>', data: null }   الملف برّه القاعدة
 *   فشل   → { storageKey: null,    data: <Buffer> } السلوك القديم بالظبط
 *
 * ⚠️ القاعدة اللى الملف ده قايم عليها: **مابنسيبش `data` فاضى إلا لما يكون
 * الرفع نجح فعلاً.** أى فشل (أسرار ناقصة، شبكة، ٤٠٣ من R2) بيرجّع الـBuffer
 * فالصورة بتتخزّن فى القاعدة زى الأول ومابتضيعش أبداً. أسوأ حالة = المساحة
 * ما تقلّش، مش صورة مكسورة.
 */
async function storeMedia(filename, buffer, mediaType = 'photo') {
  if (!r2.isConfigured()) return { storageKey: null, data: buffer };
  const key = r2.keyFor(filename, mediaType);
  try {
    await r2.putObject(key, buffer, mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
    return { storageKey: key, data: null };
  } catch (e) {
    console.error(`[maintenance] فشل رفع ${filename} على R2 — هيتخزّن فى القاعدة بدلها:`, e.message);
    return { storageKey: null, data: buffer };
  }
}

/**
 * بيضيف صورة لأرشيف ZIP من أى مكان هى فيه: القرص ← عمود data ← R2.
 * قبل كده التلات مسارات بتوع التنزيل كانوا بيدوّروا على القرص و`data` بس —
 * فالصورة اللى راحت R2 (و`data` فيها NULL) كانت **بتتساب من الـZIP فى صمت**:
 * الملف ينزل ناقص ومحدّش يعرف إن فيه صور ضايعة منه.
 * بترجّع true لو الصورة اتضافت.
 */
async function appendMediaToArchive(archive, p, name, uploadsDir = UPLOAD_DIR) {
  const filePath = path.join(uploadsDir, p.filename);
  if (fs.existsSync(filePath)) { archive.file(filePath, { name }); return true; }
  if (p.data) { archive.append(p.data, { name }); return true; }
  if (p.storage_key) {
    try {
      const obj = await r2.getObject(p.storage_key);
      if (obj) { archive.append(obj.body, { name }); return true; }
      console.warn(`[maintenance] ZIP: ${p.filename} ليه storage_key بس مش موجود على R2`);
    } catch (e) {
      console.error(`[maintenance] ZIP: فشل قراءة ${p.filename} من R2:`, e.message);
    }
  }
  return false;
}

// ── Video upload + compression ────────────────────────────────────────────────

const memVideoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) {
      return cb(new Error('يُسمح برفع الفيديوهات فقط.'));
    }
    cb(null, true);
  },
});

/**
 * Compress a video buffer to disk using ffmpeg.
 * Returns { filename } — no BYTEA (videos are too large for DB storage).
 */
async function compressVideoToDisk(buffer, prefix) {
  let ffmpeg, ffmpegPath;
  try {
    ffmpegPath = require('ffmpeg-static');
    ffmpeg     = require('fluent-ffmpeg');
    if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
  } catch (e) {
    throw new Error('ffmpeg غير متاح على الخادم: ' + e.message);
  }

  ensureUploadDir();
  const ts         = Date.now();
  const inputPath  = path.join(UPLOAD_DIR, `${prefix}_in_${ts}.tmp`);
  const outputName = `${prefix}_${ts}.mp4`;
  const outputPath = path.join(UPLOAD_DIR, outputName);

  fs.writeFileSync(inputPath, buffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          '-preset ultrafast',
          '-crf 28',
          '-vf scale=1280:-2',
          '-c:a aac',
          '-b:a 96k',
          '-movflags +faststart',
        ])
        .output(outputPath)
        .on('end', resolve)
        .on('error', (err) => reject(err))
        .run();
    });
    return { filename: outputName };
  } finally {
    try { fs.unlinkSync(inputPath); } catch {}
  }
}

module.exports = { memUpload, compressAndSave, compressToBuffer, storeMedia, appendMediaToArchive, memVideoUpload, compressVideoToDisk };
