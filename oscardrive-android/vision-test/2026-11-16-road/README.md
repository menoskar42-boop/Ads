# Road-surface bump vision test — 2026-11-16

## Method

- Input: owner-shared `IMG_9425.MOV`, processed offline from `/tmp/roadtest`; the source video is not included in Git. It is 674.91 seconds long. FFmpeg auto-rotated the portrait video and extracted 6749 frames at **10 fps**, 640 pixels wide (640×1138).
- Classical computer vision (OpenCV): a trapezoidal road ROI from 45% to 62% of image height, widening from 40% of image width at the top to 76% at the bottom. The hood line is estimated at 60% image height. The YOLOX-Nano detections are used only to mask vehicles; no training or class-based speed-bump detection is used.
- Horizontal band evidence: Sobel vertical gradients for broad transverse edges, paired edges 4–36 pixels apart, and broad dark-line contrast for shadow-like bands. Candidate tracks are associated across frames only when they move downward 0.3–38 pixels per frame.
- Acceptance: at least 5 tracked frames, at least 78% downward steps, median downward speed 0.3–35 pixels/frame, and crossing the estimated hood line. The output time is linearly interpolated when the track reaches 60% image height.
- Score is a **0–100 screening heuristic, not a probability**: mean band-width ratio, band evidence strength, track length (capped at 20 frames), and downward-step consistency. Width ratio is the fraction of visible lane samples supporting the band.
- Candidate times (mm:ss): **00:26, 01:38, 02:45, 02:52, 04:44, 04:57, 05:49, 05:54, 06:08, 06:12, 06:16, 06:23, 06:28, 06:37, 06:42, 07:12, 07:31, 07:48, 07:59, 08:15, 08:48, 08:54, 09:06, 09:12, 09:24, 09:37, 09:40, 10:14, 10:32, 10:35, 10:50, 11:13**.

## Vehicle masking model

- Megvii **YOLOX-Nano** official ONNX export, pretrained on COCO; used only to mask cars, trucks, buses, motorcycles and bicycles in the road ROI.
- Apache License 2.0. Model reference: <https://github.com/Megvii-BaseDetection/YOLOX>; ONNX weights: <https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx>.
- No road signs were classified. The model has no traffic-sign category; this experiment does not attempt sign reading.

## Own-camera movement check

For each crossing time, phase correlation estimates vertical global image shift on an upper road/scene region. A supporting “yes” is recorded if a valid shift within the following 0–1.5 seconds exceeds the local 3-second pre-event median by 3 median absolute deviations, with a 2.5-pixel minimum threshold. This is approximate: forward motion and parallax also move image content. Values are in `candidates.csv`.

## Results

- Frames analyzed: 6749; YOLOX mask-only inference speed: 102.33 frames/s on this CPU (excludes frame decode and OpenCV band analysis).
- Candidate bands: 32. Per-candidate width, edge/shadow evidence, track length, own-camera jump yes/no, and shift are in `candidates.csv`.
- Annotated frames: 30, each at most 120 KB. To stay within the 30-image limit, these show 2–3 pre-crossing frames for the ten highest-scoring candidates; lower-scoring candidates remain listed in `candidates.csv` without images.

## Limitations

The ROI and hood-line position are manually estimated from this clip. Shadows, road seams, crosswalks, lane markings, compression artifacts and perspective can imitate a hump; a transverse feature moving down the frame is not enough to prove it is a speed bump. Detection/masking errors, moving traffic, phase-correlation parallax and 10 fps sampling can also create misses or false candidates. Painted-strip detection is approximate rather than a trained color classifier. These timestamps require human review and should not be used for vehicle control or safety decisions.
