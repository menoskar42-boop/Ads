# تدريب موديل المطبات على Kaggle (٢٠٢٦-١١-١٧)

خلية واحدة المالك بيلزقها فى نوتبوك Kaggle (GPU T4 x2 · Files only · Internet on) بعد ما يضيف `road-anomaly-ds` كـInput.
الكود: `oscardrive-android/vision-test/train/kaggle_train_bumps.py` (المصدر — الصفحة عرض له).

- الموديل **YOLOX-Nano** (Apache-2.0) من أوزانه الرسمية، ٣٠ لفة على مقاس ٤١٦ (نفس الموبايل). ⛔ مش Ultralytics (AGPL).
- **نسخة ٢ (٢٠٢٦-١١-١٧):** التشغيل الأول علّق +٣ ساعات من غير أى سطر بعد «Cloning YOLOX» (التدريب الموزّع على T4 x2
  بيعلّق على Kaggle). دلوقتى: كارت واحد (`-d 1`) + `NCCL_P2P_DISABLE` · سطر بالدقايق فى Logs (stderr) + سطر YOLOX كل ٢٠ خطوة ·
  حد أقصى ١٠.٥ ساعة ⇒ يوقف ويصدّر `latest_ckpt` قبل حد Kaggle (١٢ ساعة).
- **نسخة ٣ (٢٠٢٦-١١-١٨):** Version 2 علّقت ٥:٤٠ ساعة بعد جدول الإعدادات (آخر سطر تحذير autocast من `yolo_head.py`، ومفيش ولا
  `epoch`). دلوقتى `data_num_workers=0` و`cv2.setNumThreads(0)` (أشهر سبب لتعليق YOLOX)، وحارس: مفيش سطر ٢٠ دقيقة ⇒ `py-spy dump`
  لمكان التعليق فى الـLog ثم إيقاف (بدل ما يحرق لحد ١٠.٥ ساعة). الحارس اتجرّب محلياً (stalled/done/error/timeout).
- الداتا YOLO TXT ⇒ COCO JSON (تقسيم الداتا لو موجود، وإلا ١٥٪ للتقييم). اتجرّب التحويل على داتا وهمية بنفس الشكل.
- الناتج فى `/kaggle/working/oscar_bumps`: `oscar_bumps_yolox_nano.pth` + `.onnx` + `eval.txt` (AP لكل نوع) + `model.json`.
- الخطوة الجاية: تجربة الموديل على فيديو الطريق ومقارنته بالـ٤ مطبات اللى المالك حدّدها (٠٧:١٢ · ٠٨:١٥ · ٠٩:٢٤ · ٠٩:٣٧).

الصفحة: https://claude.ai/artifact/JfH1sGR78amih17sWLLAHC — **Trigger:** «ابعتلي كود تدريب المطبات».
