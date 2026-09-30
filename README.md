# Chấm công Dahahi

Hỗ trợ tài liệu API v2.0.0 (có GetEmployeeList). Web app quản lý máy chấm công khuôn mặt Dahahi: thêm/sửa/xóa nhân viên (kèm ảnh), đồng bộ lịch sử, bảng công tháng, nhập/xuất CSV, quản lý thiết bị.
Không cần `npm install`, chỉ cần **Node.js 18+**.

## Khởi động
**Không mở file index.html trực tiếp** (sẽ không có dữ liệu). Cài Node.js (https://nodejs.org), rồi bấm đúp `chay.bat` — trình duyệt tự mở http://localhost:3000.

## Kết nối máy (giống CUKCUK)
Mở app → tab **Kết nối máy** → điền Website Dahahi, Api Secret Key, Mã thiết bị → **Kết nối**. Lấy 3 thông tin này ở web Dahahi: địa chỉ riêng của đơn vị; Cài đặt → Tích hợp API; menu Thiết bị.

## Chạy thử (không cần máy thật)
    MOCK=1 node server.js        # Windows PowerShell:  $env:MOCK=1; node server.js
Mở http://localhost:3000

## Chạy thật
    DAHAHI_HOST=https://ten_mien.dahahi.vn SECRET_KEY=<Api Secret Key> ADMIN_PASS=<mật khẩu> node server.js

| Biến | Ý nghĩa |
|---|---|
| DAHAHI_HOST | `https://ten_mien.dahahi.vn` (tên miền do quản trị Dahahi cấp) |
| SECRET_KEY | Web Dahahi → Cài đặt → Tích hợp API → "Api Secret Key" |
| APP_KEY | Mặc định theo tài liệu |
| ADMIN_PASS | Mật khẩu đăng nhập app (user bất kỳ). Nên đặt khi chạy trên mạng |
| WORK_START | Giờ bắt đầu làm để tính đi muộn (mặc định 08:30) |
| PORT | Mặc định 3000 |

## Nhận chấm công tức thời (tùy chọn)
Trong web Dahahi nhập **CallBack Api Url** = `http://<server>:3000/callback/checkin`, **Heat Beat Api Url** = `http://<server>:3000/callback/heartbeat`.
Nếu không dùng callback, vào tab "Lịch sử chấm công" → "Đồng bộ từ thiết bị".

## Định dạng CSV nhập nhân viên
    id,name,from,to,machines
    101,Nguyen Van A,,,1468063|1708924
`from`/`to` (tùy chọn) dạng `2026-01-01T07:00`. Sau khi nhập, dùng "Tải ảnh hàng loạt" (đặt tên file ảnh = mã NV, vd `101.jpg`) để đẩy lên thiết bị.

Dữ liệu lưu trong `data.json` (nhớ sao lưu). Khóa API chỉ nằm ở server, không lộ ra trình duyệt.
