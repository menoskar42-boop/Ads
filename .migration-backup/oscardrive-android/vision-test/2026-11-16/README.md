# Oscar Drive offline road-video vision test — 2026-11-16

## Scope and inputs

- Owner-provided Google Drive clip `IMG_9425.MOV`, downloaded by its shared file ID to `/tmp/roadtest`; original video is not included in this repository.
- Source duration: 674.50 s; original frame metadata is 1920×1080 at 30 fps with portrait rotation. FFmpeg auto-rotated the extracted frames to 640×1138; 1350 frames were sampled at 2 fps.
- This is an offline experiment, not a validated road-safety detector or proof that a bump exists. Candidate events require visual review.

## Detector and license

- **YOLOX-Nano**, official Megvii-BaseDetection ONNX export, input 416×416, COCO-pretrained, CPU ONNX Runtime.
- Repository/model reference: <https://github.com/Megvii-BaseDetection/YOLOX> and official export <https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx>.
- Project license: **Apache License 2.0** (<https://github.com/Megvii-BaseDetection/YOLOX/blob/main/LICENSE>); not Ultralytics.
- Model file SHA-256: `c789161ed43c8269fcd4e67c67eeeb4e80c622da2eb296a20bc6007bd18a0b7d`.
- COCO classes recorded: person, bicycle, car, motorcycle, bus and truck. COCO has no traffic-sign class, so speed-bump sign frames were not detected or flagged.
- Confidence threshold 0.25; class-wise NMS IoU threshold 0.45. Counts below are detection rows, not unique tracked objects.

## Results

- Frames processed: 1350; detection rows: 5722.
- Model/inference pipeline speed on this CPU: **108.23 frames/s** (per-frame preprocessing and inference; excludes video decode, global-motion estimation, output writing and warm-up).
- Detection rows by class: car: 3959, truck: 507, bus: 185, motorcycle: 73, bicycle: 63, person: 935.
- Bump-like candidates after global vertical-shift subtraction: **6**; trough times: 417.0s, 418.5s, 421.0s, 423.0s, 517.5s, 519.5s.
- Rule: track the largest central/lower vehicle box, estimate background vertical image shift by phase correlation on the road/scene region between adjacent frames, subtract the accumulated shift from the tracked box bottom edge, and look for a bottom-edge local minimum followed by a return peak 0.5–1.5 s later with amplitude >3% of mean box height. `bump-candidates.csv` also records the vehicle-box height change as a distance/scale cue.
- Annotated frames: 18; each JPEG is at most 120 KB, with three frames around each screened candidate.

## Files

- `detections.csv`: one row per detected object, with frame time, class, confidence and pixel box `(x1,y1,x2,y2)` on the 640×1138 frame.
- `bump-candidates.csv`: screened oscillation events and numerical evidence.
- `annotated-*.jpg`: compressed detections around screened events (or sample frames if there are none).

## Limitations

The 2 fps sampling is coarse and may miss short suspension motion. Phase correlation on a forward-moving, perspective scene is only an approximate global-motion correction and can mistake road texture/perspective changes for camera movement. A vehicle box can grow because it approaches, not only because it brakes at a bump. The selected “largest central/lower vehicle” is a heuristic and may switch between objects. Therefore these timestamps are **review candidates only**; no sign recognition or independent confirmation is claimed.
