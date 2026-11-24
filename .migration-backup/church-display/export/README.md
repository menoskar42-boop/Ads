# تصدير شرائح القداسات على Windows

شغّل PowerShell على لابتوب القاعة بعد تثبيت PowerPoint، ومن غير فتح ملفات المصدر يدويًا. السكربت يفتح العروض للقراءة فقط، يعطّل الماكرو، ويصدر الصور إلى مجلد الناتج. لا تحفظ أو تعدّل ملفات PowerPoint الأصلية.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Export-Slides.ps1 -Source "D:\قداس سنوي" -Output "D:\ChurchDisplay\out" -Format JPG -Width 1920 -Height 1080
```

يمكن استخدام `-Format PNG` بدل `JPG`. التشغيل قابل للاستكمال: العرض الذي لم يتغير حجمه أو تاريخ تعديله يتخطاه السكربت. راجع `out\export-log.txt` بعد التشغيل؛ فشل عرض واحد لا يمنع محاولة الباقي.
