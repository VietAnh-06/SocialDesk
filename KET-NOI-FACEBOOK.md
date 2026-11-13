# Kết nối Fanpage bằng wizard

Hướng dẫn tự mở sau khi đăng nhập nếu bạn chưa có Fanpage. Nếu chọn **Để sau**, có thể mở lại từ nút **Bắt đầu hướng dẫn** trên Tổng quan, mục **Hướng dẫn kết nối** ở thanh bên hoặc biểu tượng liên kết trên thanh đầu trang.

1. **Bắt đầu**: chuẩn bị tài khoản Facebook thường dùng để quản lý Fanpage rồi bấm **Bắt đầu kết nối**. Ứng dụng tự kiểm tra thiết lập ở nền.
2. **Chọn Fanpage**: bấm **Mở Facebook và chọn Fanpage**, đăng nhập trên Facebook, chọn trang và đồng ý quyền đăng bài. Bình luận là tùy chọn riêng, chỉ bật sau khi người cài đặt đã chuẩn bị quyền trong Meta App. Facebook tự đưa bạn quay về SocialDesk.
3. **Hoàn tất**: xem trạng thái đăng bài và bình luận riêng. Đủ quyền đăng bài thì có thể bấm **Bắt đầu sử dụng** ngay. Nếu muốn thêm bình luận và ứng dụng đã cho phép xin quyền này, bấm **Bật quản lý bình luận**. Nếu thiếu quyền đăng bài, bấm **Cho phép thêm quyền**.

App ID, App Secret, callback và tên quyền kỹ thuật nằm trong mục đóng **Dành cho người cài đặt** hoặc **Thông tin kiểm tra dành cho người cài đặt**. Người sử dụng thông thường không phải sao chép token hay nhập những thông tin đó.

Nếu màn hình báo máy chưa được thiết lập, người cài đặt cần chuẩn bị Meta App một lần. Việc ẩn thông tin kỹ thuật không thay thế bước thiết lập bắt buộc này.

## Các kết quả kiểm tra

- **Đã xác minh kết nối**: phiên còn hiệu lực, danh tính Fanpage khớp và các quyền đăng bài đã có. Trạng thái bình luận được kiểm tra riêng; chưa đủ quyền bình luận vẫn có thể sử dụng đăng bài. Quyền quản trị nội dung và các giới hạn của Facebook vẫn áp dụng khi thao tác.
- **Cần cấp thêm quyền**: còn thiếu quyền tìm Fanpage hoặc quản lý bài viết; wizard chỉ rõ chức năng cần bổ sung.
- **Cần kết nối lại**: Facebook báo phiên không còn hợp lệ hoặc thời hạn phiên đã qua.
- **Chưa xác minh được kết nối**: Facebook không trả đủ dữ liệu hoặc việc kiểm tra gặp lỗi. Những quyền chưa xác minh không bị ghi thành “thiếu quyền”. Dùng **Kiểm tra lại Fanpage** để thử lại.
- **Kiểm tra lại thông tin Meta App**: Facebook chưa xác thực được yêu cầu kiểm tra. Người cài đặt cần đối chiếu App ID và App Secret. Kết quả này chưa đủ để kết luận token Fanpage đã hết hạn.

## Kết nối lại

Mỗi thẻ Fanpage có nút **Kiểm tra kết nối** và **Kết nối lại**. Khi kết nối lại, chọn đúng Fanpage trên Facebook. Ứng dụng cập nhật thông tin xác thực trên kết nối cũ, giữ nguyên mã kết nối và các bài viết đang gắn với nó. Nếu Facebook không trả về Fanpage cần chọn, kết nối cũ được giữ và wizard hướng dẫn thử lại.

Kết nối lại yêu cầu Facebook hỏi lại các quyền đã từ chối. Nó không tự cấp quyền mà bạn chưa đồng ý, không thay thế việc xét duyệt Meta App và không thêm quyền quản trị Fanpage cho tài khoản Facebook.

## Giới hạn của bước tự kiểm tra

Kiểm tra cấu hình trên máy chỉ xác nhận thông tin đã có và đúng định dạng. Ứng dụng **không thể tự đọc cài đặt callback trong Meta App** để khẳng định callback đã được đăng ký. Người cài đặt cần đối chiếu đúng địa chỉ hiển thị.

App Secret và token không được trả về trình duyệt trong kết quả kiểm tra. Tài khoản SocialDesk chỉ kiểm tra và kết nối lại các Fanpage của mình. Wizard không yêu cầu nhập mật khẩu Facebook trong giao diện SocialDesk.

Nếu App Secret chưa có, chạy **CAU-HINH.cmd** để nhập trực tiếp trên máy, sau đó mở lại **CHAY-LOCAL.cmd**. Khi chỉ dùng local, giữ trống địa chỉ Internet. Xem **BINH-LUAN.md** về các quyền dành cho bình luận.
