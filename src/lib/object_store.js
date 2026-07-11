'use strict';

// ── Persistent object storage for user uploads ───────────────────────────────
// Replit Autoscale has an EPHEMERAL filesystem: files written to public/uploads
// at runtime are wiped on every redeploy, so merchant logos/product images/
// banners break over time. This mirrors every upload into Replit Object Storage
// (persistent) and serves it back when the local copy is gone. Fully optional:
// if Object Storage isn't configured, everything falls back to local-only with
// zero behaviour change.
const fs = require('fs');
const path = require('path');

let client = null;
try {
  const { Client } = require('@replit/object-storage');
  client = new Client();
} catch (_) { /* not installed/configured — local-only fallback */ }

function enabled() { return !!client; }

async function put(key, buffer) {
  if (!client) return false;
  try { const r = await client.uploadFromBytes('uploads/' + key, buffer); return !!(r && r.ok); }
  catch (e) { console.warn('[object_store] put:', e.message); return false; }
}

async function get(key) {
  if (!client) return null;
  try {
    const r = await client.downloadAsBytes('uploads/' + key);
    return (r && r.ok && r.value && r.value[0]) ? r.value[0] : null;
  } catch (_) { return null; }
}

// Mirror a finalized local upload into the bucket (best-effort — never throws).
async function mirror(absPath) {
  if (!client || !absPath) return;
  try {
    if (!fs.existsSync(absPath)) return;
    await put(path.basename(absPath), fs.readFileSync(absPath));
  } catch (_) { /* best-effort */ }
}

module.exports = { enabled, put, get, mirror };
