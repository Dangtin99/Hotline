/**
 * services/addThanhToanThanhCongData.js
 * Thêm dữ liệu đơn hàng với trạng thái "Thanh toán thành công" vào cơ sở dữ liệu
 */
const db = require('./database');

const successOrdersList = [
  { depot: 'AIC', hangTau: 'WHL', booking: 'WHL88901', cont: 'EIR3398001-WHLU4512340', dir: 'OUT', teus: 2, cType: "Cont 40' HC - cao Khô", driver: 'Trần Văn Nam', phone: '0912345678', truck: 'VẬN TẢI NAM BẮC' },
  { depot: 'AIC', hangTau: 'MSK', booking: '27689912', cont: 'EIR3398002-MSKU8912345', dir: 'IN', teus: 2, cType: "Cont 40' HC - cao Khô", driver: 'Lê Hoàng Minh', phone: '0923456789', truck: 'CÔNG TY GIAO NHẬN Á CHÂU' },
  { depot: 'AIC', hangTau: 'COS', booking: 'COSU99120', cont: 'EIR3398003-COSU1245789', dir: 'OUT', teus: 1, cType: "Cont 20'DC - Khô", driver: 'Nguyễn Văn Đạt', phone: '0934567890', truck: 'LOGISTICS ĐÔNG TÂY' },
  { depot: 'THT', hangTau: 'YML', booking: 'M4991283', cont: 'EIR3398004-YMLU9876543', dir: 'OUT', teus: 1, cType: "Cont 20'DC - Khô", driver: 'Phạm Thành Long', phone: '0945678901', truck: 'KIM TÍN LOGISTICS' },
  { depot: 'THT', hangTau: 'CMA', booking: 'SGN88912', cont: 'EIR3398005-CMAU3456789', dir: 'OUT', teus: 2, cType: "Cont 40' HC - cao Khô", driver: 'Đỗ Hữu Thắng', phone: '0956789012', truck: 'CÔNG TY VẬN TẢI THÀNH CÔNG' },
  { depot: 'THT', hangTau: 'HLC', booking: '15989123', cont: 'EIR3398006-HLCU8765432', dir: 'IN', teus: 2, cType: "Cont 40' HC - cao Khô", driver: 'Võ Quốc Huy', phone: '0967890123', truck: 'BASIC INTERNATIONAL' },
  { depot: 'THT', hangTau: 'WHL', booking: '115G8899', cont: 'EIR3398007-WHLU7654321', dir: 'OUT', teus: 1, cType: "Cont 20'DC - Khô", driver: 'Hoàng Văn Toàn', phone: '0978901234', truck: 'VẬN TẢI BÌNH DƯƠNG' },
  { depot: 'SLD', hangTau: 'YML', booking: 'E1788990', cont: 'EIR3398008-YMLU6543210', dir: 'IN', teus: 2, cType: "Cont 40' HC - cao Khô", driver: 'Mai Văn Quang', phone: '0989012345', truck: 'HỒNG QUANG TRANS' },
  { depot: 'SLD', hangTau: 'CMA', booking: '64689012', cont: 'EIR3398009-CMAU5432109', dir: 'OUT', teus: 2, cType: "Cont 40' RF- Lạnh", driver: 'Nguyễn Tấn Tài', phone: '0990123456', truck: 'TÚ MINH THÀNH' },
  { depot: 'SLD', hangTau: 'COS', booking: 'COAU8891', cont: 'EIR3398010-TEMU4321098', dir: 'IN', teus: 2, cType: "Cont 40' HC - cao Khô", driver: 'Trịnh Đình Trọng', phone: '0901234567', truck: 'QUANG HÀ LOGISTICS' },
  { depot: 'BSD', hangTau: 'COS', booking: 'COAU9911', cont: 'EIR3398011-COSU3210987', dir: 'OUT', teus: 2, cType: "Cont 40' HC - cao Khô", driver: 'Võ Trọng Tấn', phone: '0912345670', truck: 'NGUYỄN LINH TRANS' },
  { depot: 'BSD', hangTau: 'MSK', booking: '27699120', cont: 'EIR3398012-MSKU2109876', dir: 'IN', teus: 2, cType: "Cont 40' HC - cao Khô", driver: 'Đặng Thanh Tùng', phone: '0923456781', truck: 'FAST LOGISTICS' },
  { depot: 'BSD', hangTau: 'ONE', booking: 'ONE99812', cont: 'EIR3398013-ONEU1098765', dir: 'OUT', teus: 1, cType: "Cont 20'DC - Khô", driver: 'Bùi Văn Hùng', phone: '0934567892', truck: 'HOÀNG HÀ VẬN TẢI' },
  { depot: 'ETD', hangTau: 'HLC', booking: '98991234', cont: 'EIR3398014-HLCU0987654', dir: 'OUT', teus: 2, cType: "Cont 40' HC - cao Khô", driver: 'Nguyễn Văn Hải', phone: '0945678903', truck: 'MINH PHƯƠNG PHÁT' },
  { depot: 'ETD', hangTau: 'ONE', booking: 'ONE77812', cont: 'EIR3398015-TGHU9876543', dir: 'IN', teus: 1, cType: "Cont 20'DC - Khô", driver: 'Phan Văn Đức', phone: '0956789014', truck: 'TUẤN TRANG PHƯỢNG' },
  { depot: 'ETD', hangTau: 'WHL', booking: '120GA889', cont: 'EIR3398016-WHLU8765432', dir: 'OUT', teus: 2, cType: "Cont 40' HC - cao Khô", driver: 'Lê Văn Cường', phone: '0967890125', truck: 'KHÁNH CHÂU TRANS' },
  { depot: 'SCD', hangTau: 'YML', booking: 'I2299123', cont: 'EIR3398017-BEAU7654321', dir: 'IN', teus: 1, cType: "Cont 20'DC - Khô", driver: 'Nguyễn Văn Lộc', phone: '0978901236', truck: 'TUẤN TÀI TRANS' },
  { depot: 'SCD', hangTau: 'MSK', booking: '27655432', cont: 'EIR3398018-MRKU6543210', dir: 'OUT', teus: 2, cType: "Cont 40' HC - cao Khô", driver: 'Trần Văn Kiên', phone: '0989012347', truck: 'SÀI GÒN CONTAINER' },
  { depot: 'PMCM', hangTau: 'CMA', booking: 'CM889123', cont: 'EIR3398019-CMAU5432109', dir: 'IN', teus: 2, cType: "Cont 40' HC - cao Khô", driver: 'Đoàn Văn Thịnh', phone: '0990123458', truck: 'PHƯỚC LONG TRANS' },
  { depot: 'PMCM', hangTau: 'COS', booking: 'COSU6678', cont: 'EIR3398020-COSU4321098', dir: 'OUT', teus: 1, cType: "Cont 20'DC - Khô", driver: 'Lý Quốc Dũng', phone: '0901234569', truck: 'CẢNG PHƯỚC LONG' },
  { depot: 'GKP', hangTau: 'WHL', booking: '120GA999', cont: 'EIR3398021-WHLU3210987', dir: 'OUT', teus: 2, cType: "Cont 40' RF- Lạnh", driver: 'MAO THEARA', phone: '070711593', truck: 'CHARMGO CAMBODIA' },
  { depot: 'GKP', hangTau: 'MSK', booking: '27699881', cont: 'EIR3398022-BEAU2109876', dir: 'IN', teus: 2, cType: "Cont 40' HC - cao Khô", driver: 'CHEY MAKARA', phone: '0965157780', truck: 'FAST LOGISTICS KH' },
  { depot: 'EPD', hangTau: 'YML', booking: 'I4799881', cont: 'EIR3398023-BMOU1098765', dir: 'IN', teus: 2, cType: "Cont 40' HC - cao Khô", driver: 'Tô Văn Điệp', phone: '0919547986', truck: 'TRIỆU VŨ LOGISTICS' },
  { depot: 'EPD', hangTau: 'COS', booking: 'COAU7766', cont: 'EIR3398024-OOCU0987654', dir: 'OUT', teus: 1, cType: "Cont 20'DC - Khô", driver: 'Nguyễn Tấn Đạt', phone: '0935253875', truck: 'TÂN CẢNG LOGISTICS' }
];

const newRecords = successOrdersList.map((o, idx) => ({
  stt: String(210 + idx),
  depot: o.depot,
  hangTau: o.hangTau,
  ngayHuyDon: '',
  ngayDuocDuyet: '2026-10-02 08:30:' + String(10 + idx).padStart(2, '0'),
  soBooking: o.booking,
  soContainer: o.cont,
  trangThaiDonHang: 'Thanh toán thành công',
  trangThaiKichHoat: 'Đã kích hoạt',
  thoiGianKichHoat: '2026-10-02 09:15:00',
  lyDoHuy: 'Đã thanh toán thành công',
  loaiContainer: o.cType,
  loaiDonHang: o.dir,
  sizeTeus: o.teus,
  tenTaiXe: o.driver,
  sdtTaiXe: o.phone,
  tenNhaXe: o.truck,
  sdtNhaXe: o.phone,
  lyDoTuChoi: '',
  trangThaiXuLy: 'Thanh toán thành công',
  giaiTrinh: 'Đơn đã hoàn tất thủ tục thanh toán thành công'
}));

const result = db.insertRecords(newRecords, {
  uploadId: 'UP-THANH-TOAN-THANH-CONG',
  fileName: 'danh_sach_don_thanh_toan_thanh_cong.xlsx'
});

console.log('Đã thêm thành công dữ liệu trạng thái [Thanh toán thành công] vào cơ sở dữ liệu:');
console.log(result);
