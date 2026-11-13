# Quản lý bình luận trong SocialDesk Local

Chạy **CHAY-LOCAL.cmd**, mở **http://localhost:8787**, đăng nhập rồi chọn **Bình luận** ở thanh bên.

## Chuẩn bị quyền Facebook

Ứng dụng dùng thêm `pages_read_user_content` để đọc nội dung do người dùng viết và `pages_manage_engagement` để quản lý tương tác. Giữ các quyền đăng bài hiện có: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.

1. Mở Meta App đã tạo, vào **Use cases → Manage everything on your Page → Customize**.
2. Thêm các quyền `pages_read_user_content` và `pages_manage_engagement` nếu chúng có trong danh sách quyền của ứng dụng. Hoàn tất các yêu cầu Meta hiển thị cho quyền và tài khoản thử nghiệm của bạn.
3. SocialDesk mặc định xin cả quyền quản lý bài viết và bình luận. Không có ô bật/tắt bình luận và không cần biến cấu hình riêng cho chức năng này.
4. Trong wizard SocialDesk, bấm **Mở Facebook và chọn Fanpage**, rồi đồng ý các quyền trên Facebook. Với Fanpage đã kết nối, bấm **Kiểm tra kết nối → Cho phép thêm quyền**. Token cũ không tự nhận thêm quyền.
5. Chọn Fanpage bạn có quyền quản lý. Với Meta App thử nghiệm, tài khoản Facebook phải có vai trò phù hợp trong ứng dụng.

Mọi lần kết nối và kết nối lại đều xin đủ năm quyền bên trên. Cấu hình cũ `META_COMMENTS_ENABLED=false` không còn vô hiệu hóa bình luận; trình khởi chạy tự loại bỏ biến cũ mà giữ nguyên App Secret, khóa mã hóa và dữ liệu. Wizard hiển thị **Cần cấp thêm quyền bình luận** nếu Fanpage chỉ có quyền đăng bài. Chỉ báo sẵn sàng đầy đủ khi đã xác minh đủ quyền.

Nếu Facebook báo **Invalid Scopes: pages_read_user_content, pages_manage_engagement**, hai quyền này chưa được Facebook chấp nhận trong yêu cầu của ứng dụng hiện tại. Người cài đặt cần kiểm tra và thêm quyền trong Meta App ở bước 1–2 trước khi kết nối lại. Việc đặt chức năng thành mặc định trong SocialDesk không thay thế cấp quyền của Meta. Không cần xóa Fanpage hoặc tạo lại khóa mã hóa.

Nếu bản local chưa có thông tin Meta App, chạy **CAU-HINH.cmd** để nhập App ID/App Secret trực tiếp trên máy; khởi động lại **CHAY-LOCAL.cmd**. Callback local là `http://localhost:8787/api/facebook/callback`. Giữ trống địa chỉ Internet khi chỉ dùng trên máy.

## Sử dụng

- Chọn Fanpage, sau đó chọn bài viết. Danh sách lấy từ Facebook nên có cả bài đăng bên ngoài SocialDesk.
- Chọn **Tải thêm bài viết** để duyệt các bài cũ hơn.
- Dùng ô tìm kiếm để tìm trong nội dung và tên người bình luận đã tải. Các bộ lọc gồm **Tất cả**, **Đang hiện**, **Đã ẩn**.
- **Viết bình luận** tạo bình luận mới với tư cách Fanpage; **Trả lời** gửi phản hồi vào đúng bình luận.
- **Sửa** chỉ xuất hiện cho bình luận do chính Fanpage viết.
- **Ẩn bình luận / Hiện lại** thay đổi trạng thái hiển thị; **Xóa** yêu cầu xác nhận trước khi xóa trên Facebook.
- **Xem phản hồi** mở các phản hồi; dùng **Tải thêm** nếu Facebook còn dữ liệu.
- Dùng **Tải lại bình luận** để nhận thay đổi mới. Ứng dụng chưa dùng webhook hoặc tự cập nhật nền.
- Các thao tác được ghi vào **Nhật ký hoạt động**; có thể tìm kiếm và xuất nhật ký CSV.

Chỉ các thao tác được Facebook cấp phép mới xuất hiện. Nếu gặp lỗi quyền hoặc token hết hạn, kết nối lại Fanpage. Sau lỗi mạng khi gửi, hãy tải lại và kiểm tra trên Facebook trước khi gửi lại, tránh trùng bình luận.

Quản lý bình luận qua API áp dụng cho **Fanpage**. Facebook cá nhân vẫn thao tác trực tiếp trên Facebook. Phần mềm cần Internet để gọi Facebook dù website chạy trên máy.

## Các chỉnh sửa giao diện

Thanh bên cuộn được khi màn hình thấp; khối giới thiệu được thu gọn để tài khoản và đăng xuất không bị cắt. Hộp thoại được căn giữa, có giới hạn theo chiều cao màn hình và giữ các nút ở đáy khi cuộn.

Các thẻ thống kê mở đúng danh sách/bộ lọc. Bài đã đăng có nút mở quản lý bình luận. Bài chưa chọn nơi đăng mở trình soạn để chọn nơi đăng. Nút sao chép có thông báo khi trình duyệt chưa cấp quyền.

Kiểm thử Facebook dùng phản hồi API mô phỏng, không tự đăng/xóa bình luận trên Fanpage thật. Cần cấp quyền và thử trên Fanpage của bạn để xác nhận điều kiện truy cập thực tế của Meta App.

Tham khảo hợp đồng API trong [Meta Business SDK: Comment](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/comment.py).
