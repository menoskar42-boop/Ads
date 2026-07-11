import { useState, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getToken } from '@/utils/authToken';
import { AuthUser } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Loader2, CheckCircle2, AlertCircle, Sparkles, Mic, Square } from 'lucide-react';
import { toast } from 'sonner';

// ── Example commands the doctor can click to auto-fill ────────────
const EXAMPLES = [
  'أضف مريض اسمه محمد علي رقمه 01012345678',
  'أضف فاطمة للطابور',
  'احجز موعد لأحمد الغد الساعة 10:00',
];

interface ActionResult {
  success: boolean;
  message: string;
}

interface AICommandBarProps {
  user: AuthUser;
}

const AICommandBar: React.FC<AICommandBarProps> = ({ user }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // ── Voice capture (Web Speech API) ──────────────────────────────
  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceError(isAr ? 'المتصفح لا يدعم التعرف على الصوت.' : 'Voice not supported in this browser.');
      return;
    }
    setVoiceError('');
    setResult(null);

    const rec = new SR();
    rec.lang = 'ar-EG';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    rec.onstart = () => setListening(true);
    rec.onend   = () => setListening(false);

    rec.onresult = (e: any) => {
      const transcript: string = e.results[0]?.[0]?.transcript || '';
      if (transcript) {
        setCommand(transcript);
        setResult(null);
        // Short delay so user sees the transcript, then auto-submit
        setTimeout(() => handleSubmit(transcript), 400);
      }
    };

    rec.onerror = (e: any) => {
      setListening(false);
      const msgs: Record<string, string> = {
        'no-speech':   isAr ? 'لم أسمع شيئاً، حاول مرة أخرى.' : 'No speech detected, try again.',
        'not-allowed': isAr ? 'يرجى السماح بالوصول للميكروفون.' : 'Microphone access denied.',
      };
      setVoiceError(msgs[e.error] || (isAr ? 'لم أتمكن من فهم الصوت، حاول مرة أخرى.' : 'Could not understand, try again.'));
    };

    rec.start();
  };

  // ── Text submit (accepts optional override for voice path) ────────
  const handleSubmit = async (textOverride?: string) => {
    const text = (textOverride ?? command).trim();
    if (!text || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const token = getToken();
      const res = await fetch('/api/ai-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          command: text,
          doctorId: user.id,
          doctorName: user.nameAr || user.name,
        }),
      });

      const data = await res.json();
      setResult({ success: data.success, message: data.message });

      if (data.success) {
        toast.success(data.message);
        setCommand('');
        // Notify stores to refresh data
        window.dispatchEvent(new CustomEvent('cf_data_refresh', { detail: { action: data.action } }));
      }
    } catch {
      setResult({ success: false, message: isAr ? 'تعذّر الاتصال بالخادم.' : 'Connection error.' });
    } finally {
      setLoading(false);
    }
  };

  const fillExample = (ex: string) => {
    setCommand(ex);
    setResult(null);
    inputRef.current?.focus();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3" data-testid="card-ai-command-bar">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          {isAr ? 'أوامر ذكية' : 'AI Commands'}
        </span>
        <span className="text-xs text-muted-foreground">
          {isAr ? '— اكتب ما تريد فعله' : '— type what you want to do'}
        </span>
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        {/* Mic button */}
        <Button
          type="button"
          variant={listening ? 'destructive' : 'outline'}
          size="sm"
          className={`shrink-0 px-2.5 ${listening ? 'animate-pulse' : ''}`}
          onClick={listening ? stopListening : startListening}
          disabled={loading}
          title={isAr ? (listening ? 'إيقاف الاستماع' : 'تحدث الآن') : (listening ? 'Stop' : 'Speak')}
          data-testid="button-ai-voice"
        >
          {listening
            ? <Square className="h-3.5 w-3.5" />
            : <Mic   className="h-3.5 w-3.5" />
          }
        </Button>

        <Input
          ref={inputRef}
          value={command}
          onChange={e => { setCommand(e.target.value); setResult(null); setVoiceError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder={
            listening
              ? (isAr ? '🎙️ أنا أسمعك...' : '🎙️ Listening…')
              : (isAr ? 'اكتب أو تحدث: أضف مريض اسمه أحمد رقمه 01012345678' : 'Type or speak a command…')
          }
          className="flex-1 text-sm"
          dir="rtl"
          disabled={loading || listening}
          data-testid="input-ai-command"
        />

        <Button
          onClick={() => handleSubmit()}
          disabled={!command.trim() || loading || listening}
          size="sm"
          className="gap-1.5 shrink-0"
          data-testid="button-ai-command-send"
        >
          {loading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Send className="h-3.5 w-3.5" />
          }
          {isAr ? 'تنفيذ' : 'Run'}
        </Button>
      </div>

      {/* Voice error */}
      {voiceError && (
        <p className="text-xs text-destructive flex items-center gap-1" data-testid="text-voice-error">
          <Mic className="h-3 w-3" />
          {voiceError}
        </p>
      )}

      {/* Example chips */}
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map(ex => (
          <button
            key={ex}
            onClick={() => fillExample(ex)}
            className="text-xs px-2 py-0.5 rounded-full border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            data-testid={`chip-example-${ex.slice(0, 10)}`}
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Result */}
      {result && (
        <div
          className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${
            result.success
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
              : 'bg-destructive/10 text-destructive'
          }`}
          data-testid="text-ai-command-result"
        >
          {result.success
            ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          }
          <span dir="rtl">{result.message}</span>
        </div>
      )}
    </div>
  );
};

export default AICommandBar;
