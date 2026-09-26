"""Grade handwritten photos with a Gemini model and compare to the verified result.

Gemini only reads: it transcribes each line exactly (keeping misspellings) and
judges the Vietnamese meaning. Spelling is judged here in code (letter-by-letter
distance + the one-forgiveness rule), because small models miscount letters.
Results are checked against data/<CLASS>/<d-m>/result.json (verified by the teacher).

Usage:
    .venv/Scripts/python tools/gemini_grade.py TA6 22/9 IMG_7458
    .venv/Scripts/python tools/gemini_grade.py TA6 22/9 IMG_7458 --model gemini-3.1-flash-lite
"""
import argparse
import json
import re
import sys
from pathlib import Path

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field

PROJECT = Path(__file__).resolve().parent.parent
# USD per 1M tokens (input, output), paid tier, checked 2026-09-27
PRICES = {"gemini-2.5-flash-lite": (0.10, 0.40), "gemini-3.1-flash-lite": (0.25, 1.50),
          "gemini-3.5-flash-lite": (0.30, 2.50)}

RULES = """Bạn là trợ lý chấm bài từ vựng tiếng Anh viết tay của học sinh Việt Nam.
Ảnh 1 là ĐÁP ÁN của cô giáo. Ảnh 2 là BÀI LÀM của một học sinh.

BƯỚC 1 - CHÉP LẠI: chép từng dòng học sinh viết, ĐÚNG TỪNG CHỮ CÁI như trên giấy.
TUYỆT ĐỐI KHÔNG tự sửa lỗi chính tả (nếu em viết "bellow" thì chép "bellow", không phải "below").
CHỮ BỊ GẠCH XÓA: học sinh hay viết sai rồi gạch đi và viết lại bên cạnh. Chữ nào có nét gạch ngang
đè lên, bị gạch chéo hoặc bị tô đen thì học sinh đã bỏ chữ đó. KHÔNG chép chữ bị gạch, chỉ chép phần
còn lại. Nhìn kỹ từng chữ xem có nét gạch không trước khi chép.
Ví dụ: em viết "bên ngoài trong" mà chữ "ngoài" bị gạch thì chép là "bên trong" (đúng nghĩa inside).
Bỏ qua dòng tiêu đề như "Preposition: giới từ", "Tobe + giới từ".

BƯỚC 2 - GHÉP với đáp án: mỗi từ/cụm tiếng Anh trong đáp án là 1 mục; dấu "=" nối 2 từ thì
tính 2 mục ("next to = beside" là 2 mục). Với mỗi mục, tìm dòng học sinh viết cho mục đó.
Dòng dạng "A = B : nghĩa" (ví dụ "next to = Besind : bên cạnh") nghĩa là A và B DÙNG CHUNG
nghĩa ở cuối dòng: written_en của A là "next to", của B là "Besind", cả hai có written_vi "bên cạnh".
Chữ tiếng Anh em viết (kể cả viết sai) KHÔNG BAO GIỜ là nghĩa tiếng Việt.

BƯỚC 3 - CHẤM NGHĨA: meaning_ok = true nếu nghĩa tiếng Việt em viết đúng nghĩa của mục
(không cần giống chữ đáp án, lỗi dấu nhỏ không sao). Thiếu nghĩa hoặc sai nghĩa là false.
KHÔNG chấm chính tả tiếng Anh - phần đó chương trình tự làm.
other_word = true chỉ khi em thay hẳn bằng một từ tiếng Anh có thật mang nghĩa khác, do hiểu sai từ
(ví dụ viết "site" thay "side" trong outside/inside/beside). Viết sai chữ cái mà không thành từ có thật
("Besind", "Behinh"), hoặc viết nhầm một chữ do nét chữ ("For from" thay "far from") thì là false.

Trả về JSON đúng schema. Với mỗi mục của đáp án có đúng 1 phần tử trong items."""


class Item(BaseModel):
    key_en: str = Field(description="mục tiếng Anh theo đáp án, viết chuẩn, chữ thường")
    written_en: str = Field(description="chữ tiếng Anh học sinh viết, chép nguyên văn; rỗng nếu không viết")
    written_vi: str = Field(description="nghĩa tiếng Việt học sinh viết, nguyên văn; rỗng nếu không viết")
    meaning_ok: bool = Field(description="nghĩa tiếng Việt đúng với mục này")
    other_word: bool = Field(description="em thay bằng một từ tiếng Anh có thật khác nghĩa (site thay side)")
    note: str = Field(description="ghi chú ngắn nếu có gì đáng chú ý, không thì rỗng")


class Grade(BaseModel):
    written_name: str
    items: list[Item]


def api_key() -> str:
    m = re.search(r"^GEMINI_API_KEY=(.+)$", (PROJECT / ".env").read_text(encoding="utf-8"), re.M)
    if not m:
        raise SystemExit("GEMINI_API_KEY not found in .env")
    return m.group(1).strip()


def norm_item(s: str) -> str:
    """Lowercase letters only: spacing, hyphens and case are not spelling errors."""
    return re.sub(r"[^a-z]", "", s.lower())


def letter_errors(written: str, key: str) -> int:
    """Number of letters to add, remove, change or swap to turn `written` into `key`."""
    a, b = norm_item(written), norm_item(key)
    d = [[i + j if i * j == 0 else 0 for j in range(len(b) + 1)] for i in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] != b[j - 1]))
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[len(a)][len(b)]


def error_signature(written: str, key: str) -> tuple:
    """Identify a one-letter error so the same slip in several items counts once
    ('ceilling' in both 'ceiling' and 'ceiling fan')."""
    a, b = norm_item(written), norm_item(key)
    i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
    return (a[max(0, i - 3):i + 2], b[max(0, i - 3):i + 2])


def decide(grade: Grade) -> list[tuple[Item, str, str]]:
    """Apply the teacher's rules; returns (item, verdict, reason) per key item."""
    first_pass = []
    for it in grade.items:
        if not it.written_en.strip():
            first_pass.append((it, "wrong", "không viết"))
            continue
        errs = letter_errors(it.written_en, it.key_en)
        if it.other_word and errs:
            first_pass.append((it, "wrong", "viết thành từ khác"))
        elif errs >= 2:
            first_pass.append((it, "wrong", f"sai {errs} chữ cái"))
        elif errs == 1:
            first_pass.append((it, "light", "sai 1 chữ cái"))
        else:
            first_pass.append((it, "correct", ""))

    # Forgive one light error (all items sharing it), only where the meaning is right.
    candidates = [error_signature(it.written_en, it.key_en)
                  for it, v, _ in first_pass if v == "light" and it.meaning_ok]
    forgiven_sig = max(candidates, key=candidates.count) if candidates else None

    out = []
    for it, v, reason in first_pass:
        if v == "light":
            if it.meaning_ok and error_signature(it.written_en, it.key_en) == forgiven_sig:
                v, reason = "forgiven", "sai 1 chữ cái - được châm chước"
            else:
                v, reason = "wrong", "sai 1 chữ cái (đã dùng lượt châm chước)"
        if v in ("correct", "forgiven") and not it.meaning_ok:
            v, reason = "wrong", (reason + "; " if reason else "") + "sai/thiếu nghĩa"
        out.append((it, v, reason))
    return out


def grade_photo(client, model: str, key_img: Path, photo: Path) -> tuple[Grade, float]:
    resp = client.models.generate_content(
        model=model,
        contents=[
            RULES,
            types.Part.from_bytes(data=key_img.read_bytes(), mime_type="image/jpeg"),
            types.Part.from_bytes(data=photo.read_bytes(), mime_type="image/jpeg"),
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json", response_schema=Grade, temperature=0),
    )
    u = resp.usage_metadata
    cin, cout = PRICES.get(model, (0, 0))
    out_tokens = (u.candidates_token_count or 0) + (u.thoughts_token_count or 0)
    return resp.parsed, u.prompt_token_count * cin / 1e6 + out_tokens * cout / 1e6


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("class_name"), ap.add_argument("date"), ap.add_argument("photos", nargs="+")
    # gemini-2.5-flash-lite returns 404 for new users (checked 2026-09-27)
    ap.add_argument("--model", default="gemini-3.1-flash-lite")
    args = ap.parse_args()

    d, mth = re.findall(r"\d+", args.date)[:2]
    folder = PROJECT / "data" / args.class_name.upper() / f"{int(d)}-{int(mth)}"
    truth = json.loads((folder / "result.json").read_text(encoding="utf-8"))
    client = genai.Client(api_key=api_key())
    out_dir = folder / "gemini"
    out_dir.mkdir(exist_ok=True)

    summary, total_cost = [], 0.0
    for photo in args.photos:
        try:
            grade, cost = grade_photo(client, args.model, folder / "key.jpg", folder / "photos" / f"{photo}.jpg")
        except errors.APIError as e:
            raise SystemExit(f"Gemini API lỗi {e.code} ở ảnh {photo}: {e.message}")
        total_cost += cost
        (out_dir / f"{photo}.json").write_text(grade.model_dump_json(indent=2), encoding="utf-8")

        st = next((s for s in truth["students"] if photo in s.get("photos", [])), None)
        p = st["parts"]["TỪ VỰNG"] if st else {"correct": "?", "total": "?", "wrong": []}
        truth_wrong = {norm_item(w) for w in p["wrong"]}
        verdicts = decide(grade)
        g_wrong = {norm_item(it.key_en) for it, v, _ in verdicts if v == "wrong"}
        g_score = len(verdicts) - len(g_wrong)

        print(f"\n=== {photo} - {st['name'] if st else '?'} (giấy ghi: {grade.written_name}) ===")
        print(f"AI chấm {g_score}/{len(verdicts)}  |  đã duyệt {p['correct']}/{p['total']}")
        for it, v, reason in verdicts:
            k = norm_item(it.key_en)
            mark = "LỆCH" if (k in g_wrong) != (k in truth_wrong) else "    "
            print(f"  {mark} {it.key_en:<16} em viết '{it.written_en}' : '{it.written_vi}' -> {v}"
                  + (f" ({reason})" if reason else ""))
        summary.append((photo, st["name"] if st else "?", g_score, p["correct"],
                        len(g_wrong ^ truth_wrong)))

    print(f"\n{'Ảnh':<10}{'Học sinh':<14}{'Gemini':>7}{'Đã duyệt':>10}{'Mục lệch':>10}")
    for photo, name, g, t, diff in summary:
        print(f"{photo:<10}{name:<14}{g:>7}{t:>10}{diff:>10}")
    exact = sum(1 for *_, diff in summary if diff == 0)
    print(f"\nKhớp hoàn toàn: {exact}/{len(summary)} bài. Model {args.model}, "
          f"tổng chi phí khoảng ${total_cost:.4f}. Kết quả chi tiết: {out_dir}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
