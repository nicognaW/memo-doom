from hashlib import sha256
import json
from pathlib import Path
import struct
from urllib.request import urlopen
import zipfile
import zlib

APP = Path(__file__).resolve().parent.parent
REPO = APP
ARCHIVE = REPO / ".cache" / "freedoom-0.11.3.zip"
URL = "https://github.com/freedoom/freedoom/releases/download/v0.11.3/freedoom-0.11.3.zip"
ARCHIVE_SHA256 = "28a5eafbb1285b78937bd408fcdd8f25f915432340eee79da692eae83bce5e8a"


def digest(data):
    return sha256(data).hexdigest()


def main():
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    if not ARCHIVE.exists() or digest(ARCHIVE.read_bytes()) != ARCHIVE_SHA256:
        with urlopen(URL, timeout=60) as response:
            data = response.read()
        if digest(data) != ARCHIVE_SHA256:
            raise RuntimeError("Freedoom release digest mismatch")
        ARCHIVE.write_bytes(data)

    with zipfile.ZipFile(ARCHIVE) as archive:
        info = next(item for item in archive.infolist() if item.filename.endswith("/freedoom1.wad"))
        original = archive.read(info)
        with ARCHIVE.open("rb") as raw:
            raw.seek(info.header_offset)
            header = raw.read(30)
            signature, version, flags, method, timestamp, date, crc, size, length, name_length, extra_length = struct.unpack(
                "<IHHHHHIIIHH", header
            )
            if signature != 0x04034B50 or method != zipfile.ZIP_DEFLATED or flags & 1:
                raise RuntimeError("Expected an unencrypted DEFLATE WAD member")
            if name_length != len(info.filename.encode("utf-8")) or size != info.compress_size:
                raise RuntimeError("Unexpected ZIP local header")
            raw.seek(info.header_offset + 30 + name_length + extra_length)
            compressed = raw.read(info.compress_size)
        if zlib.decompress(compressed, -15) != original or zlib.crc32(original) != info.CRC:
            raise RuntimeError("Raw WAD stream verification failed")
        if len(compressed) >= 10 * 1024 * 1024:
            raise RuntimeError("Compressed WAD exceeds the MMPKG single-file limit")

        assets = APP / "assets"
        licenses = APP / "licenses"
        assets.mkdir(parents=True, exist_ok=True)
        licenses.mkdir(parents=True, exist_ok=True)
        (assets / "freedoom1.wad.deflate").write_bytes(compressed)
        for member in ("COPYING.txt", "CREDITS.txt"):
            (licenses / f"FREEDOOM-{member}").write_bytes(archive.read(f"freedoom-0.11.3/{member}"))
        metadata = {
            "name": "Freedoom Phase 1",
            "version": "0.11.3",
            "source": URL,
            "archiveSha256": ARCHIVE_SHA256,
            "compressedSha256": digest(compressed),
            "compressedBytes": len(compressed),
            "wadSha256": digest(original),
            "wadBytes": len(original),
        }
        (assets / "freedoom.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
