import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import { createServer, request as httpRequest, type Server } from 'node:http';
import {
  clearStTaklaSectionsCache,
  getStTaklaSectionArticle,
  getStTaklaSectionBrowse,
  getStTaklaSectionCatalog,
} from './st-takla-sections-service';
import { registerRoutes } from './routes';
import {
  buildStTaklaUrl,
  navigateStTakla,
  parseStTaklaLocation,
} from '../client/src/lib/sttakla-history';

const realFetch = globalThis.fetch;
const ritualPrefix = '/Coptic-Faith-Creed-Dogma/Coptic-Rite-n-Ritual-Taks-Al-Kanisa/Dictionary-of-Coptic-Ritual-Terms/';
const biblePrefix = '/Full-Free-Coptic-Books/FreeCopticBooks-002-Holy-Arabic-Bible-Dictionary/';
const calendarPrefix = '/Feastes-&-Special-Events/00-St-Takla.org_Orthodox-Monthly-Coptic-Calendar/';

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
        try {
          resolve({
            status: result.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

const ritualIndex = `
  <a href="#1nav">طقس</a>
  <a href="/Coptic-Faith-Creed-Dogma/Coptic-Rite-n-Ritual-Taks-Al-Kanisa/Dictionary-of-Coptic-Ritual-Terms/Coptic-Church-Rituals-Lexicon__00-index.html">الفهرس</a>
  <a href="${ritualPrefix}Coptic-Church-Rituals-Lexicon__01-Alef.html">أ</a>
  <a href="${ritualPrefix}Coptic-Church-Rituals-Lexicon__02-Beh.html">ب</a>
`;

const bibleIndex = `
  <a href="${biblePrefix}01_A/A_WORD.html">أ</a>
  <a href="${biblePrefix}02_B/B_WORD.html">ب</a>
`;

const calendarIndex = `
  <a href="${calendarPrefix}01-January-Yanayer-Yanaier-Calendar-Coptic.html">1- يناير</a>
  <a href="${calendarPrefix}02-February-Febrayer-Febraier-OrthodoxOnline-Calendar.html">2- فبراير</a>
`;

describe('St-Takla section source service', () => {
  beforeEach(() => {
    clearStTaklaSectionsCache();
    globalThis.fetch = realFetch;
  });

  after(() => {
    globalThis.fetch = realFetch;
  });

  it('discovers the ritual dictionary, Bible dictionary, and calendar browse entries', async () => {
    globalThis.fetch = async input => {
      const url = String(input);
      if (url.includes('Coptic-Church-Rituals-Lexicon__00-index')) return response(ritualIndex);
      if (url.includes('Kamous-Al-Engeel-index')) return response(bibleIndex);
      if (url.includes('00-Al-Natiga-Al-Keptia-Current-Year-index')) return response(calendarIndex);
      throw new Error(`unexpected URL ${url}`);
    };

    const ritual = await getStTaklaSectionCatalog('ritual');
    const bible = await getStTaklaSectionCatalog('bible');
    const calendar = await getStTaklaSectionCatalog('calendar');

    assert.deepEqual(ritual.browse.map(item => item.label), ['أ', 'ب']);
    assert.deepEqual(bible.browse.map(item => item.label), ['أ', 'ب']);
    assert.deepEqual(calendar.browse.map(item => item.id), ['month-1', 'month-2']);
    assert.equal(ritual.status, 'ok');
    assert.match(calendar.sourceUrl, /st-takla\.org/);
  });

  it('filters dictionary entries on the selected Arabic browse page', async () => {
    globalThis.fetch = async input => {
      const url = String(input);
      if (url.includes('Coptic-Church-Rituals-Lexicon__00-index')) return response(ritualIndex);
      if (url.includes('Lexicon__01-Alef')) {
        return response(`
          <a href="${ritualPrefix}Khozb__Bread.html">خبز</a>
          <a href="${ritualPrefix}Aartous__Bread.html">أرتوس</a>
        `);
      }
      throw new Error(`unexpected URL ${url}`);
    };

    const result = await getStTaklaSectionBrowse('ritual', 'letter-1', 'خبز');
    assert.deepEqual(result.items.map(item => item.title), ['خبز']);
    assert.match(result.sourceUrl, /Lexicon__01-Alef/);
  });

  it('does not expose the Bible letter page itself as a dictionary entry', async () => {
    globalThis.fetch = async input => {
      const url = String(input);
      if (url.includes('Kamous-Al-Engeel-index')) return response(bibleIndex);
      if (url.includes('01_A/A_WORD.html')) {
        return response(`
          <a href="https://st-takla.org${biblePrefix}01_A/A_WORD.html">https://st-takla.org${biblePrefix}01_A/A_WORD.html</a>
          <ol><li><a href="A_001.html">أب | أبو | أبي</a></li><li><a href="A_002.html">آب</a></li></ol>
        `);
      }
      throw new Error(`unexpected URL ${url}`);
    };

    const result = await getStTaklaSectionBrowse('bible', 'letter-1');
    assert.deepEqual(result.items.map(item => item.title), ['أب | أبو | أبي', 'آب']);

    const secondPage = await getStTaklaSectionBrowse('bible', 'letter-1', '', 2, 1);
    assert.deepEqual(secondPage.items.map(item => item.title), ['آب']);
    assert.deepEqual(secondPage.pagination, {
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    });
  });

  it('returns calendar content and article content only from validated St-Takla URLs', async () => {
    globalThis.fetch = async input => {
      const url = String(input);
      if (url.includes('00-Al-Natiga-Al-Keptia-Current-Year-index')) return response(calendarIndex);
      if (url.includes('01-January')) {
        return response('<title>يناير | St-Takla.org</title><div id="bodytext"><h1>شهر يناير</h1><p>أعياد وأصوام شهر يناير ومناسباته.</p></div>');
      }
      if (url.includes('Khozb__Bread')) {
        return response('<title>خبز | St-Takla.org</title><div id="bodytext"><p>شرح مصطلح الخبز في الطقس والكتاب المقدس.</p></div>');
      }
      throw new Error(`unexpected URL ${url}`);
    };

    const calendar = await getStTaklaSectionBrowse('calendar', 'month-1');
    assert.equal(calendar.article?.title, 'شهر يناير');
    assert.match(calendar.article?.content ?? '', /أعياد وأصوام/);

    const article = await getStTaklaSectionArticle('ritual', `https://st-takla.org${ritualPrefix}Khozb__Bread.html`);
    assert.equal(article.title, 'خبز');
    assert.match(article.content, /شرح مصطلح/);
    await assert.rejects(
      () => getStTaklaSectionArticle('ritual', 'https://example.com/not-st-takla.html'),
      /غير مسموح/,
    );
  });
});

describe('St-Takla dictionary browser history', () => {
  class MemoryBrowserHistory {
    private entries: string[];
    private index = 0;

    constructor(initial: string) {
      this.entries = [initial];
    }

    navigate = (url: string, options?: { replace?: boolean }) => {
      if (options?.replace) {
        this.entries[this.index] = url;
        return;
      }
      this.entries = this.entries.slice(0, this.index + 1);
      this.entries.push(url);
      this.index += 1;
    };

    back() {
      this.index = Math.max(0, this.index - 1);
      return this.entries[this.index];
    }

    forward() {
      this.index = Math.min(this.entries.length - 1, this.index + 1);
      return this.entries[this.index];
    }
  }

  it('restores the previous dictionary search and moves forward without defaulting the section', () => {
    const history = new MemoryBrowserHistory(
      buildStTaklaUrl({ section: 'ritual', browse: 'letter-1', page: 1, query: '' }),
    );
    const firstSearch = {
      section: 'ritual' as const,
      browse: 'letter-1',
      page: 1,
      query: 'خبز',
    };
    const secondSearch = {
      section: 'bible' as const,
      browse: 'letter-2',
      page: 3,
      query: 'الروح',
    };

    navigateStTakla(history.navigate, firstSearch);
    navigateStTakla(history.navigate, secondSearch);

    const previous = history.back();
    assert.deepEqual(parseStTaklaLocation(previous), firstSearch);
    assert.equal(previous, buildStTaklaUrl(firstSearch));

    const latest = history.forward();
    assert.deepEqual(parseStTaklaLocation(latest), secondSearch);
    assert.equal(latest, buildStTaklaUrl(secondSearch));
    assert.equal(parseStTaklaLocation(latest).section, 'bible');
    assert.equal(parseStTaklaLocation(latest).browse, 'letter-2');
  });

  it('replaces only an automatic correction and keeps it out of the user history', () => {
    const history = new MemoryBrowserHistory('/orthodox/st-takla');
    const canonical = {
      section: 'calendar' as const,
      browse: 'month-2',
      page: 1,
      query: '',
    };

    navigateStTakla(history.navigate, canonical, { replace: true });
    assert.equal(history.back(), buildStTaklaUrl(canonical));
    assert.equal(history.forward(), buildStTaklaUrl(canonical));
  });
});

describe('St-Takla section API contracts', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = express();
    app.use((request, _response, next) => {
      (request as any).session = { userId: 'st-takla-test-user' };
      (request as any).sessionID = 'st-takla-test-session';
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
    clearStTaklaSectionsCache();
  });

  it('rejects invalid sections and missing browse keys at the API boundary', async () => {
    const invalidSection = await requestJson(`${baseUrl}/api/orthodox/sttakla/sections/nope/browse?key=letter-1`);
    const missingKey = await requestJson(`${baseUrl}/api/orthodox/sttakla/sections/ritual/browse`);
    assert.equal(invalidSection.status, 400);
    assert.equal(missingKey.status, 400);
  });

  it('returns source-linked section catalogs through the API', async () => {
    globalThis.fetch = async input => {
      const url = String(input);
      if (url.includes('Coptic-Church-Rituals-Lexicon__00-index')) return response(ritualIndex);
      if (url.includes('Kamous-Al-Engeel-index')) return response(bibleIndex);
      if (url.includes('00-Al-Natiga-Al-Keptia-Current-Year-index')) return response(calendarIndex);
      throw new Error(`unexpected URL ${url}`);
    };

    const result = await requestJson(`${baseUrl}/api/orthodox/sttakla/sections`);
    assert.equal(result.status, 200);
    assert.equal(result.body.source, 'St-Takla.org');
    assert.deepEqual(result.body.sections.map((section: any) => section.key), ['ritual', 'bible', 'calendar']);
    assert.ok(result.body.sections.every((section: any) => section.sourceUrl.startsWith('https://st-takla.org/')));
  });

  it('passes pagination parameters through the Bible dictionary API', async () => {
    globalThis.fetch = async input => {
      const url = String(input);
      if (url.includes('Kamous-Al-Engeel-index')) return response(bibleIndex);
      if (url.includes('01_A/A_WORD.html')) {
        return response('<ol><li><a href="A_001.html">أب | أبو | أبي</a></li><li><a href="A_002.html">آب</a></li></ol>');
      }
      throw new Error(`unexpected URL ${url}`);
    };

    const result = await requestJson(
      `${baseUrl}/api/orthodox/sttakla/sections/bible/browse?key=letter-1&page=2&pageSize=1`,
    );
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.items.map((item: any) => item.title), ['آب']);
    assert.deepEqual(result.body.pagination, {
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    });
  });

  it('returns an explicit unavailable response when the upstream article fails', async () => {
    globalThis.fetch = async () => {
      throw new Error('St-Takla unavailable');
    };

    const result = await requestJson(
      `${baseUrl}/api/orthodox/sttakla/sections/ritual/article?url=${encodeURIComponent(`https://st-takla.org${ritualPrefix}Khozb__Bread.html`)}`,
    );
    assert.equal(result.status, 503);
    assert.equal(result.body.source, 'St-Takla.org');
    assert.match(result.body.message, /تعذر تحميل المقال/);
  });
});