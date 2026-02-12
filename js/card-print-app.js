/**
 * Card Print Lock App
 * Replaces Google Sheet "บันทึกรายการห้ามซ้ำ V3"
 *
 * 3-Layer Lock Mechanism:
 * Layer 1: Optimistic UI check (local state)
 * Layer 2: DB UNIQUE constraint (error 23505)
 * Layer 3: Supabase Realtime subscription
 */

// ==================== //
// State
// ==================== //
const state = {
    locks: [],
    currentUser: null,
    isSubmitting: false,
    officerColorMap: {},
    colorIndex: 0,
    editingSNId: null,
    realtimeChannel: null,
    // Typing indicator state
    typingChannel: null,
    typingDebounce: null,
    othersTyping: {}, // { officerId: { name, appointmentId, timestamp } }
    // v9.0 — Branch context
    currentBranchId: null,
    currentBranch: null,
    isSuperAdmin: false
};

// Officer color palette (assigned dynamically)
const OFFICER_COLORS = [
    'officer-color-0', 'officer-color-1', 'officer-color-2',
    'officer-color-3', 'officer-color-4', 'officer-color-5',
    'officer-color-6', 'officer-color-7'
];

// ==================== //
// DOM Elements
// ==================== //
const DOM = {};

function cacheDOMElements() {
    DOM.lockForm = document.getElementById('lockForm');
    DOM.appointmentInput = document.getElementById('appointmentInput');
    DOM.lockBtn = document.getElementById('lockBtn');
    DOM.locksTableBody = document.getElementById('locksTableBody');
    DOM.duplicateWarning = document.getElementById('duplicateWarning');
    DOM.officerNameDisplay = document.getElementById('officerNameDisplay');
    DOM.statsBar = document.getElementById('statsBar');
    DOM.statTotal = document.getElementById('statTotal');
    DOM.toastContainer = document.getElementById('toastContainer');
    DOM.currentUserName = document.getElementById('currentUserName');
    DOM.currentUserRole = document.getElementById('currentUserRole');
    DOM.logoutBtn = document.getElementById('logoutBtn');
    DOM.backToMainBtn = document.getElementById('backToMainBtn');
}

// ==================== //
// Init
// ==================== //
document.addEventListener('DOMContentLoaded', async () => {
    cacheDOMElements();

    // Preserve env param in back link
    const envParam = typeof getEnvParam === 'function' ? getEnvParam() : '';
    if (envParam && DOM.backToMainBtn) {
        DOM.backToMainBtn.href = 'index.html' + envParam;
    }

    // Auth check
    try {
        if (typeof requireAuth === 'function') {
            await requireAuth();
        }

        const session = typeof getSession === 'function' ? await getSession() : null;
        if (!session) {
            window.location.href = 'login.html' + (envParam || '');
            return;
        }

        state.currentUser = session;
        DOM.currentUserName.textContent = session.name || session.email;
        DOM.currentUserRole.textContent = (session.branchRole || session.role || '').toUpperCase();
        DOM.officerNameDisplay.textContent = session.name || session.email;

        // v9.0 — Branch context
        state.currentBranchId = session.branchId || null;
        state.isSuperAdmin = session.isSuperAdmin || false;
        window._currentBranchId = state.currentBranchId;

        if (session.branchId && window.SupabaseBranches) {
            try {
                state.currentBranch = await window.SupabaseBranches.getById(session.branchId);
                // Dynamic page title
                const titleEl = document.querySelector('.page-title, h1');
                if (titleEl && state.currentBranch) {
                    titleEl.textContent = `จองคิวพิมพ์บัตร — ${state.currentBranch.name_th}`;
                }
            } catch (e) {
                console.warn('Could not load branch info:', e);
            }
        }
    } catch (e) {
        console.error('Auth error:', e);
        const envParam2 = typeof getEnvParam === 'function' ? getEnvParam() : '';
        window.location.href = 'login.html' + (envParam2 || '');
        return;
    }

    // Load today's locks
    await loadTodayLocks();

    // Setup event listeners
    setupEventListeners();

    // Setup Realtime subscription
    setupRealtime();

    // Setup Typing Broadcast (for other officers)
    setupTypingBroadcast();

    // Setup barcode scan detection
    setupBarcodeScan();

    // Auto-focus appointment input
    DOM.appointmentInput.focus();

    console.log('Card Print Lock app initialized');
});

// ==================== //
// Event Listeners
// ==================== //
function setupEventListeners() {
    // Lock form submit
    DOM.lockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleLock();
    });

    // Logout
    DOM.logoutBtn.addEventListener('click', async () => {
        try {
            if (window.SupabaseAuth) {
                await window.SupabaseAuth.logout();
            }
            const envParam = typeof getEnvParam === 'function' ? getEnvParam() : '';
            window.location.href = 'login.html' + (envParam || '');
        } catch (e) {
            console.error('Logout error:', e);
        }
    });

    // Keyboard shortcut: Ctrl+L to focus appointment input
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'l') {
            e.preventDefault();
            DOM.appointmentInput.focus();
            DOM.appointmentInput.select();
        }
    });

    // Clear duplicate warning when typing + send typing broadcast
    DOM.appointmentInput.addEventListener('input', () => {
        hideDuplicateWarning();
        // Debounced typing broadcast
        clearTimeout(state.typingDebounce);
        const val = DOM.appointmentInput.value.trim();
        if (val) {
            state.typingDebounce = setTimeout(() => sendTypingEvent(val), 500);
        } else {
            sendIdleEvent();
        }
        // Update own indicator (check for conflicts)
        updateTypingIndicator();
    });

    // Send idle when leaving input
    DOM.appointmentInput.addEventListener('blur', () => {
        clearTimeout(state.typingDebounce);
        sendIdleEvent();
    });
}

// ==================== //
// Barcode Scan Detection
// ==================== //
function setupBarcodeScan() {
    let scanBuffer = '';
    let scanTimeout = null;
    const SCAN_THRESHOLD_MS = 80;

    DOM.appointmentInput.addEventListener('keydown', (e) => {
        // If Enter is pressed and buffer has content, it might be a barcode scan
        if (e.key === 'Enter') {
            // Form submit handler will take care of it
            clearTimeout(scanTimeout);
            scanBuffer = '';
            return;
        }

        // Track rapid keystrokes (barcode scanner types very fast)
        if (e.key.length === 1) {
            clearTimeout(scanTimeout);
            scanBuffer += e.key;
            scanTimeout = setTimeout(() => {
                scanBuffer = '';
            }, SCAN_THRESHOLD_MS);
        }
    });
}

// ==================== //
// Core: Lock Appointment
// ==================== //
async function handleLock() {
    const appointmentId = DOM.appointmentInput.value.trim();
    if (!appointmentId) {
        showToast('กรุณากรอกเลขนัดหมาย', 'error');
        DOM.appointmentInput.focus();
        return;
    }

    if (state.isSubmitting) return;
    state.isSubmitting = true;
    DOM.lockBtn.disabled = true;
    DOM.lockBtn.textContent = 'กำลังจอง...';

    try {
        // Layer 1: Optimistic UI check
        const normalizedId = appointmentId.toLowerCase().trim();
        const existing = state.locks.find(l =>
            l.appointment_id.toLowerCase() === normalizedId
        );

        if (existing) {
            showDuplicateWarning(existing);
            return;
        }

        // Insert lock (v8.5: only appointment_id required, other fields filled via inline edit)
        const lockData = {
            appointment_id: appointmentId,
            request_no: null,
            passport_no: null,
            foreigner_name: null,
            officer_id: state.currentUser.userId,
            officer_name: state.currentUser.name || state.currentUser.email,
            status: 'locked'
        };

        const result = await window.SupabaseCardPrintLock.create(lockData);

        // Success — send idle event, clear form, show toast
        sendIdleEvent();
        clearForm();
        showToast('จองสำเร็จ: ' + appointmentId, 'success');

        // Add to local state (Realtime will also fire but this is faster)
        if (!state.locks.find(l => l.id === result.id)) {
            state.locks.push(result);
            renderLocksTable();
            updateStats();
        }

    } catch (err) {
        // Layer 2: DB UNIQUE constraint violation
        if (err.code === '23505') {
            // Fetch the existing lock to show who locked it
            try {
                const existing = await window.SupabaseCardPrintLock.getByAppointment(appointmentId);
                if (existing) {
                    showDuplicateWarning(existing);
                } else {
                    showToast('ซ้ำ! รายการนี้ถูกจองไปแล้ว', 'error');
                }
            } catch {
                showToast('ซ้ำ! รายการนี้ถูกจองไปแล้ว', 'error');
            }
        } else {
            console.error('Lock error:', err);
            showToast('เกิดข้อผิดพลาด: ' + (err.message || 'ลองอีกครั้ง'), 'error');
        }
    } finally {
        state.isSubmitting = false;
        DOM.lockBtn.disabled = false;
        DOM.lockBtn.textContent = 'จอง';
        DOM.appointmentInput.focus();
    }
}

// ==================== //
// Load Today's Locks
// ==================== //
async function loadTodayLocks() {
    try {
        state.locks = await window.SupabaseCardPrintLock.getToday();
        renderLocksTable();
        updateStats();
    } catch (e) {
        console.error('Error loading locks:', e);
        showToast('ไม่สามารถโหลดข้อมูลได้', 'error');
    }
}

// ==================== //
// Render Table
// ==================== //
function renderLocksTable() {
    if (state.locks.length === 0) {
        DOM.locksTableBody.innerHTML = '<tr><td colspan="12" class="empty-state"><p>ยังไม่มีรายการจองวันนี้</p></td></tr>';
        return;
    }

    const currentUserId = state.currentUser?.userId;
    const isAdmin = state.currentUser?.role === 'admin';
    const html = state.locks.map((lock, i) => {
        const isOwn = lock.officer_id === currentUserId;
        const canEdit = isOwn || isAdmin;
        const colorClass = getOfficerColor(lock.officer_name);
        const statusBadge = getStatusBadge(lock.status);

        // Card image column
        let imageCell;
        if (lock.card_image_url) {
            imageCell = `<td><img class="card-thumb" src="${escapeHtml(lock.card_image_url)}" onclick="showImagePreview('${escapeHtml(lock.card_image_url)}')" title="คลิกเพื่อดูขนาดเต็ม"></td>`;
        } else if (canEdit) {
            imageCell = `<td><button class="btn-upload-img" onclick="triggerImageUpload('${lock.id}')">📷 แนบรูป</button></td>`;
        } else {
            imageCell = `<td><span style="color:#9ca3af;font-size:0.72rem;">-</span></td>`;
        }

        // S/N columns
        let snGoodCell, snSpoiledCell, actionCell;

        if (state.editingSNId === lock.id) {
            // Editing mode
            snGoodCell = `<td><input type="text" class="sn-edit-input" id="snGoodEdit_${lock.id}" value="${escapeHtml(lock.sn_good || '')}" placeholder="S/N ดี" style="width:90px;padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:0.8rem;"></td>`;
            snSpoiledCell = `<td>
                <div class="sn-form-inline">
                    <input type="text" id="snSpoiledEdit_${lock.id}" value="${escapeHtml(lock.sn_spoiled || '')}" placeholder="S/N เสีย" style="width:80px;padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:0.8rem;">
                    <button class="btn-sn-save" onclick="saveSN('${lock.id}')">บันทึก</button>
                    <button class="btn-sn-add" onclick="cancelSNEdit()">ยกเลิก</button>
                </div>
            </td>`;
            actionCell = '<td></td>';
        } else {
            snGoodCell = `<td>${escapeHtml(lock.sn_good || '-')}</td>`;
            snSpoiledCell = `<td>${escapeHtml(lock.sn_spoiled || '-')}</td>`;

            const actions = [];
            if (canEdit && lock.status === 'locked') {
                actions.push(`<button class="btn-sn-add" onclick="startSNEdit('${lock.id}')">+ S/N</button>`);
            }
            if (canEdit && lock.status === 'printed') {
                actions.push(`<button class="btn-sn-add" onclick="startSNEdit('${lock.id}')">แก้ S/N</button>`);
            }
            // Admin can delete (unlock)
            if (state.currentUser?.role === 'admin') {
                actions.push(`<button class="btn-delete" onclick="deleteLock('${lock.id}', '${escapeHtml(lock.appointment_id)}')">ลบ</button>`);
            }
            actionCell = `<td>${actions.join(' ')}</td>`;
        }

        // Receipt column — show button or badge
        let receiptCell;
        if (lock.status === 'completed') {
            receiptCell = `<td><span class="receipt-badge">✅ สร้างแล้ว</span></td>`;
        } else if (lock.sn_good && lock.card_image_url && canEdit) {
            receiptCell = `<td><button class="btn-create-receipt" onclick="createReceiptFromLock('${lock.id}')">📄 สร้างใบรับ</button></td>`;
        } else if (canEdit) {
            const hints = [];
            if (!lock.sn_good) hints.push('รอ SN');
            if (!lock.card_image_url) hints.push('รอรูป');
            receiptCell = `<td><span class="receipt-pending-hint">${hints.join(', ')}</span></td>`;
        } else {
            receiptCell = `<td>-</td>`;
        }

        // v8.5 — inline editable cells for own rows (not completed)
        const editableCell = (field, value) => {
            const display = escapeHtml(value || '-');
            if (canEdit && lock.status !== 'completed') {
                return `<td><span class="inline-editable" onclick="startInlineEdit('${lock.id}','${field}', this)" title="คลิกเพื่อแก้ไข">${display}<span class="edit-hint"> ✏️</span></span></td>`;
            }
            return `<td>${display}</td>`;
        };

        return `<tr class="${colorClass} ${isOwn ? 'own-row' : ''}">
            <td>${i + 1}</td>
            <td><strong>${escapeHtml(lock.appointment_id)}</strong></td>
            ${editableCell('request_no', lock.request_no)}
            ${editableCell('passport_no', lock.passport_no)}
            ${editableCell('foreigner_name', lock.foreigner_name)}
            <td>${escapeHtml(lock.officer_name)}</td>
            ${imageCell}
            ${snGoodCell}
            ${snSpoiledCell}
            <td>${statusBadge}</td>
            ${receiptCell}
            ${actionCell}
        </tr>`;
    }).join('');

    DOM.locksTableBody.innerHTML = html;
}

// ==================== //
// S/N Edit
// ==================== //
function startSNEdit(lockId) {
    state.editingSNId = lockId;
    renderLocksTable();
    // Focus the good S/N input
    const input = document.getElementById(`snGoodEdit_${lockId}`);
    if (input) input.focus();
}

function cancelSNEdit() {
    state.editingSNId = null;
    renderLocksTable();
}

async function saveSN(lockId) {
    const snGood = document.getElementById(`snGoodEdit_${lockId}`)?.value.trim() || null;
    const snSpoiled = document.getElementById(`snSpoiledEdit_${lockId}`)?.value.trim() || null;

    if (!snGood && !snSpoiled) {
        showToast('กรุณากรอก S/N อย่างน้อย 1 ช่อง', 'error');
        return;
    }

    try {
        const updateData = {
            sn_good: snGood,
            sn_spoiled: snSpoiled
        };

        await window.SupabaseCardPrintLock.updateSN(lockId, updateData);

        // Update local state
        const lock = state.locks.find(l => l.id === lockId);
        if (lock) {
            lock.sn_good = snGood;
            lock.sn_spoiled = snSpoiled;
            lock.status = 'printed';
        }

        state.editingSNId = null;
        renderLocksTable();
        updateStats();
        showToast('บันทึก S/N สำเร็จ', 'success');
    } catch (e) {
        console.error('Error saving S/N:', e);
        showToast('เกิดข้อผิดพลาดในการบันทึก S/N', 'error');
    }
}

async function deleteLock(lockId, appointmentId) {
    if (!confirm(`ต้องการลบ (unlock) รายการ ${appointmentId} หรือไม่?`)) return;

    try {
        await window.SupabaseCardPrintLock.delete(lockId);
        state.locks = state.locks.filter(l => l.id !== lockId);
        renderLocksTable();
        updateStats();
        showToast('ลบรายการสำเร็จ', 'info');
    } catch (e) {
        console.error('Error deleting lock:', e);
        showToast('เกิดข้อผิดพลาดในการลบ', 'error');
    }
}

// Make functions globally accessible for onclick handlers
window.startSNEdit = startSNEdit;
window.cancelSNEdit = cancelSNEdit;
window.saveSN = saveSN;
window.deleteLock = deleteLock;

// ==================== //
// Realtime Subscription
// ==================== //
function setupRealtime() {
    if (!window.supabaseClient) return;

    // v9.0: Branch-scoped realtime filter
    const branchFilter = state.currentBranchId && !state.isSuperAdmin
        ? `branch_id=eq.${state.currentBranchId}`
        : undefined;

    state.realtimeChannel = window.supabaseClient
        .channel('card-print-locks-changes')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'card_print_locks',
            ...(branchFilter ? { filter: branchFilter } : {})
        }, (payload) => {
            handleRealtimeInsert(payload.new);
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'card_print_locks',
            ...(branchFilter ? { filter: branchFilter } : {})
        }, (payload) => {
            handleRealtimeUpdate(payload.new);
        })
        .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'card_print_locks',
            ...(branchFilter ? { filter: branchFilter } : {})
        }, (payload) => {
            handleRealtimeDelete(payload.old);
        })
        .subscribe((status) => {
            console.log('Realtime subscription status:', status);
        });
}

// ==================== //
// Typing Indicator (Realtime Broadcast)
// ==================== //
function setupTypingBroadcast() {
    if (!window.supabaseClient || !state.currentUser) return;

    state.typingChannel = window.supabaseClient
        .channel('card-print-typing')
        .on('broadcast', { event: 'typing' }, (payload) => {
            const data = payload.payload;
            // Ignore own events
            if (data.officerId === state.currentUser.userId) return;

            if (data.type === 'typing') {
                state.othersTyping[data.officerId] = {
                    name: data.officerName,
                    appointmentId: data.appointmentId,
                    timestamp: Date.now()
                };
            } else if (data.type === 'idle') {
                delete state.othersTyping[data.officerId];
            }
            updateTypingIndicator();
        })
        .subscribe((status) => {
            console.log('Typing broadcast channel:', status);
        });

    // Auto-cleanup stale typing entries every 5s
    setInterval(() => {
        const now = Date.now();
        let changed = false;
        Object.keys(state.othersTyping).forEach(id => {
            if (now - state.othersTyping[id].timestamp > 10000) {
                delete state.othersTyping[id];
                changed = true;
            }
        });
        if (changed) updateTypingIndicator();
    }, 5000);
}

function sendTypingEvent(appointmentId) {
    if (!state.typingChannel || !state.currentUser) return;
    state.typingChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
            type: 'typing',
            officerId: state.currentUser.userId,
            officerName: state.currentUser.name || state.currentUser.email,
            appointmentId: appointmentId
        }
    });
}

function sendIdleEvent() {
    if (!state.typingChannel || !state.currentUser) return;
    state.typingChannel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
            type: 'idle',
            officerId: state.currentUser.userId,
            officerName: state.currentUser.name || state.currentUser.email
        }
    });
}

function updateTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (!el) return;

    const typingList = Object.values(state.othersTyping);
    if (typingList.length === 0) {
        el.classList.remove('show', 'warning');
        el.innerHTML = '';
        return;
    }

    // Check if any typing appointment matches what current user is typing
    const myInput = DOM.appointmentInput?.value.trim().toLowerCase() || '';
    let hasConflict = false;

    const parts = typingList.map(t => {
        const isConflict = myInput && t.appointmentId.toLowerCase() === myInput;
        if (isConflict) hasConflict = true;
        const icon = isConflict ? '⚠️' : '🔵';
        const label = isConflict ? 'กำลังจองรายการเดียวกัน!' : 'กำลังทำรายการ';
        return `${icon} <strong>${t.name}</strong> ${label}: ${t.appointmentId}`;
    });

    el.innerHTML = parts.join(' &nbsp;|&nbsp; ');
    el.classList.add('show');
    el.classList.toggle('warning', hasConflict);
}

function handleRealtimeInsert(newLock) {
    // Skip if already in local state (from our own insert)
    if (state.locks.find(l => l.id === newLock.id)) return;

    // Only add if it's from today
    const today = new Date().toISOString().split('T')[0];
    if (newLock.lock_date !== today) return;

    state.locks.push(newLock);
    renderLocksTable();
    updateStats();

    // Show notification if it's from another officer
    if (newLock.officer_id !== state.currentUser?.userId) {
        showToast(`${newLock.officer_name} จอง: ${newLock.appointment_id}`, 'info');
    }
}

function handleRealtimeUpdate(updatedLock) {
    const idx = state.locks.findIndex(l => l.id === updatedLock.id);
    if (idx >= 0) {
        state.locks[idx] = updatedLock;
        renderLocksTable();
        updateStats();
    }
}

function handleRealtimeDelete(deletedLock) {
    state.locks = state.locks.filter(l => l.id !== deletedLock.id);
    renderLocksTable();
    updateStats();
}

// ==================== //
// Stats
// ==================== //
function updateStats() {
    const total = state.locks.length;
    const spoiledCount = state.locks.filter(l => l.sn_spoiled).length;

    // Count by officer
    const byOfficer = {};
    state.locks.forEach(l => {
        const name = l.officer_name || 'Unknown';
        byOfficer[name] = (byOfficer[name] || 0) + 1;
    });

    // Count own vs others
    const myName = state.currentUser?.name || state.currentUser?.email || '';
    const myCount = byOfficer[myName] || 0;
    const othersCount = total - myCount;

    let html = `<span class="stat-chip total">วันนี้: ${total} รายการ</span>`;
    if (myCount > 0) {
        html += `<span class="stat-chip own">ของฉัน: ${myCount}</span>`;
    }
    if (othersCount > 0) {
        html += `<span class="stat-chip pending-others">คนอื่น: ${othersCount}</span>`;
    }

    // Per-officer chips
    Object.entries(byOfficer)
        .sort((a, b) => b[1] - a[1])
        .forEach(([name, count]) => {
            html += `<span class="stat-chip">${name} (${count})</span>`;
        });

    if (spoiledCount > 0) {
        html += `<span class="stat-chip spoiled">บัตรเสีย: ${spoiledCount}</span>`;
    }

    DOM.statsBar.innerHTML = html;
}

// ==================== //
// UI Helpers
// ==================== //
function getOfficerColor(officerName) {
    if (!state.officerColorMap[officerName]) {
        state.officerColorMap[officerName] = OFFICER_COLORS[state.colorIndex % OFFICER_COLORS.length];
        state.colorIndex++;
    }
    return state.officerColorMap[officerName];
}

function getStatusBadge(status) {
    switch (status) {
        case 'locked':
            return '<span class="status-badge status-locked">จองแล้ว</span>';
        case 'printed':
            return '<span class="status-badge status-printed">พิมพ์บัตรแล้ว</span>';
        case 'completed':
            return '<span class="status-badge status-completed">เสร็จ</span>';
        default:
            return `<span class="status-badge">${escapeHtml(status)}</span>`;
    }
}

function showDuplicateWarning(existingLock) {
    DOM.duplicateWarning.innerHTML =
        `ซ้ำ! <strong>${escapeHtml(existingLock.officer_name)}</strong> จองเลขนัดหมาย ` +
        `<strong>${escapeHtml(existingLock.appointment_id)}</strong> ไปแล้ว` +
        (existingLock.sn_good ? ` (S/N: ${escapeHtml(existingLock.sn_good)})` : '');
    DOM.duplicateWarning.classList.add('show');
}

function hideDuplicateWarning() {
    DOM.duplicateWarning.classList.remove('show');
}

function clearForm() {
    DOM.appointmentInput.value = '';
    hideDuplicateWarning();
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    DOM.toastContainer.appendChild(toast);

    // Remove after animation
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ==================== //
// Image Upload (v8.4)
// ==================== //
let _pendingUploadLockId = null;

function triggerImageUpload(lockId) {
    _pendingUploadLockId = lockId;
    const fileInput = document.getElementById('cardImageFileInput');
    if (fileInput) {
        fileInput.value = '';
        fileInput.click();
    }
}

// Listen for file selection
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('cardImageFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file || !_pendingUploadLockId) return;
            await handleImageUpload(_pendingUploadLockId, file);
            _pendingUploadLockId = null;
        });
    }
});

async function handleImageUpload(lockId, file) {
    // Validate file
    if (!file.type.startsWith('image/')) {
        showToast('กรุณาเลือกไฟล์รูปภาพ', 'error');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showToast('ไฟล์ใหญ่เกินไป (สูงสุด 10MB)', 'error');
        return;
    }

    showToast('กำลัง upload รูป...', 'info');

    try {
        // Read + compress
        const base64 = await readFileAsBase64(file);
        const compressed = await compressImage(base64, 1200, 0.8);

        // Upload to Supabase Storage
        const lock = state.locks.find(l => l.id === lockId);
        const fileName = `card-lock-${lockId}`;
        const imageUrl = await uploadImageToSupabase(fileName, compressed);

        // Save URL to card_print_locks
        await window.SupabaseCardPrintLock.updateImage(lockId, imageUrl);

        // Update local state
        if (lock) {
            lock.card_image_url = imageUrl;
        }

        renderLocksTable();
        showToast('แนบรูปสำเร็จ', 'success');
    } catch (err) {
        console.error('Image upload error:', err);
        showToast('เกิดข้อผิดพลาดในการ upload รูป', 'error');
    }
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function compressImage(base64, maxWidth = 1200, quality = 0.8) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width;
            let h = img.height;

            if (w > maxWidth) {
                h = Math.round(h * maxWidth / w);
                w = maxWidth;
            }

            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = base64;
    });
}

function showImagePreview(url) {
    const overlay = document.getElementById('imgModalOverlay');
    const img = document.getElementById('imgModalImg');
    if (overlay && img) {
        img.src = url;
        overlay.classList.add('show');
    }
}

// ==================== //
// Create Receipt from Lock (v8.4)
// ==================== //
async function createReceiptFromLock(lockId) {
    const lock = state.locks.find(l => l.id === lockId);
    if (!lock) {
        showToast('ไม่พบข้อมูลรายการ', 'error');
        return;
    }

    // Validate prerequisites
    if (!lock.sn_good) {
        showToast('ยังไม่มี S/N บัตรดี กรุณากรอก S/N ก่อน', 'error');
        return;
    }
    if (!lock.card_image_url) {
        showToast('ยังไม่มีรูปบัตร กรุณาแนบรูปก่อน', 'error');
        return;
    }
    if (!lock.foreigner_name || !lock.foreigner_name.trim()) {
        showToast('กรุณากรอกชื่อผู้รับบัตรก่อน (คลิกที่ช่องชื่อในตาราง)', 'error');
        return;
    }

    // Check for existing receipt
    try {
        const existingReceipt = await window.SupabaseCardPrintLock.checkExistingReceipt(lock.appointment_id);
        if (existingReceipt) {
            showToast(`มีใบรับอยู่แล้ว: ${existingReceipt.receipt_no}`, 'error');
            return;
        }
    } catch (err) {
        console.error('Error checking existing receipt:', err);
    }

    if (!confirm(`สร้างใบรับสำหรับ ${lock.foreigner_name || lock.appointment_id}?\n\nS/N: ${lock.sn_good}\nเลขนัด: ${lock.appointment_id}`)) {
        return;
    }

    showToast('กำลังสร้างใบรับ...', 'info');

    try {
        // Generate receipt_no
        const receiptNo = await getNextReceiptNoFromSupabase();
        const today = new Date();
        const receiptDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

        // Build receipt data
        const receiptData = {
            receiptNo: receiptNo,
            receiptDate: receiptDate,
            foreignerName: lock.foreigner_name || '',
            snNumber: lock.sn_good,
            requestNo: lock.request_no || '',
            appointmentNo: lock.appointment_id,
            cardImage: lock.card_image_url,
            cardPrinterName: lock.officer_name || ''  // v8.5 - officer who printed the card
        };

        // Save receipt
        await saveReceiptToSupabase(receiptData);

        // Mark lock as completed
        await window.SupabaseCardPrintLock.complete(lockId);

        // Update local state
        lock.status = 'completed';
        renderLocksTable();
        updateStats();

        showToast(`สร้างใบรับสำเร็จ: ${receiptNo}`, 'success');
    } catch (err) {
        console.error('Error creating receipt:', err);
        showToast('เกิดข้อผิดพลาดในการสร้างใบรับ: ' + (err.message || ''), 'error');
    }
}

// ==================== //
// Inline Edit (v8.5)
// ==================== //
let _inlineEditCancelled = false;

function startInlineEdit(lockId, field, spanEl) {
    const lock = state.locks.find(l => l.id === lockId);
    if (!lock) return;

    _inlineEditCancelled = false;
    const currentValue = lock[field] || '';
    const placeholders = { request_no: 'เลขคำขอ', passport_no: 'Passport', foreigner_name: 'ชื่อ' };
    const placeholder = placeholders[field] || '';
    const td = spanEl.closest('td');

    td.innerHTML = `<input type="text" class="inline-edit-input" value="${escapeHtml(currentValue)}" placeholder="${placeholder}"
        onblur="saveInlineEdit('${lockId}','${field}', this.value)"
        onkeydown="if(event.key==='Enter'){this.blur();}if(event.key==='Escape'){cancelInlineEdit();}"
        >`;
    const input = td.querySelector('input');
    input.focus();
    input.select();
}

async function saveInlineEdit(lockId, field, newValue) {
    // Skip save if cancelled by Escape
    if (_inlineEditCancelled) return;

    const trimmed = newValue.trim() || null;
    const lock = state.locks.find(l => l.id === lockId);
    if (!lock) return;

    // Skip if unchanged
    if ((lock[field] || null) === trimmed) {
        renderLocksTable();
        return;
    }

    try {
        await window.SupabaseCardPrintLock.updateDetails(lockId, { [field]: trimmed });
        lock[field] = trimmed;
        renderLocksTable();
        showToast('บันทึกสำเร็จ', 'success');
    } catch (e) {
        console.error('Inline edit error:', e);
        showToast('ไม่สามารถบันทึกได้: ' + (e.message || ''), 'error');
        renderLocksTable();
    }
}

function cancelInlineEdit() {
    _inlineEditCancelled = true;
    renderLocksTable();
}

// Make new functions globally accessible
window.triggerImageUpload = triggerImageUpload;
window.showImagePreview = showImagePreview;
window.createReceiptFromLock = createReceiptFromLock;
window.startInlineEdit = startInlineEdit;
window.saveInlineEdit = saveInlineEdit;
window.cancelInlineEdit = cancelInlineEdit;

// ==================== //
// Cleanup on page leave
// ==================== //
window.addEventListener('beforeunload', () => {
    if (state.realtimeChannel) {
        window.supabaseClient.removeChannel(state.realtimeChannel);
    }
});
