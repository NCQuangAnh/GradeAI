# AI chấm bài - lớp học thêm tiếng Anh

Chấm bài viết tay (ảnh chụp) của các lớp TA6, TA7.1, TA7.2, TA8.1, TA8.2, TA9 và
xuất kết quả theo khuôn Google Sheet "Lưu chấm bài tại đây".

- Chấm một buổi: `/cham-bai <lớp> <ngày>` (quy trình + luật chấm trong
  `.claude/skills/cham-bai/SKILL.md`).
- Nguồn: folder Drive `1x-tIEoZAp5RdGpA_MCenUJ1iZXUxwGbB` (đang chia sẻ công khai
  theo link, đọc không cần đăng nhập). Cấu trúc: `<lớp>/NGÀY dd/m/` gồm ảnh HEIC của
  học sinh và `cham_bai.jpg` (ảnh chụp kết quả cô đã chấm).
- Giai đoạn 1: chấm bằng Claude Code, cô dán `paste.tsv` vào Sheet. Chưa có quyền ghi
  thẳng vào Sheet (cần service account).

## Công cụ (`tools/`, Python 3.11, cần `openpyxl`, `Pillow`)

| Lệnh | Việc |
|---|---|
| `python tools/drive.py tree` | cây lớp/buổi, buổi nào đã chấm |
| `python tools/drive.py fetch TA6 19/9` | tải ảnh về `data/TA6/19-9/photos/` (JPEG) |
| `python tools/drive.py sheet` | tải Sheet điểm về `data/sheet.xlsx` |
| `python tools/history.py TA6` | danh sách lớp + lịch sử điểm/phạt từng em |
| `python tools/crop.py <ảnh> x0 y0 x1 y1` | phóng to một vùng ảnh (tọa độ 0-1) |
| `python tools/report.py TA6 19/9` | từ `result.json` tạo xlsx, tsv, so sánh với cô |

Luật chép phạt: `config/rules.json` (code tính, không để AI tự quyết).

## Git / triển khai

- GitHub: `NCQuangAnh/GradeAI` - repo **công khai**. Không đưa tên học sinh, email, key vào file được commit:
  email người dùng ở Script Properties `ALLOWED_EMAILS`, key ở `GEMINI_*`; test dùng tên giả; `.env`, `data/` bị ignore.
  Folder Drive và file Sheet cũ phải để **Bị hạn chế** (ID của chúng có trong code).
- Apps Script: `.clasp.json` (Script ID, rootDir `webapp`), `.claspignore` chỉ cho đẩy 4 file web + `appsscript.json`.
  Cập nhật: `npx @google/clasp push` rồi `npx @google/clasp create-deployment -i <ID triển khai>` (giữ nguyên link).

## Web app (Google Apps Script) - `webapp/`

Dùng trên điện thoại: chụp bài/đáp án vào folder lớp/ngày, Gemini đọc bài, `Grading.gs` áp luật
(đếm chữ cái sai, châm chước, ghép tên, chép phạt), cô duyệt bảng rồi xuất file Sheet riêng + `cham_bai.png`
vào folder buổi. Cài đặt: `webapp/HUONG_DAN.md`.

- `Grading.gs`, `Gemini.gs` là logic thuần, test bằng Node: `node --test webapp/test/grading.test.js`.
- `node webapp/test/gemini_live.js`: gọi Gemini thật đúng như web (tốn ~2 lượt, ~100đ).
- Key Gemini (Script Properties): `GEMINI_FREE_KEYS` (dùng trước, xoay vòng khi hết lượt) rồi `GEMINI_API_KEY`
  (trả phí). Trạng thái hết lượt lưu ở `KEY_STATE`, reset theo ngày giờ Thái Bình Dương. Phân loại lỗi: `classifyGeminiError`.
- Kết quả mỗi buổi lưu ở `ket_qua_cham.json` trong folder buổi (đáp án đã xác nhận, kết quả từng ảnh, tên cô chọn,
  ảnh bị xóa, bảng đang duyệt). Chấm thêm ảnh chỉ chấm ảnh mới; `mergeTables` giữ các dòng cô đã sửa.
- Đáp án: mỗi phần có `kind` (`word` = "cụm : nghĩa", code chấm chính tả bằng `decideVocab`, hiểu `Ving`/`V-ing`/`doing`,
  `O`/`sb`, phần trong ngoặc tùy chọn, bỏ nhãn đầu dòng "O :"; `formula` = Gemini chấm đúng/sai) và mỗi mục có `id`
  ("1.3", `prepareKey`, giữ nguyên khi sửa). Gemini trả kết quả theo `id`, ghép theo nội dung chứ không theo thứ tự dòng.
- Bài 2 mặt: `pairBackSides_` ghép ảnh không tên với ảnh ngay trước (theo tên file = thời điểm chụp `takenAt`) nếu
  trùng ≤ 2 mục; dòng đó tô vàng. Ảnh chưa nhận ra tên gom theo tên ghi trên giấy (`paperGroup_`); cô chọn tên trùng
  dòng đã có ảnh thì web lưu rồi `buildTable` để gộp (`mergeRowsByName`).
- Test gọi Gemini thật (`gemini_live.js`, `tools/gemini_grade.py`) dùng `GEMINI_FREE_KEYS` trong `.env` trước, hết lượt mới
  sang `GEMINI_API_KEY` (`webapp/test/gemini_keys.js`).
- Danh sách lớp: `danh_sach_lop.json` trong folder lớp (cô sửa trên web, `saveClassRoster`), ưu tiên hơn file chấm gần nhất.
  "Chấm lại tất cả" bỏ các tên cô đặt tạm không có trong danh sách.
- Xem/xóa ảnh: `listFiles`, `getThumbs`, `getImage`, `deleteFile` (chuyển vào Thùng rác, bỏ kết quả, lập lại bảng).
  Mọi chỗ liệt kê file/folder dùng `liveFiles_` / `searchFolders("trashed = false")` để bỏ qua Thùng rác.
- Mỗi dòng bảng có `ai` = giá trị AI đề xuất ban đầu (không đổi khi cô sửa `values`), lưu trong `ket_qua_cham.json`.
  Dữ liệu này để sau vài tuần bàn làm "gợi ý chép phạt theo từng em" (so đề xuất AI với mức cô chốt). Chưa làm.
- Cảnh báo ảnh mờ/tối: `photoQuality` trong `Index.html` (độ nét < 350, độ sáng < 100). Ngưỡng đo bằng
  `tools/calibrate_quality.py` trên ảnh thật (cùng công thức, đã so khớp số với bản JS).
- Ô chép phạt là danh sách chuẩn `PENALTY_OPTIONS` (Index.html) + "Khác (tự gõ)"; luật trong `CONFIG.PENALTY`
  phải ra đúng các chữ trong danh sách này.
- Xem giao diện không cần Google: `.venv/Scripts/python webapp/test/make_preview.py <thư mục>` rồi
  `python -m http.server 8765 --directory <thư mục>` (giả lập `google.script.run` bằng dữ liệu TA6 22/9).
  Điện thoại (<= 720px) bảng thành thẻ, máy tính là bảng.
- Luật chép phạt: đầu `webapp/Code.gs` (`CONFIG`). Email được phép dùng: Script Properties `ALLOWED_EMAILS`.
  `webapp/test/penalty.json` là bản sao cho test - sửa `CONFIG.PENALTY` thì cập nhật cả file này.

## Thử nghiệm Gemini API

- Môi trường riêng: `.venv` (google-genai, openpyxl, Pillow). Key trong `.env` (`GEMINI_FREE_KEYS`, `GEMINI_API_KEY`), không commit.
- `.venv/Scripts/python tools/gemini_grade.py TA6 22/9 IMG_7458 [--model ...]`: chấm 1 ảnh, so với
  `result.json` đã duyệt, in số token và chi phí.
- `gemini-2.5-flash-lite` trả 404 cho tài khoản mới (27/09/2026); mặc định dùng `gemini-3.1-flash-lite`.
