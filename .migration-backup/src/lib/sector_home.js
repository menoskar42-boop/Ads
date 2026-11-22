'use strict';
/**
 * كل قطاع ليه نظام إدارة على مسار خاص — الجدول ده هو المصدر الوحيد له.
 *
 * كان مفيش جدول: `/demo/:slug` كان بيبعت الورشة والعيادة بس لنظامهم، و
 * `/company/dashboard` بيحوّل الصيدلية والمطاعم بس. أي قطاع تاني (تغذية،
 * جيم، موبيليا، قاعة، حضانة، قسّطلي) كان صاحبه بيدخل اللوحة العامة (أعمال ·
 * بانرات) ومفيش أي رابط في القايمة ولا في اللوحة يوصّله لنظامه — ولا الديمو
 * كان بيوري النظام اللي الزائر هيشتريه. (اتلقط من فحص مانوس ٢٠٢٦-٠٩-٢٤.)
 *
 * الحارس: scripts/check-sector-home.js — كل نوع في business_types ليه نظام
 * مركّب في server.js لازم يبقى هنا.
 */
const SECTOR_HOME = {
  pharmacy:     { path: '/pharmacy',  label: 'نظام الصيدلية', labelEn: 'Pharmacy system' },
  orders:       { path: '/food',      label: 'نظام الطلبات والمنيو', labelEn: 'Orders & menu system' },
  clinic:       { path: '/clinic',    label: 'نظام العيادة', labelEn: 'Clinic system' },
  gym:          { path: '/gym',       label: 'نظام الجيم', labelEn: 'Gym system' },
  nutrition:    { path: '/nutrition', label: 'نظام التغذية', labelEn: 'Nutrition system' },
  furniture:    { path: '/furniture', label: 'نظام المعرض والمصنع', labelEn: 'Showroom & factory system' },
  workshop:     { path: '/workshop',  label: 'نظام الورشة', labelEn: 'Workshop system' },
  hall:         { path: '/hall',      label: 'نظام القاعة', labelEn: 'Hall system' },
  nursery:      { path: '/nursery',   label: 'نظام الحضانة', labelEn: 'Nursery system' },
  installments: { path: '/qastly',    label: 'نظام قسّطلي', labelEn: 'Qastly installments' },
};

/** نظام القطاع لنوع صفحة، أو null (بورتفوليو/متجر — لوحتهم هي /company). */
function sectorHome(pageType) {
  return SECTOR_HOME[String(pageType || '')] || null;
}

module.exports = { SECTOR_HOME, sectorHome };
