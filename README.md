# Tạp hoá Ông Ba — bộ cảnh TikTok LIVE

Quầy tạp hoá vỉa hè Việt Nam bằng 3D, ông lão ngồi bán hàng và thỉnh thoảng kể chuyện. Bộ cảnh có chuyển động, lời thoại tiếng Việt, bảng điểm quà, mục tiêu nâng cấp quầy và hiệu ứng tương tác qua TikFinity.

## Mở nhanh trên Windows

1. Giải nén đầy đủ thư mục, giữ nguyên `public`, `lib`, `scripts` và các tệp đi kèm.
2. Nhấp đúp **BAT-DAU.cmd** để mở bảng điều khiển.
3. Nhấp đúp **MO-MAN-HINH-PHAT.cmd** để mở cảnh trong cửa sổ **Google Chrome dọc 9:16**, không có thanh địa chỉ và dải đen rộng hai bên. Cửa sổ tự thu nhỏ vừa màn hình theo tỷ lệ **1080 × 1920**; trên màn hình đủ lớn, phần cảnh hiển thị ở đúng kích thước này. Thanh tiêu đề luôn nằm trong màn hình để bạn kéo di chuyển. Mở lại file sẽ đưa cửa sổ cảnh đang mở về đúng kích thước và vị trí. Máy cần cài Google Chrome.
4. Mở **TikFinity Desktop** và **TikTok LIVE Studio** khi cần kết nối phiên LIVE. Bộ cảnh không tự mở hai ứng dụng và không tự bắt đầu phát sóng.

| Màn hình | Địa chỉ |
| --- | --- |
| Bảng điều khiển | [http://127.0.0.1:3210/control](http://127.0.0.1:3210/control) |
| Nguồn hình để phát | [http://127.0.0.1:3210/overlay](http://127.0.0.1:3210/overlay) |

Máy cần **Node.js 22 trở lên** có WebSocket tích hợp. Máy hiện tại đã có Node.js 24. Thư viện 3D và âm thanh đã được đóng kèm; **không cần `npm install` để chạy bản đầy đủ**. Nếu chuyển sang máy khác chưa có Node.js, cài từ [nodejs.org](https://nodejs.org/).

## Đưa vào LIVE Studio

Thêm nguồn **Link / Liên kết** với URL `http://127.0.0.1:3210/overlay`, đặt kích thước **1080 × 1920**, cho vừa khung dọc và bật âm thanh nguồn. Dùng bảng điều khiển để thử câu nói và hiệu ứng trước khi phát.

Kích thước xem trước của cửa sổ Chrome không đổi kích thước nguồn Link: khi phát LIVE, vẫn đặt nguồn **1080 × 1920**.

Nếu nguồn Link không hỗ trợ hình hoặc âm thanh trên bản LIVE Studio của bạn, mở URL cảnh bằng Chrome/Edge, nhấp để cho phép tiếng rồi dùng **Window capture / Chụp cửa sổ** cùng nguồn âm thanh trình duyệt/hệ thống. Ghi thử và xem lại để xác nhận cả hình lẫn tiếng; tránh thu cùng âm thanh hai lần.

Xem [TIKFINITY.md](TIKFINITY.md) để có hướng dẫn kết nối và xử lý lỗi đầy đủ. TikFinity Desktop dùng WebSocket `ws://localhost:21213/`; bộ cảnh tự nối và thử nối lại. Cần TikFinity đang nhận sự kiện từ phòng LIVE để có tương tác thật.

## Nội dung và điều khiển

- **Người dân đi lại thường xuyên:** 6 mẫu nhân vật, hai hướng, mặc định khoảng 4–6 giây có một lượt đi qua. Trong bảng điều khiển có công tắc và khoảng cách 3–15 giây.
- **Khách vừa vào xem:** khi TikFinity gửi lượt vào của một người, bộ cảnh tự cho nhân vật của họ đi qua, không cần bình luận, theo dõi hay tặng quà. Đầu là avatar và có bảng tên của chính người đó. Nhân vật chỉ xuất hiện sau khi tải được đúng ảnh; thiếu ảnh hoặc tải lỗi thì không dùng mặt của người khác hay ảnh mẫu để thay thế.
- Nút **Thử khách vừa vào** dùng avatar có nhãn DEMO. Chỉ số **Lượt vào đã nhận** tính dữ liệu lượt vào trong phiên, không phải số người đang xem và không cộng các lượt thử.

Đã có **cột 16 quà tương tác** theo ảnh, mỗi dòng gồm hình quà TikTok, tên quà, giá xu tham khảo và hành động ông Ba thực hiện. Đã gán sẵn theo ID quà từ danh mục TikFinity; có thể thử hoặc đổi quà trong bảng điều khiển. Xem toàn bộ cách gán trong [QUA-TUONG-TAC.md](QUA-TUONG-TAC.md).

- Cảnh 3D được dựng bằng mã: quầy bánh kẹo, đồ tạp hoá, cây cối và ông lão có chuyển động.
- **38 tệp MP3 tiếng Việt** đã có trong `public/audio`, gồm lời cảm ơn chia sẻ LIVE và phản ứng riêng cho đủ 16 loại tương tác. Lời thoại phát được khi không có mạng; đây là giọng tổng hợp nam với kịch bản có sẵn.
- **Nhạc nền vui tươi “Tiệm vui”**: bản nhạc không lời riêng cho bộ cảnh, dài khoảng 53 giây và phát lặp. Có đàn gảy, marimba và bộ gõ nhẹ; nhạc tự nhỏ xuống khi ông Ba nói. Bật/tắt và chỉnh **Âm lượng nhạc nền** trong mục **Nhịp sống của tiệm**. Nhạc chạy cục bộ, dùng chung nút tắt tiếng và dừng khi tạm nghỉ; màn hình xem trước không phát nhạc. Nếu Chrome chặn tự phát, bấm **Bấm để bật tiếng** một lần ở màn hình phát.
- Khi TikFinity gửi lượt **chia sẻ LIVE**, ông Ba vẫy tay và nói lời cảm ơn riêng; bảng thông báo hiển thị tên người chia sẻ. Tin nhận trùng có cùng mã sự kiện không phát lại lời cảm ơn.
- Bộ chạy dùng font tiếng Việt đóng kèm và chữ Unicode NFC để hiển thị dấu liền chữ trong hộp thoại.
- Gió làm rau, bánh, chai lọ và đồ đạc bay tứ tung. Bão cuốn cả quầy và ông Ba lên; hoạt cảnh kết thúc sẽ trả cảnh về vị trí ban đầu.
- Quà LIVE làm ông cầm điện thoại lên trước mặt. Quà Đàn ca làm ông ôm đàn và gảy nhạc.
- Chó chạy tới, sủa hai cặp “gâu gâu” bằng bản ghi chó thật, nâng chân sau lên từ từ, giữ tư thế tè rồi hạ chân trước khi rời đi. Người đi ngang có thể ném viên sỏi trúng mặt ông, với hiệu ứng va chạm hoạt hình.
- Tiếng chó lấy từ [bản ghi Labrador George của Broadbeer trên Wikimedia](https://commons.wikimedia.org/wiki/File:George_vuf_1996.ogg), được tác giả đưa vào public domain. Tệp WAV và thông tin nguồn nằm trong `public/sfx`, phát cục bộ không cần mạng.
- Quà Ngồi cùng đưa khách đến ngồi uống trà; đầu nhân vật dùng avatar của chính người tặng khi sự kiện TikFinity cung cấp ảnh. Nút thử dùng avatar **DEMO** được ghi rõ; nếu thiếu hoặc không tải được avatar thật, cảnh dùng hình đại diện mặc định.
- Ông lão nói ngẫu nhiên theo thiết lập và phản ứng với các sự kiện được hỗ trợ. Bình luận của người xem không tự được đọc nguyên văn thành tiếng.
- Bảng điều khiển cho phép chỉnh cài đặt và thử hiệu ứng; nút thử có tác động lên mọi màn hình cảnh đang mở, kể cả nguồn đã thêm vào LIVE Studio.
- Cài đặt và số liệu được lưu trong `.runtime/state.json`. Nút đặt lại trong bảng điều khiển xóa số liệu phiên theo chức năng hiển thị.

Bộ cảnh, mô hình 3D và lời thoại có sẵn chạy cục bộ sau khi giải nén. Kết nối phòng LIVE thật qua TikFinity vẫn cần mạng. Không cần cookie hoặc mật khẩu TikTok trong thư mục bộ cảnh.

## Dừng bộ cảnh

Chạy **DUNG-BO-CANH.cmd**. Tệp này chỉ dừng tiến trình Node mà trình khởi động đã ghi lại và xác minh đang chạy đúng `server.mjs` của thư mục này. Nếu máy chủ được mở thủ công bằng terminal, dùng **Ctrl+C** trong terminal đó. Đóng tab trình duyệt không dừng máy chủ.

Nhật ký khởi động nằm trong `.runtime/server.log` và `.runtime/server-error.log`. Nếu cổng 3210 đang được ứng dụng khác sử dụng, bộ khởi động sẽ báo lỗi; không tự dừng ứng dụng đang giữ cổng.

## Kiểm tra và mã nguồn

```powershell
node --test tests/*.test.mjs
node server.mjs
```

Bản chuẩn hóa sự kiện xử lý quà theo số lượng cuối chuỗi, loại trùng khi có mã sự kiện và hỗ trợ các trường cũ/mới của TikFinity. Điểm quà dùng metadata từ sự kiện, không phải tiền thực nhận.

Đã đạt **66 kiểm thử**, gồm đủ 16 ID quà → đúng hành động và hình, xử lý chuỗi/quà trùng, lưu cách gán và cấp tiệm, giữ điểm quà khi tạm nghỉ, dữ liệu avatar và khôi phục đồ đạc sau hiệu ứng, lịch phát bản ghi tiếng chó và hủy âm thanh khi đổi hiệu ứng. Có kiểm thử lượt vào qua WebSocket → màn hình trước mọi bình luận/quà, loại lượt trùng, ảnh đúng người và tách người thật với DEMO. Kết nối TikFinity Desktop, cảnh dọc và phát MP3 đã được kiểm tra cục bộ. **Việc nhận lượt vào cá nhân phụ thuộc dữ liệu TikFinity chuyển về; chưa xác nhận với phòng LIVE thật. Không thể nhận diện avatar từ số người xem tổng hợp hoặc lượt vào ẩn danh không có ảnh. Âm thanh đầu ra LIVE Studio cũng cần được xác nhận trên phiên LIVE của bạn**. Mọi thao tác phát sóng vẫn do bạn thực hiện trong LIVE Studio.

Nếu muốn tạo lại giọng, mã tùy chọn nằm ở `scripts/generate-voice.py`; không cần chạy mã này khi sử dụng 38 MP3 đã có. Bản nhạc nền có thể tạo lại bằng `node scripts/generate-background-music.mjs`; thông tin nằm trong `public/music/SOURCES.json`. Thư viện Three.js và font đi kèm giữ thông tin giấy phép trong `public/vendor` và `public/fonts`.

Để đóng gói lại mã nguồn và tài nguyên sau khi kiểm tra, chạy `powershell -File scripts/package.ps1`. Mặc định script tạo `Bo-LIVE-Tap-Hoa-Ong-Ba-v5.zip` trong thư mục làm việc cha; dùng `-Force` để thay thế một gói của chính bộ cảnh đã có. Nhật ký, trạng thái phiên và `node_modules` không được đưa vào gói.
