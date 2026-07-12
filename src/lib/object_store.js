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

// The @replit/object-storage Client constructor eagerly kicks off an async
// init() and stores ONLY the promise (this.state.promise). When no bucket is
// configured, init() calls getDefaultBucketId() which fetches the Replit storage
// sidecar and REJECTS — and because nothing attaches a .catch to that stored
// promise, it becomes an UNHANDLED REJECTION that crashes Node 22 at boot
// (deploy healthcheck 500 → crash loop). So we: (1) pass an explicit bucketId
// when one is configured (init then never fetches the sidecar), and (2) always
// attach a .catch to the init promise so a failure just disables the mirror
// instead of taking the whole app down.
let client = null;
try {
  const { Client } = require('@replit/object-storage');
  const bucketId = process.env.OBJECT_STORAGE_BUCKET_ID
    || process.env.REPLIT_OBJECT_STORAGE_BUCKET_ID
    || process.env.REPLIT_DEFAULT_BUCKET_ID || '';
  client = bucketId ? new Client({ bucketId }) : new Client();
  const initPromise = client && client.state && client.state.promise;
  if (initPromise && typeof initPromise.catch === 'function') {
    initPromise.catch((e) => {
      console.warn('[object_store] init failed — mirror disabled (local-only):', (e && e.message) || e);
      client = null;
    });
  }
} catch (_) { client = null; /* not installed/configured — local-only fallback */ }

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
