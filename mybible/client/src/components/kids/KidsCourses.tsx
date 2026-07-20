import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, Check, ChevronLeft, Star, Award, Play, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  kidsCourses, getCompletedLessons, markLessonComplete, isLessonUnlocked,
  courseProgress, type KidsCourse, type KidsLesson,
} from '@/lib/kids-courses-data';

export default function KidsCourses() {
  const [completed, setCompleted] = useState<Record<string, boolean>>(() => getCompletedLessons());
  const [openCourse, setOpenCourse] = useState<KidsCourse | null>(null);
  const [activeLesson, setActiveLesson] = useState<KidsLesson | null>(null);
  const [answered, setAnswered] = useState<number | null>(null);

  const refresh = () => setCompleted(getCompletedLessons());

  const onAnswer = (idx: number) => {
    if (!activeLesson || answered !== null) return;
    setAnswered(idx);
    if (idx === activeLesson.quiz.correctIndex) {
      markLessonComplete(activeLesson.id);
      refresh();
      toast.success('أحسنت! أكملت الدرس 🌟');
    } else {
      toast.error('حاول مرة أخرى 💪');
    }
  };

  const openLesson = (lesson: KidsLesson) => {
    setActiveLesson(lesson);
    setAnswered(null);
  };

  // ── عرض درس مفتوح ──
  if (activeLesson && openCourse) {
    const idx = openCourse.lessons.findIndex(l => l.id === activeLesson.id);
    const isDone = !!completed[activeLesson.id] || answered === activeLesson.quiz.correctIndex;
    const nextLesson = idx < openCourse.lessons.length - 1 ? openCourse.lessons[idx + 1] : null;
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <button onClick={() => { setActiveLesson(null); setAnswered(null); }} className="flex items-center gap-1 text-sm text-primary font-semibold">
          <ArrowRight className="w-4 h-4" /> رجوع لدروس {openCourse.title}
        </button>

        <Card className="p-5 text-center">
          <div className="text-5xl mb-2">{activeLesson.emoji}</div>
          <h2 className="font-display text-xl font-bold text-foreground mb-1">{activeLesson.title}</h2>
          <p className="text-xs text-muted-foreground">الدرس {idx + 1} من {openCourse.lessons.length}</p>
        </Card>

        {activeLesson.videoId && (
          <div className="rounded-2xl overflow-hidden border shadow-sm aspect-video">
            <iframe
              src={`https://www.youtube.com/embed/${activeLesson.videoId}`}
              title={activeLesson.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        <Card className="p-5">
          <p className="text-base leading-loose text-foreground mb-4">{activeLesson.teaching}</p>
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-center">
            <p className="font-display text-lg text-primary leading-loose">{activeLesson.verse}</p>
            <p className="text-xs text-muted-foreground mt-1">({activeLesson.verseRef})</p>
          </div>
        </Card>

        {/* نشاط الدرس (سؤال) */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-foreground">نشاط الدرس</h3>
          </div>
          <p className="font-semibold text-foreground mb-3">{activeLesson.quiz.question}</p>
          <div className="space-y-2">
            {activeLesson.quiz.options.map((opt, i) => {
              const isCorrect = i === activeLesson.quiz.correctIndex;
              const chosen = answered === i;
              const show = answered !== null;
              return (
                <button
                  key={i}
                  onClick={() => onAnswer(i)}
                  disabled={answered !== null}
                  className={`w-full text-right rounded-xl border p-3 text-sm font-medium transition-colors ${
                    show && isCorrect ? 'bg-green-50 dark:bg-green-950/30 border-green-400 text-green-700'
                    : show && chosen ? 'bg-red-50 dark:bg-red-950/30 border-red-300 text-red-600'
                    : 'bg-background border-border hover:bg-muted'
                  }`}
                >
                  {show && isCorrect && <Check className="w-4 h-4 inline ml-1" />}
                  {opt}
                </button>
              );
            })}
          </div>
          {answered !== null && answered !== activeLesson.quiz.correctIndex && (
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setAnswered(null)}>
              حاول مرة أخرى
            </Button>
          )}
        </Card>

        {isDone && (
          <Card className="p-5 text-center bg-green-50 dark:bg-green-950/20 border-green-300">
            <div className="text-3xl mb-1">🎉</div>
            <p className="font-bold text-green-700 dark:text-green-400 mb-3">أكملت الدرس بنجاح!</p>
            {nextLesson ? (
              <Button onClick={() => openLesson(nextLesson)} className="w-full">
                <Play className="w-4 h-4 ml-1" /> الدرس التالي: {nextLesson.title}
              </Button>
            ) : (
              <div>
                <div className="flex items-center justify-center gap-2 text-amber-600 font-bold mb-1">
                  <Award className="w-5 h-5" /> أنهيت كل دروس هذا الكورس!
                </div>
                <Button variant="outline" className="w-full mt-2" onClick={() => setActiveLesson(null)}>
                  رجوع للدروس
                </Button>
              </div>
            )}
          </Card>
        )}
      </motion.div>
    );
  }

  // ── عرض دروس كورس مفتوح ──
  if (openCourse) {
    const progress = courseProgress(openCourse, completed);
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <button onClick={() => setOpenCourse(null)} className="flex items-center gap-1 text-sm text-primary font-semibold">
          <ArrowRight className="w-4 h-4" /> كل الكورسات
        </button>

        <Card className={`p-5 text-center bg-gradient-to-br ${openCourse.color} text-white`}>
          <div className="text-5xl mb-2">{openCourse.emoji}</div>
          <h2 className="font-display text-2xl font-bold mb-1">{openCourse.title}</h2>
          <p className="text-sm opacity-90 mb-3">{openCourse.description}</p>
          <div className="bg-white/25 rounded-full h-2.5 overflow-hidden">
            <div className="bg-white h-full rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs mt-1.5 opacity-90">{progress}% مكتمل</p>
        </Card>

        <div className="space-y-2.5">
          {openCourse.lessons.map((lesson, i) => {
            const done = !!completed[lesson.id];
            const unlocked = isLessonUnlocked(openCourse, i, completed);
            return (
              <button
                key={lesson.id}
                disabled={!unlocked}
                onClick={() => openLesson(lesson)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-right transition-colors ${
                  done ? 'bg-green-50 dark:bg-green-950/20 border-green-300'
                  : unlocked ? 'bg-background border-border hover:bg-muted cursor-pointer'
                  : 'bg-muted/40 border-border opacity-60 cursor-not-allowed'
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0 ${done ? 'bg-green-100 dark:bg-green-900/40' : 'bg-muted'}`}>
                  {unlocked ? lesson.emoji : <Lock className="w-5 h-5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground text-base truncate">{lesson.title}</p>
                  <p className="text-xs text-muted-foreground">الدرس {i + 1}</p>
                </div>
                {done ? (
                  <span className="shrink-0 flex items-center gap-1 text-xs text-green-600 font-semibold">
                    <Check className="w-4 h-4" /> تمّ
                  </span>
                ) : unlocked ? (
                  <ChevronLeft className="w-5 h-5 text-primary shrink-0" />
                ) : (
                  <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    );
  }

  // ── قائمة الكورسات ──
  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="font-display text-xl font-bold text-foreground">مدرسة الأطفال 🎓</h2>
        <p className="text-sm text-muted-foreground">دروس متدرّجة — أكمِل درساً ليُفتَح التالي</p>
      </div>
      <AnimatePresence>
        {kidsCourses.map(course => {
          const progress = courseProgress(course, completed);
          const done = course.lessons.filter(l => completed[l.id]).length;
          return (
            <motion.button
              key={course.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setOpenCourse(course)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br ${course.color} text-white shadow-md text-right`}
            >
              <div className="text-4xl shrink-0">{course.emoji}</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-lg font-bold">{course.title}</h3>
                <p className="text-xs opacity-90 mb-2">{course.description}</p>
                <div className="bg-white/25 rounded-full h-2 overflow-hidden">
                  <div className="bg-white h-full rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-[11px] mt-1 opacity-90">{done} / {course.lessons.length} دروس</p>
              </div>
              {progress === 100 && <Award className="w-6 h-6 shrink-0" />}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
