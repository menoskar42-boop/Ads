# Oscar Drive road-surface dataset research

Research checked on 2026-11-16. This is a dataset/licensing survey, not a trained detector. “Commercially reusable” below means the source explicitly displays a permissive license; it does not replace checking attribution, provenance, or third-party rights before product release.

## Shortlist and downloads

The three selected archives were downloaded to `/tmp/road-bump-datasets/` and are not tracked by Git. The no-key fetch script is `fetch_datasets.py`; by default it saves future downloads under `/tmp/oscardrive-road-datasets/`.

| Dataset | Images / classes | Annotation format | Viewpoint | Region | Exact displayed license | Status and notes |
|---|---:|---|---|---|---|---|
| [A Real-World Road Dataset For Manhole and Speed Breaker Detection in Bangladesh](https://data.mendeley.com/datasets/7zzcmv2wz7/1) | 1,425 total; 160 in `Speed_Breaker` (archive count); speed breakers and four manhole categories | Class-folder labels only; no bounding boxes reported | Real-world road photos; exact camera viewpoint not stated | Bangladesh | **CC BY 4.0** | **Selected.** Most relevant local road context. Classification examples only; box annotation is needed for object detection. |
| [Marked Speed Bump/ Speed Breaker Dataset (India)](https://data.mendeley.com/datasets/bvpt9xdjz8/1) | Dataset page says 969; archive contains 965 JPG files | Cropped images; no detection boxes reported | Cropped, marked bump views; not full dashcam scenes | India | **CC BY 4.0** | **Selected.** Useful appearance examples, but marked/cropped and not ready for detector fine-tuning. The page/archive count differs by four. |
| [An Annotated Water-Filled, and Dry Potholes Dataset](https://data.mendeley.com/datasets/tp95cdvgm8/1) | 713 images in archive; pothole | YOLO TXT and Pascal VOC XML | Includes front/rear dashcam video; dataset also has still photos | Capture region not specified | **CC BY 4.0** | **Selected** as the second-class pothole source; has object annotations and dashcam material. |

## Candidate survey

Counts below are the dataset-page or archive totals as identified; a page total is not necessarily the count for each class. “Usable” refers to the displayed license, not annotation suitability.

| Candidate | Images | Format / classes | Camera / region | Exact license shown | Commercial use |
|---|---:|---|---|---|---|
| [Road Safety AI - Rumble Strip, Speed Brakers](https://universe.roboflow.com/guard-rails/road-safety-ai-rumble-strip-speed-brakers) | 1,246 | Object detection; `Rumble Strip`, `Speed-Bump` | Viewpoint and region not specified | **CC BY 4.0** | Yes, as declared. Roboflow export requires a free account/API key; not embedded or accessed here. |
| [Speedbumps Detection](https://universe.roboflow.com/speedbumps-detection-using-yolov8/speedbumps-detection/dataset/3) | 1,190 | Object detection; speed bumps | Viewpoint and region not specified | **CC BY 4.0** | Yes, as declared. |
| [detecting speed bumps, v4](https://universe.roboflow.com/alia-khalifa/detecting-speed-bumps/dataset/4) | 247 | Object detection; marked speed bumps | Viewpoint and region not specified | **CC BY 4.0** | Yes, as declared; marked-only domain limitation. |
| [Marked Speed Bump/ Speed Breaker Dataset (India)](https://data.mendeley.com/datasets/bvpt9xdjz8/1) | 969 stated; 965 JPGs in downloaded archive | Cropped images; no box format stated | Cropped marked bumps; India | **CC BY 4.0** | Yes; image count discrepancy noted above. |
| [A Real-World Road Dataset For Manhole and Speed Breaker Detection in Bangladesh](https://data.mendeley.com/datasets/7zzcmv2wz7/1) | 1,425 total; 160 speed-breaker images | Class folders; not box annotations | Road scenes, viewpoint not specified; Bangladesh | **CC BY 4.0** | Yes. |
| [Dataset of Unpaved and Paved Road Surface with Seasons](https://data.mendeley.com/datasets/tj2m7zz4rg/1) | 4,242 images + 13 videos | Road-surface categories including potholes, speed breakers and barriers; no box format confirmed | Still images top/side; videos side-view; phone rear camera; Nashik and Mumbai, India | **CC BY 4.0** | Yes. Large archive (5.07 GB); not selected for download. |
| [BDRS2025: Road Surface Image and Video Datasets from Bangladesh](https://data.mendeley.com/datasets/n6cvjnx3b6/1) | 2,685 images + 147 videos; five categories, about 500 images/class on average | Labeled categories; exact detection annotation export not specified on the landing page | Smartphone road environments; Dhaka, Chandpur, Lakshmipur, Bangladesh | **CC BY 4.0** | Yes; promising but 9.92 GB and annotation packaging needs inspection. |
| [BDRoad-Sense](https://data.mendeley.com/datasets/z3nx8n396g/3) | 9,107 processed images (6,350 originals before augmentation) | Image-level class labels/metadata CSV; classes include `Speed Breaker`, road damage, normal road, manhole | Smartphone images; Sylhet, Bangladesh | **CC BY 4.0** | Yes, but classification data, not documented bounding boxes. |
| [An Annotated Water-Filled, and Dry Potholes Dataset](https://data.mendeley.com/datasets/tp95cdvgm8/1) | 713 archive images | YOLO TXT + Pascal VOC XML; pothole | Front/rear dashcam video included; capture region not stated | **CC BY 4.0** | Yes; selected pothole class dataset. |
| [road_anomaly_ds (Kaggle)](https://www.kaggle.com/datasets/david2do/road-anomaly-ds/data) | 6,409 | YOLO TXT; `Pothole`, `Speedbump`, `Crack` | Aggregated sources; viewpoint/region not consistently stated | **MIT** | Yes, as declared. Kaggle account/API credentials may be needed to download; not used by the fetch script. |
| [speedbump_dataset_v3](https://universe.roboflow.com/roadmodels/speedbump_dataset_v3/dataset/1) | 300 | Object detection page; class details not verified | Not specified | **No license displayed on the dataset page** | **No — unknown/missing license.** |
| [speed bumps (yolo-quemh)](https://universe.roboflow.com/yolo-quemh/speed-bumps-kuxeu-0bhcj) | 2,307 | Detection page lists classes `object`, `0`, `1`; semantics unclear | Not specified | **Public Domain** | License is permissive as displayed, but not recommended: unclear class meanings and provenance require validation. |

### Image totals by class

- **Speed bump / breaker examples in the three downloaded archives:** 1,125 images by archive count (160 Bangladesh + 965 India). The India landing page reports 969; using the actual archive’s 965 JPGs avoids overstating the downloaded total. These are commercially licensed images, but **0 of these 1,125 are confirmed bounding-box annotated** in their published dataset descriptions. They must be labeled before detector training.
- **Pothole:** 713 images in the downloaded Mendeley archive, with YOLO and VOC annotations.
- Other commercially licensed detection candidates exist (including the 1,246-image Roboflow set and 6,409-image Kaggle set); class-specific image totals are not published separately, so they are not added to the counts above. Roboflow requires an account/API key for export; Kaggle may require account credentials.
- No confirmed CC BY-NC or research-only speed-bump/pothole candidate was found in the reviewed results. Missing/unknown-license data is explicitly marked not usable above; do not assume “publicly viewable” means reusable.

## Sample images in this repository

`samples/` contains 18 resized JPEG examples (six per selected dataset), each under 150 KB. They are provided under the source dataset’s displayed **CC BY 4.0** license; attribution and license links:

- `bangladesh-speed-breaker-*.jpg`: derived from the `Speed_Breaker` folder of [Mendeley dataset 7zzcmv2wz7](https://data.mendeley.com/datasets/7zzcmv2wz7/1), CC BY 4.0. Source files: `Speed_breaker_(01).jpg`, `(10).jpg`, `(100).jpg`, `(101).jpg`, `(102).jpg`, `(103).jpg`.
- `india-marked-speed-breaker-*.jpg`: derived from the `marked speed breakers self` folder of [Mendeley dataset bvpt9xdjz8](https://data.mendeley.com/datasets/bvpt9xdjz8/1), CC BY 4.0. Source files: `1001.jpg`–`1006.jpg`.
- `mendeley-pothole-*.jpg`: derived from the `IMG` folder of [Mendeley dataset tp95cdvgm8](https://data.mendeley.com/datasets/tp95cdvgm8/1), CC BY 4.0. Source files: `Pothole-001.jpg`–`Pothole-006.jpg`.

The samples are resized/compressed previews, not training annotations. Preserve source attribution and license when redistributing.

## Android detector and training estimate

**Recommendation: NanoDet-Plus**, licensed **Apache-2.0** in its upstream repository. It is explicitly designed for mobile inference, has an Android ncnn demo and lightweight checkpoints. Alternative: **YOLOX-Nano**, also **Apache-2.0**, with documented custom-dataset training and ONNX/ncnn deployment. **EfficientDet-Lite via TensorFlow Lite Model Maker** is a viable Apache-2.0 ecosystem alternative for TFLite; use it if the Android app is already centered on TFLite. Check the license of every starting checkpoint and conversion/runtime dependency separately. Do **not** use Ultralytics YOLO (AGPL), per project requirement.

Approximate planning times, not measured in this project: fine-tuning a Nano-sized model for 30–50 epochs on about 1,000–2,000 labeled 416px images may take **roughly 2–8 hours on a typical CPU** and **about 15–90 minutes on a free Colab/Kaggle GPU**. Actual time varies substantially with CPU/GPU allocation, batch size, image decode speed, augmentation, and platform availability. The 6,409-image Kaggle set may take multiple GPU hours. For this task the speed-bump sets still need bounding-box labels first; that annotation time is not included.

References:

- [NanoDet-Plus source and license](https://github.com/RangiLyu/nanodet)
- [YOLOX source and license](https://github.com/Megvii-BaseDetection/YOLOX)
- [YOLOX custom-data training guide](https://yolox.readthedocs.io/en/latest/train_custom_data.html)
- [TensorFlow Lite Model Maker object-detection tutorial](https://ai.google.dev/edge/litert/libraries/modify)
- [Apache License 2.0 text](https://www.apache.org/licenses/LICENSE-2.0)
