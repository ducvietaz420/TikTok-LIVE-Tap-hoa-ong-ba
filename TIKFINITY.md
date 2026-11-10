# Kết nối Tạp hoá Ông Ba với TikFinity và TikTok LIVE Studio

Bộ cảnh chạy tại máy này, gồm mô hình 3D động, lời thoại tiếng Việt có sẵn và phản ứng với sự kiện. Khung phát dọc là **1080 × 1920 (9:16)**. Cổng của bộ cảnh là **3210**; cổng **21213** thuộc TikFinity. Giữ cả hai ứng dụng chạy trong lúc dùng.

## 1. Mở bộ cảnh

1. Nhấp đúp **BAT-DAU.cmd**. Máy cần Node.js 22 trở lên; Node.js 24 đã có sẵn khi kiểm tra.
2. Bảng điều khiển: [http://127.0.0.1:3210/control](http://127.0.0.1:3210/control).
3. Cảnh đưa lên LIVE: [http://127.0.0.1:3210/overlay](http://127.0.0.1:3210/overlay).
4. Dùng nút thử trong bảng điều khiển để kiểm tra lời thoại và hiệu ứng trước khi phát. Các nút thử cũng tác động lên nguồn cảnh đang mở trong LIVE Studio.

## 2. Kết nối TikFinity

1. Mở **TikFinity Desktop**, đăng nhập hoặc hoàn tất Setup rồi nhập đúng **@username** của kênh TikTok. Dùng tên tài khoản, không dùng tên hiển thị.
2. Kết nối TikFinity đến phòng LIVE của kênh. Sự kiện thật chỉ đến khi TikFinity nhận được sự kiện từ phòng đang LIVE.
3. Trong TikFinity, tìm phần **Event API**. Theo [tài liệu chính thức TikFinity](https://tikfinity.zerody.one/?from=tikstream.app), WebSocket nội bộ là `ws://localhost:21213/`; bản Desktop phải chạy trên cùng máy. Bộ cảnh tự nối đến địa chỉ này và thử nối lại khi TikFinity tắt/mở.
4. Kiểm tra trạng thái TikFinity trên bảng điều khiển. Kết nối WebSocket thành công xác nhận cầu nối đến TikFinity; vẫn cần đối chiếu một sự kiện thực từ phòng LIVE để xác nhận toàn bộ đường truyền.

Không cần tạo từng Action trong TikFinity cho bộ cảnh: phần mềm nhận sự kiện qua Event API và áp dụng phản ứng ở bảng điều khiển. Có thể tiếp tục dùng các overlay/Action khác của TikFinity; tránh bật hai tiếng TTS cùng đọc một sự kiện nếu không muốn âm thanh chồng lên nhau.

## 3. Thêm vào TikTok LIVE Studio

1. Chọn hoặc tạo cảnh **dọc 9:16** trong LIVE Studio.
2. Chọn **Add source / Thêm nguồn → Link / Liên kết** rồi dán `http://127.0.0.1:3210/overlay`.
3. Nếu có **Custom resolution**, đặt **Width 1080**, **Height 1920**. Cho nguồn vừa khung cảnh và kiểm tra không bị cắt. Chỉ thêm URL `/overlay`; URL `/control` chứa nút điều khiển riêng của bạn.
4. Bật âm thanh cho nguồn nếu LIVE Studio cung cấp tùy chọn này, kiểm tra trong bộ trộn âm thanh, rồi thử một câu nói. [Hướng dẫn của TikFinity](https://blog.tikfinity.com/how-to-use-tiktok-live-studio/) xác nhận cách dùng nguồn Link và khuyên kiểm tra bằng bản ghi trong LIVE Studio.
5. Ghi thử một đoạn ngắn, xem lại cả hình và tiếng. Bản ghi xác nhận âm thanh thực sự đi vào đầu ra; nghe thấy tiếng từ loa máy chưa đủ để xác nhận.

### Nếu nguồn Link không chạy hình hoặc tiếng

Mở `/overlay` bằng Chrome/Edge, nhấp vào cảnh để cho phép phát tiếng nếu trình duyệt yêu cầu, rồi dùng **Window capture / Chụp cửa sổ** trong LIVE Studio để lấy cửa sổ cảnh. Đưa cửa sổ sang toàn màn hình hoặc cắt bỏ thanh trình duyệt; giữ cửa sổ đang mở. Nếu dùng cách này, thêm âm thanh ứng dụng/trình duyệt hoặc âm thanh hệ thống trong LIVE Studio theo tùy chọn có sẵn. Tránh thu tiếng đồng thời từ hai nguồn.

Tên nguồn và quyền sử dụng có thể khác theo bản LIVE Studio/tài khoản. Nếu mục nguồn bị khóa, bấm vào mục đó để xem lý do ứng dụng nêu; bộ cảnh không tự mở khóa quyền LIVE.

## 4. Kiểm tra khi thiếu sự kiện

| Hiện tượng | Kiểm tra trực tiếp |
| --- | --- |
| Không mở được `/control` hoặc `/overlay` | Chạy lại BAT-DAU.cmd; kiểm tra nhật ký `.runtime/server-error.log` và cổng 3210; không đổi URL sang HTTPS. |
| Cảnh chạy nhưng TikFinity chưa kết nối | TikFinity **Desktop** đã mở; Event API dùng cổng 21213; TikFinity và bộ cảnh cùng máy. |
| Đã kết nối nhưng không thấy quà/bình luận thật | TikFinity đã nối đúng @username và đang nhận sự kiện của phòng LIVE. Nút thử của bộ cảnh chỉ kiểm tra phần bộ cảnh. |
| Có phụ đề nhưng không có tiếng | Bật tiếng nguồn, âm lượng và bộ trộn LIVE Studio; thử mở cảnh bằng trình duyệt và nhấp cho phép âm thanh. |
| Cảnh giật | Hạ chất lượng trong bảng điều khiển, đóng các cửa sổ xem cảnh không dùng, giảm số nguồn LIVE Studio. |

## Ghi chú kỹ thuật và giới hạn kiểm chứng

- Event API dùng JSON `{ "event": "gift", "data": { ... } }`. Bộ chuẩn hóa nhận cả trường cũ dạng phẳng và trường mới lồng trong `user`, `gift`, `common`.
- Quà có thể phát nhiều bản cập nhật cho một chuỗi. Bộ cảnh đợi kết thúc chuỗi loại 1 rồi tính `diamondCount × repeatCount`, đồng thời loại trùng theo mã thông điệp/chuỗi khi có. Đây là **điểm quà từ dữ liệu TikTok**, không phải tiền thực nhận. Cách xử lý chuỗi dựa trên [hướng dẫn của TikTok-Live-Connector](https://ttlc.docs.isaackogan.com/guides/gifts/).
- Không tự đọc thành tiếng mọi bình luận của khán giả; lời thoại có sẵn thuộc bộ cảnh. Lời thoại ngẫu nhiên không cần mạng sau khi tải đủ thư mục.
- Đã mở TikFinity và LIVE Studio, xác nhận bộ cảnh kết nối WebSocket TikFinity thành công. Chưa có phòng LIVE thật để xác nhận quà thật. Các phép thử giả lập kiểm tra logic và hiển thị, không thay thế thử sự kiện thật.
- Cầu nối dùng WebSocket tích hợp trong Node.js, yêu cầu **Node.js ≥ 22**, không cần cài thêm thư viện TikTok-Live-Connector hay đưa cookie TikTok vào bộ cảnh.

Đường dẫn ứng dụng đã thấy trên máy:

```text
C:\Users\Admin\AppData\Local\Programs\tikfinity\TikFinity.exe
C:\Program Files\TikTok LIVE Studio\TikTok LIVE Studio Launcher.exe
```

Tài liệu kiểm tra ngày **09/11/2026**. Phần lựa chọn nguồn cụ thể vẫn cần đối chiếu giao diện LIVE Studio trên máy.

## Người dân và khách vừa vào xem

Bảng điều khiển có mục **Người dân & khách ghé xem**. Người dân giả đi hai chiều thường xuyên, mặc định khoảng 5 giây một lượt; có thể bật/tắt hoặc chỉnh 3–15 giây. Đây là nhân vật nền, không được tính thành người xem TikTok.

Khi nhận sự kiện vào xem cá nhân `member` có danh tính và avatar từ TikFinity, bộ cảnh xếp nhân vật người đó đi qua ngay cả khi họ chưa bình luận hoặc tặng quà. Avatar và tên luôn đi cùng một người; ảnh tải xong mới cho nhân vật xuất hiện. Không có ảnh hoặc ảnh lỗi thì không hiển thị bằng khuôn mặt người khác. Nhân vật mới không ngắt giọng hoặc hiệu ứng quà đang chạy.

Nút **Thử khách vừa vào** dùng ảnh mẫu với nhãn DEMO, không tăng điểm hay bộ đếm lượt vào thật. Tạm nghỉ hoặc bão sẽ giữ khách chờ; cảnh tiếp tục xử lý khi hoạt động lại. Khi đông người, các nhân vật được xếp hàng để giữ khung hình dễ nhìn.

Việc TikFinity có chuyển từng lượt vào về Event API còn phụ thuộc phiên bản và dữ liệu TikTok cung cấp. `roomUser` chỉ chứa tổng số người xem thì không đủ để tìm avatar từng người; bộ cảnh không tự tạo danh tính từ con số đó. Nên đối chiếu bằng một lượt vào thật khi đang LIVE. Chưa kiểm chứng với phòng LIVE thật trong lần phát triển này.
