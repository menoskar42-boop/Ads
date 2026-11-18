# Kaggle bumps report — notebookd9512e2193

وقت الفحص: 2026-11-18 حوالى 07:30 صباحاً بتوقيت القاهرة
(المهمة المجدولة 1:33 ص وقفت عند أول طلب صلاحية، فالفحص اتعمل يدوى من السيشن الأصلية.)

## الـVersions

| Version | الحالة | المدة | ملاحظة |
|---|---|---|---|
| 4 | **Complete** — "Successfully ran in 5292.9s" | 5292.9 ث (~88 د) | كود «نسخة ٣» · GPU T4 x2 · Output 124.15 MB |
| 3 | Cancelled | 0 ث | |
| 2 | Cancelled | ~6.5 ساعة (اتشغّلت 6:26 م 17/11، اتلغت ~12:57 ص 18/11) | علّقت بعد أول سطر تدريب (آخر سطر عند 955.5s) |
| 1 | Cancelled | 4 ساعات و4 دقايق | |

## آخر سطر epoch (Version 4)

```
5247.7s	8090	2026-11-18 00:29:14 | INFO     | yolox.core.trainer:270 - epoch: 30/30, iter: 280/285, gpu mem: 2063Mb, mem: 5.3Gb, iter_time: 0.291s, data_time: 0.141s, total_loss: 4.4, iou_loss: 1.9, l1_loss: 0.7, conf_loss: 1.3, cls_loss: 0.5, lr: 1.250e-04, size: 448, ETA: 0:00:02
```

## سطور مهمة

- مفيش سطور «--- py-spy» ولا «التدريب معلّق» ولا «مفيش أى نسخة موديل اتحفظت».
- `[  87.7 د] النسخة اللى هتتصدّر: best_ckpt.pth · التدريب خلص`
- `Training of experiment is done and the best AP is 46.44`
- `[  87.9 د] خلص ✓ — الملفات فى /kaggle/working/oscar_bumps: ['oscar_bumps_yolox_nano.pth', 'model.json', 'eval.txt']`
- **eval.py و export_onnx.py فشلوا الاتنين** بنفس الخطأ (PyTorch 2.6 بقى weights_only=True افتراضياً، وbest_ckpt.pth فيه numpy scalar):
  `_pickle.UnpicklingError: Weights only load failed ... WeightsUnpickler error: Unsupported global: GLOBAL numpy._core.multiarray.scalar was not an allowed global by default.`
  - eval.py: `File ".../YOLOX/tools/eval.py", line 167, in main  ckpt = torch.load(ckpt_file, map_location=loc)`
  - export_onnx.py: `File ".../YOLOX/tools/export_onnx.py", line 79, in main  ckpt = torch.load(ckpt_file, map_location="cpu")`
  - النتيجة: **مفيش ملف .onnx**، وeval.txt فيه الـTraceback بدل تقرير الدقة.

## الدقة (من آخر تقييم أثناء التدريب — epoch 30، على 1854 صورة val)

```
 Average Precision  (AP) @[ IoU=0.50:0.95 | area=   all | maxDets=100 ] = 0.464
 Average Precision  (AP) @[ IoU=0.50      | area=   all | maxDets=100 ] = 0.803
 Average Precision  (AP) @[ IoU=0.75      | area=   all | maxDets=100 ] = 0.470
 Average Precision  (AP) @[ IoU=0.50:0.95 | area= small | maxDets=100 ] = 0.061
 Average Precision  (AP) @[ IoU=0.50:0.95 | area=medium | maxDets=100 ] = 0.253
 Average Precision  (AP) @[ IoU=0.50:0.95 | area= large | maxDets=100 ] = 0.523
 Average Recall     (AR) @[ IoU=0.50:0.95 | area=   all | maxDets=  1 ] = 0.396
 Average Recall     (AR) @[ IoU=0.50:0.95 | area=   all | maxDets= 10 ] = 0.561
 Average Recall     (AR) @[ IoU=0.50:0.95 | area=   all | maxDets=100 ] = 0.575
 Average Recall     (AR) @[ IoU=0.50:0.95 | area= small | maxDets=100 ] = 0.068
 Average Recall     (AR) @[ IoU=0.50:0.95 | area=medium | maxDets=100 ] = 0.420
 Average Recall     (AR) @[ IoU=0.50:0.95 | area= large | maxDets=100 ] = 0.629
per class AP:
| class   | AP     | class     | AP     | class   | AP     |
| Pothole | 42.359 | Speedbump | 52.383 | Crack   | 44.573 |
per class AR:
| class   | AR     | class     | AR     | class   | AR     |
| Pothole | 53.462 | Speedbump | 60.766 | Crack   | 58.406 |
Average forward time: 1.89 ms, Average NMS time: 0.70 ms, Average inference time: 2.59 ms
```

## Output ← oscar_bumps

| الملف | الحجم |
|---|---|
| oscar_bumps_yolox_nano.pth | 7.58 MB |
| eval.txt | 31.05 kB |
| model.json | 155 B |
| (مفيش oscar_bumps_yolox_nano.onnx — التصدير فشل) | |

model.json (منقول من عارض Kaggle):
```
{"classes": ["Pothole", "Speedbump", "Crack"], "input": 416, "epochs": 30, "finished": true, "state": "done", "checkpoint": "best_ckpt.pth", "minutes": 88}
```

## آخر 80 سطر من الـLog (Version 4)

ملاحظة: Kaggle بيكرر كل سطر مرتين أو تلاتة (stdout+stderr) — شلت التكرار المتجاور بس. اللينكات اتستبدلت بـ<url>.

```
5285.0s	8651	2026-11-18 00:29:46 | INFO     | pycocotools.coco:86 - creating index...
5285.0s	8652	2026-11-18 00:29:46 | INFO     | pycocotools.coco:86 - index created!
5285.0s	8653	2026-11-18 00:29:46 | INFO     | __main__:165 - loading checkpoint from /kaggle/working/yolox_work/out/oscar_bumps/best_ckpt.pth
5285.0s	8654	2026-11-18 00:29:46 | ERROR    | yolox.core.launch:98 - An error has been caught in function 'launch', process 'MainProcess' (154), thread 'MainThread' (137345125786368):
5285.0s	8655	Traceback (most recent call last):
5285.0s	8656	
5285.0s	8657	  File "/kaggle/working/yolox_work/YOLOX/tools/eval.py", line 212, in <module>
5285.0s	8658	    launch(
5285.0s	8659	    └ <function launch at 0x7ce956c0fc40>
5285.0s	8661	> File "/kaggle/working/yolox_work/YOLOX/yolox/core/launch.py", line 98, in launch
5285.0s	8662	    main_func(*args)
5285.0s	8663	    │          └ (╒═══════════════════╤═══════════════════════════════════════════════════════════════════════════════════════════════════════...
5285.0s	8664	    └ <function main at 0x7ce956b59bc0>
5285.0s	8665	
5285.0s	8666	  File "/kaggle/working/yolox_work/YOLOX/tools/eval.py", line 167, in main
5285.0s	8667	    ckpt = torch.load(ckpt_file, map_location=loc)
5285.0s	8668	           │     │    │                       └ 'cuda:0'
5285.0s	8669	           │     │    └ '/kaggle/working/yolox_work/out/oscar_bumps/best_ckpt.pth'
5285.0s	8670	           │     └ <function load at 0x7ce994932020>
5285.0s	8671	           └ <module 'torch' from '/usr/local/lib/python3.13/dist-packages/torch/__init__.py'>
5285.0s	8672	
5285.0s	8673	  File "/usr/local/lib/python3.13/dist-packages/torch/serialization.py", line 1578, in load
5285.0s	8674	    raise pickle.UnpicklingError(_get_wo_message(str(e))) from None
5285.0s	8675	          │      │               └ <function load.<locals>._get_wo_message at 0x7ce8a4e93ba0>
5285.0s	8676	          │      └ <class '_pickle.UnpicklingError'>
5285.0s	8677	          └ <module 'pickle' from '/usr/lib/python3.13/pickle.py'>
5285.0s	8678	
5285.0s	8679	_pickle.UnpicklingError: Weights only load failed. This file can still be loaded, to do so you have two options, [1mdo those steps only if you trust the source of the checkpoint[0m. 
5285.0s	8680		(1) In PyTorch 2.6, we changed the default value of the `weights_only` argument in `torch.load` from `False` to `True`. Re-running `torch.load` with `weights_only` set to `False` will likely succeed, but it can result in arbitrary code execution. Do it only if you got the file from a trusted source.
5285.0s	8681		(2) Alternatively, to load with `weights_only=True` please check the recommended steps in the following error message.
5285.0s	8682		WeightsUnpickler error: Unsupported global: GLOBAL numpy._core.multiarray.scalar was not an allowed global by default. Please use `torch.serialization.add_safe_globals([numpy._core.multiarray.scalar])` or the `torch.serialization.safe_globals([numpy._core.multiarray.scalar])` context manager to allowlist this global if you trust this class/function.
5285.0s	8683	
5285.0s	8684	Check the documentation of torch.load to learn more about types accepted by default with weights_only <url>
5285.0s	8687	[  87.9 د] )
5285.0s	8688	  )
5285.0s	8689	)
5285.0s	8690	2026-11-18 00:29:46 | INFO     | yolox.data.datasets.coco:63 - loading annotations into memory...
5285.0s	8691	2026-11-18 00:29:46 | INFO     | yolox.data.datasets.coco:63 - Done (t=0.01s)
5285.0s	8692	2026-11-18 00:29:46 | INFO     | pycocotools.coco:86 - creating index...
5285.0s	8693	2026-11-18 00:29:46 | INFO     | pycocotools.coco:86 - index created!
5285.0s	8694	2026-11-18 00:29:46 | INFO     | __main__:165 - loading checkpoint from /kaggle/working/yolox_work/out/oscar_bumps/best_ckpt.pth
5285.0s	8695	2026-11-18 00:29:46 | ERROR    | yolox.core.launch:98 - An error has been caught in function 'launch', process 'MainProcess' (154), thread 'MainThread' (137345125786368):
5285.0s	8696	Traceback (most recent call last):
5285.0s	8697	
5285.0s	8698	  File "/kaggle/working/yolox_work/YOLOX/tools/eval.py", line 212, in <module>
5285.0s	8699	    launch(
5285.0s	8700	    └ <function launch at 0x7ce956c0fc40>
5285.0s	8702	> File "/kaggle/working/yolox_work/YOLOX/yolox/core/launch.py", line 98, in launch
5285.0s	8703	    main_func(*args)
5285.0s	8704	    │          └ (╒═══════════════════╤═══════════════════════════════════════════════════════════════════════════════════════════════════════...
5285.0s	8705	    └ <function main at 0x7ce956b59bc0>
5285.0s	8706	
5285.0s	8707	  File "/kaggle/working/yolox_work/YOLOX/tools/eval.py", line 167, in main
5285.0s	8708	    ckpt = torch.load(ckpt_file, map_location=loc)
5285.0s	8709	           │     │    │                       └ 'cuda:0'
5285.0s	8710	           │     │    └ '/kaggle/working/yolox_work/out/oscar_bumps/best_ckpt.pth'
5285.0s	8711	           │     └ <function load at 0x7ce994932020>
5285.0s	8712	           └ <module 'torch' from '/usr/local/lib/python3.13/dist-packages/torch/__init__.py'>
5285.0s	8713	
5285.0s	8714	  File "/usr/local/lib/python3.13/dist-packages/torch/serialization.py", line 1578, in load
5285.0s	8715	    raise pickle.UnpicklingError(_get_wo_message(str(e))) from None
5285.0s	8716	          │      │               └ <function load.<locals>._get_wo_message at 0x7ce8a4e93ba0>
5285.0s	8717	          │      └ <class '_pickle.UnpicklingError'>
5285.0s	8718	          └ <module 'pickle' from '/usr/lib/python3.13/pickle.py'>
5285.0s	8719	
5285.0s	8720	_pickle.UnpicklingError: Weights only load failed. This file can still be loaded, to do so you have two options, [1mdo those steps only if you trust the source of the checkpoint[0m. 
5285.0s	8721		(1) In PyTorch 2.6, we changed the default value of the `weights_only` argument in `torch.load` from `False` to `True`. Re-running `torch.load` with `weights_only` set to `False` will likely succeed, but it can result in arbitrary code execution. Do it only if you got the file from a trusted source.
5285.0s	8722		(2) Alternatively, to load with `weights_only=True` please check the recommended steps in the following error message.
5285.0s	8723		WeightsUnpickler error: Unsupported global: GLOBAL numpy._core.multiarray.scalar was not an allowed global by default. Please use `torch.serialization.add_safe_globals([numpy._core.multiarray.scalar])` or the `torch.serialization.safe_globals([numpy._core.multiarray.scalar])` context manager to allowlist this global if you trust this class/function.
5285.0s	8724	
5285.0s	8725	Check the documentation of torch.load to learn more about types accepted by default with weights_only <url>
5285.0s	8727	[  87.9 د] خلص ✓ — الملفات فى /kaggle/working/oscar_bumps: ['oscar_bumps_yolox_nano.pth', 'model.json', 'eval.txt']
5288.0s	8730	/usr/local/lib/python3.13/dist-packages/mistune.py:435: SyntaxWarning: invalid escape sequence '\|'
5288.0s	8731	  cells[i][c] = re.sub('\\\\\|', '|', cell)
5288.1s	8732	/usr/local/lib/python3.13/dist-packages/nbconvert/filters/filter_links.py:36: SyntaxWarning: invalid escape sequence '\_'
5288.1s	8733	  text = re.sub(r'_', '\_', text) # Escape underscores in display text
5288.9s	8734	[NbConvertApp] Converting notebook __notebook__.ipynb to notebook
5289.3s	8735	[NbConvertApp] Writing 390136 bytes to __notebook__.ipynb
5291.8s	8736	[NbConvertApp] Converting notebook __notebook__.ipynb to html
5292.3s	8737	[NbConvertApp] Writing 676755 bytes to __results__.html
```

(سطور export_onnx.py قبل كده — 5284.2s–5284.4s: `File "/kaggle/working/yolox_work/YOLOX/tools/export_onnx.py", line 79, in main · ckpt = torch.load(ckpt_file, map_location="cpu")` ← نفس الـUnpicklingError.)

## اقتراح للتصليح (لكلود)
قبل eval/export: `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=1` فى ENV (أو patch لـ`torch.load` فى tools/eval.py و tools/export_onnx.py بـ`weights_only=False`) — الملف من تدريبنا نفسه. ممكن يتعمل من best_ckpt.pth الموجود فى Output من غير إعادة تدريب.
