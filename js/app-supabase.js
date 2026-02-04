/**
 * Work Permit Receipt System - Main Application
 * ระบบสร้างแบบฟอร์มรับบัตร - EWP Service Center
 * Version 5.1 - Security Enhanced
 */

// ==================== //
// Security Utilities
// ==================== //

/**
 * Sanitize string to prevent XSS attacks
 * @param {string} str - Input string
 * @returns {string} - Sanitized string
 */
function sanitizeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Validate input data
 * @param {string} input - Input to validate
 * @param {string} type - Type of validation (text, email, number, date)
 * @returns {boolean} - Is valid
 */
function validateInput(input, type = 'text') {
    if (input === null || input === undefined) return false;
    const str = String(input).trim();

    switch(type) {
        case 'text':
            // No script tags, max 500 chars
            return str.length <= 500 && !/<script/i.test(str);
        case 'email':
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
        case 'number':
            return /^[0-9\-]+$/.test(str);
        case 'date':
            return /^\d{4}-\d{2}-\d{2}$/.test(str);
        case 'receiptNo':
            return /^[0-9\-]+$/.test(str) && str.length <= 20;
        default:
            return true;
    }
}

// ==================== //
// Configuration
// ==================== //
const CONFIG = {
    // Google Sheets Configuration
    SPREADSHEET_ID: '1OAe6uFkaiJyw548d0JfHqylAAFowLbxQ',
    SHEET_NAME_REGISTRY: 'คุมทะเบียน',
    SHEET_NAME_FORM: 'ฟอร์มรับบัตร',
    API_KEY: '', // ใส่ Google API Key ที่นี่

    // Receipt Number Format
    RECEIPT_PREFIX: '6902',

    // Date Format
    DATE_LOCALE: 'th-TH',
    BUDDHIST_YEAR_OFFSET: 543,

    // Google Sheets Column Mapping (0-indexed)
    SHEET_COLUMNS: {
        NUMBER: 0,      // A: ลำดับ
        NO: 1,          // B: เลขรับที่
        DATE: 2,        // C: วันที่
        REQUEST_NO: 3,  // D: เลขคำขอ
        APPT_NO: 4,     // E: เลขนัดหมาย
        PHOTO: 5,       // F: รูป
        NAME: 6         // G: ชื่อ
    }
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
    printedReceipts: [],
    receivedCards: [],
    activityLog: [],
    selectedItems: [], // For batch print
    isLoading: false,
    searchQuery: '',
    filterStatus: 'all',
    formMode: 'add', // 'add' or 'edit'
    editingReceiptNo: null,
    // Google Sheets data
    sheetData: [],
    sheetDataLoaded: false,
    sheetLastFetch: null
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
    previewDocNo: document.getElementById('previewDocNo'),
    previewName: document.getElementById('previewName'),
    previewSN: document.getElementById('previewSN'),
    previewRequestNo: document.getElementById('previewRequestNo'),
    previewAppointmentNo: document.getElementById('previewAppointmentNo'),
    receiptCardImage: document.getElementById('receiptCardImage'),
    previewCardBox: document.getElementById('previewCardBox'),
    previewSignerName: document.getElementById('previewSignerName'),

    // Buttons
    clearBtn: document.getElementById('clearBtn'),
    saveBtn: document.getElementById('saveBtn'),
    printBtn: document.getElementById('printBtn'),
    refreshDataBtn: document.getElementById('refreshDataBtn'),
    addNewBtn: document.getElementById('addNewBtn'),

    // Form header
    formTitle: document.getElementById('formTitle'),
    formModeBadge: document.getElementById('formModeBadge'),

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
    filterStatus: document.getElementById('filterStatus'),

    // Batch Print
    batchPrintBtn: document.getElementById('batchPrintBtn'),
    selectedCount: document.getElementById('selectedCount'),
    selectAllCheckbox: document.getElementById('selectAllCheckbox'),

    // Monthly Report
    reportMonth: document.getElementById('reportMonth'),
    reportYear: document.getElementById('reportYear'),
    generateReportBtn: document.getElementById('generateReportBtn'),
    exportMonthlyPdfBtn: document.getElementById('exportMonthlyPdfBtn'),
    exportMonthlyCsvBtn: document.getElementById('exportMonthlyCsvBtn'),
    monthlyTotal: document.getElementById('monthlyTotal'),
    monthlyPrinted: document.getElementById('monthlyPrinted'),
    monthlyReceived: document.getElementById('monthlyReceived'),
    monthlyPending: document.getElementById('monthlyPending'),
    dailyBreakdown: document.getElementById('dailyBreakdown'),

    // Activity Log
    activityFilter: document.getElementById('activityFilter'),
    clearLogBtn: document.getElementById('clearLogBtn'),
    activityList: document.getElementById('activityList')
};

// ==================== //
// Utility Functions
// ==================== //

function formatThaiDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear() + CONFIG.BUDDHIST_YEAR_OFFSET;
    return `${day}/${month}/${year}`;
}

function formatDateForDisplay(dateInput) {
    if (!dateInput) return '-';
    return formatThaiDate(dateInput);
}

function parseThaiDate(thaiDateStr) {
    if (!thaiDateStr) return null;
    const parts = thaiDateStr.split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]) - CONFIG.BUDDHIST_YEAR_OFFSET;
    return new Date(year, month, day);
}

function getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function readImageAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

function generateNextReceiptNo(currentData) {
    // Format: YYYYMMDD-001
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;

    if (!currentData || currentData.length === 0) {
        return `${datePrefix}-001`;
    }

    // Find receipts with same date prefix and get max number
    const todayReceipts = currentData
        .map(row => row.receiptNo)
        .filter(no => no && no.startsWith(datePrefix))
        .map(no => {
            const parts = no.split('-');
            return parts.length === 2 ? parseInt(parts[1]) || 0 : 0;
        })
        .sort((a, b) => b - a);

    const lastNo = todayReceipts.length > 0 ? todayReceipts[0] : 0;
    const nextNo = (lastNo + 1).toString().padStart(3, '0');
    return `${datePrefix}-${nextNo}`;
}

function formatTime(isoString) {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
}

// ==================== //
// Supabase Data Functions (Replaces LocalStorage)
// ==================== //

// These functions now use SupabaseAdapter from supabase-adapter.js

function loadRegistryFromStorage() {
    // Synchronous fallback - actual loading is async in loadRegistryData()
    return state.registryData || [];
}

function saveRegistryToStorage() {
    // No-op - saving is handled by saveData() with Supabase
    console.log('Note: saveRegistryToStorage() - Using Supabase instead');
}

function loadPrintedReceipts() {
    // Printed status is now stored in receipts table (is_printed column)
    // This function updates state from registryData
    state.printedReceipts = state.registryData
        .filter(r => r.isPrinted)
        .map(r => ({
            receiptNo: r.receiptNo,
            printedAt: r.printedAt,
            printCount: 1
        }));
}

function savePrintedReceipts() {
    // No-op - saving is handled by markAsPrinted() with Supabase
    console.log('Note: savePrintedReceipts() - Using Supabase instead');
}

function loadReceivedCards() {
    // Received status is now stored in receipts table (is_received column)
    state.receivedCards = state.registryData
        .filter(r => r.isReceived)
        .map(r => ({
            receiptNo: r.receiptNo,
            receivedAt: r.receivedAt
        }));
}

function saveReceivedCards() {
    // No-op - saving is handled by toggleCardReceived() with Supabase
    console.log('Note: saveReceivedCards() - Using Supabase instead');
}

// ==================== //
// Activity Log (Supabase)
// ==================== //

async function loadActivityLog() {
    try {
        const logs = await SupabaseAdapter.loadActivityLog(100);
        state.activityLog = logs;
    } catch (e) {
        console.error('Error loading activity log:', e);
        state.activityLog = [];
    }
}

function saveActivityLog() {
    // No-op - Activity is saved via SupabaseAdapter in individual actions
    console.log('Note: saveActivityLog() - Using Supabase instead');
}

function addActivity(type, title, details = '') {
    // Add to local state for immediate UI update
    const activity = {
        id: Date.now(),
        type: type,
        title: title,
        details: details,
        timestamp: new Date().toISOString()
    };
    state.activityLog.unshift(activity);
    renderActivityLog();

    // Note: Actual save to Supabase happens in the calling function via SupabaseAdapter
}

function clearActivityLog() {
    alert('Activity Log ถูกเก็บไว้บน Cloud ไม่สามารถล้างได้');
}

function renderActivityLog() {
    const filter = elements.activityFilter ? elements.activityFilter.value : 'all';
    let activities = state.activityLog;

    if (filter !== 'all') {
        activities = activities.filter(a => a.type === filter);
    }

    if (activities.length === 0) {
        elements.activityList.innerHTML = '<div class="activity-empty">ยังไม่มี Activity</div>';
        return;
    }

    const iconMap = {
        'add': { icon: '➕', class: 'add' },
        'edit': { icon: '✏️', class: 'edit' },
        'delete': { icon: '🗑️', class: 'delete' },
        'print': { icon: '🖨️', class: 'print' },
        'receive': { icon: '🎫', class: 'receive' }
    };

    elements.activityList.innerHTML = activities.slice(0, 100).map(activity => {
        const iconInfo = iconMap[activity.type] || { icon: '📝', class: 'add' };
        const time = new Date(activity.timestamp);
        const timeStr = time.toLocaleDateString('th-TH') + ' ' + time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

        return `
            <div class="activity-item">
                <div class="activity-icon ${iconInfo.class}">${iconInfo.icon}</div>
                <div class="activity-content">
                    <div class="activity-title">${activity.title}</div>
                    ${activity.details ? `<div class="activity-details">${activity.details}</div>` : ''}
                </div>
                <div class="activity-time">${timeStr}</div>
            </div>
        `;
    }).join('');
}

// ==================== //
// Print & Received Tracking (Supabase)
// ==================== //

async function markAsPrinted(receiptNo) {
    if (!receiptNo) return;

    try {
        await SupabaseAdapter.markPrinted(receiptNo);

        // Update local state
        const record = state.registryData.find(r => r.receiptNo === receiptNo);
        if (record) {
            record.isPrinted = true;
            record.printedAt = new Date().toISOString();
        }

        // Update printedReceipts array
        const existingIndex = state.printedReceipts.findIndex(r => r.receiptNo === receiptNo);
        if (existingIndex >= 0) {
            state.printedReceipts[existingIndex].printCount++;
        } else {
            state.printedReceipts.push({
                receiptNo: receiptNo,
                printedAt: new Date().toISOString(),
                printCount: 1
            });
        }

        renderRegistryTable();
        updateSummary();
    } catch (e) {
        console.error('Error marking as printed:', e);
        alert('เกิดข้อผิดพลาดในการบันทึกสถานะพิมพ์');
    }
}

function isPrinted(receiptNo) {
    // Check from registryData first (has is_printed from Supabase)
    const record = state.registryData.find(r => r.receiptNo === receiptNo);
    if (record) return record.isPrinted || false;
    return state.printedReceipts.some(r => r.receiptNo === receiptNo);
}

function getPrintInfo(receiptNo) {
    const record = state.registryData.find(r => r.receiptNo === receiptNo);
    if (record && record.isPrinted) {
        return {
            receiptNo: receiptNo,
            printedAt: record.printedAt,
            printCount: 1
        };
    }
    return state.printedReceipts.find(r => r.receiptNo === receiptNo);
}

async function toggleCardReceived(receiptNo) {
    if (!receiptNo) return;

    try {
        const newStatus = await SupabaseAdapter.toggleReceived(receiptNo);
        const record = state.registryData.find(r => r.receiptNo === receiptNo);

        // Update local state
        if (record) {
            record.isReceived = newStatus;
            record.receivedAt = newStatus ? new Date().toISOString() : null;
        }

        // Update receivedCards array
        const existingIndex = state.receivedCards.findIndex(r => r.receiptNo === receiptNo);
        if (newStatus) {
            if (existingIndex < 0) {
                state.receivedCards.push({
                    receiptNo: receiptNo,
                    receivedAt: new Date().toISOString()
                });
            }
            addActivity('receive', `รับบัตรแล้ว ${receiptNo}`, record ? record.name : '');
        } else {
            if (existingIndex >= 0) {
                state.receivedCards.splice(existingIndex, 1);
            }
            addActivity('receive', `ยกเลิกรับบัตร ${receiptNo}`, record ? record.name : '');
        }

        renderRegistryTable();
        updateSummary();
    } catch (e) {
        console.error('Error toggling received:', e);
        alert('เกิดข้อผิดพลาดในการบันทึกสถานะรับบัตร');
    }
}

function isCardReceived(receiptNo) {
    // Check from registryData first (has is_received from Supabase)
    const record = state.registryData.find(r => r.receiptNo === receiptNo);
    if (record) return record.isReceived || false;
    return state.receivedCards.some(r => r.receiptNo === receiptNo);
}

function getReceivedInfo(receiptNo) {
    const record = state.registryData.find(r => r.receiptNo === receiptNo);
    if (record && record.isReceived) {
        return {
            receiptNo: receiptNo,
            receivedAt: record.receivedAt
        };
    }
    return state.receivedCards.find(r => r.receiptNo === receiptNo);
}

window.toggleCardReceived = toggleCardReceived;

// ==================== //
// Batch Print Functions
// ==================== //

function toggleSelectItem(receiptNo) {
    const index = state.selectedItems.indexOf(receiptNo);
    if (index >= 0) {
        state.selectedItems.splice(index, 1);
    } else {
        state.selectedItems.push(receiptNo);
    }
    updateBatchPrintUI();
}

function toggleSelectAll() {
    const filteredData = getFilteredData();
    if (state.selectedItems.length === filteredData.length) {
        state.selectedItems = [];
    } else {
        state.selectedItems = filteredData.map(row => row.receiptNo);
    }
    renderRegistryTable();
    updateBatchPrintUI();
}

function updateBatchPrintUI() {
    const count = state.selectedItems.length;
    if (elements.selectedCount) {
        elements.selectedCount.textContent = count;
    }
    if (elements.batchPrintBtn) {
        elements.batchPrintBtn.disabled = count === 0;
    }
    // Update select all checkbox
    const filteredData = getFilteredData();
    if (elements.selectAllCheckbox) {
        elements.selectAllCheckbox.checked = filteredData.length > 0 && state.selectedItems.length === filteredData.length;
        elements.selectAllCheckbox.indeterminate = state.selectedItems.length > 0 && state.selectedItems.length < filteredData.length;
    }
}

function batchPrint() {
    if (state.selectedItems.length === 0) {
        alert('กรุณาเลือกรายการที่ต้องการพิมพ์');
        return;
    }

    const selectedData = state.registryData.filter(row => state.selectedItems.includes(row.receiptNo));

    // Generate print content for all selected items
    let printContent = '';
    selectedData.forEach((rowData, index) => {
        const formData = {
            receiptDate: '',
            receiptNo: rowData.receiptNo,
            foreignerName: rowData.name,
            snNumber: rowData.sn,
            requestNo: rowData.requestNo,
            appointmentNo: rowData.appointmentNo,
            cardImage: rowData.cardImage
        };

        // Parse date
        if (rowData.date) {
            const parts = rowData.date.split('/');
            if (parts.length === 3) {
                const day = parts[0].padStart(2, '0');
                const month = parts[1].padStart(2, '0');
                const year = parseInt(parts[2]) - CONFIG.BUDDHIST_YEAR_OFFSET;
                formData.receiptDate = `${year}-${month}-${day}`;
            }
        }

        printContent += generateSinglePrintContent(formData);
        if (index < selectedData.length - 1) {
            printContent += '<div style="page-break-after: always;"></div>';
        }
    });

    elements.printTemplate.innerHTML = printContent;

    // Store selected items for confirmation
    const itemsToPrint = [...state.selectedItems];
    const receiptNos = selectedData.map(r => r.receiptNo).join(', ');
    const count = selectedData.length;

    window.print();

    // Ask for confirmation after print dialog closes
    setTimeout(() => {
        if (confirm(`พิมพ์ใบรับ ${count} รายการ เรียบร้อยแล้วหรือไม่?`)) {
            // Mark all as printed
            itemsToPrint.forEach(receiptNo => {
                markAsPrintedSilent(receiptNo);
            });
            addActivity('print', `พิมพ์ใบรับ ${count} รายการ (Batch)`, receiptNos);
            renderRegistryTable();
            updateSummary();
        }
    }, 500);

    // Clear selection after print
    state.selectedItems = [];
    renderRegistryTable();
    updateBatchPrintUI();
}

function generateSinglePrintContent(formData) {
    // ดึงชื่อเจ้าหน้าที่จาก session
    const session = window.AuthSystem ? window.AuthSystem.getSession() : null;
    const officerName = session ? session.name : '';

    return `
        <div class="print-receipt-page" style="font-family: 'Sarabun', sans-serif; font-size: 14px; line-height: 1.4; padding: 10mm 15mm;">
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 3px solid #2563eb;">
                <h2 style="color: #2563eb; margin: 0; font-size: 24px; font-weight: 700;">แบบรับใบอนุญาตทำงาน e-WorkPermit</h2>
                <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 16px;">(e-WorkPermit Card Receipt)</p>
            </div>

            <!-- ข้อมูลหลัก -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; background: #f8fafc; border: 1px solid #e5e7eb;">
                <tr>
                    <td style="padding: 12px 15px; border-bottom: 1px dotted #ddd; width: 50%;">
                        <div style="font-weight: 600; color: #374151; font-size: 12px;">วันที่รับบัตร / Receipt Date:</div>
                        <div style="color: #111; font-size: 16px; font-weight: 500; margin-top: 3px;">${formatDateForDisplay(formData.receiptDate)}</div>
                    </td>
                    <td style="padding: 12px 15px; border-bottom: 1px dotted #ddd;">
                        <div style="font-weight: 600; color: #374151; font-size: 12px;">หมายเลข SN / Serial No.:</div>
                        <div style="color: #111; font-size: 16px; font-weight: 500; margin-top: 3px;">${formData.snNumber || '-'}</div>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 12px 15px; border-bottom: 1px dotted #ddd;">
                        <div style="font-weight: 600; color: #374151; font-size: 12px;">ชื่อผู้รับบัตร / Name:</div>
                        <div style="color: #111; font-size: 16px; font-weight: 500; margin-top: 3px;">${formData.foreignerName || '-'}</div>
                    </td>
                    <td style="padding: 12px 15px; border-bottom: 1px dotted #ddd;">
                        <div style="font-weight: 600; color: #374151; font-size: 12px;">เลขที่คำขอ / Request No.:</div>
                        <div style="color: #111; font-size: 16px; font-weight: 500; margin-top: 3px;">${formData.requestNo || '-'}</div>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="padding: 12px 15px;">
                        <div style="font-weight: 600; color: #374151; font-size: 12px;">เลขที่นัดหมาย / Appointment No.:</div>
                        <div style="color: #111; font-size: 16px; font-weight: 500; margin-top: 3px;">${formData.appointmentNo || '-'}</div>
                    </td>
                </tr>
            </table>

            <!-- รูปบัตร -->
            <div style="margin-bottom: 18px;">
                <p style="text-align: center; font-weight: 600; color: #374151; margin: 0 0 10px 0; font-size: 13px;">รูปบัตรอนุญาตทำงาน / Work Permit Card Image</p>
                <div style="border: 2px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; min-height: 220px; background: #fff; display: flex; align-items: center; justify-content: center;">
                    ${formData.cardImage ?
                        `<img src="${formData.cardImage}" style="max-width: 100%; max-height: 210px; object-fit: contain;">` :
                        `<div style="color: #9ca3af;"><p style="font-size: 40px; margin: 0;">📷</p><p style="font-size: 14px; margin: 10px 0 0 0;">ไม่มีรูปภาพ / No Image</p></div>`}
                </div>
            </div>

            <!-- ข้อความยืนยัน -->
            <div style="margin: 15px 0; padding: 14px 18px; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #2563eb;">
                <p style="font-size: 13px; line-height: 1.6; color: #1f2937; margin: 0 0 6px 0;">ข้าพเจ้าตรวจความถูกต้องของใบอนุญาตทำงานแล้ว และยืนยันว่าได้รับใบอนุญาตทำงาน ณ ศูนย์บริการวีซ่าและใบอนุญาตทำงาน อาคาร One Bangkok</p>
                <p style="font-size: 11px; line-height: 1.5; color: #6b7280; font-style: italic; margin: 0;">I have verified that all information on the work permit card is correct and confirm receipt at the Visa and Work Permit Service Center, One Bangkok Building.</p>
            </div>

            <!-- ช่องลงชื่อ -->
            <table style="width: 100%; margin-top: 25px;">
                <tr>
                    <td style="width: 50%; text-align: center; padding: 0 25px;">
                        <div style="border-bottom: 1px solid #374151; height: 40px; margin-bottom: 8px;"></div>
                        <p style="color: #374151; margin: 0; font-size: 12px; font-weight: 600;">ลงชื่อผู้รับบัตร / Cardholder</p>
                        <p style="color: #1f2937; font-weight: 600; margin: 6px 0; font-size: 12px;">(${formData.foreignerName || '___________________'})</p>
                        <p style="color: #6b7280; margin: 0; font-size: 11px;">Tel: ________________________</p>
                    </td>
                    <td style="width: 50%; text-align: center; padding: 0 25px;">
                        <div style="border-bottom: 1px solid #374151; height: 40px; margin-bottom: 8px;"></div>
                        <p style="color: #374151; margin: 0; font-size: 12px; font-weight: 600;">ลงชื่อเจ้าหน้าที่ / Officer</p>
                        <p style="color: #1f2937; font-weight: 600; margin: 6px 0; font-size: 12px;">(${officerName || '___________________'})</p>
                        <p style="color: #6b7280; margin: 0; font-size: 11px;">Date: ${formatDateForDisplay(formData.receiptDate)}</p>
                    </td>
                </tr>
            </table>

            <!-- Footer with Org Name and Doc No -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                <div style="font-size: 10px; color: #6b7280;">ศูนย์บริการ EWP อาคาร One Bangkok</div>
                <div style="font-size: 10px; color: #6b7280;">Doc No.: ${formData.receiptNo || '-'}</div>
            </div>
        </div>
    `;
}

function markAsPrintedSilent(receiptNo) {
    if (!receiptNo) return;
    const existingIndex = state.printedReceipts.findIndex(r => r.receiptNo === receiptNo);
    if (existingIndex >= 0) {
        state.printedReceipts[existingIndex].printCount++;
        state.printedReceipts[existingIndex].lastPrintedAt = new Date().toISOString();
    } else {
        state.printedReceipts.push({
            receiptNo: receiptNo,
            printedAt: new Date().toISOString(),
            printCount: 1
        });
    }
    savePrintedReceipts();
}

window.toggleSelectItem = toggleSelectItem;

// ==================== //
// Monthly Report Functions
// ==================== //

const THAI_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

function initMonthlyReportDropdowns() {
    // Populate months
    if (elements.reportMonth) {
        elements.reportMonth.innerHTML = '<option value="">-- เลือกเดือน --</option>';
        THAI_MONTHS.forEach((month, index) => {
            const option = document.createElement('option');
            option.value = index + 1;
            option.textContent = month;
            elements.reportMonth.appendChild(option);
        });
        // Default to current month
        elements.reportMonth.value = new Date().getMonth() + 1;
    }

    // Populate years (Buddhist Era)
    if (elements.reportYear) {
        elements.reportYear.innerHTML = '<option value="">-- เลือกปี --</option>';
        const currentYear = new Date().getFullYear() + CONFIG.BUDDHIST_YEAR_OFFSET;
        for (let year = currentYear; year >= currentYear - 5; year--) {
            const option = document.createElement('option');
            option.value = year - CONFIG.BUDDHIST_YEAR_OFFSET;
            option.textContent = year;
            elements.reportYear.appendChild(option);
        }
        // Default to current year
        elements.reportYear.value = new Date().getFullYear();
    }
}

function getMonthlyData(month, year) {
    if (!month || !year) return [];

    return state.registryData.filter(row => {
        if (!row.date) return false;
        const parts = row.date.split('/');
        if (parts.length !== 3) return false;
        const rowMonth = parseInt(parts[1]);
        const rowYear = parseInt(parts[2]) - CONFIG.BUDDHIST_YEAR_OFFSET;
        return rowMonth === parseInt(month) && rowYear === parseInt(year);
    });
}

function generateMonthlyReport() {
    const month = elements.reportMonth ? elements.reportMonth.value : '';
    const year = elements.reportYear ? elements.reportYear.value : '';

    if (!month || !year) {
        alert('กรุณาเลือกเดือนและปี');
        return;
    }

    const data = getMonthlyData(month, year);

    // Calculate stats
    let printed = 0;
    let received = 0;

    data.forEach(row => {
        if (isPrinted(row.receiptNo)) printed++;
        if (isCardReceived(row.receiptNo)) received++;
    });

    // Update stats
    if (elements.monthlyTotal) elements.monthlyTotal.textContent = data.length;
    if (elements.monthlyPrinted) elements.monthlyPrinted.textContent = printed;
    if (elements.monthlyReceived) elements.monthlyReceived.textContent = received;
    if (elements.monthlyPending) elements.monthlyPending.textContent = data.length - received;

    // Generate daily breakdown
    generateDailyBreakdown(data, month, year);
}

function generateDailyBreakdown(data, month, year) {
    if (!elements.dailyBreakdown) return;

    if (data.length === 0) {
        elements.dailyBreakdown.innerHTML = '<div class="daily-breakdown-empty">ไม่มีข้อมูลในเดือนที่เลือก</div>';
        return;
    }

    // Group by day
    const dailyStats = {};
    data.forEach(row => {
        if (!row.date) return;
        const parts = row.date.split('/');
        const day = parseInt(parts[0]);
        if (!dailyStats[day]) {
            dailyStats[day] = { total: 0, printed: 0, received: 0 };
        }
        dailyStats[day].total++;
        if (isPrinted(row.receiptNo)) dailyStats[day].printed++;
        if (isCardReceived(row.receiptNo)) dailyStats[day].received++;
    });

    // Sort by day
    const sortedDays = Object.keys(dailyStats).sort((a, b) => parseInt(a) - parseInt(b));

    const thaiYear = parseInt(year) + CONFIG.BUDDHIST_YEAR_OFFSET;

    elements.dailyBreakdown.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>วันที่</th>
                    <th>ผลิตบัตร</th>
                    <th>พิมพ์แล้ว</th>
                    <th>รับบัตรแล้ว</th>
                    <th>รอดำเนินการ</th>
                </tr>
            </thead>
            <tbody>
                ${sortedDays.map(day => {
                    const stat = dailyStats[day];
                    const pending = stat.total - stat.received;
                    return `
                        <tr>
                            <td>${day}/${month}/${thaiYear}</td>
                            <td>${stat.total}</td>
                            <td style="color: var(--success-color);">${stat.printed}</td>
                            <td style="color: var(--primary-color);">${stat.received}</td>
                            <td style="color: var(--warning-color);">${pending}</td>
                        </tr>
                    `;
                }).join('')}
                <tr style="font-weight: bold; background: var(--background);">
                    <td>รวม</td>
                    <td>${data.length}</td>
                    <td style="color: var(--success-color);">${data.filter(r => isPrinted(r.receiptNo)).length}</td>
                    <td style="color: var(--primary-color);">${data.filter(r => isCardReceived(r.receiptNo)).length}</td>
                    <td style="color: var(--warning-color);">${data.length - data.filter(r => isCardReceived(r.receiptNo)).length}</td>
                </tr>
            </tbody>
        </table>
    `;
}

function exportMonthlyPDF() {
    const month = elements.reportMonth ? elements.reportMonth.value : '';
    const year = elements.reportYear ? elements.reportYear.value : '';

    if (!month || !year) {
        alert('กรุณาเลือกเดือนและปีก่อน');
        return;
    }

    const data = getMonthlyData(month, year);
    const thaiYear = parseInt(year) + CONFIG.BUDDHIST_YEAR_OFFSET;
    const monthName = THAI_MONTHS[parseInt(month) - 1];

    if (data.length === 0) {
        alert('ไม่มีข้อมูลในเดือนที่เลือก');
        return;
    }

    // Group by day for the report
    const dailyStats = {};
    data.forEach(row => {
        if (!row.date) return;
        const parts = row.date.split('/');
        const day = parseInt(parts[0]);
        if (!dailyStats[day]) {
            dailyStats[day] = { total: 0, printed: 0, received: 0, items: [] };
        }
        dailyStats[day].total++;
        if (isPrinted(row.receiptNo)) dailyStats[day].printed++;
        if (isCardReceived(row.receiptNo)) dailyStats[day].received++;
        dailyStats[day].items.push(row);
    });

    const sortedDays = Object.keys(dailyStats).sort((a, b) => parseInt(a) - parseInt(b));

    let printed = 0;
    let received = 0;
    data.forEach(row => {
        if (isPrinted(row.receiptNo)) printed++;
        if (isCardReceived(row.receiptNo)) received++;
    });

    const printContent = `
        <div style="font-family: 'Sarabun', sans-serif; padding: 20px; max-width: 1000px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px;">
                <h2 style="color: #2563eb; margin: 0 0 10px 0;">รายงานสรุปรายเดือน</h2>
                <p style="color: #666; margin: 0;">ระบบออกใบรับบัตร Work Permit - BOI</p>
                <p style="color: #333; margin: 10px 0 0 0; font-weight: 600;">เดือน ${monthName} ${thaiYear}</p>
            </div>

            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px;">
                <div style="background: #f8f9fa; padding: 15px; text-align: center; border-radius: 8px; border: 1px solid #ddd;">
                    <div style="font-size: 24px; font-weight: 700; color: #333;">${data.length}</div>
                    <div style="font-size: 12px; color: #666;">ผลิตบัตรทั้งหมด</div>
                </div>
                <div style="background: #dcfce7; padding: 15px; text-align: center; border-radius: 8px; border: 1px solid #16a34a;">
                    <div style="font-size: 24px; font-weight: 700; color: #333;">${printed}</div>
                    <div style="font-size: 12px; color: #666;">พิมพ์ใบรับแล้ว</div>
                </div>
                <div style="background: #dbeafe; padding: 15px; text-align: center; border-radius: 8px; border: 1px solid #2563eb;">
                    <div style="font-size: 24px; font-weight: 700; color: #333;">${received}</div>
                    <div style="font-size: 12px; color: #666;">รับบัตรแล้ว</div>
                </div>
                <div style="background: #fef3c7; padding: 15px; text-align: center; border-radius: 8px; border: 1px solid #f59e0b;">
                    <div style="font-size: 24px; font-weight: 700; color: #333;">${data.length - received}</div>
                    <div style="font-size: 12px; color: #666;">รอดำเนินการ</div>
                </div>
            </div>

            <h3 style="margin-bottom: 15px;">สรุปรายวัน</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 30px;">
                <thead>
                    <tr style="background: #f3f4f6;">
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">วันที่</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">ผลิตบัตร</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">พิมพ์แล้ว</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">รับบัตรแล้ว</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">รอดำเนินการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedDays.map(day => {
                        const stat = dailyStats[day];
                        return `
                            <tr>
                                <td style="padding: 8px; border: 1px solid #ddd;">${day}/${month}/${thaiYear}</td>
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${stat.total}</td>
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #16a34a;">${stat.printed}</td>
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #2563eb;">${stat.received}</td>
                                <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #f59e0b;">${stat.total - stat.received}</td>
                            </tr>
                        `;
                    }).join('')}
                    <tr style="font-weight: bold; background: #f3f4f6;">
                        <td style="padding: 8px; border: 1px solid #ddd;">รวมทั้งเดือน</td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${data.length}</td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #16a34a;">${printed}</td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #2563eb;">${received}</td>
                        <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #f59e0b;">${data.length - received}</td>
                    </tr>
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

function exportMonthlyCSV() {
    const month = elements.reportMonth ? elements.reportMonth.value : '';
    const year = elements.reportYear ? elements.reportYear.value : '';

    if (!month || !year) {
        alert('กรุณาเลือกเดือนและปีก่อน');
        return;
    }

    const data = getMonthlyData(month, year);
    const thaiYear = parseInt(year) + CONFIG.BUDDHIST_YEAR_OFFSET;
    const monthName = THAI_MONTHS[parseInt(month) - 1];

    if (data.length === 0) {
        alert('ไม่มีข้อมูลในเดือนที่เลือก');
        return;
    }

    const headers = ['ลำดับ', 'เลขรับที่', 'SN บัตร', 'ชื่อ', 'วันที่', 'เลขที่คำขอ', 'เลขนัดหมาย', 'สถานะพิมพ์', 'สถานะรับบัตร'];
    const rows = data.map((row, index) => [
        index + 1,
        row.receiptNo,
        row.sn || '-',
        row.name || '-',
        row.date,
        row.requestNo || '-',
        row.appointmentNo || '-',
        isPrinted(row.receiptNo) ? 'พิมพ์แล้ว' : 'รอพิมพ์',
        isCardReceived(row.receiptNo) ? 'รับแล้ว' : 'รอรับ'
    ]);

    const BOM = '\uFEFF';
    const csvContent = BOM + [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `รายงาน_${monthName}_${thaiYear}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==================== //
// Image Handling
// ==================== //

function setupImageUpload(uploadElement, inputElement, previewElement, placeholderElement, imageType) {
    uploadElement.addEventListener('click', () => {
        inputElement.click();
    });

    inputElement.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const base64 = await readImageAsBase64(file);
            state.formData[imageType] = base64;
            previewElement.src = base64;
            uploadElement.classList.add('has-image');
            updateReceiptPreview();
        } catch (error) {
            console.error('Error reading image:', error);
            alert('ไม่สามารถอ่านไฟล์รูปภาพได้');
        }
    });

    uploadElement.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadElement.style.borderColor = '#2563eb';
    });

    uploadElement.addEventListener('dragleave', () => {
        uploadElement.style.borderColor = '';
    });

    uploadElement.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadElement.style.borderColor = '';

        const file = e.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) return;

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        inputElement.files = dataTransfer.files;
        inputElement.dispatchEvent(new Event('change'));
    });

    // Paste from Clipboard (Ctrl+V / Cmd+V)
    document.addEventListener('paste', async (e) => {
        // Only handle paste when form panel is focused/visible
        const formPanel = document.querySelector('.form-panel');
        if (!formPanel) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;

                try {
                    const base64 = await readImageAsBase64(file);
                    state.formData[imageType] = base64;
                    previewElement.src = base64;
                    uploadElement.classList.add('has-image');
                    updateReceiptPreview();

                    // Show success feedback
                    showPasteSuccessFeedback(uploadElement);
                } catch (error) {
                    console.error('Error reading pasted image:', error);
                    alert('ไม่สามารถวางรูปภาพได้');
                }
                break;
            }
        }
    });
}

// Show visual feedback when image is pasted successfully
function showPasteSuccessFeedback(element) {
    const originalBorder = element.style.borderColor;
    element.style.borderColor = '#16a34a';
    element.style.boxShadow = '0 0 10px rgba(22, 163, 74, 0.3)';

    setTimeout(() => {
        element.style.borderColor = originalBorder;
        element.style.boxShadow = '';
    }, 1000);
}

// ==================== //
// Form Mode Management
// ==================== //

function setFormMode(mode, receiptNo = null) {
    state.formMode = mode;
    state.editingReceiptNo = receiptNo;

    if (mode === 'add') {
        elements.formTitle.textContent = 'เพิ่มข้อมูลใหม่';
        elements.formModeBadge.textContent = 'โหมด: เพิ่มใหม่';
        elements.formModeBadge.classList.remove('edit-mode');
        elements.saveBtn.textContent = '💾 บันทึกข้อมูล';
    } else {
        elements.formTitle.textContent = 'แก้ไขข้อมูล';
        elements.formModeBadge.textContent = 'โหมด: แก้ไข';
        elements.formModeBadge.classList.add('edit-mode');
        elements.saveBtn.textContent = '💾 อัพเดทข้อมูล';
    }
}

// ==================== //
// Form Handling
// ==================== //

function updateFormState() {
    state.formData.receiptDate = elements.receiptDate.value;
    state.formData.receiptNo = elements.receiptNo.value;
    state.formData.foreignerName = elements.foreignerName.value;
    state.formData.snNumber = elements.snNumber.value;
    state.formData.requestNo = elements.requestNo.value;
    state.formData.appointmentNo = elements.appointmentNo.value;
}

function updateReceiptPreview() {
    updateFormState();
    elements.previewDate.textContent = formatDateForDisplay(state.formData.receiptDate);
    elements.previewReceiptNo.textContent = state.formData.receiptNo || '-';
    elements.previewName.textContent = state.formData.foreignerName || '-';
    elements.previewSN.textContent = state.formData.snNumber || '-';
    elements.previewRequestNo.textContent = state.formData.requestNo || '-';
    elements.previewAppointmentNo.textContent = state.formData.appointmentNo || '-';
    elements.previewSignerName.textContent = state.formData.foreignerName ? `(${state.formData.foreignerName})` : '-';

    // Update Doc No. in preview footer
    if (elements.previewDocNo) {
        elements.previewDocNo.textContent = state.formData.receiptNo || '-';
    }

    if (state.formData.cardImage) {
        elements.receiptCardImage.src = state.formData.cardImage;
        elements.previewCardBox.classList.add('has-image');
    } else {
        elements.receiptCardImage.src = '';
        elements.previewCardBox.classList.remove('has-image');
    }
}

async function clearForm(skipConfirm = false) {
    // Check if there's data to clear
    const hasData = elements.foreignerName.value || elements.snNumber.value ||
                    elements.requestNo.value || elements.appointmentNo.value ||
                    state.formData.cardImage;

    // Show confirmation if there's data and not skipping
    if (hasData && !skipConfirm) {
        if (!confirm('ต้องการล้างข้อมูลทั้งหมดในฟอร์มหรือไม่?')) {
            return;
        }
    }

    // Clear user-editable fields
    elements.foreignerName.value = '';
    elements.snNumber.value = '';
    elements.requestNo.value = '';
    elements.appointmentNo.value = '';
    elements.cardImage.value = '';

    elements.cardPreview.src = '';
    elements.cardImageUpload.classList.remove('has-image');

    // Auto-generate date and receipt number
    setDefaultDate();

    // Get next receipt number from Supabase
    let newReceiptNo;
    try {
        newReceiptNo = await SupabaseAdapter.getNextReceiptNo();
    } catch (e) {
        newReceiptNo = generateNextReceiptNo(state.registryData);
    }
    elements.receiptNo.value = newReceiptNo;

    // Update state with auto-generated values
    state.formData = {
        receiptDate: elements.receiptDate.value,
        receiptNo: newReceiptNo,
        foreignerName: '',
        snNumber: '',
        requestNo: '',
        appointmentNo: '',
        cardImage: null
    };

    setFormMode('add');
    updateReceiptPreview();
}

function setDefaultDate() {
    elements.receiptDate.value = getTodayDateString();
}

function loadFromRegistry(rowData) {
    elements.receiptNo.value = rowData.receiptNo || '';
    elements.foreignerName.value = rowData.name || '';
    elements.snNumber.value = rowData.sn || '';
    elements.requestNo.value = rowData.requestNo || '';
    elements.appointmentNo.value = rowData.appointmentNo || '';

    // Load image if exists
    if (rowData.cardImage) {
        state.formData.cardImage = rowData.cardImage;
        elements.cardPreview.src = rowData.cardImage;
        elements.cardImageUpload.classList.add('has-image');
    } else {
        state.formData.cardImage = null;
        elements.cardPreview.src = '';
        elements.cardImageUpload.classList.remove('has-image');
    }

    if (rowData.date) {
        const parts = rowData.date.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parseInt(parts[2]) - CONFIG.BUDDHIST_YEAR_OFFSET;
            elements.receiptDate.value = `${year}-${month}-${day}`;
        }
    }

    setFormMode('edit', rowData.receiptNo);
    updateReceiptPreview();
}

// ==================== //
// Save Data (Supabase)
// ==================== //

async function saveData() {
    updateFormState();

    // Basic validation
    if (!state.formData.receiptNo || !state.formData.foreignerName) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน (เลขรับที่ และ ชื่อ)');
        return;
    }

    // Security validation
    if (!validateInput(state.formData.receiptNo, 'receiptNo')) {
        alert('รูปแบบเลขรับที่ไม่ถูกต้อง');
        return;
    }
    if (!validateInput(state.formData.foreignerName, 'text')) {
        alert('ชื่อมีรูปแบบไม่ถูกต้องหรือยาวเกินไป');
        return;
    }
    if (state.formData.snNumber && !validateInput(state.formData.snNumber, 'text')) {
        alert('หมายเลข SN มีรูปแบบไม่ถูกต้อง');
        return;
    }
    if (state.formData.requestNo && !validateInput(state.formData.requestNo, 'text')) {
        alert('เลขที่คำขอมีรูปแบบไม่ถูกต้อง');
        return;
    }

    // Disable save button while saving
    elements.saveBtn.disabled = true;
    elements.saveBtn.textContent = '⏳ กำลังบันทึก...';

    try {
        // Save to Supabase
        const receiptData = {
            receiptNo: state.formData.receiptNo,
            receiptDate: state.formData.receiptDate,
            foreignerName: state.formData.foreignerName,
            snNumber: state.formData.snNumber,
            requestNo: state.formData.requestNo,
            appointmentNo: state.formData.appointmentNo
        };

        // Upload image if exists and save receipt
        await SupabaseAdapter.saveReceipt(receiptData, state.formData.cardImage);

        // Show success message
        const isEdit = state.formMode === 'edit';
        const savedReceiptNo = state.formData.receiptNo;
        const savedName = state.formData.foreignerName;

        // Clear form first
        clearForm(true);

        // Reload data from Supabase to get latest data including image URLs
        console.log('🔄 Reloading data from Supabase...');
        const freshData = await SupabaseAdapter.loadRegistry();
        state.registryData = freshData.map((r, index) => ({
            number: index + 1,
            receiptNo: r.receiptNo,
            sn: r.sn,
            name: r.name,
            date: r.date,
            requestNo: r.requestNo,
            appointmentNo: r.appointmentNo,
            cardImage: r.cardImage,
            isPrinted: r.isPrinted,
            isReceived: r.isReceived
        }));
        console.log(`✅ Loaded ${state.registryData.length} records from Supabase`);

        // Update UI
        renderRegistryTable();
        updateSummary();

        // Add activity and show message
        if (isEdit) {
            addActivity('edit', `แก้ไขข้อมูล ${savedReceiptNo}`, savedName);
            alert('อัพเดทข้อมูลเรียบร้อยแล้ว!');
        } else {
            addActivity('add', `เพิ่มข้อมูลใหม่ ${savedReceiptNo}`, savedName);
            alert('บันทึกข้อมูลเรียบร้อยแล้ว!');
        }

    } catch (e) {
        console.error('Error saving data:', e);
        alert('เกิดข้อผิดพลาดในการบันทึก: ' + e.message);
    } finally {
        elements.saveBtn.disabled = false;
        elements.saveBtn.textContent = state.formMode === 'edit' ? '💾 อัพเดทข้อมูล' : '💾 บันทึกข้อมูล';
    }
}

// ==================== //
// Delete Data (Supabase)
// ==================== //

async function deleteRecord(receiptNo) {
    if (!confirm(`ต้องการลบรายการ ${receiptNo} หรือไม่?`)) {
        return;
    }

    try {
        await SupabaseAdapter.deleteReceipt(receiptNo);

        const index = state.registryData.findIndex(r => r.receiptNo === receiptNo);
        if (index >= 0) {
            const deletedName = state.registryData[index].name;
            state.registryData.splice(index, 1);
            state.registryData.forEach((r, i) => r.number = i + 1);

            const selectedIndex = state.selectedItems.indexOf(receiptNo);
            if (selectedIndex >= 0) state.selectedItems.splice(selectedIndex, 1);

            renderRegistryTable();
            updateSummary();
            updateBatchPrintUI();
            addActivity('delete', `ลบข้อมูล ${receiptNo}`, deletedName);
            alert('ลบข้อมูลเรียบร้อยแล้ว!');
        }
    } catch (e) {
        console.error('Error deleting:', e);
        alert('เกิดข้อผิดพลาดในการลบ: ' + e.message);
    }
}

window.deleteRecord = deleteRecord;

// ==================== //
// Print & PDF
// ==================== //

function printReceipt() {
    updateFormState();

    if (!state.formData.receiptNo || !state.formData.foreignerName) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน (เลขรับที่ และ ชื่อ)');
        return;
    }

    const printContent = generatePrintContent();
    elements.printTemplate.innerHTML = printContent;

    // Store receipt info for confirmation
    const receiptNo = state.formData.receiptNo;
    const foreignerName = state.formData.foreignerName;

    window.print();

    // Ask for confirmation after print dialog closes
    setTimeout(() => {
        if (confirm('พิมพ์ใบรับเรียบร้อยแล้วหรือไม่?')) {
            markAsPrinted(receiptNo);
            addActivity('print', `พิมพ์ใบรับ ${receiptNo}`, foreignerName);
        }
    }, 500);
}

function generatePrintContent() {
    // ดึงชื่อเจ้าหน้าที่จาก session
    const session = window.AuthSystem ? window.AuthSystem.getSession() : null;
    const officerName = session ? session.name : '';

    return `
        <div class="print-receipt-page" style="font-family: 'Sarabun', sans-serif; font-size: 14px; line-height: 1.4; padding: 10mm 15mm;">
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 3px solid #2563eb;">
                <h2 style="color: #2563eb; margin: 0; font-size: 24px; font-weight: 700;">แบบรับใบอนุญาตทำงาน e-WorkPermit</h2>
                <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 16px;">(e-WorkPermit Card Receipt)</p>
            </div>

            <!-- ข้อมูลหลัก -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; background: #f8fafc; border: 1px solid #e5e7eb;">
                <tr>
                    <td style="padding: 12px 15px; border-bottom: 1px dotted #ddd; width: 50%;">
                        <div style="font-weight: 600; color: #374151; font-size: 12px;">วันที่รับบัตร / Receipt Date:</div>
                        <div style="color: #111; font-size: 16px; font-weight: 500; margin-top: 3px;">${formatDateForDisplay(state.formData.receiptDate)}</div>
                    </td>
                    <td style="padding: 12px 15px; border-bottom: 1px dotted #ddd;">
                        <div style="font-weight: 600; color: #374151; font-size: 12px;">หมายเลข SN / Serial No.:</div>
                        <div style="color: #111; font-size: 16px; font-weight: 500; margin-top: 3px;">${state.formData.snNumber || '-'}</div>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 12px 15px; border-bottom: 1px dotted #ddd;">
                        <div style="font-weight: 600; color: #374151; font-size: 12px;">ชื่อผู้รับบัตร / Name:</div>
                        <div style="color: #111; font-size: 16px; font-weight: 500; margin-top: 3px;">${state.formData.foreignerName || '-'}</div>
                    </td>
                    <td style="padding: 12px 15px; border-bottom: 1px dotted #ddd;">
                        <div style="font-weight: 600; color: #374151; font-size: 12px;">เลขที่คำขอ / Request No.:</div>
                        <div style="color: #111; font-size: 16px; font-weight: 500; margin-top: 3px;">${state.formData.requestNo || '-'}</div>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="padding: 12px 15px;">
                        <div style="font-weight: 600; color: #374151; font-size: 12px;">เลขที่นัดหมาย / Appointment No.:</div>
                        <div style="color: #111; font-size: 16px; font-weight: 500; margin-top: 3px;">${state.formData.appointmentNo || '-'}</div>
                    </td>
                </tr>
            </table>

            <!-- รูปบัตร -->
            <div style="margin-bottom: 18px;">
                <p style="text-align: center; font-weight: 600; color: #374151; margin: 0 0 10px 0; font-size: 13px;">รูปบัตรอนุญาตทำงาน / Work Permit Card Image</p>
                <div style="border: 2px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; min-height: 220px; background: #fff; display: flex; align-items: center; justify-content: center;">
                    ${state.formData.cardImage ?
                        `<img src="${state.formData.cardImage}" style="max-width: 100%; max-height: 210px; object-fit: contain;">` :
                        `<div style="color: #9ca3af;"><p style="font-size: 40px; margin: 0;">📷</p><p style="font-size: 14px; margin: 10px 0 0 0;">ไม่มีรูปภาพ / No Image</p></div>`}
                </div>
            </div>

            <!-- ข้อความยืนยัน -->
            <div style="margin: 15px 0; padding: 14px 18px; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #2563eb;">
                <p style="font-size: 13px; line-height: 1.6; color: #1f2937; margin: 0 0 6px 0;">ข้าพเจ้าตรวจความถูกต้องของใบอนุญาตทำงานแล้ว และยืนยันว่าได้รับใบอนุญาตทำงาน ณ ศูนย์บริการวีซ่าและใบอนุญาตทำงาน อาคาร One Bangkok</p>
                <p style="font-size: 11px; line-height: 1.5; color: #6b7280; font-style: italic; margin: 0;">I have verified that all information on the work permit card is correct and confirm receipt at the Visa and Work Permit Service Center, One Bangkok Building.</p>
            </div>

            <!-- ช่องลงชื่อ -->
            <table style="width: 100%; margin-top: 25px;">
                <tr>
                    <td style="width: 50%; text-align: center; padding: 0 25px;">
                        <div style="border-bottom: 1px solid #374151; height: 40px; margin-bottom: 8px;"></div>
                        <p style="color: #374151; margin: 0; font-size: 12px; font-weight: 600;">ลงชื่อผู้รับบัตร / Cardholder</p>
                        <p style="color: #1f2937; font-weight: 600; margin: 6px 0; font-size: 12px;">(${state.formData.foreignerName || '___________________'})</p>
                        <p style="color: #6b7280; margin: 0; font-size: 11px;">Tel: ________________________</p>
                    </td>
                    <td style="width: 50%; text-align: center; padding: 0 25px;">
                        <div style="border-bottom: 1px solid #374151; height: 40px; margin-bottom: 8px;"></div>
                        <p style="color: #374151; margin: 0; font-size: 12px; font-weight: 600;">ลงชื่อเจ้าหน้าที่ / Officer</p>
                        <p style="color: #1f2937; font-weight: 600; margin: 6px 0; font-size: 12px;">(${officerName || '___________________'})</p>
                        <p style="color: #6b7280; margin: 0; font-size: 11px;">Date: ${formatDateForDisplay(state.formData.receiptDate)}</p>
                    </td>
                </tr>
            </table>

            <!-- Footer -->
            <div style="margin-top: 25px; display: flex; justify-content: space-between; border-top: 1px solid #e5e7eb; padding-top: 10px;">
                <span style="color: #9ca3af; font-size: 10px;">ศูนย์บริการวีซ่าและใบอนุญาตทำงาน BOI</span>
                <span style="color: #9ca3af; font-size: 10px;">Doc No.: ${state.formData.receiptNo || '-'}</span>
            </div>
        </div>
    `;
}

// ==================== //
// Summary
// ==================== //

function updateSummary() {
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

    const total = filteredData.length;
    let printed = 0;
    let received = 0;

    filteredData.forEach(row => {
        if (isPrinted(row.receiptNo)) printed++;
        if (isCardReceived(row.receiptNo)) received++;
    });

    const pendingPrint = total - printed;
    const waiting = total - received;

    elements.summaryTotal.textContent = total;
    elements.summaryPrinted.textContent = printed;
    elements.summaryPendingPrint.textContent = pendingPrint;
    elements.summaryReceived.textContent = received;
    elements.summaryWaiting.textContent = waiting;
}

// ==================== //
// Export Functions
// ==================== //

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

function exportToCSV() {
    const data = getDataForExport();
    const selectedDate = elements.summaryDate.value;
    const dateStr = selectedDate ? formatThaiDate(selectedDate) : 'ทั้งหมด';

    if (data.length === 0) {
        alert('ไม่มีข้อมูลสำหรับวันที่เลือก');
        return;
    }

    const headers = ['ลำดับ', 'เลขรับที่', 'SN บัตร', 'ชื่อ', 'วันที่', 'เลขที่คำขอ', 'เลขนัดหมาย', 'สถานะพิมพ์', 'จำนวนพิมพ์', 'สถานะรับบัตร', 'เวลารับบัตร'];
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

    const BOM = '\uFEFF';
    const csvContent = BOM + [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

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

function exportToPDF() {
    const data = getDataForExport();
    const selectedDate = elements.summaryDate.value;
    const dateStr = selectedDate ? formatThaiDate(selectedDate) : 'ทั้งหมด';

    if (data.length === 0) {
        alert('ไม่มีข้อมูลสำหรับวันที่เลือก');
        return;
    }

    const total = data.length;
    const printed = data.filter(row => row.printStatus === 'พิมพ์แล้ว').length;
    const received = data.filter(row => row.receivedStatus === 'รับแล้ว').length;

    const printContent = `
        <div style="font-family: 'Sarabun', sans-serif; padding: 20px; max-width: 1000px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px;">
                <h2 style="color: #2563eb; margin: 0 0 10px 0;">รายงานสรุปการผลิตบัตร Work Permit</h2>
                <p style="color: #666; margin: 0;">ศูนย์บริการ EWP อาคาร One Bangkok</p>
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

function getFilteredData() {
    let data = [...state.registryData];

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

    if (state.filterStatus !== 'all') {
        data = data.filter(row => {
            const printed = isPrinted(row.receiptNo);
            const received = isCardReceived(row.receiptNo);

            switch (state.filterStatus) {
                case 'printed': return printed;
                case 'not-printed': return !printed;
                case 'received': return received;
                case 'not-received': return !received;
                default: return true;
            }
        });
    }

    // Sort: Not printed first, then printed at bottom
    // Within each group, sort by date (newest first)
    data.sort((a, b) => {
        const aPrinted = isPrinted(a.receiptNo);
        const bPrinted = isPrinted(b.receiptNo);

        // Not printed items come first
        if (!aPrinted && bPrinted) return -1;
        if (aPrinted && !bPrinted) return 1;

        // Within same group, sort by receiptNo descending (newest first)
        return b.receiptNo.localeCompare(a.receiptNo);
    });

    // Re-number after sorting
    data.forEach((row, index) => {
        row.number = index + 1;
    });

    return data;
}

// ==================== //
// Data Loading (Supabase)
// ==================== //

async function loadRegistryData() {
    state.isLoading = true;
    renderRegistryTable();

    try {
        // Load from Supabase
        const data = await SupabaseAdapter.loadRegistry();
        state.registryData = data.map((row, index) => ({
            ...row,
            number: index + 1
        }));

        // Update printed/received arrays from loaded data
        loadPrintedReceipts();
        loadReceivedCards();

        console.log(`✅ Loaded ${state.registryData.length} records from Supabase`);
    } catch (e) {
        console.error('Error loading from Supabase:', e);
        alert('ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อ');
        state.registryData = [];
    }

    state.isLoading = false;
    renderRegistryTable();
    updateSummary();

    // Generate next receipt number
    if (!elements.receiptNo.value) {
        try {
            const nextNo = await SupabaseAdapter.getNextReceiptNo();
            elements.receiptNo.value = nextNo;
            state.formData.receiptNo = nextNo;
            updateReceiptPreview();
        } catch (e) {
            elements.receiptNo.value = generateNextReceiptNo(state.registryData);
        }
    }
}

function renderRegistryTable() {
    if (state.isLoading) {
        elements.registryBody.innerHTML = `
            <tr class="loading-row">
                <td colspan="10">กำลังโหลดข้อมูล...</td>
            </tr>
        `;
        return;
    }

    const filteredData = getFilteredData();

    if (filteredData.length === 0) {
        elements.registryBody.innerHTML = `
            <tr class="loading-row">
                <td colspan="10">ไม่พบข้อมูล</td>
            </tr>
        `;
        return;
    }

    elements.registryBody.innerHTML = filteredData.map(row => {
        const printed = isPrinted(row.receiptNo);
        const printInfo = getPrintInfo(row.receiptNo);
        const received = isCardReceived(row.receiptNo);
        const receivedInfo = getReceivedInfo(row.receiptNo);
        const isSelected = state.selectedItems.includes(row.receiptNo);

        const printStatusClass = printed ? 'status-printed' : 'status-pending';
        const printStatusText = printed ? `✅ พิมพ์แล้ว (${printInfo.printCount})` : '⏳ รอพิมพ์';

        const receivedCheckbox = `<input type="checkbox" class="received-checkbox"
            ${received ? 'checked' : ''}
            onchange="toggleCardReceived('${row.receiptNo}')"
            title="${received ? 'คลิกเพื่อยกเลิก' : 'คลิกเพื่อยืนยันรับบัตร'}">`;
        const receivedTime = received && receivedInfo ? `<span class="received-time">${formatTime(receivedInfo.receivedAt)}</span>` : '';
        const receivedStatusText = received ? '🎫 รับแล้ว' : '📦 รอรับ';
        const receivedStatusClass = received ? 'status-received' : 'status-waiting';

        const imageCell = row.cardImage
            ? `<img src="${row.cardImage}" class="image-indicator" onclick="viewImage('${row.receiptNo}')" title="คลิกเพื่อดูรูป">`
            : '<span class="no-image">ไม่มีรูป</span>';

        let rowClass = '';
        if (received) {
            rowClass = 'row-received';
        } else if (printed) {
            rowClass = 'row-printed';
        }

        const batchCheckbox = `<input type="checkbox" class="batch-checkbox"
            ${isSelected ? 'checked' : ''}
            onchange="toggleSelectItem('${row.receiptNo}')"
            title="เลือกเพื่อพิมพ์หลายใบ">`;

        // Sanitize all user data before rendering
        const safeReceiptNo = sanitizeHTML(row.receiptNo);
        const safeSN = sanitizeHTML(row.sn || '-');
        const safeName = sanitizeHTML(row.name || '-');
        const safeDate = sanitizeHTML(row.date);

        return `
            <tr class="${rowClass}">
                <td>${batchCheckbox}</td>
                <td>${row.number}</td>
                <td>${safeReceiptNo}</td>
                <td>${safeSN}</td>
                <td>${safeName}</td>
                <td>${safeDate}</td>
                <td>${imageCell}</td>
                <td><span class="${printStatusClass}">${printStatusText}</span></td>
                <td>
                    <div class="received-status">
                        ${receivedCheckbox}
                        <span class="${receivedStatusClass}">${receivedStatusText}</span>
                        ${receivedTime}
                    </div>
                </td>
                <td class="action-buttons">
                    <button class="btn btn-success btn-sm" onclick="printFromTable(${row.number - 1})" title="พิมพ์ใบรับ">
                        🖨️
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="selectRow(${row.number - 1})" title="แก้ไข">
                        ✏️
                    </button>
                    <button class="btn btn-outline-danger btn-sm" onclick="deleteRecord('${safeReceiptNo}')" title="ลบ">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    updateBatchPrintUI();
}

function selectRow(index) {
    const rowData = state.registryData[index];
    if (rowData) {
        loadFromRegistry(rowData);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function viewImage(receiptNo) {
    const row = state.registryData.find(r => r.receiptNo === receiptNo);
    if (row && row.cardImage) {
        const win = window.open('', '_blank');
        win.document.write(`
            <html>
            <head><title>รูปบัตร - ${receiptNo}</title></head>
            <body style="margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #333;">
                <img src="${row.cardImage}" style="max-width: 90%; max-height: 90%;">
            </body>
            </html>
        `);
    }
}

/**
 * พิมพ์ใบรับจากตารางโดยตรง
 */
function printFromTable(index) {
    const rowData = state.registryData[index];
    if (!rowData) return;

    // Set form data from row
    state.formData = {
        receiptDate: '',
        receiptNo: rowData.receiptNo,
        foreignerName: rowData.name,
        snNumber: rowData.sn,
        requestNo: rowData.requestNo,
        appointmentNo: rowData.appointmentNo,
        cardImage: rowData.cardImage
    };

    // Parse date
    if (rowData.date) {
        const parts = rowData.date.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parseInt(parts[2]) - CONFIG.BUDDHIST_YEAR_OFFSET;
            state.formData.receiptDate = `${year}-${month}-${day}`;
        }
    }

    // Store receipt info for confirmation
    const receiptNo = state.formData.receiptNo;
    const foreignerName = state.formData.foreignerName;

    // Generate print content and print
    const printContent = generatePrintContent();
    elements.printTemplate.innerHTML = printContent;
    window.print();

    // Ask for confirmation after print dialog closes
    setTimeout(() => {
        if (confirm('พิมพ์ใบรับเรียบร้อยแล้วหรือไม่?')) {
            markAsPrinted(receiptNo);
            addActivity('print', `พิมพ์ใบรับ ${receiptNo}`, foreignerName);
        }
    }, 500);
}

window.selectRow = selectRow;
window.viewImage = viewImage;
window.printFromTable = printFromTable;

// ==================== //
// Event Listeners
// ==================== //

function setupEventListeners() {
    setupImageUpload(
        elements.cardImageUpload,
        elements.cardImage,
        elements.cardPreview,
        elements.cardPlaceholder,
        'cardImage'
    );

    ['receiptDate', 'receiptNo', 'foreignerName', 'snNumber', 'requestNo', 'appointmentNo'].forEach(id => {
        elements[id].addEventListener('input', updateReceiptPreview);
    });

    elements.clearBtn.addEventListener('click', clearForm);
    elements.saveBtn.addEventListener('click', saveData);
    elements.printBtn.addEventListener('click', printReceipt);
    elements.refreshDataBtn.addEventListener('click', loadRegistryData);
    elements.addNewBtn.addEventListener('click', () => {
        clearForm(true); // Skip confirmation for "Add New" button
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    elements.summaryDate.addEventListener('change', updateSummary);
    elements.exportCsvBtn.addEventListener('click', exportToCSV);
    elements.exportPdfBtn.addEventListener('click', exportToPDF);

    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderRegistryTable();
    });

    elements.filterStatus.addEventListener('change', (e) => {
        state.filterStatus = e.target.value;
        renderRegistryTable();
    });

    // Batch Print
    if (elements.selectAllCheckbox) {
        elements.selectAllCheckbox.addEventListener('change', toggleSelectAll);
    }
    if (elements.batchPrintBtn) {
        elements.batchPrintBtn.addEventListener('click', batchPrint);
    }

    // Monthly Report
    if (elements.generateReportBtn) {
        elements.generateReportBtn.addEventListener('click', generateMonthlyReport);
    }
    if (elements.exportMonthlyPdfBtn) {
        elements.exportMonthlyPdfBtn.addEventListener('click', exportMonthlyPDF);
    }
    if (elements.exportMonthlyCsvBtn) {
        elements.exportMonthlyCsvBtn.addEventListener('click', exportMonthlyCSV);
    }

    // Activity Log
    if (elements.activityFilter) {
        elements.activityFilter.addEventListener('change', renderActivityLog);
    }
    if (elements.clearLogBtn) {
        elements.clearLogBtn.addEventListener('click', clearActivityLog);
    }

    // Tab Navigation
    setupTabNavigation();
}

// ==================== //
// Tab Navigation
// ==================== //

function setupTabNavigation() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            // Remove active class from all buttons and panes
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            // Add active class to clicked button
            btn.classList.add('active');

            // Show corresponding pane
            if (targetTab === 'monthlyReport') {
                document.getElementById('monthlyReportPane').classList.add('active');
            } else if (targetTab === 'activityLog') {
                document.getElementById('activityLogPane').classList.add('active');
            }
        });
    });
}

// ==================== //
// User Management UI
// ==================== //

function setupUserManagement() {
    const userManagementBtn = document.getElementById('userManagementBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const closeUserModal = document.getElementById('closeUserModal');
    const userModalOverlay = document.getElementById('userModalOverlay');

    // Show/hide user management button based on permission
    if (window.AuthSystem && window.AuthSystem.hasPermission('user_management')) {
        userManagementBtn.style.display = 'inline-block';
    }

    // User Management button
    if (userManagementBtn) {
        userManagementBtn.addEventListener('click', showUserManagement);
    }

    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('ต้องการออกจากระบบหรือไม่?')) {
                window.AuthSystem.logout();
            }
        });
    }

    // Close modal
    if (closeUserModal) {
        closeUserModal.addEventListener('click', closeModal);
    }

    // Close modal when clicking outside
    if (userModalOverlay) {
        userModalOverlay.addEventListener('click', (e) => {
            if (e.target === userModalOverlay) {
                closeModal();
            }
        });
    }
}

async function showUserManagement() {
    const modal = document.getElementById('userModalOverlay');
    const modalBody = document.getElementById('userModalBody');
    const modalTitle = document.getElementById('userModalTitle');

    modalTitle.textContent = '👥 จัดการผู้ใช้งาน';

    const allUsers = await window.AuthSystem.getUsers();
    const pendingUsers = allUsers.filter(u => u.is_approved === false);
    const approvedUsers = allUsers.filter(u => u.is_approved !== false);

    const roleLabels = {
        admin: 'Admin',
        manager: 'Manager',
        staff: 'Staff'
    };

    modalBody.innerHTML = `
        <!-- Tabs -->
        <div style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">
            <button class="btn btn-primary btn-sm" id="tabApproved" onclick="switchUserTab('approved')" style="flex: 1;">
                ✅ ผู้ใช้งาน (${approvedUsers.length})
            </button>
            <button class="btn btn-outline btn-sm" id="tabPending" onclick="switchUserTab('pending')" style="flex: 1; position: relative;">
                ⏳ รออนุมัติ (${pendingUsers.length})
                ${pendingUsers.length > 0 ? '<span style="position: absolute; top: -5px; right: -5px; background: #dc2626; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 11px;">' + pendingUsers.length + '</span>' : ''}
            </button>
        </div>

        <!-- Approved Users Tab -->
        <div id="approvedUsersTab">
            <div style="margin-bottom: 15px;">
                <button class="btn btn-success btn-sm" onclick="showAddUserForm()">➕ เพิ่มผู้ใช้ใหม่</button>
            </div>
            <table class="user-table">
                <thead>
                    <tr>
                        <th>ชื่อผู้ใช้</th>
                        <th>ชื่อ</th>
                        <th>Role</th>
                        <th>การดำเนินการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${approvedUsers.map(user => `
                        <tr>
                            <td>${user.username || '-'}</td>
                            <td>${user.name || '-'}</td>
                            <td><span class="role-badge ${user.role}">${roleLabels[user.role] || user.role}</span></td>
                            <td>
                                <button class="btn btn-primary btn-sm" onclick="showEditUserForm('${user.id}')">✏️</button>
                                <button class="btn btn-outline-danger btn-sm" onclick="confirmDeleteUser('${user.id}')">🗑️</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <!-- Pending Users Tab -->
        <div id="pendingUsersTab" style="display: none;">
            ${pendingUsers.length === 0 ? '<p style="text-align: center; color: #6b7280; padding: 20px;">ไม่มีผู้ใช้รออนุมัติ</p>' : `
                <table class="user-table">
                    <thead>
                        <tr>
                            <th>อีเมล</th>
                            <th>ชื่อ</th>
                            <th>วันที่สมัคร</th>
                            <th>การดำเนินการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pendingUsers.map(user => `
                            <tr>
                                <td>${user.username || '-'}</td>
                                <td>${user.name || '-'}</td>
                                <td>${user.created_at ? new Date(user.created_at).toLocaleDateString('th-TH') : '-'}</td>
                                <td>
                                    <button class="btn btn-success btn-sm" onclick="handleApproveUser('${user.id}')" title="อนุมัติ">✅ อนุมัติ</button>
                                    <button class="btn btn-outline-danger btn-sm" onclick="handleRejectUser('${user.id}')" title="ปฏิเสธ">❌ ปฏิเสธ</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `}
        </div>
    `;

    modal.style.display = 'flex';
}

function switchUserTab(tab) {
    const approvedTab = document.getElementById('approvedUsersTab');
    const pendingTab = document.getElementById('pendingUsersTab');
    const btnApproved = document.getElementById('tabApproved');
    const btnPending = document.getElementById('tabPending');

    if (tab === 'approved') {
        approvedTab.style.display = 'block';
        pendingTab.style.display = 'none';
        btnApproved.classList.remove('btn-outline');
        btnApproved.classList.add('btn-primary');
        btnPending.classList.remove('btn-primary');
        btnPending.classList.add('btn-outline');
    } else {
        approvedTab.style.display = 'none';
        pendingTab.style.display = 'block';
        btnPending.classList.remove('btn-outline');
        btnPending.classList.add('btn-primary');
        btnApproved.classList.remove('btn-primary');
        btnApproved.classList.add('btn-outline');
    }
}

async function handleApproveUser(userId) {
    if (!confirm('ต้องการอนุมัติผู้ใช้นี้หรือไม่?')) return;

    const result = await window.AuthSystem.approveUser(userId);
    if (result.success) {
        alert('อนุมัติผู้ใช้เรียบร้อยแล้ว');
        showUserManagement(); // Refresh
    } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
    }
}

async function handleRejectUser(userId) {
    if (!confirm('ต้องการปฏิเสธผู้ใช้นี้หรือไม่? ข้อมูลจะถูกลบ')) return;

    const result = await window.AuthSystem.rejectUser(userId);
    if (result.success) {
        alert('ปฏิเสธผู้ใช้เรียบร้อยแล้ว');
        showUserManagement(); // Refresh
    } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
    }
}

function showAddUserForm() {
    const modalBody = document.getElementById('userModalBody');
    const modalTitle = document.getElementById('userModalTitle');

    modalTitle.textContent = '➕ เพิ่มผู้ใช้ใหม่';

    modalBody.innerHTML = `
        <form class="user-form" id="addUserForm">
            <div class="form-row">
                <div class="form-group">
                    <label>ชื่อผู้ใช้ (Username)</label>
                    <input type="text" id="newUsername" required placeholder="username">
                </div>
                <div class="form-group">
                    <label>รหัสผ่าน (Password)</label>
                    <input type="password" id="newPassword" required placeholder="password">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>ชื่อแสดง (Display Name)</label>
                    <input type="text" id="newName" required placeholder="ชื่อ-นามสกุล">
                </div>
                <div class="form-group">
                    <label>Role</label>
                    <select id="newRole" class="filter-select">
                        <option value="staff">Staff</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                    </select>
                </div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="showUserManagement()">ยกเลิก</button>
                <button type="submit" class="btn btn-success">💾 บันทึก</button>
            </div>
        </form>
    `;

    document.getElementById('addUserForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const result = window.AuthSystem.addUser({
            username: document.getElementById('newUsername').value,
            password: document.getElementById('newPassword').value,
            name: document.getElementById('newName').value,
            role: document.getElementById('newRole').value
        });

        if (result.success) {
            alert('เพิ่มผู้ใช้สำเร็จ');
            showUserManagement();
        } else {
            alert(result.error);
        }
    });
}

function showEditUserForm(userId) {
    const user = window.AuthSystem.getUserById(userId);
    if (!user) return;

    const modalBody = document.getElementById('userModalBody');
    const modalTitle = document.getElementById('userModalTitle');

    modalTitle.textContent = '✏️ แก้ไขผู้ใช้';

    modalBody.innerHTML = `
        <form class="user-form" id="editUserForm">
            <div class="form-row">
                <div class="form-group">
                    <label>ชื่อผู้ใช้ (Username)</label>
                    <input type="text" id="editUsername" value="${user.username}" required>
                </div>
                <div class="form-group">
                    <label>รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)</label>
                    <input type="password" id="editPassword" placeholder="รหัสผ่านใหม่">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>ชื่อแสดง (Display Name)</label>
                    <input type="text" id="editName" value="${user.name}" required>
                </div>
                <div class="form-group">
                    <label>Role</label>
                    <select id="editRole" class="filter-select">
                        <option value="staff" ${user.role === 'staff' ? 'selected' : ''}>Staff</option>
                        <option value="manager" ${user.role === 'manager' ? 'selected' : ''}>Manager</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                </div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="showUserManagement()">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">💾 อัพเดท</button>
            </div>
        </form>
    `;

    document.getElementById('editUserForm').addEventListener('submit', (e) => {
        e.preventDefault();

        const updateData = {
            username: document.getElementById('editUsername').value,
            name: document.getElementById('editName').value,
            role: document.getElementById('editRole').value
        };

        const newPassword = document.getElementById('editPassword').value;
        if (newPassword) {
            updateData.password = newPassword;
        }

        const result = window.AuthSystem.updateUser(userId, updateData);

        if (result.success) {
            alert('อัพเดทผู้ใช้สำเร็จ');
            showUserManagement();
        } else {
            alert(result.error);
        }
    });
}

function confirmDeleteUser(userId) {
    const user = window.AuthSystem.getUserById(userId);
    if (!user) return;

    if (!confirm(`ต้องการลบผู้ใช้ "${user.name}" หรือไม่?`)) {
        return;
    }

    const result = window.AuthSystem.deleteUser(userId);

    if (result.success) {
        alert('ลบผู้ใช้สำเร็จ');
        showUserManagement();
    } else {
        alert(result.error);
    }
}

function closeModal() {
    const modal = document.getElementById('userModalOverlay');
    modal.style.display = 'none';
}

// Make functions globally accessible
window.showUserManagement = showUserManagement;
window.showAddUserForm = showAddUserForm;
window.showEditUserForm = showEditUserForm;
window.confirmDeleteUser = confirmDeleteUser;
window.closeModal = closeModal;

// ==================== //
// Permission-based UI
// ==================== //

async function applyPermissions() {
    if (!window.AuthSystem) return;

    const session = await window.AuthSystem.getSession();
    if (!session) return;

    // Update user info display
    const userNameEl = document.getElementById('currentUserName');
    const userRoleEl = document.getElementById('currentUserRole');
    if (userNameEl) userNameEl.textContent = session.name;
    if (userRoleEl) userRoleEl.textContent = session.role.toUpperCase();

    // Hide Activity Log tab if no permission
    const hasActivityLog = await window.AuthSystem.hasPermission('activity_log');
    if (!hasActivityLog) {
        const activityTab = document.getElementById('tabActivityLog');
        if (activityTab) activityTab.style.display = 'none';
    }

    // Hide Monthly Report tab if no permission
    const hasMonthlyReport = await window.AuthSystem.hasPermission('monthly_report');
    if (!hasMonthlyReport) {
        const monthlyTab = document.getElementById('tabMonthlyReport');
        if (monthlyTab) monthlyTab.style.display = 'none';
    }

    // Hide export buttons if no permission
    const hasExport = await window.AuthSystem.hasPermission('export');
    if (!hasExport) {
        const exportBtns = document.querySelectorAll('#exportCsvBtn, #exportPdfBtn, #exportMonthlyPdfBtn, #exportMonthlyCsvBtn');
        exportBtns.forEach(btn => btn.style.display = 'none');
    }

    // Show Google Sheet sync toggle for Admin only
    const syncToggleContainer = document.getElementById('syncToggleContainer');
    if (syncToggleContainer && session.role === 'admin') {
        syncToggleContainer.style.display = 'flex';

        // Load sync setting from Supabase
        await loadSyncSetting();

        // Setup toggle event
        const syncToggle = document.getElementById('googleSheetSyncToggle');
        if (syncToggle) {
            syncToggle.addEventListener('change', async (e) => {
                await saveSyncSetting(e.target.checked);
                updateImportButtonVisibility();
            });
        }
    }

    // Apply sync setting to show/hide import button
    updateImportButtonVisibility();

    // Hide delete buttons if no permission
    // Will be applied when rendering table
}

// State for Google Sheet sync
let googleSheetSyncEnabled = true;

// Load sync setting from Supabase
async function loadSyncSetting() {
    try {
        const { data, error } = await window.supabaseClient
            .from('settings')
            .select('value')
            .eq('key', 'google_sheet_sync')
            .maybeSingle();

        if (data && data.value) {
            googleSheetSyncEnabled = data.value.enabled !== false;
        }

        const toggle = document.getElementById('googleSheetSyncToggle');
        if (toggle) {
            toggle.checked = googleSheetSyncEnabled;
        }
    } catch (e) {
        console.log('Could not load sync setting:', e.message);
    }
}

// Save sync setting to Supabase
async function saveSyncSetting(enabled) {
    try {
        googleSheetSyncEnabled = enabled;

        const user = await window.supabaseClient.auth.getUser();

        await window.supabaseClient
            .from('settings')
            .upsert({
                key: 'google_sheet_sync',
                value: { enabled: enabled },
                updated_by: user.data.user?.id,
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

        console.log('✅ Sync setting saved:', enabled);
    } catch (e) {
        console.error('Error saving sync setting:', e);
    }
}

// Update import button visibility based on sync setting
function updateImportButtonVisibility() {
    const importBtn = document.getElementById('importFromSheetBtn');
    if (importBtn) {
        importBtn.style.display = googleSheetSyncEnabled ? 'inline-flex' : 'none';
    }
}

// ==================== //
// Google Sheets Integration
// ==================== //

async function fetchSheetData() {
    const statusEl = document.getElementById('sheetStatus');
    const infoEl = document.getElementById('sheetDataInfo');

    if (!CONFIG.API_KEY) {
        // ถ้าไม่มี API Key ให้ใช้ mock data หรือ public CSV
        console.log('No API Key configured, trying public CSV...');
        return fetchSheetDataPublic();
    }

    try {
        if (statusEl) statusEl.textContent = 'กำลังโหลด...';
        if (infoEl) infoEl.textContent = 'กำลังดึงข้อมูลจาก Google Sheets...';

        const range = `${CONFIG.SHEET_NAME_REGISTRY}!A:G`;
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${CONFIG.API_KEY}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.values && data.values.length > 1) {
            // Skip header row
            state.sheetData = data.values.slice(1).map((row, index) => ({
                rowIndex: index + 2, // 1-indexed, skip header
                number: row[CONFIG.SHEET_COLUMNS.NUMBER] || '',
                no: row[CONFIG.SHEET_COLUMNS.NO] || '',
                date: row[CONFIG.SHEET_COLUMNS.DATE] || '',
                requestNo: row[CONFIG.SHEET_COLUMNS.REQUEST_NO] || '',
                appointmentNo: row[CONFIG.SHEET_COLUMNS.APPT_NO] || '',
                photo: row[CONFIG.SHEET_COLUMNS.PHOTO] || '',
                name: row[CONFIG.SHEET_COLUMNS.NAME] || ''
            }));

            state.sheetDataLoaded = true;
            state.sheetLastFetch = new Date();

            if (statusEl) {
                statusEl.textContent = `✅ โหลดแล้ว ${state.sheetData.length} รายการ`;
                statusEl.className = 'sheet-status success';
            }
            if (infoEl) infoEl.textContent = `พบข้อมูล ${state.sheetData.length} รายการ (อัพเดทล่าสุด: ${formatTime(state.sheetLastFetch)})`;

            return state.sheetData;
        } else {
            throw new Error('No data found in sheet');
        }
    } catch (error) {
        console.error('Error fetching sheet data:', error);
        if (statusEl) {
            statusEl.textContent = '❌ โหลดไม่สำเร็จ';
            statusEl.className = 'sheet-status error';
        }
        if (infoEl) infoEl.textContent = `Error: ${error.message}. ลอง Refresh หรือตรวจสอบ API Key`;
        return [];
    }
}

// Fetch using public published CSV (alternative method)
async function fetchSheetDataPublic() {
    const statusEl = document.getElementById('sheetStatus');
    const infoEl = document.getElementById('sheetDataInfo');

    try {
        if (statusEl) statusEl.textContent = 'กำลังโหลด...';
        if (infoEl) infoEl.textContent = 'กำลังดึงข้อมูล...';

        // Use the public CSV export URL
        const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(CONFIG.SHEET_NAME_REGISTRY)}`;

        const response = await fetch(url);
        const text = await response.text();

        // Parse the JSON response (Google returns it wrapped in a function call)
        const jsonText = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const data = JSON.parse(jsonText);

        if (data.table && data.table.rows) {
            state.sheetData = data.table.rows.map((row, index) => ({
                rowIndex: index + 2,
                number: row.c[0]?.v || '',
                no: row.c[1]?.v || '',
                date: row.c[2]?.v || '',
                requestNo: row.c[3]?.v || '',
                appointmentNo: row.c[4]?.v || '',
                photo: row.c[5]?.v || '',
                name: row.c[6]?.v || ''
            }));

            state.sheetDataLoaded = true;
            state.sheetLastFetch = new Date();

            if (statusEl) {
                statusEl.textContent = `✅ โหลดแล้ว ${state.sheetData.length} รายการ`;
                statusEl.className = 'sheet-status success';
            }
            if (infoEl) infoEl.textContent = `พบข้อมูล ${state.sheetData.length} รายการ`;

            return state.sheetData;
        }

        throw new Error('No data found');
    } catch (error) {
        console.error('Error fetching public sheet:', error);
        if (statusEl) {
            statusEl.textContent = '❌ โหลดไม่สำเร็จ';
            statusEl.className = 'sheet-status error';
        }
        if (infoEl) infoEl.textContent = 'ไม่สามารถดึงข้อมูลได้ กรุณาตรวจสอบการเข้าถึง Sheet';
        return [];
    }
}

function formatSheetTime(date) {
    if (!date) return '';
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function searchSheetData(query) {
    if (!query || !state.sheetData.length) return state.sheetData;

    const lowerQuery = query.toLowerCase().trim();

    return state.sheetData.filter(row =>
        (row.no && row.no.toLowerCase().includes(lowerQuery)) ||
        (row.requestNo && row.requestNo.toLowerCase().includes(lowerQuery)) ||
        (row.appointmentNo && row.appointmentNo.toLowerCase().includes(lowerQuery)) ||
        (row.name && row.name.toLowerCase().includes(lowerQuery))
    );
}

function renderSheetResults(data) {
    const tbody = document.getElementById('sheetResultsBody');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="no-results">ไม่พบข้อมูล</td></tr>`;
        return;
    }

    tbody.innerHTML = data.slice(0, 50).map(row => `
        <tr data-row-index="${row.rowIndex}">
            <td>${row.number}</td>
            <td>${row.no}</td>
            <td>${row.date}</td>
            <td>${row.requestNo}</td>
            <td>${row.appointmentNo}</td>
            <td>${row.name}</td>
            <td>
                <button type="button" class="btn btn-success btn-sm btn-select" onclick="selectSheetRow(${row.rowIndex})">
                    ✓ เลือก
                </button>
            </td>
        </tr>
    `).join('');

    if (data.length > 50) {
        tbody.innerHTML += `<tr><td colspan="7" class="no-results">แสดง 50 รายการแรก (พบทั้งหมด ${data.length} รายการ)</td></tr>`;
    }
}

function selectSheetRow(rowIndex) {
    const row = state.sheetData.find(r => r.rowIndex === rowIndex);
    if (!row) {
        alert('ไม่พบข้อมูล');
        return;
    }

    // Generate new receipt number with new format (YYYYMMDD-NNN) instead of using old format from Sheet
    elements.receiptNo.value = generateNextReceiptNo(state.registryData);

    // Fill form with selected data (except receipt number)
    if (row.name) elements.foreignerName.value = row.name;
    if (row.requestNo) elements.requestNo.value = row.requestNo;
    if (row.appointmentNo) elements.appointmentNo.value = row.appointmentNo;

    // Set today's date instead of date from Sheet
    elements.receiptDate.value = getTodayDateString();

    // Clear SN Number (will be filled manually)
    elements.snNumber.value = '';

    // Update preview
    updateReceiptPreview();

    // Close modal
    closeSheetModal();

    // Show success message
    showToast(`✅ เลือกข้อมูล: ${row.name}`);
}

function showToast(message) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #22c55e;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

function openSheetModal() {
    const modal = document.getElementById('sheetModalOverlay');
    if (modal) {
        modal.style.display = 'flex';

        // Load data if not loaded
        if (!state.sheetDataLoaded) {
            fetchSheetData().then(data => {
                renderSheetResults(data);
            });
        } else {
            renderSheetResults(state.sheetData);
        }
    }
}

function closeSheetModal() {
    const modal = document.getElementById('sheetModalOverlay');
    if (modal) {
        modal.style.display = 'none';
    }
}

function setupSheetImport() {
    const importBtn = document.getElementById('importFromSheetBtn');
    const closeBtn = document.getElementById('closeSheetModal');
    const searchBtn = document.getElementById('sheetSearchBtn');
    const refreshBtn = document.getElementById('sheetRefreshBtn');
    const searchInput = document.getElementById('sheetSearchInput');
    const modalOverlay = document.getElementById('sheetModalOverlay');

    if (importBtn) {
        importBtn.addEventListener('click', openSheetModal);
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeSheetModal);
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeSheetModal();
            }
        });
    }

    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', () => {
            const results = searchSheetData(searchInput.value);
            renderSheetResults(results);
        });
    }

    if (searchInput) {
        // Search on Enter key
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const results = searchSheetData(searchInput.value);
                renderSheetResults(results);
            }
        });

        // Live search with debounce
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const results = searchSheetData(searchInput.value);
                renderSheetResults(results);
            }, 300);
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            state.sheetDataLoaded = false;
            fetchSheetData().then(data => {
                renderSheetResults(data);
            });
        });
    }
}

// Make functions globally accessible
window.selectSheetRow = selectSheetRow;
window.openSheetModal = openSheetModal;
window.closeSheetModal = closeSheetModal;

// ==================== //
// Initialization (Supabase)
// ==================== //

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Work Permit Receipt System v5.0 (Supabase) initialized');

    // Check Supabase authentication
    try {
        const client = window.supabaseClient;
        if (!client) {
            console.error('Supabase client not initialized');
            window.location.href = 'login.html';
            return;
        }

        const { data: { session } } = await client.auth.getSession();

        if (!session) {
            console.log('❌ Not authenticated, redirecting to login...');
            window.location.href = 'login.html';
            return;
        }

        console.log('✅ Authenticated as:', session.user.email);

        // Initialize the app after auth check
        await initializeApp();
    } catch (e) {
        console.error('Auth check error:', e);
        window.location.href = 'login.html';
    }
});

async function initializeApp() {
    setupEventListeners();
    setupUserManagement();
    setupSheetImport();

    // Load registry data from Supabase
    await loadRegistryData();

    // Load activity log (admin only)
    try {
        await loadActivityLog();
    } catch (e) {
        console.log('Activity log not accessible (may not be admin)');
    }

    // Set default date
    setDefaultDate();

    // Auto-generate receipt number from Supabase
    try {
        const newReceiptNo = await SupabaseAdapter.getNextReceiptNo();
        elements.receiptNo.value = newReceiptNo;
        state.formData.receiptNo = newReceiptNo;
    } catch (e) {
        const fallbackNo = generateNextReceiptNo(state.registryData);
        elements.receiptNo.value = fallbackNo;
        state.formData.receiptNo = fallbackNo;
    }

    state.formData.receiptDate = elements.receiptDate.value;
    setFormMode('add');

    elements.summaryDate.value = getTodayDateString();
    initMonthlyReportDropdowns();

    updateReceiptPreview();
    renderActivityLog();
    updateBatchPrintUI();

    // Apply role-based permissions
    applyPermissions();

    // Pre-load Google Sheet data in background
    setTimeout(() => {
        fetchSheetData();
    }, 1000);

    console.log('✅ App initialized successfully');
}
