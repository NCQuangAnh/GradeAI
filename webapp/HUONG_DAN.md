# Hướng dẫn cài web chấm bài (Google Apps Script)

Làm một lần trên máy tính, khoảng 15 phút. Sau đó dùng trên điện thoại qua một đường link.

## 1. Chia sẻ quyền cho trợ giảng

Đăng nhập Google Drive bằng **tài khoản chủ** (tài khoản sở hữu folder chấm bài và file Sheet):

1. Chuột phải folder gốc chấm bài > Chia sẻ > thêm email của những người cùng chấm, quyền **Người chỉnh sửa**.
   **Quyền truy cập chung** để **Bị hạn chế**.
2. Làm tương tự với file Sheet **Lưu chấm bài tại đây** (web đọc danh sách học sinh từ file này ở lần chấm đầu tiên của mỗi lớp),
   cũng để **Bị hạn chế**.

## 2. Tạo dự án Apps Script

1. Vào https://script.google.com (vẫn tài khoản chủ) > **Dự án mới** (New project).
2. Bấm tên "Dự án không có tiêu đề" ở trên cùng, đổi thành **Chấm bài**.
3. Tạo đủ 4 file, tên phải đúng như sau (Apps Script tự thêm đuôi `.gs` / `.html`):

   | File trong Apps Script | Cách tạo | Dán nội dung từ file |
   |---|---|---|
   | `Code.gs` | có sẵn, xóa hết nội dung cũ | `webapp/Code.gs` |
   | `Grading.gs` | dấu **+** cạnh "Tệp" > **Tập lệnh** (Script), đặt tên `Grading` | `webapp/Grading.gs` |
   | `Gemini.gs` | **+** > **Tập lệnh**, đặt tên `Gemini` | `webapp/Gemini.gs` |
   | `Index.html` | **+** > **HTML**, đặt tên `Index` | `webapp/Index.html` |

4. Bấm biểu tượng **Lưu** (hình đĩa mềm).

## 3. Cài API key Gemini

Web dùng các **key miễn phí trước**, key nào hết lượt thì chuyển sang key miễn phí tiếp theo,
hết tất cả key miễn phí mới dùng **key trả phí**. Lượt miễn phí reset lúc 0h giờ Thái Bình Dương
(khoảng **14-15h giờ Việt Nam**), web tự dùng lại key đó sau giờ này.

- Mỗi key miễn phí phải tạo từ **một tài khoản Gmail khác nhau** (các key trong cùng một tài khoản
  dùng chung lượt, không cộng thêm được).
- Key trả phí nên ở tài khoản **không nằm trong** nhóm tài khoản miễn phí.
- Không dán key vào code hay gửi qua tin nhắn. Key đã lỡ lộ thì xóa trên AI Studio và tạo key mới.

1. Trong Apps Script, bấm **Cài đặt dự án** (bánh răng bên trái).
2. Kéo xuống **Thuộc tính tập lệnh** (Script Properties) > **Thêm thuộc tính tập lệnh**, thêm 3 dòng:

   | Thuộc tính | Giá trị |
   |---|---|
   | `ALLOWED_EMAILS` | email được dùng web (cô và người cùng chấm), cách nhau bằng dấu phẩy |
   | `GEMINI_FREE_KEYS` | các key miễn phí, cách nhau bằng dấu phẩy: `key1,key2,key3` |
   | `GEMINI_API_KEY` | key trả phí |

3. **Lưu thuộc tính**. Thêm/bớt người dùng hoặc key sau này chỉ cần sửa các dòng này, có hiệu lực ngay, không cần triển khai lại.
4. (Nên làm) Ở mục **Múi giờ** chọn `(GMT+07:00) Hà Nội` hoặc Bangkok.

Trên tab **Chấm bài**, web hiện số key miễn phí còn dùng được và key nào đã hết lượt hôm nay.
Chi phí hiển thị chỉ tính các lượt dùng key trả phí.

## 4. Cấp quyền lần đầu

1. Quay lại **Trình chỉnh sửa** (biểu tượng `< >`), mở `Code.gs`.
2. Trên thanh công cụ, chọn hàm `listClasses` > bấm **Chạy**.
3. Google hỏi quyền > **Xem xét quyền** > chọn tài khoản.
4. Màn hình "Google chưa xác minh ứng dụng này" là bình thường (web do chính cô tạo):
   bấm **Nâng cao** > **Đi tới Chấm bài (không an toàn)** > **Cho phép**.
5. Nhật ký hiện danh sách lớp là được.

## 5. Triển khai thành web

1. **Triển khai** (Deploy, góc trên phải) > **Tùy chọn triển khai mới** (New deployment).
2. Bánh răng cạnh "Chọn loại" > **Ứng dụng web** (Web app).
3. Điền:
   - Mô tả: `Chấm bài v1`
   - **Thực thi với tư cách**: `Người dùng truy cập ứng dụng web` (User accessing the web app)
   - **Người có quyền truy cập**: `Bất kỳ ai có Tài khoản Google` (Anyone with Google account)
4. **Triển khai** > sao chép **URL ứng dụng web** (kết thúc bằng `/exec`).
5. Gửi link cho trợ giảng. Chỉ 3 email trong danh sách dùng được; người khác mở link sẽ bị chặn.

Lần đầu mỗi người mở link trên điện thoại cũng gặp màn hình cấp quyền như bước 4: làm tương tự.

## 6. Khi đã chạy ổn

- Đặt folder gốc chấm bài về chế độ **Bị hạn chế** (Chia sẻ > Quyền truy cập chung).
  Web vẫn chạy vì dùng quyền của từng tài khoản, không cần link công khai nữa.

## Cập nhật code sau này (dùng clasp, không cần dán tay)

Code nằm trên GitHub (`NCQuangAnh/GradeAI`, không chứa email, key hay tên học sinh) và được đẩy lên Apps Script bằng **clasp**.
File `.clasp.json` đã ghi Script ID; `.claspignore` chỉ cho đẩy `Code.gs`, `Grading.gs`, `Gemini.gs`,
`Index.html`, `appsscript.json` (không đẩy file test).

**Làm một lần:**
1. Bật **Google Apps Script API** tại https://script.google.com/home/usersettings (tài khoản chủ).
2. Trong thư mục project chạy `npx @google/clasp login`, trình duyệt mở ra, đăng nhập **tài khoản chủ** > Cho phép.
3. `npx @google/clasp push -f` - thay toàn bộ code trên Apps Script bằng code trong `webapp/`
   (`-f` để ghi đè cả file cấu hình `appsscript.json`, chỉ cần lần đầu).
4. Nếu chưa triển khai lần nào: `npx @google/clasp create-deployment -d "v1"`. Lệnh in ra **ID triển khai**;
   link web là `https://script.google.com/macros/s/<ID triển khai>/exec`. Ghi lại ID này.
   Nếu đã triển khai bằng giao diện rồi: `npx @google/clasp list-deployments` để xem ID.

**Mỗi lần sửa code:**
```
git add -A
git commit -m "mô tả thay đổi"
git push
npx @google/clasp push
npx @google/clasp create-deployment -i <ID triển khai> -d "mô tả thay đổi"
```
Link web giữ nguyên. Key Gemini trong Script Properties không bị ảnh hưởng.

Lưu ý: `clasp push` **thay toàn bộ** code trên Apps Script. Đừng sửa code trực tiếp trong trình soạn thảo
Apps Script nữa; nếu lỡ sửa ở đó thì chạy `npx @google/clasp pull` trước để lấy về máy.

Thêm/bớt người dùng: sửa `ALLOWED_EMAILS` trong Script Properties (có hiệu lực ngay), nhớ chia sẻ folder và file Sheet cho email mới.
Đổi luật chép phạt: sửa mục `PENALTY` ở đầu `Code.gs`.

---

# Cách dùng hằng ngày (trên điện thoại)

**Tab 1. Chụp bài**
1. Chọn **Lớp**. Chọn **Buổi** có sẵn, hoặc mở **+ Tạo buổi mới** > bấm **Hôm nay** (hoặc gõ `DD/MM/YY`) > **Tạo folder buổi**.
2. **Chụp đáp án** (hoặc chọn ảnh key). Tải lại sẽ thay đáp án cũ.
   Đáp án nhiều trang: chọn nhiều ảnh cùng lúc, hoặc chụp trang 1 rồi bấm **+ Thêm trang đáp án**.
3. **Chụp bài** từng tờ, hoặc **Chọn nhiều ảnh** từ thư viện. Ảnh được thu nhỏ trước khi tải lên.
   Ảnh nào lỗi (thẻ đỏ) thì chụp lại ảnh đó.
   Ảnh **mờ hoặc tối** được báo ngay (khung cam): bấm **Bỏ, chụp lại** rồi chụp lại, hoặc **Vẫn tải lên** nếu cô thấy vẫn đọc được.
   Việc kiểm tra chạy trên điện thoại, không tốn tiền. Trang giấy gần như trắng (em viết rất ít) đôi khi cũng bị báo mờ: cứ bấm Vẫn tải lên.
4. **Ảnh trong buổi này**: lưới ảnh thu nhỏ của mọi ảnh bài và đáp án (nhãn Đáp án / Đã chấm / Chưa chấm).
   Bấm một ảnh để xem to; chạm vào ảnh để phóng to đọc chữ; vuốt trái/phải hoặc bấm Trước/Sau để chuyển ảnh.
   Ảnh chụp nhầm: bấm **Xóa ảnh này**, rồi bấm lần nữa để xác nhận. Ảnh vào Thùng rác Drive, khôi phục được trong 30 ngày.
   Ảnh đã chấm mà bị xóa thì bảng chấm tự lập lại: em đó được chấm lại từ các ảnh còn lại (hoặc thành "không có ảnh").
   Ở bảng chấm, bấm "ảnh 1", "ảnh 2" cũng mở đúng ảnh đó để xem hoặc xóa.

**Tab 2. Chấm bài**
1. **Đọc đáp án** > xem số mục có đúng không; sửa, **Xóa** mục thừa hoặc **+ Thêm mục** còn thiếu > **Đúng, chấm ... bài**.
2. Chờ chấm từng ảnh (vài giây một ảnh). **Giữ màn hình sáng**; lỡ tắt thì mở lại, bấm **Chấm ảnh mới**
   (ảnh đã chấm không mất). Nếu 2 bài đầu không khớp đáp án, web dừng lại hỏi.
3. Duyệt **bảng chấm**: sửa điểm, từ sai, chép phạt, ghi chú ngay trên bảng.
   Dòng cam = cần cô xem (chữ gạch xóa, tên chưa ghép được, gộp 2 ảnh, có ảnh mới); sửa một ô trong dòng thì hết cam.
   Dòng xám = không có ảnh bài. Ảnh chưa nhận ra tên: chọn tên ở ô đầu, dòng "không có ảnh" trống của em đó tự bỏ.
   Web không cho xuất khi còn dòng chưa có tên hoặc trùng tên.
   Sửa thẳng vào ô: điểm ("12/13 từ"), từ viết sai, ghi chú. Mọi chỉnh sửa tự lưu.
   **Chép phạt** chọn trong danh sách: Không phạt, từ viết sai x10 / x15 lần, từ mới x10 / x15 lần,
   toàn bộ x10 / x15 lần, hoặc **Khác (tự gõ)**. Nên dùng mức có sẵn để sau này theo dõi được mức phạt từng em.
   Trên điện thoại bảng hiện thành từng thẻ; trên máy tính là bảng. Nút xuất luôn nằm ở đáy màn hình.
   Em không có ảnh bài (dòng xám): chọn **Vắng**, **Không có bài** hoặc để trống.
4. **Chốt và xuất**: web tạo file Sheet **Chấm bài <lớp> - <ngày>** và ảnh **cham_bai.png**
   trong đúng folder lớp/ngày.
5. **Sửa sau khi đã xuất**: bảng vẫn sửa được ngay bên dưới (hôm sau thì mở buổi đó > **Xem / sửa bảng chấm**).
   Sửa xong web báo đỏ "Bảng đã sửa sau lần xuất" > bấm **Xuất lại**: file Sheet được cập nhật, ảnh bảng chấm cũ
   vào Thùng rác và thay bằng ảnh mới.

**Chấm thêm ảnh vào buổi đã chấm** (ví dụ hôm nay 4 ảnh, hôm sau thêm 6 ảnh):
- Tải 6 ảnh mới vào đúng buổi đó > tab Chấm bài hiện **"4 đã chấm, 6 ảnh mới"** > bấm **Chấm 6 ảnh mới**.
  Web chỉ chấm 6 ảnh mới, dùng lại đáp án đã xác nhận.
- Bảng chấm gộp cả 10 bài. Những dòng cô đã sửa ở lần trước được giữ nguyên; em nào có thêm ảnh mới
  thì dòng đó được chấm lại và ghi chú "Có ảnh mới".
- Xuất lại: file Sheet và ảnh bảng chấm được cập nhật đủ 10 bài.
- Nếu đã thay ảnh đáp án, web báo và gợi ý đọc đáp án mới, chấm lại tất cả.
- Dòng cô bấm **Xóa** (ví dụ ảnh chụp nhầm) thì ảnh đó không bị chấm lại nữa.

Kết quả chấm và bảng đang sửa được lưu trong folder buổi (file `ket_qua_cham.json`, đừng xóa file này),
nên cô và trợ giảng mở trên máy nào cũng thấy cùng kết quả, lỡ tắt trang cũng không mất.

Chi phí Gemini khoảng 50đ một bài, hiện ngay trên web khi chấm.
