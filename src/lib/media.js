// Media compression helpers — used when merchants upload product images/videos.
//
// Images   → re-encoded with `sharp` (resize huge photos + smart quality) so the
//            storefront stays fast without any visible quality loss.
// Videos   → re-encoded with `ffmpeg` (H.264, CRF, 720p cap, faststart) to shrink
//            the file dramatically while keeping it crisp.
//
// Everything fails *open*: if a library/binary is missing or a file can't be
// processed, we keep the original upload instead of breaking the request.

const path = require('path');
const fs = require('fs');

let sharp = null;
try {
  sharp = require('sharp');
} catch (err) {
  console.warn('[media] sharp not available, images stored as-is:', err.message);
}

let ffmpeg = null;
try {
  ffmpeg = require('fluent-ffmpeg');
  try {
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
    if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
  } catch (_) { /* fall back to system ffmpeg on PATH if present */ }
} catch (err) {
  console.warn('[media] fluent-ffmpeg not available, videos stored as-is:', err.message);
}

const COMPRESSIBLE_IMAGE = /\.(png|jpe?g|webp)$/i; // svg/gif are left untouched

/**
 * Compress an uploaded image in place. Resizes anything wider than 1600px and
 * re-encodes at a high visual-quality setting. Keeps the result only if it's
 * actually smaller than the original. Returns nothing useful — the file path
 * is unchanged so callers don't need to update the stored URL.
 */
async function compressImage(absPath) {
  if (!sharp || !absPath || !COMPRESSIBLE_IMAGE.test(absPath)) return;
  if (!fs.existsSync(absPath)) return;
  const ext = path.extname(absPath).toLowerCase();
  const tmp = absPath + '.tmp';
  try {
    let img = sharp(absPath, { failOn: 'none' }).rotate(); // honour EXIF orientation
    const meta = await img.metadata();
    if (meta.width && meta.width > 1600) {
      img = img.resize({ width: 1600, withoutEnlargement: true });
    }
    if (ext === '.png') img = img.png({ quality: 82, compressionLevel: 9, palette: true });
    else if (ext === '.webp') img = img.webp({ quality: 82 });
    else img = img.jpeg({ quality: 82, mozjpeg: true });

    await img.toFile(tmp);
    const origSize = fs.statSync(absPath).size;
    const newSize = fs.statSync(tmp).size;
    if (newSize > 0 && newSize < origSize) {
      fs.renameSync(tmp, absPath);
    } else {
      fs.unlinkSync(tmp);
    }
  } catch (err) {
    console.warn('[media] compressImage failed, keeping original:', err.message);
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
  }
}

/**
 * Compress an uploaded video. Re-encodes to a web-friendly H.264/AAC .mp4
 * (720p cap, CRF 28, +faststart for instant streaming). On success the original
 * file is removed and the new .mp4 path is returned; on any failure the original
 * path is returned unchanged so the upload still works.
 *
 * @returns {Promise<string>} absolute path of the file to serve
 */
function compressVideo(absPath) {
  return new Promise((resolve) => {
    if (!ffmpeg || !absPath || !fs.existsSync(absPath)) return resolve(absPath);
    const dir = path.dirname(absPath);
    const base = path.basename(absPath, path.extname(absPath));
    const out = path.join(dir, base + '.mp4');
    const tmp = path.join(dir, base + '.enc.mp4');
    try {
      ffmpeg(absPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate('128k')
        .outputOptions([
          '-crf', '28',
          '-preset', 'veryfast',
          '-movflags', '+faststart',
          '-pix_fmt', 'yuv420p',
          // cap height at 720, never upscale, keep dimensions even
          '-vf', "scale='trunc(iw/2)*2':'min(720,trunc(ih/2)*2)'",
        ])
        .on('end', () => {
          try {
            const newSize = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
            if (newSize > 0) {
              if (fs.existsSync(absPath) && path.resolve(absPath) !== path.resolve(out)) {
                fs.unlinkSync(absPath);
              }
              fs.renameSync(tmp, out);
              return resolve(out);
            }
          } catch (err) {
            console.warn('[media] compressVideo finalize failed:', err.message);
          }
          resolve(absPath);
        })
        .on('error', (err) => {
          console.warn('[media] compressVideo failed, keeping original:', err.message);
          try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
          resolve(absPath);
        })
        .save(tmp);
    } catch (err) {
      console.warn('[media] compressVideo threw, keeping original:', err.message);
      resolve(absPath);
    }
  });
}

module.exports = { compressImage, compressVideo };
