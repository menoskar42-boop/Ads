#!/usr/bin/env node
/**
 * HTTP isolation check for the workshop alert-email audit history.
 *
 * Express, express-session, the real workshop router, permission middleware,
 * and the real settings template are used here. Only pg is replaced with a
 * small fixture so the check can create two companies, two managers, and two
 * different audit rows without writing to a shared database.
 */
'use strict';

const path = require('path');
const Module = require('module');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const ROOT = path.join(__dirname, '..');
const fixture = {
  companies: [
    { id: 101, company_name: 'Alpha Workshop', page_type: 'workshop', is_active: true, theme_color: '#22425c' },
    { id: 202, company_name: 'Bravo Workshop', page_type: 'workshop', is_active: true, theme_color: '#22425c' },
    { id: 303, company_name: 'Demo Workshop', page_type: 'workshop', is_active: true, theme_color: '#22425c' },
  ],
  users: [
    { id: 1001, company_id: 101, email: 'alpha-manager@example.com', role: 'manager' },
    { id: 1002, company_id: 101, email: 'alpha-reception@example.com', role: 'reception' },
    { id: 2002, company_id: 202, email: 'bravo-manager@example.com', role: 'manager' },
  ],
  settings: [
    { company_id: 101, business_name: 'Alpha Workshop', admin_alert_email: 'alpha-alert@example.com', booking_enabled: true },
    { company_id: 202, business_name: 'Bravo Workshop', admin_alert_email: 'bravo-alert@example.com', booking_enabled: true },
    { company_id: 303, business_name: 'Demo Workshop', admin_alert_email: null, booking_enabled: true },
  ],
  alertEmailHistory: [
    {
      id: 1, company_id: 101, changed_by: 'alpha-manager@example.com',
      previous_email: null, new_email: 'alpha-alert@example.com',
      change_type: 'added', created_at: '2026-09-05T08:00:00.000Z',
    },
    {
      id: 3, company_id: 101, changed_by: 'alpha-manager@example.com',
      previous_email: 'old-alpha@example.com', new_email: 'alpha-alert@example.com',
      change_type: 'changed', created_at: '2026-09-05T08:02:00.000Z',
    },
    {
      id: 2, company_id: 202, changed_by: 'bravo-manager@example.com',
      previous_email: null, new_email: 'bravo-alert@example.com',
      change_type: 'added', created_at: '2026-09-05T08:01:00.000Z',
    },
  ],
};

const queries = [];
const securityEvents = [];
class FixturePool {
  async query(sql, args = []) {
    queries.push([sql.replace(/\s+/g, ' ').trim(), args]);
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [] };
    if (/INSERT INTO medical_audit_log/.test(sql)) {
      securityEvents.push(args);
      return { rows: [] };
    }
    if (/SELECT \* FROM companies WHERE id = \$1/.test(sql)) {
      return { rows: fixture.companies.filter((row) => row.id === Number(args[0])) };
    }
    if (/SELECT flag_key, enabled FROM workshop_flags/.test(sql)) return { rows: [] };
    if (/SELECT id, company_id, email, role FROM company_users/.test(sql)) {
      return {
        rows: fixture.users.filter((row) => row.id === Number(args[0]) && row.company_id === Number(args[1])),
      };
    }
    if (/SELECT id, email, role, created_at FROM company_users WHERE company_id=\$1/.test(sql)) {
      return {
        rows: fixture.users
          .filter((row) => row.company_id === Number(args[0]))
          .map((row) => ({ ...row, created_at: '2026-09-01T08:00:00.000Z' })),
      };
    }
    if (/SELECT \* FROM workshop_settings WHERE company_id/.test(sql)) {
      return { rows: fixture.settings.filter((row) => row.company_id === Number(args[0])) };
    }
    if (/SELECT admin_alert_email\s+FROM workshop_settings/.test(sql)) {
      return {
        rows: fixture.settings
          .filter((row) => row.company_id === Number(args[0]))
          .map((row) => ({ admin_alert_email: row.admin_alert_email })),
      };
    }
    if (/FROM workshop_reminders/.test(sql)) return { rows: [{ n: 0 }] };
    if (/FROM workshop_message_settings/.test(sql)) return { rows: [] };
    if (/FROM payment_settings/.test(sql)) return { rows: [] };
    if (/FROM workshop_role_history/.test(sql)) return { rows: [] };
    if (/SELECT previous_email\s+FROM workshop_alert_email_history/.test(sql)) {
      return {
        rows: fixture.alertEmailHistory.filter(
          (row) => row.id === Number(args[0]) && row.company_id === Number(args[1])
        ),
      };
    }
    if (/UPDATE workshop_settings\s+SET admin_alert_email/.test(sql)) {
      const row = fixture.settings.find((item) => item.company_id === Number(args[1]));
      if (row) row.admin_alert_email = args[0];
      return { rows: [] };
    }
    if (/INSERT INTO workshop_alert_email_history/.test(sql)) {
      fixture.alertEmailHistory.push({
        id: Math.max(...fixture.alertEmailHistory.map((row) => row.id)) + 1,
        company_id: Number(args[0]),
        changed_by_user_id: Number(args[1]),
        changed_by: args[2],
        previous_email: args[3],
        new_email: args[4],
        change_type: args[5],
        created_at: '2026-09-05T08:03:00.000Z',
      });
      return { rows: [] };
    }
    if (/FROM workshop_alert_email_history/.test(sql)) {
      return {
        rows: fixture.alertEmailHistory.filter((row) => row.company_id === Number(args[0])),
      };
    }
    if (/FROM workshop_reminder_runs/.test(sql)) return { rows: [] };
    if (/FROM workshop_reminder_health/.test(sql)) return { rows: [] };
    throw new Error(`unexpected fixture query: ${sql.slice(0, 180)}`);
  }

  async connect() {
    return {
      query: this.query.bind(this),
      release() {},
    };
  }

  async end() {}
}

const realLoad = Module._load;
Module._load = function loadWithFixture(request, parent, isMain) {
  if (request === 'pg') return { Pool: FixturePool };
  return realLoad.apply(this, arguments);
};
let workshopRouter;
try {
  workshopRouter = require(path.join(ROOT, 'src/routes/workshop_admin'));
} finally {
  Module._load = realLoad;
}

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'src/views'));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false },
}));
app.use((req, res, next) => {
  res.locals.lang = 'ar';
  res.locals.dir = 'rtl';
  res.locals.t = (key) => key;
  next();
});

// These endpoints create real HTTP sessions for the fixture's managers.
app.get('/__test/session/:companyId', (req, res) => {
  const companyId = Number(req.params.companyId);
  const role = String(req.query.role || 'manager');
  const user = fixture.users.find((row) => row.company_id === companyId && row.role === role);
  if (!user) return res.status(404).send('unknown fixture user');
  req.session.companyId = companyId;
  req.session.companyUserId = user.id;
  return res.redirect('/workshop/settings');
});
app.get('/__test/demo', (req, res) => {
  req.session.companyId = 303;
  req.session.demoReadOnly = true;
  req.session.demoSlug = 'workshop';
  return res.redirect('/workshop/settings');
});
app.use('/workshop', workshopRouter);

let failed = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ` — ${extra}` : ''));
  if (!ok) failed += 1;
};

function client(base) {
  let cookie = '';
  async function request(pathname, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    if (cookie) headers.cookie = cookie;
    const response = await fetch(base + pathname, Object.assign({}, options, {
      headers,
      redirect: 'manual',
    }));
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return response;
  }
  return { request };
}

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const alpha = client(base);
  const bravo = client(base);
  const demo = client(base);

  try {
    const alphaSeed = await alpha.request('/__test/session/101');
    const alphaPage = await alpha.request('/workshop/settings');
    const alphaHtml = await alphaPage.text();
    check('جلسة مدير Alpha تُنشأ عبر HTTP', alphaSeed.status === 302 && alphaPage.status === 200);
    check('Alpha ترى سجلها فقط',
      alphaHtml.includes('alpha-alert@example.com')
        && !alphaHtml.includes('bravo-alert@example.com')
        && alphaHtml.includes('سجل بريد تنبيهات الإدارة'));

    const alphaTampered = await alpha.request('/workshop/settings?company_id=202');
    const alphaTamperedHtml = await alphaTampered.text();
    await new Promise((resolve) => setImmediate(resolve));
    check('تمرير company_id لا يبدّل جلسة Alpha',
      alphaTampered.status === 200
        && alphaTamperedHtml.includes('alpha-alert@example.com')
        && !alphaTamperedHtml.includes('bravo-alert@example.com'));

    const alphaRestore = await alpha.request('/workshop/settings/alert-email-history/3/restore', {
      method: 'POST',
    });
    const alphaRestoredPage = await alpha.request('/workshop/settings');
    const alphaRestoredHtml = await alphaRestoredPage.text();
    check('مدير Alpha يستعيد عنوانًا سابقًا عبر HTTP',
      alphaRestore.status === 302
        && alphaRestore.headers.get('location') === '/workshop/settings?saved=1&restored=1'
        && fixture.settings.find((row) => row.company_id === 101).admin_alert_email === 'old-alpha@example.com'
        && alphaRestoredHtml.includes('old-alpha@example.com')
        && alphaRestoredHtml.includes('alpha-alert@example.com'));

    const invalidRestore = await alpha.request('/workshop/settings/alert-email-history/1/restore', {
      method: 'POST',
    });
    check('لا يمكن استعادة سجل بلا عنوان سابق',
      invalidRestore.status === 302
        && invalidRestore.headers.get('location') === '/workshop/settings?err=alert_email_restore_invalid');

    const bravoSeed = await bravo.request('/__test/session/202');
    const bravoPage = await bravo.request('/workshop/settings');
    const bravoHtml = await bravoPage.text();
    check('جلسة مدير Bravo تُنشأ عبر HTTP', bravoSeed.status === 302 && bravoPage.status === 200);
    check('Bravo ترى سجلها فقط',
      bravoHtml.includes('bravo-alert@example.com')
        && !bravoHtml.includes('alpha-alert@example.com')
        && bravoHtml.includes('سجل بريد تنبيهات الإدارة'));

    const demoSeed = await demo.request('/__test/demo');
    const demoPage = await demo.request('/workshop/settings');
    const demoHtml = await demoPage.text();
    await new Promise((resolve) => setImmediate(resolve));
    check('الديمو لا يرى سجل بريد التنبيهات',
      demoSeed.status === 302
        && demoPage.status === 200
        && !demoHtml.includes('سجل بريد تنبيهات الإدارة')
        && !demoHtml.includes('alpha-alert@example.com')
        && !demoHtml.includes('bravo-alert@example.com'));

    const demoPost = await demo.request('/workshop/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'company_id=202',
    });
    check('الديمو لا يستطيع تغيير إعدادات سجل البريد', demoPost.status === 403);
    const demoRestore = await demo.request('/workshop/settings/alert-email-history/3/restore', {
      method: 'POST',
    });
    check('الديمو لا يستطيع استعادة عنوان البريد', demoRestore.status === 403);

    const reception = client(base);
    await reception.request('/__test/session/101?role=reception');
    const receptionPost = await reception.request('/workshop/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'company_id=202',
    });
    check('الدور غير المصرح به يُرفض ويُسجل', receptionPost.status === 403);
    await new Promise((resolve) => setImmediate(resolve));

    check('الاستعادة تسجل حدثًا جديدًا للشركة نفسها',
      fixture.alertEmailHistory.some((row) =>
        row.company_id === 101
        && row.previous_email === 'alpha-alert@example.com'
        && row.new_email === 'old-alpha@example.com'
        && row.change_type === 'changed'));
    check('استعلامات سجل البريد تحمل نطاق الشركة',
      queries.filter(([sql]) => /FROM workshop_alert_email_history/.test(sql))
        .every(([sql, args]) => {
          const scopedCompanyId = /WHERE company_id=\$1/.test(sql)
            ? args[0]
            : /WHERE id=\$1 AND company_id=\$2/.test(sql)
              ? args[1]
              : null;
          return scopedCompanyId != null && [101, 202, 303].includes(Number(scopedCompanyId));
        }));
    const safeSecurityEvents = securityEvents.map((args) => ({
      companyId: args[0],
      system: args[1],
      actorKind: args[2],
      actorId: args[3],
      actorLabel: args[4],
      entity: args[5],
      action: args[8],
      meta: JSON.parse(args[9]),
    }));
    check('محاولات الوصول المرفوضة تُسجل بالشركة والحساب الفعلي فقط',
      safeSecurityEvents.some((event) =>
        event.companyId === 101
        && event.actorId === 1001
        && event.entity === 'workshop_alert_email_history'
        && event.action === 'access_denied'
        && event.meta.reason === 'company_scope_mismatch'
        && event.meta.company_scope_mismatch === true)
        && safeSecurityEvents.some((event) =>
          event.companyId === 303
          && event.actorKind === 'demo_session'
          && event.meta.reason === 'demo_read_only')
        && safeSecurityEvents.some((event) =>
          event.companyId === 101
          && event.actorId === 1002
          && event.meta.reason === 'permission_denied'));
    check('سجل الأمن لا يحتوي عناوين البريد أو قيمة company_id المطلوبة',
      safeSecurityEvents.every((event) =>
        !JSON.stringify(event).includes('@')
        && !JSON.stringify(event.meta).includes('202')));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});