'use strict';

/*
 * Amazon Creators API adapter.
 *
 * This module deliberately has no database knowledge. Credentials are read
 * from the process environment only, OAuth tokens are cached in memory for
 * the lifetime of this process, and API errors are normalized before they
 * reach the catalog or an admin page.
 *
 * Official API shape:
 *   POST https://api.amazon.co.uk/auth/o2/token (EU credentials)
 *   POST https://creatorsapi.amazon/catalog/v1/getItems
 *   Authorization: Bearer <token>
 *   x-marketplace: www.amazon.eg
 */

const API_BASE = 'https://creatorsapi.amazon';
const DEFAULT_MARKETPLACE = 'www.amazon.eg';
const DEFAULT_TOKEN_ENDPOINT = 'https://api.amazon.co.uk/auth/o2/token';
const DEFAULT_TIMEOUT_MS = 12000;
const MAX_BATCH = 10;

let cachedToken = null;

function value(env, ...names) {
  for (const name of names) {
    if (env[name] != null && String(env[name]).trim()) return String(env[name]).trim();
  }
  return '';
}

function getConfig(env = process.env) {
  const marketplace = value(env, 'AMAZON_CREATORS_API_MARKETPLACE', 'AMAZON_MARKETPLACE') || DEFAULT_MARKETPLACE;
  const partnerTag = value(env, 'AMAZON_ASSOCIATE_TAG', 'AMAZON_PARTNER_TAG') || 'oscardevs-21';
  const clientId = value(env, 'AMAZON_CREATORS_API_CLIENT_ID', 'AMAZON_CLIENT_ID');
  const clientSecret = value(env, 'AMAZON_CREATORS_API_CLIENT_SECRET', 'AMAZON_CLIENT_SECRET');
  const accessToken = value(env, 'AMAZON_CREATORS_API_ACCESS_TOKEN');
  const tokenEndpoint = value(env, 'AMAZON_CREATORS_API_TOKEN_URL') || DEFAULT_TOKEN_ENDPOINT;
  const missing = [];
  if (!clientId && !accessToken) missing.push('AMAZON_CREATORS_API_CLIENT_ID');
  if (!clientSecret && !accessToken) missing.push('AMAZON_CREATORS_API_CLIENT_SECRET');
  if (!partnerTag) missing.push('AMAZON_ASSOCIATE_TAG');
  return {
    marketplace, partnerTag, clientId, clientSecret, accessToken, tokenEndpoint,
    configured: missing.length === 0,
    missing,
  };
}

function publicConfigStatus(env = process.env) {
  const config = getConfig(env);
  return {
    configured: config.configured,
    marketplace: config.marketplace,
    partnerTag: config.partnerTag,
    missing: config.missing,
    authMode: config.accessToken ? 'access_token' : 'oauth2',
  };
}

function apiError(message, code = 'AMAZON_API_ERROR', status = null) {
  const error = new Error(String(message || 'Amazon Creators API request failed').slice(0, 240));
  error.code = code;
  error.status = status;
  return error;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error && error.name === 'AbortError') throw apiError('Amazon API request timed out', 'TIMEOUT');
    throw apiError('Amazon API network request failed', 'NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
  }
}

async function responseJson(response) {
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_error) { body = null; }
  if (!response.ok) {
    const code = response.status === 429 ? 'RATE_LIMIT' : `HTTP_${response.status}`;
    throw apiError(code === 'RATE_LIMIT' ? 'Amazon API rate limit reached' : 'Amazon API rejected the request', code, response.status);
  }
  if (!body || typeof body !== 'object') throw apiError('Amazon API returned an invalid response', 'INVALID_RESPONSE', response.status);
  return body;
}

async function getAccessToken(config) {
  if (config.accessToken) return config.accessToken;
  if (!config.configured) throw apiError('Amazon Creators API credentials are not configured', 'NOT_CONFIGURED');
  const now = Date.now();
  if (cachedToken && cachedToken.clientId === config.clientId && cachedToken.expiresAt > now + 60000) {
    return cachedToken.token;
  }

  const response = await fetchWithTimeout(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: 'creatorsapi::default',
    }),
  });
  const body = await responseJson(response);
  if (!body.access_token) throw apiError('Amazon API did not return an access token', 'AUTH_ERROR', response.status);
  cachedToken = {
    clientId: config.clientId,
    token: String(body.access_token),
    expiresAt: now + Math.max(60000, Number(body.expires_in || 3600) * 1000),
  };
  return cachedToken.token;
}

function splitIntoBatches(values, size = MAX_BATCH) {
  const batches = [];
  for (let i = 0; i < values.length; i += size) batches.push(values.slice(i, i + size));
  return batches;
}

async function getItemsByAsins(asins, options = {}) {
  const config = getConfig(options.env || process.env);
  if (!config.configured) throw apiError('Amazon Creators API credentials are not configured', 'NOT_CONFIGURED');
  const cleanAsins = [...new Set((asins || []).map((asin) => String(asin || '').trim().toUpperCase())
    .filter((asin) => /^[A-Z0-9]{6,20}$/.test(asin)))];
  if (!cleanAsins.length) return [];
  const token = await getAccessToken(config);
  const output = [];
  for (const batch of splitIntoBatches(cleanAsins)) {
    const response = await fetchWithTimeout(`${API_BASE}/catalog/v1/getItems`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'x-marketplace': config.marketplace,
      },
      body: JSON.stringify({
        itemIds: batch,
        itemIdType: 'ASIN',
        marketplace: config.marketplace,
        partnerTag: config.partnerTag,
        resources: [
          'images.primary.large',
          'images.primary.medium',
          'itemInfo.title',
          'itemInfo.byLineInfo',
          'offersV2.listings.price',
          'offersV2.listings.availability',
        ],
      }),
    });
    const body = await responseJson(response);
    const items = body.itemsResult && Array.isArray(body.itemsResult.items)
      ? body.itemsResult.items
      : [];
    output.push(...items.map((item) => normalizeItem(item, config)));
  }
  return output;
}

function displayValue(valueToRead) {
  if (valueToRead == null) return null;
  if (typeof valueToRead === 'string' || typeof valueToRead === 'number') return String(valueToRead);
  if (typeof valueToRead === 'object') {
    for (const key of ['displayValue', 'displayValueText', 'value', 'label', 'type']) {
      if (valueToRead[key] != null && (typeof valueToRead[key] === 'string' || typeof valueToRead[key] === 'number')) {
        return String(valueToRead[key]);
      }
    }
  }
  return null;
}

function parseMoney(valueToRead) {
  if (valueToRead == null) return null;
  if (typeof valueToRead === 'object') {
    for (const key of ['amount', 'value', 'displayAmount', 'money', 'moneyAmount']) {
      const parsed = parseMoney(valueToRead[key]);
      if (parsed != null) return parsed;
    }
    return null;
  }
  const normalized = String(valueToRead).replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}(?:\D|$))/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
}

function firstImage(item) {
  const primary = item && item.images && item.images.primary;
  if (!primary) return null;
  for (const key of ['large', 'medium', 'small', 'hiRes']) {
    const image = primary[key];
    const url = image && (image.url || image.link);
    if (typeof url === 'string' && /^https:\/\//i.test(url)) return url;
  }
  return null;
}

function firstOffer(item) {
  const offers = item && item.offersV2 && item.offersV2.listings;
  return Array.isArray(offers) && offers.length ? offers[0] : null;
}

function buildAffiliateUrl(rawUrl, asin, config) {
  let url = null;
  try { url = rawUrl ? new URL(rawUrl) : new URL(`https://${config.marketplace}/dp/${asin}`); } catch (_error) { return null; }
  if (!/(^|\.)amazon\.[a-z.]{2,10}$/i.test(url.hostname)) return null;
  url.searchParams.set('tag', config.partnerTag);
  return url.toString();
}

function normalizeItem(item, config) {
  const asin = String(item && item.asin || '').trim().toUpperCase();
  const title = displayValue(item && item.itemInfo && item.itemInfo.title);
  const brand = displayValue(item && item.itemInfo && item.itemInfo.byLineInfo && (
    item.itemInfo.byLineInfo.brand || item.itemInfo.byLineInfo.contributors
  ));
  const offer = firstOffer(item);
  const price = offer && offer.price ? parseMoney(offer.price) : null;
  const availability = offer && offer.availability ? displayValue(offer.availability) : null;
  return {
    asin,
    title: title ? title.slice(0, 180) : null,
    brand: brand ? brand.slice(0, 120) : null,
    imageUrl: firstImage(item),
    detailUrl: typeof item.detailPageURL === 'string' ? item.detailPageURL : null,
    affiliateUrl: buildAffiliateUrl(item.detailPageURL, asin, config),
    price,
    availability: availability ? availability.slice(0, 120) : null,
  };
}

module.exports = {
  API_BASE,
  DEFAULT_MARKETPLACE,
  MAX_BATCH,
  apiError,
  getConfig,
  getItemsByAsins,
  normalizeItem,
  publicConfigStatus,
  splitIntoBatches,
};