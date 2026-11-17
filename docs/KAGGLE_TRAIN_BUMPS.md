# تدريب موديل المطبات على Kaggle (٢٠٢٦-١١-١٧)

خلية واحدة المالك بيلزقها فى نوتبوك Kaggle (GPU T4 x2 · Files only · Internet on) بعد ما يضيف `road-anomaly-ds` كـInput.
الكود: `oscardrive-android/vision-test/train/kaggle_train_bumps.py` (المصدر — الصفحة عرض له).

- الموديل **YOLOX-Nano** (Apache-2.0) من أوزانه الرسمية، ٤٠ لفة على مقاس ٤١٦ (نفس الموبايل). ⛔ مش Ultralytics (AGPL).
- الداتا YOLO TXT ⇒ COCO JSON (تقسيم الداتا لو موجود، وإلا ١٥٪ للتقييم). اتجرّب التحويل على داتا وهمية بنفس الشكل.
- الناتج فى `/kaggle/working/oscar_bumps`: `oscar_bumps_yolox_nano.pth` + `.onnx` + `eval.txt` (AP لكل نوع) + `model.json`.
- الخطوة الجاية: تجربة الموديل على فيديو الطريق ومقارنته بالـ٤ مطبات اللى المالك حدّدها (٠٧:١٢ · ٠٨:١٥ · ٠٩:٢٤ · ٠٩:٣٧).

الصفحة: https://claude.ai/artifact/JfH1sGR78amih17sWLLAHC — **Trigger:** «ابعتلي كود تدريب المطبات».
