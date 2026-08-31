import { storage } from './storage';
import type { User, AiEmotionVerse, AiEmotionExample } from '@shared/schema';
import { checkPremiumStatus, checkAiUsageLimit } from './auth';
import { normalizeArabicText } from './utils/arabic-normalize';
import { semanticPreAnalysis, getCandidateQueries, extractKeywordsFallback } from './utils/semantic-preanalysis';

interface AiResponse {
  success: boolean;
  response?: string;
  error?: string;
  modelUsed?: 'semantic' | 'local';
  detectedEmotion?: string;
  remainingRequests?: number;
  emotionNotFound?: boolean;
}

function formatVerseResponse(emotionVerse: AiEmotionVerse, detectedEmotion: string): string {
  return `أفهم أنك تشعر بـ "${detectedEmotion}". إليك آية من الكتاب المقدس لتعزيتك:

"${emotionVerse.verseText}" (${emotionVerse.verseReference})

ليباركك الرب ويحفظك. 🙏`;
}

// Bible Path Style Response Templates
// Each template includes: empathy paragraph + verse placeholder + practical advice
// Total word count: 120-200 Arabic words
const EMPATHY_TEMPLATES: Record<string, string> = {
  'حزن': 'أشعر بحزنك، وأعلم أن الأوقات الصعبة قد تكون مؤلمة. في مثل هذه اللحظات، يمكننا أن نستمد القوة من الكتاب المقدس.',
  'قلق': 'أفهم قلقك، فالشعور بعدم اليقين يمكن أن يكون صعباً. لكن كلمة الله تذكرنا بأنه معنا دائماً.',
  'خوف': 'أعلم أن الخوف شعور ثقيل يمكن أن يسيطر علينا. لكن الكتاب المقدس يقدم لنا كلمات تعزية وتشجيع.',
  'وحدة': 'أفهم شعورك بالوحدة، وهو أمر يمر به كثيرون. لكن تذكر أن الله لا يتركنا وحدنا أبداً.',
  'إحباط': 'أشعر بإحباطك، وأفهم مشاعر الظلم التي قد تمر بها. لكن الكتاب يذكرنا بالرجاء وبعدل الله.',
  'تعب': 'أشعر بتعبك، سواء كان جسدياً أو نفسياً. الكتاب المقدس يقدم لنا وعداً بالراحة.',
  'رجاء': 'أفهم بحثك عن الأمل والرجاء. الكتاب المقدس مليء بوعود الله لنا.',
  'سلام': 'أفهم حاجتك للسلام الداخلي. الكتاب المقدس يقدم لنا سلاماً يفوق كل عقل.',
  'فرح': 'أفهم رغبتك في الفرح. الكتاب المقدس يدعونا للفرح في الرب دائماً.',
  'احتياج': 'أفهم شعورك بالاحتياج. الكتاب المقدس يذكرنا بأن الله يسد كل احتياجاتنا.',
  'غضب': 'أفهم غضبك، فهو شعور إنساني طبيعي. لكن الكتاب المقدس يعلمنا كيف نتعامل معه بحكمة.',
  'ذنب': 'أفهم شعورك بالذنب. لكن تذكر أن الله يغفر ويقبلنا بمحبته اللامتناهية.',
  'خجل': 'أفهم شعورك بالخجل. لكن تذكر أن الله يحبك كما أنت ولا يرفضك.',
  'ندم': 'أفهم ندمك على الماضي. لكن الله يعطينا فرصاً جديدة وبدايات جديدة كل يوم.',
  'غيرة': 'أفهم مشاعر الغيرة التي تمر بها. الكتاب المقدس يذكرنا بأن لكل واحد منا دعوة فريدة.',
  'يأس': 'أفهم شعورك باليأس، وهو شعور صعب. لكن الله هو إله الرجاء ولا يتركنا.',
  'ضغط نفسي': 'أفهم الضغط النفسي الذي تشعر به. الله يدعونا لنلقي همومنا عليه.',
  'حيرة': 'أفهم حيرتك وصعوبة اتخاذ القرار. الله يعدنا بالحكمة والإرشاد.',
  'شكر': 'جميل أن ترى النعم في حياتك. الشكر يفتح قلوبنا لبركات أكثر.',
  'إيمان': 'إيمانك ثمين. الله يقوي إيماننا ويثبتنا عندما نطلب منه.',
  'default': 'أفهم مشاعرك العميقة. في مثل هذه الأوقات، يمكننا أن نجد العزاء في كلمة الله.'
};

const PRACTICAL_ADVICE_TEMPLATES: Record<string, string> = {
  'حزن': 'أنصحك بالصلاة والتأمل في كلمة الله، وطلب الراحة والإرشاد منه. وإذا كنت تشعر بأنك بحاجة إلى دعم إضافي، فقد يكون من المفيد التحدث مع قائد روحي أو شخص تثق به.',
  'قلق': 'حاول أن تأخذ وقتاً للصلاة الهادئة، وتسليم همومك لله. تذكر أن القلق لا يضيف شيئاً ليومك، بل ثق في رعاية الله لك.',
  'خوف': 'تذكر أن الصلاة والتأمل في وعود الله يمكن أن يمنحاك السلام. حاول أن تتذكر مرات سابقة كان الله فيها معك.',
  'وحدة': 'أشجعك على التواصل مع مجتمع المؤمنين حولك. الصلاة والانتماء لمجموعة مؤمنين يمكن أن يساعدا في التغلب على الشعور بالوحدة.',
  'إحباط': 'حاول أن تسلم أمرك لله الذي يعرف كل شيء. الصلاة والثقة في عدل الله يمكن أن تمنحك السلام الداخلي. تذكر أن الله لديه خطة لحياتك.',
  'تعب': 'خذ وقتاً للراحة والصلاة. تذكر أن الله يدعونا لنأتي إليه عندما نكون متعبين ومثقلين.',
  'رجاء': 'استمر في التمسك بوعود الله. الصلاة والتأمل في كلمته تعطينا قوة للاستمرار.',
  'سلام': 'خذ وقتاً للصلاة الهادئة والتأمل. السلام الحقيقي يأتي من علاقتنا مع الله.',
  'فرح': 'استمر في الفرح بالرب. الصلاة والتسبيح يرفعان روحنا ويقربانا من الله.',
  'احتياج': 'اطلب من الله أن يسد احتياجاتك. هو يعرف ما تحتاجه قبل أن تسأله.',
  'غضب': 'خذ لحظة للتنفس العميق والصلاة. سلم غضبك لله وثق أنه يرى كل شيء. تذكر أن الغفران يحررك.',
  'ذنب': 'اعترف بخطئك لله وثق في مغفرته. هو أمين وعادل ليغفر لك. لا تدع الماضي يثقل عليك.',
  'خجل': 'تذكر أن قيمتك ليست في نظرة الناس بل في نظرة الله لك. أنت محبوب ومقبول كما أنت.',
  'ندم': 'اترك الماضي وتطلع للمستقبل. الله يجدد كل شيء ويعطيك بداية جديدة كل يوم.',
  'غيرة': 'ركز على النعم في حياتك وما أعطاك الله. لكل واحد دعوته الفريدة. الرضا بما عندك يجلب السلام.',
  'يأس': 'لا تفقد الأمل. الله قريب منك حتى في أحلك اللحظات. صلِّ واطلب معونته فهو لا يخذل من يثق به.',
  'ضغط نفسي': 'ألقِ همومك على الله. رتب أولوياتك وخذ الأمور خطوة خطوة. الله يعطيك القوة اللازمة.',
  'حيرة': 'صلِّ واطلب الحكمة من الله. تحدث مع شخص حكيم تثق به. الله يرشد خطواتك.',
  'شكر': 'استمر في الشكر دائماً. الامتنان يغير نظرتنا للحياة ويقربنا من الله.',
  'إيمان': 'غذِّ إيمانك بقراءة الكتاب والصلاة. الله أمين ويكافئ الذين يطلبونه.',
  'default': 'أنصحك بالصلاة والتأمل في كلمة الله يومياً. تذكر أن الله قريب منك ويسمع صلاتك. إذا احتجت للمزيد من الدعم، لا تتردد في التحدث مع قائد روحي.'
};

function formatBiblePathResponse(
  coreEmotion: string,
  subEmotion: string,
  verseText: string,
  verseReference: string
): string {
  const empathy = EMPATHY_TEMPLATES[coreEmotion] || EMPATHY_TEMPLATES['default'];
  const advice = PRACTICAL_ADVICE_TEMPLATES[coreEmotion] || PRACTICAL_ADVICE_TEMPLATES['default'];
  
  return `${empathy}

يقول الكتاب في ${verseReference}: "${verseText}"

${advice}`;
}

function buildSemanticPrompt(
  query: string, 
  examples: AiEmotionExample[], 
  availableEmotions: string[]
): string {
  const examplesText = examples.map(e => 
    `- العبارة: "${e.userPhrase}" → الشعور: "${e.primaryEmotion}"`
  ).join('\n');
  
  const emotionsList = availableEmotions.join('، ');
  
  return `أنت محلل مشاعر متخصص. مهمتك فهم المعنى الدلالي لكلام المستخدم (وليس المطابقة الحرفية) وتحديد الشعور الأساسي.

## أمثلة مرجعية (للفهم الدلالي، وليست للبحث الحرفي):
${examplesText}

## المشاعر المتاحة (اختر واحداً فقط من هذه القائمة):
${emotionsList}

## قواعد مهمة:
1. افهم المعنى والسياق العاطفي، لا تبحث عن تطابق حرفي
2. مثال: "الوقت بيجري ومش لاحق أصلي" = نفس معنى "لا أجد وقتًا للصلاة" = "ضغط نفسي"
3. اختر الشعور الأقرب من القائمة المتاحة فقط
4. لا تخترع مشاعر جديدة خارج القائمة

## كلام المستخدم:
"${query}"

أجب بصيغة JSON فقط:
{"emotion": "اسم الشعور من القائمة", "confidence": 0.8, "reasoning": "شرح قصير"}`;
}

async function classifyEmotionWithOpenAI(
  query: string,
  apiKey: string,
  examples: AiEmotionExample[],
  availableEmotions: string[]
): Promise<{ emotion: string; confidence: number } | null> {
  try {
    const prompt = buildSemanticPrompt(query, examples, availableEmotions);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error('[AI] OpenAI API error:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    
    console.log('[AI] GPT response:', content);
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const detectedEmotion = parsed.emotion;
        const confidence = parsed.confidence || 0.5;
        
        if (availableEmotions.includes(detectedEmotion)) {
          console.log(`[AI] Detected emotion: ${detectedEmotion} (confidence: ${confidence})`);
          return { emotion: detectedEmotion, confidence };
        } else {
          console.log(`[AI] Emotion "${detectedEmotion}" not in available list, finding closest match`);
          const closest = availableEmotions.find(e => 
            detectedEmotion.includes(e) || e.includes(detectedEmotion)
          );
          if (closest) {
            return { emotion: closest, confidence: confidence * 0.8 };
          }
        }
      }
    } catch (parseError) {
      console.log('[AI] Could not parse response JSON');
    }
    
    return null;
  } catch (error) {
    console.error('[AI] Classification error:', error);
    return null;
  }
}

// LAYER 5: Groq Free Tier - Language Understanding Only (LAST RESORT)
// - Maximum 3 calls per user per day
// - One-shot generation only, no retries
// - For understanding only, NOT for generating content
// - Verses are selected from existing database only
// - If Groq fails or quota exceeded, returns null silently

const GROQ_DAILY_LIMIT = 3;

// In-memory daily usage tracker (resets on server restart, which is acceptable for free tier)
const groqDailyUsage: Map<string, { count: number; date: string }> = new Map();

function checkGroqDailyLimit(userId: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  const usage = groqDailyUsage.get(userId);
  
  if (!usage || usage.date !== today) {
    groqDailyUsage.set(userId, { count: 0, date: today });
    return true;
  }
  
  return usage.count < GROQ_DAILY_LIMIT;
}

function incrementGroqUsage(userId: string): void {
  const today = new Date().toISOString().split('T')[0];
  const usage = groqDailyUsage.get(userId);
  
  if (!usage || usage.date !== today) {
    groqDailyUsage.set(userId, { count: 1, date: today });
  } else {
    usage.count++;
  }
}

function getGroqRemainingCalls(userId: string): number {
  const today = new Date().toISOString().split('T')[0];
  const usage = groqDailyUsage.get(userId);
  
  if (!usage || usage.date !== today) {
    return GROQ_DAILY_LIMIT;
  }
  
  return Math.max(0, GROQ_DAILY_LIMIT - usage.count);
}

async function classifyEmotionWithGroq(
  query: string,
  availableEmotions: string[],
  userId: string
): Promise<{ emotion: string; confidence: number; quotaExceeded?: boolean } | null> {
  // Check API key exists
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    console.log('[AI-Groq] No GROQ_API_KEY configured, skipping Groq layer');
    return null;
  }
  
  // Check daily limit
  if (!checkGroqDailyLimit(userId)) {
    console.log(`[AI-Groq] Daily limit exceeded for user ${userId}`);
    return { emotion: '', confidence: 0, quotaExceeded: true };
  }
  
  try {
    const emotionsList = availableEmotions.join('، ');
    
    // Improved prompt for emotion classification - focusing on the speaker's feeling
    const prompt = `أنت محلل مشاعر. حلل ما يشعر به الشخص الذي يقول الجملة التالية.

الجملة: "${query}"

المشاعر المتاحة: ${emotionsList}

ملاحظات مهمة:
- ركز على ما يشعر به المتحدث (وليس الآخرين في الجملة)
- إذا كان الشخص يعاني من ظلم أو إهانة أو قهر، الشعور هو "إحباط"
- إذا كان الشخص يعاني من ضغوط أو توتر، الشعور هو "تعب"
- إذا كان الشخص يشعر بالحزن أو الكآبة، الشعور هو "حزن"
- إذا كان الشخص خائف أو قلق، الشعور هو "خوف" أو "قلق"
- إذا كان الشخص يشعر بالعزلة أو الانفراد، الشعور هو "وحدة"

أجب بكلمة واحدة فقط من القائمة (${emotionsList}):`;

    // Use Groq Free Tier API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 20,
        temperature: 0.1,
      }),
    });

    // Increment usage AFTER successful API call attempt
    incrementGroqUsage(userId);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[AI-Groq] API error ${response.status}: ${errorText}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    
    console.log('[AI-Groq] Response:', content);
    
    // Clean and match the response
    const cleanedResponse = content.replace(/[^\u0600-\u06FF\s]/g, '').trim();
    
    // Check if response matches any available emotion
    for (const emotion of availableEmotions) {
      if (cleanedResponse.includes(emotion) || emotion.includes(cleanedResponse)) {
        console.log(`[AI-Groq] Matched emotion: ${emotion}`);
        return { emotion, confidence: 0.7 };
      }
    }
    
    // Try fuzzy matching
    const normalizedResponse = normalizeArabicText(cleanedResponse);
    for (const emotion of availableEmotions) {
      const normalizedEmotion = normalizeArabicText(emotion);
      if (normalizedResponse.includes(normalizedEmotion) || normalizedEmotion.includes(normalizedResponse)) {
        console.log(`[AI-Groq] Fuzzy matched emotion: ${emotion}`);
        return { emotion, confidence: 0.6 };
      }
    }
    
    return null;
  } catch (error) {
    console.error('[AI-Groq] Classification error:', error);
    return null;
  }
}

// SEMANTIC_EMOTION_MAP: Maps user expressions to emotions that EXIST in ai_emotion_verses
// This provides semantic normalization - user input does NOT need to match emotion names verbatim
// Format: { "user_expression": "emotion_in_database" }
// 
// AVAILABLE POSITIVE EMOTIONS IN DATABASE: أمان، إيمان، اتكال، تعزية، ثقة، رجاء، سلام، صبر، طمأنينة
// AVAILABLE NEGATIVE EMOTIONS: See full list (103 emotions) in ai_emotion_verses table
const EMOTION_ALIAS_MAP: Record<string, string> = {
  // =====================================================
  // POSITIVE EMOTIONS - Map common expressions to DB emotions
  // =====================================================
  
  // فرح/سعادة/بهجة → فرح (NOW "فرح" exists in ai_emotions!)
  'فرح': 'فرح',
  'فرحان': 'فرح',
  'فرحانة': 'فرح',
  'سعادة': 'فرح',
  'سعيد': 'فرح',
  'سعيدة': 'فرح',
  'بهجة': 'فرح',
  'مبهج': 'فرح',
  'بشوشة': 'فرح',
  
  // مبسوط → فرح (happy/content goes to joy)
  'مبسوط': 'فرح',
  'مبسوطة': 'فرح',
  
  // مرتاح → سلام (peaceful/relaxed stays as peace)
  'مرتاح': 'سلام',
  'مرتاحة': 'سلام',
  'راحة': 'سلام',
  'راحة نفسية': 'سلام',
  'مرتاح نفسياً': 'سلام',
  'مرتاح نفسيا': 'سلام',
  'ارتياح': 'سلام',
  'مستريح': 'سلام',
  
  // هدوء/سكينة → طمأنينة
  'هدوء': 'طمأنينة',
  'هادي': 'طمأنينة',
  'هادئ': 'طمأنينة',
  'هادئة': 'طمأنينة',
  'سكينة': 'طمأنينة',
  'ساكن': 'طمأنينة',
  'مطمئن': 'طمأنينة',
  'مطمئنة': 'طمأنينة',
  'اطمئنان': 'طمأنينة',
  
  // أمل/تفاؤل → رجاء
  'أمل': 'رجاء',
  'امل': 'رجاء',
  'متفائل': 'رجاء',
  'متفائلة': 'رجاء',
  'تفاؤل': 'رجاء',
  'فيه أمل': 'رجاء',
  'بتفاءل': 'رجاء',
  'متأمل': 'رجاء',
  
  // حماس/نشاط → رجاء (closest positive emotion)
  'متحمس': 'رجاء',
  'متحمسة': 'رجاء',
  'حماس': 'رجاء',
  'نشيط': 'رجاء',
  'نشيطة': 'رجاء',
  'نشاط': 'رجاء',
  'منطلق': 'رجاء',
  
  // ثقة variants
  'واثق': 'ثقة',
  'واثقة': 'ثقة',
  'واثق من نفسي': 'ثقة',
  'متأكد': 'ثقة',
  
  // إيمان variants
  'مؤمن': 'إيمان',
  'مؤمنة': 'إيمان',
  'إيماني قوي': 'إيمان',
  'قريب من ربنا': 'إيمان',
  'حاسس بربنا': 'إيمان',
  
  // اتكال variants
  'متكل على ربنا': 'اتكال',
  'متوكل': 'اتكال',
  'سلمت أمري لله': 'اتكال',
  
  // صبر variants
  'صابر': 'صبر',
  'صابرة': 'صبر',
  'بصبر': 'صبر',
  'متحمل': 'صبر',
  
  // أمان variants
  'آمن': 'أمان',
  'آمنة': 'أمان',
  'في أمان': 'أمان',
  'محمي': 'أمان',
  
  // تعزية variants
  'محتاج تعزية': 'تعزية',
  'عايز تعزية': 'تعزية',
  'بدي تعزية': 'تعزية',
  
  // =====================================================
  // NEGATIVE EMOTIONS - Semantic mappings
  // =====================================================
  
  // ظلم/قهر related - mapped to "إحباط" (closest available emotion)
  'ظلم': 'إحباط',
  'مظلوم': 'إحباط',
  'مظلومة': 'إحباط',
  'ظالم': 'إحباط',
  'اتظلمت': 'إحباط',
  'بيظلموني': 'إحباط',
  'مقهور': 'إحباط',
  'مقهورة': 'إحباط',
  'قهر': 'إحباط',
  
  // حزن variants
  'حزين': 'حزن',
  'حزينة': 'حزن',
  'حزنان': 'حزن',
  'حزنانة': 'حزن',
  'زعلان': 'حزن',
  'زعلانة': 'حزن',
  'مكتئب': 'اكتئاب',
  'مكتئبة': 'اكتئاب',
  'كئيب': 'كآبة',
  'كئيبة': 'كآبة',
  
  // قلق variants
  'قلقان': 'قلق',
  'قلقانة': 'قلق',
  'متوتر': 'توتر',
  'متوترة': 'توتر',
  'مضطرب': 'اضطراب',
  'مضطربة': 'اضطراب',
  
  // خوف variants
  'خايف': 'خوف',
  'خايفة': 'خوف',
  'مرعوب': 'فزع',
  'مرعوبة': 'فزع',
  'رعب': 'فزع',
  
  // وحدة variants
  'وحيد': 'وحدة',
  'وحيدة': 'وحدة',
  'لوحدي': 'وحدة',
  'منعزل': 'وحدة',
  'منعزلة': 'وحدة',
  
  // إحباط variants
  'محبط': 'إحباط',
  'محبطة': 'إحباط',
  'يأس': 'يأس',
  'ميؤوس': 'يأس',
  
  // تعب variants - now "تعب" exists as standalone emotion
  'تعب': 'تعب',
  'تعبان': 'تعب',
  'تعبانة': 'تعب',
  'مرهق': 'إرهاق',
  'مرهقة': 'إرهاق',
  'منهك': 'إنهاك',
  'منهكة': 'إنهاك',
  
  // ألم variants - new emotion added
  'ألم': 'ألم',
  'موجوع': 'ألم',
  'موجوعة': 'ألم',
  'بتوجعني': 'ألم',
  'وجع': 'ألم',
  
  // ضغط variants
  'مضغوط': 'ضغط نفسي',
  'مضغوطة': 'ضغط نفسي',
  'ضاغط': 'ضغط نفسي',
  
  // خذلان variants
  'مخذول': 'خذلان',
  'مخذولة': 'خذلان',
  'خذلوني': 'خذلان',
  
  // ندم variants
  'نادم': 'ندم',
  'نادمة': 'ندم',
  'أسف': 'ندم',
  
  // غضب - now a core emotion
  'غضب': 'غضب',
  'غضبان': 'غضب',
  'غضبانة': 'غضب',
  'زعلان من': 'غضب',
  'متنرفز': 'توتر',
  'متنرفزة': 'توتر',
  'عصبي': 'توتر',
  'عصبية': 'توتر',
  
  // ضعف variants
  'ضعيف': 'ضعف',
  'ضعيفة': 'ضعف',
  'عاجز': 'عجز',
  'عاجزة': 'عجز',
  
  // ذنب variants
  'مذنب': 'ذنب',
  'مذنبة': 'ذنب',
  'ذنوب': 'ذنب',
  
  // روحي variants
  'فتور': 'فتور روحي',
  'جفاف': 'جفاف روحي',
  'بعيد عن ربنا': 'جفاف روحي',
  'بعيدة عن ربنا': 'جفاف روحي',
  
  // Other common mappings
  'ملل': 'ملل',
  'زهق': 'ملل',
  'زهقان': 'ملل',
  'زهقانة': 'ملل',
  'خجل': 'خجل',
  'خجلان': 'خجل',
  'خجلانة': 'خجل',
  'كسوف': 'خجل',
  'عار': 'خجل',
  
  'حيران': 'حيرة',
  'حيرانة': 'حيرة',
  'محتار': 'حيرة',
  'محتارة': 'حيرة',
  'مش عارف': 'حيرة',
  'مش عارفة': 'حيرة',
  
  'تايه': 'تيه',
  'تايهة': 'تيه',
  'ضايع': 'ضياع',
  'ضايعة': 'ضياع',
  
  // غيرة/حسد - now a core emotion
  'غيرة': 'غيرة',
  'حسد': 'غيرة',
  'حاسد': 'غيرة',
  'حاسدة': 'غيرة',
  'بحسد': 'غيرة',
  'غيران': 'غيرة',
  'غيرانة': 'غيرة',
  
  // شكر/امتنان - now a core emotion
  'شكر': 'شكر',
  'امتنان': 'شكر',
  'شاكر': 'شكر',
  'شاكرة': 'شكر',
  'ممتن': 'شكر',
  'ممتنة': 'شكر',
  'حامد': 'شكر',
  
  // إيمان - now a core emotion
  'إيمان': 'إيمان',
  'واثق بربنا': 'إيمان',
  'واثقة بربنا': 'إيمان',
};

// EMOTION_KEYWORDS: Maps emotions to their keywords for matching
// ONLY includes emotions that EXIST in ai_emotion_verses (103 emotions)
const EMOTION_KEYWORDS: Record<string, string[]> = {
  'حزن': ['حزين', 'حزن', 'حزنان'],
  'حزن عميق': ['حزن شديد', 'كسر قلبي'],
  'قلق': ['قلق', 'قلقان'],
  'قلق مستمر': ['قلق دائم', 'قلق طول الوقت'],
  'خوف': ['خوف', 'خايف'],
  'خوف المستقبل': ['خايف من بكرة', 'قلقان على المستقبل'],
  'وحدة': ['وحيد', 'وحدة', 'لوحدي'],
  'إحباط': ['محبط', 'إحباط'],
  'تعب نفسي': ['تعبان نفسياً', 'تعب نفسي'],
  'ضغط نفسي': ['ضغط', 'مضغوط'],
  'خذلان': ['مخذول', 'خذلان', 'خذلوني'],
  'ندم': ['ندم', 'نادم'],
  'قهر': ['قهر', 'مقهور', 'ظلم', 'مظلوم'],
  'توتر': ['توتر', 'متوتر', 'عصبي'],
  'إرهاق': ['مرهق', 'إرهاق'],
  'حيرة': ['حيران', 'محتار'],
  'ضعف': ['ضعيف', 'ضعف'],
  'ذنب': ['ذنب', 'مذنب'],
  'يأس': ['يأس', 'ميؤوس'],
  'اكتئاب': ['مكتئب', 'اكتئاب'],
  'فتور روحي': ['فتور', 'روحانيتي ضعفت'],
  'جفاف روحي': ['جفاف روحي', 'بعيد عن ربنا'],
};

const SITUATION_NORMALIZATION_RULES: Array<{
  patterns: string[];
  mappedEmotion: string;
  description: string;
}> = [
  {
    patterns: ['الوقت بيخلص', 'اليوم يخلص', 'مش لاحق', 'مفيش وقت', 'الوقت ضيق', 'مش قادر ألحق', 'بيجري', 'ورايا حاجات كتير'],
    mappedEmotion: 'ضغط نفسي',
    description: 'ضيق الوقت والضغط'
  },
  {
    patterns: ['مش بعمل حاجة لنفسي', 'بهمل نفسي', 'مش واخد بالي من نفسي', 'ناسي نفسي', 'مش فاضي لنفسي', 'أهمل نفسي'],
    mappedEmotion: 'تعب نفسي',
    description: 'إهمال الذات'
  },
  {
    patterns: ['مش قادر أنام', 'صحيان', 'أرق', 'نومي وحش', 'مش بنام'],
    mappedEmotion: 'قلق',
    description: 'اضطرابات النوم'
  },
  {
    patterns: ['محدش فاهمني', 'محدش شايفني', 'مش حاسس بحد', 'بعيد عن الناس', 'مفيش حد جنبي'],
    mappedEmotion: 'وحدة',
    description: 'عدم التفاهم والعزلة'
  },
  {
    patterns: ['مش شايف نتيجة', 'تعبت ومفيش فايدة', 'كل مجهودي راح', 'مفيش جدوى', 'ليه بجتهد'],
    mappedEmotion: 'إحباط',
    description: 'عدم رؤية نتائج'
  },
  {
    patterns: ['خايف من بكرة', 'مش عارف هيحصل إيه', 'قلقان على المستقبل', 'خايف من اللي جاي'],
    mappedEmotion: 'خوف المستقبل',
    description: 'الخوف من المستقبل'
  },
  {
    patterns: ['فقدت حد', 'راح مني', 'مات', 'سافر', 'بعيد عني'],
    mappedEmotion: 'حزن',
    description: 'الفقد والفراق'
  },
  {
    patterns: ['غلطت', 'عملت حاجة غلط', 'كان لازم', 'ياريت معملتش', 'لو رجع الزمن'],
    mappedEmotion: 'ندم',
    description: 'الندم على أفعال ماضية'
  },
  {
    patterns: ['حد خذلني', 'اتخذلت', 'كنت فاكر', 'طلع مختلف', 'خاب أملي'],
    mappedEmotion: 'خذلان',
    description: 'خيبة الأمل من الآخرين'
  },
  {
    patterns: ['مش عارف أختار', 'محتار', 'إيه الصح', 'مش قادر أقرر', 'تايه'],
    mappedEmotion: 'حيرة',
    description: 'عدم القدرة على اتخاذ قرار'
  },
  {
    patterns: ['جسمي تعبان', 'مش قادر أقوم', 'خلاص', 'مستنزف', 'طاقتي خلصت'],
    mappedEmotion: 'إرهاق',
    description: 'الإرهاق الجسدي'
  },
  {
    patterns: ['ربنا بعيد', 'مش حاسس بربنا', 'صلاتي مش زي زمان', 'روحانيتي ضعفت'],
    mappedEmotion: 'جفاف روحي',
    description: 'البعد الروحي'
  },
  {
    patterns: ['الشغل كتير', 'مسؤوليات', 'كل حاجة عليا', 'محدش بيساعدني'],
    mappedEmotion: 'ثقل المسؤولية',
    description: 'ثقل المسؤوليات'
  },
  {
    patterns: ['مش حاسس بحاجة', 'فاضي', 'مفيش طعم', 'كل يوم زي بعضه'],
    mappedEmotion: 'فراغ داخلي',
    description: 'الفراغ الداخلي'
  },
];

function normalizeUserInput(input: string): { normalized: string; matchedRule: string | null } {
  const trimmedInput = input.trim();
  
  for (const rule of SITUATION_NORMALIZATION_RULES) {
    for (const pattern of rule.patterns) {
      if (trimmedInput.includes(pattern)) {
        console.log(`[Normalize] Pattern "${pattern}" → Emotion: "${rule.mappedEmotion}" (${rule.description})`);
        return {
          normalized: `أشعر بـ ${rule.mappedEmotion}`,
          matchedRule: rule.description
        };
      }
    }
  }
  
  return { normalized: trimmedInput, matchedRule: null };
}

function classifyEmotionLocally(
  query: string,
  examples: AiEmotionExample[],
  availableEmotions: string[]
): { emotion: string; confidence: number } | null {
  const { normalized, matchedRule } = normalizeUserInput(query);
  const textToAnalyze = query.trim();
  
  // LAYER 1: Check EMOTION_ALIAS_MAP first (highest priority for synonym handling)
  // This catches cases like "ظلم" → "قهر"
  for (const [alias, targetEmotion] of Object.entries(EMOTION_ALIAS_MAP)) {
    if (textToAnalyze.includes(alias)) {
      if (availableEmotions.includes(targetEmotion)) {
        console.log(`[AI-Local] Alias match: "${alias}" → "${targetEmotion}"`);
        return { emotion: targetEmotion, confidence: 0.95 };
      }
    }
  }
  
  // LAYER 2: Normalized rule match (situation patterns)
  if (matchedRule) {
    for (const emotion of availableEmotions) {
      if (normalized.includes(emotion)) {
        console.log(`[AI-Local] Normalized rule match: "${matchedRule}" → "${emotion}"`);
        return { emotion, confidence: 0.9 };
      }
    }
  }
  
  // LAYER 3: Direct emotion name match (user types exact emotion name)
  for (const emotion of availableEmotions) {
    if (textToAnalyze.includes(emotion)) {
      console.log(`[AI-Local] Direct emotion match: "${emotion}"`);
      return { emotion, confidence: 0.95 };
    }
  }
  
  // LAYER 4: Keyword match from EMOTION_KEYWORDS
  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    if (availableEmotions.includes(emotion)) {
      for (const keyword of keywords) {
        if (textToAnalyze.includes(keyword)) {
          console.log(`[AI-Local] Keyword match: "${keyword}" → "${emotion}"`);
          return { emotion, confidence: 0.85 };
        }
      }
    }
  }
  
  // LAYER 5: Exact phrase match from ai_emotion_examples
  for (const example of examples) {
    if (textToAnalyze === example.userPhrase.trim()) {
      if (availableEmotions.includes(example.primaryEmotion)) {
        console.log(`[AI-Local] Exact phrase match: "${example.primaryEmotion}"`);
        return { emotion: example.primaryEmotion, confidence: 1.0 };
      }
    }
  }
  
  // LAYER 6: Partial phrase match (strict - phrase must be significant)
  for (const example of examples) {
    const phrase = example.userPhrase.trim();
    if (phrase.length > 5 && (textToAnalyze.includes(phrase) || phrase.includes(textToAnalyze))) {
      if (availableEmotions.includes(example.primaryEmotion)) {
        console.log(`[AI-Local] Partial phrase match: "${example.primaryEmotion}"`);
        return { emotion: example.primaryEmotion, confidence: 0.7 };
      }
    }
  }
  
  // LAYER 7: Word match (STRICT - requires high confidence score >= 0.6)
  // This prevents wrong guesses like "فتور روحي" for unrelated queries
  const queryWords = textToAnalyze.split(/\s+/).filter(w => w.length > 2);
  let bestMatch: { emotion: string; score: number } | null = null;
  
  for (const example of examples) {
    const exampleWords = example.userPhrase.trim().split(/\s+/).filter(w => w.length > 2);
    let matchCount = 0;
    for (const word of queryWords) {
      for (const ew of exampleWords) {
        if (ew === word) { // Exact word match only
          matchCount++;
          break;
        }
      }
    }
    const score = matchCount / Math.max(queryWords.length, 1);
    // STRICT THRESHOLD: Only accept matches with >= 60% word overlap
    if (score >= 0.6 && (!bestMatch || score > bestMatch.score)) {
      if (availableEmotions.includes(example.primaryEmotion)) {
        bestMatch = { emotion: example.primaryEmotion, score };
      }
    }
  }
  
  if (bestMatch) {
    console.log(`[AI-Local] Word match: "${bestMatch.emotion}" (score: ${bestMatch.score.toFixed(2)})`);
    return { emotion: bestMatch.emotion, confidence: bestMatch.score };
  }
  
  // NO MATCH FOUND - return null (will trigger "emotion not found" message)
  console.log('[AI-Local] No strong emotion match found for:', textToAnalyze);
  return null;
}

// NEW: Match core_emotion from user input
// Priority: Direct match > Alias match > Normalized rule match
function matchCoreEmotion(query: string, coreEmotions: string[]): string | null {
  // Apply Arabic text normalization (ي↔ى, ة↔ه, أ↔ا, etc.)
  const textToAnalyze = normalizeArabicText(query);
  console.log(`[AI-New] Normalized query: "${query}" → "${textToAnalyze}"`);
  
  // LAYER 1: Direct core_emotion name match (HIGHEST PRIORITY)
  // This ensures "فرح" maps to "فرح" directly without going through aliases
  for (const core of coreEmotions) {
    const normalizedCore = normalizeArabicText(core);
    if (textToAnalyze.includes(normalizedCore)) {
      console.log(`[AI-New] Direct core_emotion match: "${core}"`);
      return core;
    }
  }
  
  // LAYER 2: Check EMOTION_ALIAS_MAP for semantic matching
  for (const [alias, targetEmotion] of Object.entries(EMOTION_ALIAS_MAP)) {
    const normalizedAlias = normalizeArabicText(alias);
    if (textToAnalyze.includes(normalizedAlias)) {
      // First check if targetEmotion is a core_emotion directly
      if (coreEmotions.includes(targetEmotion)) {
        console.log(`[AI-New] Alias match: "${alias}" → core_emotion: "${targetEmotion}"`);
        return targetEmotion;
      }
      // Otherwise try to find a matching core_emotion
      for (const core of coreEmotions) {
        const normalizedTarget = normalizeArabicText(targetEmotion);
        const normalizedCoreCheck = normalizeArabicText(core);
        if (normalizedTarget.includes(normalizedCoreCheck) || normalizedCoreCheck.includes(normalizedTarget)) {
          console.log(`[AI-New] Alias partial match: "${alias}" → core_emotion: "${core}"`);
          return core;
        }
      }
    }
  }
  
  // LAYER 3: Normalized rule match (situation patterns)
  const { normalized, matchedRule } = normalizeUserInput(query);
  if (matchedRule) {
    const normalizedResult = normalizeArabicText(normalized);
    for (const core of coreEmotions) {
      const normalizedCore = normalizeArabicText(core);
      if (normalizedResult.includes(normalizedCore)) {
        console.log(`[AI-New] Normalized rule match: "${matchedRule}" → core_emotion: "${core}"`);
        return core;
      }
    }
  }
  
  return null;
}

// NEW: Find best matching sub_emotion within a core_emotion
async function matchSubEmotion(query: string, coreEmotion: string): Promise<{ subEmotion: string; verseText: string; verseReference: string } | null> {
  const subEmotions = await storage.getSubEmotionsByCoreEmotion(coreEmotion);
  if (subEmotions.length === 0) return null;
  
  const textToAnalyze = query.trim().toLowerCase();
  
  // Try to find exact sub_emotion match
  for (const se of subEmotions) {
    if (textToAnalyze.includes(se.subEmotion.toLowerCase())) {
      console.log(`[AI-New] Exact sub_emotion match: "${se.subEmotion}"`);
      return { subEmotion: se.subEmotion, verseText: se.verseText, verseReference: se.verseReference };
    }
  }
  
  // No exact match - return random verse from core_emotion
  const randomVerse = subEmotions[Math.floor(Math.random() * subEmotions.length)];
  console.log(`[AI-New] Random sub_emotion from core "${coreEmotion}": "${randomVerse.subEmotion}"`);
  return { subEmotion: randomVerse.subEmotion, verseText: randomVerse.verseText, verseReference: randomVerse.verseReference };
}

export async function processAiQuery(user: User, query: string): Promise<AiResponse> {
  try {
    // Check premium status and usage limits (restored from original)
    const isPremium = await checkPremiumStatus(user);
    const usageCheck = await checkAiUsageLimit(user);
    const apiKey = process.env.OPENAI_API_KEY;

    // Get available core_emotions from NEW ai_emotions table
    let coreEmotions: string[] = [];
    
    try {
      coreEmotions = await storage.getDistinctCoreEmotions();
    } catch (dbError) {
      console.error('[AI] Database error fetching core emotions:', dbError);
      return {
        success: false,
        error: 'حدث خطأ في قراءة البيانات. يرجى المحاولة مرة أخرى.',
      };
    }
    
    if (coreEmotions.length === 0) {
      console.log('[AI] No core emotions available in ai_emotions table');
      return {
        success: false,
        error: 'نظام تصنيف المشاعر غير متاح حالياً. يرجى المحاولة لاحقاً.',
      };
    }

    // Model selection: Premium users can use GPT, free users use local model only
    let usedPaidModel = false;
    let coreEmotion: string | null = null;
    
    // LAYER 0 (NEW): Semantic Pre-Analysis - Free understanding layer
    // This layer normalizes indirect expressions and generates candidate phrases
    // It does NOT generate emotions or verses - only improves matching
    const semanticResult = semanticPreAnalysis(query);
    const candidateQueries = semanticResult.candidatePhrases;
    console.log(`[AI-Semantic] Pre-analysis complete. Candidates: ${candidateQueries.length}, Tags: [${semanticResult.detectedTags.join(', ')}]`);
    
    // LAYER 1 (HIGHEST PRIORITY): Match against ai_user_phrases table
    // Try each candidate phrase from semantic pre-analysis
    // This is the primary semantic matching layer - 2500 phrases mapped to core emotions
    try {
      for (const candidateQuery of candidateQueries) {
        const phraseMatch = await storage.matchUserPhrase(candidateQuery);
        if (phraseMatch && coreEmotions.includes(phraseMatch)) {
          coreEmotion = phraseMatch;
          console.log(`[AI-Phrases] Phrase table match for "${candidateQuery}" → core_emotion: "${coreEmotion}"`);
          break;
        }
      }
    } catch (phraseError) {
      console.log('[AI] Phrase matching error, continuing to next layer');
    }
    
    // LAYER 1.5 (NEW): Use projected emotion keys from semantic analysis
    // If semantic layer detected concepts that map to valid emotions, use them directly
    if (!coreEmotion && semanticResult.projectedEmotionKeys.length > 0) {
      for (const projectedKey of semanticResult.projectedEmotionKeys) {
        if (coreEmotions.includes(projectedKey)) {
          coreEmotion = projectedKey;
          console.log(`[AI-Projection] Semantic projection → core_emotion: "${coreEmotion}"`);
          break;
        }
      }
    }
    
    // LAYER 2: For premium users with API key, try GPT-4o-mini
    if (!coreEmotion && apiKey && isPremium) {
      try {
        const examples = await storage.getAllAiEmotionExamples();
        const classification = await classifyEmotionWithOpenAI(query, apiKey, examples, coreEmotions);
        if (classification && coreEmotions.includes(classification.emotion)) {
          coreEmotion = classification.emotion;
          usedPaidModel = true;
          console.log(`[AI-Premium] GPT classified core_emotion: "${coreEmotion}"`);
        }
      } catch (gptError) {
        console.log('[AI] GPT classification failed, falling back to local');
      }
    }
    
    // LAYER 3: Fallback to local rule-based matching (ALIAS_MAP, direct match, etc.)
    // Try each candidate phrase from semantic pre-analysis
    if (!coreEmotion) {
      for (const candidateQuery of candidateQueries) {
        coreEmotion = matchCoreEmotion(candidateQuery, coreEmotions);
        if (coreEmotion) {
          console.log(`[AI-Local] Alias/direct match for "${candidateQuery}" → core_emotion: "${coreEmotion}"`);
          break;
        }
      }
    }
    
    // LAYER 4 (IMPROVED FALLBACK): Keyword extraction with semantic expansion
    // Only runs if all previous layers failed
    // Step 4a: Semantic Keyword Expansion - extract and expand keywords
    // Step 4b: Keyword → ai_user_phrases table
    // Step 4c: Keyword → core_emotions direct match
    if (!coreEmotion) {
      console.log('[AI-Keyword] Running improved keyword fallback...');
      const keywordResult = extractKeywordsFallback(query);
      
      // Step 4a: Semantic Keyword Expansion - get expanded phrases from keywords
      const expandedPhrases: string[] = [];
      if (keywordResult.projectedEmotions.length > 0) {
        expandedPhrases.push(...keywordResult.projectedEmotions);
        // Also add the original query words that might be emotion-related
        const queryWords = query.split(/\s+/).filter(w => w.length > 2);
        expandedPhrases.push(...queryWords);
        console.log(`[AI-Keyword] Step 4a: Expanded phrases: [${expandedPhrases.slice(0, 5).join(', ')}...]`);
      }
      
      // Step 4b: Search expanded phrases in ai_user_phrases table
      if (!coreEmotion && expandedPhrases.length > 0) {
        try {
          for (const phrase of expandedPhrases) {
            const phraseMatch = await storage.matchUserPhrase(phrase);
            if (phraseMatch && coreEmotions.includes(phraseMatch)) {
              coreEmotion = phraseMatch;
              console.log(`[AI-Keyword] Step 4b: Phrase table match "${phrase}" → core_emotion: "${coreEmotion}"`);
              break;
            }
          }
        } catch (phraseError) {
          console.log('[AI-Keyword] Step 4b: Phrase matching error, continuing to 4c');
        }
      }
      
      // Step 4c: Direct match projected emotions against core_emotions
      if (!coreEmotion && keywordResult.projectedEmotions.length > 0) {
        for (const projectedKey of keywordResult.projectedEmotions) {
          if (coreEmotions.includes(projectedKey)) {
            coreEmotion = projectedKey;
            console.log(`[AI-Keyword] Step 4c: Direct projection → core_emotion: "${coreEmotion}"`);
            break;
          }
        }
      }
    }
    
    // LAYER 5 (LAST RESORT): Groq Free Tier - Language Understanding Only
    // - Only runs when ALL previous layers failed
    // - Maximum 3 calls per user per day
    // - One-shot generation only, no retries
    // - For understanding only, NOT for generating content
    // - Verses are selected from existing database only
    let groqQuotaExceeded = false;
    if (!coreEmotion) {
      console.log('[AI-Groq] All local matching failed. Trying Groq free tier for language understanding...');
      try {
        const groqResult = await classifyEmotionWithGroq(query, coreEmotions, user.id);
        if (groqResult) {
          if (groqResult.quotaExceeded) {
            groqQuotaExceeded = true;
            console.log('[AI-Groq] User quota exceeded');
          } else if (groqResult.emotion && coreEmotions.includes(groqResult.emotion)) {
            coreEmotion = groqResult.emotion;
            console.log(`[AI-Groq] Groq classified → core_emotion: "${coreEmotion}" (confidence: ${groqResult.confidence})`);
          }
        }
      } catch (groqError) {
        console.log('[AI-Groq] Groq classification failed:', groqError);
      }
    }
    
    if (!coreEmotion) {
      console.log('[AI] Could not match core_emotion for query:', query);
      
      await storage.logAiUsage({
        userId: user.id,
        modelType: usedPaidModel ? 'paid' : 'free',
        query,
        response: 'لم يتم التعرف على الشعور',
      });

      // Different message if Groq quota exceeded
      if (groqQuotaExceeded) {
        return {
          success: true,
          emotionNotFound: true,
          response: `أنت تتعامل حالياً مع النظام المجاني.
لا يوجد تطابق مباشر لشعورك مع الآيات المتاحة.
انتهت حصتك اليومية من التحليل الذكي.`,
          modelUsed: 'local',
        };
      }

      return {
        success: true,
        emotionNotFound: true,
        response: `لا يوجد تطابق مع المشاعر المسجلة حالياً.`,
        modelUsed: usedPaidModel ? 'semantic' : 'local',
      };
    }

    // Step 2: Find best matching sub_emotion within core_emotion
    const match = await matchSubEmotion(query, coreEmotion);
    
    if (!match) {
      console.log(`[AI] No sub_emotions found for core_emotion: ${coreEmotion}`);
      
      await storage.logAiUsage({
        userId: user.id,
        modelType: usedPaidModel ? 'paid' : 'free',
        query,
        response: `تم تحديد الشعور: ${coreEmotion}، لكن لا توجد آيات مرتبطة`,
      });

      return {
        success: true,
        emotionNotFound: true,
        detectedEmotion: coreEmotion,
        response: `تم التعرف على شعورك: "${coreEmotion}"

عذراً، لا توجد آيات مرتبطة بهذا الشعور حالياً.`,
        modelUsed: usedPaidModel ? 'semantic' : 'local',
      };
    }

    // Step 3: Format response in Bible Path style (empathy + verse + practical advice)
    const response = formatBiblePathResponse(coreEmotion, match.subEmotion, match.verseText, match.verseReference);
    
    await storage.logAiUsage({
      userId: user.id,
      modelType: usedPaidModel ? 'paid' : 'free',
      query,
      response,
    });

    return {
      success: true,
      response,
      modelUsed: usedPaidModel ? 'semantic' : 'local',
      detectedEmotion: `${coreEmotion} - ${match.subEmotion}`,
      remainingRequests: 999999, // Unlimited for local model
    };
  } catch (error) {
    console.error('AI processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'حدث خطأ غير متوقع',
    };
  }
}

// ============================================================
// AI-ENHANCED SEARCH — re-rank + suggest additional verses
// Uses same Groq API key. Separate daily limit tracker.
// IMPORTANT: AI must never generate verse text. It only
// suggests verse REFERENCES that are then looked up in the DB.
// ============================================================

const searchGroqUsage: Map<string, { count: number; date: string }> = new Map();
const SEARCH_GROQ_DAILY_LIMIT = 30;

function checkSearchGroqLimit(userId: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  const usage = searchGroqUsage.get(userId);
  if (!usage || usage.date !== today) {
    searchGroqUsage.set(userId, { count: 0, date: today });
    return true;
  }
  return usage.count < SEARCH_GROQ_DAILY_LIMIT;
}

function incrementSearchGroqUsage(userId: string): void {
  const today = new Date().toISOString().split('T')[0];
  const usage = searchGroqUsage.get(userId);
  if (!usage || usage.date !== today) {
    searchGroqUsage.set(userId, { count: 1, date: today });
  } else {
    usage.count++;
  }
}

export interface SearchEnhancement {
  rankedIds: number[];
  additionalRefs: Array<{ book: string; chapter: number; verse: number }>;
}

export async function enhanceSearchWithGroq(
  query: string,
  verses: Array<{ id: number; bookName: string; chapter: number; verse: number; text: string }>,
  userId: string
): Promise<SearchEnhancement | null> {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) return null;
  if (!checkSearchGroqLimit(userId)) return null;
  if (verses.length === 0) return null;

  // Send all candidates (up to 20) with text snippets so Groq can judge relevance
  const candidates = verses.slice(0, 20);
  const candidatesContext = candidates
    .map(v => `${v.id} | ${v.bookName} ${v.chapter}:${v.verse} | ${v.text.slice(0, 140)}`)
    .join('\n');

  const prompt = `أنت خبير لاهوتي في الكتاب المقدس العربي نسخة فان دايك.

الموضوع المطلوب: "${query}"
(انتبه للجذر اللغوي: سلامي=سلام، توبتي=توبة، محبتك=محبة)

عندي قائمة آيات مرشحة من بحث نصي. كثير منها ضعيف الصلة (مجرد تطابق كلمة بلا معنى موضوعي). مهمتك:
1. اختر فقط الآيات القوية الصلة بالموضوع روحياً (تجاهل التطابقات السطحية تماماً).
2. اقترح 10 آيات إضافية قوية الصلة من الكتاب المقدس فان دايك ليست في القائمة.

القائمة (id | المرجع | بداية النص):
${candidatesContext}

أجب بـ JSON صارم بهذا الشكل فقط:
{
  "keep": [قائمة الـ id الأرقام للآيات القوية الصلة فقط، يمكن أن تكون فارغة],
  "add": ["اسم السفر فصل:آية", "اسم السفر فصل:آية", ...]
}

مثال:
{"keep":[12,45],"add":["يوحنا 14:27","فيلبي 4:7","مزمور 119:165"]}

لا تكتب أي شرح خارج JSON.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('[AI-Search] Groq error:', response.status);
      return null;
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    incrementSearchGroqUsage(userId);

    let parsed: { keep?: unknown; add?: unknown };
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('[AI-Search] JSON parse failed:', content.substring(0, 200));
      return null;
    }

    const candidateIds = new Set(candidates.map(v => v.id));
    const rankedIds: number[] = Array.isArray(parsed.keep)
      ? (parsed.keep as unknown[]).filter((n): n is number => typeof n === 'number' && candidateIds.has(n))
      : [];

    const additionalRefs: Array<{ book: string; chapter: number; verse: number }> = [];
    const addArr: unknown[] = Array.isArray(parsed.add) ? (parsed.add as unknown[]) : [];
    for (const raw of addArr) {
      if (typeof raw !== 'string') continue;
      const line = raw;
      // Strip leading numbering like "1. " or "- " or "* "
      const clean = line.replace(/^[\d\-\*\.]+\s*/, '').trim();
      // Match: Arabic book name (one or more words) + space + chapter:verse
      // Supports both ASCII digits (41:10) and Arabic-Indic digits (٤١:١٠)
      const m = clean.match(/^([\u0600-\u06FF\u0670\s]+?)\s+([\d٠-٩]+):([\d٠-٩]+)/);
      if (m) {
        const book = m[1].trim();
        // Convert Arabic-Indic digits to Western if needed
        const toWestern = (s: string) => s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));
        const chapter = parseInt(toWestern(m[2]), 10);
        const verse = parseInt(toWestern(m[3]), 10);
        if (book && chapter > 0 && verse > 0) {
          additionalRefs.push({ book, chapter, verse });
        }
      }
    }

    return { rankedIds, additionalRefs };
  } catch (error) {
    console.error('[AI-Search] Error:', error);
    return null;
  }
}
