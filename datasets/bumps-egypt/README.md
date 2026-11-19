# Curated road speed-bump and pothole images

This is a small, visually screened subset for road-anomaly model training. It contains **14 speed-bump images** and **28 pothole images** (42 total). Images were resized proportionally so the longest side is at most 1280 px and re-encoded as JPEG quality 80. No image with a clearly readable face or license plate was retained. The selected speed-bump photos were visually checked to show an actual raised hump, not just a warning sign or ordinary road marking.

## Sources and licenses

- **Speed bumps (14 images):** *Speed Hump/Bump Dataset*, V S K P Varma, Mendeley Data. Country is not specified by the dataset record. No labels are supplied for the selected photos. License: **CC BY 4.0**. Source: https://data.mendeley.com/datasets/xt5bjdhy5g/1
- **Potholes (28 images):** *Moroccan Road Damages Dataset*, Soufiane Lamchoudi, Mendeley Data. Country: Morocco. Original YOLO `.txt` label contents were copied unchanged into `labels/`; images have matching basenames. License: **CC BY 4.0**. Source: https://data.mendeley.com/datasets/cvpyh24mhk/1

`SOURCES.csv` records the source, creator, license, country when stated, and label availability for each image. The source records identify CC BY 4.0; attribution should be retained when redistributing this subset. This collection contains no confirmed Egypt-origin photos because no suitable openly licensed Egyptian speed-bump images were found in the sources checked.
