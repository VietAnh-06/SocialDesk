# SocialDesk

Ứng dụng web tiếng Việt để quản lý bài viết Facebook, chạy trên máy Windows và lưu dữ liệu riêng cho từng tài khoản đăng nhập.

## Tính năng

- Đăng ký, đăng nhập và tách dữ liệu giữa các người dùng.
- Soạn bản nháp, chọn nhiều Fanpage, đăng bài, cập nhật và xóa từng bản đăng.
- Đọc, tìm kiếm, trả lời, ẩn/hiện và xóa bình luận Fanpage; sửa bình luận do Fanpage viết.
- Hướng dẫn kết nối tự mở cho tài khoản chưa có Fanpage; có kiểm tra quyền và kết nối lại.
- Nhật ký hoạt động, tìm kiếm và xuất CSV.

Facebook cá nhân dùng quy trình thủ công. Các thao tác Fanpage cần quyền phù hợp do Facebook cấp.

## Chạy trên Windows

Cần **Node.js 22.13 trở lên** và kết nối Internet để cài các thành phần, đăng nhập Facebook và gọi API.

```powershell
git clone https://github.com/VietAnh-06/SocialDesk.git
cd SocialDesk
.\CHAY-LOCAL.cmd
```

Lần đầu chương trình tự cài dependency, build và chuẩn bị cơ sở dữ liệu. Mở **http://localhost:8787**, đăng ký tài khoản và giữ cửa sổ chương trình chạy khi sử dụng. Nhấn **Ctrl+C** để dừng.

Cấu hình Facebook được nhập trực tiếp trên máy bằng **CAU-HINH.cmd**. Xem [hướng dẫn kết nối](KET-NOI-FACEBOOK.md). Phần đăng nhập Facebook chung đang phát triển riêng; repository này hiện chứa bản local hoạt động với cấu hình Meta trên máy.

## Phát triển và kiểm tra

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:unit
npm.cmd run test:local
npm.cmd run build
npm.cmd run test:worker
```

Kiểm tra giao diện: đặt thư mục browser trùng với cấu hình kiểm thử, rồi cài Chromium:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.cache\ms-playwright"
npx.cmd playwright install chromium
```

Chạy ứng dụng local với thư mục dữ liệu thử qua biến `SOCIALDESK_DATA_DIR`, rồi chạy `npm.cmd run test:e2e` ở cửa sổ khác. Tránh chạy kiểm thử trên dữ liệu thật.

## Mã nguồn và dữ liệu

| Thư mục | Nội dung |
| --- | --- |
| `app/` | Giao diện, wizard kết nối và quản lý bình luận |
| `lib/` | API, Facebook, xác thực và mã hóa |
| `db/`, `drizzle/` | Schema và migration cơ sở dữ liệu |
| `scripts/` | Chạy local, tự cập nhật build và đóng gói |
| `tests/` | Kiểm thử API và giao diện |

Git chỉ lưu mã nguồn, dependency lock và tài liệu. `node_modules`, `dist`, cache, bản ZIP, ảnh kiểm thử, cơ sở dữ liệu và thông tin bí mật đều được bỏ qua bằng `.gitignore`.

Cấu hình thật nằm trong **.dev.vars**, dữ liệu thật nằm trong **.socialdesk/data**. Giữ cả hai khi sao lưu để đọc được các token đã mã hóa. Không đưa các tệp này lên Git. Tệp **.dev.vars.example** chỉ mô tả cấu hình mẫu.

## Tài liệu

- [Hướng dẫn chạy và tùy chọn chia sẻ Internet](LOCAL-RUN.md)
- [Kết nối Facebook](KET-NOI-FACEBOOK.md)
- [Quản lý bình luận](BINH-LUAN.md)
- [Hướng dẫn nhanh trên máy](HUONG-DAN-LOCAL.txt)
