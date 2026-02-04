/**
 * Work Permit Receipt System - Main Application
 * ระบบออกใบรับบัตร Work Permit - BOI
 */

// ==================== //
// Configuration
// ==================== //
const CONFIG = {
    // Google Sheets Configuration
    SPREADSHEET_ID: '1OAe6uFkaiJyw548d0JfHqylAAFowLbxQ',
    SHEET_NAME_REGISTRY: 'คุมทะเบียน',
    SHEET_NAME_FORM: 'ฟอร์มรับบัตร',
    API_KEY: '', // จะต้องใส่ API Key ภายหลัง

    // Receipt Number Format
    RECEIPT_PREFIX: '6902',

    // Date Format
    DATE_LOCALE: 'th-TH',
    BUDDHIST_YEAR_OFFSET: 543
};

// ==================== //
// State Management
// ==================== //
const state = {
    formData: {
        receiptDate: '',
        receiptNo: '',
        foreignerName: '',
        snNumber: '',
        requestNo: '',
        appointmentNo: '',
        cardImage: null
    },
    registryData: [],
    printedReceipts: [], // เก็บรายการที่พิมพ์แล้ว
    receivedCards: [], // เก็บรายการที่รับบัตรแล้ว
    isLoading: false,
    searchQuery: '',
    filterStatus: 'all'
};

// ==================== //
// DOM Elements
// ==================== //
const elements = {
    // Form inputs
    receiptDate: document.getElementById('receiptDate'),
    receiptNo: document.getElementById('receiptNo'),
    foreignerName: document.getElementById('foreignerName'),
    snNumber: document.getElementById('snNumber'),
    requestNo: document.getElementById('requestNo'),
    appointmentNo: document.getElementById('appointmentNo'),

    // Image inputs
    cardImage: document.getElementById('cardImage'),
    cardImageUpload: document.getElementById('cardImageUpload'),
    cardPreview: document.getElementById('cardPreview'),
    cardPlaceholder: document.getElementById('cardPlaceholder'),

    // Preview elements
    previewDate: document.getElementById('previewDate'),
    previewReceiptNo: document.getElementById('previewReceiptNo'),
    previewName: document.getElementById('previewName'),
    previewSN: document.getElementById('previewSN'),
    previewRequestNo: document.getElementById('previewRequestNo'),
    previewAppointmentNo: document.getElementById('previewAppointmentNo'),
    receiptCardImage: document.getElementById('receiptCardImage'),
    previewCardBox: document.getElementById('previewCardBox'),
    previewSignerName: document.getElementById('previewSignerName'),

    // Buttons
    clearBtn: document.getElementById('clearBtn'),
    previewBtn: document.getElementById('previewBtn'),
    printBtn: document.getElementById('printBtn'),
    refreshDataBtn: document.getElementById('refreshDataBtn'),

    // Table
    registryBody: document.getElementById('registryBody'),

    // Print template
    printTemplate: document.getElementById('printTemplate'),

    // Summary elements
    summaryDate: document.getElementById('summaryDate'),
    summaryTotal: document.getElementById('summaryTotal'),
    summaryPrinted: document.getElementById('summaryPrinted'),
    summaryPendingPrint: document.getElementById('summaryPendingPrint'),
    summaryReceived: document.getElementById('summaryReceived'),
    summaryWaiting: document.getElementById('summaryWaiting'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    exportPdfBtn: document.getElementById('exportPdfBtn'),

    // Search & Filter
    searchInput: document.getElementById('searchInput'),
    filterStatus: document.getElementById('filterStatus')
};

// ==================== //
// Utility Functions
// ==================== //

/**
 * แปลงวันที่เป็น พ.ศ.
 */
function formatThaiDate(dateString) {
    if (!dateString) return '-';

    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear() + CONFIG.BUDDHIST_YEAR_OFFSET;

    return `${day}/${month}/${year}`;
}

/**
 * แปลงวันที่จาก input เป็น format ไทย
 */
function formatDateForDisplay(dateInput) {
    if (!dateInput) return '-';
    return formatThaiDate(dateInput);
}

/**
 * แปลงวันที่จาก Thai format เป็น Date object
 */
function parseThaiDate(thaiDateStr) {
    if (!thaiDateStr) return null;
    const parts = thaiDateStr.split('/');
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]) - CONFIG.BUDDHIST_YEAR_OFFSET;

    return new Date(year, month, day);
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * อ่านไฟล์รูปภาพเป็น Base64
 */
function readImageAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

/**
 * สร้างเลขรับที่ถัดไปอัตโนมัติ
 */
function generateNextReceiptNo(currentData) {
    if (!currentData || currentData.length === 0) {
        return `${CONFIG.RECEIPT_PREFIX}/0001`;
    }

    // หาเลขล่าสุด
    const lastNo = currentData
        .map(row => row.receiptNo)
        .filter(no => no && no.startsWith(CONFIG.RECEIPT_PREFIX))
        .map(no => parseInt(no.split('/')[1]) || 0)
        .sort((a, b) => b - a)[0] || 0;

    const nextNo = (lastNo + 1).toString().padStart(4, '0');
    return `${CONFIG.RECEIPT_PREFIX}/${nextNo}`;
}

/**
 * Format time for display
 */
function formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

// ==================== //
// LocalStorage - Printed Receipts
// ==================== //

const STORAGE_KEY_PRINTED = 'boi_printed_receipts';
const STORAGE_KEY_RECEIVED = 'boi_received_cards';

/**
 * โหลดรายการที่พิมพ์แล้วจาก LocalStorage
 */
function loadPrintedReceipts() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_PRINTED);
        state.printedReceipts = stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Error loading printed receipts:', e);
        state.printedReceipts = [];
    }
}

/**
 * บันทึกรายการที่พิมพ์แล้วลง LocalStorage
 */
function savePrintedReceipts() {
    try {
        localStorage.setItem(STORAGE_KEY_PRINTED, JSON.stringify(state.printedReceipts));
    } catch (e) {
        console.error('Error saving printed receipts:', e);
    }
}

/**
 * Mark รายการว่าพิมพ์แล้ว
 */
function markAsPrinted(receiptNo) {
    if (!receiptNo) return;

    const existingIndex = state.printedReceipts.findIndex(r => r.receiptNo === receiptNo);
    const printRecord = {
        receiptNo: receiptNo,
        printedAt: new Date().toISOString(),
        printCount: 1
    };

    if (existingIndex >= 0) {
        // พิมพ์ซ้ำ - เพิ่ม count
        state.printedReceipts[existingIndex].printCount++;
        state.printedReceipts[existingIndex].lastPrintedAt = new Date().toISOString();
    } else {
        // พิมพ์ครั้งแรก
        state.printedReceipts.push(printRecord);
    }

    savePrintedReceipts();
    renderRegistryTable();
    updateSummary();
}

/**
 * ตรวจสอบว่าพิมพ์แล้วหรือยัง
 */
function isPrinted(receiptNo) {
    return state.printedReceipts.some(r => r.receiptNo === receiptNo);
}

/**
 * ดึงข้อมูลการพิมพ์
 */
function getPrintInfo(receiptNo) {
    return state.printedReceipts.find(r => r.receiptNo === receiptNo);
}

// ==================== //
// LocalStorage - Received Cards
// ==================== //

/**
 * โหลดรายการที่รับบัตรแล้วจาก LocalStorage
 */
function loadReceivedCards() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_RECEIVED);
        state.receivedCards = stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Error loading received cards:', e);
        state.receivedCards = [];
    }
}

/**
 * บันทึกรายการที่รับบัตรแล้วลง LocalStorage
 */
function saveReceivedCards() {
    try {
        localStorage.setItem(STORAGE_KEY_RECEIVED, JSON.stringify(state.receivedCards));
    } catch (e) {
        console.error('Error saving received cards:', e);
    }
}

/**
 * Toggle สถานะรับบัตร
 */
function toggleCardReceived(receiptNo) {
    if (!receiptNo) return;

    const existingIndex = state.receivedCards.findIndex(r => r.receiptNo === receiptNo);

    if (existingIndex >= 0) {
        // ยกเลิกการรับบัตร
        state.receivedCards.splice(existingIndex, 1);
    } else {
        // บันทึกว่ารับบัตรแล้ว
        state.receivedCards.push({
            receiptNo: receiptNo,
            receivedAt: new Date().toISOString()
        });
    }

    saveReceivedCards();
    renderRegistryTable();
    updateSummary();
}

/**
 * ตรวจสอบว่ารับบัตรแล้วหรือยัง
 */
function isCardReceived(receiptNo) {
    return state.receivedCards.some(r => r.receiptNo === receiptNo);
}

/**
 * ดึงข้อมูลการรับบัตร
 */
function getReceivedInfo(receiptNo) {
    return state.receivedCards.find(r => r.receiptNo === receiptNo);
}

// Make toggle function available globally
window.toggleCardReceived = toggleCardReceived;

// ==================== //
// Image Handling
// ==================== //

/**
 * จัดการการอัพโหลดรูปภาพ
 */
function setupImageUpload(uploadElement, inputElement, previewElement, placeholderElement, imageType) {
    // คลิกที่กล่องเพื่อเปิด file dialog
    uploadElement.addEventListener('click', () => {
        inputElement.click();
    });

    // เมื่อเลือกไฟล์
    inputElement.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const base64 = await readImageAsBase64(file);

            // อัพเดท state
            state.formData[imageType] = base64;

            // แสดง preview
            previewElement.src = base64;
            uploadElement.classList.add('has-image');

            // อัพเดท preview ในใบรับ
            updateReceiptPreview();
        } catch (error) {
            console.error('Error reading image:', error);
            alert('ไม่สามารถอ่านไฟล์รูปภาพได้');
        }
    });

    // Drag and drop
    uploadElement.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadElement.style.borderColor = CONFIG.PRIMARY_COLOR;
    });

    uploadElement.addEventListener('dragleave', () => {
        uploadElement.style.borderColor = '';
    });

    uploadElement.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadElement.style.borderColor = '';

        const file = e.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) return;

        // Trigger the same handler
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        inputElement.files = dataTransfer.files;
        inputElement.dispatchEvent(new Event('change'));
    });
}

// ==================== //
// Form Handling
// ==================== //

/**
 * อัพเดท state จากฟอร์ม
 */
function updateFormState() {
    state.formData.receiptDate = elements.receiptDate.value;
    state.formData.receiptNo = elements.receiptNo.value;
    state.formData.foreignerName = elements.foreignerName.value;
    state.formData.snNumber = elements.snNumber.value;
    state.formData.requestNo = elements.requestNo.value;
    state.formData.appointmentNo = elements.appointmentNo.value;
}

/**
 * อัพเดท preview จาก state
 */
function updateReceiptPreview() {
    updateFormState();

    // อัพเดทข้อความ
    elements.previewDate.textContent = formatDateForDisplay(state.formData.receiptDate);
    elements.previewReceiptNo.textContent = state.formData.receiptNo || '-';
    elements.previewName.textContent = state.formData.foreignerName || '-';
    elements.previewSN.textContent = state.formData.snNumber || '-';
    elements.previewRequestNo.textContent = state.formData.requestNo || '-';
    elements.previewAppointmentNo.textContent = state.formData.appointmentNo || '-';
    elements.previewSignerName.textContent = state.formData.foreignerName ? `(${state.formData.foreignerName})` : '-';

    // อัพเดทรูปภาพ
    if (state.formData.cardImage) {
        elements.receiptCardImage.src = state.formData.cardImage;
        elements.previewCardBox.classList.add('has-image');
    } else {
        elements.receiptCardImage.src = '';
        elements.previewCardBox.classList.remove('has-image');
    }
}

/**
 * ล้างฟอร์ม
 */
function clearForm() {
    // Reset inputs
    elements.receiptDate.value = '';
    elements.receiptNo.value = '';
    elements.foreignerName.value = '';
    elements.snNumber.value = '';
    elements.requestNo.value = '';
    elements.appointmentNo.value = '';
    elements.cardImage.value = '';

    // Reset state
    state.formData = {
        receiptDate: '',
        receiptNo: '',
        foreignerName: '',
        snNumber: '',
        requestNo: '',
        appointmentNo: '',
        cardImage: null
    };

    // Reset image previews
    elements.cardPreview.src = '';
    elements.cardImageUpload.classList.remove('has-image');

    // Reset receipt preview
    updateReceiptPreview();

    // Set default date to today
    setDefaultDate();
}

/**
 * ตั้งค่าวันที่เริ่มต้นเป็นวันนี้
 */
function setDefaultDate() {
    elements.receiptDate.value = getTodayDateString();
}

/**
 * โหลดข้อมูลจาก registry row ลงฟอร์ม
 */
function loadFromRegistry(rowData) {
    elements.receiptNo.value = rowData.receiptNo || '';
    elements.foreignerName.value = rowData.name || '';
    elements.snNumber.value = rowData.sn || '';
    elements.requestNo.value = rowData.requestNo || '';
    elements.appointmentNo.value = rowData.appointmentNo || '';

    // แปลงวันที่จาก Thai format เป็น input format
    if (rowData.date) {
        const parts = rowData.date.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parseInt(parts[2]) - CONFIG.BUDDHIST_YEAR_OFFSET;
            elements.receiptDate.value = `${year}-${month}-${day}`;
        }
    }

    updateReceiptPreview();
}

// ==================== //
// Print & PDF
// ==================== //

/**
 * พิมพ์ใบรับ
 */
function printReceipt() {
    updateFormState();

    // Validate
    if (!state.formData.receiptNo || !state.formData.foreignerName) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน (เลขรับที่ และ ชื่อ)');
        return;
    }

    // สร้าง print content
    const printContent = generatePrintContent();
    elements.printTemplate.innerHTML = printContent;

    // Mark as printed
    markAsPrinted(state.formData.receiptNo);

    // เปิด print dialog
    window.print();
}

/**
 * สร้าง HTML สำหรับพิมพ์
 */
function generatePrintContent() {
    return `
        <div style="font-family: 'Sarabun', sans-serif; padding: 40px; max-width: 800px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px;">
                <h2 style="color: #2563eb; margin: 0 0 10px 0;">ใบรับบัตรอนุญาตทำงาน</h2>
                <p style="color: #666; margin: 0;">สำนักงานคณะกรรมการส่งเสริมการลงทุน</p>
            </div>

            <div style="margin-bottom: 30px;">
                <div style="display: flex; padding: 10px 0; border-bottom: 1px dotted #ddd;">
                    <span style="font-weight: 600; width: 180px;">วันที่รับบัตร:</span>
                    <span>${formatDateForDisplay(state.formData.receiptDate)}</span>
                </div>
                <div style="display: flex; padding: 10px 0; border-bottom: 1px dotted #ddd;">
                    <span style="font-weight: 600; width: 180px;">เลขรับที่:</span>
                    <span>${state.formData.receiptNo || '-'}</span>
                </div>
                <div style="display: flex; padding: 10px 0; border-bottom: 1px dotted #ddd;">
                    <span style="font-weight: 600; width: 180px;">ชื่อ:</span>
                    <span>${state.formData.foreignerName || '-'}</span>
                </div>
                <div style="display: flex; padding: 10px 0; border-bottom: 1px dotted #ddd;">
                    <span style="font-weight: 600; width: 180px;">หมายเลข SN บัตร:</span>
                    <span>${state.formData.snNumber || '-'}</span>
                </div>
                <div style="display: flex; padding: 10px 0; border-bottom: 1px dotted #ddd;">
                    <span style="font-weight: 600; width: 180px;">เลขที่คำขอ:</span>
                    <span>${state.formData.requestNo || '-'}</span>
                </div>
                <div style="display: flex; padding: 10px 0; border-bottom: 1px dotted #ddd;">
                    <span style="font-weight: 600; width: 180px;">เลขที่ใบนัดหมาย:</span>
                    <span>${state.formData.appointmentNo || '-'}</span>
                </div>
            </div>

            <div style="margin-bottom: 40px;">
                <div style="border: 1px solid #ddd; padding: 15px; text-align: center; min-height: 250px;">
                    <p style="color: #666; margin: 0 0 10px 0; font-size: 14px;">รูปบัตร Work Permit</p>
                    ${state.formData.cardImage ?
                        `<img src="${state.formData.cardImage}" style="max-width: 100%; max-height: 220px; object-fit: contain;">` :
                        '<p style="color: #999;">ไม่มีรูปภาพ</p>'}
                </div>
            </div>

            <div style="margin: 25px 0; padding: 15px; background-color: #f8f9fa; border-radius: 8px; border-left: 3px solid #2563eb;">
                <p style="font-size: 13px; line-height: 1.6; color: #333; margin: 0 0 8px 0;">ข้าพเจ้าตรวจความถูกต้องของใบอนุญาตทำงานแล้ว และยืนยันว่าได้รับใบอนุญาตทำงาน ศูนย์บริการวีซ่าและใบอนุญาตทำงาน อาคาร One Bangkok.</p>
                <p style="font-size: 12px; line-height: 1.5; color: #666; font-style: italic; margin: 0;">I have checked that all the information on the card is correct. and confirm that you received the card at One Stop Service Center at One Bangkok.</p>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 40px;">
                <div style="text-align: center;">
                    <div style="border-bottom: 1px solid #333; width: 80%; margin: 0 auto 10px; height: 50px;"></div>
                    <p style="color: #666;">ลงชื่อผู้รับบัตร</p>
                    <p style="color: #333; font-weight: 500; margin-top: 5px;">(${state.formData.foreignerName || '-'})</p>
                </div>
                <div style="text-align: center;">
                    <div style="border-bottom: 1px solid #333; width: 80%; margin: 0 auto 10px; height: 50px;"></div>
                    <p style="color: #666;">ลงชื่อเจ้าหน้าที่</p>
                    <p style="color: #333; font-weight: 500; margin-top: 5px;">&nbsp;</p>
                </div>
            </div>
        </div>
    `;
}

/**
 * บันทึกเป็น PDF (ใช้ browser print to PDF)
 */
function savePDF() {
    // ใช้ print dialog และให้ user เลือก "Save as PDF"
    printReceipt();
}

// ==================== //
// Summary Functions
// ==================== //

/**
 * อัพเดทสรุปรายวัน
 */
function updateSummary() {
    const selectedDate = elements.summaryDate.value;

    // กรองข้อมูลตามวันที่
    let filteredData = state.registryData;

    if (selectedDate) {
        const selectedDateObj = new Date(selectedDate);
        filteredData = state.registryData.filter(row => {
            const rowDate = parseThaiDate(row.date);
            if (!rowDate) return false;
            return rowDate.toDateString() === selectedDateObj.toDateString();
        });
    }

    // คำนวณสถิติ
    const total = filteredData.length;
    let printed = 0;
    let received = 0;

    filteredData.forEach(row => {
        if (isPrinted(row.receiptNo)) printed++;
        if (isCardReceived(row.receiptNo)) received++;
    });

    const pendingPrint = total - printed;
    const waiting = total - received;

    // อัพเดท UI
    elements.summaryTotal.textContent = total;
    elements.summaryPrinted.textContent = printed;
    elements.summaryPendingPrint.textContent = pendingPrint;
    elements.summaryReceived.textContent = received;
    elements.summaryWaiting.textContent = waiting;
}

// ==================== //
// Export Functions
// ==================== //

/**
 * ดึงข้อมูลสำหรับ Export ตามวันที่ที่เลือก
 */
function getDataForExport() {
    const selectedDate = elements.summaryDate.value;
    let filteredData = state.registryData;

    if (selectedDate) {
        const selectedDateObj = new Date(selectedDate);
        filteredData = state.registryData.filter(row => {
            const rowDate = parseThaiDate(row.date);
            if (!rowDate) return false;
            return rowDate.toDateString() === selectedDateObj.toDateString();
        });
    }

    return filteredData.map(row => ({
        ...row,
        printStatus: isPrinted(row.receiptNo) ? 'พิมพ์แล้ว' : 'รอพิมพ์',
        printCount: getPrintInfo(row.receiptNo)?.printCount || 0,
        receivedStatus: isCardReceived(row.receiptNo) ? 'รับแล้ว' : 'รอรับ',
        receivedTime: getReceivedInfo(row.receiptNo)?.receivedAt ? formatTime(getReceivedInfo(row.receiptNo).receivedAt) : '-'
    }));
}

/**
 * Export เป็น CSV
 */
function exportToCSV() {
    const data = getDataForExport();
    const selectedDate = elements.summaryDate.value;
    const dateStr = selectedDate ? formatThaiDate(selectedDate) : 'ทั้งหมด';

    if (data.length === 0) {
        alert('ไม่มีข้อมูลสำหรับวันที่เลือก');
        return;
    }

    // CSV Header
    const headers = ['ลำดับ', 'เลขรับที่', 'SN บัตร', 'ชื่อ', 'วันที่', 'เลขที่คำขอ', 'เลขนัดหมาย', 'สถานะพิมพ์', 'จำนวนพิมพ์', 'สถานะรับบัตร', 'เวลารับบัตร'];

    // CSV Rows
    const rows = data.map(row => [
        row.number,
        row.receiptNo,
        row.sn || '-',
        row.name || '-',
        row.date,
        row.requestNo || '-',
        row.appointmentNo || '-',
        row.printStatus,
        row.printCount,
        row.receivedStatus,
        row.receivedTime
    ]);

    // Create CSV content with BOM for Excel Thai support
    const BOM = '\uFEFF';
    const csvContent = BOM + [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `สรุปรายวัน_${dateStr.replace(/\//g, '-')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Export เป็น PDF (ใช้ Print dialog)
 */
function exportToPDF() {
    const data = getDataForExport();
    const selectedDate = elements.summaryDate.value;
    const dateStr = selectedDate ? formatThaiDate(selectedDate) : 'ทั้งหมด';

    if (data.length === 0) {
        alert('ไม่มีข้อมูลสำหรับวันที่เลือก');
        return;
    }

    // คำนวณสถิติ
    const total = data.length;
    const printed = data.filter(row => row.printStatus === 'พิมพ์แล้ว').length;
    const received = data.filter(row => row.receivedStatus === 'รับแล้ว').length;

    // สร้าง HTML สำหรับ Print
    const printContent = `
        <div style="font-family: 'Sarabun', sans-serif; padding: 20px; max-width: 1000px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px;">
                <h2 style="color: #2563eb; margin: 0 0 10px 0;">รายงานสรุปการผลิตบัตร Work Permit</h2>
                <p style="color: #666; margin: 0;">สำนักงานคณะกรรมการส่งเสริมการลงทุน (BOI)</p>
                <p style="color: #333; margin: 10px 0 0 0; font-weight: 600;">วันที่: ${dateStr}</p>
            </div>

            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px; margin-bottom: 30px;">
                <div style="background: #f8f9fa; padding: 15px; text-align: center; border-radius: 8px; border: 1px solid #ddd;">
                    <div style="font-size: 24px; font-weight: 700; color: #333;">${total}</div>
                    <div style="font-size: 12px; color: #666;">ผลิตบัตรทั้งหมด</div>
                </div>
                <div style="background: #dcfce7; padding: 15px; text-align: center; border-radius: 8px; border: 1px solid #16a34a;">
                    <div style="font-size: 24px; font-weight: 700; color: #333;">${printed}</div>
                    <div style="font-size: 12px; color: #666;">พิมพ์ใบรับแล้ว</div>
                </div>
                <div style="background: #fef3c7; padding: 15px; text-align: center; border-radius: 8px; border: 1px solid #f59e0b;">
                    <div style="font-size: 24px; font-weight: 700; color: #333;">${total - printed}</div>
                    <div style="font-size: 12px; color: #666;">รอพิมพ์ใบรับ</div>
                </div>
                <div style="background: #dbeafe; padding: 15px; text-align: center; border-radius: 8px; border: 1px solid #2563eb;">
                    <div style="font-size: 24px; font-weight: 700; color: #333;">${received}</div>
                    <div style="font-size: 12px; color: #666;">รับบัตรแล้ว</div>
                </div>
                <div style="background: #f3e8ff; padding: 15px; text-align: center; border-radius: 8px; border: 1px solid #9333ea;">
                    <div style="font-size: 24px; font-weight: 700; color: #333;">${total - received}</div>
                    <div style="font-size: 12px; color: #666;">รอรับบัตร</div>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <thead>
                    <tr style="background: #f3f4f6;">
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">ลำดับ</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">เลขรับที่</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">SN บัตร</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">ชื่อ</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">สถานะพิมพ์</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">สถานะรับบัตร</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">เวลารับ</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr>
                            <td style="padding: 8px; border: 1px solid #ddd;">${row.number}</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${row.receiptNo}</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${row.sn || '-'}</td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${row.name || '-'}</td>
                            <td style="padding: 8px; border: 1px solid #ddd; color: ${row.printStatus === 'พิมพ์แล้ว' ? '#16a34a' : '#6b7280'};">
                                ${row.printStatus === 'พิมพ์แล้ว' ? '✅ ' : '⏳ '}${row.printStatus}
                            </td>
                            <td style="padding: 8px; border: 1px solid #ddd; color: ${row.receivedStatus === 'รับแล้ว' ? '#2563eb' : '#6b7280'};">
                                ${row.receivedStatus === 'รับแล้ว' ? '🎫 ' : '📦 '}${row.receivedStatus}
                            </td>
                            <td style="padding: 8px; border: 1px solid #ddd;">${row.receivedTime}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div style="margin-top: 30px; text-align: right; font-size: 11px; color: #666;">
                <p>พิมพ์เมื่อ: ${new Date().toLocaleString('th-TH')}</p>
            </div>
        </div>
    `;

    elements.printTemplate.innerHTML = printContent;
    window.print();
}

// ==================== //
// Search & Filter
// ==================== //

/**
 * กรองข้อมูลตาม search และ filter
 */
function getFilteredData() {
    let data = [...state.registryData];

    // Search
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        data = data.filter(row => {
            return (
                (row.receiptNo && row.receiptNo.toLowerCase().includes(query)) ||
                (row.sn && row.sn.toLowerCase().includes(query)) ||
                (row.name && row.name.toLowerCase().includes(query)) ||
                (row.requestNo && row.requestNo.toLowerCase().includes(query)) ||
                (row.appointmentNo && row.appointmentNo.toLowerCase().includes(query))
            );
        });
    }

    // Filter by status
    if (state.filterStatus !== 'all') {
        data = data.filter(row => {
            const printed = isPrinted(row.receiptNo);
            const received = isCardReceived(row.receiptNo);

            switch (state.filterStatus) {
                case 'printed':
                    return printed;
                case 'not-printed':
                    return !printed;
                case 'received':
                    return received;
                case 'not-received':
                    return !received;
                default:
                    return true;
            }
        });
    }

    return data;
}

// ==================== //
// Data Loading (Mock)
// ==================== //

/**
 * โหลดข้อมูลจาก Google Sheets (Mock data สำหรับทดสอบ)
 */
async function loadRegistryData() {
    state.isLoading = true;
    renderRegistryTable();

    // Mock data - จะเปลี่ยนเป็น API call จริงภายหลัง
    const mockData = [
        { number: 1, receiptNo: '6902/0001', sn: 'SN001234567', name: 'RAFAEL MASSAYOSHI NIITSUMA', date: '4/2/2569', requestNo: 'B69113800005141', appointmentNo: '1-BKK001022600508-SW' },
        { number: 2, receiptNo: '6902/0002', sn: 'SN001234568', name: 'JOHN WILLIAM SMITH', date: '4/2/2569', requestNo: 'B69113800005147', appointmentNo: '1-BKK001022600514-SW' },
        { number: 3, receiptNo: '6902/0003', sn: 'SN001234569', name: 'MARIA GARCIA LOPEZ', date: '4/2/2569', requestNo: 'B69113800005146', appointmentNo: '1-BKK001022600513-SW' },
        { number: 4, receiptNo: '6902/0004', sn: 'SN001234570', name: 'HIROSHI TANAKA', date: '4/2/2569', requestNo: 'B69113800005145', appointmentNo: '1-BKK001022600512-SW' },
        { number: 5, receiptNo: '6902/0005', sn: 'SN001234571', name: 'ANNA MARIE JOHNSON', date: '4/2/2569', requestNo: 'B69113800005149', appointmentNo: '1-BKK001022600516-SW' },
        { number: 6, receiptNo: '6902/0006', sn: 'SN001234572', name: 'CHEN WEI MING', date: '4/2/2569', requestNo: 'B69113800005148', appointmentNo: '1-BKK001022600515-SW' },
        { number: 7, receiptNo: '6902/0007', sn: 'SN001234573', name: 'MICHAEL DAVID BROWN', date: '4/2/2569', requestNo: 'B69113800005151', appointmentNo: 'SW681842000201' },
        { number: 8, receiptNo: '6902/0008', sn: 'SN001234574', name: 'YUKI YAMAMOTO', date: '4/2/2569', requestNo: 'B69113800005155', appointmentNo: '1-BKK001022600522-SW' },
        { number: 9, receiptNo: '6902/0009', sn: 'SN001234575', name: 'EMMA CHARLOTTE WILSON', date: '4/2/2569', requestNo: 'B69113800005154', appointmentNo: '1-BKK001022600521-SW' },
        { number: 10, receiptNo: '6902/0010', sn: 'SN001234576', name: 'KENJI WATANABE', date: '5/2/2569', requestNo: 'B69113800005160', appointmentNo: '1-BKK001022600530-SW' },
        { number: 11, receiptNo: '6902/0011', sn: 'SN001234577', name: 'LISA MARIE ANDERSON', date: '5/2/2569', requestNo: 'B69113800005161', appointmentNo: '1-BKK001022600531-SW' },
        { number: 12, receiptNo: '6902/0012', sn: 'SN001234578', name: 'WANG XIAO LONG', date: '5/2/2569', requestNo: 'B69113800005162', appointmentNo: '1-BKK001022600532-SW' },
    ];

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    state.registryData = mockData;
    state.isLoading = false;

    renderRegistryTable();
    updateSummary();

    // ตั้งเลขรับที่ถัดไปอัตโนมัติ
    if (!elements.receiptNo.value) {
        elements.receiptNo.value = generateNextReceiptNo(state.registryData);
    }
}

/**
 * แสดงตารางข้อมูล
 */
function renderRegistryTable() {
    if (state.isLoading) {
        elements.registryBody.innerHTML = `
            <tr class="loading-row">
                <td colspan="8">กำลังโหลดข้อมูล...</td>
            </tr>
        `;
        return;
    }

    const filteredData = getFilteredData();

    if (filteredData.length === 0) {
        elements.registryBody.innerHTML = `
            <tr class="loading-row">
                <td colspan="8">ไม่พบข้อมูล</td>
            </tr>
        `;
        return;
    }

    elements.registryBody.innerHTML = filteredData.map(row => {
        const printed = isPrinted(row.receiptNo);
        const printInfo = getPrintInfo(row.receiptNo);
        const received = isCardReceived(row.receiptNo);
        const receivedInfo = getReceivedInfo(row.receiptNo);

        // Print status
        const printStatusClass = printed ? 'status-printed' : 'status-pending';
        const printStatusText = printed ? `✅ พิมพ์แล้ว (${printInfo.printCount})` : '⏳ รอพิมพ์';

        // Received status
        const receivedCheckbox = `<input type="checkbox" class="received-checkbox"
            ${received ? 'checked' : ''}
            onchange="toggleCardReceived('${row.receiptNo}')"
            title="${received ? 'คลิกเพื่อยกเลิก' : 'คลิกเพื่อยืนยันรับบัตร'}">`;
        const receivedTime = received && receivedInfo ? `<span class="received-time">${formatTime(receivedInfo.receivedAt)}</span>` : '';
        const receivedStatusText = received ? '🎫 รับแล้ว' : '📦 รอรับ';
        const receivedStatusClass = received ? 'status-received' : 'status-waiting';

        // Button
        const buttonText = printed ? 'พิมพ์ซ้ำ' : 'เลือก';
        const buttonClass = printed ? 'btn-outline' : 'btn-primary';

        // Row class
        let rowClass = '';
        if (received) {
            rowClass = 'row-received';
        } else if (printed) {
            rowClass = 'row-printed';
        }

        return `
            <tr class="${rowClass}">
                <td>${row.number}</td>
                <td>${row.receiptNo}</td>
                <td>${row.sn || '-'}</td>
                <td>${row.name || '-'}</td>
                <td>${row.date}</td>
                <td><span class="${printStatusClass}">${printStatusText}</span></td>
                <td>
                    <div class="received-status">
                        ${receivedCheckbox}
                        <span class="${receivedStatusClass}">${receivedStatusText}</span>
                        ${receivedTime}
                    </div>
                </td>
                <td>
                    <button class="btn ${buttonClass} btn-sm" onclick="selectRow(${row.number - 1})">
                        ${buttonText}
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * เลือกแถวจากตาราง
 */
function selectRow(index) {
    const rowData = state.registryData[index];
    if (rowData) {
        loadFromRegistry(rowData);
    }
}

// Make selectRow available globally
window.selectRow = selectRow;

// ==================== //
// Event Listeners
// ==================== //

function setupEventListeners() {
    // Image upload (single)
    setupImageUpload(
        elements.cardImageUpload,
        elements.cardImage,
        elements.cardPreview,
        elements.cardPlaceholder,
        'cardImage'
    );

    // Form inputs - update preview on change
    ['receiptDate', 'receiptNo', 'foreignerName', 'snNumber', 'requestNo', 'appointmentNo'].forEach(id => {
        elements[id].addEventListener('input', updateReceiptPreview);
    });

    // Buttons
    elements.clearBtn.addEventListener('click', clearForm);
    elements.previewBtn.addEventListener('click', updateReceiptPreview);
    elements.printBtn.addEventListener('click', printReceipt);
    elements.refreshDataBtn.addEventListener('click', loadRegistryData);

    // Summary date picker
    elements.summaryDate.addEventListener('change', updateSummary);

    // Export buttons
    elements.exportCsvBtn.addEventListener('click', exportToCSV);
    elements.exportPdfBtn.addEventListener('click', exportToPDF);

    // Search
    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderRegistryTable();
    });

    // Filter
    elements.filterStatus.addEventListener('change', (e) => {
        state.filterStatus = e.target.value;
        renderRegistryTable();
    });
}

// ==================== //
// Initialization
// ==================== //

document.addEventListener('DOMContentLoaded', () => {
    console.log('Work Permit Receipt System initialized');

    // Load data from localStorage
    loadPrintedReceipts();
    loadReceivedCards();

    // Setup
    setupEventListeners();
    setDefaultDate();

    // Set summary date to today
    elements.summaryDate.value = getTodayDateString();

    // Load initial data
    loadRegistryData();

    // Initial preview update
    updateReceiptPreview();
});
