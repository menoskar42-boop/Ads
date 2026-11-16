# Frames before the four owner-confirmed speed bumps

The owner identified four real bumps at the crossing times listed in `2026-11-16-road/candidates.csv`. This folder contains five frames per event, sampled at 3.0, 2.0, 1.5, 1.0 and 0.5 seconds before each CSV crossing time. The original video is not included in Git. Frames are rotated as in the prior test and scaled to 720×1280.

A yellow box is drawn only where the band tracker associated a horizontal road-band candidate with the same downward-moving track across the sampled frames. Vehicle detections from the earlier offline test are padded and masked conservatively. The detector uses the documented 45–60% trapezoidal road ROI, horizontal-edge/contrast evidence, and the prior 0.3–38 px/frame downward-track limits at 10 fps. Track association allows a single missing 0.5-second sample; that image is still marked `not tracked`. A frame outside the selected track is marked `not tracked`; no box is guessed. These are review aids, not a safety detector.

## Earliest tracked sample per bump

The row is measured in the final 720×1280 image from the top edge. “Earliest” means the earliest of the five requested sample offsets where the associated track was present.

| Bump | Crossing (CSV) | Earliest tracked sample | Band center row | Image height | Tracked samples |
|---|---:|---:|---:|---:|
| 07-12 | 07:11.9 (`431.86s`) | 2.0s before | 714px (55.8%) | 1280px | 4/5 |
| 08-15 | 08:14.8 (`494.78s`) | 2.0s before | 590px (46.1%) | 1280px | 4/5 |
| 09-24 | 09:24.3 (`564.31s`) | 3.0s before | 608px (47.5%) | 1280px | 4/5 |
| 09-37 | 09:37.2 (`577.20s`) | 2.0s before | 594px (46.4%) | 1280px | 4/5 |

## Image naming

`bump-MM-SS_minus-X.Xs.jpg` identifies the crossing event and the number of seconds before it. Every image includes its capture time (`mm:ss.s`) and offset. All images are under 150 KB.
