"""Build a local preview of the web app UI (no Google needed) to check phone / desktop layouts.

Index.html + a fake google.script.run that answers with the verified TA6 22/9 results and real photos.

Usage:
    python webapp/test/make_preview.py <out_dir>
    python -m http.server 8765 --directory <out_dir>     # then open http://localhost:8765/preview.html
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SESSION = ROOT / "data" / "TA6" / "22-9"


def main(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    result = json.loads((SESSION / "result.json").read_text(encoding="utf-8"))
    key = [{"en": k["en"], "vi": k["vi"]} for k in result["parts"][0]["key"]]
    total = len(key)

    photos, rows = [], []
    for st in result["students"]:
        ids = st.get("photos", [])
        for pid in ids:
            src = SESSION / "photos" / f"{pid}.jpg"
            im = Image.open(src)
            im.thumbnail((320, 320))
            im.save(out / f"th_{pid}.jpg", quality=75)
            full = Image.open(src)
            full.thumbnail((1400, 1400))
            full.save(out / f"full_{pid}.jpg", quality=80)
            photos.append({"id": pid, "name": f"{pid}.jpg", "url": "#", "kind": "photo", "graded": True})
        if not ids:
            rows.append({"name": st["name"], "values": {}, "notes": "", "photos": [], "status": "missing"})
            continue
        p = st["parts"]["TỪ VỰNG"]
        wrong = len(p["wrong"])
        pen = "từ mới x15 lần" if wrong >= 5 else ("từ viết sai x10 lần" if wrong >= 2 else "")
        values = {"TỪ VỰNG": f"{p['correct']}/{total} từ", "TỪ VIẾT SAI": ", ".join(p["wrong"]), "CHÉP PHẠT": pen}
        rows.append({"name": st["name"], "values": values, "notes": "\n".join(st.get("notes", [])),
                     "photos": [{"id": pid, "name": f"{pid}.jpg", "url": "#"} for pid in ids],
                     "status": "graded", "flag": any("xem lại" in n for n in st.get("notes", [])), "ai": dict(values)})
    rows.append({"name": "", "values": {"TỪ VỰNG": "0/13 từ", "TỪ VIẾT SAI": "", "CHÉP PHẠT": "từ mới x15 lần"},
                 "notes": 'Chưa ghép được tên (giấy ghi "Chi") - cô chọn tên', "photos": [], "status": "unmatched", "flag": True})

    table = {"title": "TỪ VỰNG", "columns": ["TỪ VỰNG", "TỪ VIẾT SAI", "CHÉP PHẠT"], "rows": rows}
    roster = [st["name"] for st in result["students"]]
    files = [{"id": "k1", "name": "key_1.jpg", "url": "#", "kind": "key"}] + photos
    Image.open(SESSION / "key.jpg").save(out / "th_k1.jpg")
    Image.open(SESSION / "key.jpg").save(out / "full_k1.jpg")
    state = {"key": {"topic": "giới từ chỉ vị trí", "parts": [{"part": "TỪ VỰNG", "unit": "từ", "items": key}]},
             "keyFileIds": ["k1"], "results": {p["id"]: {} for p in photos}, "ignored": [], "nameOverrides": {},
             "table": table, "exportedAt": "20:15 27/09/2026", "exportedAtMs": 1, "tableUpdatedAt": 2}
    info = {"id": "s1", "name": "NGÀY 22/09/26", "label": "22/09/26", "className": "TA6",
            "photos": photos, "keys": [{"id": "k1", "name": "key_1.jpg"}], "roster": roster, "sheetUrl": "#", "state": state}

    mock = f"""<script>
const MOCK_INFO = {json.dumps(info, ensure_ascii=False)};
const MOCK_FILES = {json.dumps(files, ensure_ascii=False)};
const MOCK = {{
  listClasses: () => [{{id: 'c1', name: 'TA6'}}, {{id: 'c2', name: 'TA7.1'}}, {{id: 'c3', name: 'TA9'}}],
  listSessions: () => [{{id: 's1', name: 'NGÀY 22/09/26', label: '22/09/26', photos: {len(photos)}, hasKey: true, sheetUrl: '#'}},
                       {{id: 's0', name: 'NGÀY 19/9', label: '19/09/26', photos: 13, hasKey: true, sheetUrl: ''}}],
  getSessionInfo: () => JSON.parse(JSON.stringify(MOCK_INFO)),
  keyStatus: () => [{{label: 'miễn phí #1', paid: false, ok: true, note: 'sẵn sàng'}},
                    {{label: 'miễn phí #2', paid: false, ok: false, note: 'hết hạn mức hôm nay (mở lại khoảng 14-15h)'}},
                    {{label: 'trả phí', paid: true, ok: true, note: 'sẵn sàng'}}],
  listFiles: () => JSON.parse(JSON.stringify(MOCK_FILES)),
  getThumbs: (ids) => ids.map((id) => ({{id, src: 'th_' + id + '.jpg'}})),
  getImage: (id) => ({{src: 'full_' + id + '.jpg', mime: 'image/jpeg'}}),
  saveTable: () => true,
  saveClassRoster: (id, names) => {{ MOCK_INFO.roster = names; return names; }},
  buildTable: () => MOCK_INFO.state.table,
  saveKey: (id, key) => ({{topic: key.topic, parts: key.parts}}),
  gradePhoto: () => ({{keyMatches: true, costUsd: 0.0003, paid: false, keyLabel: 'miễn phí #1'}}),
  readKey: () => ({{topic: 'cấu trúc V-ing', costUsd: 0.0006, paid: false, keyLabel: 'miễn phí #1', parts: [
    {{part: 'CÔNG THỨC', kind: 'word', unit: 'từ', items: [{{id: '1.1', en: 'admit + V-ing', vi: 'thừa nhận làm gì'}},
                                                         {{id: '1.2', en: 'deny + V-ing', vi: 'phủ nhận làm gì'}}]}},
    {{part: 'CẤU TRÚC', kind: 'formula', unit: 'công thức', items: [{{id: '2.1', en: 'S + V(s/es)', vi: 'HTĐ'}}]}}]}}),
  deleteFile: () => ({{rebuilt: false}}),
  exportSession: () => ({{sheetUrl: '#', imageUrl: '#', exportedAt: '21:00 27/09/2026', exportedAtMs: 3}}),
}};
function makeRunner(ok = () => {{}}, fail = () => {{}}) {{
  return new Proxy({{}}, {{ get(_, p) {{
    if (p === 'withSuccessHandler') return (f) => makeRunner(f, fail);
    if (p === 'withFailureHandler') return (f) => makeRunner(ok, f);
    return (...args) => setTimeout(() => {{ try {{ ok(MOCK[p](...args)); }} catch (e) {{ fail(e); }} }}, 120);
  }} }});
}}
window.google = {{ script: {{ run: makeRunner() }} }};
try {{ localStorage.setItem('lastClass', '"c1"'); localStorage.setItem('lastSession', '"s1"'); }} catch (e) {{}}
</script>
"""
    html = (ROOT / "webapp" / "Index.html").read_text(encoding="utf-8")
    html = html.replace("<?= email ?>", "co.giao@example.com")
    m = re.search(r"<script>\r?\nconst \$ =", html)
    html = html[:m.start()] + mock + html[m.start():]
    (out / "preview.html").write_text(html, encoding="utf-8")
    print(out / "preview.html")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
