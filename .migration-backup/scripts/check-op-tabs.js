#!/usr/bin/env node
/**
 * Two tasks, one tab.
 *
 * The extension's Operator kept a single `opTab` for everything. Two runs at
 * once — a booking and a price check, or one task re-fired after a timeout —
 * drove the SAME page: one navigates while the other is reading, and the
 * indexes handed out by the first observation get clicked on the second page.
 * The click lands on whatever now sits at that number. On a booking form that
 * is a wrong button pressed with somebody's details already typed in.
 *
 * Now a tab belongs to a TASK, and commands for a task are serialised behind a
 * lock — the observe → decide → act loop is only sound if nothing moves the
 * page between the observation and the act.
 *
 * The extension is browser code, so this check LOADS IT with a fake `chrome`:
 * the tabs, the scripting calls and the alarms are recorded rather than
 * performed. That is the only way to test the thing that actually ships to
 * people's browsers instead of testing a description of it.
 *
 *   node scripts/check-op-tabs.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── Load the real service worker against a fake browser ───────────────── */
function load() {
  const tabs = new Map();          // tabId → url
  const events = { created: [], removed: [], scripted: [] };
  let nextId = 100;
  let onRemoved = null;

  const chrome = {
    tabs: {
      create: (opts, cb) => { const id = ++nextId; tabs.set(id, opts.url); events.created.push({ id, url: opts.url }); setImmediate(() => cb({ id })); },
      get: async (id) => { if (!tabs.has(id)) throw new Error('no tab'); return { id }; },
      update: (id, opts, cb) => { tabs.set(id, opts.url); setImmediate(() => cb && cb()); },
      remove: (id) => { tabs.delete(id); events.removed.push(id); },
      onUpdated: { addListener: (l) => setImmediate(() => l(nextId, { status: 'complete' })), removeListener: () => {} },
      onRemoved: { addListener: (l) => { onRemoved = l; } },
      captureVisibleTab: async () => null,
    },
    scripting: {
      executeScript: async ({ target, func, args }) => {
        events.scripted.push({ tabId: target.tabId, args: args || [] });
        // The page functions are not run — this check is about WHICH TAB each
        // command was aimed at, which is the part that went wrong.
        return [{ result: { title: 't', url: 'u', text: '', inputs: [], clickables: [], ok: true } }];
      },
    },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
    storage: { local: { get: (k, cb) => setImmediate(() => cb({ active: false })), set: () => {} } },
    runtime: { onMessage: { addListener: () => {} }, getURL: (p) => p, id: 'x' },
    windows: { create: (o, cb) => cb && cb({ id: 1 }) },
  };

  const sandbox = {
    chrome, console, setTimeout, clearTimeout, setInterval, clearInterval, setImmediate,
    fetch: async () => { throw new Error('offline'); },
    Promise, Map, Set, JSON, String, Number, Array, Object, Error, Date, Math, URL,
    KeyboardEvent: function () {}, Event: function () {},
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'sokro/extension/background.js'), 'utf8'), sandbox, { filename: 'background.js' });
  return { sandbox, events, tabs, fireRemoved: (id) => onRemoved && onRemoved(id) };
}

async function main() {
  let env;
  try { env = load(); } catch (e) {
    check('الإضافة بتتحمّل في بيئة اختبار', false, e.message);
    process.exit(1);
  }
  check('الإضافة بتتحمّل في بيئة اختبار', true);

  const get = (name) => vm.runInContext(name, env.sandbox);
  const doOpState = get('doOpState');
  const doOpAct = get('doOpAct');
  const opTabs = get('opTabs');

  check('فيه خريطة تبويبات لكل مهمة', opTabs instanceof Map);

  /* ── A tab per task ──────────────────────────────────────────────────── */
  await doOpState({ url: 'https://a.example/', task: '11' });
  await doOpState({ url: 'https://b.example/', task: '22' });
  check('كل مهمة أخدت تبويب لوحدها', opTabs.size === 2, 'tabs=' + opTabs.size);
  check('والتبويبين مختلفين', opTabs.get('11') !== opTabs.get('22'));

  const tab11 = opTabs.get('11');
  await doOpState({ url: 'https://a.example/2', task: '11' });
  check('ونفس المهمة بتفضل على تبويبها', opTabs.get('11') === tab11);

  /* ── An act goes to ITS OWN tab ──────────────────────────────────────── */
  env.events.scripted.length = 0;
  await doOpAct({ action: 'click', idx: 3, task: '22' });
  const aimed = env.events.scripted.map((s) => s.tabId);
  check('والضغطة بتروح لتبويب مهمتها',
    aimed.every((t) => t === opTabs.get('22')), JSON.stringify(aimed) + ' vs ' + opTabs.get('22'));

  /* ── A task with no tab is refused, not sent somewhere else ──────────── */
  {
    let err = null;
    try { await doOpAct({ action: 'click', idx: 1, task: '99' }); } catch (e) { err = e.message; }
    check('ومهمة مالهاش تبويب بتترفض مش بتتحوّل لتبويب حد تاني', /no operator tab/.test(err || ''), err);
  }

  /* ── The lock: one command per task at a time ────────────────────────── */
  {
    const order = [];
    const slow = doOpState({ url: 'https://a.example/slow', task: '33' }).then(() => order.push('first'));
    const fast = doOpState({ url: 'https://a.example/fast', task: '33' }).then(() => order.push('second'));
    await Promise.all([slow, fast]);
    check('وأوامر المهمة الواحدة بتتنفّذ بالترتيب', order.join(',') === 'first,second', order.join(','));
    check('وبرضه تبويب واحد للمهمة دي', opTabs.get('33') != null);
  }

  /* ── A closed tab stops being the task's tab ─────────────────────────── */
  {
    const id = opTabs.get('11');
    env.fireRemoved(id);
    check('وتبويب المستخدم قفله بيتشال من الخريطة', opTabs.get('11') === undefined);
  }

  /* ── And the server sends the task with every command ────────────────── */
  {
    const nl = (m) => m.replace(/[^\n]/g, ' ');
    const op = fs.readFileSync(path.join(ROOT, 'sokro/actions/OperateAction.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, nl)
      .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
    check('و`operate` بتبعت رقم المهمة مع الملاحظة', /'op_state', \{ url, task \}/.test(op));
    check('ومع الفعل كمان', /'op_act', \{ action: dec\.action, idx: dec\.idx, text: dec\.text, task \}/.test(op));
    check('والمهمة مأخوذة من الـctx', /const task = String\(\(ctx && ctx\.taskId\) \|\| 'adhoc'\)/.test(op));
  }

  console.log(fail
    ? `\n${fail} مشكلة — يعني مهمتين ممكن يشتغلوا في نفس الصفحة ويدوسوا زراير بعض.`
    : '\nكل مهمة في تبويبها، وأوامرها ورا قفل: الرقم اللي اتشاف هو اللي بيتداس.');
  process.exit(fail ? 1 : 0);
}

main();
