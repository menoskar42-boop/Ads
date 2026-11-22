'use strict';

// ── SSRF guard for browser/fetch actions ─────────────────────────────────────
// Browser actions accept a user-supplied URL. Without a guard, a request could
// be aimed at localhost, the private network, or the cloud metadata endpoint
// (169.254.169.254) to exfiltrate credentials/internal data. assertSafeUrl()
// allows only http/https to PUBLIC hosts: it rejects private/loopback/link-local
// literals AND resolves the hostname via DNS to catch names that point at a
// private address (basic anti-DNS-rebinding). Throws on anything unsafe.
const dns = require('dns').promises;
const net = require('net');

function isPrivateIP(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;             // link-local + cloud metadata
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // 172.16/12
    if (p[0] === 192 && p[1] === 168) return true;             // 192.168/16
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT 100.64/10
    return false;
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::') return true;
    if (l.startsWith('fc') || l.startsWith('fd')) return true; // unique-local fc00::/7
    if (l.startsWith('fe80')) return true;                      // link-local
    const m = l.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/);           // IPv4-mapped
    if (m) return isPrivateIP(m[1]);
    return false;
  }
  return false;
}

async function assertSafeUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch (_) { throw new Error('invalid url'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http/https allowed');
  // Collapse accidental double slashes in the path (a model often builds
  // ".../ar//used-cars", which many sites 404). Never touch the protocol's "//".
  if (u.pathname) u.pathname = u.pathname.replace(/\/{2,}/g, '/');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) throw new Error('missing host');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.endsWith('.internal') || host === 'metadata.google.internal') {
    throw new Error('blocked host');
  }
  if (net.isIP(host)) {
    if (isPrivateIP(host)) throw new Error('blocked private address');
    return u.href;
  }
  const addrs = await resolveHost(host);
  if (!addrs || !addrs.length) throw new Error('dns resolution failed');
  for (const ip of addrs) { if (isPrivateIP(ip)) throw new Error('resolves to a private address'); }
  return u.href;
}

// Resolve a hostname robustly: the OS resolver (dns.lookup) can be flaky in some
// containers (Replit), so we ALSO try direct A/AAAA queries (dns.resolve4/6) and
// retry once. A single transient failure shouldn't block a legitimate public site.
async function resolveHost(host) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const a = await dns.lookup(host, { all: true }); if (a && a.length) return a.map((x) => x.address); } catch (_) {}
    try {
      const v4 = await dns.resolve4(host).catch(() => []);
      const v6 = await dns.resolve6(host).catch(() => []);
      const all = (v4 || []).concat(v6 || []);
      if (all.length) return all;
    } catch (_) {}
    if (attempt === 0) await new Promise((r) => setTimeout(r, 350));
  }
  return null;
}

module.exports = { assertSafeUrl, isPrivateIP };
