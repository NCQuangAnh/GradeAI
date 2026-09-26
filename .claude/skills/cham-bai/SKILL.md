---
name: cham-bai
description: Chấm bài tập viết tay của lớp học thêm tiếng Anh (từ vựng "từ tiếng Anh: nghĩa tiếng Việt", công thức/cấu trúc, quy tắc trọng âm) từ ảnh trên Google Drive, xuất kết quả đúng khuôn Google Sheet của cô. Dùng khi được yêu cầu "chấm TA6 22/9", "/cham-bai TA7.1 23/9", hoặc hỏi buổi nào chưa chấm.
argument-hint: <lớp> <ngày>   ví dụ: TA7.1 23/9
---

# Chấm bài từ ảnh viết tay

Đầu vào: `$ARGUMENTS` = lớp và ngày (ví dụ `TA7.1 23/9`). Thiếu thì chạy
`python tools/drive.py tree`, liệt kê các buổi chưa có "(graded)" và hỏi cô chấm buổi nào.

## 1. Lấy dữ liệu

```
python tools/drive.py sheet                 # tải lại Sheet điểm (lịch sử + danh sách lớp)
python tools/drive.py fetch <lớp> <ngày>    # tải ảnh về data/<LỚP>/<d-m>/photos/*.jpg
python tools/history.py <lớp>               # danh sách lớp theo thứ tự + lịch sử từng em
```

Xem các cột buổi gần nhất của lớp đó để biết buổi này có những phần nào
(TỪ VỰNG, CÔNG THỨC, CÂU GIÁN TIẾP, QUY TẮC TRỌNG ÂM...).

## 2. Đọc từng ảnh

Đọc TẤT CẢ ảnh trong `photos/` bằng Read. Với mỗi ảnh ghi lại vào
`data/<LỚP>/<d-m>/transcripts.json`:
- tên học sinh ghi trên giấy (nguyên văn),
- từng dòng **đúng như em viết**, giữ nguyên lỗi chính tả, chữ gạch xóa thì bỏ,
- chỗ nào không chắc: phóng to bằng `python tools/crop.py <ảnh> x0 y0 x1 y1`
  (tọa độ 0-1) rồi Read ảnh zoom.

Một em có thể có nhiều ảnh (trang từ vựng + trang công thức) - gộp lại.
Một ảnh có thể có hai tờ - tách ra.

## 3. Dựng đáp án

Nếu `drive.py fetch` báo "answer key" thì Read `data/<LỚP>/<d-m>/key.jpg` và dùng đúng
đáp án đó. Kiểm tra key có khớp với bài học sinh không (cùng chủ đề, cùng số từ); không khớp
thì dừng lại hỏi cô, đừng chấm theo key sai.
Dòng tiêu đề không đánh số trong key ("Preposition: giới từ", "Tobe + giới từ") không tính điểm.

Không có key thì tự dựng từ nội dung cả lớp viết + kiến thức của mình:
- mục nào đa số học sinh đều viết thì là mục của bài học;
- **mỗi từ/cụm tiếng Anh tính 1, mỗi dấu "=" là 2 từ** (cô đã xác nhận):
  "have to = must: phải" là 2 từ; "cozy = comfortable" là 2 từ;
- mỗi công thức / quy tắc = 1;
- tự kiểm tra chính tả và nghĩa của từng mục đáp án.

So tổng số với mẫu số các buổi trước (thường 10-14 từ). Lệch nhiều thì xem lại.

## 4. Luật chấm (cô đã xác nhận 27/09/2026)

- **Sai chính tả tiếng Anh = sai cả từ**: thừa/thiếu chữ ("ceilling", "well-know"),
  sai chữ ("famours").
- **Châm chước 1 lỗi chính tả mỗi bài**: bỏ qua một lỗi chính tả (viết đúng từ nhưng
  thừa/thiếu/sai chữ cái). Cùng một lỗi lặp lại ở nhiều mục tính là 1 lỗi và được bỏ qua hết
  (ví dụ viết "ceilling" ở cả ceiling và ceiling fan: bỏ qua cả hai). Bài có nhiều lỗi
  chính tả thì bỏ qua lỗi nhẹ nhất. Ghi mục được bỏ qua vào `forgiven`, không vào `wrong`.
  Không châm chước cho: thiếu từ, thiếu nghĩa, viết thành từ khác ("some use"),
  thiếu thành phần của cụm ("Famous" thay vì "famous for" là sai - cô đã xác nhận).
- Cô đã xác nhận 27/09/2026 (sau khi so bài TA6 22/9):
  - chỉ châm chước lỗi nhẹ: khác 1 chữ cái ("bellow", "fron", "opposit"). Sai từ 2 chữ trở lên
    ("basind", "Besind", "Appsoite", "Belove") là sai luôn;
  - viết thành một từ tiếng Anh khác ("Out Site" thay "outside") là sai, không châm chước;
  - có nhiều lỗi nhẹ thì châm chước mục mà ngoài lỗi chính tả ra vẫn đúng (không phí lượt
    châm chước cho mục đằng nào cũng sai vì thiếu nghĩa);
  - viết tách/liền ("in side", "out side", "infrontof") không tính lỗi.
- Mục sai **chỉ vì nghĩa** (thiếu nghĩa, sai nghĩa, còn tiếng Anh đúng hoặc được châm chước)
  thì ghi thêm vào `meaning_wrong` để báo cáo tính được điểm "nếu bỏ qua nghĩa".
- **Nghĩa tiếng Việt luôn được chấm** (cô xác nhận: buổi TA6 22/9 cô quên trừ, AI trừ là đúng):
  chỉ cần đúng nghĩa của từ, không cần giống chữ trong đáp án.
  Lỗi dấu/chính tả tiếng Việt nhỏ ("nghỉ nghơi") không trừ.
- Thiếu từ, thiếu nghĩa, viết bỏ dở ("must =") đều tính sai.
- **Nét chữ khác lỗi chính tả**: nếu một chữ cái được viết cùng một kiểu trong cả bài
  (ví dụ f viết giống S ở mọi chỗ) thì coi là nét chữ, cho đúng, nhưng ghi chú để cô xem.
- Công thức: đúng thành phần, thứ tự, dạng động từ là đúng. Sai một thành phần là sai
  cả công thức (ví dụ câu trần thuật gián tiếp dùng "asked" là sai).
- Chỗ nào vẫn không chắc sau khi phóng to: chọn cách đọc hợp lý nhất và ghi chú "cô xem lại".

## 5. Ghép tên

Tên trên giấy thường viết tắt (kiểu "K.Vy", "LQMai", chỉ tên cuối, bỏ dấu). Ghép với danh sách lớp
từ `history.py`. Nếu hai em trùng tên trong cùng lớp mà không phân biệt
được thì hỏi cô. Em có trong danh sách mà không có ảnh thì `"status": "không có bài"`.
Ảnh có tên lạ hoặc bài của lớp/buổi khác thì ghi vào `unmatched_photos` (photo, written_name, note).

## 6. Ghi kết quả

Viết `data/<LỚP>/<d-m>/result.json` theo đúng schema của `data/TA6/19-9/result.json`:
học sinh theo **thứ tự danh sách lớp**, mỗi phần có `correct`, `total`, `wrong`
(tên từ tiếng Anh chuẩn theo đáp án), `forgiven` (mục được châm chước, tính là đúng),
`notes` ghi rõ em viết sai thế nào.
Không tự ghi chép phạt; phần đó do code tính từ `config/rules.json`
(`penalty_override` chỉ dùng khi cô yêu cầu). Cô tự review phần chép phạt sau, nên cứ
áp luật chung, không tự nới hay siết theo từng em.

Sau đó chạy:

```
python tools/report.py <lớp> <ngày>
```

Lệnh này tạo `cham_bai_AI.xlsx` (khuôn giống Sheet, có cột GHI CHÚ AI), `paste.tsv`
(copy dán vào Google Sheet) và `compare.md` nếu cô đã chấm buổi này rồi.

## 7. Báo cáo cho cô

- bảng tóm tắt điểm + chép phạt đề xuất,
- danh sách các bài cần cô xem lại (từ notes), mỗi dòng một bài,
- đường dẫn tới file xlsx / tsv,
- nhắc: chép phạt chỉ là đề xuất theo luật chung, cô chỉnh theo từng em.

Cô sửa kết quả hoặc giải thích luật mới thì cập nhật mục 4 của file này hoặc
`config/rules.json` để lần sau chấm đúng như vậy.
