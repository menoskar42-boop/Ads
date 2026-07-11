"""In-browser DICOM viewer rendered through Streamlit."""
from __future__ import annotations

import io

import numpy as np
import streamlit as st
from PIL import Image

CT_PRESETS = {
    "Soft Tissue / الأنسجة الرخوة": (50, 350),
    "Brain / الدماغ": (40, 80),
    "Lung / الرئة": (-600, 1500),
    "Bone / العظام": (400, 1800),
    "Abdomen / البطن": (40, 400),
    "Liver / الكبد": (60, 160),
    "Custom / مخصص": None,
}

MRI_PRESETS = {
    "Default / افتراضي": None,  # auto min-max
    "Custom / مخصص": None,
}


def _apply_window(arr: np.ndarray, center: float, width: float) -> np.ndarray:
    """Map an arbitrary intensity slice into uint8 [0, 255]."""
    lower = center - width / 2.0
    upper = center + width / 2.0
    windowed = np.clip(arr, lower, upper)
    if upper > lower:
        windowed = (windowed - lower) / (upper - lower)
    else:
        windowed = np.zeros_like(windowed)
    return (windowed * 255).astype(np.uint8)


def _auto_window(arr: np.ndarray) -> np.ndarray:
    mn, mx = float(arr.min()), float(arr.max())
    if mx <= mn:
        return np.zeros(arr.shape, dtype=np.uint8)
    return (((arr - mn) / (mx - mn)) * 255).astype(np.uint8)


def _to_pil(arr2d: np.ndarray, *, modality: str, center: float | None,
            width: float | None, zoom: float, pixel_aspect: float) -> Image.Image:
    if modality == "CT" and center is not None and width is not None:
        pixels = _apply_window(arr2d, center, width)
    elif center is not None and width is not None:
        pixels = _apply_window(arr2d, center, width)
    else:
        pixels = _auto_window(arr2d)

    img = Image.fromarray(pixels, mode="L").convert("RGB")
    # Honor anisotropic pixel spacing by stretching width vs height
    base_w, base_h = img.width, img.height
    target_w = int(base_w * zoom)
    target_h = int(base_h * zoom * pixel_aspect)
    if (target_w, target_h) != (base_w, base_h):
        img = img.resize((target_w, target_h), Image.LANCZOS)
    return img


def _parse_pixel_aspect(pixel_spacing: str) -> float:
    """Return row_spacing / column_spacing, or 1.0 if unknown."""
    if not pixel_spacing:
        return 1.0
    # pydicom prints PixelSpacing as "[r, c]" or "r\\c"
    cleaned = (
        pixel_spacing.replace("[", "")
        .replace("]", "")
        .replace("'", "")
        .replace('"', "")
    )
    parts = [p.strip() for p in cleaned.replace("\\", ",").split(",") if p.strip()]
    if len(parts) < 2:
        return 1.0
    try:
        r, c = float(parts[0]), float(parts[1])
        return r / c if c else 1.0
    except ValueError:
        return 1.0


def render_dicom_viewer(volume: np.ndarray, *, modality: str,
                        pixel_spacing: str = "", key_prefix: str = "viewer") -> None:
    """Render slice navigation + windowing UI for a 3D volume."""
    if volume is None or volume.size == 0:
        st.warning("لا توجد بيانات صور للعرض. / No image data to display.")
        return

    num_slices = volume.shape[0]
    pixel_aspect = _parse_pixel_aspect(pixel_spacing)

    main_col, ctrl_col = st.columns([3, 1])

    with ctrl_col:
        st.markdown("**⚙️ التحكم / Controls**")
        if num_slices > 1:
            slice_idx = st.slider(
                "الشريحة / Slice",
                min_value=1,
                max_value=num_slices,
                value=num_slices // 2 + 1,
                key=f"{key_prefix}_slice",
            ) - 1
        else:
            # Single-frame study (e.g. plain radiograph). Streamlit
            # disallows a slider where min == max, so pin to slice 0
            # and skip the widget.
            slice_idx = 0
            st.caption("شريحة واحدة فقط / Single frame")

        presets = CT_PRESETS if modality == "CT" else MRI_PRESETS
        preset_name = st.selectbox(
            "نافذة العرض / Window Preset",
            list(presets.keys()),
            key=f"{key_prefix}_preset",
        )
        preset_val = presets[preset_name]

        if preset_val is None:
            if "Custom" in preset_name:
                if modality == "CT":
                    wc_default, ww_default = 40, 400
                    wc_min, wc_max, ww_max = -1000, 2000, 4000
                else:
                    vol_min = int(volume.min())
                    vol_max = int(volume.max())
                    wc_default = (vol_min + vol_max) // 2
                    ww_default = max(1, vol_max - vol_min)
                    wc_min, wc_max = vol_min, vol_max
                    ww_max = max(1, vol_max - vol_min) * 2
                window_center = st.slider(
                    "مركز / Center", wc_min, wc_max, wc_default,
                    key=f"{key_prefix}_wc",
                )
                window_width = st.slider(
                    "عرض / Width", 1, ww_max, ww_default,
                    key=f"{key_prefix}_ww",
                )
            else:
                window_center = None
                window_width = None
        else:
            window_center, window_width = preset_val
            st.caption(f"WC: {window_center} | WW: {window_width}")

        zoom = st.select_slider(
            "تكبير / Zoom",
            options=[0.5, 0.75, 1.0, 1.25, 1.5, 2.0],
            value=1.0,
            key=f"{key_prefix}_zoom",
        )

        st.markdown("---")
        current = volume[slice_idx]
        st.markdown("**📊 إحصاءات / Stats**")
        st.write(f"الشريحة / Slice: **{slice_idx + 1} / {num_slices}**")
        st.write(f"الأبعاد: **{current.shape[1]} × {current.shape[0]}**")
        label = "HU" if modality == "CT" else "Signal / إشارة"
        st.write(f"أدنى {label}: **{current.min():.0f}**")
        st.write(f"أعلى {label}: **{current.max():.0f}**")
        st.write(f"متوسط {label}: **{current.mean():.1f}**")

    with main_col:
        img = _to_pil(
            current,
            modality=modality,
            center=window_center,
            width=window_width,
            zoom=zoom,
            pixel_aspect=pixel_aspect,
        )
        st.image(
            img,
            use_container_width=True,
            caption=f"شريحة {slice_idx + 1} من {num_slices} | Slice {slice_idx + 1} of {num_slices}",
        )
