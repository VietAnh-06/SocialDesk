# SocialDesk Local

## Chỉ dùng trên máy này (chế độ hiện tại)

Chạy **CHAY-LOCAL.cmd** rồi mở **http://localhost:8787**. Chế độ này chỉ lắng nghe trên loopback của máy và không tạo đường hầm Internet. Cấu hình và dữ liệu hiện có được giữ nguyên.

Hướng dẫn **Bắt đầu → Chọn Fanpage → Hoàn tất** tự mở sau khi đăng nhập nếu chưa có Fanpage. Có thể mở lại từ **Bắt đầu hướng dẫn** trên Tổng quan hoặc **Hướng dẫn kết nối** ở thanh bên. Thông tin Meta được tách vào mục dành cho người cài đặt. Xem [KET-NOI-FACEBOOK.md](KET-NOI-FACEBOOK.md).

Khi khởi động, chương trình tự kiểm tra mã nguồn và cập nhật bản chạy nếu giao diện đã thay đổi. Chương trình giữ nguyên cấu hình và dữ liệu trong quá trình này.

Giao diện có mục **Bình luận** để đọc, trả lời, sửa bình luận của Fanpage, ẩn/hiện và xóa. Xem [BINH-LUAN.md](BINH-LUAN.md) để cấp thêm quyền Facebook và sử dụng. Chức năng bình luận cần kết nối Internet tới Facebook.

Các phần chia sẻ Internet bên dưới chỉ là tùy chọn; không cần thực hiện khi dùng riêng trên máy.

Máy của bạn chạy ứng dụng và lưu dữ liệu. Người khác mở đường dẫn HTTPS bằng trình duyệt, tạo tài khoản SocialDesk riêng rồi bấm **Kết nối Facebook** để cấp quyền cho các Fanpage của họ. Một Meta App do người vận hành cấu hình được dùng chung cho dịch vụ; khách dùng website không cần App Secret và không cần tự tạo Meta App.

## Bắt đầu trên Windows

Yêu cầu Node.js 22.13 trở lên, máy có kết nối Internet. Không cần tài khoản ChatGPT hoặc tài khoản Cloudflare để chạy chế độ đường dẫn tạm.

1. Giải nén **SocialDesk-Local.zip** vào một thư mục trên máy.
2. Chạy **CAU-HINH.cmd**. App ID mặc định là `1496006092516967`. Nhập App Secret của Meta App khi được hỏi; ký tự sẽ được ẩn. Nếu chỉ thử đường dẫn tạm, để trống địa chỉ HTTPS cố định. Nhấn Enter giữ nguyên các giá trị đã lưu.
3. Chạy **CHIA-SE-INTERNET.cmd**. Lần đầu chương trình cài các gói cần thiết và tải cloudflared Windows 64-bit từ bản phát hành chính thức của Cloudflare. Trình cài so sánh SHA-256 khi GitHub cung cấp digest.
4. Khi xuất hiện **SOCIALDESK DA SAN SANG**, trình duyệt sẽ mở địa chỉ website. Địa chỉ và callback cũng được ghi trong **DIA-CHI-WEBSITE.txt**.
5. Trong Meta App, thêm tên miền hiện tại vào **App Domains** và thêm callback hiện tại vào **Facebook Login for Business → Settings → Valid OAuth Redirect URIs**. Giữ callback của bản web cũ nếu bạn vẫn sử dụng bản đó.
6. Mở địa chỉ HTTPS, tạo tài khoản SocialDesk mới rồi kết nối Facebook. Dữ liệu của bản trên máy tách riêng với bản trên Sites; dữ liệu cũ không tự chuyển sang máy.
7. Gửi địa chỉ HTTPS cho người thử nghiệm. Họ tạo tài khoản riêng trong SocialDesk và dùng Facebook của họ khi kết nối.

Giữ cửa sổ máy chủ mở trong khi dùng. Nhấn **Ctrl+C** để dừng máy chủ và đường dẫn Internet. Máy tắt, mất mạng hoặc dừng chương trình thì người khác sẽ không truy cập được.

Để chỉ dùng trên máy, chạy **CHAY-LOCAL.cmd**, rồi mở `http://localhost:8787`. Thử Facebook OAuth thuận tiện nhất qua địa chỉ HTTPS do chế độ chia sẻ cung cấp.

## Đường dẫn tạm và địa chỉ cố định

**CHIA-SE-INTERNET.cmd** mặc định dùng Cloudflare Quick Tunnel. Đây là chế độ thử nghiệm: URL thay đổi sau mỗi lần tạo đường hầm, không cam kết thời gian hoạt động, giới hạn 200 yêu cầu đang xử lý và không hỗ trợ SSE. Khi URL thay đổi, bạn cần cập nhật tên miền/callback trong Meta App và người dùng đăng nhập lại ở địa chỉ mới. Dữ liệu trên máy vẫn còn.

Để vận hành lâu dài:

1. Dùng một tên miền của bạn và tạo Cloudflare Tunnel cố định trong tài khoản Cloudflare của bạn.
2. Cấu hình hostname của website trỏ qua tunnel tới dịch vụ **http://127.0.0.1:8787** trên máy này.
3. Chạy **CAU-HINH.cmd**, nhập địa chỉ `https://ten-mien-cua-ban` và Tunnel token. Token được ẩn khi nhập và lưu cùng cấu hình máy chủ.
4. Chạy **CHIA-SE-INTERNET.cmd**. Chương trình dùng tunnel cố định khi đã có đủ URL và token.
5. Đăng ký callback cố định `https://ten-mien-cua-ban/api/facebook/callback` và tên miền tương ứng trong Meta.

Chạy CAU-HINH.cmd và nhập dấu **-** ở địa chỉ cố định để quay lại chế độ đường dẫn tạm.

## Người khác kết nối Fanpage như thế nào?

1. Họ truy cập website và tự đăng ký/đăng nhập SocialDesk.
2. Họ chọn **Tài khoản kết nối → Kết nối Facebook**.
3. Facebook xác thực tài khoản của họ và yêu cầu quyền trên các Fanpage họ được phép quản lý.
4. Callback hoàn tất kết nối. Các Fanpage, bài viết và ảnh được lưu theo tài khoản SocialDesk đã bắt đầu phiên kết nối đó.

Hiện Meta App của bạn đang được thiết lập để thử nghiệm. Người thử nghiệm cần vai trò phù hợp trong Meta App và phải chấp nhận lời mời vai trò nếu có. Muốn phục vụ khách hàng ngoài nhóm vai trò thử nghiệm, cần hoàn tất các yêu cầu của Meta cho các quyền Pages, bao gồm App Review/Advanced Access và những điều kiện Meta yêu cầu. Chạy local hoặc mở đường dẫn Internet không thay thế bước này.

Các quyền ứng dụng dùng: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`. Tài khoản Facebook phải có quyền quản lý nội dung trên Fanpage được chọn. Trang cá nhân vẫn dùng quy trình thao tác thủ công như bản web đã thử.

Nếu Meta yêu cầu icon, Category, Privacy Policy URL hoặc hướng dẫn xoá dữ liệu khi nộp duyệt, hãy cung cấp thông tin đúng với dịch vụ và các trang công khai thực tế. Gói local này chưa tạo hồ sơ xét duyệt Meta hoặc tự chuyển Meta App sang chế độ phục vụ khách hàng ngoài nhóm thử nghiệm.

## Cấu hình và dữ liệu

- **.dev.vars**: thông tin Meta App, Tunnel token nếu có và khoá mã hoá riêng của máy. Được tạo lần đầu; không đi kèm trong gói ZIP chia sẻ. Dùng CAU-HINH.cmd để cập nhật.
- **.socialdesk/data**: cơ sở dữ liệu và ảnh lưu trên máy, giữ nguyên sau khi tắt/mở hoặc build lại.
- **.socialdesk/server.log**, **.socialdesk/tunnel.log**: nhật ký để chẩn đoán lỗi khởi động.
- **DIA-CHI-WEBSITE.txt**: website, callback URL và App Domains của phiên chạy hiện tại.
- **.tools/cloudflared.exe**: công cụ tạo đường hầm, tự tải ở lần chạy Internet đầu tiên.

Khi sao lưu, dừng máy chủ và giữ cả dữ liệu lẫn .dev.vars trong nơi lưu trữ riêng. Khoá mã hoá phải đi cùng cơ sở dữ liệu để đọc được các token đã lưu. Khi gửi phần mềm cho người khác cài một máy chủ độc lập, gửi gói ZIP sạch, không gửi thư mục máy đang chạy có cấu hình và dữ liệu.

Chế độ Internet dùng cổng ứng dụng ở 127.0.0.1:8787 và runtime nội bộ ở 127.0.0.1:8788. Chỉ các đường dẫn ứng dụng được chuyển qua gateway; đường dẫn quản trị local của runtime không được chuyển qua tunnel. Không cần mở cổng router.

## Dành cho người phát triển

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run local:configure
npm.cmd run local:share
```

Kiểm tra: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run test:unit`, `npm.cmd run test:local`, `npm.cmd run test:worker`, `npm.cmd run test:e2e`.

Đóng gói sạch: `npm.cmd run build` rồi `npm.cmd run local:package`. Gói gồm mã nguồn, bản build và các tệp chạy; không gồm App Secret, khoá máy chủ, dữ liệu hay các gói node_modules. Lần chạy đầu tự cài node_modules bằng package-lock.json.

Mã nguồn có thể phát triển tiếp để thêm đặt lại mật khẩu, quản trị người dùng, xác minh email và giám sát dịch vụ trước khi vận hành rộng rãi. Các chức năng này chưa được thêm trong lần chuẩn bị bản local này.

Tài liệu: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ và https://developers.cloudflare.com/tunnel/get-started/
