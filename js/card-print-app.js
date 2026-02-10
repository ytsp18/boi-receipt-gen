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
    realtimeChannel: null
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
    DOM.requestNoInput = document.getElementById('requestNoInput');
    DOM.passportInput = document.getElementById('passportInput');
    DOM.nameInput = document.getElementById('nameInput');
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
        DOM.currentUserRole.textContent = session.role || '';
        DOM.officerNameDisplay.textContent = session.name || session.email;
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

    // Clear duplicate warning when typing
    DOM.appointmentInput.addEventListener('input', () => {
        hideDuplicateWarning();
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
    DOM.lockBtn.textContent = 'กำลังล็อก...';

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

        // Insert lock
        const lockData = {
            appointment_id: appointmentId,
            request_no: DOM.requestNoInput.value.trim() || null,
            passport_no: DOM.passportInput.value.trim() || null,
            foreigner_name: DOM.nameInput.value.trim() || null,
            officer_id: state.currentUser.userId,
            officer_name: state.currentUser.name || state.currentUser.email,
            status: 'locked'
        };

        const result = await window.SupabaseCardPrintLock.create(lockData);

        // Success — clear form, show toast
        clearForm();
        showToast('ล็อกสำเร็จ: ' + appointmentId, 'success');

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
                    showToast('ซ้ำ! รายการนี้ถูกล็อกไปแล้ว', 'error');
                }
            } catch {
                showToast('ซ้ำ! รายการนี้ถูกล็อกไปแล้ว', 'error');
            }
        } else {
            console.error('Lock error:', err);
            showToast('เกิดข้อผิดพลาด: ' + (err.message || 'ลองอีกครั้ง'), 'error');
        }
    } finally {
        state.isSubmitting = false;
        DOM.lockBtn.disabled = false;
        DOM.lockBtn.textContent = 'ล็อก';
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
        DOM.locksTableBody.innerHTML = '<tr><td colspan="10" class="empty-state"><p>ยังไม่มีรายการล็อกวันนี้</p></td></tr>';
        return;
    }

    const currentUserId = state.currentUser?.userId;
    const html = state.locks.map((lock, i) => {
        const isOwn = lock.officer_id === currentUserId;
        const colorClass = getOfficerColor(lock.officer_name);
        const statusBadge = getStatusBadge(lock.status);

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
            if (isOwn && lock.status === 'locked') {
                actions.push(`<button class="btn-sn-add" onclick="startSNEdit('${lock.id}')">+ S/N</button>`);
            }
            if (isOwn && lock.status === 'printed') {
                actions.push(`<button class="btn-sn-add" onclick="startSNEdit('${lock.id}')">แก้ S/N</button>`);
            }
            // Admin can delete (unlock)
            if (state.currentUser?.role === 'admin') {
                actions.push(`<button class="btn-delete" onclick="deleteLock('${lock.id}', '${escapeHtml(lock.appointment_id)}')">ลบ</button>`);
            }
            actionCell = `<td>${actions.join(' ')}</td>`;
        }

        return `<tr class="${colorClass} ${isOwn ? 'own-row' : ''}">
            <td>${i + 1}</td>
            <td><strong>${escapeHtml(lock.appointment_id)}</strong></td>
            <td>${escapeHtml(lock.request_no || '-')}</td>
            <td>${escapeHtml(lock.passport_no || '-')}</td>
            <td>${escapeHtml(lock.foreigner_name || '-')}</td>
            <td>${escapeHtml(lock.officer_name)}</td>
            ${snGoodCell}
            ${snSpoiledCell}
            <td>${statusBadge}</td>
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

    state.realtimeChannel = window.supabaseClient
        .channel('card-print-locks-changes')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'card_print_locks'
        }, (payload) => {
            handleRealtimeInsert(payload.new);
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'card_print_locks'
        }, (payload) => {
            handleRealtimeUpdate(payload.new);
        })
        .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'card_print_locks'
        }, (payload) => {
            handleRealtimeDelete(payload.old);
        })
        .subscribe((status) => {
            console.log('Realtime subscription status:', status);
        });
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
        showToast(`${newLock.officer_name} ล็อก: ${newLock.appointment_id}`, 'info');
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

    let html = `<span class="stat-chip total">วันนี้: ${total} รายการ</span>`;

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
            return '<span class="status-badge status-locked">ล็อกแล้ว</span>';
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
        `ซ้ำ! <strong>${escapeHtml(existingLock.officer_name)}</strong> ล็อกเลขนัดหมาย ` +
        `<strong>${escapeHtml(existingLock.appointment_id)}</strong> ไปแล้ว` +
        (existingLock.sn_good ? ` (S/N: ${escapeHtml(existingLock.sn_good)})` : '');
    DOM.duplicateWarning.classList.add('show');
}

function hideDuplicateWarning() {
    DOM.duplicateWarning.classList.remove('show');
}

function clearForm() {
    DOM.appointmentInput.value = '';
    DOM.requestNoInput.value = '';
    DOM.passportInput.value = '';
    DOM.nameInput.value = '';
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
// Cleanup on page leave
// ==================== //
window.addEventListener('beforeunload', () => {
    if (state.realtimeChannel) {
        window.supabaseClient.removeChannel(state.realtimeChannel);
    }
});
