import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { usePageTracker } from '@/hooks/usePageTracker';
import { useExitTracker } from '@/hooks/useExitTracker';
import { motion, AnimatePresence } from 'framer-motion';
import { Baby, ChevronLeft, ChevronRight, Star, BookOpen, Volume2, VolumeX, Pause, Play, Video, Search, X, ListMusic, SkipForward, SkipBack, Music, Heart, Trophy, GraduationCap, CheckCircle2, XCircle, Compass, RotateCcw, Users, Printer, Mic, School } from 'lucide-react';
import { memorizationVerses, kidsBadges, computeEarnedBadges, LEVEL_LABELS, type AgeGroup, type MemorizationVerse } from '@/lib/kids-memorization-data';
import { interactiveStories, type InteractiveStory } from '@/lib/interactive-stories-data';
import { weeklyFamilyGuide, parentTips } from '@/lib/kids-parents-data';
import { sortVerses, shuffleWords } from '@/lib/kids-sort-verse-data';
import { getRandomQuiz, QUIZ_LENGTH, type QuizQuestion } from '@/lib/kids-quiz-data';
import KidsPuzzle from '@/components/kids/KidsPuzzle';
import KidsJigsawPuzzle from '@/components/kids/KidsJigsawPuzzle';
import KidsSnakesLadders from '@/components/kids/KidsSnakesLadders';
import KidsCourses from '@/components/kids/KidsCourses';
import { dataSync } from '@/lib/user-data-sync';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { childrenStoriesData, type ChildrenStory } from '@/lib/children-stories-data';
import { YouTubeCard } from '@/components/YouTubeCard';
import { getStoryAudioFile } from '@/lib/stories-audio-mapping';
import { kidsBibleVideos, videoCategories, getYouTubeThumbnail, searchVideos, kidsHymnsPlaylist, getHymnCategory, hymnCategories, type KidsVideo } from '@/lib/kids-bible-videos-data';

function normalizeAr(s: string) {
  return s.replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي').trim().toLowerCase();
}
function smartMatch(text: string, q: string) {
  const nt = normalizeAr(text), nq = normalizeAr(q);
  const re = new RegExp('(^|\\s)' + nq.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  return re.test(nt) || nt.includes(nq);
}
function dedupeByYtId(arr: KidsVideo[]) {
  const seen = new Set<string>();
  return arr.filter(v => { if (seen.has(v.youtubeId)) return false; seen.add(v.youtubeId); return true; });
}
import { SEOHead } from '@/components/SEOHead';
import { getVideoSchema } from '@/lib/seo-config';

// ── تنظيف النص العربي للمقارنة الصوتية ──────────────────────────────────────
function stripAr(s: string) {
  return s
    .replace(/[ً-ٰٟ]/g, '') // تشكيل
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/\s+/g, ' ').trim();
}
function voiceScore(spoken: string, target: string): number {
  const s = stripAr(spoken), t = stripAr(target);
  const tWords = t.split(' ').filter(Boolean);
  if (!tWords.length) return 0;
  const sWords = s.split(' ').filter(Boolean);
  const matched = tWords.filter(w => sWords.some(sw => sw.includes(w) || w.includes(sw))).length;
  return Math.round((matched / tWords.length) * 100);
}

function VoiceMemorizeButton({
  verse,
  done,
  onSuccess,
}: {
  verse: MemorizationVerse;
  done: boolean;
  onSuccess: () => void;
}) {
  const [uiState, setUiState] = useState<'idle' | 'recording' | 'result'>('idle');
  const [transcript, setTranscript] = useState('');
  const [score, setScore] = useState(0);
  const recRef  = useRef<any>(null);
  // ref avoids stale-closure in rec.onend
  const finalRef = useRef('');

  function startRecording() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error('المتصفح لا يدعم التعرف على الصوت'); return; }

    const rec = new SR();
    rec.lang            = 'ar-EG';   // مصري — أفضل تغطية عربية
    rec.continuous      = true;      // لا يتوقف بعد صمت قصير
    rec.interimResults  = true;
    rec.maxAlternatives = 5;
    finalRef.current    = '';

    rec.onresult = (e: any) => {
      let interimPart = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          let best = e.results[i][0].transcript;
          for (let j = 1; j < e.results[i].length; j++) {
            const alt = e.results[i][j].transcript;
            if (voiceScore(alt, verse.text) > voiceScore(best, verse.text)) best = alt;
          }
          finalRef.current += best + ' ';
        } else {
          interimPart = e.results[i][0].transcript;
        }
      }
      setTranscript((finalRef.current + interimPart).trim());
    };

    rec.onend = () => {
      // finalRef.current is always current — no stale-closure issue
      const spoken = finalRef.current.trim();
      const sc = voiceScore(spoken || transcript, verse.text);
      setScore(sc);
      setUiState('result');
      if (sc >= 60) onSuccess();
    };

    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed') toast.error('يرجى السماح بالوصول للميكروفون من إعدادات المتصفح');
      else if (e.error !== 'no-speech') toast.error('تعذّر التعرف على الصوت، حاول مرة أخرى');
      setUiState('idle');
    };

    recRef.current = rec;
    setTranscript('');
    setScore(0);
    finalRef.current = '';
    rec.start();
    setUiState('recording');
  }

  function stopRecording() { recRef.current?.stop(); }

  if (done) return (
    <button disabled className="mt-3 w-full py-2 rounded-lg text-sm font-medium bg-green-500 text-white flex items-center justify-center gap-2">
      <CheckCircle2 className="w-4 h-4" /> حفظت هذه الآية ✓
    </button>
  );

  /* ── شاشة التسجيل الكاملة — تخفي نص الآية تماماً ─────────────────────────── */
  if (uiState === 'recording' || uiState === 'result') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/97 backdrop-blur-md p-6 text-center">
        {/* هوية الآية بدون النص */}
        <div className="mb-8">
          <div className="text-6xl mb-3">{verse.emoji}</div>
          <p className="text-base font-bold text-primary">{verse.reference}</p>
          <p className="text-xs text-muted-foreground mt-1 bg-muted px-3 py-1 rounded-full inline-block">{verse.theme}</p>
        </div>

        {uiState === 'recording' ? (
          <>
            {/* نبضة الميكروفون */}
            <div className="relative mb-6">
              <motion.div
                animate={{ scale: [1, 1.35, 1], opacity: [0.35, 0.0, 0.35] }}
                transition={{ repeat: Infinity, duration: 1.4 }}
                className="absolute inset-0 rounded-full bg-red-400"
              />
              <div className="relative w-28 h-28 rounded-full bg-red-100 dark:bg-red-900/40 border-4 border-red-400 flex items-center justify-center">
                <Mic className="w-14 h-14 text-red-500" />
              </div>
            </div>

            <p className="text-sm font-semibold text-foreground mb-1">🎙️ قل الآية من حفظك...</p>
            <p className="text-xs text-muted-foreground mb-4">لا تنظر إلى النص — تذكّرها من قلبك</p>

            {/* ما يُسمع حتى الآن */}
            {transcript ? (
              <div className="max-w-xs w-full bg-muted/70 rounded-xl px-4 py-3 mb-5 text-sm leading-relaxed text-right min-h-[48px] border">
                {transcript}
              </div>
            ) : (
              <div className="max-w-xs w-full bg-muted/40 rounded-xl px-4 py-3 mb-5 min-h-[48px] border border-dashed flex items-center justify-center text-xs text-muted-foreground">
                سيظهر هنا ما تقوله...
              </div>
            )}

            <button
              onClick={stopRecording}
              className="px-10 py-3 rounded-full text-sm font-bold bg-red-500 hover:bg-red-600 text-white transition-colors"
            >
              ⏹ انتهيت — قيّم الآن
            </button>
          </>
        ) : (
          /* ── نتيجة التسجيل ── */
          <>
            {score >= 60 ? (
              <>
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  className="text-7xl mb-4"
                >🎉</motion.div>
                <p className="text-2xl font-black text-green-600 dark:text-green-400 mb-1">برافو! حفظت الآية</p>
                <p className="text-sm text-muted-foreground mb-5">نسبة الصحة: <span className="font-bold text-green-600">{score}%</span></p>
              </>
            ) : (
              <>
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                  className="text-7xl mb-4"
                >💪</motion.div>
                <p className="text-xl font-black text-amber-600 dark:text-amber-400 mb-1">أصبت {score}%</p>
                <p className="text-sm text-muted-foreground mb-5">تقدر تحاول مرة أخرى — الممارسة تصنع الحفظ!</p>
              </>
            )}

            {/* ما قاله المستخدم */}
            {transcript && (
              <div className="max-w-xs w-full bg-muted/70 rounded-xl px-4 py-3 mb-5 text-xs leading-relaxed text-right border">
                <span className="text-muted-foreground block mb-1">ما قلته:</span>
                {transcript}
              </div>
            )}

            <div className="flex gap-3 flex-wrap justify-center">
              {score < 60 && (
                <button
                  onClick={startRecording}
                  className="px-6 py-2.5 rounded-full text-sm font-bold border-2 border-purple-400 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 flex items-center gap-2 transition-colors"
                >
                  <Mic className="w-4 h-4" /> حاول مرة أخرى
                </button>
              )}
              <button
                onClick={() => setUiState('idle')}
                className="px-6 py-2.5 rounded-full text-sm font-bold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-foreground transition-colors"
              >
                ← رجوع للآية
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={startRecording}
      className="mt-3 w-full py-2 rounded-lg text-sm font-medium border border-purple-400 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 flex items-center justify-center gap-2 transition-all"
    >
      <Mic className="w-4 h-4" /> اضغط وقول الآية 🎙️
    </button>
  );
}

function AdviceVideoCard({ id, title }: { id: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-card shadow-sm">
      {playing ? (
        <div className="aspect-video">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={title}
          />
        </div>
      ) : (
        <button onClick={() => setPlaying(true)} className="relative w-full aspect-video group block">
          <img
            src={`https://img.youtube.com/vi/${id}/mqdefault.jpg`}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/35 transition-colors">
            <div className="w-14 h-14 rounded-full bg-red-600/90 flex items-center justify-center shadow-lg">
              <Play className="w-6 h-6 text-white fill-white ml-0.5" />
            </div>
          </div>
        </button>
      )}
      {title && (
        <p className="text-xs text-center text-muted-foreground px-3 py-2 leading-snug">{title}</p>
      )}
    </div>
  );
}

function useFavoriteHymns() {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('favorite-hymns') || '[]'); } catch { return []; }
  });
  const toggle = (id: string) => {
    setFavorites(prev => {
      const has = prev.includes(id);
      const next = has ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('favorite-hymns', JSON.stringify(next));
      if (has) dataSync.removeFavoriteHymn(id); else dataSync.favoriteHymn(id);
      return next;
    });
  };
  return { favorites, toggle, isFavorite: (id: string) => favorites.includes(id) };
}

function useMemorization() {
  const [memorized, setMemorized] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('memorized-verses') || '[]'); } catch { return []; }
  });
  const toggle = (id: string) => {
    setMemorized(prev => {
      const has = prev.includes(id);
      const next = has ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('memorized-verses', JSON.stringify(next));
      if (has) dataSync.removeMemorized(id); else dataSync.memorized(id);
      return next;
    });
  };
  return { memorized, toggle, isMemorized: (id: string) => memorized.includes(id) };
}

function ImageSlider({ images, title }: { images: string[]; title: string }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!images || images.length === 0) {
    return (
      <div className="relative h-56 sm:h-72 md:h-80 overflow-hidden rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center">
        <span className="text-6xl">📖</span>
      </div>
    );
  }

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div className="relative w-full" dir="rtl">
      <div className="relative h-56 sm:h-72 md:h-80 overflow-hidden rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30">
        <AnimatePresence mode="wait">
          <motion.img
            key={currentIndex}
            src={images[currentIndex]}
            alt={`${title} - صورة ${currentIndex + 1}`}
            className="w-full h-full object-contain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            loading="lazy"
          />
        </AnimatePresence>
        
        {images.length > 1 && (
          <>
            <button
              onClick={goToPrev}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 dark:bg-gray-800/80 shadow-lg flex items-center justify-center hover:bg-white dark:hover:bg-gray-700 transition-colors"
              data-testid="button-prev-image"
            >
              <ChevronRight className="w-6 h-6 text-gray-700 dark:text-gray-200" />
            </button>
            <button
              onClick={goToNext}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 dark:bg-gray-800/80 shadow-lg flex items-center justify-center hover:bg-white dark:hover:bg-gray-700 transition-colors"
              data-testid="button-next-image"
            >
              <ChevronLeft className="w-6 h-6 text-gray-700 dark:text-gray-200" />
            </button>
          </>
        )}
      </div>
      
      {images.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {images.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentIndex
                  ? 'bg-purple-500'
                  : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'
              }`}
              data-testid={`dot-${index}`}
            />
          ))}
        </div>
      )}
      
      <p className="text-center text-sm text-muted-foreground mt-2">
        صورة {currentIndex + 1} من {images.length}
      </p>
    </div>
  );
}

function StoryAudioPlayer({ storyId }: { storyId: number }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioFile = getStoryAudioFile(storyId);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      setIsPaused(false);
    }
  }, [storyId]);

  if (!audioFile) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <VolumeX className="w-4 h-4" />
        <span>الصوت غير متاح لهذه القصة</span>
      </div>
    );
  }

  const handlePlay = () => {
    try {
      if (isPaused && audioRef.current) {
        audioRef.current.play().catch(() => {});
        setIsPaused(false);
        setIsPlaying(true);
        return;
      }

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioFile);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsPlaying(true);
        setIsPaused(false);
      };

      audio.onended = () => {
        setIsPlaying(false);
        setIsPaused(false);
      };

      audio.onerror = () => {
        setIsPlaying(false);
        setIsPaused(false);
      };

      audio.play().catch(() => {
        setIsPlaying(false);
        setIsPaused(false);
      });
    } catch (e) {
      console.log("Audio play error:", e);
      setIsPlaying(false);
      setIsPaused(false);
    }
  };

  const handlePause = () => {
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      setIsPaused(true);
      setIsPlaying(false);
    }
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setIsPaused(false);
    }
  };

  return (
    <div className="flex gap-2">
      {!isPlaying ? (
        <Button
          onClick={handlePlay}
          className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          data-testid="button-listen"
        >
          <Volume2 className="w-5 h-5 ml-2" />
          {isPaused ? 'متابعة الاستماع' : 'استمع للقصة'}
        </Button>
      ) : (
        <>
          <Button
            onClick={handlePause}
            variant="secondary"
            className="flex-1"
            data-testid="button-pause"
          >
            <Pause className="w-5 h-5 ml-2" />
            إيقاف مؤقت
          </Button>
          <Button
            onClick={handleStop}
            variant="outline"
            data-testid="button-stop"
          >
            <VolumeX className="w-5 h-5" />
          </Button>
        </>
      )}
    </div>
  );
}

export default function Kids() {
  usePageTracker('/kids');
  useExitTracker('/kids');
  const [location, navigate] = useLocation();
  const activeTab = location.includes('/kids/hymns') ? 'hymns'
    : location.includes('/kids/videos') ? 'videos'
    : location.includes('/kids/courses') ? 'courses'
    : location.includes('/kids/stories') ? 'stories'
    : location.includes('/kids/memorize') ? 'memorize'
    : location.includes('/kids/games') ? 'games'
    : location.includes('/kids/adventures') ? 'adventures'
    : location.includes('/kids/parents') ? 'parents'
    : 'videos';
  const [selectedStory, setSelectedStory] = useState<number | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<KidsVideo | null>(null);
  const [videoSearch, setVideoSearch] = useState('');
  const [videoCat, setVideoCat] = useState('الكل');
  const [hymnSearch, setHymnSearch] = useState('');
  const [hymnCat, setHymnCat] = useState('الكل');
  const [playlistActive, setPlaylistActive] = useState(false);
  const [playlistIndex, setPlaylistIndex] = useState(0);
  const { favorites, toggle, isFavorite } = useFavoriteHymns();
  const { memorized, toggle: toggleMemorized, isMemorized } = useMemorization();
  const [memAgeGroup, setMemAgeGroup] = useState<AgeGroup>('level-1');
  const [currentQuiz, setCurrentQuiz] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [quizSessionScore, setQuizSessionScore] = useState(0);
  const [finalQuizScore, setFinalQuizScore] = useState(0);
  const [quizDone, setQuizDone] = useState(false);
  const [quizActive, setQuizActive] = useState(false);
  const [totalQuizCorrect, setTotalQuizCorrect] = useState(() => parseInt(localStorage.getItem('quiz-total-correct') || '0'));
  const [hadPerfectQuiz, setHadPerfectQuiz] = useState(() => localStorage.getItem('quiz-had-perfect') === 'true');
  const earnedBadges = computeEarnedBadges(memorized, totalQuizCorrect, hadPerfectQuiz);

  // ===== لعبة رتّب الآية =====
  const [sortActive, setSortActive] = useState(false);
  const [sortIdx, setSortIdx] = useState(0);
  const [sortPool, setSortPool] = useState<string[]>([]);
  const [sortPlaced, setSortPlaced] = useState<string[]>([]);
  const [sortResult, setSortResult] = useState<'correct' | 'wrong' | null>(null);
  const [sortSessionCorrect, setSortSessionCorrect] = useState(0);

  const startSortGame = () => {
    setSortIdx(0);
    setSortPool(shuffleWords(sortVerses[0].words));
    setSortPlaced([]);
    setSortResult(null);
    setSortSessionCorrect(0);
    setSortActive(true);
  };

  const pickWord = (word: string, poolIndex: number) => {
    if (sortResult !== null) return;
    setSortPool(prev => prev.filter((_, i) => i !== poolIndex));
    setSortPlaced(prev => [...prev, word]);
  };

  const returnWord = (word: string, placedIndex: number) => {
    if (sortResult !== null) return;
    setSortPlaced(prev => prev.filter((_, i) => i !== placedIndex));
    setSortPool(prev => [...prev, word]);
  };

  const checkSortAnswer = () => {
    const correct = sortVerses[sortIdx].words;
    const isCorrect = sortPlaced.length === correct.length && sortPlaced.every((w, i) => w === correct[i]);
    setSortResult(isCorrect ? 'correct' : 'wrong');
    if (isCorrect) setSortSessionCorrect(s => s + 1);
  };

  const nextSortVerse = () => {
    const next = sortIdx + 1;
    if (next >= sortVerses.length) {
      setSortActive(false);
      return;
    }
    setSortIdx(next);
    setSortPool(shuffleWords(sortVerses[next].words));
    setSortPlaced([]);
    setSortResult(null);
  };

  const resetSort = () => {
    if (sortResult !== null) return;
    setSortPool(shuffleWords(sortVerses[sortIdx].words));
    setSortPlaced([]);
  };

  // ===== محرك القصص التفاعلية (المغامرات) =====
  const [adventure, setAdventure] = useState<InteractiveStory | null>(null);
  const [advNodeId, setAdvNodeId] = useState<string>('');
  const [advPhase, setAdvPhase] = useState<'story' | 'questions' | 'done'>('story');
  const [advQ, setAdvQ] = useState(0);
  const [advAnswer, setAdvAnswer] = useState<number | null>(null);
  const [advScore, setAdvScore] = useState(0);

  const startAdventure = (story: InteractiveStory) => {
    setAdventure(story);
    setAdvNodeId(story.startNode);
    setAdvPhase('story');
    setAdvQ(0);
    setAdvAnswer(null);
    setAdvScore(0);
  };

  const exitAdventure = () => {
    setAdventure(null);
    setAdvNodeId('');
    setAdvPhase('story');
  };

  const goToNode = (nodeId: string | undefined) => {
    if (!adventure) return;
    if (!nodeId) {
      setAdvPhase('questions');
      setAdvQ(0);
      setAdvAnswer(null);
      setAdvScore(0);
      return;
    }
    setAdvNodeId(nodeId);
  };

  const handleAdvAnswer = (idx: number) => {
    if (advAnswer !== null) return;
    setAdvAnswer(idx);
  };

  const handleAdvNext = () => {
    if (!adventure || advAnswer === null) return;
    const isCorrect = advAnswer === adventure.questions[advQ].correctIndex;
    const newScore = advScore + (isCorrect ? 1 : 0);
    if (advQ < adventure.questions.length - 1) {
      setAdvScore(newScore);
      setAdvQ(q => q + 1);
      setAdvAnswer(null);
    } else {
      setAdvScore(newScore);
      setAdvPhase('done');
    }
  };

  const advNode = adventure ? adventure.nodes[advNodeId] : null;

  const openVideo = (video: KidsVideo, inPlaylist = false) => {
    setSelectedVideo(video);
    setPlaylistActive(inPlaylist);
    if (inPlaylist) {
      const idx = kidsHymnsPlaylist.findIndex(h => h.id === video.id);
      setPlaylistIndex(idx >= 0 ? idx : 0);
    }
  };

  const startPlaylist = () => {
    setPlaylistIndex(0);
    setSelectedVideo(kidsHymnsPlaylist[0]);
    setPlaylistActive(true);
  };

  const goNextPlaylist = () => {
    const next = playlistIndex + 1;
    if (next < kidsHymnsPlaylist.length) {
      setPlaylistIndex(next);
      setSelectedVideo(kidsHymnsPlaylist[next]);
    }
  };

  const goPrevPlaylist = () => {
    const prev = playlistIndex - 1;
    if (prev >= 0) {
      setPlaylistIndex(prev);
      setSelectedVideo(kidsHymnsPlaylist[prev]);
    }
  };

  const closeVideo = () => {
    setSelectedVideo(null);
    setPlaylistActive(false);
  };

  const story = childrenStoriesData.find(s => s.id === selectedStory);
  const storyVideos = dedupeByYtId(kidsBibleVideos.filter(v => v.category !== "ترانيم للأطفال"));
  const filteredVideos = storyVideos.filter(v => {
    const matchesCat = videoCat === 'الكل' || v.category === videoCat;
    const matchesSearch = !videoSearch.trim() || smartMatch(v.title, videoSearch) || v.keywords.some(kw => smartMatch(kw, videoSearch));
    return matchesCat && matchesSearch;
  });

  const kidsHymns = dedupeByYtId(kidsBibleVideos.filter(v => v.category === "ترانيم للأطفال"));
  const filteredHymns = kidsHymns.filter(h => {
    const matchesCat = hymnCat === 'الكل' || getHymnCategory(h) === hymnCat;
    const matchesSearch = !hymnSearch.trim() || smartMatch(h.title, hymnSearch) || h.keywords.some(kw => smartMatch(kw, hymnSearch));
    return matchesCat && matchesSearch;
  });
  const favoriteHymns = kidsHymns.filter(h => isFavorite(h.id));

  const startHymnsPlaylist = () => {
    setPlaylistIndex(0);
    setSelectedVideo(filteredHymns[0]);
    setPlaylistActive(true);
  };

  const handleToggleMemorized = (id: string) => {
    const wasMemorized = isMemorized(id);
    toggleMemorized(id);
    if (!wasMemorized) {
      const newMem = [...memorized, id];
      const oldBadges = computeEarnedBadges(memorized, totalQuizCorrect, hadPerfectQuiz);
      const newBadges = computeEarnedBadges(newMem, totalQuizCorrect, hadPerfectQuiz);
      newBadges.filter(b => !oldBadges.includes(b)).forEach(badgeId => {
        const badge = kidsBadges.find(b => b.id === badgeId);
        if (badge) toast.success(`شارة جديدة: ${badge.emoji} ${badge.title}!`);
      });
    }
  };

  const startQuiz = () => {
    setCurrentQuiz(getRandomQuiz());
    setCurrentQ(0);
    setSelectedAnswer(null);
    setQuizSessionScore(0);
    setFinalQuizScore(0);
    setQuizDone(false);
    setQuizActive(true);
  };

  const handleQuizAnswer = (idx: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(idx);
  };

  const handleQuizNext = () => {
    if (selectedAnswer === null) return;
    const isCorrect = selectedAnswer === currentQuiz[currentQ].correctIndex;
    const newScore = quizSessionScore + (isCorrect ? 1 : 0);
    if (currentQ < currentQuiz.length - 1) {
      setQuizSessionScore(newScore);
      setCurrentQ(q => q + 1);
      setSelectedAnswer(null);
    } else {
      setFinalQuizScore(newScore);
      const newTotal = totalQuizCorrect + newScore;
      setTotalQuizCorrect(newTotal);
      localStorage.setItem('quiz-total-correct', String(newTotal));
      if (newScore === QUIZ_LENGTH && !hadPerfectQuiz) {
        setHadPerfectQuiz(true);
        localStorage.setItem('quiz-had-perfect', 'true');
        toast.success('شارة جديدة: 🏆 بطل المسابقة!');
      }
      if (newTotal >= 10 && totalQuizCorrect < 10) {
        toast.success('شارة جديدة: 🎯 متسابق ذكي!');
      }
      setQuizDone(true);
      setQuizActive(false);
    }
  };

  const videoSchema = getVideoSchema(
    (activeTab === 'hymns' ? kidsHymns : kidsBibleVideos).map(v => ({
      id: v.id,
      title: v.title,
      youtubeId: v.youtubeId,
      description: v.title
    }))
  );

  const getNextStory = () => {
    if (!story) return;
    const currentIndex = childrenStoriesData.findIndex(s => s.id === story.id);
    if (currentIndex < childrenStoriesData.length - 1) {
      setSelectedStory(childrenStoriesData[currentIndex + 1].id);
    } else {
      setSelectedStory(childrenStoriesData[0].id);
    }
  };

  const getPrevStory = () => {
    if (!story) return;
    const currentIndex = childrenStoriesData.findIndex(s => s.id === story.id);
    if (currentIndex > 0) {
      setSelectedStory(childrenStoriesData[currentIndex - 1].id);
    } else {
      setSelectedStory(childrenStoriesData[childrenStoriesData.length - 1].id);
    }
  };


  return (
    <>
      <SEOHead customSchema={videoSchema} />
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md">
              <Baby className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">قسم الأطفال</h1>
            <p className="text-sm text-muted-foreground">قصص وفيديوهات من الكتاب المقدس للأطفال</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => navigate('/kids/' + v)} className="w-full">
          <TabsList className="w-full grid grid-cols-4 mb-6 h-auto gap-0.5 p-1">
            <TabsTrigger value="courses" className="flex-col gap-0.5 text-xs py-2 px-1 h-14" data-testid="tab-courses">
              <School className="w-5 h-5" />
              الدروس
            </TabsTrigger>
            <TabsTrigger value="videos" className="flex-col gap-0.5 text-xs py-2 px-1 h-14" data-testid="tab-videos">
              <Video className="w-5 h-5" />
              قصص الكتاب
            </TabsTrigger>
            <TabsTrigger value="hymns" className="flex-col gap-0.5 text-xs py-2 px-1 h-14" data-testid="tab-hymns">
              <Music className="w-5 h-5" />
              ترانيم
            </TabsTrigger>
            <TabsTrigger value="stories" className="flex-col gap-0.5 text-xs py-2 px-1 h-14" data-testid="tab-stories">
              <BookOpen className="w-5 h-5" />
              قصص مصورة
            </TabsTrigger>
            <TabsTrigger value="memorize" className="flex-col gap-0.5 text-xs py-2 px-1 h-14" data-testid="tab-memorize">
              <GraduationCap className="w-5 h-5" />
              حفظ الآيات
            </TabsTrigger>
            <TabsTrigger value="games" className="flex-col gap-0.5 text-xs py-2 px-1 h-14" data-testid="tab-games">
              <Trophy className="w-5 h-5" />
              ألعاب
            </TabsTrigger>
            <TabsTrigger value="adventures" className="flex-col gap-0.5 text-xs py-2 px-1 h-14" data-testid="tab-adventures">
              <Compass className="w-5 h-5" />
              مغامرات
            </TabsTrigger>
            <TabsTrigger value="parents" className="flex-col gap-0.5 text-xs py-2 px-1 h-14" data-testid="tab-parents">
              <Users className="w-5 h-5" />
              للآباء
            </TabsTrigger>
          </TabsList>

          <TabsContent value="courses">
            <KidsCourses />
          </TabsContent>

          <TabsContent value="stories">
            <AnimatePresence mode="wait">
              {!selectedStory ? (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Star className="w-5 h-5 text-amber-500" />
                    <span className="font-semibold text-foreground">اختر قصة ({childrenStoriesData.length} قصص)</span>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    {childrenStoriesData.map((story, index) => (
                      <motion.div
                        key={story.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                      >
                        <Card
                          className="overflow-hidden cursor-pointer hover:shadow-lg transition-all group"
                          onClick={() => setSelectedStory(story.id)}
                          data-testid={`story-card-${story.id}`}
                        >
                          <div className="h-40 overflow-hidden">
                            <img
                              src={story.images[0]}
                              alt={story.title}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              loading="lazy"
                            />
                          </div>
                          <div className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="font-display text-lg font-bold text-foreground">
                                {story.title}
                              </h3>
                              <Badge variant="secondary" className="text-xs">
                                {story.ageGroup}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {story.summary}
                            </p>
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <BookOpen className="w-3 h-3" />
                              <span>{story.bibleReference}</span>
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-6 p-4 bg-muted/30 rounded-xl text-center">
                    <p className="text-xs text-muted-foreground">
                      المحتوى مقتبس من Open Bible Stories (CC BY-SA 4.0)
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="detail"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedStory(null);
                    }}
                    className="mb-4"
                    data-testid="button-back-stories"
                  >
                    <ChevronLeft className="w-4 h-4 ml-1" />
                    رجوع للقصص
                  </Button>

                  {story && (
                    <Card className="overflow-hidden">
                      <div className="p-4 sm:p-6">
                        <ImageSlider images={story.images} title={story.title} />
                        
                        <div className="mt-6">
                          <div className="flex items-center gap-3 mb-2">
                            <h2 className="font-display text-2xl font-bold text-foreground">
                              {story.title}
                            </h2>
                            <Badge variant="secondary">{story.ageGroup}</Badge>
                          </div>
                          
                          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                            <BookOpen className="w-4 h-4" />
                            <span>{story.bibleReference}</span>
                          </div>

                          <p className="text-lg text-muted-foreground mb-6">{story.summary}</p>

                          <div className="mb-6">
                            <StoryAudioPlayer storyId={story.id} />
                          </div>

                          <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl mb-6">
                            <div className="flex items-center gap-2 mb-3">
                              <BookOpen className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                              <span className="font-semibold text-foreground">القصة</span>
                            </div>
                            <div className="font-display text-lg leading-loose text-foreground whitespace-pre-line">
                              {story.content}
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <Button 
                              variant="outline" 
                              className="flex-1" 
                              onClick={getPrevStory}
                              data-testid="button-prev-story"
                            >
                              <ChevronRight className="w-4 h-4 ml-1" />
                              القصة السابقة
                            </Button>
                            <Button 
                              variant="outline" 
                              className="flex-1" 
                              onClick={getNextStory}
                              data-testid="button-next-story"
                            >
                              القصة التالية
                              <ChevronLeft className="w-4 h-4 mr-1" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-4 bg-muted/30 border-t">
                        <p className="text-xs text-muted-foreground text-center">
                          المحتوى مقتبس من Open Bible Stories (CC BY-SA 4.0)
                        </p>
                      </div>
                    </Card>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="hymns">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Favorites section */}
              {favoriteHymns.length > 0 && (
                <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-950/30 dark:to-pink-950/30 rounded-xl border border-red-100 dark:border-red-900/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Heart className="w-5 h-5 text-red-500 fill-red-500" />
                      <span className="font-semibold text-foreground">المفضلة ({favoriteHymns.length})</span>
                    </div>
                    <Button
                      size="sm"
                      className="bg-red-500 hover:bg-red-600 text-white gap-1"
                      onClick={() => { setPlaylistIndex(0); setSelectedVideo(favoriteHymns[0]); setPlaylistActive(true); }}
                    >
                      <Play className="w-3 h-3" />
                      تشغيل المفضلة
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {favoriteHymns.map(h => (
                      <span key={h.id} className="text-xs bg-white dark:bg-gray-800 px-2 py-1 rounded-full border text-muted-foreground line-clamp-1 max-w-[120px] truncate" title={h.title}>{h.title}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="ابحث عن ترنيمة..."
                    value={hymnSearch}
                    onChange={(e) => setHymnSearch(e.target.value)}
                    className="pr-10 pl-10 h-12 text-lg rounded-xl"
                    data-testid="input-hymn-search"
                  />
                  {hymnSearch && (
                    <button onClick={() => setHymnSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2" data-testid="button-clear-hymn-search">
                      <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </div>
              </div>

              {/* Category filters */}
              <div className="flex flex-wrap gap-2 mb-4">
                {hymnCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setHymnCat(cat)}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${hymnCat === cat ? 'bg-purple-500 text-white border-purple-500' : 'bg-background text-muted-foreground border-border hover:border-purple-300'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-muted-foreground">{filteredHymns.length} ترنيمة</span>
                {filteredHymns.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950"
                    onClick={startHymnsPlaylist}
                    data-testid="button-start-hymns-playlist"
                  >
                    <ListMusic className="w-4 h-4" />
                    <span className="text-xs">تشغيل الكل</span>
                  </Button>
                )}
              </div>

              {/* Hymns grid */}
              <div className="grid sm:grid-cols-2 gap-4">
                {filteredHymns.map((hymn, index) => (
                  <motion.div
                    key={hymn.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.03 }}
                  >
                    <Card
                      className="overflow-hidden cursor-pointer hover:shadow-lg transition-all group"
                      onClick={() => openVideo(hymn, false)}
                      data-testid={`hymn-card-${hymn.id}`}
                    >
                      <div className="relative h-40 overflow-hidden">
                        <img
                          src={getYouTubeThumbnail(hymn.youtubeId)}
                          alt={hymn.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                            <Play className="w-8 h-8 text-purple-600 mr-[-4px]" />
                          </div>
                        </div>
                        <button
                          className="absolute top-2 left-2 w-8 h-8 rounded-full bg-white/80 dark:bg-gray-800/80 flex items-center justify-center shadow hover:bg-white transition-colors z-10"
                          onClick={(e) => { e.stopPropagation(); toggle(hymn.id); }}
                          data-testid={`hymn-fav-${hymn.id}`}
                        >
                          <Heart className={`w-4 h-4 ${isFavorite(hymn.id) ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                        </button>
                      </div>
                      <div className="p-4">
                        <h3 className="font-display text-lg font-bold text-foreground line-clamp-2">{hymn.title}</h3>
                        <p className="text-xs text-purple-500 mt-1">{getHymnCategory(hymn)}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {hymn.keywords.slice(0, 3).map((kw) => (
                            <Badge key={kw} variant="secondary" className="text-xs">{kw}</Badge>
                          ))}
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {filteredHymns.length === 0 && (
                <div className="text-center py-12">
                  <Music className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg text-muted-foreground">لا توجد ترانيم مطابقة</p>
                </div>
              )}
            </motion.div>
          </TabsContent>

          <TabsContent value="videos">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="ابحث عن فيديو..."
                    value={videoSearch}
                    onChange={(e) => setVideoSearch(e.target.value)}
                    className="pr-10 pl-10 h-12 text-lg rounded-xl"
                    data-testid="input-video-search"
                  />
                  {videoSearch && (
                    <button
                      onClick={() => setVideoSearch('')}
                      className="absolute left-3 top-1/2 -translate-y-1/2"
                      data-testid="button-clear-search"
                    >
                      <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </div>
              </div>

              {/* Category filters */}
              <div className="flex flex-wrap gap-2 mb-4">
                {['الكل', ...videoCategories.filter(c => c !== "ترانيم للأطفال")].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setVideoCat(cat)}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${videoCat === cat ? 'bg-purple-500 text-white border-purple-500' : 'bg-background text-muted-foreground border-border hover:border-purple-300'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-muted-foreground">{filteredVideos.length} فيديو</span>
              </div>

              {videoCat === 'الكل' ? (
                videoCategories.filter(c => c !== "ترانيم للأطفال").map((category) => {
                  const categoryVideos = filteredVideos.filter(v => v.category === category);
                  if (categoryVideos.length === 0) return null;
                  return (
                    <div key={category} className="mb-8">
                      <div className="flex items-center gap-2 mb-4">
                        <Video className="w-5 h-5 text-purple-500" />
                        <h2 className="font-display text-xl font-bold text-foreground flex-1">{category}</h2>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        {categoryVideos.map((video, index) => (
                        <motion.div
                          key={video.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                        >
                          <Card
                            className="overflow-hidden cursor-pointer hover:shadow-lg transition-all group"
                            onClick={() => openVideo(video, false)}
                            data-testid={`video-card-${video.id}`}
                          >
                            <div className="relative h-40 overflow-hidden">
                              <img
                                src={getYouTubeThumbnail(video.youtubeId)}
                                alt={video.title}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                                  <Play className="w-8 h-8 text-purple-600 mr-[-4px]" />
                                </div>
                              </div>
                            </div>
                            <div className="p-4">
                              <h3 className="font-display text-lg font-bold text-foreground line-clamp-2">
                                {video.title}
                              </h3>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {video.keywords.slice(0, 3).map((kw) => (
                                  <Badge key={kw} variant="secondary" className="text-xs">
                                    {kw}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {filteredVideos.map((video, index) => (
                    <motion.div
                      key={video.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.04 }}
                    >
                      <Card
                        className="overflow-hidden cursor-pointer hover:shadow-lg transition-all group"
                        onClick={() => openVideo(video, false)}
                        data-testid={`video-card-${video.id}`}
                      >
                        <div className="relative h-40 overflow-hidden">
                          <img
                            src={getYouTubeThumbnail(video.youtubeId)}
                            alt={video.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                              <Play className="w-8 h-8 text-purple-600 mr-[-4px]" />
                            </div>
                          </div>
                        </div>
                        <div className="p-4">
                          <h3 className="font-display text-lg font-bold text-foreground line-clamp-2">{video.title}</h3>
                          <p className="text-xs text-muted-foreground mt-1">{video.category}</p>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}

              {filteredVideos.length === 0 && (
                <div className="text-center py-12">
                  <Video className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg text-muted-foreground">لا توجد فيديوهات مطابقة</p>
                </div>
              )}
            </motion.div>
          </TabsContent>
          {/* ===== تاب حفظ الآيات ===== */}
          <TabsContent value="memorize">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-purple-500" />
                  <span className="font-semibold text-foreground">برنامج حفظ الآيات</span>
                </div>
                <span className="text-sm text-muted-foreground">{memorized.length} / {memorizationVerses.length}</span>
              </div>

              <div className="w-full h-3 bg-muted rounded-full mb-5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                  style={{ width: `${(memorized.length / memorizationVerses.length) * 100}%` }}
                />
              </div>

              <div className="flex flex-wrap gap-2 mb-5">
                {(['level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6', 'level-7', 'level-8', 'level-9', 'level-10'] as AgeGroup[]).map(ag => (
                  <button
                    key={ag}
                    onClick={() => setMemAgeGroup(ag)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${memAgeGroup === ag ? 'bg-purple-500 text-white border-purple-500' : 'border-border text-muted-foreground hover:border-purple-300'}`}
                    data-testid={`btn-level-${ag}`}
                  >
                    {LEVEL_LABELS[ag]}
                  </button>
                ))}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                {memorizationVerses.filter(v => v.ageGroup === memAgeGroup).map((verse, i) => {
                  const done = isMemorized(verse.id);
                  return (
                    <motion.div key={verse.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                      <Card className={`p-4 transition-all ${done ? 'border-green-400 bg-green-50/50 dark:bg-green-950/20' : ''}`}>
                        <div className="flex items-start gap-3">
                          <span className="text-3xl">{verse.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                              <span className="text-xs font-medium text-primary">{verse.reference}</span>
                              <Badge variant="secondary" className="text-xs shrink-0">{verse.theme}</Badge>
                            </div>
                            <p className="font-display text-xl sm:text-2xl leading-loose text-foreground text-right mt-1">{verse.text}</p>
                          </div>
                        </div>
                        <VoiceMemorizeButton
                          verse={verse}
                          done={done}
                          onSuccess={() => handleToggleMemorized(verse.id)}
                        />
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </TabsContent>

          {/* ===== تاب الألعاب ===== */}
          <TabsContent value="games">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* الشارات */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  <span className="font-semibold text-foreground">شاراتي ({earnedBadges.length}/{kidsBadges.length})</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {kidsBadges.map(badge => {
                    const earned = earnedBadges.includes(badge.id);
                    return (
                      <div key={badge.id} className={`p-3 rounded-xl border text-center transition-all ${earned ? badge.colorClass : 'bg-muted/30 text-muted-foreground border-border opacity-50'}`}>
                        <div className="text-2xl mb-1">{earned ? badge.emoji : '🔒'}</div>
                        <div className="text-xs font-semibold">{badge.title}</div>
                        <div className="text-xs mt-0.5 opacity-80">{badge.description}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* لغز الصور */}
              <div className="border-t pt-5 mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">🧩</span>
                  <span className="font-semibold text-foreground">لغز الصور</span>
                </div>
                <KidsPuzzle />
              </div>

              {/* لغز التجميع */}
              <div className="border-t pt-5 mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">🧩</span>
                  <span className="font-semibold text-foreground">لغز التجميع</span>
                </div>
                <KidsJigsawPuzzle />
              </div>

              {/* سلم وثعبان */}
              <div className="border-t pt-5 mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">🎲</span>
                  <span className="font-semibold text-foreground">سلم وثعبان</span>
                </div>
                <KidsSnakesLadders />
              </div>

              {/* لعبة رتّب الآية */}
              <div className="border-t pt-5 mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">🔤</span>
                  <span className="font-semibold text-foreground">لعبة رتّب الآية</span>
                </div>

                {!sortActive ? (
                  <div className="text-center py-6">
                    <div className="text-6xl mb-3">🔤</div>
                    <h3 className="text-xl font-bold mb-1">رتّب كلمات الآية</h3>
                    <p className="text-muted-foreground mb-5">الكلمات مبعثرة — اضغط عليها بالترتيب الصحيح</p>
                    <Button onClick={startSortGame} className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white px-8" data-testid="button-start-sort">
                      ابدأ اللعبة
                    </Button>
                  </div>
                ) : sortIdx >= sortVerses.length ? (
                  <div className="text-center py-6">
                    <div className="text-6xl mb-3">🎉</div>
                    <h3 className="text-xl font-bold mb-1">أحسنت! أكملت كل الآيات</h3>
                    <p className="text-muted-foreground mb-5">أجبت بشكل صحيح على {sortSessionCorrect} من {sortVerses.length} آيات</p>
                    <Button onClick={startSortGame} variant="outline" data-testid="button-sort-restart">العب مرة أخرى</Button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-muted-foreground">آية {sortIdx + 1} من {sortVerses.length}</span>
                      <span className="text-sm font-medium text-emerald-600">✓ {sortSessionCorrect} صحيحة</span>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">{sortVerses[sortIdx].emoji}</span>
                      <span className="text-sm text-primary font-medium">{sortVerses[sortIdx].reference}</span>
                    </div>

                    {/* منطقة الإجابة */}
                    <div className={`min-h-[64px] p-3 rounded-xl border-2 mb-4 flex flex-wrap gap-2 transition-colors ${
                      sortResult === 'correct' ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                      : sortResult === 'wrong' ? 'border-red-400 bg-red-50 dark:bg-red-950/20'
                      : 'border-dashed border-border bg-muted/20'
                    }`}>
                      {sortPlaced.length === 0 && sortResult === null && (
                        <span className="text-muted-foreground text-sm self-center">اضغط على الكلمات أدناه لترتيبها هنا</span>
                      )}
                      {sortPlaced.map((word, pi) => (
                        <button
                          key={pi}
                          onClick={() => returnWord(word, pi)}
                          disabled={sortResult !== null}
                          className="px-3 py-1.5 rounded-lg font-display text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:cursor-default transition-colors"
                          data-testid={`placed-word-${pi}`}
                        >
                          {word}
                        </button>
                      ))}
                      {sortResult === 'correct' && (
                        <span className="text-green-700 dark:text-green-300 font-bold text-sm self-center">✓ ممتاز! الترتيب صحيح</span>
                      )}
                    </div>

                    {/* عرض الإجابة الصحيحة عند الخطأ */}
                    {sortResult === 'wrong' && (
                      <div className="mb-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300">
                        <p className="text-xs text-muted-foreground mb-1">الترتيب الصحيح:</p>
                        <p className="font-display text-sm font-medium text-foreground leading-relaxed">{sortVerses[sortIdx].words.join(' ')}</p>
                      </div>
                    )}

                    {/* مجموعة الكلمات المبعثرة */}
                    <div className="flex flex-wrap gap-2 mb-4 p-3 rounded-xl bg-muted/30 min-h-[52px]">
                      {sortPool.map((word, pi) => (
                        <button
                          key={pi}
                          onClick={() => pickWord(word, pi)}
                          disabled={sortResult !== null}
                          className="px-3 py-1.5 rounded-lg font-display text-sm font-medium border-2 border-emerald-300 bg-white dark:bg-emerald-950/20 text-foreground hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:cursor-default transition-colors"
                          data-testid={`pool-word-${pi}`}
                        >
                          {word}
                        </button>
                      ))}
                    </div>

                    {/* أزرار التحكم */}
                    <div className="flex gap-2">
                      {sortResult === null ? (
                        <>
                          <Button variant="outline" size="sm" onClick={resetSort} disabled={sortPlaced.length === 0} className="flex-1" data-testid="button-sort-reset">
                            <RotateCcw className="w-4 h-4 ml-1" />
                            إعادة
                          </Button>
                          <Button
                            size="sm"
                            onClick={checkSortAnswer}
                            disabled={sortPlaced.length !== sortVerses[sortIdx].words.length}
                            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                            data-testid="button-sort-check"
                          >
                            <CheckCircle2 className="w-4 h-4 ml-1" />
                            تحقق
                          </Button>
                        </>
                      ) : (
                        <Button onClick={nextSortVerse} className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white" data-testid="button-sort-next">
                          {sortIdx + 1 < sortVerses.length ? 'الآية التالية' : 'إنهاء اللعبة'}
                          <ChevronLeft className="w-4 h-4 mr-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* المسابقة */}
              <div className="border-t pt-5">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-amber-500" />
                  <span className="font-semibold text-foreground">مسابقة أبطال الكتاب المقدس</span>
                </div>

                {/* شاشة البداية */}
                {!quizActive && !quizDone && (
                  <div className="text-center py-8">
                    <div className="text-6xl mb-4">🏆</div>
                    <h3 className="text-xl font-bold mb-2">هل أنت جاهز للتحدي؟</h3>
                    <p className="text-muted-foreground mb-6">{QUIZ_LENGTH} أسئلة عن الكتاب المقدس — من السهل إلى الصعب</p>
                    <Button onClick={startQuiz} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-8" data-testid="button-start-quiz">
                      <Star className="w-4 h-4 ml-2" />
                      ابدأ المسابقة
                    </Button>
                    {totalQuizCorrect > 0 && (
                      <p className="text-sm text-muted-foreground mt-4">إجمالي إجاباتك الصحيحة: {totalQuizCorrect}</p>
                    )}
                  </div>
                )}

                {/* المسابقة نشطة */}
                {quizActive && currentQuiz.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">سؤال {currentQ + 1} من {QUIZ_LENGTH}</span>
                      <span className="text-sm font-medium text-primary">النقاط: {quizSessionScore}</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full mb-4 overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(currentQ / QUIZ_LENGTH) * 100}%` }} />
                    </div>

                    <Card className="p-4 mb-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
                      <div className="text-3xl mb-2 text-center">{currentQuiz[currentQ].emoji}</div>
                      <p className="text-lg font-display font-semibold text-center text-foreground">{currentQuiz[currentQ].question}</p>
                    </Card>

                    <div className="grid gap-2 mb-4">
                      {currentQuiz[currentQ].options.map((option, idx) => {
                        const isSelected = selectedAnswer === idx;
                        const isCorrect = idx === currentQuiz[currentQ].correctIndex;
                        const showFeedback = selectedAnswer !== null;
                        return (
                          <button
                            key={idx}
                            onClick={() => handleQuizAnswer(idx)}
                            disabled={selectedAnswer !== null}
                            className={`w-full p-3 rounded-xl text-right border-2 transition-all font-medium ${showFeedback ? isCorrect ? 'bg-green-100 border-green-500 text-green-800 dark:bg-green-950/30 dark:text-green-300' : isSelected ? 'bg-red-100 border-red-500 text-red-800 dark:bg-red-950/30 dark:text-red-300' : 'bg-muted/50 border-border text-muted-foreground' : 'bg-background border-border hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20'}`}
                            data-testid={`quiz-option-${idx}`}
                          >
                            <span className="flex items-center gap-2">
                              {showFeedback && isCorrect && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                              {showFeedback && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                              {option}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedAnswer !== null && (
                      <Button onClick={handleQuizNext} className="w-full" data-testid="button-quiz-next">
                        {currentQ < currentQuiz.length - 1 ? 'السؤال التالي' : 'إنهاء المسابقة'}
                      </Button>
                    )}
                  </div>
                )}

                {/* النتيجة النهائية */}
                {quizDone && (
                  <div className="text-center py-6">
                    <div className="text-6xl mb-4">{finalQuizScore >= 8 ? '🏆' : finalQuizScore >= 5 ? '⭐' : '📚'}</div>
                    <h3 className="text-2xl font-bold mb-1">{finalQuizScore} / {QUIZ_LENGTH}</h3>
                    <p className="text-muted-foreground mb-2">
                      {finalQuizScore === QUIZ_LENGTH ? '🎉 ممتاز! إجابات صحيحة بالكامل!'
                        : finalQuizScore >= 8 ? 'أحسنت! نتيجة رائعة!'
                        : finalQuizScore >= 5 ? 'جيد! استمر في التعلم'
                        : 'واصل القراءة في الكتاب المقدس وحاول مرة أخرى'}
                    </p>
                    <p className="text-sm text-muted-foreground mb-6">إجمالي إجاباتك الصحيحة: {totalQuizCorrect}</p>
                    <Button onClick={startQuiz} variant="outline" data-testid="button-quiz-retry">العب مرة أخرى</Button>
                  </div>
                )}
              </div>
            </motion.div>
          </TabsContent>

          {/* ===== تاب المغامرات (قصص تفاعلية) ===== */}
          <TabsContent value="adventures">
            <AnimatePresence mode="wait">
              {!adventure ? (
                <motion.div key="adv-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Compass className="w-5 h-5 text-purple-500" />
                    <span className="font-semibold text-foreground">قصص تفاعلية — اختر مغامرتك ({interactiveStories.length})</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-5">اقرأ القصة، اتخذ القرارات، ثم أجب على الأسئلة واحفظ آية اليوم 🌟</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {interactiveStories.map((s, i) => (
                      <motion.div key={s.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                        <Card
                          className="p-5 cursor-pointer hover:shadow-lg hover:border-purple-300 transition-all"
                          onClick={() => startAdventure(s)}
                          data-testid={`adventure-card-${s.id}`}
                        >
                          <div className="flex items-start gap-4">
                            <span className="text-4xl">{s.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-display text-lg font-bold text-foreground mb-1">{s.title}</h3>
                              <p className="text-sm text-muted-foreground mb-2">{s.summary}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <BookOpen className="w-3 h-3" />
                                <span>{s.bibleReference}</span>
                              </div>
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div key="adv-play" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <Button variant="ghost" size="sm" onClick={exitAdventure} className="mb-4" data-testid="button-exit-adventure">
                    <ChevronLeft className="w-4 h-4 ml-1" />
                    رجوع للمغامرات
                  </Button>

                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl">{adventure.emoji}</span>
                    <h2 className="font-display text-2xl font-bold text-foreground">{adventure.title}</h2>
                  </div>

                  {/* مرحلة القصة */}
                  {advPhase === 'story' && advNode && (
                    <Card className="p-5 sm:p-6">
                      {advNode.image && (
                        <img src={advNode.image} alt={adventure.title} className="w-full h-48 sm:h-64 object-contain rounded-xl mb-5 bg-purple-50 dark:bg-purple-950/20" loading="lazy" />
                      )}
                      <p className="font-display text-lg sm:text-xl leading-loose text-foreground mb-6">{advNode.text}</p>

                      {advNode.choices ? (
                        <div className="grid gap-3">
                          {advNode.choices.map((c, ci) => (
                            <button
                              key={ci}
                              onClick={() => goToNode(c.next)}
                              className="w-full text-right p-4 rounded-xl border-2 border-purple-200 dark:border-purple-900/40 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-all font-medium text-foreground"
                              data-testid={`adventure-choice-${ci}`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <Button
                          onClick={() => goToNode(advNode.next)}
                          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                          data-testid="button-adventure-continue"
                        >
                          {advNode.next ? 'تابع القصة' : 'أجب على الأسئلة'}
                          <ChevronLeft className="w-4 h-4 mr-1" />
                        </Button>
                      )}
                    </Card>
                  )}

                  {/* مرحلة الأسئلة */}
                  {advPhase === 'questions' && (
                    <Card className="p-5 sm:p-6">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-medium text-purple-600">سؤال {advQ + 1} من {adventure.questions.length}</span>
                        <Star className="w-5 h-5 text-amber-500" />
                      </div>
                      <p className="font-display text-lg font-bold text-foreground mb-5">{adventure.questions[advQ].question}</p>
                      <div className="grid gap-3 mb-5">
                        {adventure.questions[advQ].options.map((opt, oi) => {
                          const correct = oi === adventure.questions[advQ].correctIndex;
                          const showResult = advAnswer !== null;
                          return (
                            <button
                              key={oi}
                              onClick={() => handleAdvAnswer(oi)}
                              disabled={advAnswer !== null}
                              className={`w-full text-right p-4 rounded-xl border-2 transition-all font-medium flex items-center justify-between ${
                                showResult && correct ? 'border-green-500 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300'
                                : showResult && advAnswer === oi ? 'border-red-400 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                                : 'border-border hover:border-purple-400 text-foreground'
                              }`}
                              data-testid={`adventure-answer-${oi}`}
                            >
                              {opt}
                              {showResult && correct && <CheckCircle2 className="w-5 h-5" />}
                              {showResult && !correct && advAnswer === oi && <XCircle className="w-5 h-5" />}
                            </button>
                          );
                        })}
                      </div>
                      {advAnswer !== null && (
                        <Button onClick={handleAdvNext} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white" data-testid="button-adventure-next-question">
                          {advQ < adventure.questions.length - 1 ? 'السؤال التالي' : 'إنهاء المغامرة'}
                          <ChevronLeft className="w-4 h-4 mr-1" />
                        </Button>
                      )}
                    </Card>
                  )}

                  {/* مرحلة النهاية */}
                  {advPhase === 'done' && (
                    <Card className="p-6 text-center">
                      <div className="text-6xl mb-3">🌟</div>
                      <h3 className="text-2xl font-bold text-foreground mb-1">أحسنت!</h3>
                      <p className="text-muted-foreground mb-5">أجبت على {advScore} من {adventure.questions.length} أسئلة بشكل صحيح</p>

                      <div className="p-4 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 rounded-xl mb-4 text-right">
                        <div className="flex items-center gap-2 mb-2">
                          <BookOpen className="w-5 h-5 text-amber-600" />
                          <span className="font-semibold text-foreground">آية للحفظ</span>
                        </div>
                        <p className="font-display text-lg leading-relaxed text-foreground">«{adventure.memoryVerse.text}»</p>
                        <p className="text-sm text-primary mt-2">{adventure.memoryVerse.ref}</p>
                      </div>

                      <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 rounded-xl mb-6 text-right">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl">🙏</span>
                          <span className="font-semibold text-foreground">صلاة</span>
                        </div>
                        <p className="font-display text-base leading-relaxed text-foreground">{adventure.prayer}</p>
                      </div>

                      <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => startAdventure(adventure)} data-testid="button-adventure-replay">
                          <RotateCcw className="w-4 h-4 ml-1" />
                          أعد المغامرة
                        </Button>
                        <Button className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white" onClick={exitAdventure} data-testid="button-adventure-more">
                          مغامرة أخرى
                          <ChevronLeft className="w-4 h-4 mr-1" />
                        </Button>
                      </div>
                    </Card>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          {/* ===== تاب للآباء وخدّام مدارس الأحد ===== */}
          <TabsContent value="parents">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center justify-between mb-4 print:hidden">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-500" />
                  <span className="font-semibold text-foreground">للآباء وخدّام مدارس الأحد</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print-guide">
                  <Printer className="w-4 h-4 ml-1" />
                  طباعة الدليل
                </Button>
              </div>

              <p className="text-sm text-muted-foreground mb-6 print:hidden">دليل أسبوعي يساعدكم على بناء عادة روحية يومية مع أطفالكم — نشاط بسيط لكل يوم.</p>

              <div id="parents-printable">
                <h3 className="font-display text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                  <span className="text-2xl">📅</span> الدليل الأسبوعي للأسرة
                </h3>
                <div className="grid sm:grid-cols-2 gap-4 mb-8">
                  {weeklyFamilyGuide.map((d, i) => (
                    <motion.div key={d.day} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                      <Card className="p-4 h-full">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-2xl">{d.emoji}</span>
                          <div>
                            <span className="text-xs text-muted-foreground">{d.day}</span>
                            <h4 className="font-bold text-foreground leading-tight">{d.title}</h4>
                          </div>
                        </div>
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg mb-3">
                          <p className="font-display text-sm leading-relaxed text-foreground">«{d.verse.text}»</p>
                          <p className="text-xs text-primary mt-1">{d.verse.ref}</p>
                        </div>
                        <p className="text-sm text-foreground mb-2"><span className="font-semibold">النشاط: </span>{d.activity}</p>
                        <p className="text-sm text-muted-foreground"><span className="font-semibold">للحوار: </span>{d.question}</p>
                      </Card>
                    </motion.div>
                  ))}
                </div>

                <h3 className="font-display text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                  <span className="text-2xl">💡</span> نصائح للتربية الروحية
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {parentTips.map((t, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                      <Card className="p-4 flex items-start gap-3 h-full">
                        <span className="text-3xl">{t.emoji}</span>
                        <div>
                          <h4 className="font-bold text-foreground mb-1">{t.title}</h4>
                          <p className="text-sm text-muted-foreground leading-relaxed">{t.text}</p>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>


                {/* قسم المشورة — فيديوهات */}
                <div className="mt-8 print:hidden">
                  <h3 className="font-display text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                    <span className="text-2xl">🎬</span> ركن المشورة
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">فيديوهات مختارة في التربية الروحية ومشورة الأسرة المسيحية.</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <AdviceVideoCard id="as3Xa4AYKw8" title="" />
                    <AdviceVideoCard id="jo_Ek9bSHHo" title="" />
                    <AdviceVideoCard id="7V4OGsIZtbY" title="" />
                    <AdviceVideoCard id="h3b5usPVAWs" title="" />
                  </div>
                </div>
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>

        <Dialog open={!!selectedVideo} onOpenChange={(open) => !open && closeVideo()}>
          <DialogContent className="max-w-3xl p-0 overflow-hidden" data-testid="dialog-video">
            <DialogHeader className="p-4 pb-0">
              <div className="flex items-center justify-between gap-2">
                {playlistActive && (
                  <span className="text-xs text-muted-foreground bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-full font-medium whitespace-nowrap">
                    {playlistIndex + 1} / {kidsHymnsPlaylist.length}
                  </span>
                )}
                <DialogTitle className="text-right font-display text-xl flex-1" data-testid="text-video-title">
                  {selectedVideo?.title}
                </DialogTitle>
                {selectedVideo && (
                  <button
                    onClick={() => toggle(selectedVideo.id)}
                    className="shrink-0 p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                    data-testid="button-favorite-video"
                    aria-label={isFavorite(selectedVideo.id) ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                  >
                    <Heart className={`w-6 h-6 transition-all ${isFavorite(selectedVideo.id) ? 'fill-red-500 text-red-500 scale-110' : 'text-gray-400'}`} />
                  </button>
                )}
              </div>
            </DialogHeader>
            <div className="w-full">
              {selectedVideo && (
                <YouTubeCard
                  key={selectedVideo.youtubeId}
                  videoId={selectedVideo.youtubeId}
                  title={selectedVideo.title}
                />
              )}
            </div>
            <div className="p-4 pt-2">
              {playlistActive && (
                <div className="flex items-center justify-between gap-2 mb-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goNextPlaylist}
                    disabled={playlistIndex >= kidsHymnsPlaylist.length - 1}
                    className="gap-1"
                    data-testid="button-playlist-next"
                  >
                    <SkipBack className="w-4 h-4" />
                    التالي
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    <ListMusic className="w-3 h-3 inline ml-1" />
                    قائمة التشغيل
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goPrevPlaylist}
                    disabled={playlistIndex <= 0}
                    className="gap-1"
                    data-testid="button-playlist-prev"
                  >
                    السابق
                    <SkipForward className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {selectedVideo?.keywords.map((kw) => (
                  <Badge key={kw} variant="outline">
                    {kw}
                  </Badge>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </motion.div>
      </div>
    </>
  );
}
