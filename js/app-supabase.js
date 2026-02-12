/**
 * Work Permit Receipt System - Main Application
 * ระบบสร้างแบบฟอร์มรับบัตร - EWP Service Center
 * Version 6.3.0 - Pagination + Barcode + UX Analytics
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
            return str.length <= 500 && !/(<[a-z\/!]|javascript:|on\w+\s*=)/i.test(str);
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
    // Receipt Number Format
    RECEIPT_PREFIX: '6902',

    // Date Format
    DATE_LOCALE: 'th-TH',
    BUDDHIST_YEAR_OFFSET: 543
};

// ==================== //
// UX Analytics (Non-blocking)
// ==================== //
const UXAnalytics = (() => {
    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
    const timers = {};
    const featureCounts = {};
    const eventQueue = [];
    const FLUSH_INTERVAL = 30000; // Flush every 30 seconds
    const MAX_QUEUE_SIZE = 50;    // Flush when queue reaches 50 events
    let flushTimer = null;

    // Batch flush — send all queued events in a single INSERT
    function flush() {
        if (eventQueue.length === 0) return;
        try {
            const client = window.supabaseClient;
            if (!client) return;

            const batch = eventQueue.splice(0); // Take all & clear
            client.from('ux_analytics').insert(batch)
                .then(() => {})
                .catch(() => {}); // Silent — never block UI
        } catch (e) {
            // Never throw from analytics
        }
    }

    // Schedule periodic flush
    function startFlushTimer() {
        if (flushTimer) return;
        flushTimer = setInterval(flush, FLUSH_INTERVAL);
    }

    // Flush on page unload
    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
            // Journey complete — classify session type
            try {
                const m = (typeof state !== 'undefined') ? state._journeyMilestones : null;
                if (m) {
                    const duration = Date.now() - m.startTime;
                    let journeyType = 'browse_only';
                    if (m.hasSearched && m.hasPrinted && !m.hasFormAdd) journeyType = 'search_then_print';
                    else if (m.hasFormAdd && m.hasPrinted) journeyType = 'form_add_then_print';
                    else if (m.hasFormAdd) journeyType = 'form_add_only';
                    else if (m.hasPrinted) journeyType = 'print_only';
                    else if (m.hasSearched) journeyType = 'search_only';
                    log('user_journey', 'journey_complete', {
                        journey_type: journeyType,
                        duration_ms: duration,
                        searched: m.hasSearched,
                        printed: m.hasPrinted,
                        form_added: m.hasFormAdd
                    });
                }
            } catch (e) { /* never throw from analytics */ }
            flush();
        });
    }

    function log(eventType, eventName, eventData = {}, durationMs = null) {
        try {
            eventQueue.push({
                session_id: sessionId,
                user_id: (typeof state !== 'undefined' && state.currentUserId) || null,
                user_role: (typeof state !== 'undefined' && state.currentUserRole) || null,
                event_type: eventType,
                event_name: eventName,
                event_data: eventData,
                duration_ms: durationMs
            });

            startFlushTimer();

            // Flush immediately if queue is full
            if (eventQueue.length >= MAX_QUEUE_SIZE) {
                flush();
            }
        } catch (e) {
            // Never throw from analytics
        }
    }

    function startTimer(name) {
        timers[name] = Date.now();
    }

    function endTimer(name, eventType = 'action_timing', eventData = {}) {
        if (!timers[name]) return null;
        const duration = Date.now() - timers[name];
        log(eventType, name, eventData, duration);
        delete timers[name];
        return duration;
    }

    function trackFeature(featureName, data = {}) {
        featureCounts[featureName] = (featureCounts[featureName] || 0) + 1;
        log('feature_usage', featureName, { count: featureCounts[featureName], ...data });
    }

    function trackJourney(action, details = {}) {
        log('user_journey', action, details);
    }

    function trackError(errorName, details = {}) {
        log('error', errorName, details);
    }

    return { log, startTimer, endTimer, trackFeature, trackJourney, trackError, flush, sessionId };
})();

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
    currentDateFilter: null, // YYYY-MM-DD, null = today
    isSearchMode: false, // true when searching across all dates
    searchDebounceTimer: null,
    formMode: 'add', // 'add' or 'edit'
    editingReceiptNo: null,
    // VP Pending data
    pendingData: [],
    pendingDataLoaded: false,
    // Current user
    currentUserRole: 'staff',
    currentUserId: null,
    // v9.0 — Branch context
    currentBranchId: null,
    currentBranch: null,   // Full branch object {id, code, name_th, name_en, features, ...}
    branches: [],          // All branches (for selectors)
    viewingBranchId: null, // Super admin: viewing another branch's data
    isSuperAdmin: false,
    // Pagination - Registry
    currentPage: 1,
    pageSize: 50,
    // Pagination - Activity Log
    activityPage: 1,
    activityPageSize: 50,
    // Barcode scan detection
    barcodeScanLastKeyTime: 0,
    // v8.5.2 — Batch print hint counter
    printFromTableCount: 0,
    batchPrintHintShown: false,
    // Cache for getFilteredData
    _filteredDataCache: null,
    _filteredDataCacheKey: null,
    // Monthly report cache
    monthlyReportData: [],
    monthlyReportMonth: null,
    monthlyReportYear: null,
    monthlyReportTimestamp: null,
    // Journey tracking
    _journeyMilestones: {
        hasSearched: false,
        hasPrinted: false,
        hasFormAdd: false,
        startTime: Date.now()
    }
};

// ==================== //
// Recent Receipts (localStorage)
// ==================== //
const RECENT_RECEIPTS_KEY = 'boi_recent_receipts';
const RECENT_RECEIPTS_MAX = 10;

const RecentReceipts = {
    _items: null,

    load() {
        if (this._items) return this._items;
        try {
            this._items = JSON.parse(localStorage.getItem(RECENT_RECEIPTS_KEY) || '[]');
        } catch { this._items = []; }
        return this._items;
    },

    add(receiptNo, name) {
        const items = this.load();
        // Remove existing entry for same receiptNo
        const filtered = items.filter(r => r.receiptNo !== receiptNo);
        filtered.unshift({ receiptNo, name: name || '-', ts: Date.now() });
        // Keep max items
        this._items = filtered.slice(0, RECENT_RECEIPTS_MAX);
        localStorage.setItem(RECENT_RECEIPTS_KEY, JSON.stringify(this._items));
    },

    getRecent(limit = 5) {
        return this.load().slice(0, limit);
    },

    clear() {
        this._items = [];
        localStorage.removeItem(RECENT_RECEIPTS_KEY);
    }
};

// ==================== //
// Query Hash Helper (for analytics)
// ==================== //
async function hashQuery(text) {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 12);
    } catch {
        return null;
    }
}

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
    cardPrinterName: document.getElementById('cardPrinterName'),

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
    previewCategoryBadge: document.getElementById('previewCategoryBadge'),
    receiptDocument: document.getElementById('receiptDocument'),

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
    dateFilter: document.getElementById('dateFilter'),
    todayBtn: document.getElementById('todayBtn'),

    // Batch Print
    batchPrintBtn: document.getElementById('batchPrintBtn'),
    selectedCount: document.getElementById('selectedCount'),
    selectAllCheckbox: document.getElementById('selectAllCheckbox'),
    selectNotPrintedBtn: document.getElementById('selectNotPrintedBtn'),

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

// Image size limits
const IMAGE_MAX_RAW_SIZE = 5 * 1024 * 1024;  // 5MB before compression
const IMAGE_MAX_DIMENSION = 1200;              // max width or height in pixels
const IMAGE_QUALITY = 0.7;                     // JPEG compression quality (0-1)

function readImageAsBase64(file) {
    return new Promise((resolve, reject) => {
        // Validate file size before reading
        if (file.size > IMAGE_MAX_RAW_SIZE) {
            reject(new Error(`ไฟล์ขนาด ${(file.size / 1024 / 1024).toFixed(1)} MB ใหญ่เกินไป (สูงสุด 5 MB)`));
            return;
        }

        // Validate file type (only allow actual image types, block SVG)
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            reject(new Error(`ไม่รองรับไฟล์ประเภท ${file.type} (รองรับ: JPG, PNG, GIF, WebP)`));
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const compressed = await compressImage(e.target.result);
                resolve(compressed);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

// Compress image using Canvas API
// - Resize to max 1200px (longest side)
// - Compress as JPEG quality 0.7
// - Strips EXIF data (Canvas does not preserve EXIF)
function compressImage(base64) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            try {
                let { width, height } = img;

                // Calculate new dimensions (keep aspect ratio)
                if (width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION) {
                    if (width > height) {
                        height = Math.round(height * (IMAGE_MAX_DIMENSION / width));
                        width = IMAGE_MAX_DIMENSION;
                    } else {
                        width = Math.round(width * (IMAGE_MAX_DIMENSION / height));
                        height = IMAGE_MAX_DIMENSION;
                    }
                }

                // Draw to canvas and compress
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Convert to JPEG (strips EXIF, good compression)
                const compressed = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);

                // Log compression result
                const originalSize = Math.round(base64.length * 0.75 / 1024); // approximate KB
                const compressedSize = Math.round(compressed.length * 0.75 / 1024);
                console.log(`Image compressed: ${originalSize}KB → ${compressedSize}KB (${Math.round((1 - compressedSize/originalSize) * 100)}% reduction)`);

                resolve(compressed);
            } catch (err) {
                reject(new Error('ไม่สามารถบีบอัดรูปภาพได้'));
            }
        };
        img.onerror = () => reject(new Error('ไม่สามารถอ่านรูปภาพได้'));
        img.src = base64;
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
        const logs = await SupabaseAdapter.loadActivityLog(500);
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

    const paginationEl = document.getElementById('activityPagination');

    if (activities.length === 0) {
        elements.activityList.innerHTML = '<div class="activity-empty">ยังไม่มี Activity</div>';
        if (paginationEl) paginationEl.innerHTML = '';
        return;
    }

    // Pagination
    const totalRecords = activities.length;
    const totalPages = Math.ceil(totalRecords / state.activityPageSize) || 1;
    if (state.activityPage > totalPages) state.activityPage = totalPages;
    if (state.activityPage < 1) state.activityPage = 1;
    const startIdx = (state.activityPage - 1) * state.activityPageSize;
    const endIdx = Math.min(startIdx + state.activityPageSize, totalRecords);
    const pageActivities = activities.slice(startIdx, endIdx);

    const iconMap = {
        'add': { icon: '➕', class: 'add' },
        'edit': { icon: '✏️', class: 'edit' },
        'delete': { icon: '🗑️', class: 'delete' },
        'print': { icon: '🖨️', class: 'print' },
        'receive': { icon: '🎫', class: 'receive' }
    };

    elements.activityList.innerHTML = pageActivities.map(activity => {
        const iconInfo = iconMap[activity.type] || { icon: '📝', class: 'add' };
        const time = new Date(activity.timestamp);
        const timeStr = time.toLocaleDateString('th-TH') + ' ' + time.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

        return `
            <div class="activity-item">
                <div class="activity-icon ${iconInfo.class}">${iconInfo.icon}</div>
                <div class="activity-content">
                    <div class="activity-title">${sanitizeHTML(activity.title)}</div>
                    ${activity.details ? `<div class="activity-details">${sanitizeHTML(activity.details)}</div>` : ''}
                </div>
                <div class="activity-time">${timeStr}</div>
            </div>
        `;
    }).join('');

    // Activity pagination
    renderActivityPagination(totalRecords, totalPages);
}

function renderActivityPagination(totalRecords, totalPages) {
    const container = document.getElementById('activityPagination');
    if (!container) return;

    if (totalRecords === 0 || totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    const startRecord = (state.activityPage - 1) * state.activityPageSize + 1;
    const endRecord = Math.min(state.activityPage * state.activityPageSize, totalRecords);

    let pagesHTML = '';
    const startPage = Math.max(1, state.activityPage - 2);
    const endPage = Math.min(totalPages, state.activityPage + 2);

    if (startPage > 1) {
        pagesHTML += `<button class="pagination-btn" onclick="goToActivityPage(1)">1</button>`;
        if (startPage > 2) pagesHTML += `<span class="pagination-ellipsis">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        pagesHTML += `<button class="pagination-btn ${i === state.activityPage ? 'active' : ''}" onclick="goToActivityPage(${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) pagesHTML += `<span class="pagination-ellipsis">...</span>`;
        pagesHTML += `<button class="pagination-btn" onclick="goToActivityPage(${totalPages})">${totalPages}</button>`;
    }

    container.innerHTML = `
        <div class="pagination-info">แสดง ${startRecord}-${endRecord} จาก ${totalRecords} รายการ</div>
        <div class="pagination-controls">
            <button class="pagination-btn" onclick="goToActivityPage(${state.activityPage - 1})" ${state.activityPage <= 1 ? 'disabled' : ''}>&#8592; ก่อนหน้า</button>
            ${pagesHTML}
            <button class="pagination-btn" onclick="goToActivityPage(${state.activityPage + 1})" ${state.activityPage >= totalPages ? 'disabled' : ''}>ถัดไป &#8594;</button>
        </div>
    `;
}

function goToActivityPage(page) {
    if (page < 1) return;
    state.activityPage = page;
    renderActivityLog();
    document.getElementById('activityLogPane')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.goToActivityPage = goToActivityPage;

// ==================== //
// Print & Received Tracking (Supabase)
// ==================== //

async function markAsPrinted(receiptNo) {
    if (!receiptNo) return;

    try {
        await SupabaseAdapter.markPrinted(receiptNo);
        invalidateMonthlyCache();

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
    UXAnalytics.trackFeature('toggle_received');
    if (!receiptNo) return;

    try {
        const newStatus = await SupabaseAdapter.toggleReceived(receiptNo);
        invalidateMonthlyCache();
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
    // Only select/deselect items on current page
    const startIndex = (state.currentPage - 1) * state.pageSize;
    const endIndex = Math.min(startIndex + state.pageSize, filteredData.length);
    const pageData = filteredData.slice(startIndex, endIndex);
    const pageReceiptNos = pageData.map(r => r.receiptNo);

    const allPageSelected = pageReceiptNos.every(rn => state.selectedItems.includes(rn));

    if (allPageSelected) {
        // Deselect current page items
        state.selectedItems = state.selectedItems.filter(rn => !pageReceiptNos.includes(rn));
    } else {
        // Select current page items (add to existing selection)
        pageReceiptNos.forEach(rn => {
            if (!state.selectedItems.includes(rn)) {
                state.selectedItems.push(rn);
            }
        });
    }
    renderRegistryTable();
    updateBatchPrintUI();
}

// Select only not-printed items on current page
function selectAllNotPrinted() {
    UXAnalytics.trackFeature('select_not_printed');
    const filteredData = getFilteredData();
    const startIndex = (state.currentPage - 1) * state.pageSize;
    const endIndex = Math.min(startIndex + state.pageSize, filteredData.length);
    const pageData = filteredData.slice(startIndex, endIndex);

    // Select items that are not printed
    const notPrintedOnPage = pageData.filter(r => !r.isPrinted).map(r => r.receiptNo);

    if (notPrintedOnPage.length === 0) {
        showToast('ไม่มีรายการที่ยังไม่พิมพ์ในหน้านี้', 'info');
        return;
    }

    // Add to selection (don't duplicate)
    notPrintedOnPage.forEach(rn => {
        if (!state.selectedItems.includes(rn)) {
            state.selectedItems.push(rn);
        }
    });

    renderRegistryTable();
    updateBatchPrintUI();
    showToast(`เลือก ${notPrintedOnPage.length} รายการที่ยังไม่พิมพ์`, 'success');
}

function updateBatchPrintUI() {
    const count = state.selectedItems.length;
    if (elements.selectedCount) {
        elements.selectedCount.textContent = count;
    }
    if (elements.batchPrintBtn) {
        elements.batchPrintBtn.disabled = count === 0;
    }
    // Update select all checkbox (check current page only)
    const filteredData = getFilteredData();
    const startIdx = (state.currentPage - 1) * state.pageSize;
    const endIdx = Math.min(startIdx + state.pageSize, filteredData.length);
    const pageReceiptNos = filteredData.slice(startIdx, endIdx).map(r => r.receiptNo);
    if (elements.selectAllCheckbox) {
        const selectedOnPage = pageReceiptNos.filter(rn => state.selectedItems.includes(rn)).length;
        elements.selectAllCheckbox.checked = pageReceiptNos.length > 0 && selectedOnPage === pageReceiptNos.length;
        elements.selectAllCheckbox.indeterminate = selectedOnPage > 0 && selectedOnPage < pageReceiptNos.length;
    }
}

function trackJourneyPrint() {
    if (!state._journeyMilestones.hasPrinted) {
        state._journeyMilestones.hasPrinted = true;
        UXAnalytics.trackJourney('journey_print', { ms_since_start: Date.now() - state._journeyMilestones.startTime });
    }
}

function batchPrint() {
    UXAnalytics.trackFeature('batch_print', { count: state.selectedItems.length });
    trackJourneyPrint();
    if (state.selectedItems.length === 0) {
        alert('กรุณาเลือกรายการที่ต้องการพิมพ์');
        return;
    }

    const selectedData = state.registryData.filter(row => state.selectedItems.includes(row.receiptNo));

    // Sort A-Z by name (ข้าม prefix mr./mrs./miss/ms.) เพื่อให้ค้นหาง่ายเมื่อปริ้นออกมา
    selectedData.sort((a, b) => {
        const nameA = (a.name || '').trim().replace(/^(mr\.?|mrs\.?|miss|ms\.?)\s+/i, '').toUpperCase();
        const nameB = (b.name || '').trim().replace(/^(mr\.?|mrs\.?|miss|ms\.?)\s+/i, '').toUpperCase();
        return nameA.localeCompare(nameB);
    });

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
            cardImage: rowData.cardImage,
            // v7.0 - Photo & Signature
            recipientPhotoUrl: rowData.recipientPhotoUrl || null,
            recipientSignatureUrl: rowData.recipientSignatureUrl || null,
            officerSignatureUrl: rowData.officerSignatureUrl || null,
            // v8.5 - Card printer name
            cardPrinterName: rowData.cardPrinterName || null
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
    renderBarcodes();

    // Store selected items for confirmation
    const itemsToPrint = [...state.selectedItems];
    const receiptNos = selectedData.map(r => r.receiptNo).join(', ');
    const count = selectedData.length;

    // Use afterprint event for accurate timing (replaces setTimeout)
    const afterPrintHandler = async () => {
        window.removeEventListener('afterprint', afterPrintHandler);
        if (confirm(`พิมพ์ใบรับ ${count} รายการ เรียบร้อยแล้วหรือไม่?`)) {
            // Batch mark as printed — 1 Supabase call instead of N
            const success = await SupabaseAdapter.markPrintedBatch(itemsToPrint);
            if (success) {
                invalidateMonthlyCache();
                // Update local state in memory
                itemsToPrint.forEach(rn => {
                    const record = state.registryData.find(r => r.receiptNo === rn);
                    if (record) {
                        record.isPrinted = true;
                        record.printedAt = new Date().toISOString();
                    }
                    // Update printedReceipts array
                    const existingIndex = state.printedReceipts.findIndex(r => r.receiptNo === rn);
                    if (existingIndex >= 0) {
                        state.printedReceipts[existingIndex].printCount++;
                    } else {
                        state.printedReceipts.push({ receiptNo: rn, printedAt: new Date().toISOString(), printCount: 1 });
                    }
                });
                addActivity('print', `พิมพ์ใบรับ ${count} รายการ (Batch)`, receiptNos);
                updateSummary();
            } else {
                alert('เกิดข้อผิดพลาดในการบันทึกสถานะพิมพ์');
            }
        }
        // Clear selection after confirm/cancel (not before)
        state.selectedItems = [];
        renderRegistryTable();
        updateBatchPrintUI();
    };

    window.addEventListener('afterprint', afterPrintHandler);
    window.print();
}

// Helper: ดึงตัวอักษรหมวดหมู่ + สี จากชื่อ (ข้าม prefix mr./mrs./miss/ms.)
function getCategoryInfo(name) {
    const cleaned = (name || '-').trim().replace(/^(mr\.?|mrs\.?|miss|ms\.?)\s+/i, '');
    const letter = cleaned.charAt(0).toUpperCase() || '-';
    const code = letter.charCodeAt(0);
    let color = '#9ca3af'; // default gray
    if (code >= 65 && code <= 69) color = '#dc2626';      // A-E แดง
    else if (code >= 70 && code <= 74) color = '#16a34a';  // F-J เขียว
    else if (code >= 75 && code <= 79) color = '#2563eb';  // K-O น้ำเงิน
    else if (code >= 80 && code <= 84) color = '#ea580c';  // P-T ส้ม
    else if (code >= 85 && code <= 90) color = '#9333ea';  // U-Z ม่วง
    return { letter, color };
}

function generateSinglePrintContent(formData) {
    // ดึงชื่อเจ้าหน้าที่จาก session
    const session = window.AuthSystem ? window.AuthSystem.getSession() : null;
    const officerName = sanitizeHTML(session ? session.name : '');

    // Sanitize all user-sourced data
    const safeSN = sanitizeHTML(formData.snNumber || '-');
    const safeName = sanitizeHTML(formData.foreignerName || '-');
    const safeRequestNo = sanitizeHTML(formData.requestNo || '-');
    const safeAppointmentNo = sanitizeHTML(formData.appointmentNo || '-');
    const safeReceiptNo = sanitizeHTML(formData.receiptNo || '-');
    const safeCardPrinterName = sanitizeHTML(formData.cardPrinterName || '');
    const safeCardImage = formData.cardImage && /^(https?:\/\/|data:image\/)/i.test(formData.cardImage) ? sanitizeHTML(formData.cardImage) : '';

    // Category letter + color (ข้าม prefix ใช้ชื่อจริง)
    const categoryInfo = getCategoryInfo(formData.foreignerName);

    return `
        <div class="print-receipt-page" style="font-family: 'Sarabun', sans-serif; font-size: 14px; line-height: 1.2; padding: 5mm 10mm; border-top: 3px solid ${categoryInfo.color};">
            <!-- Header with Category Badge -->
            <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 6px; padding-bottom: 5px; border-bottom: 2px solid #2563eb;">
                <div style="text-align: center; flex: 1;">
                    <h2 style="color: #2563eb; margin: 0; font-size: 18px; font-weight: 700;">แบบรับใบอนุญาตทำงาน e-WorkPermit</h2>
                    <p style="color: #6b7280; margin: 2px 0 0 0; font-size: 12px;">(e-WorkPermit Card Receipt)</p>
                </div>
                <div style="width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; color: ${categoryInfo.color}; border: 2px solid ${categoryInfo.color}; border-radius: 5px; background: #fff; flex-shrink: 0; margin-left: 10px;">${categoryInfo.letter}</div>
            </div>

            <!-- ข้อมูลหลัก -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px; background: #f8fafc; border: 1px solid #e5e7eb;">
                <tr>
                    <td style="padding: 5px 10px; border-bottom: 1px dotted #ddd; width: 50%;">
                        <div style="font-weight: 600; color: #374151; font-size: 10px;">วันที่รับบัตร / Receipt Date:</div>
                        <div style="color: #111; font-size: 14px; font-weight: 500;">${formatDateForDisplay(formData.receiptDate)}</div>
                    </td>
                    <td style="padding: 5px 10px; border-bottom: 1px dotted #ddd;">
                        <div style="font-weight: 600; color: #374151; font-size: 10px;">หมายเลข SN / Serial No.:</div>
                        <div style="color: #111; font-size: 14px; font-weight: 500;">${safeSN}</div>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 5px 10px; border-bottom: 1px dotted #ddd;">
                        <div style="font-weight: 600; color: #374151; font-size: 10px;">ชื่อผู้รับบัตร / Name:</div>
                        <div style="color: #111; font-size: 14px; font-weight: 500;">${safeName}</div>
                    </td>
                    <td style="padding: 5px 10px; border-bottom: 1px dotted #ddd;">
                        <div style="font-weight: 600; color: #374151; font-size: 10px;">เลขที่คำขอ / Request No.:</div>
                        <div style="color: #111; font-size: 14px; font-weight: 500;">${safeRequestNo}</div>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="padding: 5px 10px; border-bottom: 1px dotted #ddd;">
                        <div style="font-weight: 600; color: #374151; font-size: 10px;">เลขที่นัดหมาย / Appointment No.:</div>
                        <div style="color: #111; font-size: 14px; font-weight: 500;">${safeAppointmentNo}</div>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 5px 10px;">
                        <div style="font-weight: 600; color: #374151; font-size: 10px;">ผู้พิมพ์บัตร / Card Printer:</div>
                        <div style="color: #111; font-size: 14px; font-weight: 500;">${safeCardPrinterName || '-'}</div>
                    </td>
                    <td style="padding: 5px 10px;">
                        <div style="font-weight: 600; color: #374151; font-size: 10px;">เจ้าหน้าที่ผู้ออกใบรับ / Issuing Officer:</div>
                        <div style="color: #111; font-size: 14px; font-weight: 500;">${officerName || '-'}</div>
                    </td>
                </tr>
            </table>

            <!-- รูปบัตร -->
            <div style="margin-bottom: 6px;">
                <p style="text-align: center; font-weight: 600; color: #374151; margin: 0 0 4px 0; font-size: 11px;">รูปบัตรอนุญาตทำงาน / Work Permit Card Image</p>
                <div style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px; text-align: center; min-height: 200px; background: #fff; display: flex; align-items: center; justify-content: center;">
                    ${safeCardImage ?
                        `<img src="${safeCardImage}" style="max-width: 100%; max-height: 210px; object-fit: contain;">` :
                        `<div style="color: #9ca3af;"><p style="font-size: 40px; margin: 0;">📷</p><p style="font-size: 14px; margin: 10px 0 0 0;">ไม่มีรูปภาพ / No Image</p></div>`}
                </div>
            </div>

            <!-- ข้อความยืนยัน -->
            <div style="margin: 5px 0; padding: 8px 12px; background: #f0f9ff; border-radius: 6px; border-left: 3px solid #2563eb;">
                <p style="font-size: 11px; line-height: 1.4; color: #1f2937; margin: 0 0 3px 0;">ข้าพเจ้าตรวจความถูกต้องของใบอนุญาตทำงานแล้ว และยืนยันว่าได้รับใบอนุญาตทำงาน ณ ${state.currentBranch?.name_th || 'ศูนย์บริการวีซ่าและใบอนุญาตทำงาน'}</p>
                <p style="font-size: 9px; line-height: 1.3; color: #6b7280; font-style: italic; margin: 0;">I have verified that all information on the work permit card is correct and confirm receipt at ${state.currentBranch?.name_en || 'the Visa and Work Permit Service Center'}.</p>
            </div>

            <!-- v7.0 - Recipient Photo (if available) -->
            ${formData.recipientPhotoUrl ? `
            <div style="text-align: center; margin-bottom: 6px;">
                <p style="font-size: 10px; font-weight: 600; color: #374151; margin: 0 0 4px 0;">ภาพถ่ายผู้รับบัตร / Recipient Photo</p>
                <img src="${sanitizeHTML(formData.recipientPhotoUrl)}" style="max-width: 100px; max-height: 100px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb;">
            </div>` : ''}

            <!-- ช่องลงชื่อ -->
            <table style="width: 100%; margin-top: 10px;">
                <tr>
                    <td style="width: 50%; text-align: center; padding: 0 15px;">
                        ${formData.recipientSignatureUrl ?
                            `<img src="${sanitizeHTML(formData.recipientSignatureUrl)}" style="max-width: 80%; max-height: 28px; object-fit: contain; margin-bottom: 4px;">` :
                            `<div style="border-bottom: 1px solid #374151; height: 28px; margin-bottom: 4px;"></div>`}
                        <p style="color: #374151; margin: 0; font-size: 10px; font-weight: 600;">ลงชื่อผู้รับบัตร / Cardholder</p>
                        <p style="color: #1f2937; font-weight: 600; margin: 3px 0; font-size: 10px;">(${safeName !== '-' ? safeName : '___________________'})</p>
                        <p style="color: #6b7280; margin: 0; font-size: 9px;">Tel: ________________________</p>
                    </td>
                    <td style="width: 50%; text-align: center; padding: 0 15px;">
                        ${formData.officerSignatureUrl ?
                            `<img src="${sanitizeHTML(formData.officerSignatureUrl)}" style="max-width: 80%; max-height: 28px; object-fit: contain; margin-bottom: 4px;">` :
                            `<div style="border-bottom: 1px solid #374151; height: 28px; margin-bottom: 4px;"></div>`}
                        <p style="color: #374151; margin: 0; font-size: 10px; font-weight: 600;">ลงชื่อเจ้าหน้าที่ / Officer</p>
                        <p style="color: #1f2937; font-weight: 600; margin: 3px 0; font-size: 10px;">(${officerName || '___________________'})</p>
                        <p style="color: #6b7280; margin: 0; font-size: 9px;">Date: ${formatDateForDisplay(formData.receiptDate)}</p>
                    </td>
                </tr>
            </table>

            <!-- Footer with Org Name, Doc No and Barcode -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 4px; border-top: 1px solid #d1d5db;">
                <div style="font-size: 8px; color: #9ca3af;">${state.currentBranch?.name_th || 'ศูนย์บริการ EWP'}</div>
                <div style="text-align: right;">
                    <div style="font-size: 13px; color: #111; font-weight: 700; margin-bottom: 1px;">Doc No.: ${safeReceiptNo}</div>
                    <svg class="receipt-barcode" data-receipt-no="${safeReceiptNo}"></svg>
                </div>
            </div>
        </div>
    `;
}

// ==================== //
// Barcode Rendering
// ==================== //

function renderBarcodes() {
    const barcodeElements = document.querySelectorAll('#printTemplate .receipt-barcode');
    barcodeElements.forEach(el => {
        const receiptNo = el.getAttribute('data-receipt-no');
        if (receiptNo && window.JsBarcode) {
            try {
                JsBarcode(el, receiptNo, {
                    format: 'CODE128',
                    width: 1.5,
                    height: 28,
                    displayValue: true,
                    fontSize: 11,
                    font: 'Sarabun',
                    textMargin: 1,
                    margin: 0
                });
            } catch (e) {
                // Fallback: show text if barcode generation fails
                el.outerHTML = `<span style="font-size: 16px; color: #111; font-weight: 700;">Doc No.: ${receiptNo}</span>`;
            }
        } else {
            // Fallback: JsBarcode not loaded
            el.outerHTML = `<span style="font-size: 16px; color: #111; font-weight: 700;">Doc No.: ${receiptNo}</span>`;
        }
    });
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

function invalidateMonthlyCache() {
    state.monthlyReportData = [];
    state.monthlyReportMonth = null;
    state.monthlyReportYear = null;
    state.monthlyReportTimestamp = null;
}

function getMonthlyData(month, year) {
    if (!month || !year) return [];

    // Return from monthly cache if available
    if (state.monthlyReportData.length > 0 &&
        state.monthlyReportMonth === month &&
        state.monthlyReportYear === year) {
        return state.monthlyReportData;
    }

    return [];
}

async function generateMonthlyReport() {
    const month = elements.reportMonth ? elements.reportMonth.value : '';
    const year = elements.reportYear ? elements.reportYear.value : '';

    if (!month || !year) {
        alert('กรุณาเลือกเดือนและปี');
        return;
    }

    // Check cache: same month/year and within 5 minutes
    const CACHE_TTL = 5 * 60 * 1000;
    const cacheValid =
        state.monthlyReportData.length > 0 &&
        state.monthlyReportMonth === month &&
        state.monthlyReportYear === year &&
        state.monthlyReportTimestamp &&
        (Date.now() - state.monthlyReportTimestamp) < CACHE_TTL;

    let data;

    if (cacheValid) {
        data = state.monthlyReportData;
    } else {
        // Show loading state
        if (elements.generateReportBtn) {
            elements.generateReportBtn.disabled = true;
            elements.generateReportBtn.textContent = '⏳ กำลังโหลด...';
        }
        if (elements.dailyBreakdown) {
            elements.dailyBreakdown.innerHTML = '<div class="daily-breakdown-empty">⏳ กำลังโหลดข้อมูลทั้งเดือน...</div>';
        }

        try {
            data = await SupabaseAdapter.loadMonthlyData(month, year);

            // Update cache
            state.monthlyReportData = data;
            state.monthlyReportMonth = month;
            state.monthlyReportYear = year;
            state.monthlyReportTimestamp = Date.now();
        } catch (error) {
            console.error('❌ Monthly report error:', error);
            alert('ไม่สามารถโหลดข้อมูลรายเดือนได้: ' + error.message);
            if (elements.dailyBreakdown) {
                elements.dailyBreakdown.innerHTML = '<div class="daily-breakdown-empty">⚠️ ไม่สามารถโหลดข้อมูลได้</div>';
            }
            return;
        } finally {
            if (elements.generateReportBtn) {
                elements.generateReportBtn.disabled = false;
                elements.generateReportBtn.textContent = 'สร้างรายงาน';
            }
        }
    }

    // Calculate stats using direct properties (not isPrinted/isCardReceived helpers)
    let printed = 0;
    let received = 0;

    data.forEach(row => {
        if (row.isPrinted) printed++;
        if (row.isReceived) received++;
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
        if (row.isPrinted) dailyStats[day].printed++;
        if (row.isReceived) dailyStats[day].received++;
    });

    // Sort by day
    const sortedDays = Object.keys(dailyStats).sort((a, b) => parseInt(a) - parseInt(b));

    const thaiYear = parseInt(year) + CONFIG.BUDDHIST_YEAR_OFFSET;

    // Pre-calculate totals
    const totalPrinted = data.filter(r => r.isPrinted).length;
    const totalReceived = data.filter(r => r.isReceived).length;

    elements.dailyBreakdown.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>วันที่</th>
                    <th>ผลิตบัตร</th>
                    <th>พิมพ์แล้ว</th>
                    <th>รับบัตรแล้ว</th>
                    <th>ยังไม่ได้รับบัตร</th>
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
                    <td style="color: var(--success-color);">${totalPrinted}</td>
                    <td style="color: var(--primary-color);">${totalReceived}</td>
                    <td style="color: var(--warning-color);">${data.length - totalReceived}</td>
                </tr>
            </tbody>
        </table>
    `;
}

async function exportMonthlyPDF() {
    const month = elements.reportMonth ? elements.reportMonth.value : '';
    const year = elements.reportYear ? elements.reportYear.value : '';

    if (!month || !year) {
        alert('กรุณาเลือกเดือนและปีก่อน');
        return;
    }

    // Use cache or load fresh data
    let data = getMonthlyData(month, year);
    if (data.length === 0) {
        // Try loading from Supabase
        if (elements.exportMonthlyPdfBtn) {
            elements.exportMonthlyPdfBtn.disabled = true;
            elements.exportMonthlyPdfBtn.textContent = '⏳ กำลังโหลด...';
        }
        try {
            data = await SupabaseAdapter.loadMonthlyData(month, year);
            state.monthlyReportData = data;
            state.monthlyReportMonth = month;
            state.monthlyReportYear = year;
            state.monthlyReportTimestamp = Date.now();
        } catch (error) {
            alert('ไม่สามารถโหลดข้อมูลได้: ' + error.message);
            return;
        } finally {
            if (elements.exportMonthlyPdfBtn) {
                elements.exportMonthlyPdfBtn.disabled = false;
                elements.exportMonthlyPdfBtn.textContent = '📄 ดาวน์โหลด PDF';
            }
        }
    }

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
        if (row.isPrinted) dailyStats[day].printed++;
        if (row.isReceived) dailyStats[day].received++;
        dailyStats[day].items.push(row);
    });

    const sortedDays = Object.keys(dailyStats).sort((a, b) => parseInt(a) - parseInt(b));

    let printed = 0;
    let received = 0;
    data.forEach(row => {
        if (row.isPrinted) printed++;
        if (row.isReceived) received++;
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
                    <div style="font-size: 12px; color: #666;">ยังไม่ได้รับบัตร</div>
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
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">ยังไม่ได้รับบัตร</th>
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

async function exportMonthlyCSV() {
    const month = elements.reportMonth ? elements.reportMonth.value : '';
    const year = elements.reportYear ? elements.reportYear.value : '';

    if (!month || !year) {
        alert('กรุณาเลือกเดือนและปีก่อน');
        return;
    }

    // Use cache or load fresh data
    let data = getMonthlyData(month, year);
    if (data.length === 0) {
        if (elements.exportMonthlyCsvBtn) {
            elements.exportMonthlyCsvBtn.disabled = true;
            elements.exportMonthlyCsvBtn.textContent = '⏳ กำลังโหลด...';
        }
        try {
            data = await SupabaseAdapter.loadMonthlyData(month, year);
            state.monthlyReportData = data;
            state.monthlyReportMonth = month;
            state.monthlyReportYear = year;
            state.monthlyReportTimestamp = Date.now();
        } catch (error) {
            alert('ไม่สามารถโหลดข้อมูลได้: ' + error.message);
            return;
        } finally {
            if (elements.exportMonthlyCsvBtn) {
                elements.exportMonthlyCsvBtn.disabled = false;
                elements.exportMonthlyCsvBtn.textContent = '📥 ดาวน์โหลด CSV';
            }
        }
    }

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
        row.isPrinted ? 'พิมพ์แล้ว' : 'รอพิมพ์',
        row.isReceived ? 'รับแล้ว' : 'รอรับ'
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
            alert(error.message || 'ไม่สามารถอ่านไฟล์รูปภาพได้');
            inputElement.value = ''; // Reset file input
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
                    alert(error.message || 'ไม่สามารถวางรูปภาพได้');
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
    if (elements.cardPrinterName) {
        state.formData.cardPrinterName = elements.cardPrinterName.value || null;
    }
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

    // Update Category Badge + color band in preview
    const categoryInfo = getCategoryInfo(state.formData.foreignerName);
    if (elements.previewCategoryBadge) {
        elements.previewCategoryBadge.textContent = categoryInfo.letter;
        elements.previewCategoryBadge.style.color = categoryInfo.color;
        elements.previewCategoryBadge.style.borderColor = categoryInfo.color;
        elements.previewCategoryBadge.style.display = state.formData.foreignerName ? 'flex' : 'none';
    }
    if (elements.receiptDocument) {
        elements.receiptDocument.style.borderTop = state.formData.foreignerName ? `4px solid ${categoryInfo.color}` : 'none';
    }

    if (state.formData.cardImage) {
        elements.receiptCardImage.src = state.formData.cardImage;
        elements.previewCardBox.classList.add('has-image');
    } else {
        elements.receiptCardImage.src = '';
        elements.previewCardBox.classList.remove('has-image');
    }

    // v7.0 - Update recipient photo in preview
    const previewPhotoBox = document.getElementById('previewPhotoBox');
    const previewRecipientPhoto = document.getElementById('previewRecipientPhoto');
    if (previewPhotoBox && previewRecipientPhoto) {
        const photoSrc = (typeof webcamState !== 'undefined' && webcamState.capturedPhoto) ? webcamState.capturedPhoto : null;
        if (photoSrc) {
            previewRecipientPhoto.src = photoSrc;
            previewPhotoBox.style.display = '';
        } else {
            previewRecipientPhoto.src = '';
            previewPhotoBox.style.display = 'none';
        }
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
    if (elements.cardPrinterName) elements.cardPrinterName.value = '';
    elements.cardImage.value = '';

    elements.cardPreview.src = '';
    elements.cardImageUpload.classList.remove('has-image');

    // v7.0 - Clear photo and signature
    if (typeof clearPhotoAndSignature === 'function') {
        clearPhotoAndSignature();
    }

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
        cardImage: null,
        _pendingId: null,
        _apiPhotoUrl: null
    };

    setFormMode('add');
    updateReceiptPreview();
    UXAnalytics.startTimer('form_add');
}

function setDefaultDate() {
    elements.receiptDate.value = getTodayDateString();
}

function loadFromRegistry(rowData) {
    UXAnalytics.startTimer('form_edit');
    elements.receiptNo.value = rowData.receiptNo || '';
    elements.foreignerName.value = rowData.name || '';
    elements.snNumber.value = rowData.sn || '';
    elements.requestNo.value = rowData.requestNo || '';
    elements.appointmentNo.value = rowData.appointmentNo || '';

    // v8.5 - Load card printer name into state and input field
    state.formData.cardPrinterName = rowData.cardPrinterName || null;
    if (elements.cardPrinterName) {
        elements.cardPrinterName.value = rowData.cardPrinterName || '';
    }

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

    // v7.0 - Load recipient photo from saved URL
    if (rowData.recipientPhotoUrl) {
        if (typeof webcamState !== 'undefined') {
            webcamState.capturedPhoto = rowData.recipientPhotoUrl;
        }
        const webcamPreview = document.getElementById('webcamPreview');
        const webcamVideo = document.getElementById('webcamVideo');
        if (webcamPreview) {
            webcamPreview.src = rowData.recipientPhotoUrl;
            webcamPreview.style.display = '';
        }
        if (webcamVideo) webcamVideo.style.display = 'none';
        if (typeof updateRecipientPhotoPreview === 'function') {
            updateRecipientPhotoPreview();
        }
    }

    // v7.0 - Load recipient signature from saved URL
    if (rowData.recipientSignatureUrl) {
        const previewSig = document.getElementById('previewRecipientSignature');
        const previewLine = document.getElementById('previewSignatureLine');
        if (previewSig) { previewSig.src = rowData.recipientSignatureUrl; previewSig.style.display = ''; }
        if (previewLine) previewLine.style.display = 'none';
    }

    // v7.0 - Load officer signature from saved URL (or use cached)
    if (rowData.officerSignatureUrl) {
        const previewOfficerSig = document.getElementById('previewOfficerSignature');
        const previewOfficerLine = document.getElementById('previewOfficerSignatureLine');
        if (previewOfficerSig) { previewOfficerSig.src = rowData.officerSignatureUrl; previewOfficerSig.style.display = ''; }
        if (previewOfficerLine) previewOfficerLine.style.display = 'none';
    }

    setFormMode('edit', rowData.receiptNo);
    updateReceiptPreview();
}

// ==================== //
// Save Data (Supabase)
// ==================== //

async function saveData() {
    updateFormState();
    UXAnalytics.endTimer(state.formMode === 'edit' ? 'form_edit' : 'form_add', 'action_timing', { mode: state.formMode });

    // Basic validation
    if (!state.formData.receiptNo || !state.formData.foreignerName) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน (เลขรับที่ และ ชื่อ)');
        UXAnalytics.trackError('validation_fail', { field: 'required', reason: 'missing_receipt_or_name' });
        return;
    }

    // Security validation
    if (!validateInput(state.formData.receiptNo, 'receiptNo')) {
        alert('รูปแบบเลขรับที่ไม่ถูกต้อง');
        UXAnalytics.trackError('validation_fail', { field: 'receiptNo', reason: 'invalid_format' });
        return;
    }
    if (!validateInput(state.formData.foreignerName, 'text')) {
        alert('ชื่อมีรูปแบบไม่ถูกต้องหรือยาวเกินไป');
        UXAnalytics.trackError('validation_fail', { field: 'foreignerName', reason: 'invalid_or_too_long' });
        return;
    }
    if (state.formData.snNumber && !validateInput(state.formData.snNumber, 'text')) {
        alert('หมายเลข SN มีรูปแบบไม่ถูกต้อง');
        UXAnalytics.trackError('validation_fail', { field: 'snNumber', reason: 'invalid_format' });
        return;
    }
    if (state.formData.requestNo && !validateInput(state.formData.requestNo, 'text')) {
        alert('เลขที่คำขอมีรูปแบบไม่ถูกต้อง');
        UXAnalytics.trackError('validation_fail', { field: 'requestNo', reason: 'invalid_format' });
        return;
    }

    // v7.1 - Duplicate check before saving
    const isEditMode = state.formMode === 'edit';
    const excludeReceiptNo = isEditMode ? state.editingReceiptNo : null;
    const duplicateWarnings = [];

    try {
        // v8.5.2 — Parallel duplicate checks (was sequential)
        const [snResult, nameResult] = await Promise.allSettled([
            state.formData.snNumber
                ? SupabaseAdapter.checkDuplicateSN(state.formData.snNumber, excludeReceiptNo)
                : Promise.resolve([]),
            state.formData.foreignerName
                ? SupabaseAdapter.checkDuplicateName(state.formData.foreignerName, state.formData.receiptDate, excludeReceiptNo)
                : Promise.resolve([])
        ]);

        // Process SN duplicate result
        if (snResult.status === 'fulfilled' && snResult.value.length > 0) {
            const details = snResult.value.map(d => `${d.receipt_no} (${d.foreigner_name})`).join(', ');
            duplicateWarnings.push(`SN "${state.formData.snNumber}" มีอยู่แล้วใน: ${details}`);
        }

        // Process name duplicate result
        if (nameResult.status === 'fulfilled' && nameResult.value.length > 0) {
            const details = nameResult.value.map(d => d.receipt_no).join(', ');
            duplicateWarnings.push(`ชื่อ "${state.formData.foreignerName}" มีอยู่แล้วในวันเดียวกัน: ${details}`);
        }
    } catch (dupError) {
        console.warn('Duplicate check failed (non-blocking):', dupError.message);
    }

    if (duplicateWarnings.length > 0) {
        const msg = '⚠️ พบข้อมูลที่อาจซ้ำ:\n\n' + duplicateWarnings.join('\n\n') + '\n\nต้องการบันทึกต่อหรือไม่?';
        if (!confirm(msg)) {
            UXAnalytics.trackError('duplicate_cancelled', { warnings: duplicateWarnings.length });
            return;
        }
    }

    // Disable save button while saving
    elements.saveBtn.disabled = true;
    elements.saveBtn.textContent = '⏳ กำลังบันทึก...';

    try {
        const isEdit = state.formMode === 'edit';
        const maxRetries = 3;
        let saved = false;

        for (let attempt = 1; attempt <= maxRetries && !saved; attempt++) {
            try {
                // For new records, always re-generate receipt number before save
                // to prevent race condition when 3 users get same number
                if (!isEdit) {
                    const freshReceiptNo = await SupabaseAdapter.getNextReceiptNo();
                    if (freshReceiptNo !== state.formData.receiptNo) {
                        console.log(`⚠️ Attempt ${attempt}: Receipt number updated: ${state.formData.receiptNo} → ${freshReceiptNo}`);
                        state.formData.receiptNo = freshReceiptNo;
                        elements.receiptNo.value = freshReceiptNo;
                        updateReceiptPreview();
                    }
                }

                // v7.0 - Upload photo & signature in parallel
                let recipientPhotoUrl = null;
                let recipientSignatureUrl = null;
                let officerSignatureUrl = cachedOfficerSignatureUrl || null;

                const hasPhoto = typeof webcamState !== 'undefined' && webcamState.capturedPhoto;
                const hasSig = typeof recipientSignaturePad !== 'undefined' && recipientSignaturePad && !recipientSignaturePad.isEmpty();
                console.log('📷 v7.0 Save - hasPhoto:', !!hasPhoto, 'hasSig:', !!hasSig, 'officerSig:', !!officerSignatureUrl);
                if (hasPhoto) {
                    console.log('📷 Photo data type:', webcamState.capturedPhoto.substring(0, 50) + '...');
                }

                const uploadPromises = [];
                if (hasPhoto) {
                    // If photo is already a URL (loaded from DB), don't re-upload
                    if (webcamState.capturedPhoto.startsWith('http')) {
                        recipientPhotoUrl = webcamState.capturedPhoto;
                        console.log('📷 Photo already uploaded, using existing URL');
                    } else {
                        uploadPromises.push(
                            SupabaseAdapter.uploadPhoto(webcamState.capturedPhoto, state.formData.receiptNo)
                                .then(url => {
                                    recipientPhotoUrl = url;
                                    console.log('📷 Photo uploaded successfully:', url);
                                })
                                .catch(e => {
                                    console.error('📷 Photo upload FAILED:', e);
                                })
                        );
                    }
                }
                if (hasSig) {
                    const sigData = recipientSignaturePad.toDataURL('image/png');
                    const sigFileName = `signatures/${state.formData.receiptNo}_recipient.png`;
                    // If re-saving, check if signature pad has new data
                    uploadPromises.push(
                        SupabaseAdapter.uploadSignature(sigData, sigFileName)
                            .then(url => {
                                recipientSignatureUrl = url;
                                console.log('✍️ Signature uploaded successfully:', url);
                            })
                            .catch(e => {
                                console.error('✍️ Signature upload FAILED:', e);
                            })
                    );
                }
                // v8.5.2 — Card image upload in parallel with photo/signature
                let cardImageUrl = state.formData.cardImage || null;
                if (cardImageUrl && cardImageUrl.startsWith('data:')) {
                    uploadPromises.push(
                        SupabaseAdapter.uploadImage(state.formData.receiptNo, cardImageUrl)
                            .then(url => {
                                cardImageUrl = url;
                                console.log('🖼️ Card image uploaded successfully:', url);
                            })
                            .catch(e => {
                                console.error('🖼️ Card image upload FAILED:', e);
                            })
                    );
                }

                if (uploadPromises.length > 0) {
                    console.log('📷 Uploading', uploadPromises.length, 'file(s)...');
                    await Promise.all(uploadPromises);
                }
                console.log('📷 v7.0 Final URLs - photo:', recipientPhotoUrl, 'sig:', recipientSignatureUrl, 'officer:', officerSignatureUrl);

                // v7.1 - Preserve existing photo/signature URLs in edit mode
                if (isEdit) {
                    const existingRecord = state.registryData.find(r => r.receiptNo === state.editingReceiptNo);
                    if (existingRecord) {
                        if (!recipientPhotoUrl) recipientPhotoUrl = existingRecord.recipientPhotoUrl || null;
                        if (!recipientSignatureUrl) recipientSignatureUrl = existingRecord.recipientSignatureUrl || null;
                        if (!officerSignatureUrl) officerSignatureUrl = existingRecord.officerSignatureUrl || null;
                        console.log('📝 v7.1 Edit mode - preserved URLs from existing record');
                    }
                }

                // Save to Supabase
                const receiptData = {
                    receiptNo: state.formData.receiptNo,
                    receiptDate: state.formData.receiptDate,
                    foreignerName: state.formData.foreignerName,
                    snNumber: state.formData.snNumber,
                    requestNo: state.formData.requestNo,
                    appointmentNo: state.formData.appointmentNo,
                    apiPhotoUrl: state.formData._apiPhotoUrl || null,
                    isEdit: isEdit,
                    // v7.0 - Photo & Signature URLs
                    recipientPhotoUrl: recipientPhotoUrl,
                    recipientSignatureUrl: recipientSignatureUrl,
                    officerSignatureUrl: officerSignatureUrl,
                    // v8.5 - Card printer name
                    cardPrinterName: state.formData.cardPrinterName || null
                };

                // v8.5.2 — Card image already uploaded in parallel above
                receiptData.cardImage = cardImageUrl;
                await SupabaseAdapter.saveReceipt(receiptData);
                saved = true;

                // If this was from a pending receipt, mark it as used
                if (state.formData._pendingId && !isEdit) {
                    await markPendingAsUsed(state.formData._pendingId, state.formData.receiptNo);
                    state.formData._pendingId = null;
                    state.formData._apiPhotoUrl = null;
                }

            } catch (retryError) {
                console.warn(`⚠️ Save attempt ${attempt} failed:`, retryError.message);
                if (attempt === maxRetries) {
                    throw retryError; // All retries exhausted
                }
                // Small delay before retry to let other saves complete
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        // Show success message
        const savedReceiptNo = state.formData.receiptNo;
        const savedName = state.formData.foreignerName;

        // Clear form first
        clearForm(true);

        // Reload data from Supabase (filtered by current date)
        console.log('🔄 Reloading data from Supabase...');
        const reloadDate = state.currentDateFilter || getTodayISO();
        const freshData = await SupabaseAdapter.loadRegistry(reloadDate);
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
            isReceived: r.isReceived,
            // v7.0 - Photo & Signature
            recipientPhotoUrl: r.recipientPhotoUrl,
            recipientSignatureUrl: r.recipientSignatureUrl,
            officerSignatureUrl: r.officerSignatureUrl
        }));
        console.log(`✅ Loaded ${state.registryData.length} records for ${reloadDate}`);

        // Update UI
        loadPrintedReceipts();
        loadReceivedCards();
        renderRegistryTable();
        updateSummary();

        invalidateMonthlyCache();

        // Add activity and show message
        if (isEdit) {
            addActivity('edit', `แก้ไขข้อมูล ${savedReceiptNo}`, savedName);
            alert('อัพเดทข้อมูลเรียบร้อยแล้ว!');
        } else {
            addActivity('add', `เพิ่มข้อมูลใหม่ ${savedReceiptNo}`, savedName);
            alert('บันทึกข้อมูลเรียบร้อยแล้ว!');
        }
        UXAnalytics.trackJourney('save', { mode: isEdit ? 'edit' : 'add' });
        // Journey: first form add
        if (!isEdit && !state._journeyMilestones.hasFormAdd) {
            state._journeyMilestones.hasFormAdd = true;
            UXAnalytics.trackJourney('journey_form_add', { ms_since_start: Date.now() - state._journeyMilestones.startTime });
        }

    } catch (e) {
        console.error('Error saving data:', e);
        alert('เกิดข้อผิดพลาดในการบันทึก: ' + e.message);
        UXAnalytics.trackError('save_error', { message: e.message });
    } finally {
        elements.saveBtn.disabled = false;
        elements.saveBtn.textContent = state.formMode === 'edit' ? '💾 อัพเดทข้อมูล' : '💾 บันทึกข้อมูล';
    }
}

// ==================== //
// Delete Data (Supabase)
// ==================== //

async function deleteRecord(receiptNo) {
    // Only admin can delete
    if (state.currentUserRole !== 'admin') {
        alert('คุณไม่มีสิทธิ์ลบรายการ เฉพาะ Admin เท่านั้น');
        return;
    }

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
            invalidateMonthlyCache();
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
    UXAnalytics.trackFeature('print_single');
    trackJourneyPrint();
    updateFormState();

    if (!state.formData.receiptNo || !state.formData.foreignerName) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน (เลขรับที่ และ ชื่อ)');
        return;
    }

    const printContent = generatePrintContent();
    elements.printTemplate.innerHTML = printContent;
    renderBarcodes();

    // Store receipt info for confirmation
    const receiptNo = state.formData.receiptNo;
    const foreignerName = state.formData.foreignerName;

    // Use afterprint event for accurate timing (replaces setTimeout)
    const afterPrintHandler = () => {
        window.removeEventListener('afterprint', afterPrintHandler);
        if (confirm('พิมพ์ใบรับเรียบร้อยแล้วหรือไม่?')) {
            markAsPrinted(receiptNo);
            addActivity('print', `พิมพ์ใบรับ ${receiptNo}`, foreignerName);
        }
    };

    window.addEventListener('afterprint', afterPrintHandler);
    window.print();
}

function generatePrintContent() {
    // v7.0 - Delegate to generateSinglePrintContent with v7.0 fields
    // Resolve photo: from webcam capture (new) or saved URL (existing)
    const photoUrl = (typeof webcamState !== 'undefined' && webcamState.capturedPhoto) || null;
    // Resolve recipient signature: from signature pad (new) or saved (existing)
    let recipientSigUrl = null;
    if (typeof recipientSignaturePad !== 'undefined' && recipientSignaturePad && !recipientSignaturePad.isEmpty()) {
        recipientSigUrl = recipientSignaturePad.toDataURL('image/png');
    }

    const formDataForPrint = {
        ...state.formData,
        recipientPhotoUrl: photoUrl,
        recipientSignatureUrl: recipientSigUrl,
        officerSignatureUrl: cachedOfficerSignatureUrl || null,
        cardPrinterName: state.formData.cardPrinterName || null
    };

    return generateSinglePrintContent(formDataForPrint);
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
    let signed = 0;

    filteredData.forEach(row => {
        if (isPrinted(row.receiptNo)) printed++;
        if (isCardReceived(row.receiptNo)) received++;
        // v7.0 - Count signed (has photo + signature)
        if (row.recipientSignatureUrl && row.recipientPhotoUrl) signed++;
    });

    const pendingPrint = total - printed;
    const waiting = total - received;

    elements.summaryTotal.textContent = total;
    elements.summaryPrinted.textContent = printed;
    elements.summaryPendingPrint.textContent = pendingPrint;
    elements.summaryReceived.textContent = received;
    elements.summaryWaiting.textContent = waiting;

    // v8.5.2 — Color-coded summary numbers for quick status scanning
    elements.summaryPendingPrint.style.color = pendingPrint > 0 ? '#ea580c' : '';
    elements.summaryPendingPrint.style.fontWeight = pendingPrint > 0 ? '700' : '';
    elements.summaryWaiting.style.color = waiting > 0 ? '#ca8a04' : '';
    elements.summaryWaiting.style.fontWeight = waiting > 0 ? '700' : '';
    elements.summaryReceived.style.color = received > 0 ? '#16a34a' : '';
    elements.summaryPrinted.style.color = printed > 0 ? '#16a34a' : '';

    // v7.0 - Signed count
    const summarySigned = document.getElementById('summarySigned');
    if (summarySigned) summarySigned.textContent = signed;
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
    UXAnalytics.trackFeature('export_csv');
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
    UXAnalytics.trackFeature('export_pdf');
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
                <p style="color: #666; margin: 0;">${state.currentBranch?.name_th || 'ศูนย์บริการ EWP'}</p>
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
    // Cache key based on inputs that affect the result
    const cacheKey = JSON.stringify({
        dataLen: state.registryData.length,
        dataHash: state.registryData.length > 0 ? state.registryData[0].receiptNo + state.registryData[state.registryData.length - 1].receiptNo : '',
        search: state.searchQuery,
        filter: state.filterStatus,
        isSearchMode: state.isSearchMode,
        printedCount: state.printedReceipts.length,
        receivedCount: state.receivedCards.length
    });

    if (state._filteredDataCache && state._filteredDataCacheKey === cacheKey) {
        return state._filteredDataCache;
    }

    let data = [...state.registryData];

    // Only apply client-side search filter when NOT in server-side search mode
    // (In search mode, data is already filtered by Supabase)
    if (state.searchQuery && !state.isSearchMode) {
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

            // v7.0 - Check signed status
            const signed = !!(row.recipientSignatureUrl && row.recipientPhotoUrl);

            switch (state.filterStatus) {
                case 'printed': return printed;
                case 'not-printed': return !printed;
                case 'received': return received;
                case 'not-received': return !received;
                case 'signed': return signed;
                case 'not-signed': return !signed;
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

    // Cache result
    state._filteredDataCache = data;
    state._filteredDataCacheKey = cacheKey;

    return data;
}

// Invalidate filtered data cache (call when data changes)
function invalidateFilteredCache() {
    state._filteredDataCache = null;
    state._filteredDataCacheKey = null;
}

// ==================== //
// Data Loading (Supabase)
// ==================== //

async function loadRegistryData(date = null) {
    state.isLoading = true;
    state.isSearchMode = false;
    state.currentPage = 1;
    renderRegistryTable();

    // Use provided date, or state's current filter, or today
    const filterDate = date || state.currentDateFilter || getTodayISO();
    state.currentDateFilter = filterDate;

    // Update date picker UI
    if (elements.dateFilter) {
        elements.dateFilter.value = filterDate;
    }

    try {
        // Load from Supabase filtered by date
        const data = await SupabaseAdapter.loadRegistry(filterDate);
        state.registryData = data.map((row, index) => ({
            ...row,
            number: index + 1
        }));

        // Update printed/received arrays from loaded data
        loadPrintedReceipts();
        loadReceivedCards();

        console.log(`✅ Loaded ${state.registryData.length} records for ${filterDate}`);
    } catch (e) {
        console.error('Error loading from Supabase:', e);
        alert('ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อ');
        state.registryData = [];
    }

    state.isLoading = false;
    renderRegistryTable();
    updateSummary();

    // Generate next receipt number (only if viewing today)
    if (filterDate === getTodayISO() && !elements.receiptNo.value) {
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

// Helper: Get today's date in ISO format (YYYY-MM-DD)
function getTodayISO() {
    const today = new Date();
    return `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
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

    // Pagination calculation
    const totalRecords = filteredData.length;
    const totalPages = Math.ceil(totalRecords / state.pageSize) || 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;
    const startIndex = (state.currentPage - 1) * state.pageSize;
    const endIndex = Math.min(startIndex + state.pageSize, totalRecords);
    const pageData = filteredData.slice(startIndex, endIndex);

    if (filteredData.length === 0) {
        let emptyMessage = 'ไม่พบข้อมูล';
        if (state.isSearchMode) {
            emptyMessage = `ไม่พบผลลัพธ์สำหรับ "${sanitizeHTML(state.searchQuery)}"`;
        } else if (state.currentDateFilter) {
            const d = new Date(state.currentDateFilter + 'T00:00:00');
            const thaiDate = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;
            emptyMessage = `ไม่มีข้อมูลวันที่ ${thaiDate}`;
        }
        elements.registryBody.innerHTML = `
            <tr class="loading-row">
                <td colspan="10">${emptyMessage}</td>
            </tr>
        `;
        return;
    }

    elements.registryBody.innerHTML = pageData.map(row => {
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
            ? `<img src="${row.cardImage}" class="image-indicator" loading="lazy" onclick="viewImage('${row.receiptNo}')" title="คลิกเพื่อดูรูป">`
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

        // Category color for row indicator
        const rowCategoryInfo = getCategoryInfo(row.name);

        return `
            <tr class="${rowClass}">
                <td>${batchCheckbox}</td>
                <td style="border-left: 4px solid ${rowCategoryInfo.color}; font-weight: 600;">${row.number}</td>
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
                    <button class="btn btn-success btn-sm" onclick="printFromTable('${safeReceiptNo}')" title="พิมพ์ใบรับ">
                        🖨️
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="selectRow('${safeReceiptNo}')" title="แก้ไข">
                        ✏️
                    </button>
                    ${state.currentUserRole === 'admin' ? `<button class="btn btn-outline-danger btn-sm" onclick="deleteRecord('${safeReceiptNo}')" title="ลบ">
                        🗑️
                    </button>` : ''}
                </td>
            </tr>
        `;
    }).join('');

    updateBatchPrintUI();
    renderPagination(totalRecords, totalPages);
}

// ==================== //
// Pagination
// ==================== //

function renderPagination(totalRecords, totalPages) {
    const container = document.getElementById('registryPagination');
    if (!container) return;

    if (totalRecords === 0 || totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    const startRecord = (state.currentPage - 1) * state.pageSize + 1;
    const endRecord = Math.min(state.currentPage * state.pageSize, totalRecords);

    // Show up to 5 page buttons around current page
    let pagesHTML = '';
    const startPage = Math.max(1, state.currentPage - 2);
    const endPage = Math.min(totalPages, state.currentPage + 2);

    if (startPage > 1) {
        pagesHTML += `<button class="pagination-btn" onclick="goToPage(1)">1</button>`;
        if (startPage > 2) pagesHTML += `<span class="pagination-ellipsis">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        pagesHTML += `<button class="pagination-btn ${i === state.currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) pagesHTML += `<span class="pagination-ellipsis">...</span>`;
        pagesHTML += `<button class="pagination-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }

    container.innerHTML = `
        <div class="pagination-info">แสดง ${startRecord}-${endRecord} จาก ${totalRecords} รายการ</div>
        <div class="pagination-controls">
            <button class="pagination-btn" onclick="goToPage(${state.currentPage - 1})" ${state.currentPage <= 1 ? 'disabled' : ''}>&#8592; ก่อนหน้า</button>
            ${pagesHTML}
            <button class="pagination-btn" onclick="goToPage(${state.currentPage + 1})" ${state.currentPage >= totalPages ? 'disabled' : ''}>ถัดไป &#8594;</button>
        </div>
    `;
}

function goToPage(page) {
    if (page < 1) return;
    const filteredData = getFilteredData();
    const totalPages = Math.ceil(filteredData.length / state.pageSize) || 1;
    if (page > totalPages) return;
    state.currentPage = page;
    renderRegistryTable();
    document.getElementById('registryTable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.goToPage = goToPage;

function selectRow(receiptNo) {
    const rowData = state.registryData.find(r => r.receiptNo === receiptNo);
    if (rowData) {
        RecentReceipts.add(receiptNo, rowData.name);
        loadFromRegistry(rowData);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function viewImage(receiptNo) {
    const row = state.registryData.find(r => r.receiptNo === receiptNo);
    if (row && row.cardImage) {
        // Validate URL - only allow https and data:image URLs
        if (!/^(https:\/\/|data:image\/)/i.test(row.cardImage)) {
            alert('URL รูปภาพไม่ถูกต้อง');
            return;
        }
        // Prevent excessively large URLs (potential memory attack via data: URIs)
        if (row.cardImage.length > 10000000) {
            alert('ขนาดรูปภาพใหญ่เกินไป');
            return;
        }
        const safeReceiptNo = sanitizeHTML(receiptNo);
        const safeImageUrl = sanitizeHTML(row.cardImage);
        const win = window.open('', '_blank');
        win.document.write(`
            <html>
            <head><title>รูปบัตร - ${safeReceiptNo}</title></head>
            <body style="margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #333;">
                <img src="${safeImageUrl}" style="max-width: 90%; max-height: 90%;">
            </body>
            </html>
        `);
    }
}

/**
 * พิมพ์ใบรับจากตารางโดยตรง
 */
function printFromTable(receiptNo) {
    UXAnalytics.trackFeature('print_from_table');
    trackJourneyPrint();

    // v8.5.2 — Batch print hint after 3 single prints in session
    state.printFromTableCount++;
    if (state.printFromTableCount === 3 && !state.batchPrintHintShown) {
        state.batchPrintHintShown = true;
        setTimeout(() => {
            showToast('💡 Tip: เลือกหลายรายการจาก checkbox แล้วกด "พิมพ์ที่เลือก" เพื่อพิมพ์ครั้งเดียว', 'info', 5000);
        }, 1000);
    }
    const rowData = state.registryData.find(r => r.receiptNo === receiptNo);
    if (!rowData) return;

    // Save to recent receipts
    RecentReceipts.add(receiptNo, rowData.name);

    // Set form data from row
    state.formData = {
        receiptDate: '',
        receiptNo: rowData.receiptNo,
        foreignerName: rowData.name,
        snNumber: rowData.sn,
        requestNo: rowData.requestNo,
        appointmentNo: rowData.appointmentNo,
        cardImage: rowData.cardImage,
        cardPrinterName: rowData.cardPrinterName || null  // v8.5
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

    // v7.0 - Set photo/signature data for print
    if (typeof webcamState !== 'undefined') {
        webcamState.capturedPhoto = rowData.recipientPhotoUrl || null;
    }

    // Store receipt info for confirmation
    const printReceiptNo = state.formData.receiptNo;
    const printName = state.formData.foreignerName;

    // Generate print content with v7.0 + v8.5 data
    const formDataForPrint = {
        ...state.formData,
        recipientPhotoUrl: rowData.recipientPhotoUrl || null,
        recipientSignatureUrl: rowData.recipientSignatureUrl || null,
        officerSignatureUrl: rowData.officerSignatureUrl || cachedOfficerSignatureUrl || null,
        cardPrinterName: rowData.cardPrinterName || null  // v8.5
    };
    const printContent = generateSinglePrintContent(formDataForPrint);
    elements.printTemplate.innerHTML = printContent;
    renderBarcodes();
    // Use afterprint event for accurate timing (replaces setTimeout)
    const afterPrintHandler = () => {
        window.removeEventListener('afterprint', afterPrintHandler);
        if (confirm('พิมพ์ใบรับเรียบร้อยแล้วหรือไม่?')) {
            markAsPrinted(printReceiptNo);
            addActivity('print', `พิมพ์ใบรับ ${printReceiptNo}`, printName);
        }
    };

    window.addEventListener('afterprint', afterPrintHandler);
    window.print();
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

    // Cross-use: auto-fill from Card Print Lock when appointmentNo is entered
    if (elements.appointmentNo) {
        elements.appointmentNo.addEventListener('blur', async () => {
            const val = elements.appointmentNo.value.trim();
            if (!val || val.length < 3) return;
            // Only auto-fill if name/requestNo are empty (don't overwrite user input)
            if (elements.foreignerName.value.trim() && elements.requestNo.value.trim()) return;
            try {
                if (!window.SupabaseCardPrintLock) return;
                const lock = await window.SupabaseCardPrintLock.getByAppointment(val);
                if (lock) {
                    if (!elements.foreignerName.value.trim() && lock.foreigner_name) {
                        elements.foreignerName.value = lock.foreigner_name;
                    }
                    if (!elements.requestNo.value.trim() && lock.request_no) {
                        elements.requestNo.value = lock.request_no;
                    }
                    // v8.4 — auto-fill SN and card image from lock
                    if (!elements.snNumber.value.trim() && lock.sn_good) {
                        elements.snNumber.value = lock.sn_good;
                    }
                    if (!state.formData.cardImage && lock.card_image_url) {
                        state.formData.cardImage = lock.card_image_url;
                        if (elements.cardPreview) {
                            elements.cardPreview.src = lock.card_image_url;
                        }
                        if (elements.cardImageUpload) {
                            elements.cardImageUpload.classList.add('has-image');
                        }
                    }
                    // v8.5 — auto-fill card printer name from lock
                    if (lock.officer_name) {
                        state.formData.cardPrinterName = lock.officer_name;
                        if (elements.cardPrinterName) {
                            elements.cardPrinterName.value = lock.officer_name;
                        }
                    }
                    updateReceiptPreview();
                    showToast('ดึงข้อมูลจากระบบล็อกบัตรสำเร็จ', 'success');
                }
            } catch (e) {
                // Silent fail — auto-fill is optional
                console.log('Card lock lookup:', e.message);
            }
        });
    }

    elements.clearBtn.addEventListener('click', clearForm);
    elements.saveBtn.addEventListener('click', saveData);
    elements.printBtn.addEventListener('click', printReceipt);
    elements.refreshDataBtn.addEventListener('click', () => loadRegistryData());
    elements.addNewBtn.addEventListener('click', () => {
        clearForm(true); // Skip confirmation for "Add New" button
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    elements.summaryDate.addEventListener('change', updateSummary);
    elements.exportCsvBtn.addEventListener('click', (e) => { exportToCSV(); e.target.closest('.export-dropdown')?.classList.remove('open'); });
    elements.exportPdfBtn.addEventListener('click', (e) => { exportToPDF(); e.target.closest('.export-dropdown')?.classList.remove('open'); });

    // v8.5.2 — Close export dropdowns on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.export-dropdown')) {
            document.querySelectorAll('.export-dropdown.open').forEach(d => d.classList.remove('open'));
        }
    });

    // Date Filter
    if (elements.dateFilter) {
        elements.dateFilter.value = getTodayISO();
        elements.dateFilter.addEventListener('change', (e) => {
            const selectedDate = e.target.value;
            if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
                UXAnalytics.trackFeature('date_filter');
                // Clear search when changing date
                state.searchQuery = '';
                elements.searchInput.value = '';
                loadRegistryData(selectedDate);
            }
        });
    }

    // Today Button
    if (elements.todayBtn) {
        elements.todayBtn.addEventListener('click', () => {
            state.searchQuery = '';
            elements.searchInput.value = '';
            loadRegistryData(getTodayISO());
        });
    }

    // Barcode scan detection — rapid input + Enter bypasses debounce
    elements.searchInput.addEventListener('keydown', (e) => {
        const now = Date.now();

        if (e.key === 'Enter') {
            const timeSinceLastKey = now - state.barcodeScanLastKeyTime;
            const query = elements.searchInput.value.trim();

            // Barcode scanner pattern: rapid input (< 100ms between keys) + Enter + query ≥ 5 chars
            if (query.length >= 5 && timeSinceLastKey < 100) {
                e.preventDefault();
                if (state.searchDebounceTimer) {
                    clearTimeout(state.searchDebounceTimer);
                }

                state.searchQuery = query;
                state.isSearchMode = true;
                state.currentPage = 1;
                state.isLoading = true;
                renderRegistryTable();

                (async () => {
                    try {
                        const results = await SupabaseAdapter.searchRegistry(query);
                        state.registryData = results.map((row, index) => ({
                            ...row,
                            number: index + 1
                        }));
                        loadPrintedReceipts();
                        loadReceivedCards();
                        console.log(`📱 Barcode scan "${query}": ${state.registryData.length} results`);
                        UXAnalytics.trackFeature('barcode_scan', { result_count: state.registryData.length });
                    } catch (err) {
                        console.error('Barcode search error:', err);
                    }
                    state.isLoading = false;
                    renderRegistryTable();
                    updateSummary();
                })();

                return;
            }
        }

        // Track key timing for barcode detection
        state.barcodeScanLastKeyTime = now;
    });

    // Search — server-side with debounce (searches across ALL dates)
    elements.searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        state.searchQuery = query;
        state.currentPage = 1;

        // Clear previous debounce timer
        if (state.searchDebounceTimer) {
            clearTimeout(state.searchDebounceTimer);
        }

        if (query.length === 0) {
            // Empty search → go back to date-filtered view
            state.isSearchMode = false;
            loadRegistryData();
            return;
        }

        if (query.length < 2) {
            // Too short for server search → filter locally
            state.isSearchMode = false;
            renderRegistryTable();
            return;
        }

        // Debounce 400ms before server search
        state.searchDebounceTimer = setTimeout(async () => {
            state.isLoading = true;
            state.isSearchMode = true;
            renderRegistryTable();

            try {
                const results = await SupabaseAdapter.searchRegistry(query);
                state.registryData = results.map((row, index) => ({
                    ...row,
                    number: index + 1
                }));
                loadPrintedReceipts();
                loadReceivedCards();
                console.log(`🔍 Search "${query}": ${state.registryData.length} results (all dates)`);
                const qHash = await hashQuery(query.toLowerCase().trim());
                UXAnalytics.trackFeature('search', { query_length: query.length, result_count: state.registryData.length, query_hash: qHash });
                // Journey: first search
                if (!state._journeyMilestones.hasSearched) {
                    state._journeyMilestones.hasSearched = true;
                    UXAnalytics.trackJourney('journey_search', { ms_since_start: Date.now() - state._journeyMilestones.startTime });
                }
            } catch (e) {
                console.error('Error searching:', e);
                UXAnalytics.trackError('search_error', { message: e.message });
            }

            state.isLoading = false;
            renderRegistryTable();
            updateSummary();
        }, 400);
    });

    // Recent Receipts Dropdown
    const recentDropdown = document.getElementById('recentReceiptsDropdown');
    let recentActiveIndex = -1;

    function showRecentDropdown() {
        if (elements.searchInput.value.trim()) return; // Don't show when typing
        const recent = RecentReceipts.getRecent(5);
        if (recent.length === 0) return;

        recentActiveIndex = -1;
        recentDropdown.innerHTML = `
            <div class="recent-header">
                <span>ใบรับล่าสุด</span>
                <button onclick="RecentReceipts.clear(); hideRecentDropdown();">ล้าง</button>
            </div>
            ${recent.map((r, i) => `
                <div class="recent-item" data-index="${i}" data-receipt="${r.receiptNo}"
                     onmousedown="selectRecentReceipt('${r.receiptNo}')">
                    <span class="recent-name">${r.name}</span>
                    <span class="recent-no">${r.receiptNo}</span>
                </div>
            `).join('')}
        `;
        recentDropdown.style.display = 'block';
    }

    function hideRecentDropdown() {
        recentDropdown.style.display = 'none';
        recentActiveIndex = -1;
    }

    window.selectRecentReceipt = function(receiptNo) {
        elements.searchInput.value = receiptNo;
        hideRecentDropdown();
        elements.searchInput.dispatchEvent(new Event('input'));
    };

    elements.searchInput.addEventListener('focus', () => {
        if (!elements.searchInput.value.trim()) showRecentDropdown();
    });

    elements.searchInput.addEventListener('blur', () => {
        // Delay to allow click on dropdown item
        setTimeout(hideRecentDropdown, 200);
    });

    // Arrow keys navigation for recent dropdown
    elements.searchInput.addEventListener('keydown', (e) => {
        if (recentDropdown.style.display === 'none') return;
        const items = recentDropdown.querySelectorAll('.recent-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            recentActiveIndex = Math.min(recentActiveIndex + 1, items.length - 1);
            items.forEach((el, i) => el.classList.toggle('active', i === recentActiveIndex));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            recentActiveIndex = Math.max(recentActiveIndex - 1, 0);
            items.forEach((el, i) => el.classList.toggle('active', i === recentActiveIndex));
        } else if (e.key === 'Enter' && recentActiveIndex >= 0) {
            e.preventDefault();
            const selected = items[recentActiveIndex];
            if (selected) selectRecentReceipt(selected.dataset.receipt);
        } else if (e.key === 'Escape') {
            hideRecentDropdown();
        }
    });

    elements.filterStatus.addEventListener('change', (e) => {
        state.filterStatus = e.target.value;
        state.currentPage = 1;
        UXAnalytics.trackFeature('status_filter', { filter: e.target.value });
        renderRegistryTable();
    });

    // Batch Print
    if (elements.selectAllCheckbox) {
        elements.selectAllCheckbox.addEventListener('change', toggleSelectAll);
    }
    if (elements.batchPrintBtn) {
        elements.batchPrintBtn.addEventListener('click', batchPrint);
    }
    if (elements.selectNotPrintedBtn) {
        elements.selectNotPrintedBtn.addEventListener('click', selectAllNotPrinted);
    }

    // Ctrl+P shortcut: batch print when items selected
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'p' && state.selectedItems.length > 0) {
            e.preventDefault();
            batchPrint();
        }
    });

    // Monthly Report
    if (elements.generateReportBtn) {
        elements.generateReportBtn.addEventListener('click', generateMonthlyReport);
    }
    if (elements.exportMonthlyPdfBtn) {
        elements.exportMonthlyPdfBtn.addEventListener('click', (e) => { exportMonthlyPDF(); e.target.closest('.export-dropdown')?.classList.remove('open'); });
    }
    if (elements.exportMonthlyCsvBtn) {
        elements.exportMonthlyCsvBtn.addEventListener('click', (e) => { exportMonthlyCSV(); e.target.closest('.export-dropdown')?.classList.remove('open'); });
    }

    // Activity Log
    if (elements.activityFilter) {
        elements.activityFilter.addEventListener('change', () => {
            state.activityPage = 1;
            renderActivityLog();
        });
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
            UXAnalytics.trackJourney('tab_switch', { tab: targetTab });

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

    // Card Print Lock link — preserve env param
    const cardPrintBtn = document.getElementById('cardPrintBtn');
    if (cardPrintBtn && typeof getEnvParam === 'function') {
        const envParam = getEnvParam();
        if (envParam) {
            cardPrintBtn.href = 'card-print.html' + envParam;
        }
    }

    // Quick Print link — preserve env param
    const quickPrintBtn = document.getElementById('quickPrintBtn');
    if (quickPrintBtn && typeof getEnvParam === 'function') {
        const envParam = getEnvParam();
        const base = envParam ? 'index.html' + envParam + '&mode=quick-print' : 'index.html?mode=quick-print';
        quickPrintBtn.href = base;
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

    // v9.0: Load users with branch info, filter by branch for non-super-admin
    const filterBranchId = state.isSuperAdmin ? null : state.currentBranchId;
    const allUsers = await window.AuthSystem.getUsers(filterBranchId);
    const pendingUsers = allUsers.filter(u => u.is_approved === false);
    const approvedUsers = allUsers.filter(u => u.is_approved !== false);

    // v9.0: Branch role labels
    const branchRoleLabels = {
        head: 'หัวหน้าศูนย์',
        deputy: 'รองหัวหน้า',
        officer: 'เจ้าหน้าที่',
        temp_officer: 'เจ้าหน้าที่ชั่วคราว',
        other: 'อื่นๆ'
    };
    const roleLabels = {
        admin: 'Admin',
        manager: 'Manager',
        staff: 'Staff'
    };

    // v9.0: Branch filter dropdown for super admin
    const branchFilterHtml = state.isSuperAdmin ? `
        <div style="margin-bottom:12px; display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.85rem; white-space:nowrap;">กรองสาขา:</label>
            <select id="umBranchFilter" style="padding:4px 8px; border:1px solid #ddd; border-radius:4px; font-size:0.85rem; flex:1; max-width:300px;">
                <option value="">ทุกสาขา</option>
                ${state.branches.map(b => `<option value="${b.id}">${b.name_th} (${b.code})</option>`).join('')}
            </select>
        </div>
    ` : '';

    modalBody.innerHTML = `
        ${branchFilterHtml}
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
                ${state.isSuperAdmin ? '<button class="btn btn-primary btn-sm" onclick="showBranchManagement()" style="margin-left:8px;">🏢 จัดการสาขา</button>' : ''}
            </div>
            <div style="overflow-x:auto;">
            <table class="user-table">
                <thead>
                    <tr>
                        <th>ชื่อผู้ใช้</th>
                        <th>ชื่อ</th>
                        <th>สาขา</th>
                        <th>ตำแหน่ง</th>
                        <th>การดำเนินการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${approvedUsers.map(user => {
                        const safeUsername = sanitizeHTML(user.username || '-');
                        const safeName = sanitizeHTML(user.name || '-');
                        const safeId = sanitizeHTML(user.id);
                        const branchName = user.branches?.name_th || '-';
                        const branchCode = user.branches?.code || '';
                        const bRole = user.branch_role || user.role || 'officer';
                        const bRoleLabel = branchRoleLabels[bRole] || roleLabels[bRole] || bRole;
                        const superBadge = user.is_super_admin ? ' <span style="background:#dc2626;color:#fff;padding:1px 4px;border-radius:3px;font-size:10px;">SA</span>' : '';
                        return `
                        <tr>
                            <td>${safeUsername}</td>
                            <td>${safeName}${superBadge}</td>
                            <td style="font-size:0.85rem;">${sanitizeHTML(branchName)}<br><span style="color:#999; font-size:0.75rem;">${sanitizeHTML(branchCode)}</span></td>
                            <td><span class="role-badge ${bRole}">${bRoleLabel}</span></td>
                            <td>
                                <button class="btn btn-primary btn-sm" onclick="showEditUserForm('${safeId}')" title="แก้ไข">✏️</button>
                                <button class="btn btn-warning btn-sm" onclick="handleResetPassword('${safeId}')" title="Reset Password">🔑</button>
                                <button class="btn btn-outline-danger btn-sm" onclick="confirmDeleteUser('${safeId}')" title="ลบ">🗑️</button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
            </div>
        </div>

        <!-- Pending Users Tab -->
        <div id="pendingUsersTab" style="display: none;">
            ${pendingUsers.length === 0 ? '<p style="text-align: center; color: #6b7280; padding: 20px;">ไม่มีผู้ใช้รออนุมัติ</p>' : `
                <div style="overflow-x:auto;">
                <table class="user-table">
                    <thead>
                        <tr>
                            <th>อีเมล</th>
                            <th>ชื่อ</th>
                            <th>สาขาที่เลือก</th>
                            <th>วันที่สมัคร</th>
                            <th>การดำเนินการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pendingUsers.map(user => {
                            const safeUsername = sanitizeHTML(user.username || '-');
                            const safeName = sanitizeHTML(user.name || '-');
                            const safeId = sanitizeHTML(user.id);
                            const branchName = user.branches?.name_th || '-';
                            return `
                            <tr>
                                <td>${safeUsername}</td>
                                <td>${safeName}</td>
                                <td style="font-size:0.85rem;">${sanitizeHTML(branchName)}</td>
                                <td>${user.created_at ? new Date(user.created_at).toLocaleDateString('th-TH') : '-'}</td>
                                <td>
                                    <button class="btn btn-success btn-sm" onclick="handleApproveUser('${safeId}')" title="อนุมัติ">✅ อนุมัติ</button>
                                    <button class="btn btn-outline-danger btn-sm" onclick="handleRejectUser('${safeId}')" title="ปฏิเสธ">❌ ปฏิเสธ</button>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
                </div>
            `}
        </div>
    `;

    // v9.0: Branch filter event for super admin
    const umBranchFilter = document.getElementById('umBranchFilter');
    if (umBranchFilter) {
        umBranchFilter.addEventListener('change', async () => {
            const bId = umBranchFilter.value || null;
            const filteredUsers = await window.AuthSystem.getUsers(bId);
            // Re-render with filtered users — simplified: reload the whole modal
            showUserManagement();
        });
    }

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

async function showEditUserForm(userId) {
    const user = await window.AuthSystem.getUserById(userId);
    if (!user) {
        alert('ไม่พบข้อมูลผู้ใช้');
        return;
    }

    const modalBody = document.getElementById('userModalBody');
    const modalTitle = document.getElementById('userModalTitle');

    modalTitle.textContent = '✏️ แก้ไขผู้ใช้';

    // v9.0: Branch role options
    const branchRoles = [
        { value: 'head', label: 'หัวหน้าศูนย์ (Head)', perms: 'ทุกสิทธิ์ในสาขา + จัดการผู้ใช้' },
        { value: 'deputy', label: 'รองหัวหน้า (Deputy)', perms: 'สร้าง/แก้ไข/พิมพ์/Export + จัดการผู้ใช้' },
        { value: 'officer', label: 'เจ้าหน้าที่ (Officer)', perms: 'ดู/สร้าง/แก้ไข/พิมพ์' },
        { value: 'temp_officer', label: 'เจ้าหน้าที่ชั่วคราว (Temp)', perms: 'ดู/สร้าง/แก้ไข/พิมพ์' },
        { value: 'other', label: 'อื่นๆ (Other)', perms: 'ดูอย่างเดียว' }
    ];
    const currentBranchRole = user.branch_role || user.role || 'officer';

    // v9.0: Branch selector (super admin only)
    const branchSelectorHtml = state.isSuperAdmin ? `
        <div class="form-group">
            <label>สาขา</label>
            <select id="editBranch" class="filter-select">
                ${state.branches.map(b => `<option value="${b.id}" ${b.id === user.branch_id ? 'selected' : ''}>${b.name_th} (${b.code})</option>`).join('')}
            </select>
        </div>
    ` : '';

    // v9.0: Super admin toggle (super admin only, can't toggle self)
    const superAdminHtml = state.isSuperAdmin && user.id !== state.currentUserId ? `
        <div class="form-group" style="margin-top:8px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="editSuperAdmin" ${user.is_super_admin ? 'checked' : ''}>
                <span>Super Admin (เข้าถึงทุกสาขา)</span>
            </label>
        </div>
    ` : '';

    modalBody.innerHTML = `
        <form class="user-form" id="editUserForm">
            <div class="form-row">
                <div class="form-group">
                    <label>ชื่อผู้ใช้ (Username)</label>
                    <input type="text" id="editUsername" value="${sanitizeHTML(user.username)}" required>
                </div>
                <div class="form-group">
                    <label>รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)</label>
                    <input type="password" id="editPassword" placeholder="รหัสผ่านใหม่">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>ชื่อแสดง (Display Name)</label>
                    <input type="text" id="editName" value="${sanitizeHTML(user.name)}" required>
                </div>
                <div class="form-group">
                    <label>ตำแหน่ง (Branch Role)</label>
                    <select id="editBranchRole" class="filter-select">
                        ${branchRoles.map(r => `<option value="${r.value}" ${currentBranchRole === r.value ? 'selected' : ''}>${r.label}</option>`).join('')}
                    </select>
                    <div id="rolePermSummary" style="font-size:0.8rem; color:#666; margin-top:4px;"></div>
                </div>
            </div>
            <div class="form-row">
                ${branchSelectorHtml}
            </div>
            ${superAdminHtml}
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="showUserManagement()">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">💾 อัพเดท</button>
            </div>
        </form>
    `;

    // v9.0: Show permission summary on role change
    function updatePermSummary() {
        const sel = document.getElementById('editBranchRole');
        const summary = document.getElementById('rolePermSummary');
        if (sel && summary) {
            const role = branchRoles.find(r => r.value === sel.value);
            summary.textContent = role ? `สิทธิ์: ${role.perms}` : '';
        }
    }
    document.getElementById('editBranchRole')?.addEventListener('change', updatePermSummary);
    updatePermSummary();

    document.getElementById('editUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const updateData = {
            username: document.getElementById('editUsername').value,
            name: document.getElementById('editName').value,
            branch_role: document.getElementById('editBranchRole').value
        };

        // v9.0: Branch transfer (super admin)
        const editBranch = document.getElementById('editBranch');
        if (editBranch && editBranch.value !== user.branch_id) {
            updateData.branch_id = editBranch.value;
        }

        // v9.0: Super admin toggle
        const editSuperAdmin = document.getElementById('editSuperAdmin');
        if (editSuperAdmin) {
            updateData.is_super_admin = editSuperAdmin.checked;
        }

        const newPassword = document.getElementById('editPassword').value;
        if (newPassword) {
            updateData.password = newPassword;
        }

        const result = await window.AuthSystem.updateUser(userId, updateData);

        if (result.success) {
            alert('อัพเดทผู้ใช้สำเร็จ');
            showUserManagement();
        } else {
            alert(result.error);
        }
    });
}

// v9.0 — Branch Management UI (super admin only)
async function showBranchManagement() {
    const modalBody = document.getElementById('userModalBody');
    const modalTitle = document.getElementById('userModalTitle');

    modalTitle.textContent = '🏢 จัดการสาขา';

    const branches = await window.SupabaseBranches.getAll(true);
    const userCounts = await window.SupabaseBranches.getUserCounts();

    modalBody.innerHTML = `
        <div style="margin-bottom:15px; display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="showUserManagement()">← กลับไปจัดการผู้ใช้</button>
            <button class="btn btn-success btn-sm" onclick="showAddBranchForm()">➕ เพิ่มสาขาใหม่</button>
        </div>
        <div style="overflow-x:auto;">
        <table class="user-table" style="font-size:0.85rem;">
            <thead>
                <tr>
                    <th>รหัส</th>
                    <th>ชื่อสาขา (TH)</th>
                    <th>ชื่อสาขา (EN)</th>
                    <th>จำนวนผู้ใช้</th>
                    <th>Features</th>
                    <th>สถานะ</th>
                    <th>จัดการ</th>
                </tr>
            </thead>
            <tbody>
                ${branches.map(b => {
                    const count = userCounts[b.id] || 0;
                    const features = b.features || {};
                    const featureTags = Object.keys(features).filter(k => features[k]).map(k => `<span style="background:#dbeafe; color:#1e40af; padding:1px 4px; border-radius:3px; font-size:10px;">${k}</span>`).join(' ') || '<span style="color:#999;">-</span>';
                    return `
                    <tr style="${!b.is_active ? 'opacity:0.5;' : ''}">
                        <td style="font-family:monospace; font-size:0.8rem;">${sanitizeHTML(b.code)}</td>
                        <td>${sanitizeHTML(b.name_th)}</td>
                        <td style="font-size:0.8rem;">${sanitizeHTML(b.name_en)}</td>
                        <td style="text-align:center;">${count}</td>
                        <td>${featureTags}</td>
                        <td>${b.is_active ? '<span style="color:green;">เปิดใช้</span>' : '<span style="color:red;">ปิด</span>'}</td>
                        <td>
                            <button class="btn btn-primary btn-sm" onclick="showEditBranchForm('${b.id}')" title="แก้ไข">✏️</button>
                            ${b.is_active ?
                                `<button class="btn btn-outline-danger btn-sm" onclick="toggleBranchStatus('${b.id}', false)" title="ปิดใช้งาน">⏸️</button>` :
                                `<button class="btn btn-success btn-sm" onclick="toggleBranchStatus('${b.id}', true)" title="เปิดใช้งาน">▶️</button>`
                            }
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
        </div>
    `;
}

async function showEditBranchForm(branchId) {
    const branch = await window.SupabaseBranches.getById(branchId);
    if (!branch) { alert('ไม่พบข้อมูลสาขา'); return; }

    const modalBody = document.getElementById('userModalBody');
    const modalTitle = document.getElementById('userModalTitle');
    modalTitle.textContent = '✏️ แก้ไขสาขา';

    const features = branch.features || {};
    modalBody.innerHTML = `
        <form id="editBranchForm" class="user-form">
            <div class="form-row">
                <div class="form-group">
                    <label>รหัสสาขา</label>
                    <input type="text" value="${sanitizeHTML(branch.code)}" disabled style="background:#f3f4f6;">
                </div>
                <div class="form-group">
                    <label>จังหวัด</label>
                    <input type="text" id="editBranchProvince" value="${sanitizeHTML(branch.province_code || '')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>ชื่อสาขา (TH)</label>
                    <input type="text" id="editBranchNameTh" value="${sanitizeHTML(branch.name_th)}" required>
                </div>
                <div class="form-group">
                    <label>ชื่อสาขา (EN)</label>
                    <input type="text" id="editBranchNameEn" value="${sanitizeHTML(branch.name_en)}" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>ที่อยู่ (TH)</label>
                    <textarea id="editBranchAddrTh" rows="2">${sanitizeHTML(branch.address_th || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>ที่อยู่ (EN)</label>
                    <textarea id="editBranchAddrEn" rows="2">${sanitizeHTML(branch.address_en || '')}</textarea>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>ความจุ (ลูกค้า/วัน)</label>
                    <input type="number" id="editBranchCapacity" value="${branch.max_capacity || 160}">
                </div>
                <div class="form-group">
                    <label>ลำดับแสดง</label>
                    <input type="number" id="editBranchOrder" value="${branch.display_order || 0}">
                </div>
            </div>
            <div style="margin:12px 0; padding:12px; background:#f8fafc; border-radius:8px;">
                <label style="font-weight:600; margin-bottom:8px; display:block;">Feature Access</label>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer;">
                    <input type="checkbox" id="featureReceipt" ${features.receipt_module ? 'checked' : ''}>
                    <span>ระบบใบรับบัตร (Receipt Module)</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" id="featureCardPrint" ${features.card_print_lock ? 'checked' : ''}>
                    <span>ระบบจองพิมพ์บัตร (Card Print Lock)</span>
                </label>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="showBranchManagement()">ยกเลิก</button>
                <button type="submit" class="btn btn-primary">💾 อัพเดท</button>
            </div>
        </form>
    `;

    document.getElementById('editBranchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await window.SupabaseBranches.update(branchId, {
                province_code: document.getElementById('editBranchProvince').value,
                name_th: document.getElementById('editBranchNameTh').value,
                name_en: document.getElementById('editBranchNameEn').value,
                address_th: document.getElementById('editBranchAddrTh').value,
                address_en: document.getElementById('editBranchAddrEn').value,
                max_capacity: parseInt(document.getElementById('editBranchCapacity').value) || 160,
                display_order: parseInt(document.getElementById('editBranchOrder').value) || 0,
                features: {
                    receipt_module: document.getElementById('featureReceipt').checked,
                    card_print_lock: document.getElementById('featureCardPrint').checked
                }
            });
            alert('อัพเดทสาขาสำเร็จ');
            showBranchManagement();
        } catch (err) {
            alert('เกิดข้อผิดพลาด: ' + err.message);
        }
    });
}

async function showAddBranchForm() {
    const modalBody = document.getElementById('userModalBody');
    const modalTitle = document.getElementById('userModalTitle');
    modalTitle.textContent = '➕ เพิ่มสาขาใหม่';

    modalBody.innerHTML = `
        <form id="addBranchForm" class="user-form">
            <div class="form-row">
                <div class="form-group">
                    <label>รหัสสาขา (เช่น BKK-SC-M-001)</label>
                    <input type="text" id="addBranchCode" required placeholder="XXX-XX-X-XXX">
                </div>
                <div class="form-group">
                    <label>จังหวัด</label>
                    <input type="text" id="addBranchProvince" placeholder="BKK, CMI, ...">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>ชื่อสาขา (TH)</label>
                    <input type="text" id="addBranchNameTh" required>
                </div>
                <div class="form-group">
                    <label>ชื่อสาขา (EN)</label>
                    <input type="text" id="addBranchNameEn" required>
                </div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="showBranchManagement()">ยกเลิก</button>
                <button type="submit" class="btn btn-success">➕ สร้างสาขา</button>
            </div>
        </form>
    `;

    document.getElementById('addBranchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await window.SupabaseBranches.create({
                code: document.getElementById('addBranchCode').value,
                province_code: document.getElementById('addBranchProvince').value,
                name_th: document.getElementById('addBranchNameTh').value,
                name_en: document.getElementById('addBranchNameEn').value
            });
            alert('สร้างสาขาสำเร็จ');
            showBranchManagement();
        } catch (err) {
            alert('เกิดข้อผิดพลาด: ' + err.message);
        }
    });
}

async function toggleBranchStatus(branchId, activate) {
    const action = activate ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
    if (!confirm(`ต้องการ${action}สาขานี้หรือไม่?`)) return;

    try {
        if (activate) {
            await window.SupabaseBranches.reactivate(branchId);
        } else {
            await window.SupabaseBranches.deactivate(branchId);
        }
        showBranchManagement();
    } catch (err) {
        alert('เกิดข้อผิดพลาด: ' + err.message);
    }
}

async function confirmDeleteUser(userId) {
    const user = await window.AuthSystem.getUserById(userId);
    if (!user) {
        alert('ไม่พบข้อมูลผู้ใช้');
        return;
    }

    if (!confirm(`ต้องการลบผู้ใช้ "${user.name}" หรือไม่?`)) {
        return;
    }

    const result = await window.AuthSystem.deleteUser(userId);

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

async function handleResetPassword(userId) {
    const user = await window.AuthSystem.getUserById(userId);
    if (!user) {
        alert('ไม่พบข้อมูลผู้ใช้');
        return;
    }

    if (!confirm(`ต้องการส่ง email reset password ให้ "${user.name}" (${user.username}) หรือไม่?`)) {
        return;
    }

    const result = await window.AuthSystem.resetPassword(user.username);

    if (result.success) {
        alert(`ส่ง email reset password ไปที่ ${user.username} เรียบร้อยแล้ว\n\nผู้ใช้จะได้รับ link สำหรับตั้งรหัสผ่านใหม่ทาง email`);
    } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
    }
}

// Make functions globally accessible
window.showUserManagement = showUserManagement;
window.showAddUserForm = showAddUserForm;
window.showEditUserForm = showEditUserForm;
window.confirmDeleteUser = confirmDeleteUser;
window.handleResetPassword = handleResetPassword;
window.closeModal = closeModal;

// ==================== //
// Permission-based UI
// ==================== //

async function applyPermissions() {
    if (!window.AuthSystem) return;

    const session = await window.AuthSystem.getSession();
    if (!session) return;

    // Update user info display and store role in state
    state.currentUserRole = session.role || 'staff';
    state.currentUserId = session.userId || null;

    // v9.0 — Branch context
    state.currentBranchId = session.branchId || null;
    state.isSuperAdmin = session.isSuperAdmin || false;
    window._currentBranchId = state.currentBranchId;

    // Load branch info if available
    if (session.branchId && window.SupabaseBranches) {
        try {
            state.currentBranch = await window.SupabaseBranches.getById(session.branchId);
        } catch (e) {
            console.warn('Could not load branch info:', e);
        }
    }

    // Load all branches for super admin selector
    if (state.isSuperAdmin && window.SupabaseBranches) {
        try {
            state.branches = await window.SupabaseBranches.getAll(true);
        } catch (e) {
            console.warn('Could not load branches list:', e);
        }
    }

    // v9.0 — Dynamic center name
    const subtitleEl = document.querySelector('.subtitle');
    if (subtitleEl && state.currentBranch) {
        subtitleEl.textContent = state.currentBranch.name_th;
    }

    // v9.0 — Dynamic confirmation text in preview
    const confirmTh = document.querySelector('.confirmation-text-th');
    const confirmEn = document.querySelector('.confirmation-text-en');
    const footerOrg = document.querySelector('.footer-org');
    if (state.currentBranch) {
        if (confirmTh) {
            confirmTh.textContent = `ข้าพเจ้าตรวจความถูกต้องของใบอนุญาตทำงานแล้ว และยืนยันว่าได้รับใบอนุญาตทำงาน ณ ${state.currentBranch.name_th}`;
        }
        if (confirmEn) {
            confirmEn.textContent = `I have verified that all information on the work permit card is correct and confirm receipt at ${state.currentBranch.name_en}.`;
        }
        if (footerOrg) {
            footerOrg.textContent = state.currentBranch.name_th;
        }
    }

    const userNameEl = document.getElementById('currentUserName');
    const userRoleEl = document.getElementById('currentUserRole');
    if (userNameEl) userNameEl.textContent = session.name;
    if (userRoleEl) {
        const roleLabel = session.branchRole || session.role || 'staff';
        userRoleEl.textContent = roleLabel.toUpperCase();
    }

    // v9.0 — Feature access control: check if this branch has receipt_module
    const branchFeatures = state.currentBranch?.features || {};
    const hasReceiptModule = state.isSuperAdmin || branchFeatures.receipt_module === true;

    if (!hasReceiptModule) {
        // v9.0 — Redirect to landing page for branches without receipt_module
        const envParam = typeof getEnvParam === 'function' ? getEnvParam() : '';
        window.location.href = 'landing.html' + envParam;
        return;
    }

    // v9.0 — Super admin branch selector (header)
    if (state.isSuperAdmin && state.branches.length > 0) {
        renderBranchSelector();
    }

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
        const exportBtns = document.querySelectorAll('.export-dropdown');
        exportBtns.forEach(btn => btn.style.display = 'none');
    }

    // v8.5.2 — Manager onboarding (show once per browser)
    if (session.role === 'manager' && !localStorage.getItem('manager_onboarded')) {
        localStorage.setItem('manager_onboarded', '1');
        setTimeout(() => {
            showToast('👋 ยินดีต้อนรับ Manager! คุณสามารถดู Monthly Report และ Export ข้อมูลได้จากแถบ Reports', 'info', 6000);
            // Pulse animation on Reports tab
            const monthlyTab = document.getElementById('tabMonthlyReport');
            if (monthlyTab) {
                monthlyTab.style.animation = 'pulse 1s ease 3';
                setTimeout(() => { monthlyTab.style.animation = ''; }, 3000);
            }
        }, 2000);
    }

    // VP API integration disabled until migration is complete
    // await updatePendingBadge();

    // Hide delete buttons if no permission
    // Will be applied when rendering table
}

// v9.0 — Render branch selector for super admin
function renderBranchSelector() {
    if (document.getElementById('branchSelector')) return;

    // Place in header-left under subtitle for clear visibility
    const headerLeft = document.querySelector('.header-left');
    if (!headerLeft) return;

    const selectorHtml = `
        <div id="branchSelector" style="display:flex; align-items:center; gap:8px; margin-top:4px;">
            <span style="font-size:0.75rem; color:rgba(255,255,255,0.7);">📍 สาขา:</span>
            <select id="branchSelectorDropdown" style="padding:3px 8px; border:1px solid rgba(255,255,255,0.3); border-radius:6px; font-size:0.8rem; background:rgba(255,255,255,0.15); color:#fff; max-width:280px; cursor:pointer;">
                <option value="" style="color:#333;">🏢 สาขาของตนเอง</option>
                <option value="all" style="color:#333;">🌐 ทุกสาขา</option>
                ${state.branches.map(b => `<option value="${b.id}" style="color:#333;" ${b.id === state.currentBranchId ? 'selected' : ''}>${b.code} — ${b.name_th}</option>`).join('')}
            </select>
        </div>
    `;
    headerLeft.insertAdjacentHTML('beforeend', selectorHtml);

    document.getElementById('branchSelectorDropdown').addEventListener('change', async (e) => {
        const val = e.target.value;
        if (val === 'all') {
            state.viewingBranchId = null;
            window._viewingBranchId = null;
        } else if (val) {
            state.viewingBranchId = val;
            window._viewingBranchId = val;
        } else {
            state.viewingBranchId = state.currentBranchId;
            window._viewingBranchId = state.currentBranchId;
        }
        // Reload data with new branch context
        await loadData();
    });
}

// ==================== //
// VP Pending Receipts Integration
// ==================== //

// Fetch pending receipts from Supabase (status = 'pending')
async function fetchPendingReceipts() {
    const statusEl = document.getElementById('vpStatus');
    const infoEl = document.getElementById('pendingDataInfo');

    try {
        if (statusEl) statusEl.textContent = 'กำลังโหลด...';
        if (infoEl) infoEl.textContent = 'กำลังดึงข้อมูลจากระบบ VP...';

        const { data, error } = await window.supabaseClient
            .from('pending_receipts')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;

        state.pendingData = (data || []).map((row, index) => ({
            id: row.id,
            appointmentNo: row.appointment_no,
            requestNo: row.request_no,
            foreignerName: row.foreigner_name,
            apiPhotoUrl: row.api_photo_url,
            rawData: row.raw_data,
            createdAt: row.created_at
        }));

        state.pendingDataLoaded = true;

        if (statusEl) {
            statusEl.textContent = state.pendingData.length > 0 ? `✅ ${state.pendingData.length} รายการรอสร้างใบรับ` : '';
            statusEl.className = 'sheet-status success';
        }
        if (infoEl) infoEl.textContent = `พบข้อมูล ${state.pendingData.length} รายการที่รอสร้างใบรับบัตร`;

        return state.pendingData;
    } catch (error) {
        console.error('Error fetching pending receipts:', error);
        if (statusEl) {
            statusEl.textContent = '❌ โหลดไม่สำเร็จ';
            statusEl.className = 'sheet-status error';
        }
        if (infoEl) infoEl.textContent = `Error: ${error.message}`;
        return [];
    }
}

// Search pending data
function searchPendingData(query) {
    if (!query || !state.pendingData.length) return state.pendingData;

    const lowerQuery = query.toLowerCase().trim();

    return state.pendingData.filter(row =>
        (row.requestNo && row.requestNo.toLowerCase().includes(lowerQuery)) ||
        (row.appointmentNo && row.appointmentNo.toLowerCase().includes(lowerQuery)) ||
        (row.foreignerName && row.foreignerName.toLowerCase().includes(lowerQuery))
    );
}

// Render pending results in modal table
function renderPendingResults(data) {
    const tbody = document.getElementById('pendingResultsBody');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="no-results">ไม่พบข้อมูลที่รอสร้างใบรับบัตร</td></tr>`;
        return;
    }

    tbody.innerHTML = data.slice(0, 50).map((row, index) => {
        const safeId = sanitizeHTML(row.id.replace(/'/g, "\\'"));
        const safePhotoUrl = row.apiPhotoUrl && /^https?:\/\//i.test(row.apiPhotoUrl) ? sanitizeHTML(row.apiPhotoUrl) : '';
        const photoHtml = safePhotoUrl
            ? `<img src="${safePhotoUrl}" alt="photo" class="pending-photo-thumb" onerror="this.style.display='none'">`
            : '<span class="text-secondary">-</span>';
        const dateStr = row.createdAt ? new Date(row.createdAt).toLocaleDateString('th-TH') : '-';

        return `
            <tr data-pending-id="${sanitizeHTML(row.id)}">
                <td>${index + 1}</td>
                <td>${sanitizeHTML(row.foreignerName || '-')}</td>
                <td>${sanitizeHTML(row.requestNo || '-')}</td>
                <td>${sanitizeHTML(row.appointmentNo || '-')}</td>
                <td>${photoHtml}</td>
                <td>${dateStr}</td>
                <td>
                    <button type="button" class="btn btn-success btn-sm btn-select" onclick="selectPendingReceipt('${safeId}')">
                        ✓ เลือก
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (data.length > 50) {
        tbody.innerHTML += `<tr><td colspan="7" class="no-results">แสดง 50 รายการแรก (พบทั้งหมด ${data.length} รายการ)</td></tr>`;
    }
}

// Select a pending receipt and auto-fill the form
async function selectPendingReceipt(pendingId) {
    const row = state.pendingData.find(r => r.id === pendingId);
    if (!row) {
        alert('ไม่พบข้อมูล');
        return;
    }

    // Generate new receipt number
    try {
        const newReceiptNo = await SupabaseAdapter.getNextReceiptNo();
        elements.receiptNo.value = newReceiptNo;
        state.formData.receiptNo = newReceiptNo;
    } catch (e) {
        elements.receiptNo.value = generateNextReceiptNo(state.registryData);
    }

    // Fill form with selected data
    if (row.foreignerName) elements.foreignerName.value = row.foreignerName;
    if (row.requestNo) elements.requestNo.value = row.requestNo;
    if (row.appointmentNo) elements.appointmentNo.value = row.appointmentNo;

    // Set today's date
    elements.receiptDate.value = getTodayDateString();

    // Clear SN Number (will be filled manually later)
    elements.snNumber.value = '';

    // Store pending ID for marking as used after save
    state.formData._pendingId = pendingId;
    state.formData._apiPhotoUrl = row.apiPhotoUrl || null;

    // Update state
    state.formData.foreignerName = row.foreignerName || '';
    state.formData.requestNo = row.requestNo || '';
    state.formData.appointmentNo = row.appointmentNo || '';
    state.formData.receiptDate = getTodayDateString();
    state.formData.snNumber = '';

    // Update preview
    updateReceiptPreview();

    // Close modal
    closePendingModal();

    // Show success message
    showToast(`✅ เลือกข้อมูล: ${row.foreignerName}`);
}

// Update pending badge count
async function updatePendingBadge() {
    try {
        const { count, error } = await window.supabaseClient
            .from('pending_receipts')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending');

        if (error) throw error;

        const badge = document.getElementById('pendingBadge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (e) {
        console.log('Could not update pending badge:', e.message);
    }
}

// Mark pending receipt as used (called after successful save)
async function markPendingAsUsed(pendingId, receiptNo) {
    try {
        const { error } = await window.supabaseClient
            .from('pending_receipts')
            .update({
                status: 'used',
                used_receipt_no: receiptNo
            })
            .eq('id', pendingId);

        if (error) throw error;

        console.log(`✅ Pending receipt ${pendingId} marked as used (receipt: ${receiptNo})`);

        // Update badge
        await updatePendingBadge();

        // Remove from local state
        state.pendingData = state.pendingData.filter(r => r.id !== pendingId);
    } catch (e) {
        console.error('Error marking pending as used:', e);
    }
}

function showToast(message, type = 'success', duration = 2000) {
    // Toast notification with type support (v8.5.2)
    const colors = {
        success: '#22c55e',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${colors[type] || colors.success};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function openPendingModal() {
    const modal = document.getElementById('pendingModalOverlay');
    if (modal) {
        modal.style.display = 'flex';

        // Always reload data when opening
        fetchPendingReceipts().then(data => {
            renderPendingResults(data);
        });
    }
}

function closePendingModal() {
    const modal = document.getElementById('pendingModalOverlay');
    if (modal) {
        modal.style.display = 'none';
    }
}

function setupPendingImport() {
    const importBtn = document.getElementById('importFromVPBtn');
    const closeBtn = document.getElementById('closePendingModal');
    const searchBtn = document.getElementById('pendingSearchBtn');
    const refreshBtn = document.getElementById('pendingRefreshBtn');
    const searchInput = document.getElementById('pendingSearchInput');
    const modalOverlay = document.getElementById('pendingModalOverlay');

    if (importBtn) {
        importBtn.addEventListener('click', openPendingModal);
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closePendingModal);
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closePendingModal();
            }
        });
    }

    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', () => {
            const results = searchPendingData(searchInput.value);
            renderPendingResults(results);
        });
    }

    if (searchInput) {
        // Search on Enter key
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const results = searchPendingData(searchInput.value);
                renderPendingResults(results);
            }
        });

        // Live search with debounce
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const results = searchPendingData(searchInput.value);
                renderPendingResults(results);
            }, 300);
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            state.pendingDataLoaded = false;
            fetchPendingReceipts().then(data => {
                renderPendingResults(data);
            });
        });
    }

    // VP API integration disabled until migration is complete
    // setupPendingRealtime();
}

// Listen for new pending receipts in real-time
function setupPendingRealtime() {
    try {
        window.supabaseClient
            .channel('pending-receipts-changes')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'pending_receipts'
            }, (payload) => {
                console.log('🔔 New pending receipt:', payload.new.foreigner_name);
                updatePendingBadge();
                showToast(`🔔 ข้อมูลใหม่จาก VP: ${payload.new.foreigner_name || payload.new.appointment_no}`);
            })
            .subscribe();

        console.log('✅ Realtime subscription for pending_receipts active');
    } catch (e) {
        console.log('Realtime subscription not available:', e.message);
    }
}

// Make functions globally accessible
window.selectPendingReceipt = selectPendingReceipt;
window.openPendingModal = openPendingModal;
window.closePendingModal = closePendingModal;

// ==================== //
// Initialization (Supabase)
// ==================== //

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Work Permit Receipt System v8.1.0 (Supabase) initialized');

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
    setupPendingImport();

    // Apply role-based permissions first (sets state.currentUserRole before rendering)
    await applyPermissions();

    UXAnalytics.trackJourney('session_start', { role: state.currentUserRole });

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

    // v8.5.2 — Receipt number already generated by loadRegistryData() above
    // (line 2631 checks filterDate===today && empty receiptNo → calls getNextReceiptNo)
    // Only generate here as fallback if loadRegistryData didn't set it
    if (!elements.receiptNo.value) {
        try {
            const newReceiptNo = await SupabaseAdapter.getNextReceiptNo();
            elements.receiptNo.value = newReceiptNo;
            state.formData.receiptNo = newReceiptNo;
        } catch (e) {
            const fallbackNo = generateNextReceiptNo(state.registryData);
            elements.receiptNo.value = fallbackNo;
            state.formData.receiptNo = fallbackNo;
        }
    }

    state.formData.receiptDate = elements.receiptDate.value;
    setFormMode('add');

    elements.summaryDate.value = getTodayDateString();
    initMonthlyReportDropdowns();

    updateReceiptPreview();
    renderActivityLog();
    updateBatchPrintUI();

    // VP API integration disabled until migration is complete
    // setTimeout(() => {
    //     updatePendingBadge();
    // }, 1000);

    // v8.5.2 — Auto-refresh registry data every 60s for browse-only users
    setInterval(async () => {
        if (!state.isLoading && document.visibilityState === 'visible') {
            try {
                await loadRegistryData();
                console.log('🔄 Auto-refresh complete');
            } catch (e) {
                console.log('Auto-refresh failed:', e.message);
            }
        }
    }, 60000);

    console.log('✅ App initialized successfully');

    // Quick Print Mode: ?mode=quick-print
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'quick-print') {
        initQuickPrintMode();
    }

    // v7.0 - Initialize Photo & Signature modules (hidden until hardware testing)
    const webcamSection = document.getElementById('webcamSection');
    if (webcamSection && webcamSection.style.display !== 'none') {
        initWebcamModule();
        initRecipientSignaturePad();
        initOfficerSignatureModule();
    } else {
        console.log('ℹ️ v7.0 E-Sign modules disabled (hidden in production)');
    }
}

// ==================== //
// Quick Print Mode
// ==================== //

function initQuickPrintMode() {
    console.log('🚀 Quick Print Mode activated');
    UXAnalytics.trackFeature('quick_print_mode');

    // Hide sections not needed for quick print
    const formPanel = document.querySelector('.form-panel');
    const summaryPanel = document.querySelector('.summary-panel');
    const reportsSection = document.getElementById('reportsSection');

    if (formPanel) formPanel.style.display = 'none';
    if (summaryPanel) summaryPanel.style.display = 'none';
    if (reportsSection) reportsSection.style.display = 'none';

    // Make data-panel full width
    const dataPanel = document.querySelector('.data-panel');
    if (dataPanel) {
        dataPanel.style.gridColumn = '1 / -1';
        dataPanel.style.maxWidth = '100%';
    }

    // Make main-content single column
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.style.display = 'block';
    }

    // Simplify header for quick print
    const headerLeft = document.querySelector('.header-left');
    if (headerLeft) {
        headerLeft.querySelector('h1').textContent = 'พิมพ์ด่วน';
        headerLeft.querySelector('.subtitle').textContent = 'Quick Print Mode — EWP Service Center';
    }

    // Hide buttons not needed in quick print
    const addNewBtn = document.getElementById('addNewBtn');
    if (addNewBtn) addNewBtn.style.display = 'none';
    const quickPrintBtn = document.getElementById('quickPrintBtn');
    if (quickPrintBtn) quickPrintBtn.style.display = 'none';
    const officerSignatureBtn = document.getElementById('officerSignatureBtn');
    if (officerSignatureBtn) officerSignatureBtn.style.display = 'none';

    // Add "กลับหน้าเต็ม" link in header
    const headerRight = document.querySelector('.header-right');
    if (headerRight) {
        const envParam = (typeof getEnvParam === 'function') ? (getEnvParam() || '') : '';
        const fullModeLink = document.createElement('a');
        fullModeLink.href = 'index.html' + envParam;
        fullModeLink.className = 'btn btn-outline btn-sm';
        fullModeLink.textContent = '↩ หน้าเต็ม';
        headerRight.insertBefore(fullModeLink, headerRight.firstChild);
    }

    // Auto-focus search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        setTimeout(() => searchInput.focus(), 300);
    }

    // Update page title
    document.title = 'พิมพ์ด่วน — EWP Service Center';
}

// ==================== //
// v7.0 - Webcam Module (RAPOO C280)
// ==================== //

const webcamState = {
    stream: null,
    capturedPhoto: null, // base64 data URL
    selectedDeviceId: null
};

function initWebcamModule() {
    const startBtn = document.getElementById('startCameraBtn');
    const captureBtn = document.getElementById('capturePhotoBtn');
    const retakeBtn = document.getElementById('retakePhotoBtn');
    const cameraSelect = document.getElementById('cameraSelect');

    if (startBtn) startBtn.addEventListener('click', startWebcam);
    if (captureBtn) captureBtn.addEventListener('click', captureWebcamPhoto);
    if (retakeBtn) retakeBtn.addEventListener('click', retakeWebcamPhoto);
    if (cameraSelect) cameraSelect.addEventListener('change', (e) => {
        webcamState.selectedDeviceId = e.target.value;
        if (webcamState.stream) startWebcam();
    });

    console.log('📷 Webcam module initialized');
}

async function enumerateCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        const cameraSelect = document.getElementById('cameraSelect');
        if (!cameraSelect) return;

        cameraSelect.innerHTML = '';
        videoDevices.forEach((device, i) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Camera ${i + 1}`;
            cameraSelect.appendChild(option);
        });

        if (videoDevices.length > 1) {
            cameraSelect.style.display = '';
        }

        // Auto-select first camera
        if (videoDevices.length > 0 && !webcamState.selectedDeviceId) {
            webcamState.selectedDeviceId = videoDevices[0].deviceId;
        }
    } catch (e) {
        console.error('Error enumerating cameras:', e);
    }
}

async function startWebcam() {
    const video = document.getElementById('webcamVideo');
    const placeholder = document.getElementById('webcamPlaceholder');
    const preview = document.getElementById('webcamPreview');
    const startBtn = document.getElementById('startCameraBtn');
    const captureBtn = document.getElementById('capturePhotoBtn');
    const retakeBtn = document.getElementById('retakePhotoBtn');

    if (!video) return;

    // Stop existing stream
    stopWebcam();

    try {
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 960 },
                facingMode: 'user'
            }
        };

        if (webcamState.selectedDeviceId) {
            constraints.video.deviceId = { exact: webcamState.selectedDeviceId };
        }

        webcamState.stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = webcamState.stream;
        video.style.display = '';
        if (placeholder) placeholder.style.display = 'none';
        if (preview) preview.style.display = 'none';

        if (startBtn) startBtn.style.display = 'none';
        if (captureBtn) captureBtn.style.display = '';
        if (retakeBtn) retakeBtn.style.display = 'none';

        // Enumerate cameras after permission granted
        await enumerateCameras();

    } catch (e) {
        console.error('Error starting webcam:', e);
        if (e.name === 'NotAllowedError') {
            alert('ไม่ได้รับอนุญาตให้เข้าถึงกล้อง กรุณาอนุญาตในเบราว์เซอร์');
        } else if (e.name === 'NotFoundError') {
            alert('ไม่พบกล้อง กรุณาเสียบกล้อง USB แล้วลองใหม่');
        } else {
            alert('ไม่สามารถเปิดกล้องได้: ' + e.message);
        }
    }
}

function captureWebcamPhoto() {
    const video = document.getElementById('webcamVideo');
    const canvas = document.getElementById('webcamCanvas');
    const preview = document.getElementById('webcamPreview');
    const captureBtn = document.getElementById('capturePhotoBtn');
    const retakeBtn = document.getElementById('retakePhotoBtn');

    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Compress to JPEG
    const maxWidth = 1200;
    if (canvas.width > maxWidth) {
        const ratio = maxWidth / canvas.width;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = maxWidth;
        tempCanvas.height = canvas.height * ratio;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
        webcamState.capturedPhoto = tempCanvas.toDataURL('image/jpeg', 0.8);
    } else {
        webcamState.capturedPhoto = canvas.toDataURL('image/jpeg', 0.8);
    }

    // Show preview
    if (preview) {
        preview.src = webcamState.capturedPhoto;
        preview.style.display = '';
    }
    video.style.display = 'none';

    if (captureBtn) captureBtn.style.display = 'none';
    if (retakeBtn) retakeBtn.style.display = '';

    // Stop stream to free camera
    stopWebcam();

    // Update receipt preview
    updateRecipientPhotoPreview();
}

function retakeWebcamPhoto() {
    webcamState.capturedPhoto = null;
    const preview = document.getElementById('webcamPreview');
    if (preview) preview.style.display = 'none';

    updateRecipientPhotoPreview();
    startWebcam();
}

function stopWebcam() {
    if (webcamState.stream) {
        webcamState.stream.getTracks().forEach(track => track.stop());
        webcamState.stream = null;
    }
}

function updateRecipientPhotoPreview() {
    const previewPhotoBox = document.getElementById('previewPhotoBox');
    const previewPhoto = document.getElementById('previewRecipientPhoto');
    if (previewPhotoBox && previewPhoto) {
        if (webcamState.capturedPhoto) {
            previewPhoto.src = webcamState.capturedPhoto;
            previewPhotoBox.style.display = '';
        } else {
            previewPhoto.src = '';
            previewPhotoBox.style.display = 'none';
        }
    }
}

// ==================== //
// v7.0 - Recipient Signature Pad
// ==================== //

let recipientSignaturePad = null;

function initRecipientSignaturePad() {
    const canvas = document.getElementById('recipientSignatureCanvas');
    if (!canvas || typeof SignaturePad === 'undefined') {
        console.warn('SignaturePad library not loaded or canvas not found');
        return;
    }

    recipientSignaturePad = new SignaturePad(canvas, {
        penColor: '#000000',
        minWidth: 1.5,
        maxWidth: 3,
        backgroundColor: 'rgb(255, 255, 255)'
    });

    // Resize canvas to match CSS dimensions
    function resizeCanvas() {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        canvas.getContext('2d').scale(ratio, ratio);
        recipientSignaturePad.clear();
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Listen for signature changes to update preview
    canvas.addEventListener('pointerup', updateRecipientSignaturePreview);

    // Clear & Undo buttons
    const clearBtn = document.getElementById('clearSignatureBtn');
    const undoBtn = document.getElementById('undoSignatureBtn');
    if (clearBtn) clearBtn.addEventListener('click', () => {
        recipientSignaturePad.clear();
        updateRecipientSignaturePreview();
    });
    if (undoBtn) undoBtn.addEventListener('click', () => {
        const data = recipientSignaturePad.toData();
        if (data.length > 0) {
            data.pop();
            recipientSignaturePad.fromData(data);
            updateRecipientSignaturePreview();
        }
    });

    console.log('✍️ Recipient Signature Pad initialized');
}

function updateRecipientSignaturePreview() {
    const previewSig = document.getElementById('previewRecipientSignature');
    const previewLine = document.getElementById('previewSignatureLine');
    if (previewSig && recipientSignaturePad) {
        if (!recipientSignaturePad.isEmpty()) {
            previewSig.src = recipientSignaturePad.toDataURL('image/png');
            previewSig.style.display = '';
            if (previewLine) previewLine.style.display = 'none';
        } else {
            previewSig.style.display = 'none';
            if (previewLine) previewLine.style.display = '';
        }
    }
}

// ==================== //
// v7.0 - Officer Signature Module
// ==================== //

let officerSignaturePad = null;
let cachedOfficerSignatureUrl = null;

function initOfficerSignatureModule() {
    // Open modal button
    const openBtn = document.getElementById('officerSignatureBtn');
    const goToSetupBtn = document.getElementById('goToSignatureSetup');
    const closeBtn = document.getElementById('closeOfficerSignatureModal');
    const cancelBtn = document.getElementById('cancelOfficerSignatureBtn');
    const saveBtn = document.getElementById('saveOfficerSignatureBtn');
    const clearBtn = document.getElementById('clearOfficerSignatureBtn');
    const undoBtn = document.getElementById('undoOfficerSignatureBtn');

    if (openBtn) openBtn.addEventListener('click', openOfficerSignatureModal);
    if (goToSetupBtn) goToSetupBtn.addEventListener('click', openOfficerSignatureModal);
    if (closeBtn) closeBtn.addEventListener('click', closeOfficerSignatureModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeOfficerSignatureModal);
    if (saveBtn) saveBtn.addEventListener('click', saveOfficerSignature);
    if (clearBtn) clearBtn.addEventListener('click', () => officerSignaturePad && officerSignaturePad.clear());
    if (undoBtn) undoBtn.addEventListener('click', () => {
        if (officerSignaturePad) {
            const data = officerSignaturePad.toData();
            if (data.length > 0) {
                data.pop();
                officerSignaturePad.fromData(data);
            }
        }
    });

    // Load officer signature on init
    loadOfficerSignature();

    console.log('✍️ Officer Signature module initialized');
}

function openOfficerSignatureModal() {
    const overlay = document.getElementById('officerSignatureModalOverlay');
    if (overlay) overlay.style.display = 'flex';

    // Init signature pad in modal
    if (!officerSignaturePad) {
        const canvas = document.getElementById('officerSignatureCanvas');
        if (canvas && typeof SignaturePad !== 'undefined') {
            officerSignaturePad = new SignaturePad(canvas, {
                penColor: '#000000',
                minWidth: 1.5,
                maxWidth: 3,
                backgroundColor: 'rgb(255, 255, 255)'
            });
            const ratio = Math.max(window.devicePixelRatio || 1, 1);
            canvas.width = canvas.offsetWidth * ratio;
            canvas.height = canvas.offsetHeight * ratio;
            canvas.getContext('2d').scale(ratio, ratio);
        }
    }
    if (officerSignaturePad) officerSignaturePad.clear();

    // Show current signature if exists
    const currentSection = document.getElementById('currentSignatureSection');
    const currentImg = document.getElementById('currentOfficerSignature');
    if (cachedOfficerSignatureUrl && currentSection && currentImg) {
        currentImg.src = cachedOfficerSignatureUrl;
        currentSection.style.display = '';
    } else if (currentSection) {
        currentSection.style.display = 'none';
    }
}

function closeOfficerSignatureModal() {
    const overlay = document.getElementById('officerSignatureModalOverlay');
    if (overlay) overlay.style.display = 'none';
}

async function loadOfficerSignature() {
    try {
        const session = window.AuthSystem ? await window.AuthSystem.getSession() : null;
        if (!session || !session.userId) return;

        const signatureUrl = await SupabaseAdapter.getOfficerSignature(session.userId);
        cachedOfficerSignatureUrl = signatureUrl;

        const img = document.getElementById('officerSignatureImg');
        const placeholder = document.getElementById('officerSignaturePlaceholder');
        const previewOfficerSig = document.getElementById('previewOfficerSignature');
        const previewOfficerLine = document.getElementById('previewOfficerSignatureLine');

        if (signatureUrl) {
            if (img) { img.src = signatureUrl; img.style.display = ''; }
            if (placeholder) placeholder.style.display = 'none';
            if (previewOfficerSig) { previewOfficerSig.src = signatureUrl; previewOfficerSig.style.display = ''; }
            if (previewOfficerLine) previewOfficerLine.style.display = 'none';
        } else {
            if (img) img.style.display = 'none';
            if (placeholder) placeholder.style.display = '';
            if (previewOfficerSig) previewOfficerSig.style.display = 'none';
            if (previewOfficerLine) previewOfficerLine.style.display = '';
        }
    } catch (e) {
        console.error('Error loading officer signature:', e);
    }
}

async function saveOfficerSignature() {
    if (!officerSignaturePad || officerSignaturePad.isEmpty()) {
        alert('กรุณาเซ็นชื่อก่อนบันทึก');
        return;
    }

    const saveBtn = document.getElementById('saveOfficerSignatureBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ กำลังบันทึก...'; }

    try {
        const session = window.AuthSystem ? await window.AuthSystem.getSession() : null;
        if (!session || !session.userId) {
            alert('ไม่พบข้อมูลผู้ใช้ กรุณา login ใหม่');
            return;
        }

        const signatureData = officerSignaturePad.toDataURL('image/png');
        const signatureUrl = await SupabaseAdapter.saveOfficerSignature(session.userId, signatureData);
        cachedOfficerSignatureUrl = signatureUrl;

        // Update display
        await loadOfficerSignature();

        alert('บันทึกลายเซ็นเรียบร้อยแล้ว!');
        closeOfficerSignatureModal();
    } catch (e) {
        console.error('Error saving officer signature:', e);
        alert('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 บันทึกลายเซ็น'; }
    }
}

// ==================== //
// v7.0 - Clear form extension
// ==================== //

// Override clearForm to also clear webcam & signature
const _originalClearForm = clearForm;
// Wrapped in try-catch for safety — if clearForm doesn't exist yet, skip override
try {
    if (typeof clearForm === 'function') {
        // We'll extend clearForm by adding cleanup in the event listener below
    }
} catch (e) {}

function clearPhotoAndSignature() {
    // Clear webcam
    stopWebcam();
    webcamState.capturedPhoto = null;
    const webcamVideo = document.getElementById('webcamVideo');
    const webcamPreview = document.getElementById('webcamPreview');
    const webcamPlaceholder = document.getElementById('webcamPlaceholder');
    const startCameraBtn = document.getElementById('startCameraBtn');
    const capturePhotoBtn = document.getElementById('capturePhotoBtn');
    const retakePhotoBtn = document.getElementById('retakePhotoBtn');

    if (webcamVideo) webcamVideo.style.display = 'none';
    if (webcamPreview) webcamPreview.style.display = 'none';
    if (webcamPlaceholder) webcamPlaceholder.style.display = '';
    if (startCameraBtn) startCameraBtn.style.display = '';
    if (capturePhotoBtn) capturePhotoBtn.style.display = 'none';
    if (retakePhotoBtn) retakePhotoBtn.style.display = 'none';

    // Clear recipient signature
    if (recipientSignaturePad) recipientSignaturePad.clear();

    // Clear preview
    updateRecipientPhotoPreview();
    updateRecipientSignaturePreview();

    // Clear recipient photo/signature in receipt preview
    const previewPhotoBox = document.getElementById('previewPhotoBox');
    if (previewPhotoBox) previewPhotoBox.style.display = 'none';
    const previewRecipientPhoto = document.getElementById('previewRecipientPhoto');
    if (previewRecipientPhoto) previewRecipientPhoto.src = '';
}
