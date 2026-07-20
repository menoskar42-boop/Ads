import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, ChevronLeft, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, type EmotionTopicVerse } from '@/lib/api';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { usePageTracker } from '@/hooks/usePageTracker';
import { useExitTracker } from '@/hooks/useExitTracker';

export default function Emotions() {
  usePageTracker('/emotions');
  useExitTracker('/emotions');
  const [selectedEmotion, setSelectedEmotion] = useState<number | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<number | null>(null);
  const [freeText, setFreeText] = useState('');

  const { data: emotions, isLoading: emotionsLoading } = useQuery({
    queryKey: ['emotions'],
    queryFn: api.emotions.getAll,
  });

  const { data: topics, isLoading: topicsLoading } = useQuery({
    queryKey: ['topics'],
    queryFn: api.topics.getAll,
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: api.user.get,
  });

  const { data: emotionVerses, isLoading: emotionVersesLoading } = useQuery({
    queryKey: ['emotionVerses', selectedEmotion],
    queryFn: () => api.emotions.getVerses(selectedEmotion!),
    enabled: !!selectedEmotion,
  });

  const { data: topicVerses, isLoading: topicVersesLoading } = useQuery({
    queryKey: ['topicVerses', selectedTopic],
    queryFn: () => api.topics.getVerses(selectedTopic!),
    enabled: !!selectedTopic,
  });

  const aiQueryMutation = useMutation({
    mutationFn: (query: string) => api.ai.query(query),
    onSuccess: (data) => {
      console.log('[AI-Query] Response received:', data);
      if (data.success && data.response) {
        toast.success('تم التحليل بنجاح');
      } else if (data.error) {
        toast.error(data.error);
      } else if (!data.response) {
        console.error('[AI-Query] Empty response received');
        toast.error('لم يتم استلام رد من الخادم');
      }
    },
    onError: (error: Error) => {
      console.error('[AI-Query] Request failed:', error);
      toast.error(`فشل الطلب: ${error.message}`);
    },
  });

  const handleAiQuery = () => {
    if (!freeText.trim()) {
      toast.error('الرجاء كتابة نص للتحليل');
      return;
    }
    aiQueryMutation.mutate(freeText);
  };

  const versesRef = useRef<HTMLDivElement>(null);

  const scrollToVerses = () => {
    setTimeout(() => {
      versesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const selectedEmotionData = emotions?.find(e => e.id === selectedEmotion);
  const selectedTopicData = topics?.find(t => t.id === selectedTopic);
  const verses: EmotionTopicVerse[] = emotionVerses || topicVerses || [];
  const versesLoading = emotionVersesLoading || topicVersesLoading;

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <SEOHead />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center shadow-md">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">تعزية روحية</h1>
            <p className="text-sm text-muted-foreground">آيات معزية حسب مشاعرك أو موضوعك</p>
          </div>
        </div>

        <Tabs defaultValue="free" className="mb-6">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="emotions" data-testid="tab-emotions">حسب المشاعر</TabsTrigger>
            <TabsTrigger value="topics" data-testid="tab-topics">حسب الموضوع</TabsTrigger>
            <TabsTrigger value="free" data-testid="tab-free">
              <Sparkles className="w-3.5 h-3.5 ml-1" />
              أتكلم مع الإنجيل
            </TabsTrigger>
          </TabsList>

          <TabsContent value="emotions" className="mt-4">
            {emotionsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                {emotions?.map((emotion) => (
                  <motion.button
                    key={emotion.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      const newId = emotion.id === selectedEmotion ? null : emotion.id;
                      setSelectedEmotion(newId);
                      setSelectedTopic(null);
                      if (newId) scrollToVerses();
                    }}
                    className={cn(
                      'p-4 rounded-2xl border-2 transition-all text-center',
                      selectedEmotion === emotion.id
                        ? 'border-primary bg-primary/5 shadow-md'
                        : 'border-border hover:border-primary/50 bg-card'
                    )}
                    data-testid={`emotion-${emotion.id}`}
                  >
                    <span className="text-3xl mb-2 block">{emotion.icon}</span>
                    <span className="font-semibold text-foreground">{emotion.name}</span>
                  </motion.button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="topics" className="mt-4">
            {topicsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                {topics?.map((topic) => (
                  <motion.button
                    key={topic.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      const newId = topic.id === selectedTopic ? null : topic.id;
                      setSelectedTopic(newId);
                      setSelectedEmotion(null);
                      if (newId) scrollToVerses();
                    }}
                    className={cn(
                      'p-4 rounded-2xl border-2 transition-all text-center',
                      selectedTopic === topic.id
                        ? 'border-primary bg-primary/5 shadow-md'
                        : 'border-border hover:border-primary/50 bg-card'
                    )}
                    data-testid={`topic-${topic.id}`}
                  >
                    <span className="text-3xl mb-2 block">{topic.icon}</span>
                    <span className="font-semibold text-foreground">{topic.name}</span>
                  </motion.button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="free" className="mt-4">
            <Card className="p-4 mb-4">
              <div className="flex items-center gap-2 mb-3 text-sm text-amber-600 dark:text-amber-400">
                <Sparkles className="w-4 h-4" />
                <span>اكتب ما في قلبك، وكلمة الله تُعزّيك وتُرشدك 🕊️</span>
              </div>
              <Textarea
                placeholder="اكتب ما تشعر به بحرية... (مثال: أشعر بالإرهاق من العمل ولا أجد وقتًا لعائلتي)"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                className="min-h-[100px] resize-none mb-3"
                data-testid="input-free-text"
              />
              <Button 
                className="w-full" 
                onClick={handleAiQuery}
                disabled={aiQueryMutation.isPending}
                data-testid="button-analyze"
              >
                <Sparkles className="w-4 h-4 ml-2" />
                {aiQueryMutation.isPending ? 'جاري التحليل...' : 'تحليل المشاعر وعرض الآيات'}
              </Button>
              {user?.isPremium && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  متبقي {user.aiUsageRemaining} طلب هذا الشهر
                </p>
              )}
              {!user?.isPremium && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  قم بالترقية للنسخة المدفوعة لاستخدام التحليل الذكي
                </p>
              )}
            </Card>

            {aiQueryMutation.data?.response && (
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h3 className="font-display text-lg font-bold">النتيجة</h3>
                </div>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <p className="whitespace-pre-wrap font-display text-xl md:text-2xl text-foreground leading-loose">
                    {aiQueryMutation.data.response}
                  </p>
                </div>
                {aiQueryMutation.data.modelUsed && (
                  <p className="text-xs text-muted-foreground mt-4">
                    النموذج المستخدم: {aiQueryMutation.data.modelUsed === 'local' ? 'قواعد محلية' : aiQueryMutation.data.modelUsed === 'free' ? 'نموذج مجاني' : 'نموذج متقدم'}
                  </p>
                )}
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <div ref={versesRef} />

        <AnimatePresence mode="wait">
          {(selectedEmotion || selectedTopic) && (
            <motion.div
              key={`${selectedEmotion}-${selectedTopic}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedEmotion(null);
                    setSelectedTopic(null);
                  }}
                  data-testid="button-back"
                >
                  <ChevronLeft className="w-4 h-4 ml-1" />
                  رجوع
                </Button>
                <h2 className="font-display text-lg font-bold text-foreground">
                  آيات عن {selectedEmotionData?.name || selectedTopicData?.name} {selectedEmotionData?.icon || selectedTopicData?.icon}
                </h2>
              </div>

              {versesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : verses.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">لا توجد آيات متاحة حاليًا</p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {verses.map((verse, index) => (
                    <motion.div
                      key={verse.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className="p-6 hover:shadow-lg transition-shadow" data-testid={`verse-card-${index}`}>
                        <blockquote className="relative mb-4">
                          <p className="font-display text-xl md:text-2xl leading-loose text-foreground" data-testid={`verse-text-${index}`}>
                            {verse.text}
                          </p>
                        </blockquote>
                        <p className="text-sm font-medium text-primary" data-testid={`verse-reference-${index}`}>
                          {verse.bookName} {verse.chapter + 1}:{verse.verse}
                        </p>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
