# تدريب موديل المطبات على Kaggle (٢٠٢٦-١١-١٧)

خلية واحدة المالك بيلزقها فى نوتبوك Kaggle (GPU T4 x2 · Files only · Internet on) بعد ما يضيف `road-anomaly-ds` كـInput.
الكود: `oscardrive-android/vision-test/train/kaggle_train_bumps.py` (المصدر — الصفحة عرض له).

- الموديل **YOLOX-Nano** (Apache-2.0) من أوزانه الرسمية، ٣٠ لفة على مقاس ٤١٦ (نفس الموبايل). ⛔ مش Ultralytics (AGPL).
- **نسخة ٢ (٢٠٢٦-١١-١٧):** التشغيل الأول علّق +٣ ساعات من غير أى سطر بعد «Cloning YOLOX» (التدريب الموزّع على T4 x2
  بيعلّق على Kaggle). دلوقتى: كارت واحد (`-d 1`) + `NCCL_P2P_DISABLE` · سطر بالدقايق فى Logs (stderr) + سطر YOLOX كل ٢٠ خطوة ·
  حد أقصى ١٠.٥ ساعة ⇒ يوقف ويصدّر `latest_ckpt` قبل حد Kaggle (١٢ ساعة).
- الداتا YOLO TXT ⇒ COCO JSON (تقسيم الداتا لو موجود، وإلا ١٥٪ للتقييم). اتجرّب التحويل على داتا وهمية بنفس الشكل.
- الناتج فى `/kaggle/working/oscar_bumps`: `oscar_bumps_yolox_nano.pth` + `.onnx` + `eval.txt` (AP لكل نوع) + `model.json`.
- الخطوة الجاية: تجربة الموديل على فيديو الطريق ومقارنته بالـ٤ مطبات اللى المالك حدّدها (٠٧:١٢ · ٠٨:١٥ · ٠٩:٢٤ · ٠٩:٣٧).

الصفحة: https://claude.ai/artifact/JfH1sGR78amih17sWLLAHC — **Trigger:** «ابعتلي كود تدريب المطبات».
