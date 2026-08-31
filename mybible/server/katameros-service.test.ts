import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import { createServer, request as httpRequest, type Server } from 'node:http';
import {
  clearKatamerosCache,
  getStTaklaKatamerosDay,
  parseDayLinks,
  parseReadingVerses,
  toDailyReadingsCompatibility,
  type KatamerosDay,
} from './katameros-service';
import { registerRoutes } from './routes';

const realFetch = globalThis.fetch;

function response(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function requestJson(url: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, result => {
      const chunks: Buffer[] = [];
      result.on('data', chunk => chunks.push(Buffer.from(chunk)));
      result.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ status: result.statusCode ?? 0, body: JSON.parse(text) });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function dayHtml(readings: string): string {
  return `
    <p>قراءات اليوم من الأسبوع القبطي</p>
    ${readings}
  `;
}

function readingLink(section: string, reference: string, id: string): string {
  return `
    <p>${section}</p>
    <a href="/zJ/index.php?view=today_bible&id=${id}">${reference}</a>
  `;
}

const versePage = (chapter: string, verse: string, text: string) => `
  <table>
    <tr><td>الفصل ${chapter}</td></tr>
    <tr><td><sup>${verse}</sup></td><td>${text}</td></tr>
  </table>
`;

describe('Katameros St-Takla parser', () => {
  beforeEach(() => {
    clearKatamerosCache();
    globalThis.fetch = realFetch;
  });

  it('classifies all supported reading sections and keeps their links', () => {
    const parsed = parseDayLinks(dayHtml([
      readingLink('العشية', 'مزمور العشية', 'vespers'),
      readingLink('باكر', 'إنجيل باكر', 'matins'),
      readingLink('البولس', 'رومية 1:1-5', 'pauline'),
      readingLink('الكاثوليكون', 'يعقوب 1:1-4', 'catholic'),
      readingLink('الإبركسيس', 'أعمال 1:1-8', 'praxis'),
      readingLink('الإنجيل', 'مزمور 50', 'psalm'),
      readingLink('الإنجيل', 'إنجيل متى 5:1-12', 'gospel'),
    ].join('\n')));

    assert.deepEqual(parsed.readings.map(reading => reading.section), [
      'vespers',
      'matins',
      'pauline',
      'catholic',
      'praxis',
      'gospel',
      'gospel',
    ]);
    assert.equal(parsed.readings[2].reference, 'رومية 1:1-5');
    assert.match(parsed.readings[2].sourceUrl, /view=today_bible&id=pauline/);
    assert.equal(parsed.readings[5].label, 'الإنجيل');
  });

  /* السنكسار سيرة قديس، وروابطه مش `view=today_bible`. الاختبار ده هو اللي
   * بيمسك الغلط الأصلي: النسخة الأولى كانت بتقرا المزمور والإنجيل من
   * السنكسار، فلو حد رجّعها تاني الاتنين يرجعوا فاضيين. */
  it('ignores synaxarium links and still fills the liturgy psalm and gospel', () => {
    const parsed = parseDayLinks(dayHtml([
      readingLink('البولس', 'عبرانيين 11:32', 'pauline'),
      '<p>السنكسار</p><a href="?view=synaxarium&id=s1">استشهاد القديس مرقس</a>',
      readingLink('الإنجيل', 'مزمور 116:15', 'psalm'),
      readingLink('الإنجيل', 'يوحنا 12:24-26', 'gospel'),
    ].join('\n')));

    assert.equal(
      parsed.readings.some(reading => reading.section === 'synaxarium'), false,
      'رابط السنكسار مش قراءة كتابية ولا يتسجّل',
    );

    const body = toDailyReadingsCompatibility({
      date: '2026-08-31',
      sourcePageUrl: 'https://st-takla.org/day',
      sourceIndexUrl: 'https://st-takla.org/index',
      title: 'يوم تجريبي',
      readings: parsed.readings.map(reading => ({
        ...reading,
        verses: [{ chapter: 1, verse: 1, text: 'نص' }],
        status: 'ok' as const,
      })),
    });
    assert.equal(body.psalm.title, 'مزمور 116:15');
    assert.equal(body.gospel.title, 'يوحنا 12:24-26');
    assert.equal(body.psalm.slides.length, 1);
    assert.equal(body.gospel.slides.length, 1);
  });

  it('extracts Arabic numerals and resets the chapter at a boundary', () => {
    const verses = parseReadingVerses(`
      <table>
        <tr><td>الفصل ١</td></tr>
        <tr><td><sup>١</sup></td><td>النص الأول</td></tr>
        <tr><td><sup>٢</sup></td><td>النص الثاني</td></tr>
        <tr><td>الفصل ٢</td></tr>
        <tr><td><sup>١</sup></td><td>بداية الفصل الثاني</td></tr>
      </table>
    `);

    assert.deepEqual(verses, [
      { chapter: 1, verse: 1, text: 'النص الأول' },
      { chapter: 1, verse: 2, text: 'النص الثاني' },
      { chapter: 2, verse: 1, text: 'بداية الفصل الثاني' },
    ]);
  });

  it('returns no readings for an upstream page with no available links', () => {
    const parsed = parseDayLinks(dayHtml('<p>لا توجد قراءات متاحة لهذا اليوم</p>'));
    assert.equal(parsed.readings.length, 0);
  });

  it('marks a linked reading unavailable when its source page fails', async () => {
    globalThis.fetch = async input => {
      if (String(input).includes('today-arabic')) {
        return response(dayHtml(readingLink('البولس', 'رومية 1:1', 'failed-reading')));
      }
      throw new Error('upstream unavailable');
    };

    const day = await getStTaklaKatamerosDay('2099-01-02');
    assert.equal(day.readings.length, 1);
    assert.equal(day.readings[0].status, 'unavailable');
    assert.deepEqual(day.readings[0].verses, []);
    assert.match(day.readings[0].error ?? '', /upstream unavailable/);
  });
});

describe('Katameros service and API contracts', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = express();
    app.use((request, _response, next) => {
      (request as any).session = { userId: 'katameros-test-user' };
      (request as any).sessionID = 'katameros-test-session';
      next();
    });
    server = createServer(app);
    await registerRoutes(server, app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    globalThis.fetch = realFetch;
  });

  beforeEach(() => {
    clearKatamerosCache();
  });

  it('rejects invalid Katameros dates before contacting St-Takla', async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return response('');
    };

    const result = await requestJson(`${baseUrl}/api/orthodox/katameros?date=2026-02-30`);
    assert.equal(result.status, 503);
    assert.equal(called, false);
  });

  it('returns 503 when the Katameros upstream fails', async () => {
    globalThis.fetch = async () => {
      throw new Error('St-Takla down');
    };

    const result = await requestJson(`${baseUrl}/api/orthodox/katameros?date=2026-08-27`);
    const body = result.body as { status: string; source: string };
    assert.equal(result.status, 503);
    assert.equal(body.status, 'error');
    assert.equal(body.source, 'St-Takla.org');
  });

  it('keeps the legacy daily-readings payload compatible with St-Takla data', async () => {
    globalThis.fetch = async input => {
      const url = String(input);
      if (url.includes('today-arabic')) {
        return response(dayHtml([
          readingLink('البولس', 'رومية 1:1-2', 'pauline'),
          readingLink('الكاثوليكون', 'يعقوب 1:1-2', 'catholic'),
          readingLink('الإبركسيس', 'أعمال 1:1-2', 'praxis'),
          readingLink('الإنجيل', 'مزمور 50', 'psalm'),
          readingLink('الإنجيل', 'متى 5:1-2', 'gospel'),
        ].join('\n')));
      }
      if (url.includes('id=pauline')) return response(versePage('١', '١', 'نص البولس'));
      if (url.includes('id=catholic')) return response(versePage('١', '١', 'نص الكاثوليكون'));
      if (url.includes('id=praxis')) return response(versePage('١', '١', 'نص الإبركسيس'));
      if (url.includes('id=psalm')) return response(versePage('١', '١', 'نص المزمور'));
      if (url.includes('id=gospel')) return response(versePage('١', '١', 'نص الإنجيل'));
      throw new Error(`unexpected URL ${url}`);
    };

    const result = await requestJson(`${baseUrl}/api/daily-readings`);
    const body = result.body;
    assert.equal(result.status, 200);
    assert.deepEqual(Object.keys(body).sort(), [
      'copticDate',
      'exact',
      'gospel',
      'pauline',
      'catholic',
      'praxis',
      'psalm',
      'synaxar',
      'source',
      'sourceDay',
      'sourceUrl',
    ].sort());
    assert.equal(body.exact, true);
    assert.equal(body.source, 'St-Takla.org');
    assert.equal(body.pauline.title, 'رومية 1:1-2');
    assert.deepEqual(body.pauline.slides, ['1:1 نص البولس']);
    assert.equal(body.psalm.title, 'مزمور 50');
    assert.deepEqual(body.gospel.slides, ['1:1 نص الإنجيل']);
  });

  it('maps unavailable readings to empty legacy slides without inventing content', () => {
    const day: KatamerosDay = {
      date: '2026-08-27',
      sourcePageUrl: 'https://st-takla.org/day',
      sourceIndexUrl: 'https://st-takla.org/index',
      title: 'يوم تجريبي',
      readings: [{
        id: 'pauline-1',
        section: 'pauline',
        label: 'البولس',
        reference: 'رومية 1:1',
        sourceUrl: 'https://st-takla.org/reading',
        verses: [],
        status: 'unavailable',
        error: 'missing',
      }],
    };

    const body = toDailyReadingsCompatibility(day);
    assert.equal(body.pauline.title, 'رومية 1:1');
    assert.deepEqual(body.pauline.slides, []);
  });
});