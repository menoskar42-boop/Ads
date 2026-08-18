'use strict';
/**
 * What a file IS, not what the uploader said it is.
 *
 * Every uploader in this project filtered on `file.mimetype`. That value is not
 * a fact about the file — it is a string the client typed into the multipart
 * part header. `curl -F "image_file=@shell.html;type=image/png"` walks straight
 * through `/^image\/(png|jpeg|gif|webp)$/`. And the saved name took its
 * extension from `originalname`, another client-supplied string, so the file
 * landed in `public/uploads` as `product-7-1699.html`.
 *
 * Serving is already defended (`nosniff` plus a sandbox CSP on /uploads, in
 * server.js). This is the other half: **do not store a lie**. Defence at the
 * door and defence at the exit protect against different mistakes, and the one
 * at the door is the one that keeps the wrong bytes out of Object Storage, out
 * of backups, and out of whatever serves these files next year.
 *
 * Two rules:
 *
 *  1. The extension comes from the DECLARED type, which the fileFilter has
 *     already restricted to a short list — never from `originalname`. That
 *     alone makes `.html`, `.svg` and `.php` unreachable as saved names.
 *
 *  2. After multer writes the file, the first bytes are read and matched
 *     against the format's signature. A mismatch deletes the file and answers
 *     415. Not a silent no-op: a merchant whose upload vanished with a green
 *     tick will upload it again, and again.
 *
 * CSV has no signature and is deliberately not covered — see `FAMILIES`.
 */
const fs = require('fs');

/** ext ← declared mime. Only types some fileFilter already allowed get here. */
const EXT_FOR_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heic',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/x-matroska': '.mkv',
  'video/x-msvideo': '.avi',
  'video/mpeg': '.mpeg',
  'video/3gpp': '.3gp',
  'video/3gpp2': '.3g2',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/webm': '.weba',
  'audio/ogg': '.ogg',
  'application/dicom': '.dcm',
};

function extForMime(mime, fallback) {
  return EXT_FOR_MIME[String(mime || '').toLowerCase()] || fallback || '.bin';
}

const ascii = (buf, from, len) => buf.slice(from, from + len).toString('latin1');

/**
 * Identify a file from its opening bytes. Returns a short kind, or null when
 * nothing matched — null always means reject, never "probably fine".
 */
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  // DICOM puts a 128-byte preamble before its 'DICM' marker — the only format
  // here whose signature is not at the start, which is why heads are read 144
  // bytes deep rather than the 16 the rest need.
  if (buf.length >= 132 && ascii(buf, 128, 4) === 'DICM') return 'dicom';
  if (buf[0] === 0x89 && ascii(buf, 1, 3) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (ascii(buf, 0, 6) === 'GIF87a' || ascii(buf, 0, 6) === 'GIF89a') return 'gif';
  if (ascii(buf, 0, 4) === 'RIFF') {
    const tag = ascii(buf, 8, 4);
    if (tag === 'WEBP') return 'webp';
    if (tag === 'AVI ') return 'avi';
    if (tag === 'WAVE') return 'wav';
  }
  // MP4 / MOV / 3GP / M4A / HEIC all carry 'ftyp' at offset 4 — they are the
  // same container. Only the brand that follows separates a phone photo from a
  // video, and a phone photo is exactly what a receipt upload is, so the brand
  // has to be read: without it every iPhone HEIC would be rejected as a video.
  if (ascii(buf, 4, 4) === 'ftyp') {
    const brand = ascii(buf, 8, 4);
    return /^(heic|heix|heim|heis|hevc|hevx|mif1|msf1|avif)$/.test(brand) ? 'heic' : 'mp4';
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'matroska'; // webm/mkv
  if (ascii(buf, 0, 4) === 'OggS') return 'ogg';
  if (ascii(buf, 0, 3) === 'ID3') return 'mp3';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';               // bare MPEG frame
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && (buf[3] === 0xba || buf[3] === 0xb3)) return 'mpeg';
  return null;
}

/**
 * Which kinds each uploader is allowed to end up with.
 *
 * There is no `sheet` family: XLSX would be easy (`PK\x03\x04`) but CSV has no
 * signature at all, so a byte check there would either reject every valid CSV
 * or wave everything through. That uploader is parsed by a real spreadsheet
 * reader which fails loudly on rubbish — a different, adequate defence.
 */
const FAMILIES = {
  image: ['png', 'jpg', 'gif', 'webp', 'heic'],
  video: ['mp4', 'matroska', 'avi', 'mpeg'],
  audio: ['mp3', 'mp4', 'wav', 'ogg', 'matroska'],
};
FAMILIES.dicom = ['dicom'];
FAMILIES.media = FAMILIES.image.concat(FAMILIES.video);
FAMILIES.av = FAMILIES.audio.concat(FAMILIES.video);

/** Every file multer attached, whichever shape it used. */
function filesOf(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') {
    return Object.values(req.files).reduce((a, v) => a.concat(v || []), []);
  }
  return [];
}

const HEAD = 144;   // enough for DICOM's 128-byte preamble + 'DICM'

function headOf(file) {
  if (file.buffer) return file.buffer.slice(0, HEAD);
  if (!file.path) return null;
  const fd = fs.openSync(file.path, 'r');
  try {
    const b = Buffer.alloc(HEAD);
    const n = fs.readSync(fd, b, 0, HEAD, 0);
    return b.slice(0, n);
  } finally { fs.closeSync(fd); }
}

function drop(file) {
  if (file && file.path) { try { fs.unlinkSync(file.path); } catch (e) { /* already gone */ } }
}

/**
 * Middleware to run straight after multer. Verifies every attached file
 * against `family` and refuses the request if any of them is not what it
 * claimed to be.
 */
function verify(family) {
  const allowed = FAMILIES[family];
  if (!allowed) throw new Error('unknown upload family: ' + family);
  return function verifyUpload(req, res, next) {
    const files = filesOf(req);
    for (const f of files) {
      let kind = null;
      try { kind = sniff(headOf(f)); } catch (e) { kind = null; }
      if (kind && allowed.includes(kind)) continue;
      files.forEach(drop);
      req.file = undefined; req.files = undefined;
      console.warn('[upload] refused', f.originalname, 'declared', f.mimetype, 'actually', kind || 'unknown');
      res.status(415);
      if (req.accepts && req.accepts('html')) {
        return res.send('<!doctype html><meta charset="utf-8"><title>415</title>'
          + '<p style="font:16px/1.6 system-ui;padding:2rem;direction:rtl">'
          + 'الملف ده مش صورة/فيديو حقيقي — الاسم أو النوع بيقول حاجة والمحتوى حاجة تانية. '
          + 'ارجع وارفع الملف الأصلي.</p>');
      }
      return res.json({ ok: false, error: 'file_type' });
    }
    return next();
  };
}

/**
 * Wrap a multer middleware so the byte check always runs with it.
 *
 *   const uploadLogo = uploads.guard(makeUploader('logo').single('logo_file'), 'image');
 *
 * The result keeps multer's exact shape — `(req, res, next)` — so it works
 * both as a route middleware and as the manual `uploadLogo(req, res, cb)` call
 * these routes use to catch multer's own errors. Wrapping at the definition
 * means the check cannot be left off one route out of fourteen, which is the
 * only way this stays true; `check-upload-type.js` enforces that no `.single(`
 * / `.fields(` / `.array(` escapes into a route unwrapped.
 */
function guard(multerMiddleware, family) {
  const verifier = verify(family);
  return function guardedUpload(req, res, next) {
    multerMiddleware(req, res, (err) => {
      if (err) return next(err);          // multer's own limit/filter errors
      verifier(req, res, next);           // answers 415 itself and never calls next
    });
  };
}

module.exports = {
  sniff, extForMime, verify, guard, FAMILIES, EXT_FOR_MIME,
  /** Extension from the DECLARED type, never from the client's filename. */
  extname: (file, fallback) => extForMime(file && file.mimetype, fallback),
};
