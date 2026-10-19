#!/usr/bin/env node
/**
 * بيانات المجموعة مابتسرّبش مفاتيح ولا أرقام موبايل لأى حد معاه الكود (المالك ٢٠٢٦-١٠-١٩).
 *
 * الغلط: `GET /api/groups/:code` (الكود فى لينك الدعوة المنشور) كان بيرجّع رقم موبايل كل
 * عضو ومفتاحه ومفتاح القائد — والمفتاح هو صلاحية الأدمن. وصفحة الكنيسة كانت بترجّع مفتاح
 * قائد كل مجموعة وأرقام المسئولين. والانضمام بالاسم كان بيسلّم مفتاح أى عضو (والأدمن)
 * لأى حد يكتب اسمه بأى رقم.
 *
 * الفحص بينفّذ `groupViewFor` الحقيقية (زائر · عضو · أدمن)، وبيتأكد من الراوتات والشاشات.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MB = path.join(__dirname, '..', 'mybible');
const PRIV = path.join(MB, 'server/group-privacy.ts');
const ROUTES = path.join(MB, 'server/group-routes.ts');
const CHURCH = path.join(MB, 'server/church-routes.ts');
const VIEW = path.join(MB, 'client/src/pages/GroupView.tsx');
const MEMBERS = path.join(MB, 'client/src/pages/GroupMembers.tsx');
const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };
if (!fs.existsSync(ROUTES)) { console.log('⏭️  mybible مش موجود'); process.exit(0); }
if (!fs.existsSync(PRIV)) { fail('server/group-privacy.ts مش موجود — مين بيشيل المفاتيح والأرقام من الرد؟'); process.exit(1); }

/* ── ١) الدالة نفسها ────────────────────────────────────────────────────── */
const payload = {
  group: { id: 1, name: 'درس', leaderKey: 'LEADER-SECRET' },
  members: [
    { id: 1, userName: 'القائد', memberKey: 'LEADER-SECRET', phone: '01000000001', isAdmin: true },
    { id: 2, userName: 'عضو 372', memberKey: 'g_aaa', phone: null, isAdmin: false },
    { id: 3, userName: 'مينا', memberKey: 'k_mina', phone: '01000000003', isAdmin: false },
  ],
  stats: { totalMembers: 3 },
};
let out;
try {
  const probe = path.join(require('os').tmpdir(), `group-privacy-${process.pid}.mjs`);
  fs.writeFileSync(probe, `
const m = await import(${JSON.stringify('file://' + PRIV)});
const p = ${JSON.stringify(payload)};
const r = { visitor: m.groupViewFor(p, ''), forged: m.groupViewFor(p, 'guess'), member: m.groupViewFor(p, 'k_mina'),
            admin: m.groupViewFor(p, 'LEADER-SECRET'), cacheAfter: p };
process.stdout.write('@@JSON@@' + JSON.stringify(r));
`, 'utf8');
  const raw = execFileSync(process.execPath, ['--no-warnings', probe]).toString('utf8');
  fs.unlinkSync(probe);
  out = JSON.parse(raw.slice(raw.indexOf('@@JSON@@') + 8));
} catch (e) {
  console.error('⚠️  مش قادر أشغّل group-privacy.ts (محتاج Node ≥ 22.6): ' + String(e.stderr || e.message).split('\n')[0]);
  process.exit(1);
}
for (const who of ['visitor', 'forged', 'member', 'admin']) {
  const r = out[who];
  const text = JSON.stringify(r);
  if (text.includes('LEADER-SECRET') || text.includes('k_mina') || text.includes('g_aaa')) {
    fail(`رد «${who}» فيه مفتاح عضو/قائد — ده صلاحية أدمن لأى حد معاه الكود`);
  }
  if ('leaderKey' in r.group) fail(`رد «${who}» فيه group.leaderKey`);
  const phones = r.members.filter((m) => m.phone).length;
  if (who !== 'admin' && phones) fail(`رد «${who}» فيه أرقام موبايل الأعضاء — للأدمن بس`);
}
if (out.visitor.me || out.forged.me) fail('زائر/مفتاح غلط بيرجعله «me»');
if (out.member.me?.userName !== 'مينا' || out.member.me?.phone !== '01000000003') fail('العضو مابيرجعلوش بياناته هو فى «me»');
if (out.member.isLeader || !out.admin.isLeader) fail('isLeader غلط');
if (out.admin.members.filter((m) => m.phone).length !== 2) fail('الأدمن مابيشوفش أرقام الأعضاء (زرار «تسجيل الاسم والموبايل»)');
if (out.cacheAfter.members[0].memberKey !== 'LEADER-SECRET') fail('groupViewFor بتعدّل الكاش المشترك');

/* ── ٢) الراوتات ──────────────────────────────────────────────────────── */
const strip = (f) => fs.readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
const src = strip(ROUTES);
const route = (sig, len = 2500) => { const i = src.indexOf(sig); return i < 0 ? '' : src.slice(i, i + len); };

if (!/res\.json\(groupViewFor\(payload, String\(req\.get\('x-member-key'\)/.test(route("app.get('/api/groups/:code', async", 900))) {
  fail('GET /api/groups/:code مابيعدّيش الرد على groupViewFor');
}
const jr = route("app.get('/api/groups/:code/join-requests'", 900);
if (!/isAdminByLeaderKey\(/.test(jr) || jr.indexOf('isAdminByLeaderKey(') > jr.indexOf('groupJoinRequests')) {
  fail('طلبات الانضمام (فيها أرقام) بتطلع من غير ما نتأكد إن اللى بيسأل أدمن');
}
// invite-info بيختار أعمدة بالاسم (من غير leaderKey) فـ{ group } فيه سليم؛ والإنشاء بيرجّع المفتاح لصاحبه
const infoAt = src.indexOf("app.get('/api/groups/:code/invite-info'");
const infoEnd = src.indexOf('app.', infoAt + 40);
for (const m of src.matchAll(/res\.json\(\{ group[,}\s]/g)) {
  const r = src.slice(m.index, m.index + 40);
  if (m.index > infoAt && m.index < infoEnd) continue;
  if (!/\{ group, leaderKey \}/.test(r)) fail(`رد فيه المجموعة كاملة بمفتاح القائد: ${r.trim()}…`);
}
if (/leaderKey/.test(src.slice(infoAt, infoEnd))) fail('invite-info (عام) بيختار leaderKey');
for (const sig of ["app.post('/api/groups/:code/invite-join'", "app.post('/api/groups/join'"]) {
  const body = route(sig, 6000);
  const fb = body.indexOf('البحث بالاسم'); // بلوك الرجوع بالاسم (الكومنتات متشالة؛ ندوّر على الاستعلام بعدها)
  const nameQ = body.search(/eq\(groupMembers\.userName, userName(\.trim\(\))?\)\)\);\s*if \((existing|existing\.length > 0)\)/);
  const blk = nameQ < 0 ? '' : body.slice(nameQ, nameQ + 600);
  if (!blk) { fail(`${sig}: مالقيتش بلوك الانضمام بالاسم — الفحص مش قادر يقيس`); continue; }
  if (!/canMergeGuest\(/.test(blk) || blk.indexOf('canMergeGuest(') > blk.indexOf('member:')) {
    fail(`${sig}: الانضمام بالاسم بيسلّم حساب العضو من غير ما الرقم يطابق`);
  }
  void fb;
}

/* ── ٣) صفحة الكنيسة ──────────────────────────────────────────────────── */
const ch = strip(CHURCH);
const cid = ch.slice(ch.indexOf("app.get('/api/churches/:id', async"), ch.indexOf("app.get('/api/churches/:id', async") + 1200);
if (/SELECT id, church_id AS "churchId", phone/.test(cid)) fail('/api/churches/:id بيرجّع أرقام مسئولى الكنيسة');
if (!/groups\.map\(\(\{ leaderKey: _k, \.\.\.g \}\) => g\)/.test(cid)) fail('/api/churches/:id بيرجّع مفتاح قائد كل مجموعة');
for (const sig of ["app.get('/api/churches', async", "app.get('/api/churches/all', async"]) {
  const b = ch.slice(ch.indexOf(sig), ch.indexOf(sig) + 500);
  if (!/adminPhone: _p/.test(b)) fail(`${sig.slice(9, -8)} بيرجّع رقم مسئول الكنيسة للكل`);
}

/* ── ٤) الشاشات ───────────────────────────────────────────────────────── */
const view = strip(VIEW);
if ((view.match(/headers: memberKeyHeaders\(groupCode\)/g) || []).length < 2) fail('GroupView مابيبعتش مفتاحه (بيانات المجموعة / طلبات الانضمام)');
if (/group\.leaderKey === memberKey|grp\?\.leaderKey/.test(view)) fail('GroupView لسه بيعتمد على group.leaderKey — مابقاش فى الرد');
if (!/headers: memberKeyHeaders\(groupCode\)/.test(strip(MEMBERS))) fail('شاشة الأعضاء مابتبعتش مفتاح الأدمن — أرقام 📞 مش هتظهر');

if (!process.exitCode) console.log('✅ بيانات المجموعة والكنيسة: مفيش مفاتيح ولا أرقام لغير صاحبها/الأدمن، والانضمام بالاسم محتاج الرقم');
