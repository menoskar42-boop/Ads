import { useState } from 'react';
import { ChevronRight, ChevronLeft, PlayCircle, BookOpen } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { YouTubeCard } from '@/components/YouTubeCard';

const courses = [
  {
    id: 1,
    title: 'كورس المشورة الأسرية',
    description: 'سلسلة شاملة في المشورة والحياة الأسرية المسيحية',
    color: 'from-teal-500 to-emerald-600',
    badge: 'bg-teal-900/30 border-teal-700/40 text-teal-300',
    videos: [
      { id: 'PDH2HsjRgKA', title: 'العلاقة الحميمة بين الزوجين | كورس المقبلين على الارتباط' },
      { id: 'nYz2u-n37jU', title: 'سيكولوجية الرجل والمرأة | بطريقة مُبَسَّطة للمناطق الشعبية' },
      { id: 'NuHd7z041Ss', title: 'المفتاح الأول | سيكولوجية الرجل والمرأة' },
      { id: '9v6qYFvlILI', title: 'المفتاح الثاني | مهارات التواصل بين الزوجين' },
      { id: 'R6SshSdKQtE', title: 'المفتاح الثالث | المشاجرة الناجحة' },
      { id: 'EvDKct8uQT8', title: 'المفتاح الرابع | مهارات العتاب' },
      { id: 'Mpc9tuEIW6M', title: 'النساء تصرخ: نريد رجالاً' },
      { id: '-rzJuGHi8mw', title: 'إدارة المال في الأسرة' },
      { id: 'nn3RfXQ4RZY', title: 'دستور البيت المسيحي' },
      { id: 'Hbp7zlEVR3Y', title: 'المفهوم الكتابي: «الرجل رأس المرأة»' },
      { id: 'oLs1SGGsWYk', title: 'المذبح العائلي' },
      { id: 'dn3noMJAryM', title: 'سيكولوجية العنف الأسري' },
      { id: 'sxt53X2irGI', title: 'كورس المشورة للمتزوجين — ج6 (نوفمبر 2017)' },
      { id: 'zqtE7JO4ftc', title: 'كورس المشورة للمتزوجين — ج4 (نوفمبر 2017)' },
      { id: 'XW-27D39RlM', title: 'كورس المشورة للمتزوجين — ج2 (نوفمبر 2017)' },
      { id: 'qJrIftSv4E4', title: 'صدمة سنة أولى جواز | كورس المقبلين على الارتباط' },
      { id: 'DpBNPrHixUI', title: 'الحدود الصحية بين الزوجين | لما كل واحد يرمي مسؤوليته على التاني' },
      { id: 'X7E5MAZlxB0', title: 'لو خُلقك ضيق؛ ماتتجوزش' },
      { id: 'UImdR2uNc4I', title: 'الحدود الصحية في العلاقات الزوجية' },
    ],
  },
  {
    id: 2,
    title: 'كورس التعامل مع التحديات',
    description: 'معالجة التحديات النفسية والأسرية من منظور مسيحي',
    color: 'from-violet-500 to-purple-600',
    badge: 'bg-violet-900/30 border-violet-700/40 text-violet-300',
    videos: [
      { id: 'bZGNETCXpRM', title: 'الجلسة الأولى — فهم التحديات النفسية' },
      { id: 'wfwSwOv_UO8', title: 'الجلسة الثانية — الاكتئاب والقلق من منظور مسيحي' },
      { id: 'zBiaXVAGeoM', title: 'الجلسة الثالثة — الشفاء الداخلي والمصالحة مع الذات' },
      { id: 'Os3Crvcoo5g', title: 'الجلسة الرابعة — بناء مقاومة روحية ونفسية' },
      { id: 'EhOb_TWriHo', title: 'الجلسة الخامسة — الرعاية الراعوية والدعم المجتمعي' },
    ],
  },
  {
    id: 3,
    title: 'نصائح أسرية إضافية',
    description: 'مجموعة فيديوهات مختارة في المشورة والحياة الزوجية',
    color: 'from-amber-500 to-orange-600',
    badge: 'bg-amber-900/30 border-amber-700/40 text-amber-300',
    videos: [
      { id: '7V4OGsIZtbY', title: 'ماذا تنتظر منك زوجتك؟ — للرجال فقط' },
      { id: 'h3b5usPVAWs', title: 'ماذا تنتظر منك زوجتك؟ — ساعة ونصف مشورة (Alkarma TV)' },
      { id: 'as3Xa4AYKw8', title: 'ماذا ينتظر منك زوجك؟ — للسيدات فقط' },
      { id: 'jo_Ek9bSHHo', title: 'ماذا ينتظر منك زوجك؟ — ساعة ونصف مشورة (Alkarma TV)' },
    ],
  },
];

export default function FamilyCounseling() {
  const [activeCourseIdx, setActiveCourseIdx] = useState(0);
  const [activeVideoIdx, setActiveVideoIdx] = useState(0);

  const course = courses[activeCourseIdx];
  const video = course.videos[activeVideoIdx];

  function selectCourse(idx: number) {
    setActiveCourseIdx(idx);
    setActiveVideoIdx(0);
  }

  function prev() {
    setActiveVideoIdx(i => Math.max(0, i - 1));
  }

  function next() {
    setActiveVideoIdx(i => Math.min(course.videos.length - 1, i + 1));
  }

  return (
    <section className="mb-10" dir="rtl">
      <h2 className="font-display text-xl font-bold text-foreground mb-4 flex items-center gap-2">
        <span className="text-xl">🎥</span> مشورة أسرية — فيديوهات وكورسات
      </h2>

      {/* اختيار الكورس */}
      <div className="flex flex-wrap gap-3 mb-5">
        {courses.map((c, idx) => (
          <button
            key={c.id}
            onClick={() => selectCourse(idx)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all ${
              activeCourseIdx === idx
                ? `bg-gradient-to-r ${c.color} text-white border-transparent shadow-md`
                : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>{c.title}</span>
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full border ${activeCourseIdx === idx ? 'bg-white/20 border-white/30 text-white' : c.badge}`}>
              {c.videos.length} جلسات
            </span>
          </button>
        ))}
      </div>

      <motion.div
        key={activeCourseIdx}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid lg:grid-cols-3 gap-4"
      >
        {/* مشغّل الفيديو */}
        <div className="lg:col-span-2 space-y-3">
          <Card className="p-3 rounded-xl shadow-lg">
            <YouTubeCard key={video.id} videoId={video.id} title={video.title} />
          </Card>

          {/* معلومات الفيديو + تنقل */}
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground mb-1">{course.title}</p>
                <h3 className="font-bold text-foreground leading-snug">{video.title}</h3>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border shrink-0 ${course.badge}`}>
                {activeVideoIdx + 1} / {course.videos.length}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={prev}
                disabled={activeVideoIdx === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
                السابق
              </button>
              <button
                onClick={next}
                disabled={activeVideoIdx === course.videos.length - 1}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                التالي
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </Card>
        </div>

        {/* قائمة الجلسات */}
        <div className="lg:col-span-1">
          <Card className="overflow-hidden">
            <div className={`px-4 py-3 bg-gradient-to-r ${course.color}`}>
              <p className="text-white font-bold text-sm">{course.title}</p>
              <p className="text-white/70 text-xs mt-0.5">{course.description}</p>
            </div>
            <div className="overflow-y-auto max-h-[380px] divide-y divide-border">
              {course.videos.map((v, idx) => (
                <button
                  key={v.id}
                  onClick={() => setActiveVideoIdx(idx)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-right hover:bg-muted transition-colors ${
                    idx === activeVideoIdx ? 'bg-muted' : ''
                  }`}
                >
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${
                    idx === activeVideoIdx
                      ? `bg-gradient-to-br ${course.color} text-white`
                      : 'bg-muted-foreground/10 text-muted-foreground'
                  }`}>
                    {idx === activeVideoIdx
                      ? <PlayCircle className="w-4 h-4" />
                      : <span className="text-xs font-bold">{idx + 1}</span>
                    }
                  </div>
                  <p className={`text-sm leading-snug flex-1 min-w-0 ${
                    idx === activeVideoIdx ? 'text-foreground font-medium' : 'text-muted-foreground'
                  }`}>
                    {v.title}
                  </p>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </motion.div>
    </section>
  );
}
