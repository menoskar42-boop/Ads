import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { feedbackStore, PatientFeedback } from '@/stores/feedbackStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Star, Heart, CheckCircle2, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';

const FEEDBACK_TAGS = [
  { en: 'Friendly staff',    ar: 'كادر لطيف' },
  { en: 'Short wait time',   ar: 'انتظار قصير' },
  { en: 'Clean facility',    ar: 'نظافة ممتازة' },
  { en: 'Skilled doctor',    ar: 'طبيب متميز' },
  { en: 'Clear explanation', ar: 'شرح واضح' },
  { en: 'Easy booking',      ar: 'حجز سهل' },
];

const FeedbackForm: React.FC = () => {
  const { clinicId = '', patientId = '' } = useParams();
  const { isAr } = useLanguage();
  const navigate = useNavigate();

  const [stars, setStars] = useState(0);
  const [hoverStar, setHoverStar] = useState(0);
  const [comment, setComment] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleSubmit = async () => {
    if (stars === 0) {
      toast.error(isAr ? 'يرجى اختيار تقييم' : 'Please select a rating');
      return;
    }
    setSubmitting(true);
    const feedback: PatientFeedback = {
      id: `fb-${Date.now()}`,
      clinicId,
      patientId,
      stars,
      comment: comment.trim() || undefined,
      tags: selectedTags,
      wouldRecommend: wouldRecommend ?? undefined,
      submittedAt: new Date().toISOString(),
    };
    feedbackStore.add(feedback);
    await new Promise(r => setTimeout(r, 600));
    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12 space-y-4">
            <div className="h-16 w-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-green-700">{isAr ? 'شكراً لك!' : 'Thank You!'}</h2>
            <p className="text-muted-foreground text-sm">
              {isAr ? 'تم إرسال تقييمك بنجاح. رأيك يساعدنا على تحسين خدمتنا.' : 'Your feedback has been submitted. Your opinion helps us improve our service.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayStar = hoverStar || stars;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="h-14 w-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Stethoscope className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-lg">{isAr ? 'قيّم تجربتك' : 'Rate Your Experience'}</CardTitle>
          <p className="text-sm text-muted-foreground">{isAr ? 'رأيك يهمنا ويساعدنا على التطوير' : 'Your feedback helps us improve'}</p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Stars */}
          <div className="space-y-2 text-center">
            <p className="text-sm font-medium">{isAr ? 'كيف كانت تجربتك؟' : 'How was your experience?'}</p>
            <div className="flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onMouseEnter={() => setHoverStar(n)}
                  onMouseLeave={() => setHoverStar(0)}
                  onClick={() => setStars(n)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${n <= displayStar ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                  />
                </button>
              ))}
            </div>
            {stars > 0 && (
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? ['', 'سيئ', 'مقبول', 'جيد', 'جيد جداً', 'ممتاز'][stars]
                  : ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][stars]}
              </p>
            )}
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <p className="text-sm font-medium">{isAr ? 'ما الذي أعجبك؟' : 'What did you like?'}</p>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_TAGS.map(tag => {
                const label = isAr ? tag.ar : tag.en;
                const selected = selectedTags.includes(tag.en);
                return (
                  <Badge
                    key={tag.en}
                    variant={selected ? 'default' : 'outline'}
                    className="cursor-pointer select-none"
                    onClick={() => toggleTag(tag.en)}
                  >
                    {label}
                  </Badge>
                );
              })}
            </div>
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <p className="text-sm font-medium">{isAr ? 'تعليق إضافي (اختياري)' : 'Additional comment (optional)'}</p>
            <Textarea
              rows={3}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={isAr ? 'اكتب تعليقك هنا...' : 'Write your comment here...'}
              className="resize-none text-sm"
              dir={isAr ? 'rtl' : 'ltr'}
            />
          </div>

          {/* Would recommend */}
          <div className="space-y-2">
            <p className="text-sm font-medium">{isAr ? 'هل توصي بنا لأصدقائك؟' : 'Would you recommend us?'}</p>
            <div className="flex gap-3">
              <Button
                size="sm"
                variant={wouldRecommend === true ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setWouldRecommend(true)}
              >
                {isAr ? 'نعم بالتأكيد' : 'Yes, definitely'}
              </Button>
              <Button
                size="sm"
                variant={wouldRecommend === false ? 'destructive' : 'outline'}
                className="flex-1"
                onClick={() => setWouldRecommend(false)}
              >
                {isAr ? 'لا أعتقد' : 'Not really'}
              </Button>
            </div>
          </div>

          <Button className="w-full gap-2" onClick={handleSubmit} disabled={submitting || stars === 0}>
            {submitting
              ? (isAr ? 'جارٍ الإرسال...' : 'Submitting...')
              : <><Heart className="h-4 w-4" />{isAr ? 'إرسال التقييم' : 'Submit Feedback'}</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default FeedbackForm;
