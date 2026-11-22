/**
 * فحص سلامة بيانات الصيانة — قراية بس (المالك ٢٠٢٦-١٠-٢٠: «راجع برنامج الصيانة كله واتأكد إن كل
 * البيانات محفوظة» + «تقرير الصيانة فيه يومين بس» + «أعداد البوكسات غلط»).
 *
 * بيشتغل من **جوّه الموقع** على نفس القاعدة اللى الموقع بيقرا منها (شِل ريبليت بيوصل لقاعدة تانية
 * — مزلق رقم ١ فى docs/HANDOVER.md). مفيش ولا جملة كتابة هنا: SELECT بس.
 */
const EXCLUDED_ITEMS = `('electricity_conflict','air_conflict','overlap')`;

// اسم السنترال بشكل واحد للمقارنة: «الغنايم - دير الجنادلة» = «الغنايم-دير الجنادله»
const NORM_EXCHANGE = (col) =>
  `translate(regexp_replace(lower(btrim(${col})), '\\s*-\\s*', '-', 'g'), 'ةىأإآ', 'هيااا')`;

async function dataHealth(db, { from = '2026-09-01' } = {}) {
  const n = (r) => Number(r?.c ?? 0);
  const one = async (sql, p = []) => n(await db.get(sql, p));

  const totals = {
    exchanges: await one('SELECT COUNT(*) c FROM exchanges'),
    cabinets: await one('SELECT COUNT(*) c FROM cabinets'),
    boxes: await one('SELECT COUNT(*) c FROM boxes'),
    inspections: await one('SELECT COUNT(*) c FROM inspections'),
    inspectionsArchived: await one('SELECT COUNT(*) c FROM inspections WHERE COALESCE(is_archived,0) = 1'),
    inspectionsAuto: await one('SELECT COUNT(*) c FROM inspections WHERE COALESCE(auto_created,0) = 1'),
    inspectionItems: await one('SELECT COUNT(*) c FROM inspection_items'),
    tasks: await one('SELECT COUNT(*) c FROM maintenance_tasks'),
    itemsDone: await one('SELECT COUNT(*) c FROM maintenance_item_status WHERE is_done = 1'),
    photos: await one('SELECT COUNT(*) c FROM photos'),
    photosInDb: await one('SELECT COUNT(*) c FROM photos WHERE data IS NOT NULL'),
    photosOnR2: await one('SELECT COUNT(*) c FROM photos WHERE storage_key IS NOT NULL'),
    photosMissing: await one('SELECT COUNT(*) c FROM photos WHERE data IS NULL AND storage_key IS NULL'),
  };
  const taskStatus = await db.all('SELECT status, COUNT(*) c FROM maintenance_tasks GROUP BY status ORDER BY 2 DESC');

  // حالة البكس المتسجّلة × الحالة اللى المفروض تكون من آخر فحص ومهمته
  const statusMatrix = await db.all(`
    WITH latest AS (
      SELECT DISTINCT ON (box_id) id, box_id FROM inspections
       WHERE COALESCE(is_archived,0) = 0 ORDER BY box_id, id DESC
    ), lt AS (
      SELECT l.box_id,
             (SELECT t.status FROM maintenance_tasks t WHERE t.inspection_id = l.id ORDER BY t.id DESC LIMIT 1) AS task_status,
             EXISTS (SELECT 1 FROM inspection_items ii WHERE ii.inspection_id = l.id
                       AND ii.value IN ('bad','yes') AND ii.item_key NOT IN ${EXCLUDED_ITEMS}) AS has_issue
        FROM latest l
    )
    SELECT b.status AS stored,
           CASE WHEN lt.box_id IS NULL THEN 'pending_inspection'
                WHEN lt.task_status = 'completed' THEN 'completed'
                WHEN lt.task_status = 'pending_approval' THEN 'pending_approval'
                WHEN lt.task_status = 'in_progress' THEN 'in_progress'
                WHEN lt.has_issue THEN 'needs_maintenance'
                ELSE 'inspected' END AS derived,
           COUNT(*) c
      FROM boxes b LEFT JOIN lt ON lt.box_id = b.id
     GROUP BY 1, 2 ORDER BY 3 DESC`);

  // كل الصيانة اللى اتعملت (كل بنود الشغل اتعلّمت) — **مع** المؤرشف — بتاريخ الشغل
  const completedWork = await db.all(`
    WITH cw AS (
      SELECT mt.id, mt.status, COALESCE(i.is_archived,0) AS archived,
             (SELECT MAX(mis.done_at) FROM maintenance_item_status mis
                JOIN inspection_items x ON x.inspection_id = i.id AND x.item_key = mis.item_key
               WHERE mis.task_id = mt.id AND mis.is_done = 1 AND x.value IN ('bad','yes')
                 AND x.item_key NOT IN ${EXCLUDED_ITEMS}) AS work_date,
             NOT EXISTS (SELECT 1 FROM inspection_items y WHERE y.inspection_id = i.id
                           AND y.value IN ('bad','yes') AND y.item_key NOT IN ${EXCLUDED_ITEMS}
                           AND NOT EXISTS (SELECT 1 FROM maintenance_item_status z
                                            WHERE z.task_id = mt.id AND z.item_key = y.item_key AND z.is_done = 1)) AS all_done
        FROM maintenance_tasks mt JOIN inspections i ON i.id = mt.inspection_id
       WHERE mt.technician_id IS NOT NULL
    )
    SELECT to_char(work_date AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS day,
           COUNT(*) FILTER (WHERE all_done AND archived = 0) AS in_report,
           COUNT(*) FILTER (WHERE all_done AND archived = 1) AS archived_hidden,
           COUNT(*) FILTER (WHERE NOT all_done) AS partly_done
      FROM cw WHERE work_date >= ?::date
     GROUP BY 1 ORDER BY 1 DESC`, [from]);

  // مهام كل شغلها خلص ماعدا «مراجعة بيانات البكس» اللى اتضافت بعدها (من Service Flow)
  const blockedByDataReview = await one(`
    SELECT COUNT(*) c FROM maintenance_tasks mt JOIN inspections i ON i.id = mt.inspection_id
     WHERE EXISTS (SELECT 1 FROM inspection_items d WHERE d.inspection_id = i.id AND d.item_key = 'data_review' AND d.value = 'yes'
                     AND NOT EXISTS (SELECT 1 FROM maintenance_item_status s WHERE s.task_id = mt.id AND s.item_key = 'data_review' AND s.is_done = 1))
       AND EXISTS (SELECT 1 FROM maintenance_item_status s2 WHERE s2.task_id = mt.id AND s2.is_done = 1 AND s2.item_key <> 'data_review')
       AND NOT EXISTS (SELECT 1 FROM inspection_items y WHERE y.inspection_id = i.id AND y.item_key <> 'data_review'
                         AND y.value IN ('bad','yes') AND y.item_key NOT IN ${EXCLUDED_ITEMS}
                         AND NOT EXISTS (SELECT 1 FROM maintenance_item_status z WHERE z.task_id = mt.id AND z.item_key = y.item_key AND z.is_done = 1))`);

  // نشاط كل يوم (هل الكتابة شغّالة ومفيش أيام اختفت)
  const daily = await db.all(`
    WITH d AS (SELECT generate_series(?::date, (now() AT TIME ZONE 'Africa/Cairo')::date, '1 day')::date AS day)
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
      (SELECT COUNT(*) FROM inspections i WHERE i.date = d.day AND COALESCE(i.auto_created,0) = 0) AS inspections,
      (SELECT COUNT(*) FROM inspections i WHERE i.date = d.day AND COALESCE(i.auto_created,0) = 1) AS auto_inspections,
      (SELECT COUNT(*) FROM maintenance_item_status s WHERE s.is_done = 1 AND (s.done_at AT TIME ZONE 'Africa/Cairo')::date = d.day) AS items_done,
      (SELECT COUNT(*) FROM maintenance_tasks t WHERE (t.completed_at AT TIME ZONE 'Africa/Cairo')::date = d.day) AS tasks_completed,
      (SELECT COUNT(*) FROM photos p WHERE (p.uploaded_at AT TIME ZONE 'Africa/Cairo')::date = d.day) AS photos,
      (SELECT COUNT(*) FROM boxes b WHERE (b.created_at AT TIME ZONE 'Africa/Cairo')::date = d.day) AS boxes_created
      FROM d ORDER BY d.day DESC`, [from]);

  // بوكسات مكررة: نفس السنترال (بعد توحيد الكتابة) + نفس الكابينة + نفس رقم البكس
  const duplicates = await db.all(`
    SELECT ${NORM_EXCHANGE('e.name')} AS exch, btrim(c.number) AS cab, btrim(b.number) AS box,
           COUNT(*) c, string_agg(DISTINCT e.name, ' | ') AS names,
           string_agg(b.status || '#' || b.id, ' ' ORDER BY b.id) AS boxes
      FROM boxes b JOIN cabinets c ON c.id = b.cabinet_id JOIN exchanges e ON e.id = c.exchange_id
     GROUP BY 1, 2, 3 HAVING COUNT(*) > 1 ORDER BY 4 DESC, 1, 2, 3 LIMIT 200`);
  const duplicateBoxes = await one(`
    SELECT COALESCE(SUM(c - 1), 0) c FROM (
      SELECT COUNT(*) c FROM boxes b JOIN cabinets c ON c.id = b.cabinet_id JOIN exchanges e ON e.id = c.exchange_id
       GROUP BY ${NORM_EXCHANGE('e.name')}, btrim(c.number), btrim(b.number) HAVING COUNT(*) > 1) t`);

  const exchanges = await db.all(`
    SELECT e.id, e.name, to_char(e.created_at AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS created,
           (SELECT COUNT(*) FROM cabinets c WHERE c.exchange_id = e.id) AS cabinets,
           (SELECT COUNT(*) FROM boxes b JOIN cabinets c ON c.id = b.cabinet_id WHERE c.exchange_id = e.id) AS boxes,
           (SELECT COUNT(*) FROM boxes b JOIN cabinets c ON c.id = b.cabinet_id WHERE c.exchange_id = e.id
               AND b.created_at >= ?::date) AS boxes_new
      FROM exchanges e ORDER BY e.name`, [from]);

  return { from, totals, taskStatus, statusMatrix, completedWork, blockedByDataReview, daily, duplicates, duplicateBoxes, exchanges };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const table = (cols, rows) => `<div class="t"><table><tr>${cols.map(([, h]) => `<th>${esc(h)}</th>`).join('')}</tr>${
  rows.map((r) => `<tr>${cols.map(([k]) => `<td>${esc(r[k])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}">لا يوجد</td></tr>`}</table></div>`;

const STATUS_AR = {
  pending_inspection: 'بانتظار الفحص', inspected: 'تم الفحص', needs_maintenance: 'يحتاج صيانة',
  in_progress: 'قيد الصيانة', pending_approval: 'بانتظار الاعتماد', completed: 'مكتمل', pending: 'لم تبدأ',
};

function renderDataHealth(h) {
  const t = h.totals;
  const mismatch = h.statusMatrix.filter((r) => r.stored !== r.derived).reduce((s, r) => s + Number(r.c), 0);
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>فحص بيانات الصيانة</title><style>
body{font-family:system-ui,Tahoma,sans-serif;margin:16px;background:#f6f7f9;color:#1d2430}
h1{font-size:20px}h2{font-size:16px;margin:22px 0 6px}p.n{color:#5a6475;font-size:13px;margin:4px 0 8px}
.k{display:flex;flex-wrap:wrap;gap:8px}.k div{background:#fff;border:1px solid #dde2ea;border-radius:8px;padding:8px 12px}
.k b{display:block;font-size:18px}.bad b{color:#b42318}.t{overflow-x:auto}
table{border-collapse:collapse;background:#fff;font-size:13px;min-width:320px}td,th{border:1px solid #dde2ea;padding:4px 8px;text-align:right}
th{background:#eef1f5}form{margin:8px 0}</style></head><body>
<h1>فحص سلامة بيانات الصيانة (قراية بس)</h1>
<form>من تاريخ <input type="date" name="from" value="${esc(h.from)}"> <button>عرض</button></form>
<h2>الإجماليات</h2><div class="k">
<div><b>${t.exchanges}</b>سنترالات</div><div><b>${t.cabinets}</b>كباين</div><div><b>${t.boxes}</b>بوكسات</div>
<div class="${h.duplicateBoxes ? 'bad' : ''}"><b>${h.duplicateBoxes}</b>بوكسات مكررة</div>
<div><b>${t.inspections}</b>فحوصات</div><div><b>${t.inspectionsArchived}</b>منها مؤرشف</div><div><b>${t.inspectionsAuto}</b>منها تلقائى</div>
<div><b>${t.inspectionItems}</b>بنود فحص</div><div><b>${t.tasks}</b>مهام صيانة</div><div><b>${t.itemsDone}</b>بنود اتصلّحت</div>
<div><b>${t.photos}</b>صور/فيديو</div><div><b>${t.photosInDb}</b>فى القاعدة</div><div><b>${t.photosOnR2}</b>على R2</div>
<div class="${t.photosMissing ? 'bad' : ''}"><b>${t.photosMissing}</b>صور ملفها مش موجود</div>
<div class="${h.blockedByDataReview ? 'bad' : ''}"><b>${h.blockedByDataReview}</b>صيانة خلصت واتقفلت بـ«مراجعة بيانات» اتضافت بعدها</div>
</div>
<h2>المهام حسب الحالة</h2>${table([['status', 'الحالة'], ['ar', ''], ['c', 'العدد']], h.taskStatus.map((r) => ({ ...r, ar: STATUS_AR[r.status] || '' })))}
<h2>حالة البوكس المتسجّلة × الحالة الصح من آخر فحص (${mismatch} مختلفين)</h2>
<p class="n">عدّادات لوحة التقارير بتقرا «المتسجّلة». لو مختلفة عن «الصح» يبقى العدّادات غلط والبيانات نفسها سليمة.</p>
${table([['storedAr', 'المتسجّلة'], ['derivedAr', 'الصح من آخر فحص'], ['c', 'عدد']], h.statusMatrix.map((r) => ({ ...r, storedAr: STATUS_AR[r.stored] || r.stored, derivedAr: STATUS_AR[r.derived] || r.derived })))}
<h2>الصيانة المكتملة حسب يوم الشغل</h2>
<p class="n">«مؤرشف — مش ظاهر»: صيانة اتعملت فعلاً، والبكس اتفحص بعدها فحص جديد فالقديم اتأرشف — تقرير الصيانة بيخفيها.</p>
${table([['day', 'اليوم'], ['in_report', 'ظاهر فى التقرير'], ['archived_hidden', 'مؤرشف — مش ظاهر'], ['partly_done', 'متعلّم جزء بس']], h.completedWork)}
<h2>النشاط يوم بيوم</h2>
${table([['day', 'اليوم'], ['inspections', 'فحوصات'], ['auto_inspections', 'فحوصات تلقائية'], ['items_done', 'بنود اتصلّحت'], ['tasks_completed', 'مهام اتقفلت'], ['photos', 'صور'], ['boxes_created', 'بوكسات اتعملت']], h.daily)}
<h2>بوكسات مكررة (نفس السنترال بعد توحيد الكتابة + نفس الكابينة + نفس الرقم)</h2>
${table([['names', 'أسماء السنترال'], ['cab', 'كابينة'], ['box', 'بكس'], ['c', 'عدد'], ['boxes', 'الحالة#رقم']], h.duplicates)}
<h2>السنترالات</h2>
${table([['name', 'السنترال'], ['created', 'اتعمل'], ['cabinets', 'كباين'], ['boxes', 'بوكسات'], ['boxes_new', 'بوكسات جديدة من التاريخ']], h.exchanges)}
</body></html>`;
}

module.exports = { dataHealth, renderDataHealth, NORM_EXCHANGE };
