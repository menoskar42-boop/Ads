# مهمة لريبليت: الصور فى أوسكار ميسنجر بتفضل تحمّل ومابتفتحش (٢٠٢٦-١١-٢٦)

> المالك ٢٠٢٦-١١-٢٦ ١١:٠٣ (صورة آيفون: مربع صورة طويل والدايرة بتلف، ✓✓ ظاهرة):
> «الصور كلها اللى بتتبعت بتفضل تحمل من غير ما تظهر و مش بقدر افتحها للمعاينه».
>
> **السبب [كود] — `artifacts/oscar-messenger/app/chat/[conversationId].tsx` · `loadMessageMedia` (~١٢٠١):**
> 1. أول مرة الصورة بتتحمّل، و`InlineImagePreview` بيستدعى `onLoad`. وده سبب إن المربع اتظبط على مقاس الصورة الطويل،
>    ونفس `onLoad` بيحط `loading: false`.
> 2. بعدها، أى تغيير فى الرسايل اللى ظاهرة على الشاشة (رسالة جديدة، سكرول، refetch) بيشغّل `onViewableItemsChanged` تانى،
>    فـ`loadVisibleImage` ينادى `loadMessageMedia`.
> 3. الصورة موجودة فى الكاش، فالفرع ده بيرجّع `loading: true` (السطر `loading: attachment.kind === "image"`)،
>    على أمل إن `onLoad` يشتغل تانى.
> 4. بس الـ`uri` هو هو، فـ`expo-image` مابيعيدش `onLoad`.
> ⇐ الدايرة بتفضل تلف للأبد، والصورة نفسها مستخبية (`loadingImage: opacity 0`)، والضغط مقفول (`disabled={loading}`).
> ونفس الكود بالحرف فى `app/groups/[groupId]/index.tsx` (~٥٣٢).

```
نفّذ بند واحد ⇒ commit وpush على claude/build-oscardevs-ads-mvp-8krfN.

الملفات (Edit فى مكانه بس):
- artifacts/oscar-messenger/app/chat/[conversationId].tsx
- artifacts/oscar-messenger/app/groups/[groupId]/index.tsx

١) فى loadMessageMedia (المحادثة) والدالة المقابلة فى الجروب، فرع "cached" (لما getCachedMedia يرجّع حاجة):
   setMediaPreviewStates((current) => {
     const prev = current[id];
     if (prev && prev.uri === cached.uri && !prev.error) return current;   // الصورة معروضة أصلاً ⇒ مانرجعش loading
     return { ...current, [id]: { uri: cached.uri, loading: attachment.kind === "image", error: false } };
   });
   - وبعد التحميل الجديد (المسار اللى مش من الكاش)، نفس الشرط:
     لو prev.uri === media.uri وprev.loading === false ⇒ سيبه زى ما هو.
   - ⛔ ماتغيّرش أى حاجة تانية فى الدالة ولا فى loadAuthenticatedMedia ولا فى الكاش.

٢) InlineImagePreview.tsx: من غير تغيير، ماعدا لو لزم سطر واحد عشان الحماية:
   لو المكوّن اتعمله remount بنفس الـuri وloading=true، يقدر يعتمد على onLoad الجديد (طبيعى مع remount). ومفيش حاجة غير كده.

٣) اختبار نص فى artifacts/oscar-messenger/tests (إضافة):
   فرع الكاش فى الملفين فيه شرط prev.uri === cached.uri قبل ما يحط loading.
   وtypecheck للتطبيق.

ممنوع: مكتبات جديدة، السيرفر، القاعدة، الأسرار، النشر، وأى تعديل برّه الأماكن دى.
commit: "Messenger: don't re-flag already-shown image previews as loading"
```

## للمالك بعد النشر
اقفل الـPWA من الـrecents وافتحه تانى، عشان النسخة الجديدة تتحمّل.
