// «أقرب بنزينة» من صفحة الموبايل بداتا جوجل (المالك ٢٠٢٦-١١-٢٠: OpenStreetMap ناقصه محطات فى أسيوط، وخرايط جوجل بتطلّع الأقرب صح).
// Places API (New) — searchNearby بالأقرب (DISTANCE) فى ٢٥ كم، ٥ نتايج، الاسم والمكان والتليفون. محتاج سرّ GOOGLE_PLACES_KEY
// (مفتاح سيرفر — مفتاح الشاشة مقفول على تطبيق الأندرويد). من غيره ⇒ { places:false } والصفحة بتفتح بحث خرايط جوجل.
// التوفير: نفس المكان (≈٥٠٠ م) ونفس النوع ⇒ نفس النتيجة ٣٠ دقيقة، وحد ١٥٠ طلب فى اليوم (أقل من الحصة المجانية الشهرية).
'use strict';

const URL = 'https://places.googleapis.com/v1/places:searchNearby';
const key = () => process.env.GOOGLE_PLACES_KEY || '';
const TYPES = { fuel: 'gas_station', pharmacy: 'pharmacy', hospital: 'hospital', atm: 'atm', bank: 'bank', church: 'church', mosque: 'mosque',
  restaurant: 'restaurant', cafe: 'cafe', market: 'supermarket', mechanic: 'car_repair', tires: 'car_repair', wash: 'car_wash',
  police: 'police', parking: 'parking', hotel: 'hotel' };
const DAY_CAP = 150;
const CACHE_MS = 30 * 60000;
const cache = new Map();
let day = '', used = 0;

const cell = (kind, lat, lng) => kind + ':' + (Math.round(lat * 200) / 200) + ',' + (Math.round(lng * 200) / 200);

/** { places:true, results:[{name, lat, lng, phone}] } · { places:false } (مفيش مفتاح/الحد خلص/غلط). */
async function nearest(kind, lat, lng, opts = {}) {
  const k = opts.key !== undefined ? opts.key : key();
  const t = TYPES[kind];
  if (!k || !t || !Number.isFinite(lat) || !Number.isFinite(lng)) return { places: false };
  const c = cell(kind, lat, lng), now = Date.now();
  const hit = cache.get(c);
  if (hit && now - hit.at < CACHE_MS) return { places: true, results: hit.results, cached: true };
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; used = 0; }
  if (used >= DAY_CAP) return { places: false, capped: true };
  used++;
  try {
    const r = await (opts.fetch || fetch)(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': k,
        'X-Goog-FieldMask': 'places.displayName,places.location,places.nationalPhoneNumber' },
      body: JSON.stringify({ includedTypes: [t], maxResultCount: 5, rankPreference: 'DISTANCE', languageCode: 'ar',
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 25000 } } }),
    });
    if (!r.ok) return { places: false };
    const j = await r.json();
    const results = ((j && j.places) || []).map((p) => ({
      name: (p.displayName && p.displayName.text) || '', lat: p.location && p.location.latitude, lng: p.location && p.location.longitude,
      phone: p.nationalPhoneNumber || null,
    })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    cache.set(c, { at: now, results });
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return { places: true, results };
  } catch (e) { return { places: false }; }
}

module.exports = { nearest, TYPES, DAY_CAP, available: () => !!key() };
