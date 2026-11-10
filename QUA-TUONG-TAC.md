# 16 quà tương tác của Tạp hoá Ông Ba

Hình quà nằm ở bên trái cột trong màn hình phát. Tặng quà đó qua TikTok để kích hoạt hành động bên phải; bộ cảnh nhận sự kiện trực tiếp từ TikFinity.

| Hành động | Quà TikTok | ID | Xu tham khảo |
| --- | --- | --- | ---: |
| Mua rau | Hoa hồng | 5655 | 1 |
| Mua bánh | Lát bánh ngọt | 6784 | 1 |
| Vật liệu | GG | 6064 | 1 |
| Sữa | Kem ốc quế | 5827 | 1 |
| Bánh | Bánh quy sô-cô-la chip | 6416 | 5 |
| Ngồi cùng | Bắn tim | 5487 | 5 |
| Thời tiết | Cầu vồng | 8723 | 1 |
| Gió lớn I | Trao nụ hôn gió | 7832 | 1 |
| Gió lớn II | Hạc giấy | 5659 | 99 |
| LIVE | TikTok | 5269 | 1 |
| Đàn ca | Ghi ta | 7883 | 99 |
| Lên cấp nhà | Bàn tay tạo hình trái tim | 6968 | 100 |
| Bão | Chiếc ô | 7015 | 150 |
| Chó sủa | Chó Corgi | 6267 | 299 |
| Ném đá | Găng tay đấm bốc vàng | 5853 | 10 |
| Hỏi ông | Rosa | 8913 | 10 |

Đổi cách gán tại http://127.0.0.1:3210/control, mục Quà tặng → Ông Ba tương tác. Mỗi quà chỉ gán cho một hành động. Nút Thử không cộng điểm và không nâng cấp vĩnh viễn.

Quà Lên cấp nhà thật nâng tiệm một cấp cho mỗi quà trong chuỗi đã hoàn tất, tối đa cấp 5. Trạng thái cấp, điểm và cách gán được lưu trên máy. Mưa và gió do quà tạo ra tự kết thúc; sau đó cảnh dùng lại thời tiết đã chọn.

## Hoạt cảnh và lời thoại bản v5

| Quà tương tác | Phản ứng trong cảnh |
| --- | --- |
| Mua rau, Mua bánh, Vật liệu, Sữa, Bánh | Ông nhận đúng món hàng và nói lời cảm ơn riêng cho món đó. |
| Ngồi cùng | Một khách ngồi uống trà cạnh ông; đầu nhân vật thay bằng avatar người tặng khi TikFinity gửi ảnh. |
| Thời tiết | Mưa ghé tiệm; ông mời bà con vào mái hiên. |
| Gió lớn I, Gió lớn II | Đồ đạc và hàng hoá bay tứ tung; gió cấp II mạnh hơn, ông lên tiếng giữ đồ. |
| LIVE | Ông cầm điện thoại lên để chào khán giả. |
| Đàn ca | Ông ôm đàn, đặt tay lên cần đàn và gảy nhạc. |
| Lên cấp nhà | Tiệm nâng cấp có lưu lại, thêm kệ, mái hiên, ghế, đèn hoặc trang trí theo cấp. |
| Bão | Bão cuốn bay cả đồ đạc, quầy và ông Ba; sau hoạt cảnh, cảnh tự trở về trạng thái trước đó. |
| Chó sủa | Chó chạy lại, sủa “gâu gâu” bằng bản ghi chó thật, nâng chân sau, giữ tư thế tè rồi hạ chân trước khi đi; ông có câu trách yêu riêng. |
| Ném đá | Người đi ngang ném viên sỏi trúng mặt ông; ông giật mình, có dấu va chạm hoạt hình và lời thoại phản ứng. |
| Hỏi ông | Ông quay sang người xem và kể một câu chuyện hoặc trả lời thân thiện theo kịch bản. |

Bộ giọng có **36 MP3**, gồm 20 đoạn dành riêng cho 16 tương tác. Bình luận của người xem không được tự đọc nguyên văn; Hỏi ông dùng câu trả lời có sẵn. Tiếng chó là [bản ghi Labrador George](https://commons.wikimedia.org/wiki/File:George_vuf_1996.ogg) của Broadbeer, public domain, được đóng kèm bộ chạy. Nhạc đàn và các hiệu ứng khác được tạo trong bộ cảnh.

Avatar thật phụ thuộc ảnh người gửi trong dữ liệu TikFinity. Nút **Thử** dùng ảnh đầu **DEMO** được ghi rõ, không phải avatar của một người xem thật. Khi dữ liệu không có avatar hoặc ảnh không tải được, nhân vật dùng hình đại diện mặc định. Chưa kiểm chứng avatar hoặc quà từ phòng LIVE thật.

Nguồn: [danh mục TikFinity](https://tikfinity.zerody.one/api/getAllGifts?lang=vi-VN&client=giftlist), hình gốc từ TikTok CDN; metadata kiểm tra 09/11/2026. Giá và quà khả dụng có thể khác theo tài khoản/phòng LIVE. Mở bảng quà của phòng để đối chiếu trước khi phát.

Không cần tạo 16 Action riêng trong TikFinity: giữ TikFinity Desktop kết nối với phòng LIVE, bộ cảnh tự nhận Event API ở cổng 21213 rồi đối chiếu ID quà.
