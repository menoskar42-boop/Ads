#!/usr/bin/env python3
"""Fetch the selected public Oscar Drive road datasets outside the Git tree.

Usage:
  python oscardrive-android/vision-test/datasets/fetch_datasets.py
  python oscardrive-android/vision-test/datasets/fetch_datasets.py --dest /tmp/my-road-data --extract

Only Python's standard library is required. These Mendeley public downloads
need no API key. Archives are saved to /tmp by default; extraction is optional.
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath


DATASETS = {
    "bangladesh-speed-breakers": "https://data.mendeley.com/public-api/zip/7zzcmv2wz7/download/1",
    "india-marked-speed-breakers": "https://data.mendeley.com/public-api/zip/bvpt9xdjz8/download/1",
    "annotated-potholes": "https://data.mendeley.com/public-api/zip/tp95cdvgm8/download/1",
}


def download(url: str, destination: Path) -> None:
    if destination.exists() and zipfile.is_zipfile(destination):
        print(f"Already downloaded: {destination}")
        return
    partial = destination.with_suffix(destination.suffix + ".part")
    request = urllib.request.Request(
        url, headers={"User-Agent": "OscarDriveDatasetFetcher/1.0"}
    )
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            print(f"Downloading {destination.name} (attempt {attempt}/3)")
            with urllib.request.urlopen(request, timeout=90) as response, partial.open(
                "wb"
            ) as output:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
            if not zipfile.is_zipfile(partial):
                raise ValueError(
                    "Download is not a ZIP archive; the source may have changed."
                )
            partial.replace(destination)
            return
        except (OSError, urllib.error.URLError, ValueError) as exc:
            last_error = exc
            partial.unlink(missing_ok=True)
            if attempt < 3:
                time.sleep(attempt * 2)
    raise RuntimeError(f"Could not download {url}: {last_error}")


def safe_extract(archive: Path, output_dir: Path) -> None:
    root = output_dir.resolve()
    with zipfile.ZipFile(archive) as zipped:
        for item in zipped.infolist():
            # Reject absolute paths and parent traversal before extraction.
            member = PurePosixPath(item.filename)
            if member.is_absolute() or ".." in member.parts:
                raise ValueError(f"Unsafe archive path: {item.filename}")
            target = (root / Path(*member.parts)).resolve()
            if target != root and root not in target.parents:
                raise ValueError(f"Archive path escapes destination: {item.filename}")
        zipped.extractall(root)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dest",
        type=Path,
        default=Path("/tmp/oscardrive-road-datasets"),
        help="directory outside the repository for archives and extracted files",
    )
    parser.add_argument(
        "--extract",
        action="store_true",
        help="also extract each archive into a same-named subdirectory",
    )
    args = parser.parse_args()
    destination = args.dest.expanduser().resolve()
    os.makedirs(destination, exist_ok=True)

    try:
        for name, url in DATASETS.items():
            archive = destination / f"{name}.zip"
            download(url, archive)
            if args.extract:
                extracted = destination / name
                extracted.mkdir(parents=True, exist_ok=True)
                safe_extract(archive, extracted)
                print(f"Extracted to {extracted}")
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Dataset files are in {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
