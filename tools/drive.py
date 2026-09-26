"""Read the public grading folder on Google Drive (no login needed).

The folder is shared as "anyone with the link", so its listing and files can be
fetched over plain HTTPS. Writing back to Google Sheets is NOT done here.

Usage:
    python tools/drive.py tree                    # print class/session/file tree
    python tools/drive.py fetch TA6 19/9          # download one session's photos as JPEG
    python tools/drive.py sheet                   # download the grading sheet as xlsx
"""
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

ROOT_FOLDER_ID = "1x-tIEoZAp5RdGpA_MCenUJ1iZXUxwGbB"
SHEET_ID = "1ecvzosXzZonldGXlsd1TI_Ux1TnbpF_7ZV6lvkqPgNk"
PROJECT = Path(__file__).resolve().parent.parent
DATA = PROJECT / "data"
UA = {"User-Agent": "Mozilla/5.0"}


def _get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def list_folder(folder_id: str) -> list[dict]:
    """Return direct children of a public folder: [{id, name, mime}]."""
    html = _get(f"https://drive.google.com/drive/folders/{folder_id}").decode("utf-8")
    m = re.search(r"window\['_DRIVE_ivd'\] = '(.*?)';", html, re.S)
    if not m:
        raise RuntimeError(f"Folder {folder_id} not readable (is it still shared publicly?)")
    raw = re.sub(r"\\x([0-9A-Fa-f]{2})", lambda x: chr(int(x.group(1), 16)), m.group(1))
    raw = raw.replace("\\/", "/")
    data = json.loads(raw)
    items = []
    for row in data[0] or []:
        if isinstance(row, list) and len(row) > 3 and row[1] == [folder_id]:
            items.append({"id": row[0], "name": row[2], "mime": row[3]})
    return items


def is_folder(item: dict) -> bool:
    return item["mime"] == "application/vnd.google-apps.folder"


def norm(s: str) -> str:
    """Lowercase, strip accents and spaces, so 'NGÀY 19/9' matches '19/9'."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("đ", "d").replace("Đ", "D")
    return re.sub(r"\s+", "", s.lower())


def session_date(folder_name: str) -> str | None:
    """'NGÀY 19/9' -> '19-9'."""
    m = re.search(r"(\d{1,2})\s*[/\-.]\s*(\d{1,2})", folder_name)
    return f"{int(m.group(1))}-{int(m.group(2))}" if m else None


def find_session(class_name: str, date: str) -> tuple[dict, list[dict]]:
    classes = {norm(c["name"]): c for c in list_folder(ROOT_FOLDER_ID) if is_folder(c)}
    cls = classes.get(norm(class_name))
    if not cls:
        raise SystemExit(f"Class '{class_name}' not found. Have: {[c['name'] for c in classes.values()]}")
    want = session_date(date)
    for s in list_folder(cls["id"]):
        if is_folder(s) and session_date(s["name"]) == want:
            return s, list_folder(s["id"])
    raise SystemExit(f"Session '{date}' not found in {cls['name']}")


def fetch_session(class_name: str, date: str) -> Path:
    """Download student photos (as JPEG) and the teacher's cham_bai image if present."""
    session, files = find_session(class_name, date)
    out = DATA / class_name.upper() / session_date(date)
    (out / "photos").mkdir(parents=True, exist_ok=True)
    manifest = []
    for f in sorted(files, key=lambda f: f["name"]):
        if is_folder(f):
            continue
        name = norm(f["name"])
        if name.startswith("cham_bai"):
            target = out / "teacher_cham_bai.jpg"
        elif name.startswith(("key", "dapan")):
            target = out / "key.jpg"  # teacher's answer key
        else:
            target = out / f"photos/{Path(f['name']).stem}.jpg"
        if not target.exists():
            # The thumbnail endpoint converts HEIC to JPEG server-side.
            target.write_bytes(_get(f"https://drive.google.com/thumbnail?id={f['id']}&sz=w2000"))
        manifest.append({"name": f["name"], "id": f["id"], "local": str(target.relative_to(out))})
    (out / "manifest.json").write_text(
        json.dumps({"class": class_name.upper(), "date": date, "folder": session["name"],
                    "folder_id": session["id"], "files": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8")
    photos = sum(1 for m in manifest if m["local"].startswith("photos"))
    extras = [label for local, label in (("key.jpg", "answer key"), ("teacher_cham_bai.jpg", "teacher result"))
              if any(m["local"] == local for m in manifest)]
    print(f"{out}  ({photos} photos{''.join(', ' + e for e in extras)})")
    return out


def fetch_sheet() -> Path:
    DATA.mkdir(exist_ok=True)
    path = DATA / "sheet.xlsx"
    path.write_bytes(_get(f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"))
    print(path)
    return path


def print_tree(folder_id: str = ROOT_FOLDER_ID, depth: int = 0) -> None:
    for item in list_folder(folder_id):
        if is_folder(item):
            children = list_folder(item["id"])
            files = [c for c in children if not is_folder(c)]
            graded = any(norm(c["name"]).startswith("cham_bai") for c in files)
            note = f"  {len(files)} files{' (graded)' if graded else ''}" if files else ""
            print("  " * depth + f"{item['name']}/{note}")
            if any(is_folder(c) for c in children):
                print_tree(item["id"], depth + 1)
        else:
            print("  " * depth + item["name"])


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    cmd = sys.argv[1] if len(sys.argv) > 1 else "tree"
    if cmd == "tree":
        print_tree()
    elif cmd == "fetch" and len(sys.argv) == 4:
        fetch_session(sys.argv[2], sys.argv[3])
    elif cmd == "sheet":
        fetch_sheet()
    else:
        raise SystemExit(__doc__)
