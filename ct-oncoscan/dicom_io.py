"""DICOM ingestion, detection, and decoding helpers.

Three responsibilities:

1. Walk uploaded files / archives (.zip, .rar) and yield every member
   that looks like DICOM, recursively across nested folders.
2. Decide whether arbitrary bytes are a DICOM file — by extension,
   then by the DICM magic at offset 128, then by a real pydicom
   probe with structural-tag verification.
3. Decode DICOM bytes into a 2D float32 array, with HU rescale for
   CT and a no-op for MRI (MRI signal isn't HU).
"""
from __future__ import annotations

import io
import os
import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from typing import Iterable

import numpy as np
import pydicom

DICOM_EXTENSIONS = (".dcm", ".dicom", ".ima")
ARCHIVE_EXTENSIONS = (".zip", ".rar")
TCIA_MANIFEST_EXTENSION = ".tcia"
# Multi-part archive naming patterns (most permissive to least):
#   foo.part1.rar / foo.part01.rar  → modern WinRAR (RAR5)
#   foo.rar / foo.r00 / foo.r01     → legacy WinRAR
#   foo.zip.001 / foo.zip.002       → 7-Zip plain split
#   foo.001 / foo.002               → bare numeric split
import re as _re
_MULTIPART_RAR_RE = _re.compile(r"^(?P<base>.+)\.part(?P<index>\d+)\.rar$", _re.IGNORECASE)
_LEGACY_RAR_RE = _re.compile(r"^(?P<base>.+)\.r(?P<index>\d{2})$", _re.IGNORECASE)
_NUMERIC_SPLIT_RE = _re.compile(r"^(?P<base>.+)\.(?P<index>\d{3})$")
del _re
# Standard raster image formats — doctors often have screenshots
# exported from a PACS viewer or photos of a film, not DICOM. The
# vision model reads these directly; no DICOM machinery needed.
IMAGE_EXTENSIONS = (".bmp", ".png", ".jpg", ".jpeg", ".tif", ".tiff")

# Only trust download URLs pointing at TCIA's own domain. Refuses to
# follow an arbitrary URL embedded in a malicious manifest.
_TCIA_TRUSTED_HOSTS = (
    "cancerimagingarchive.net",
    "tcia.at",
)

_DICOM_TAG_PROBES = ("SOPClassUID", "Modality", "Rows", "PixelData")


def _infer_laterality(*sources: str) -> str:
    """Pick out R / L from free-text fields like SeriesDescription
    when the DICOM Laterality tag is empty.

    Scanners frequently encode side as '(Right)', '(R)', 'RT KNEE',
    'Left shoulder', etc. in the description rather than in the
    dedicated tag, leaving Laterality unset.
    """
    import re
    for src in sources:
        if not src:
            continue
        s = src.upper()
        # Whole-word matches first to avoid grabbing 'L' inside 'PELVIS'
        if re.search(r"\bRIGHT\b|\bRT\b|\(R\)", s):
            return "R"
        if re.search(r"\bLEFT\b|\bLT\b|\(L\)", s):
            return "L"
    return ""


def _compute_plane(image_orientation) -> str:
    """Return 'axial', 'coronal', 'sagittal', 'oblique', or 'unknown'.

    Derived from DICOM ImageOrientationPatient (0020,0037) — six
    direction cosines [row_x, row_y, row_z, col_x, col_y, col_z].
    The slice normal is row × col; the largest absolute component
    of the normal tells us which anatomical axis the slices stack
    along.
    """
    if image_orientation is None:
        return "unknown"
    try:
        vec = [float(v) for v in image_orientation]
    except (TypeError, ValueError):
        return "unknown"
    if len(vec) < 6:
        return "unknown"
    row = np.array(vec[:3], dtype=np.float64)
    col = np.array(vec[3:6], dtype=np.float64)
    normal = np.cross(row, col)
    abs_n = np.abs(normal)
    if abs_n.sum() == 0:
        return "unknown"
    axis = int(np.argmax(abs_n))
    dominant = abs_n[axis]
    # If the dominant component isn't clearly larger, the slice is
    # truly oblique and we shouldn't pretend it's a cardinal plane.
    if dominant < 0.85 * abs_n.sum():
        return "oblique"
    return {0: "sagittal", 1: "coronal", 2: "axial"}[axis]


class RarSupportMissing(RuntimeError):
    """Raised when a .rar upload arrives but rarfile isn't installed."""


class DiscoveredFile:
    """A DICOM payload ready to be persisted.

    Holds EITHER raw bytes (small direct uploads, archive members
    loaded eagerly) OR a path on disk (large extractions kept on
    disk until persist time). ``.data`` returns bytes either way.

    The disk-path variant is what saves us on big CD-ROM dumps:
    instead of holding 60 MB of 990 file buffers in RAM until the
    upload is persisted, we keep the extracted files on disk and
    read each one as the persistence step asks for it. Replit's
    /tmp recycles on container restart so the disk footprint is
    self-limiting.
    """

    __slots__ = ("name", "_data", "_path")

    def __init__(self, name: str, *, data: bytes | None = None, path: str | None = None):
        self.name = name
        self._data = data
        self._path = path

    @property
    def data(self) -> bytes:
        if self._data is not None:
            return self._data
        if self._path:
            try:
                with open(self._path, "rb") as fh:
                    return fh.read()
            except OSError:
                return b""
        return b""

    def __repr__(self) -> str:
        if self._path:
            return f"DiscoveredFile(name={self.name!r}, path={self._path!r})"
        if self._data is not None:
            return f"DiscoveredFile(name={self.name!r}, bytes={len(self._data)})"
        return f"DiscoveredFile(name={self.name!r}, empty)"


def looks_like_dicom(name: str, data: bytes) -> bool:
    """Heuristic DICOM detector with three independent checks."""
    if name.lower().endswith(DICOM_EXTENSIONS):
        return True
    if len(data) >= 132 and data[128:132] == b"DICM":
        return True
    # Last-resort probe: pydicom can parse headerless legacy DICOMs
    # with force=True, but force=True also happily parses random
    # bytes. Verify at least one structural tag landed.
    try:
        ds = pydicom.dcmread(
            io.BytesIO(data),
            stop_before_pixels=True,
            force=True,
        )
        return any(tag in ds for tag in _DICOM_TAG_PROBES)
    except Exception:
        return False


def _is_raster_image(data: bytes) -> bool:
    """Detect a non-DICOM raster image by magic bytes (BMP/PNG/JPEG/TIFF)."""
    if len(data) < 8:
        return False
    return (
        data[:2] == b"BM"                       # BMP
        or data[:8] == b"\x89PNG\r\n\x1a\n"     # PNG
        or data[:3] == b"\xff\xd8\xff"          # JPEG
        or data[:4] in (b"II*\x00", b"MM\x00*") # TIFF (little / big endian)
    )


def looks_like_radiology_input(name: str, data: bytes) -> bool:
    """DICOM OR a standard raster image (BMP/PNG/JPG/TIFF/JPEG).

    The vision model reads any of these. We accept screenshots and
    exported images from PACS workstations as first-class uploads
    when the doctor doesn't have the raw DICOM at hand.
    """
    if looks_like_dicom(name, data):
        return True
    if name.lower().endswith(IMAGE_EXTENSIONS):
        return True
    return _is_raster_image(data)


# Cached path of the working RAR extraction tool. The first call to
# _ensure_rarfile_unrar_tool() detects what's available on the host and
# stamps the rarfile module's UNRAR_TOOL accordingly; subsequent calls
# short-circuit. Replit Deployments rebuild from git and don't carry
# over any bin/ wrappers the workspace's Agent may have written, so we
# resolve a tool from scratch on every container start.
_RARFILE_TOOL_READY = False


def _ensure_rarfile_unrar_tool(rarfile_mod) -> None:
    """Point rarfile.UNRAR_TOOL at a binary that actually exists.

    Order of preference:
      1. ``unrar`` on PATH (the canonical tool — Replit dev workspace).
      2. ``unar`` on PATH (the Nix ``unar`` package — what Replit
         Deployments end up with after .replit declares
         ``packages = [..., "unar", "unrar", ...]``). ``unar``'s CLI is
         different, so we write a tiny shell shim that translates the
         subset of ``unrar`` invocations rarfile uses into ``unar``
         arguments and point UNRAR_TOOL at the shim.
      3. ``bsdtar`` / ``7z`` as last-resort fallbacks via rarfile's
         own alternate-tool config.
    """
    global _RARFILE_TOOL_READY
    if _RARFILE_TOOL_READY:
        return

    if shutil.which("unrar"):
        _RARFILE_TOOL_READY = True
        return

    unar_path = shutil.which("unar")
    if unar_path:
        # Write the shim into a stable tempdir path so subsequent
        # rarfile calls in the same process reuse it.
        shim_dir = os.path.join(tempfile.gettempdir(), "ctos_rar_shim")
        os.makedirs(shim_dir, exist_ok=True)
        shim_path = os.path.join(shim_dir, "unrar")
        if not os.path.isfile(shim_path):
            # rarfile invokes the tool roughly as:
            #   unrar x -y -p- -idq -- <archive> <destdir>/
            #   unrar l -y -- <archive>
            # The shim translates these into the equivalent unar /
            # lsar commands. unar extracts into the current working
            # directory by default; we honour the trailing destdir
            # argument when present.
            shim_src = (
                "#!/usr/bin/env bash\n"
                "set -e\n"
                f"UNAR={unar_path!r}\n"
                f"LSAR={shutil.which('lsar') or (unar_path + 'lsar')!r}\n"
                "cmd=\"$1\"; shift || true\n"
                "args=()\n"
                "archive=\"\"\n"
                "dest=\"\"\n"
                "while [[ $# -gt 0 ]]; do\n"
                "  case \"$1\" in\n"
                "    -y|-idq|-p-|--) shift ;;\n"
                "    -*) shift ;;\n"
                "    *)\n"
                "      if [[ -z \"$archive\" ]]; then archive=\"$1\"; "
                "else dest=\"$1\"; fi\n"
                "      shift ;;\n"
                "  esac\n"
                "done\n"
                "case \"$cmd\" in\n"
                "  x|e) exec \"$UNAR\" -force-overwrite -quiet "
                "${dest:+-output-directory \"$dest\"} \"$archive\" ;;\n"
                "  l|v|lt|vt) exec \"$LSAR\" \"$archive\" ;;\n"
                "  *) echo \"unrar shim: unsupported command $cmd\" >&2; "
                "exit 2 ;;\n"
                "esac\n"
            )
            with open(shim_path, "w", encoding="utf-8") as fh:
                fh.write(shim_src)
            os.chmod(shim_path, 0o755)
        rarfile_mod.UNRAR_TOOL = shim_path
        _RARFILE_TOOL_READY = True
        return

    # Last resort: let rarfile try bsdtar / 7z if they're on PATH. The
    # library's own fallback chain handles this once UNRAR_TOOL fails.
    for alt in ("bsdtar", "7z"):
        if shutil.which(alt):
            attr = "BSDTAR_TOOL" if alt == "bsdtar" else "SEVENZIP_TOOL"
            if hasattr(rarfile_mod, attr):
                setattr(rarfile_mod, attr, alt)
    _RARFILE_TOOL_READY = True


def _iter_archive_members(file_obj) -> Iterable[tuple[str, str]]:
    """Yield (member_name, on-disk path) for every non-directory member.

    Both .zip and .rar branches now extract to a long-lived tempdir
    and yield disk paths rather than the bytes — the caller wraps them
    in path-only DiscoveredFile entries, so the bytes are read lazily
    once per slice during persistence instead of all at once in RAM.
    A 91 MB / 598-file RAR used to peak around 600 MB of resident
    memory (raw + intermediate file + members list + DiscoveredFile.data
    copies); the disk-path variant tops out near the size of the
    original archive.
    """
    name = file_obj.name.lower()
    extract_dir = tempfile.mkdtemp(prefix="ctos_archive_")

    if name.endswith(".zip"):
        raw = file_obj.read()
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            del raw  # zipfile copies what it needs internally
            for info in zf.infolist():
                if info.is_dir():
                    continue
                out_path = os.path.join(
                    extract_dir, os.path.basename(info.filename) or f"m{info.CRC:x}"
                )
                try:
                    with zf.open(info) as src, open(out_path, "wb") as dst:
                        shutil.copyfileobj(src, dst, length=1024 * 1024)
                    yield info.filename, out_path
                except Exception:
                    continue
        return

    # RAR — import lazily so the app boots even when rarfile isn't
    # installed on the deploy target. Only fails when a .rar actually
    # arrives.
    try:
        import rarfile
        _UNRAR_WRAPPER = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "bin", "unrar"
        )
        if os.path.isfile(_UNRAR_WRAPPER):
            rarfile.UNRAR_TOOL = _UNRAR_WRAPPER
    except ImportError as exc:
        raise RarSupportMissing(
            "Python package `rarfile` is not installed on the server. "
            "Add it to dependencies and redeploy."
        ) from exc

    _ensure_rarfile_unrar_tool(rarfile)

    # Stream the upload to a tempfile in chunks so we don't ever hold
    # the full archive bytes in RAM alongside the extraction.
    with tempfile.NamedTemporaryFile(suffix=".rar", delete=False) as tmp:
        while True:
            block = file_obj.read(1024 * 1024)
            if not block:
                break
            tmp.write(block)
        archive_path = tmp.name
    try:
        with rarfile.RarFile(archive_path) as rf:
            rf.extractall(path=extract_dir)
            for info in rf.infolist():
                if info.is_dir():
                    continue
                disk_path = os.path.join(extract_dir, info.filename)
                if os.path.isfile(disk_path):
                    yield info.filename, disk_path
    finally:
        try:
            os.unlink(archive_path)
        except OSError:
            pass
        # NOTE: extract_dir is intentionally NOT deleted here — the
        # yielded paths are still referenced by DiscoveredFile.path
        # downstream. Replit recycles /tmp on container restart so the
        # disk footprint is self-limiting.


def _iter_multipart_rar_paths(parts: list) -> Iterable[tuple[str, str]]:
    """Yield (member_name, disk_path) for every member of a multi-part
    RAR set, leaving the extracted files on disk.

    Memory-efficient: previously we read every extracted member back
    into RAM (~60 MB for a 990-file CD-ROM dump). The caller would
    then keep references in `discovered`, eventually pushing the
    Replit container over its memory limit and producing an HTTP 500.

    Now we extract once with `extractall`, leave the files on /tmp,
    and yield paths. DiscoveredFile lazy-reads each file from disk
    only at persist time, which means the persist step holds at
    most one slice's bytes in RAM at a time.

    Replit /tmp is wiped on container restart, so the disk footprint
    is self-limiting; we don't explicitly clean up extract_dir.
    """
    try:
        import rarfile
        _UNRAR_WRAPPER = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "bin", "unrar"
        )
        if os.path.isfile(_UNRAR_WRAPPER):
            rarfile.UNRAR_TOOL = _UNRAR_WRAPPER
    except ImportError as exc:
        raise RarSupportMissing(
            "Python package `rarfile` is not installed on the server. "
            "Add it to dependencies and redeploy."
        ) from exc

    _ensure_rarfile_unrar_tool(rarfile)

    def _idx(p):
        m = _MULTIPART_RAR_RE.match(p.name)
        return int(m.group("index")) if m else 0

    parts_sorted = sorted(parts, key=_idx)
    if not parts_sorted:
        return

    holding_dir = tempfile.mkdtemp(prefix="multirar_")
    extract_dir = tempfile.mkdtemp(prefix="rarx_")
    first_path = None
    try:
        for p in parts_sorted:
            disk_path = os.path.join(holding_dir, os.path.basename(p.name))
            with open(disk_path, "wb") as fh:
                fh.write(p.read())
            if first_path is None:
                first_path = disk_path

        with rarfile.RarFile(first_path) as rf:
            rf.extractall(path=extract_dir)
            for info in rf.infolist():
                if info.is_dir():
                    continue
                src = os.path.join(extract_dir, info.filename)
                yield info.filename, src
    finally:
        # Holding dir (raw RAR parts) is no longer needed once
        # extraction is done; the extracted files in extract_dir
        # stay alive for the persist step.
        shutil.rmtree(holding_dir, ignore_errors=True)


def _group_multipart_rars(uploaded_files) -> tuple[list, dict[str, list]]:
    """Separate standalone uploads from multi-part RAR sets.

    Returns (standalone_files, groups) where groups maps the archive
    base name to its list of .partN.rar uploads.
    """
    standalone: list = []
    groups: dict[str, list] = {}
    for f in uploaded_files:
        m = _MULTIPART_RAR_RE.match(f.name)
        if m:
            groups.setdefault(m.group("base"), []).append(f)
        else:
            standalone.append(f)
    return standalone, groups


def discover_dicom_files(
    uploaded_files,
    tcia_progress=None,
) -> tuple[list[DiscoveredFile], list[str], list[str]]:
    """Expand each upload into DiscoveredFile entries.

    Returns (files, info_messages, error_messages).
    Streamlit's UploadedFile is duck-typed: anything with .name and
    .read() works.

    `tcia_progress` is an optional callback for the UI to surface
    download progress while a .tcia manifest's series are being pulled
    from the TCIA servers.
    """
    discovered: list[DiscoveredFile] = []
    info: list[str] = []
    errors: list[str] = []

    # Shared on-disk staging area for standalone uploads: each file is
    # written here once and DiscoveredFile keeps only the path, so the
    # caller can stream-read on demand instead of holding 70 MB of
    # DICOM bytes in RAM at the same time.
    standalone_tmpdir = tempfile.mkdtemp(prefix="ctos_upload_")

    # Group multi-part RAR uploads (foo.part1.rar + foo.part2.rar + ...)
    # so the gateway-friendly chunks the doctor split with WinRAR/7-Zip
    # get reassembled before extraction.
    standalone_files, multipart_groups = _group_multipart_rars(uploaded_files)

    for base, parts in multipart_groups.items():
        info.append(
            f"🧩 إعادة تجميع {len(parts)} أجزاء RAR لـ '{base}.rar' / "
            f"Reassembling {len(parts)} parts of '{base}.rar'…"
        )
        try:
            # Memory-efficient path: collect disk paths, do filtering
            # by reading a small header from each (not the full file).
            member_paths = list(_iter_multipart_rar_paths(parts))
        except RarSupportMissing as e:
            errors.append(
                f"⚠️ {str(e)} / حزمة `rarfile` غير مثبتة. أعد نشر التطبيق."
            )
            continue
        except Exception as e:
            msg = str(e)
            if "Cannot find working tool" in msg:
                errors.append(
                    f"⚠️ أداة فك ضغط RAR `unrar` غير متوفرة على الخادم. / "
                    f"RAR extractor binary missing on the server."
                )
            else:
                errors.append(
                    f"⚠️ فشل إعادة تجميع '{base}.rar': {msg} / "
                    f"Multi-part RAR reassembly failed for '{base}.rar': {msg}"
                )
            continue

        kept = 0
        skipped_examples: list[str] = []
        total_members = len(member_paths)
        for member_name, disk_path in member_paths:
            # Filter using a cheap 132-byte header read instead of
            # pulling the whole file into RAM.
            try:
                with open(disk_path, "rb") as fh:
                    head = fh.read(132)
            except OSError:
                continue
            if looks_like_radiology_input(member_name, head):
                discovered.append(
                    DiscoveredFile(
                        name=os.path.basename(member_name) or member_name,
                        path=disk_path,
                    )
                )
                kept += 1
            elif len(skipped_examples) < 5:
                skipped_examples.append(
                    f"{os.path.basename(member_name) or member_name}"
                )

        if kept == 0:
            sample = ", ".join(skipped_examples) if skipped_examples else "(empty)"
            errors.append(
                f"⚠️ لم يُعثر على DICOM داخل '{base}.rar' (من أصل "
                f"{total_members} عضو). عيّنة: {sample}. / "
                f"No DICOM members in '{base}.rar' ({total_members} entries). "
                f"Sample: {sample}."
            )
        else:
            info.append(
                f"📦 '{base}.rar': اكتُشف {kept} من أصل {total_members} ملف كـ DICOM/صور. / "
                f"Detected {kept} of {total_members} member(s) as DICOM/images."
            )

    for f in standalone_files:
        lower = f.name.lower()

        # TCIA manifest branch — the upload itself is just a text file
        # listing Series Instance UIDs. We pull each series from TCIA's
        # public NBIA servlet and ingest the returned ZIPs.
        if lower.endswith(TCIA_MANIFEST_EXTENSION):
            raw = f.read()
            server_url, uids = parse_tcia_manifest(raw)
            if not server_url:
                errors.append(
                    f"⚠️ {f.name}: لم أتعرف على خادم TCIA موثوق في الـ manifest. / "
                    f"{f.name}: no trusted TCIA download server in the manifest."
                )
                continue
            if not uids:
                errors.append(
                    f"⚠️ {f.name}: الـ manifest فارغ. / {f.name}: empty manifest."
                )
                continue
            info.append(
                f"📡 {f.name}: جاري تنزيل {len(uids)} سلسلة من TCIA… / "
                f"Downloading {len(uids)} series from TCIA…"
            )
            tcia_files, tcia_errors = fetch_tcia_series(
                server_url, uids, progress=tcia_progress
            )
            discovered.extend(tcia_files)
            errors.extend(tcia_errors)
            if tcia_files:
                info.append(
                    f"✅ {f.name}: تم تنزيل {len(tcia_files)} ملف DICOM من TCIA. / "
                    f"Downloaded {len(tcia_files)} DICOM files from TCIA."
                )
            continue

        if not lower.endswith(ARCHIVE_EXTENSIONS):
            # Probe the first 1 KB to classify, then stream the rest to
            # disk. Avoids loading every uploaded byte into RAM up front.
            head = f.read(1024)
            rest = f.read()
            data = head + rest
            if looks_like_radiology_input(f.name, data):
                safe_name = os.path.basename(f.name) or f"file_{len(discovered):06d}"
                disk_path = os.path.join(
                    standalone_tmpdir, f"{len(discovered):06d}_{safe_name}"
                )
                try:
                    with open(disk_path, "wb") as out:
                        out.write(data)
                    discovered.append(DiscoveredFile(name=safe_name, path=disk_path))
                except OSError:
                    # Tempdir write failed — fall back to in-memory.
                    discovered.append(DiscoveredFile(name=safe_name, data=data))
                finally:
                    del data, head, rest
            else:
                errors.append(
                    f"⚠️ تم تجاهل {f.name}: ليس DICOM و لا صورة شعاعية مدعومة. / "
                    f"Skipped {f.name}: not a DICOM file or supported radiology image."
                )
            continue

        # Archive branch
        try:
            members = list(_iter_archive_members(f))
        except RarSupportMissing as e:
            errors.append(
                f"⚠️ {str(e)} / حزمة `rarfile` غير مثبتة. أعد نشر التطبيق بعد التحديث."
            )
            continue
        except Exception as e:
            # rarfile.RarCannotExec (when unrar binary is absent) and any
            # other archive-level failure land here.
            msg = str(e)
            if "Cannot find working tool" in msg or "RarCannotExec" in type(e).__name__:
                errors.append(
                    f"⚠️ أداة فك ضغط RAR `unrar` غير متوفرة على الخادم. / "
                    f"RAR extractor binary missing. Install `unrar` system package."
                )
            else:
                errors.append(
                    f"⚠️ فشل فتح الأرشيف {f.name}: {msg} / "
                    f"Failed to open archive {f.name}: {msg}"
                )
            continue

        kept = 0
        skipped_examples: list[str] = []
        for member_name, disk_path in members:
            # Peek the first 1 KB to classify without slurping the whole
            # member into RAM. The DICM magic lives at offset 128.
            try:
                with open(disk_path, "rb") as fh:
                    probe = fh.read(2048)
            except OSError:
                continue
            if looks_like_radiology_input(member_name, probe):
                discovered.append(
                    DiscoveredFile(
                        name=os.path.basename(member_name) or member_name,
                        path=disk_path,
                    )
                )
                kept += 1
            elif len(skipped_examples) < 5:
                try:
                    sz = os.path.getsize(disk_path)
                except OSError:
                    sz = 0
                skipped_examples.append(
                    f"{os.path.basename(member_name) or member_name} ({sz}B)"
                )

        if kept == 0:
            sample = ", ".join(skipped_examples) if skipped_examples else "(empty)"
            errors.append(
                f"⚠️ لم يُعثر على DICOM داخل {f.name} (من أصل {len(members)} عضو). "
                f"عيّنة: {sample}. / "
                f"No DICOM members in {f.name} ({len(members)} entries total). "
                f"Sample: {sample}."
            )
        else:
            info.append(
                f"📦 {f.name}: اكتُشف {kept} من أصل {len(members)} ملف كـ DICOM. / "
                f"Detected {kept} of {len(members)} member(s) as DICOM."
            )

    return discovered, info, errors


def parse_tcia_manifest(manifest_bytes: bytes) -> tuple[str, list[str]]:
    """Parse a TCIA .tcia manifest file.

    The format is a plain-text key=value preamble followed by a
    'ListOfSeriesToDownload=' header and one Series Instance UID per
    line. Comments and blanks tolerated.

    Returns (server_url, series_uids). server_url is validated against
    the TCIA trusted-host allowlist; callers should treat an empty
    server_url as 'don't download anything'.
    """
    text = manifest_bytes.decode("utf-8", errors="replace")
    server_url = ""
    uids: list[str] = []
    in_list = False
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line and not in_list:
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            if key == "downloadServerUrl":
                server_url = value
            elif key == "ListOfSeriesToDownload":
                in_list = True
                if value:  # rare inline form
                    uids.append(value)
            continue
        if in_list:
            uids.append(line)

    # Trust check on the host
    if server_url:
        try:
            from urllib.parse import urlparse
            host = (urlparse(server_url).hostname or "").lower()
            if not any(host.endswith(h) for h in _TCIA_TRUSTED_HOSTS):
                server_url = ""  # refuse untrusted host
        except Exception:
            server_url = ""
    return server_url, uids


def fetch_tcia_series(
    server_url: str,
    series_uids: list[str],
    progress=None,
) -> tuple[list["DiscoveredFile"], list[str]]:
    """Download each series UID from TCIA's NBIA servlet and return its
    DICOM members as DiscoveredFile entries.

    `progress` is an optional callback `(i, total, uid_or_msg)` for the
    UI to keep the doctor informed; the function does not import
    Streamlit so it stays unit-testable.
    """
    import urllib.parse
    import urllib.request
    import zipfile

    discovered: list[DiscoveredFile] = []
    errors: list[str] = []
    if not server_url or not series_uids:
        return discovered, ["TCIA manifest had no usable server URL or series."]

    for i, uid in enumerate(series_uids):
        if progress:
            progress(i, len(series_uids), uid)
        url = f"{server_url}?seriesUid={urllib.parse.quote(uid)}"
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "CT-OncoScan/1.0 TCIA-manifest-fetch"},
            )
            with urllib.request.urlopen(req, timeout=180) as resp:
                payload = resp.read()
        except Exception as e:
            note = ""
            msg = str(e)
            if "403" in msg or "401" in msg:
                note = (
                    " — هذا التحديد قد يتطلب حساب NBIA و API token. "
                    "البديل: استخدم تطبيق NBIA Data Retriever لتنزيل الـ DICOM "
                    "محلياً ثم ارفع ملف .zip النتيجة."
                )
            errors.append(f"Series {uid[:40]}…: download failed ({msg}){note}")
            continue

        try:
            with zipfile.ZipFile(io.BytesIO(payload)) as zf:
                kept = 0
                for info in zf.infolist():
                    if info.is_dir():
                        continue
                    try:
                        data = zf.read(info)
                    except Exception:
                        continue
                    if looks_like_dicom(info.filename, data):
                        discovered.append(
                            DiscoveredFile(
                                name=os.path.basename(info.filename) or info.filename,
                                data=data,
                            )
                        )
                        kept += 1
                if kept == 0:
                    errors.append(
                        f"Series {uid[:40]}…: downloaded ZIP had no DICOM members."
                    )
        except zipfile.BadZipFile:
            errors.append(
                f"Series {uid[:40]}…: response was not a ZIP (got {len(payload)} bytes; "
                f"the series may be restricted or removed)."
            )
        except Exception as e:
            errors.append(f"Series {uid[:40]}…: extract failed ({e})")

    if progress:
        progress(len(series_uids), len(series_uids), "done")
    return discovered, errors


@dataclass
class SeriesInventoryItem:
    """One MRI/CT series grouped from the discovered DICOM files."""

    series_uid: str
    description: str
    modality: str
    plane: str
    body_part: str
    count: int
    files: list  # list[DiscoveredFile]


def _read_dicom_metadata_streaming(df: "DiscoveredFile") -> dict:
    """Read the header tags of one DiscoveredFile without buffering the
    whole file in RAM.

    The eager ``read_dicom_metadata(df.data)`` path round-tripped every
    file's bytes through a BytesIO before pydicom parsed it; on a
    500-file CD-ROM that's ~200 MB of transient buffers plus CPython
    allocator overhead that the deploy container couldn't absorb (the
    worker was SIGKILLed mid-inventory).

    When the DiscoveredFile is backed by an on-disk path we hand the
    path straight to pydicom with ``stop_before_pixels=True`` — pydicom
    streams the header without materialising the pixel payload. Only
    in-memory uploads (small standalone files) fall back to the bytes
    path.
    """
    if df._path:
        if _is_raster_image_path(df._path):
            return read_dicom_metadata(df.data)
        ds = pydicom.dcmread(df._path, stop_before_pixels=True, force=True)
        iop = getattr(ds, "ImageOrientationPatient", None)
        iop_list = list(iop) if iop is not None else None
        pixel_spacing = getattr(ds, "PixelSpacing", None)
        if pixel_spacing is not None:
            try:
                pixel_spacing = "\\".join(str(v) for v in pixel_spacing)
            except Exception:
                pixel_spacing = ""
        else:
            pixel_spacing = ""
        return {
            "sop_instance_uid": str(getattr(ds, "SOPInstanceUID", "")),
            "instance_number": int(getattr(ds, "InstanceNumber", 0) or 0),
            "slice_location": float(getattr(ds, "SliceLocation", 0) or 0),
            "rows": int(getattr(ds, "Rows", 0) or 0),
            "columns": int(getattr(ds, "Columns", 0) or 0),
            "pixel_spacing": pixel_spacing,
            "slice_thickness": str(getattr(ds, "SliceThickness", "") or ""),
            "modality": str(getattr(ds, "Modality", "") or ""),
            "series_uid": str(getattr(ds, "SeriesInstanceUID", "")),
            "series_number": int(getattr(ds, "SeriesNumber", 0) or 0),
            "series_description": str(getattr(ds, "SeriesDescription", "") or ""),
            "image_orientation": iop_list,
            "plane": _compute_plane(iop_list),
            "body_part": str(getattr(ds, "BodyPartExamined", "") or ""),
            "study_description": str(getattr(ds, "StudyDescription", "") or ""),
            "laterality": _infer_laterality(
                str(getattr(ds, "Laterality", "") or ""),
                str(getattr(ds, "SeriesDescription", "") or ""),
                str(getattr(ds, "StudyDescription", "") or ""),
            ),
            "protocol_name": str(getattr(ds, "ProtocolName", "") or ""),
        }
    return read_dicom_metadata(df.data)


def _is_raster_image_path(path: str) -> bool:
    """Cheap on-disk version of _is_raster_image — reads only 8 bytes."""
    try:
        with open(path, "rb") as fh:
            head = fh.read(8)
    except OSError:
        return False
    return _is_raster_image(head)


def inventory_series(discovered: list[DiscoveredFile]) -> list[SeriesInventoryItem]:
    """Group discovered DICOM files by SeriesInstanceUID.

    A real-world knee MRI upload bundles 5-7 different series in one
    archive (Sag T2, Cor T1, Ax PD-FS, localizer, etc). Stacking them
    all together produces an incoherent 'volume' and a model that
    can't tell which slice is which sequence. Group first, analyze
    per-series afterward.
    """
    groups: dict[str, SeriesInventoryItem] = {}
    fallback_idx = 0
    for df in discovered:
        try:
            meta = _read_dicom_metadata_streaming(df)
        except Exception:
            # Without metadata we can't group; bucket under a synthetic
            # 'unknown' series so the file isn't silently dropped.
            fallback_idx += 1
            key = f"__unparseable__{fallback_idx}"
            groups[key] = SeriesInventoryItem(
                series_uid=key,
                description="(unparseable header)",
                modality="",
                plane="unknown",
                body_part="",
                count=1,
                files=[df],
            )
            continue
        uid = meta.get("series_uid") or ""
        if not uid:
            uid = f"__noseries__{fallback_idx}"
            fallback_idx += 1
        if uid not in groups:
            groups[uid] = SeriesInventoryItem(
                series_uid=uid,
                description=(
                    meta.get("series_description")
                    or meta.get("study_description")
                    or ""
                ),
                modality=meta.get("modality") or "",
                plane=meta.get("plane") or "unknown",
                body_part=meta.get("body_part") or "",
                count=0,
                files=[],
            )
        groups[uid].count += 1
        groups[uid].files.append(df)

    return list(groups.values())


def _decode_raster_image(data: bytes, modality: str) -> tuple[np.ndarray, dict]:
    """Decode a non-DICOM raster image (BMP/PNG/JPG/TIFF) into the same
    shape downstream code expects from decode_slice. Synthesizes empty
    DICOM-style metadata since the image has no headers."""
    from PIL import Image as PILImage
    img = PILImage.open(io.BytesIO(data)).convert("L")  # grayscale
    arr = np.array(img, dtype=np.float32)
    rows, cols = arr.shape
    return arr, {
        "sop_instance_uid": "",
        "instance_number": 0,
        "slice_location": 0.0,
        "rows": int(rows),
        "columns": int(cols),
        "pixel_spacing": "",
        "slice_thickness": "",
        "modality": modality or "",
        "series_uid": "",
        "series_number": 0,
        "series_description": "Uploaded raster image (non-DICOM)",
        "image_orientation": None,
        "plane": "unknown",
        "body_part": "",
        "study_description": "",
        "laterality": "",
        "protocol_name": "",
    }


def decode_slice(dicom_bytes: bytes, modality: str) -> tuple[np.ndarray, dict]:
    """Decode raw DICOM bytes into a 2D float32 array + metadata dict.

    Falls back to PIL for non-DICOM raster images (BMP/PNG/JPG/TIFF)
    so screenshots and exported images flow through the same pipeline.

    Applies HU rescaling for CT only; MRI signal intensities are
    sequence-dependent and rescaling them produces meaningless values.
    """
    if _is_raster_image(dicom_bytes):
        return _decode_raster_image(dicom_bytes, modality)
    ds = pydicom.dcmread(io.BytesIO(dicom_bytes))
    arr = ds.pixel_array.astype(np.float32)

    if modality == "CT":
        slope = float(getattr(ds, "RescaleSlope", 1) or 1)
        intercept = float(getattr(ds, "RescaleIntercept", 0) or 0)
        if slope != 1 or intercept != 0:
            arr *= slope
            arr += intercept

    iop = getattr(ds, "ImageOrientationPatient", None)
    iop_list = list(iop) if iop is not None else None
    metadata = {
        "sop_instance_uid": str(getattr(ds, "SOPInstanceUID", "")),
        "instance_number": int(getattr(ds, "InstanceNumber", 0) or 0),
        "slice_location": float(getattr(ds, "SliceLocation", 0) or 0),
        "rows": int(getattr(ds, "Rows", arr.shape[0]) or arr.shape[0]),
        "columns": int(getattr(ds, "Columns", arr.shape[1]) or arr.shape[1]),
        "pixel_spacing": str(getattr(ds, "PixelSpacing", "") or ""),
        "slice_thickness": str(getattr(ds, "SliceThickness", "") or ""),
        "modality": str(getattr(ds, "Modality", modality) or modality),
        "series_uid": str(getattr(ds, "SeriesInstanceUID", "")),
        "series_number": int(getattr(ds, "SeriesNumber", 0) or 0),
        "series_description": str(getattr(ds, "SeriesDescription", "") or ""),
        "image_orientation": [float(v) for v in iop_list] if iop_list else None,
        "plane": _compute_plane(iop_list),
        "body_part": str(getattr(ds, "BodyPartExamined", "") or ""),
        "study_description": str(getattr(ds, "StudyDescription", "") or ""),
        "laterality": (
            str(getattr(ds, "Laterality", "") or getattr(ds, "ImageLaterality", "") or "")
            or _infer_laterality(
                str(getattr(ds, "SeriesDescription", "") or ""),
                str(getattr(ds, "StudyDescription", "") or ""),
                str(getattr(ds, "ProtocolName", "") or ""),
                str(getattr(ds, "BodyPartExamined", "") or ""),
            )
        ),
        "protocol_name": str(getattr(ds, "ProtocolName", "") or ""),
    }
    return arr, metadata


def read_dicom_metadata(dicom_bytes: bytes) -> dict:
    """Cheap header read without decoding pixel data.

    Returns synthetic empty headers for non-DICOM raster images so
    the rest of the pipeline (inventory_series, enrichment, study
    picker) doesn't crash on screenshots.
    """
    if _is_raster_image(dicom_bytes):
        from PIL import Image as PILImage
        try:
            img = PILImage.open(io.BytesIO(dicom_bytes))
            rows, cols = img.height, img.width
        except Exception:
            rows = cols = 0
        return {
            "sop_instance_uid": "",
            "instance_number": 0,
            "slice_location": 0.0,
            "rows": int(rows),
            "columns": int(cols),
            "pixel_spacing": "",
            "slice_thickness": "",
            "modality": "",  # unknown; doctor's dropdown selection wins
            "series_uid": "",
            "series_number": 0,
            "series_description": "Uploaded raster image (non-DICOM)",
            "image_orientation": None,
            "plane": "unknown",
            "body_part": "",
            "study_description": "",
            "laterality": "",
            "protocol_name": "",
        }
    ds = pydicom.dcmread(io.BytesIO(dicom_bytes), stop_before_pixels=True)
    iop = getattr(ds, "ImageOrientationPatient", None)
    iop_list = list(iop) if iop is not None else None
    return {
        "sop_instance_uid": str(getattr(ds, "SOPInstanceUID", "")),
        "instance_number": int(getattr(ds, "InstanceNumber", 0) or 0),
        "slice_location": float(getattr(ds, "SliceLocation", 0) or 0),
        "rows": int(getattr(ds, "Rows", 0) or 0),
        "columns": int(getattr(ds, "Columns", 0) or 0),
        "pixel_spacing": str(getattr(ds, "PixelSpacing", "") or ""),
        "slice_thickness": str(getattr(ds, "SliceThickness", "") or ""),
        "modality": str(getattr(ds, "Modality", "") or ""),
        "series_uid": str(getattr(ds, "SeriesInstanceUID", "")),
        "series_number": int(getattr(ds, "SeriesNumber", 0) or 0),
        "series_description": str(getattr(ds, "SeriesDescription", "") or ""),
        "image_orientation": [float(v) for v in iop_list] if iop_list else None,
        "plane": _compute_plane(iop_list),
        "body_part": str(getattr(ds, "BodyPartExamined", "") or ""),
        "study_description": str(getattr(ds, "StudyDescription", "") or ""),
        "laterality": (
            str(getattr(ds, "Laterality", "") or getattr(ds, "ImageLaterality", "") or "")
            or _infer_laterality(
                str(getattr(ds, "SeriesDescription", "") or ""),
                str(getattr(ds, "StudyDescription", "") or ""),
                str(getattr(ds, "ProtocolName", "") or ""),
                str(getattr(ds, "BodyPartExamined", "") or ""),
            )
        ),
        "protocol_name": str(getattr(ds, "ProtocolName", "") or ""),
    }


# ── Google Drive direct-download helper ──────────────────────────────
# Doctors with studies too big for Replit's HTTP gateway upload the
# zipped folder to Google Drive and paste the share link. We resolve
# the link to a direct-download URL and stream the bytes to a tempfile
# wrapped in an UploadedFile-shaped shim, so the rest of the
# discovery pipeline doesn't need to care where the file came from.
import re as _gd_re
import urllib.request as _gd_urlreq
import urllib.parse as _gd_urlparse


class _FetchedFile:
    """UploadedFile-shaped wrapper around a downloaded file on disk."""

    def __init__(self, name: str, path: str):
        self.name = name
        self._path = path
        self.size_bytes = os.path.getsize(path)

    @property
    def size(self) -> int:
        return self.size_bytes

    def read(self, n: int = -1) -> bytes:
        if not hasattr(self, "_fh"):
            self._fh = open(self._path, "rb")
        return self._fh.read() if n == -1 else self._fh.read(n)

    def seek(self, pos: int, whence: int = 0) -> None:
        if not hasattr(self, "_fh"):
            self._fh = open(self._path, "rb")
        self._fh.seek(pos, whence)


def _extract_gdrive_id(url: str) -> str | None:
    """Pull the file ID out of any common Google Drive share URL form."""
    for pat in (
        r"/file/d/([A-Za-z0-9_-]+)",
        r"[?&]id=([A-Za-z0-9_-]+)",
        r"/open\?id=([A-Za-z0-9_-]+)",
    ):
        m = _gd_re.search(pat, url)
        if m:
            return m.group(1)
    return None


def download_from_gdrive(url: str) -> _FetchedFile:
    """Download a Google Drive share link to a server-side tempfile.

    Returns an object that quacks like Streamlit's UploadedFile so the
    rest of the upload pipeline (discover_dicom_files → persist) can
    consume it without changes. Raises ValueError on bad URL or HTTP
    failure.
    """
    file_id = _extract_gdrive_id(url)
    if not file_id:
        raise ValueError(
            "Could not parse a Google Drive file ID from the URL. "
            "Use a 'share' link of the form "
            "https://drive.google.com/file/d/FILE_ID/view"
        )

    # Drive's direct-download endpoint. For files > ~100 MB Drive
    # interposes a virus-scan confirmation page; appending confirm=t
    # bypasses it.
    base = "https://drive.usercontent.google.com/download"
    dl_url = f"{base}?id={file_id}&export=download&confirm=t"

    tmpdir = tempfile.mkdtemp(prefix="ctos_gdrive_")
    out_name = f"gdrive_{file_id[:12]}.bin"
    out_path = os.path.join(tmpdir, out_name)

    req = _gd_urlreq.Request(
        dl_url,
        headers={"User-Agent": "Mozilla/5.0 CTOncoScan"},
    )
    try:
        with _gd_urlreq.urlopen(req, timeout=300) as resp:
            content_disp = resp.headers.get("Content-Disposition", "")
            # filename="actual_name.zip"
            m = _gd_re.search(r'filename="([^"]+)"', content_disp)
            if m:
                out_name = m.group(1)
                out_path = os.path.join(tmpdir, out_name)
            with open(out_path, "wb") as out:
                shutil.copyfileobj(resp, out, length=1024 * 1024)
    except Exception as e:
        raise ValueError(f"Drive download failed: {e}") from e

    if os.path.getsize(out_path) < 1024:
        # Drive returned an HTML error page instead of the file.
        with open(out_path, "rb") as fh:
            head = fh.read(2048)
        if b"<html" in head.lower() or b"<!doctype" in head.lower():
            raise ValueError(
                "Drive returned an HTML page instead of the file — make "
                "sure sharing is set to 'Anyone with the link'."
            )

    return _FetchedFile(name=out_name, path=out_path)
