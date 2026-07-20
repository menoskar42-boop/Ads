import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, BookOpen, Heart, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SEOHead } from '@/components/SEOHead';
import { usePageTracker } from '@/hooks/usePageTracker';
import { useExitTracker } from '@/hooks/useExitTracker';
import { familyVerses, familyPrayers, familyWorshipIdeas } from '@/lib/family-data';
import FamilyCounseling from '@/components/FamilyCounseling';

const familySEO = {
  title: 'ركن العائلة المسيحية - رفيقي | آيات وصلوات وأفكار للعبادة الأسرية',
  description: 'ركن العائلة المسيحية: آيات عن الأسرة، صلوات الصباح والمساء والطعام، وأفكار عملية للعبادة الأسرية وبناء حياة روحية في البيت.',
  keywords: ['العائلة المسيحية', 'صلوات الأسرة', 'العبادة الأسرية', 'آيات عن الأسرة', 'مذبح العائلة', 'التربية الروحية', 'الأسرة القبطية'],
};

type Section = 'verses' | 'prayers' | 'ideas' | null;

export default function Family() {
  usePageTracker('/family');
  useExitTracker('/family');

  const [activeSection, setActiveSection] = useState<Section>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    if (activeSection !== null) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeSection]);

  const cards = [
    {
      id: 'verses' as Section,
      title: 'آيات عن الأسرة',
      subtitle: 'كلام الله لبيتك',
      icon: <BookOpen className="w-10 h-10 text-white" />,
      bg: 'from-purple-500 to-violet-600',
      lightBg: 'from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30',
      border: 'border-purple-200 dark:border-purple-800',
      btn: 'bg-white text-purple-700 hover:bg-purple-50',
      count: `${familyVerses.length} آية`,
    },
    {
      id: 'prayers' as Section,
      title: 'صلوات الأسرة',
      subtitle: 'صلّ مع عائلتك',
      icon: <span className="text-4xl leading-none">🙏</span>,
      bg: 'from-emerald-500 to-teal-600',
      lightBg: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30',
      border: 'border-emerald-200 dark:border-emerald-800',
      btn: 'bg-white text-emerald-700 hover:bg-emerald-50',
      count: `${familyPrayers.length} صلوات`,
    },
    {
      id: 'ideas' as Section,
      title: 'أفكار للعبادة',
      subtitle: 'اجعل بيتك هيكلاً',
      icon: <Lightbulb className="w-10 h-10 text-white" />,
      bg: 'from-amber-500 to-orange-500',
      lightBg: 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30',
      border: 'border-amber-200 dark:border-amber-800',
      btn: 'bg-white text-amber-700 hover:bg-amber-50',
      count: `${familyWorshipIdeas.length} فكرة`,
    },
  ];

  const activeCard = cards.find(c => c.id === activeSection);

  return (
    <>
      <SEOHead dynamicSEO={familySEO} />
      <div className="container mx-auto px-4 py-6 max-w-2xl">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-3 mb-6"
        >
          {activeSection ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActiveSection(null)}
              className="rounded-full"
            >
              <ArrowRight className="w-5 h-5" />
            </Button>
          ) : (
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-md`}>
              <Heart className="w-6 h-6 text-white" />
            </div>
          )}
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              {activeSection ? activeCard?.title : 'ركن العائلة'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeSection ? activeCard?.subtitle : 'آيات وصلوات وأفكار لبناء حياة روحية في البيت'}
            </p>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {activeSection === null && (
            <motion.div
              key="hub"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {/* مشورة أسرية */}
              <FamilyCounseling />

              {/* 3 Cards */}
              <div className="flex flex-col gap-4 mt-4">
                {cards.map((card, i) => (
                  <motion.div
                    key={card.id!}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <div className={`rounded-2xl bg-gradient-to-br ${card.bg} p-6 shadow-lg`}>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
                          {card.icon}
                        </div>
                        <div className="flex-1">
                          <h2 className="text-xl font-bold text-white font-display">{card.title}</h2>
                          <p className="text-white/80 text-sm">{card.count}</p>
                        </div>
                      </div>
                      <Button
                        className={`w-full font-bold rounded-xl py-3 text-base shadow ${card.btn}`}
                        onClick={() => setActiveSection(card.id)}
                      >
                        عرض {card.title}
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeSection === 'verses' && (
            <motion.div
              key="verses"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex flex-col gap-4">
                {familyVerses.map((v, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <Card className={`p-4 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/20 dark:to-violet-950/20 border-purple-100 dark:border-purple-900`}>
                      <p className="font-display text-lg leading-relaxed text-foreground">«{v.text}»</p>
                      <p className="text-sm text-purple-600 dark:text-purple-400 mt-2 font-medium">{v.ref}</p>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeSection === 'prayers' && (
            <motion.div
              key="prayers"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex flex-col gap-4">
                {familyPrayers.map((p, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <Card className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-4xl">{p.emoji}</span>
                        <h3 className="font-bold text-foreground text-lg">{p.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{p.text}</p>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeSection === 'ideas' && (
            <motion.div
              key="ideas"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex flex-col gap-4">
                {familyWorshipIdeas.map((idea, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <Card className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-100 dark:border-amber-900">
                      <div className="flex items-start gap-3">
                        <span className="text-3xl mt-1">{idea.emoji}</span>
                        <div>
                          <h3 className="font-bold text-foreground mb-1">{idea.title}</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">{idea.text}</p>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
