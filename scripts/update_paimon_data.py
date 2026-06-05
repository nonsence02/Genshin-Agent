"""Download and refresh raw Paimon.moe data files.

The script downloads the latest MadeBaruna/paimon-moe repository archive and
extracts only ``src/data`` into ``data/raw/paimon-moe/data``.
"""

from __future__ import annotations

import io
import os
import shutil
import zipfile
from pathlib import Path

import requests


ZIP_URL = "https://github.com/MadeBaruna/paimon-moe/archive/refs/heads/main.zip"
ARCHIVE_DATA_PREFIX = "paimon-moe-main/src/data/"
ARCHIVE_SRC_PREFIX = "paimon-moe-main/src/"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
PAIMON_ROOT = PROJECT_ROOT / "data" / "raw" / "paimon-moe"
TARGET_DIR = PAIMON_ROOT / "data"
TMP_DIR = PAIMON_ROOT / ".tmp-data-download"


def main() -> int:
    print("[1/3] Скачивание архива Paimon.moe...")
    archive_bytes = download_archive(ZIP_URL)

    print("[2/3] Распаковка файлов данных...")
    extracted_count = extract_data_files(archive_bytes)

    print(f"[3/3] Обновление завершено! Файлов обновлено: {extracted_count}")
    print(f"Данные сохранены в: {TARGET_DIR}")
    return 0


def download_archive(url: str) -> bytes:
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    return response.content


def extract_data_files(archive_bytes: bytes) -> int:
    prepare_tmp_dir()
    extracted_count = 0

    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            for member in archive.infolist():
                if member.is_dir() or not member.filename.startswith(ARCHIVE_DATA_PREFIX):
                    continue

                relative_path = member.filename.removeprefix(ARCHIVE_SRC_PREFIX)
                output_path = safe_join(TMP_DIR, relative_path)
                os.makedirs(output_path.parent, exist_ok=True)

                with archive.open(member) as source, open(output_path, "wb") as target:
                    shutil.copyfileobj(source, target)
                extracted_count += 1

        replace_target_dir()
        return extracted_count
    except Exception:
        shutil.rmtree(TMP_DIR, ignore_errors=True)
        raise


def prepare_tmp_dir() -> None:
    os.makedirs(PAIMON_ROOT, exist_ok=True)
    shutil.rmtree(TMP_DIR, ignore_errors=True)
    os.makedirs(TMP_DIR, exist_ok=True)


def replace_target_dir() -> None:
    extracted_data_dir = TMP_DIR / "data"
    if not extracted_data_dir.exists():
        raise RuntimeError("Archive did not contain paimon-moe-main/src/data files.")

    shutil.rmtree(TARGET_DIR, ignore_errors=True)
    os.makedirs(TARGET_DIR.parent, exist_ok=True)
    shutil.move(str(extracted_data_dir), str(TARGET_DIR))
    shutil.rmtree(TMP_DIR, ignore_errors=True)


def safe_join(root: Path, relative_path: str) -> Path:
    output_path = (root / relative_path).resolve()
    root_path = root.resolve()
    if root_path != output_path and root_path not in output_path.parents:
        raise RuntimeError(f"Unsafe archive path detected: {relative_path}")
    return output_path


if __name__ == "__main__":
    raise SystemExit(main())
