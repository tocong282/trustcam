export type Language = 'vi' | 'en';
export type ThemeMode = 'dark' | 'light';
export type Screen = 'session' | 'camera' | 'checklist' | 'report' | 'verify' | 'settings';

export const palettes = {
  dark: { background: '#020617', surface: '#0f172a', inset: '#1e293b', border: '#475569', text: '#f8fafc', muted: '#cbd5e1', emerald: '#6ee7b7', blue: '#93c5fd', danger: '#fca5a5', warning: '#fde68a', primary: '#6ee7b7', onPrimary: '#022c22' },
  light: { background: '#f8fafc', surface: '#ffffff', inset: '#f1f5f9', border: '#94a3b8', text: '#0f172a', muted: '#475569', emerald: '#047857', blue: '#1d4ed8', danger: '#b91c1c', warning: '#92400e', primary: '#047857', onPrimary: '#ffffff' },
} as const;

const vi = {
  homeTitle: 'Bắt đầu từ ảnh gốc', startHelp: 'Mở Chụp ảnh để tạo phiên và chụp ảnh gốc. Theo dõi bằng chứng trong Danh sách, lập Báo cáo rồi Kiểm tra ảnh.', continueHelp: 'Tiếp tục để tải trạng thái mới nhất và mở bước cần làm.', serverHelp: 'Đây là địa chỉ đang dùng. Nếu không kết nối được, kiểm tra Wi-Fi và sửa địa chỉ trong Cài đặt; địa chỉ đã lưu không tự đổi theo mạng.', showDetails: 'Xem dữ liệu chữ ký', hideDetails: 'Thu gọn dữ liệu chữ ký',
  sessionTab: 'Phiên', captureTab: 'Chụp ảnh', checklistTab: 'Danh sách', reportTab: 'Báo cáo', verifyTab: 'Kiểm tra', settings: 'Cài đặt',
  session: 'Mã phiên', sessionStatus: 'Trạng thái hồ sơ', noSession: 'Chưa có phiên.', createSession: 'Tạo phiên mới', resume: 'Tiếp tục phiên', refresh: 'Tải lại phiên',
  connection: 'Kết nối máy chủ', unknown: 'Chưa kiểm tra', checking: 'Đang kiểm tra', online: 'Máy chủ phản hồi', offline: 'Không kết nối được',
  busy: 'Đang xử lý…', error: 'Lỗi', next: 'Ảnh cần tiếp theo', cameraPreview: 'Khung ngắm camera', grantCamera: 'Cho phép camera', openSettings: 'Mở Cài đặt thiết bị',
  cameraStartHelp: 'Tạo phiên tại đây trước khi chụp, ký và tải ảnh lên. Quyền camera chỉ cần ở bước chụp ảnh.',
  cameraInactive: 'Camera chưa hoạt động.', shutter: 'Chụp, ký và tải ảnh lên', flashOn: 'Tắt đèn flash', flashOff: 'Bật đèn flash', cancelRetake: 'Hủy chụp lại',
  progress: 'Tiến độ thu thập', noEvidence: 'Chưa có ảnh. Tạo phiên rồi chụp ảnh đầu tiên.', currentPhoto: 'Ảnh hiện tại', evidenceHistory: 'Lịch sử bằng chứng', archived: 'Ảnh cũ được giữ nguyên',
  retake: 'Chụp lại mục này', finalize: 'Lập báo cáo JSON', report: 'Báo cáo JSON', noReport: 'Chưa tải được báo cáo. Tải lại để mở báo cáo đã chốt; nếu đang thu thập, hoàn tất checklist rồi lập báo cáo.',
  share: 'Chia sẻ báo cáo JSON', shareOriginal: 'Chia sẻ tệp ảnh gốc để kiểm tra', selectEvidence: 'Chọn bằng chứng cần đối chiếu', selectedEvidence: 'Đang chọn bằng chứng này', pickVerify: 'Chọn ảnh và kiểm tra',
  verifyHelp: 'Chọn đúng tệp gốc đã tải lên để có thể PASS. Thư viện có thể chuyển mã ảnh; tệp chuyển mã sẽ FAIL dù trông giống hệt.',
  integrityNotice: 'PASS chỉ xác nhận ảnh không đổi so với dữ liệu đã ký. Không chứng minh cảnh thật, thời điểm thật hoặc giá trị pháp lý. Khoá phần mềm lưu bằng SecureStore, không phải chữ ký phần cứng.',
  language: 'Ngôn ngữ', themeMode: 'Giao diện', dark: 'Tối', light: 'Sáng', apiUrl: 'Địa chỉ API', save: 'Lưu địa chỉ',
  apiHelp: 'Điện thoại cần địa chỉ máy chủ truy cập được. HTTP chỉ dành cho thử nghiệm LAN tin cậy; dùng HTTPS khi triển khai. Đổi địa chỉ cần xác nhận trong ứng dụng.',
  localPhotos: 'Bản sao ảnh trên thiết bị', localHelp: 'Ảnh chờ tải hoặc chưa rõ kết quả vẫn cần được giữ. Chia sẻ bản gốc cần giữ trước khi xóa. Xóa bản sao cục bộ không xóa hồ sơ máy chủ.',
  refreshLocal: 'Tải lại danh sách ảnh cục bộ', deleteLocal: 'Xóa bản sao cục bộ', noLocalPhotos: 'Không có bản sao cục bộ trong danh sách đã tải.',
  advisoryTitle: 'Nhận xét tham khảo của mô hình', analyze: 'Phân tích ảnh bằng mô hình (tùy chọn)', refreshCapabilities: 'Kiểm tra dịch vụ phân tích',
  analysisPrivacy: 'Ảnh sẽ được gửi tới nhà cung cấp mô hình bên ngoài đã cấu hình, có thể chứa dữ liệu cá nhân. Chỉ gửi khi có quyền chia sẻ và sau khi bạn xác nhận. Không bắt buộc để hoàn tất checklist.',
  advisoryNotice: 'Nhận xét tham khảo, không phải bằng chứng mật mã, xác thực sự thật hoặc kết luận pháp lý. Không thay đổi checklist hay kết quả chữ ký.',
  assessmentText: 'Nhận xét mô hình theo ngôn ngữ đã chọn:', legacyAnalysis: 'Nhận xét gốc; chưa có bản dịch theo ngôn ngữ đã chọn.',
  modelResponse: 'Phản hồi mô hình (nguyên văn, không tự dịch):', ragUnavailable: 'RAG pháp lý chưa khả dụng — chưa có kho văn bản được truy xuất, không cung cấp trích dẫn hoặc kết luận pháp lý.',
  choosePhoto: 'Chọn ảnh để nhận xét', analyzePhoto: 'Nhận xét ảnh này', chooseCurrentPhoto: 'Chọn một ảnh hiện tại ở trên để xem hoặc yêu cầu nhận xét.', noPhotoReview: 'Ảnh này chưa có nhận xét. Bạn có thể yêu cầu nhận xét sau khi xác nhận chia sẻ ảnh.',
  photoPreview: 'Ảnh xem trước', photoUnavailable: 'Không có ảnh xem trước trên thiết bị (ảnh chưa được lưu, đã xóa hoặc không đọc được). Vẫn có thể chọn tệp để kiểm tra.',
  timestamp: 'Thời điểm ghi nhận', signature: 'Chữ ký', publicKey: 'Khoá công khai',
};

export type Copy = { readonly [K in keyof typeof vi]: string };
const en: Copy = {
  homeTitle: 'Start with the original', startHelp: 'Open Capture to create a session and take original photos. Review evidence in Checklist, create a Report, then Verify photos.', continueHelp: 'Continue to load the latest status and open your next step.', serverHelp: 'This is the address in use. If unreachable, check Wi-Fi and edit the address in Settings; saved addresses do not change with your network.', showDetails: 'Show signature data', hideDetails: 'Hide signature data',
  sessionTab: 'Session', captureTab: 'Capture', checklistTab: 'Checklist', reportTab: 'Report', verifyTab: 'Verify', settings: 'Settings',
  session: 'Session ID', sessionStatus: 'Session status', noSession: 'No session.', createSession: 'Create new session', resume: 'Resume session', refresh: 'Refresh session',
  connection: 'Server connection', unknown: 'Not checked', checking: 'Checking', online: 'Server responded', offline: 'Cannot connect',
  busy: 'Processing…', error: 'Error', next: 'Next required photo', cameraPreview: 'Camera viewfinder', grantCamera: 'Grant camera access', openSettings: 'Open device Settings',
  cameraStartHelp: 'Create a session here before capturing, signing and uploading photos. Camera permission is only needed for capture.',
  cameraInactive: 'Camera is inactive.', shutter: 'Capture, sign and upload', flashOn: 'Turn flash off', flashOff: 'Turn flash on', cancelRetake: 'Cancel retake',
  progress: 'Collection progress', noEvidence: 'No photos yet. Create a session and capture the first photo.', currentPhoto: 'Current photo', evidenceHistory: 'Evidence history', archived: 'Archived original',
  retake: 'Retake this item', finalize: 'Finalize JSON report', report: 'JSON report', noReport: 'No report loaded. Refresh to open a finalized report; if still collecting, complete the checklist then finalize.',
  share: 'Share JSON report', shareOriginal: 'Share original file for verification', selectEvidence: 'Select evidence to compare', selectedEvidence: 'This evidence is selected', pickVerify: 'Pick image and verify',
  verifyHelp: 'Pick the exact original uploaded file to get PASS. Photo libraries may transcode images; transcoded bytes FAIL even when visually identical.',
  integrityNotice: 'PASS only proves the image is unchanged against signed bytes. It does not prove a true scene, true time or legal validity. Software key stored using SecureStore, not a hardware signature.',
  language: 'Language', themeMode: 'Theme', dark: 'Dark', light: 'Light', apiUrl: 'API base URL', save: 'Save URL',
  apiHelp: 'Phone needs a reachable server address. HTTP is only for trusted LAN testing; use HTTPS in deployment. Changing the address requires confirmation in the app.',
  localPhotos: 'Local photo copies', localHelp: 'Keep pending or uncertain uploads. Share any originals you need before deletion. Deleting local copies does not delete server records.',
  refreshLocal: 'Refresh local photo list', deleteLocal: 'Delete local copies', noLocalPhotos: 'No local copies in the loaded list.',
  advisoryTitle: 'Model advisory', analyze: 'Analyze photo with model (optional)', refreshCapabilities: 'Check analysis service',
  analysisPrivacy: 'Photo will be sent to the configured external model provider and may contain personal data. Send only with permission to share and after your confirmation. Not required to finish the checklist.',
  advisoryNotice: 'Advisory only, not cryptographic proof, factual verification or a legal conclusion. Does not change checklist or signature results.',
  assessmentText: 'Model assessment in the selected language:', legacyAnalysis: 'Original assessment; no translation available for the selected language.',
  modelResponse: 'Model response (original text, not automatically translated):', ragUnavailable: 'Legal RAG unavailable — no retrieved document corpus; no legal citations or conclusions provided.',
  choosePhoto: 'Choose photo for review', analyzePhoto: 'Review this photo', chooseCurrentPhoto: 'Choose a current photo above to view or request a review.', noPhotoReview: 'No review for this photo yet. You can request one after confirming photo sharing.',
  photoPreview: 'Photo preview', photoUnavailable: 'No preview on this device (not saved, deleted or unreadable). You can still pick a file to verify.',
  timestamp: 'Recorded time', signature: 'Signature', publicKey: 'Public key',
};

// Existing messages can override shared keys without importing changing app modules.
export const uiCopy: Readonly<Record<Language, Copy>> = { vi, en };
