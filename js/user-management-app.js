/**
 * User Management App — Full Page
 * Extracted from app-supabase.js v9.0.x (lines 3374-4111)
 * Refactored: modal → full page rendering
 *
 * Dependencies:
 * - window.AuthSystem (auth.js) — getSession, getUsers, getUserById, updateUser, approveUser, rejectUser, deleteUser, resetPassword, hasPermission
 * - window.SupabaseBranches (supabase-config.js) — getAll, getById, getUserCounts, create, update, reactivate, deactivate
 * - getEnvParam() (auth.js) — preserve env param
 * - window.supabaseClient — for RPC calls
 */

// ==================== //
// Utilities (local copy)
// ==================== //

function sanitizeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeHtmlAttribute(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;');
}

function showToast(message, type = 'success', duration = 2000) {
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

// ==================== //
// State
// ==================== //
const state = {
    currentUser: null,
    currentUserId: null,
    currentBranchId: null,
    isSuperAdmin: false,
    branches: [],
    currentTab: 'approved',
    filterBranchId: null,

    // v9.2: Search + Sort + Pagination
    searchQuery: '',
    searchDebounceTimer: null,
    sortColumn: 'name',
    sortDirection: 'asc',
    currentPage: 1,
    pageSize: 25,
    totalCount: 0,
    approvedCount: 0,
    pendingCount: 0,
    approvedUsers: [],
    pendingUsers: [],
    shellRendered: false,

    // v9.2: Filters + Bulk
    roleFilter: null,
    statusFilter: 'active',
    selectedUserIds: new Set(),

    // v9.2: Audit Log
    auditLogs: [],
    auditPage: 1,
    auditPageSize: 25,
    auditTotalCount: 0,
    auditFilterAction: null,
    auditFilterDateFrom: null,
    auditFilterDateTo: null
};

// ==================== //
// DOM Cache
// ==================== //
const DOM = {};

function cacheDOMElements() {
    DOM.umContent = document.getElementById('umContent');
    DOM.currentUserName = document.getElementById('currentUserName');
    DOM.currentUserRole = document.getElementById('currentUserRole');
    DOM.centerName = document.getElementById('centerName');
    DOM.logoutBtn = document.getElementById('logoutBtn');
    DOM.backToLandingBtn = document.getElementById('backToLandingBtn');
    DOM.toastContainer = document.getElementById('toastContainer');
}

// ==================== //
// Constants
// ==================== //
const BRANCH_ROLE_LABELS = {
    head: 'หัวหน้าศูนย์',
    deputy: 'รองหัวหน้า',
    officer: 'เจ้าหน้าที่',
    temp_officer: 'เจ้าหน้าที่ชั่วคราว',
    other: 'อื่นๆ'
};

const ROLE_LABELS = {
    admin: 'Admin',
    manager: 'Manager',
    staff: 'Staff'
};

const BRANCH_ROLES = [
    { value: 'head', label: 'หัวหน้าศูนย์ (Head)', perms: 'ทุกสิทธิ์ในสาขา + จัดการผู้ใช้' },
    { value: 'deputy', label: 'รองหัวหน้า (Deputy)', perms: 'สร้าง/แก้ไข/พิมพ์/Export + จัดการผู้ใช้' },
    { value: 'officer', label: 'เจ้าหน้าที่ (Officer)', perms: 'ดู/สร้าง/แก้ไข/พิมพ์' },
    { value: 'temp_officer', label: 'เจ้าหน้าที่ชั่วคราว (Temp)', perms: 'ดู/สร้าง/แก้ไข/พิมพ์' },
    { value: 'other', label: 'อื่นๆ (Other)', perms: 'ดูอย่างเดียว' }
];

// === Event Delegation Setup ===
function initEventDelegation() {
    const clickActions = {
        'export-users-csv':     ()   => exportUsersCsv(),
        'show-add-user-form':   ()   => showAddUserForm(),
        'switch-tab':           (el) => switchUserTab(el.dataset.tab),
        'switch-tab-and-show':  (el) => { switchUserTab(el.dataset.tab); showUserManagement(); },
        'show-branch-mgmt':     ()   => showBranchManagement(),
        'bulk-approve':         ()   => bulkApprove(),
        'bulk-role-change':     ()   => bulkRoleChange(),
        'bulk-deactivate':      ()   => bulkDeactivate(),
        'clear-selection':      ()   => clearSelection(),
        'handle-sort':          (el) => handleSort(el.dataset.column),
        'show-edit-user':       (el) => showEditUserForm(el.dataset.userId),
        'reset-password':       (el) => handleResetPassword(el.dataset.userId),
        'toggle-user-active':   (el) => toggleUserActive(el.dataset.userId, el.dataset.activate === 'true'),
        'approve-user':         (el) => handleApproveUser(el.dataset.userId),
        'reject-user':          (el) => handleRejectUser(el.dataset.userId),
        'go-to-um-page':        (el) => goToUmPage(Number(el.dataset.page)),
        'go-to-audit-page':     (el) => goToAuditPage(Number(el.dataset.page)),
        'copy-register-link':   ()   => copyRegisterLink(),
        'show-user-mgmt':       ()   => showUserManagement(),
        'show-add-branch':      ()   => showAddBranchForm(),
        'show-edit-branch':     (el) => showEditBranchForm(el.dataset.branchId),
        'toggle-branch-status': (el) => toggleBranchStatus(el.dataset.branchId, el.dataset.activate === 'true'),
    };

    const changeActions = {
        'toggle-select-all':     (el) => toggleSelectAll(el.checked),
        'toggle-user-selection': (el) => toggleUserSelection(el.dataset.userId, el.checked),
    };

    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        if (clickActions[target.dataset.action]) {
            clickActions[target.dataset.action](target, e);
        }
    });

    document.addEventListener('change', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        if (changeActions[target.dataset.action]) {
            changeActions[target.dataset.action](target, e);
        }
    });
}

// ==================== //
// Init
// ==================== //
document.addEventListener('DOMContentLoaded', async () => {
    cacheDOMElements();
    initEventDelegation();

    // Preserve env param in back link
    const envParam = typeof getEnvParam === 'function' ? getEnvParam() : '';
    if (envParam && DOM.backToLandingBtn) {
        DOM.backToLandingBtn.href = 'landing.html' + envParam;
    }

    // Auth check (requireAuth checks is_active + redirects deactivated users)
    try {
        if (typeof requireAuth === 'function') {
            const authOk = await requireAuth();
            if (!authOk) return;
        }

        const session = typeof getSession === 'function' ? await getSession() : null;
        if (!session) {
            window.location.href = 'login.html' + (envParam || '');
            return;
        }

        state.currentUser = session;
        state.currentUserId = session.userId;
        state.currentBranchId = session.branchId || null;
        state.isSuperAdmin = session.isSuperAdmin || false;

        // Check permission
        const hasUMPermission = await window.AuthSystem?.hasPermission('user_management');
        if (!state.isSuperAdmin && !hasUMPermission) {
            alert('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
            window.location.href = 'landing.html' + (envParam || '');
            return;
        }

        // Display user info
        DOM.currentUserName.textContent = session.name || session.email;
        DOM.currentUserRole.textContent = (session.branchRole || session.role || '').toUpperCase();

        // Load branch info for center name
        if (session.branchId && window.SupabaseBranches) {
            try {
                const branch = await window.SupabaseBranches.getById(session.branchId);
                if (branch && DOM.centerName) {
                    DOM.centerName.textContent = branch.name_th;
                }
            } catch (e) {
                console.warn('Could not load branch info:', e);
            }
        }

        // Load all branches (for dropdowns)
        if (window.SupabaseBranches) {
            try {
                state.branches = await window.SupabaseBranches.getAll(true) || [];
            } catch (e) {
                console.warn('Could not load branches:', e);
                state.branches = [];
            }
        }

        // Logout handler
        if (DOM.logoutBtn) {
            DOM.logoutBtn.addEventListener('click', () => {
                if (confirm('ต้องการออกจากระบบหรือไม่?')) {
                    window.AuthSystem.logout();
                }
            });
        }

        // Show hint on first visit
        if (!localStorage.getItem('user_mgmt_hint_shown')) {
            localStorage.setItem('user_mgmt_hint_shown', '1');
            setTimeout(() => {
                showToast('💡 กดที่ชื่อผู้ใช้เพื่อแก้ไข หรือใช้ปุ่มด้านขวาเพื่อจัดการ', 'info', 5000);
            }, 500);
        }

        // Initial render
        await showUserManagement();

    } catch (e) {
        console.error('Init error:', e);
        window.location.href = 'login.html' + (typeof getEnvParam === 'function' ? getEnvParam() : '');
    }
});

// ==================== //
// Main View — Shell + Data Loader (v9.2 refactored)
// ==================== //

async function showUserManagement() {
    state.currentTab = state.currentTab || 'approved';
    state.shellRendered = false;
    renderShell();
    await loadUsers();
}

function renderShell() {
    // Branch filter dropdown for super admin
    const branchFilterHtml = state.isSuperAdmin ? `
        <select id="umBranchFilter" class="um-filter-select">
            <option value="">ทุกสาขา</option>
            ${state.branches.filter(b => b.is_active).map(b => `<option value="${b.id}" ${state.filterBranchId === b.id ? 'selected' : ''}>${sanitizeHTML(b.code)} — ${sanitizeHTML(b.name_th)}</option>`).join('')}
        </select>
    ` : '';

    // Role filter
    const roleFilterHtml = `
        <select id="umRoleFilter" class="um-filter-select">
            <option value="">ตำแหน่ง: ทั้งหมด</option>
            ${BRANCH_ROLES.map(r => `<option value="${r.value}" ${state.roleFilter === r.value ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
    `;

    DOM.umContent.innerHTML = `
        <div class="um-section">
            <!-- Toolbar Row 1: Search + Branch Filter + Add User -->
            <div class="um-toolbar-row">
                <div class="um-search-group">
                    <input type="text" id="umSearchInput" class="um-search-input" placeholder="🔍 ค้นหาชื่อ / อีเมล..." value="${sanitizeHTML(state.searchQuery)}" autocomplete="off">
                </div>
                ${branchFilterHtml}
                ${roleFilterHtml}
                <button class="btn btn-outline btn-sm um-toolbar-row" data-action="export-users-csv">📥 ส่งออก CSV</button>
                <button class="btn btn-success btn-sm" data-action="show-add-user-form">➕ เพิ่มผู้ใช้</button>
            </div>

            <!-- Tabs -->
            <div class="um-tabs">
                <button class="btn ${state.currentTab === 'approved' ? 'btn-primary' : 'btn-outline'} btn-sm" id="tabApproved" data-action="switch-tab" data-tab="approved">
                    ✅ ผู้ใช้งาน (<span id="approvedCount">-</span>)
                </button>
                <button class="btn ${state.currentTab === 'pending' ? 'btn-primary' : 'btn-outline'} btn-sm" id="tabPending" data-action="switch-tab" data-tab="pending">
                    ⏳ รออนุมัติ (<span id="pendingCount">-</span>)
                </button>
                <button class="btn ${state.currentTab === 'audit' ? 'btn-primary' : 'btn-outline'} btn-sm" id="tabAudit" data-action="switch-tab" data-tab="audit">
                    📋 บันทึกกิจกรรม
                </button>
                ${state.isSuperAdmin ? `
                    <button class="btn ${state.currentTab === 'branches' ? 'btn-primary' : 'btn-outline'} btn-sm" id="tabBranches" data-action="show-branch-mgmt">
                        🏢 จัดการสาขา
                    </button>
                ` : ''}
            </div>

            <!-- Bulk Action Bar (hidden by default) -->
            <div class="um-bulk-bar" id="umBulkBar" style="display:none;">
                <span>☑ เลือก <b id="umSelectedCount">0</b> รายการ</span>
                <button class="btn btn-success btn-sm" id="bulkApproveBtn" data-action="bulk-approve" style="display:none;">✅ อนุมัติทั้งหมด</button>
                <button class="btn btn-primary btn-sm" id="bulkRoleBtn" data-action="bulk-role-change" style="display:none;">🏷️ เปลี่ยนตำแหน่ง</button>
                <button class="btn btn-warning btn-sm" id="bulkDeactivateBtn" data-action="bulk-deactivate" style="display:none;">⏸️ ระงับ</button>
                <button class="btn btn-outline btn-sm" data-action="clear-selection">✕ ยกเลิก</button>
            </div>

            <!-- Table Container -->
            <div id="umTableContainer">
                <div class="um-table-wrapper">
                    <table class="user-table" id="umTable">
                        <thead id="umTableHead"></thead>
                        <tbody id="umTableBody">
                            <tr><td colspan="6" style="text-align:center; color:#6b7280; padding:40px;">กำลังโหลด...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Pagination -->
            <div class="um-pagination-row" id="umPaginationRow">
                <div class="um-page-size">
                    แสดง <select id="umPageSize" class="um-filter-select um-filter-small">
                        ${[10, 25, 50].map(n => `<option value="${n}" ${state.pageSize === n ? 'selected' : ''}>${n}</option>`).join('')}
                    </select> รายการ
                </div>
                <div class="um-pagination" id="umPagination"></div>
                <div class="um-total-count" id="umTotalCount"></div>
            </div>

            <!-- Audit Log Container (hidden by default) -->
            <div id="umAuditContainer" style="display:none;"></div>
        </div>
    `;

    state.shellRendered = true;
    attachShellEvents();
}

function attachShellEvents() {
    // Search input
    const searchInput = document.getElementById('umSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(state.searchDebounceTimer);
            state.searchDebounceTimer = setTimeout(() => {
                state.searchQuery = e.target.value.trim();
                state.currentPage = 1;
                loadUsers();
            }, 300);
        });
    }

    // Branch filter
    const branchFilter = document.getElementById('umBranchFilter');
    if (branchFilter) {
        branchFilter.addEventListener('change', () => {
            state.filterBranchId = branchFilter.value || null;
            state.currentPage = 1;
            loadUsers();
        });
    }

    // Role filter
    const roleFilter = document.getElementById('umRoleFilter');
    if (roleFilter) {
        roleFilter.addEventListener('change', () => {
            state.roleFilter = roleFilter.value || null;
            state.currentPage = 1;
            loadUsers();
        });
    }

    // Page size
    const pageSize = document.getElementById('umPageSize');
    if (pageSize) {
        pageSize.addEventListener('change', () => {
            state.pageSize = parseInt(pageSize.value) || 25;
            state.currentPage = 1;
            loadUsers();
        });
    }
}

async function loadUsers() {
    const branchId = state.isSuperAdmin ? state.filterBranchId : state.currentBranchId;
    const isApproved = state.currentTab === 'approved' ? true : (state.currentTab === 'pending' ? false : undefined);

    // Build query options
    const opts = {
        branchId: branchId || undefined,
        search: state.searchQuery || undefined,
        sortColumn: state.sortColumn,
        sortDirection: state.sortDirection,
        page: state.currentPage,
        pageSize: state.pageSize,
        isApproved,
        roleFilter: (isApproved && state.roleFilter) ? state.roleFilter : undefined
    };

    const result = await window.AuthSystem.getUsers(opts);
    const users = result.data || [];
    const count = result.count || 0;

    if (state.currentTab === 'approved') {
        state.approvedUsers = users;
        state.approvedCount = count;
    } else if (state.currentTab === 'pending') {
        state.pendingUsers = users;
        state.pendingCount = count;
    }
    state.totalCount = count;

    // Also fetch opposite tab count for badge (lightweight query)
    await loadTabCounts(branchId);

    renderTableHead();
    renderUserTable();
    renderUmPagination();

    // Clear selection on data reload
    state.selectedUserIds.clear();
    updateBulkBar();
}

async function loadTabCounts(branchId) {
    try {
        // Get count for the tab we're NOT on (for badge)
        const otherTab = state.currentTab === 'approved' ? false : true;
        const countResult = await window.AuthSystem.getUsers({
            branchId: branchId || undefined,
            isApproved: otherTab,
            page: 1,
            pageSize: 1  // minimal fetch, we only need count
        });
        if (state.currentTab === 'approved') {
            state.pendingCount = countResult.count || 0;
        } else {
            state.approvedCount = countResult.count || 0;
        }
    } catch (e) {
        // non-critical
    }

    // Update tab badges
    const approvedCountEl = document.getElementById('approvedCount');
    const pendingCountEl = document.getElementById('pendingCount');
    if (approvedCountEl) approvedCountEl.textContent = state.approvedCount;
    if (pendingCountEl) pendingCountEl.textContent = state.pendingCount;
}

function renderTableHead() {
    const thead = document.getElementById('umTableHead');
    if (!thead) return;

    const sortIcon = (col) => {
        if (state.sortColumn !== col) return '';
        return state.sortDirection === 'asc' ? ' ▲' : ' ▼';
    };
    const sortCls = (col) => state.sortColumn === col ? 'um-sorted' : '';

    if (state.currentTab === 'approved') {
        thead.innerHTML = `<tr>
            <th class="um-th-check"><input type="checkbox" id="umSelectAll" data-action="toggle-select-all"></th>
            <th class="um-sortable-th ${sortCls('name')}" data-action="handle-sort" data-column="name">ชื่อ${sortIcon('name')}</th>
            <th class="um-sortable-th ${sortCls('branch')}" data-action="handle-sort" data-column="branch">สาขา${sortIcon('branch')}</th>
            <th class="um-sortable-th ${sortCls('role')}" data-action="handle-sort" data-column="role">ตำแหน่ง${sortIcon('role')}</th>
            <th class="um-sortable-th ${sortCls('created_at')}" data-action="handle-sort" data-column="created_at">วันที่สร้าง${sortIcon('created_at')}</th>
            <th>การดำเนินการ</th>
        </tr>`;
    } else if (state.currentTab === 'pending') {
        thead.innerHTML = `<tr>
            <th class="um-th-check"><input type="checkbox" id="umSelectAll" data-action="toggle-select-all"></th>
            <th>อีเมล</th>
            <th>ชื่อ</th>
            <th>สาขาที่เลือก</th>
            <th class="um-sortable-th ${sortCls('created_at')}" data-action="handle-sort" data-column="created_at">วันที่สมัคร${sortIcon('created_at')}</th>
            <th>การดำเนินการ</th>
        </tr>`;
    }
}

function renderUserTable() {
    const tbody = document.getElementById('umTableBody');
    if (!tbody) return;

    const users = state.currentTab === 'approved' ? state.approvedUsers : state.pendingUsers;

    if (users.length === 0) {
        const cols = state.currentTab === 'approved' ? 6 : 6;
        const msg = state.searchQuery ? 'ไม่พบผลลัพธ์' : (state.currentTab === 'approved' ? 'ไม่มีผู้ใช้งาน' : 'ไม่มีผู้ใช้รออนุมัติ');
        tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center; color:#6b7280; padding:30px;">${msg}</td></tr>`;
        return;
    }

    if (state.currentTab === 'approved') {
        tbody.innerHTML = users.map(user => {
            const safeId = escapeHtmlAttribute(user.id);
            const safeName = sanitizeHTML(user.name || '-');
            const safeEmail = sanitizeHTML(user.email || '-');
            const branchName = user.branches?.name_th || '-';
            const branchCode = user.branches?.code || '';
            const bRole = user.branch_role || user.role || 'officer';
            const bRoleLabel = BRANCH_ROLE_LABELS[bRole] || ROLE_LABELS[bRole] || bRole;
            const superBadge = user.is_super_admin ? ' <span class="sa-badge">SA</span>' : '';
            const isInactive = user.is_active === false;
            const rowClass = isInactive ? 'um-row-inactive' : '';
            const inactiveBadge = isInactive ? ' <span class="inactive-badge">ระงับ</span>' : '';
            const checked = state.selectedUserIds.has(user.id) ? 'checked' : '';
            const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString('th-TH') : '-';

            return `<tr class="${rowClass}">
                <td><input type="checkbox" class="um-user-check" data-user-id="${safeId}" ${checked} data-action="toggle-user-selection"></td>
                <td><span class="um-user-name" data-action="show-edit-user" data-user-id="${safeId}">${safeName}</span>${superBadge}${inactiveBadge}<br><span class="um-user-email">${safeEmail}</span></td>
                <td class="um-cell-branch">${sanitizeHTML(branchName)}<br><span class="um-branch-code">${sanitizeHTML(branchCode)}</span></td>
                <td><span class="role-badge ${bRole}">${bRoleLabel}</span></td>
                <td class="um-cell-date">${createdDate}</td>
                <td class="um-cell-actions">
                    <button class="btn btn-primary btn-sm" data-action="show-edit-user" data-user-id="${safeId}" title="แก้ไข">✏️</button>
                    <button class="btn btn-warning btn-sm" data-action="reset-password" data-user-id="${safeId}" title="Reset Password">🔑</button>
                    ${isInactive
                        ? `<button class="btn btn-success btn-sm" data-action="toggle-user-active" data-user-id="${safeId}" data-activate="true" title="เปิดใช้งาน">▶️</button>`
                        : `<button class="btn btn-outline-danger btn-sm" data-action="toggle-user-active" data-user-id="${safeId}" data-activate="false" title="ระงับ">⏸️</button>`
                    }
                </td>
            </tr>`;
        }).join('');
    } else if (state.currentTab === 'pending') {
        tbody.innerHTML = users.map(user => {
            const safeId = escapeHtmlAttribute(user.id);
            const safeName = sanitizeHTML(user.name || '-');
            const safeEmail = sanitizeHTML(user.email || '-');
            const branchName = user.branches?.name_th || '-';
            const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString('th-TH') : '-';
            const checked = state.selectedUserIds.has(user.id) ? 'checked' : '';

            return `<tr>
                <td><input type="checkbox" class="um-user-check" data-user-id="${safeId}" ${checked} data-action="toggle-user-selection"></td>
                <td>${safeEmail}</td>
                <td>${safeName}</td>
                <td class="um-cell-branch">${sanitizeHTML(branchName)}</td>
                <td class="um-cell-date">${createdDate}</td>
                <td class="um-cell-actions">
                    <button class="btn btn-success btn-sm" data-action="approve-user" data-user-id="${safeId}" title="อนุมัติ">✅ อนุมัติ</button>
                    <button class="btn btn-outline-danger btn-sm" data-action="reject-user" data-user-id="${safeId}" title="ปฏิเสธ">❌ ปฏิเสธ</button>
                </td>
            </tr>`;
        }).join('');
    }
}

function renderUmPagination() {
    const container = document.getElementById('umPagination');
    const totalEl = document.getElementById('umTotalCount');
    if (!container) return;

    const totalPages = Math.ceil(state.totalCount / state.pageSize);
    if (totalEl) totalEl.textContent = `รวม ${state.totalCount} รายการ`;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    // Prev button
    html += `<button class="btn btn-outline btn-sm" ${state.currentPage <= 1 ? 'disabled' : ''} data-action="go-to-um-page" data-page="${state.currentPage - 1}">◀</button>`;

    // Page numbers with ellipsis
    const maxShow = 5;
    let startPage = Math.max(1, state.currentPage - Math.floor(maxShow / 2));
    let endPage = Math.min(totalPages, startPage + maxShow - 1);
    if (endPage - startPage < maxShow - 1) startPage = Math.max(1, endPage - maxShow + 1);

    if (startPage > 1) {
        html += `<button class="btn btn-outline btn-sm" data-action="go-to-um-page" data-page="1">1</button>`;
        if (startPage > 2) html += `<span class="um-pagination-ellipsis">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="btn ${i === state.currentPage ? 'btn-primary' : 'btn-outline'} btn-sm" data-action="go-to-um-page" data-page="${i}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="um-pagination-ellipsis">...</span>`;
        html += `<button class="btn btn-outline btn-sm" data-action="go-to-um-page" data-page="${totalPages}">${totalPages}</button>`;
    }

    // Next button
    html += `<button class="btn btn-outline btn-sm" ${state.currentPage >= totalPages ? 'disabled' : ''} data-action="go-to-um-page" data-page="${state.currentPage + 1}">▶</button>`;

    container.innerHTML = html;
}

// ==================== //
// Search + Sort + Pagination Handlers
// ==================== //

function handleSort(column) {
    if (state.sortColumn === column) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortColumn = column;
        state.sortDirection = 'asc';
    }
    state.currentPage = 1;
    loadUsers();
}

function goToUmPage(page) {
    const totalPages = Math.ceil(state.totalCount / state.pageSize);
    if (page < 1 || page > totalPages) return;
    state.currentPage = page;
    loadUsers();
}

// ==================== //
// Tab Switching (v9.2 refactored)
// ==================== //

function switchUserTab(tab) {
    if (state.currentTab === tab) return;
    state.currentTab = tab;
    state.currentPage = 1;
    state.selectedUserIds.clear();

    // Update tab button styles
    ['tabApproved', 'tabPending', 'tabAudit', 'tabBranches'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) { btn.classList.remove('btn-primary'); btn.classList.add('btn-outline'); }
    });
    const tabMap = { approved: 'tabApproved', pending: 'tabPending', audit: 'tabAudit', branches: 'tabBranches' };
    const activeBtn = document.getElementById(tabMap[tab] || 'tabApproved');
    if (activeBtn) { activeBtn.classList.remove('btn-outline'); activeBtn.classList.add('btn-primary'); }

    // Show/hide UI sections based on tab
    const tableContainer = document.getElementById('umTableContainer');
    const paginationRow = document.getElementById('umPaginationRow');
    const bulkBar = document.getElementById('umBulkBar');
    const auditContainer = document.getElementById('umAuditContainer');

    if (tab === 'audit') {
        if (tableContainer) tableContainer.style.display = 'none';
        if (paginationRow) paginationRow.style.display = 'none';
        if (bulkBar) bulkBar.style.display = 'none';
        showAuditLog();
    } else {
        if (tableContainer) tableContainer.style.display = '';
        if (paginationRow) paginationRow.style.display = '';
        if (auditContainer) auditContainer.style.display = 'none';
        loadUsers();
    }
}

// ==================== //
// Bulk Selection
// ==================== //

function toggleSelectAll(checked) {
    const users = state.currentTab === 'approved' ? state.approvedUsers : state.pendingUsers;
    state.selectedUserIds.clear();
    if (checked) {
        users.forEach(u => state.selectedUserIds.add(u.id));
    }
    // Update all checkboxes
    document.querySelectorAll('.um-user-check').forEach(cb => { cb.checked = checked; });
    updateBulkBar();
}

function toggleUserSelection(userId, checked) {
    if (checked) {
        state.selectedUserIds.add(userId);
    } else {
        state.selectedUserIds.delete(userId);
    }
    // Update select-all checkbox
    const selectAll = document.getElementById('umSelectAll');
    const users = state.currentTab === 'approved' ? state.approvedUsers : state.pendingUsers;
    if (selectAll) selectAll.checked = state.selectedUserIds.size === users.length && users.length > 0;
    updateBulkBar();
}

function clearSelection() {
    state.selectedUserIds.clear();
    document.querySelectorAll('.um-user-check').forEach(cb => { cb.checked = false; });
    const selectAll = document.getElementById('umSelectAll');
    if (selectAll) selectAll.checked = false;
    updateBulkBar();
}

function updateBulkBar() {
    const bar = document.getElementById('umBulkBar');
    const countEl = document.getElementById('umSelectedCount');
    if (!bar) return;

    const count = state.selectedUserIds.size;
    if (count === 0) {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = 'flex';
    if (countEl) countEl.textContent = count;

    // Show/hide buttons based on tab
    const approveBtn = document.getElementById('bulkApproveBtn');
    const roleBtn = document.getElementById('bulkRoleBtn');
    const deactivateBtn = document.getElementById('bulkDeactivateBtn');
    if (approveBtn) approveBtn.style.display = state.currentTab === 'pending' ? '' : 'none';
    if (roleBtn) roleBtn.style.display = state.currentTab === 'approved' ? '' : 'none';
    if (deactivateBtn) deactivateBtn.style.display = state.currentTab === 'approved' ? '' : 'none';
}

// ==================== //
// Bulk Operations
// ==================== //

async function bulkApprove() {
    const ids = Array.from(state.selectedUserIds);
    if (ids.length === 0) return;
    if (!confirm(`ต้องการอนุมัติ ${ids.length} ผู้ใช้ที่เลือกหรือไม่?`)) return;

    let success = 0, fail = 0;
    for (const id of ids) {
        try {
            const result = await window.AuthSystem.approveUser(id);
            if (result.success) success++; else fail++;
        } catch (e) { fail++; }
    }
    showToast(`✅ อนุมัติสำเร็จ ${success}/${ids.length}${fail > 0 ? ` (ล้มเหลว ${fail})` : ''}`, fail > 0 ? 'warning' : 'success', 3000);
    try { await window.SupabaseActivityLog.add('user_bulk_approve', null, { user_ids: ids, count: success }); } catch (e) { console.warn('Audit log error:', e); }
    state.selectedUserIds.clear();
    await loadUsers();
}

async function bulkRoleChange() {
    const ids = Array.from(state.selectedUserIds);
    if (ids.length === 0) return;

    const roleOptions = BRANCH_ROLES.map(r => `<option value="${r.value}">${r.label}</option>`).join('');
    const role = prompt('เลือกตำแหน่งใหม่:\n' + BRANCH_ROLES.map(r => `${r.value} = ${r.label}`).join('\n'));
    if (!role || !BRANCH_ROLES.find(r => r.value === role)) {
        if (role !== null) alert('ตำแหน่งไม่ถูกต้อง กรุณาพิมพ์: head, deputy, officer, temp_officer, หรือ other');
        return;
    }
    if (!confirm(`ต้องการเปลี่ยนตำแหน่ง ${ids.length} ผู้ใช้เป็น "${BRANCH_ROLE_LABELS[role]}" หรือไม่?`)) return;

    let success = 0, fail = 0;
    for (const id of ids) {
        try {
            const result = await window.AuthSystem.updateUser(id, { branch_role: role });
            if (result.success) success++; else fail++;
        } catch (e) { fail++; }
    }
    showToast(`🏷️ เปลี่ยนตำแหน่งสำเร็จ ${success}/${ids.length}${fail > 0 ? ` (ล้มเหลว ${fail})` : ''}`, fail > 0 ? 'warning' : 'success', 3000);
    try { await window.SupabaseActivityLog.add('user_bulk_role_change', null, { user_ids: ids, new_role: role, count: success }); } catch (e) { console.warn('Audit log error:', e); }
    state.selectedUserIds.clear();
    await loadUsers();
}

async function bulkDeactivate() {
    const ids = Array.from(state.selectedUserIds);
    if (ids.length === 0) return;
    if (!confirm(`ต้องการระงับ ${ids.length} ผู้ใช้ที่เลือกหรือไม่?`)) return;

    let success = 0, fail = 0;
    for (const id of ids) {
        try {
            const result = await window.AuthSystem.updateUser(id, { is_active: false });
            if (result.success) success++; else fail++;
        } catch (e) { fail++; }
    }
    showToast(`⏸️ ระงับสำเร็จ ${success}/${ids.length}${fail > 0 ? ` (ล้มเหลว ${fail})` : ''}`, fail > 0 ? 'warning' : 'success', 3000);
    try { await window.SupabaseActivityLog.add('user_bulk_deactivate', null, { user_ids: ids, count: success }); } catch (e) { console.warn('Audit log error:', e); }
    state.selectedUserIds.clear();
    await loadUsers();
}

// ==================== //
// Deactivate / Reactivate Single User
// ==================== //

async function toggleUserActive(userId, activate) {
    const action = activate ? 'เปิดใช้งาน' : 'ระงับ';
    if (!confirm(`ต้องการ${action}ผู้ใช้นี้หรือไม่?`)) return;

    try {
        const user = await window.AuthSystem.getUserById(userId);
        const result = await window.AuthSystem.updateUser(userId, { is_active: activate });
        if (result.success) {
            showToast(`✅ ${action}ผู้ใช้สำเร็จ`, 'success');
            const auditAction = activate ? 'user_reactivate' : 'user_deactivate';
            try { await window.SupabaseActivityLog.add(auditAction, null, { target_user_id: userId, target_name: user?.name || '-' }); } catch (e) { console.warn('Audit log error:', e); }
            await loadUsers();
        } else {
            alert('เกิดข้อผิดพลาด: ' + (result.error || 'Unknown'));
        }
    } catch (e) {
        alert('เกิดข้อผิดพลาด: ' + e.message);
    }
}

// ==================== //
// Export User List CSV
// ==================== //

async function exportUsersCsv() {
    showToast('📥 กำลังเตรียมไฟล์...', 'info', 2000);

    // Fetch all matching users (no pagination) for export
    const branchId = state.isSuperAdmin ? state.filterBranchId : state.currentBranchId;
    const opts = {
        branchId: branchId || undefined,
        search: state.searchQuery || undefined,
        isApproved: state.currentTab === 'approved' ? true : false,
        roleFilter: state.roleFilter || undefined,
        sortColumn: state.sortColumn,
        sortDirection: state.sortDirection
        // NO page/pageSize = fetch ALL
    };
    const result = await window.AuthSystem.getUsers(opts);
    const users = result.data || [];

    if (users.length === 0) {
        alert('ไม่มีข้อมูลสำหรับ export');
        return;
    }

    const headers = ['ชื่อ', 'อีเมล', 'สาขา', 'รหัสสาขา', 'ตำแหน่ง', 'สถานะ', 'Super Admin', 'วันที่สร้าง'];
    const rows = users.map(u => [
        u.name || '-',
        u.email || '-',
        u.branches?.name_th || '-',
        u.branches?.code || '-',
        BRANCH_ROLE_LABELS[u.branch_role] || u.branch_role || '-',
        u.is_active === false ? 'ระงับ' : 'เปิดใช้งาน',
        u.is_super_admin ? 'ใช่' : '-',
        u.created_at ? new Date(u.created_at).toLocaleDateString('th-TH') : '-'
    ]);

    const BOM = '\uFEFF';
    const csvContent = BOM + [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `รายชื่อผู้ใช้_${new Date().toLocaleDateString('th-TH').replace(/\//g, '-')}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`📥 ส่งออก ${users.length} รายการสำเร็จ`, 'success');
}

// ==================== //
// Audit Log Viewer (v9.2)
// ==================== //

const AUDIT_ACTION_LABELS = {
    user_approve: 'อนุมัติผู้ใช้',
    user_reject: 'ปฏิเสธผู้ใช้',
    user_edit: 'แก้ไขผู้ใช้',
    user_role_change: 'เปลี่ยนตำแหน่ง',
    user_transfer: 'ย้ายสาขา',
    user_deactivate: 'ระงับผู้ใช้',
    user_reactivate: 'เปิดใช้งานผู้ใช้',
    user_password_reset: 'Reset Password',
    user_bulk_approve: 'อนุมัติกลุ่ม',
    user_bulk_role_change: 'เปลี่ยนตำแหน่งกลุ่ม',
    user_bulk_deactivate: 'ระงับกลุ่ม',
    branch_edit: 'แก้ไขสาขา',
    branch_create: 'สร้างสาขา',
    branch_toggle: 'เปลี่ยนสถานะสาขา',
};

async function showAuditLog() {
    const container = document.getElementById('umAuditContainer');
    if (!container) return;
    container.style.display = '';

    // Render audit filter bar + table skeleton
    const actionOptions = Object.entries(AUDIT_ACTION_LABELS)
        .map(([val, label]) => `<option value="${val}" ${state.auditFilterAction === val ? 'selected' : ''}>${label}</option>`)
        .join('');

    container.innerHTML = `
        <div class="um-audit-filters">
            <select id="auditActionFilter" class="um-filter-select">
                <option value="">การกระทำ: ทั้งหมด</option>
                ${actionOptions}
            </select>
            <input type="date" id="auditDateFrom" class="um-filter-select" value="${state.auditFilterDateFrom || ''}" placeholder="จากวันที่">
            <input type="date" id="auditDateTo" class="um-filter-select" value="${state.auditFilterDateTo || ''}" placeholder="ถึงวันที่">
        </div>
        <div class="um-table-wrapper">
            <table class="user-table" style="font-size:0.85rem;">
                <thead>
                    <tr>
                        <th>เวลา</th>
                        <th>ผู้กระทำ</th>
                        <th>การกระทำ</th>
                        <th>รายละเอียด</th>
                    </tr>
                </thead>
                <tbody id="auditTableBody">
                    <tr><td colspan="4" style="text-align:center; padding:30px; color:#6b7280;">กำลังโหลด...</td></tr>
                </tbody>
            </table>
        </div>
        <div class="um-pagination-row" id="auditPaginationRow">
            <div class="um-page-size">
                แสดง <select id="auditPageSize" class="um-filter-select um-filter-small">
                    ${[10, 25, 50].map(n => `<option value="${n}" ${state.auditPageSize === n ? 'selected' : ''}>${n}</option>`).join('')}
                </select> รายการ
            </div>
            <div class="um-pagination" id="auditPagination"></div>
            <div class="um-total-count" id="auditTotalCount"></div>
        </div>
    `;

    // Attach filter events
    document.getElementById('auditActionFilter')?.addEventListener('change', (e) => {
        state.auditFilterAction = e.target.value || null;
        state.auditPage = 1;
        loadAuditLogs();
    });
    document.getElementById('auditDateFrom')?.addEventListener('change', (e) => {
        state.auditFilterDateFrom = e.target.value || null;
        state.auditPage = 1;
        loadAuditLogs();
    });
    document.getElementById('auditDateTo')?.addEventListener('change', (e) => {
        state.auditFilterDateTo = e.target.value || null;
        state.auditPage = 1;
        loadAuditLogs();
    });
    document.getElementById('auditPageSize')?.addEventListener('change', (e) => {
        state.auditPageSize = parseInt(e.target.value) || 25;
        state.auditPage = 1;
        loadAuditLogs();
    });

    await loadAuditLogs();
}

async function loadAuditLogs() {
    try {
        const result = await window.SupabaseActivityLog.getFiltered({
            action: state.auditFilterAction || undefined,
            dateFrom: state.auditFilterDateFrom || undefined,
            dateTo: state.auditFilterDateTo || undefined,
            page: state.auditPage,
            pageSize: state.auditPageSize
        });
        state.auditLogs = result.data || [];
        state.auditTotalCount = result.count || 0;
    } catch (e) {
        console.error('Error loading audit logs:', e);
        state.auditLogs = [];
        state.auditTotalCount = 0;
    }
    renderAuditTable();
    renderAuditPagination();
}

function renderAuditTable() {
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;

    if (state.auditLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:#6b7280;">ไม่มีบันทึกกิจกรรม</td></tr>';
        return;
    }

    tbody.innerHTML = state.auditLogs.map(log => {
        const dateStr = log.created_at ? new Date(log.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-';
        const actionLabel = AUDIT_ACTION_LABELS[log.action] || log.action || '-';
        const userName = sanitizeHTML(log.user_name || '-');
        const details = log.details || {};

        // Build detail string
        let detailStr = '';
        if (details.target_name) detailStr += sanitizeHTML(details.target_name);
        if (details.old_role && details.new_role) detailStr += `: ${details.old_role} → ${details.new_role}`;
        if (details.count) detailStr += ` (${details.count} รายการ)`;
        if (details.target_email) detailStr += ` (${sanitizeHTML(details.target_email)})`;
        if (details.activated !== undefined) detailStr += details.activated ? ' → เปิดใช้งาน' : ' → ปิดใช้งาน';
        if (!detailStr) detailStr = '-';

        return `<tr>
            <td class="um-cell-date">${dateStr}</td>
            <td>${userName}</td>
            <td><span class="audit-action-badge">${actionLabel}</span></td>
            <td style="font-size:0.82rem; color:#4b5563; max-width:300px; overflow:hidden; text-overflow:ellipsis;">${detailStr}</td>
        </tr>`;
    }).join('');
}

function renderAuditPagination() {
    const container = document.getElementById('auditPagination');
    const totalEl = document.getElementById('auditTotalCount');
    if (!container) return;

    const totalPages = Math.ceil(state.auditTotalCount / state.auditPageSize);
    if (totalEl) totalEl.textContent = `รวม ${state.auditTotalCount} รายการ`;

    if (totalPages <= 1) { container.innerHTML = ''; return; }

    let html = `<button class="btn btn-outline btn-sm" ${state.auditPage <= 1 ? 'disabled' : ''} data-action="go-to-audit-page" data-page="${state.auditPage - 1}">◀</button>`;
    const maxShow = 5;
    let startPage = Math.max(1, state.auditPage - Math.floor(maxShow / 2));
    let endPage = Math.min(totalPages, startPage + maxShow - 1);
    if (endPage - startPage < maxShow - 1) startPage = Math.max(1, endPage - maxShow + 1);

    if (startPage > 1) {
        html += `<button class="btn btn-outline btn-sm" data-action="go-to-audit-page" data-page="1">1</button>`;
        if (startPage > 2) html += `<span class="um-pagination-ellipsis">...</span>`;
    }
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="btn ${i === state.auditPage ? 'btn-primary' : 'btn-outline'} btn-sm" data-action="go-to-audit-page" data-page="${i}">${i}</button>`;
    }
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="um-pagination-ellipsis">...</span>`;
        html += `<button class="btn btn-outline btn-sm" data-action="go-to-audit-page" data-page="${totalPages}">${totalPages}</button>`;
    }
    html += `<button class="btn btn-outline btn-sm" ${state.auditPage >= totalPages ? 'disabled' : ''} data-action="go-to-audit-page" data-page="${state.auditPage + 1}">▶</button>`;
    container.innerHTML = html;
}

function goToAuditPage(page) {
    const totalPages = Math.ceil(state.auditTotalCount / state.auditPageSize);
    if (page < 1 || page > totalPages) return;
    state.auditPage = page;
    loadAuditLogs();
}

// ==================== //
// Approve / Reject
// ==================== //

async function handleApproveUser(userId) {
    if (!confirm('ต้องการอนุมัติผู้ใช้นี้หรือไม่?')) return;

    const user = await window.AuthSystem.getUserById(userId);
    const result = await window.AuthSystem.approveUser(userId);
    if (result.success) {
        showToast('✅ อนุมัติผู้ใช้แล้ว — อย่าลืมกำหนด Role ให้เหมาะสม', 'success', 5000);
        try { await window.SupabaseActivityLog.add('user_approve', null, { target_user_id: userId, target_name: user?.name || '-' }); } catch (e) { console.warn('Audit log error:', e); }
        await loadUsers();
    } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
    }
}

async function handleRejectUser(userId) {
    if (!confirm('ต้องการปฏิเสธผู้ใช้นี้หรือไม่? ข้อมูลจะถูกลบ')) return;

    const user = await window.AuthSystem.getUserById(userId);
    const result = await window.AuthSystem.rejectUser(userId);
    if (result.success) {
        showToast('✅ ปฏิเสธผู้ใช้เรียบร้อยแล้ว', 'success');
        try { await window.SupabaseActivityLog.add('user_reject', null, { target_user_id: userId, target_name: user?.name || '-' }); } catch (e) { console.warn('Audit log error:', e); }
        await loadUsers();
    } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
    }
}

// ==================== //
// Add User (Registration Guide)
// ==================== //

function showAddUserForm() {
    const sitParam = typeof getEnvParam === 'function' ? getEnvParam() : '';
    const loginUrl = 'login.html' + sitParam;

    DOM.umContent.innerHTML = `
        <div class="um-section um-form-area">
            <h2>➕ เพิ่มผู้ใช้ใหม่</h2>

            <div class="um-info-box">
                <h4>📋 วิธีเพิ่มผู้ใช้ใหม่</h4>
                <ol>
                    <li>ให้ผู้ใช้ใหม่เปิดหน้า <b>Login</b> แล้วกด <b>"ลงทะเบียน"</b></li>
                    <li>ผู้ใช้กรอก Email, รหัสผ่าน, ชื่อ และเลือกสาขา</li>
                    <li>ผู้ใช้จะอยู่ในสถานะ <b>"รออนุมัติ"</b></li>
                    <li>กลับมาที่หน้านี้ → แท็บ <b>"รออนุมัติ"</b> → กดอนุมัติ + กำหนดตำแหน่ง</li>
                </ol>
            </div>

            <div class="um-warning-box">
                <p>💡 <b>ส่ง Link ลงทะเบียน:</b> คัดลอก URL ด้านล่างส่งให้ผู้ใช้ใหม่</p>
                <div style="display:flex; gap:8px; margin-top:8px;">
                    <input type="text" id="registerLinkInput" value="${window.location.origin}/${loginUrl}#register" readonly
                        style="flex:1; padding:6px 10px; border:1px solid #d1d5db; border-radius:4px; font-size:0.8rem; background:#fff;">
                    <button type="button" class="btn btn-primary btn-sm" data-action="copy-register-link" id="copyLinkBtn">📋 คัดลอก</button>
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" data-action="show-user-mgmt">← กลับ</button>
            </div>
        </div>
    `;
}

// Copy register link to clipboard
function copyRegisterLink() {
    const input = document.getElementById('registerLinkInput');
    if (input) {
        navigator.clipboard.writeText(input.value).then(() => {
            const btn = document.getElementById('copyLinkBtn');
            if (btn) {
                btn.textContent = '✅ คัดลอกแล้ว';
                setTimeout(() => { btn.textContent = '📋 คัดลอก'; }, 2000);
            }
        }).catch(() => {
            input.select();
            document.execCommand('copy');
        });
    }
}

// ==================== //
// Edit User Form
// ==================== //

async function showEditUserForm(userId) {
    const user = await window.AuthSystem.getUserById(userId);
    if (!user) {
        alert('ไม่พบข้อมูลผู้ใช้');
        return;
    }

    const currentBranchRole = user.branch_role || user.role || 'officer';

    // Branch selector (super admin only)
    const branchSelectorHtml = state.isSuperAdmin ? `
        <div class="form-group">
            <label>สาขา</label>
            <select id="editBranch" class="filter-select">
                ${state.branches.map(b => `<option value="${b.id}" ${b.id === user.branch_id ? 'selected' : ''}>${sanitizeHTML(b.code)} — ${sanitizeHTML(b.name_th)}</option>`).join('')}
            </select>
        </div>
    ` : '';

    // Super admin toggle (super admin only, can't toggle self)
    const superAdminHtml = state.isSuperAdmin && user.id !== state.currentUserId ? `
        <div class="form-row">
            <div class="form-group" style="margin-top:8px;">
                <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" id="editSuperAdmin" ${user.is_super_admin ? 'checked' : ''}>
                    <span>Super Admin (เข้าถึงทุกสาขา)</span>
                </label>
            </div>
        </div>
    ` : '';

    DOM.umContent.innerHTML = `
        <div class="um-section um-form-area">
            <h2>✏️ แก้ไขผู้ใช้: ${sanitizeHTML(user.name)}</h2>

            <form class="user-form" id="editUserForm">
                <div class="form-row">
                    <div class="form-group">
                        <label>ชื่อแสดง (Display Name)</label>
                        <input type="text" id="editName" value="${sanitizeHTML(user.name)}" required>
                    </div>
                    <div class="form-group">
                        <label title="เว้นว่างถ้าไม่ต้องการเปลี่ยนรหัสผ่าน">รหัสผ่านใหม่</label>
                        <input type="password" id="editPassword" placeholder="รหัสผ่านใหม่" autocomplete="new-password">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>ตำแหน่ง (Branch Role) <span id="roleHelpIcon" style="cursor:pointer; color:#3b82f6; font-size:0.85rem;" title="คลิกเพื่อดูรายละเอียด">ℹ️</span></label>
                        <select id="editBranchRole" class="filter-select">
                            ${BRANCH_ROLES.map(r => `<option value="${r.value}" ${currentBranchRole === r.value ? 'selected' : ''}>${r.label}</option>`).join('')}
                        </select>
                        <div id="rolePermSummary" style="font-size:0.8rem; color:#666; margin-top:4px;"></div>
                        <div id="roleDescTooltip" style="display:none; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; margin-top:6px; font-size:0.72rem; line-height:1.4; max-width:250px; box-sizing:border-box; word-break:break-word; overflow:hidden;">
                            <b>head</b>: หัวหน้าศูนย์<br><span style="color:#666;margin-left:8px;">ทุกสิทธิ์ + จัดการผู้ใช้</span><br>
                            <b>deputy</b>: รองหัวหน้า<br><span style="color:#666;margin-left:8px;">สิทธิ์เหมือน head</span><br>
                            <b>officer</b>: เจ้าหน้าที่<br><span style="color:#666;margin-left:8px;">CRUD ข้อมูลตัวเอง</span><br>
                            <b>temp_officer</b>: ชั่วคราว<br><span style="color:#666;margin-left:8px;">สิทธิ์เหมือน officer</span>
                        </div>
                    </div>
                    ${branchSelectorHtml}
                </div>
                ${superAdminHtml}
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" data-action="show-user-mgmt">ยกเลิก</button>
                    <button type="submit" class="btn btn-primary">💾 อัพเดท</button>
                </div>
            </form>
        </div>
    `;

    // Permission summary on role change
    function updatePermSummary() {
        const sel = document.getElementById('editBranchRole');
        const summary = document.getElementById('rolePermSummary');
        if (sel && summary) {
            const role = BRANCH_ROLES.find(r => r.value === sel.value);
            summary.textContent = role ? `สิทธิ์: ${role.perms}` : '';
        }
    }
    document.getElementById('editBranchRole')?.addEventListener('change', updatePermSummary);
    updatePermSummary();

    // Toggle role description tooltip
    document.getElementById('roleHelpIcon')?.addEventListener('click', () => {
        const tooltip = document.getElementById('roleDescTooltip');
        if (tooltip) tooltip.style.display = tooltip.style.display === 'none' ? 'block' : 'none';
    });

    // Form submit handler
    document.getElementById('editUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const updateData = {
            name: document.getElementById('editName').value,
            branch_role: document.getElementById('editBranchRole').value
        };

        // Branch transfer (super admin)
        const editBranch = document.getElementById('editBranch');
        if (editBranch && editBranch.value !== user.branch_id) {
            updateData.branch_id = editBranch.value;
        }

        // Super admin toggle
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
            showToast('✅ อัพเดทผู้ใช้สำเร็จ', 'success');
            // Audit logging for edit actions
            try {
                const before = { name: user.name, role: user.branch_role || user.role, branch_id: user.branch_id };
                const after = { name: updateData.name, role: updateData.branch_role, branch_id: updateData.branch_id || user.branch_id };
                await window.SupabaseActivityLog.add('user_edit', null, { target_user_id: userId, target_name: user.name, before, after });
                if (before.role !== after.role) {
                    await window.SupabaseActivityLog.add('user_role_change', null, { target_user_id: userId, target_name: user.name, old_role: before.role, new_role: after.role });
                }
                if (updateData.branch_id && updateData.branch_id !== user.branch_id) {
                    await window.SupabaseActivityLog.add('user_transfer', null, { target_user_id: userId, target_name: user.name, old_branch: user.branch_id, new_branch: updateData.branch_id });
                }
            } catch (e) { console.warn('Audit log error:', e); }
            await showUserManagement();
        } else {
            alert(result.error);
        }
    });
}

// ==================== //
// Delete User
// ==================== //

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
        showToast('✅ ลบผู้ใช้สำเร็จ', 'success');
        await showUserManagement();
    } else {
        alert(result.error);
    }
}

// ==================== //
// Reset Password
// ==================== //

async function handleResetPassword(userId) {
    const user = await window.AuthSystem.getUserById(userId);
    if (!user) {
        alert('ไม่พบข้อมูลผู้ใช้');
        return;
    }

    // Get email via RPC (profiles table has no email column)
    try {
        const client = window.SupabaseAuth?.getClient?.() || window.supabaseClient;
        const { data: email, error: emailError } = await client.rpc('get_user_email', { p_user_id: userId });
        if (emailError || !email) {
            alert('ไม่สามารถดึง email ของผู้ใช้ได้: ' + (emailError?.message || 'ไม่พบ email'));
            return;
        }

        if (!confirm(`ต้องการส่ง email reset password ให้ "${user.name}" (${email}) หรือไม่?`)) {
            return;
        }

        const result = await window.AuthSystem.resetPassword(email);

        if (result.success) {
            alert(`ส่ง email reset password ไปที่ ${email} เรียบร้อยแล้ว\n\nผู้ใช้จะได้รับ link สำหรับตั้งรหัสผ่านใหม่ทาง email`);
            try { await window.SupabaseActivityLog.add('user_password_reset', null, { target_user_id: userId, target_email: email }); } catch (e) { console.warn('Audit log error:', e); }
        } else {
            alert('เกิดข้อผิดพลาด: ' + result.error);
        }
    } catch (e) {
        console.error('Error in handleResetPassword:', e);
        alert('เกิดข้อผิดพลาด: ' + e.message);
    }
}

// ==================== //
// Branch Management (Super Admin)
// ==================== //

async function showBranchManagement() {
    state.currentTab = 'branches';

    const branches = await window.SupabaseBranches.getAll(true);
    const userCounts = await window.SupabaseBranches.getUserCounts();

    DOM.umContent.innerHTML = `
        <div class="um-section">
            <!-- Tabs -->
            <div class="um-tabs">
                <button class="btn btn-outline btn-sm" id="tabApproved" data-action="switch-tab-and-show" data-tab="approved">
                    ✅ ผู้ใช้งาน
                </button>
                <button class="btn btn-outline btn-sm" id="tabPending" data-action="switch-tab-and-show" data-tab="pending">
                    ⏳ รออนุมัติ
                </button>
                <button class="btn btn-primary btn-sm" id="tabBranches">
                    🏢 จัดการสาขา
                </button>
            </div>

            <div class="um-toolbar">
                <button class="btn btn-success btn-sm" data-action="show-add-branch">➕ เพิ่มสาขาใหม่</button>
            </div>

            <div class="um-table-wrapper">
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
                            const maxUsers = b.max_users || 20;
                            const pct = Math.min(100, Math.round(count / maxUsers * 100));
                            const barColor = pct >= 90 ? '#dc2626' : (pct >= 70 ? '#f59e0b' : '#22c55e');
                            const features = b.features || {};
                            const featureTags = Object.keys(features).filter(k => features[k]).map(k => `<span class="feature-tag">${k}</span>`).join(' ') || '<span style="color:#999;">-</span>';
                            return `
                            <tr style="${!b.is_active ? 'opacity:0.5;' : ''}">
                                <td style="font-family:monospace; font-size:0.8rem;">${sanitizeHTML(b.code)}</td>
                                <td>${sanitizeHTML(b.name_th)}</td>
                                <td style="font-size:0.8rem;">${sanitizeHTML(b.name_en)}</td>
                                <td>
                                    <div class="capacity-text">${count} / ${maxUsers}</div>
                                    <div class="capacity-bar"><div class="capacity-fill" style="width:${pct}%; background:${barColor};"></div></div>
                                </td>
                                <td>${featureTags}</td>
                                <td>${b.is_active ? '<span style="color:green;">เปิดใช้</span>' : '<span style="color:red;">ปิด</span>'}</td>
                                <td>
                                    <button class="btn btn-primary btn-sm" data-action="show-edit-branch" data-branch-id="${escapeHtmlAttribute(b.id)}" title="แก้ไข">✏️</button>
                                    ${b.is_active ?
                                        `<button class="btn btn-outline-danger btn-sm" data-action="toggle-branch-status" data-branch-id="${escapeHtmlAttribute(b.id)}" data-activate="false" title="ปิดใช้งาน">⏸️</button>` :
                                        `<button class="btn btn-success btn-sm" data-action="toggle-branch-status" data-branch-id="${escapeHtmlAttribute(b.id)}" data-activate="true" title="เปิดใช้งาน">▶️</button>`
                                    }
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ==================== //
// Edit Branch Form
// ==================== //

async function showEditBranchForm(branchId) {
    const branch = await window.SupabaseBranches.getById(branchId);
    if (!branch) { alert('ไม่พบข้อมูลสาขา'); return; }

    const features = branch.features || {};

    DOM.umContent.innerHTML = `
        <div class="um-section um-form-area">
            <h2>✏️ แก้ไขสาขา: ${sanitizeHTML(branch.name_th)}</h2>

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
                        <label>จำนวนผู้ใช้สูงสุด</label>
                        <input type="number" id="editBranchMaxUsers" value="${branch.max_users || 20}" min="1" max="100">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>ลำดับแสดง</label>
                        <input type="number" id="editBranchOrder" value="${branch.display_order || 0}">
                    </div>
                    <div class="form-group"></div>
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
                    <button type="button" class="btn btn-secondary" data-action="show-branch-mgmt">ยกเลิก</button>
                    <button type="submit" class="btn btn-primary">💾 อัพเดท</button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('editBranchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const updateData = {
                province_code: document.getElementById('editBranchProvince').value,
                name_th: document.getElementById('editBranchNameTh').value,
                name_en: document.getElementById('editBranchNameEn').value,
                address_th: document.getElementById('editBranchAddrTh').value,
                address_en: document.getElementById('editBranchAddrEn').value,
                max_capacity: parseInt(document.getElementById('editBranchCapacity').value) || 160,
                max_users: parseInt(document.getElementById('editBranchMaxUsers').value) || 20,
                display_order: parseInt(document.getElementById('editBranchOrder').value) || 0,
                features: {
                    receipt_module: document.getElementById('featureReceipt').checked,
                    card_print_lock: document.getElementById('featureCardPrint').checked
                }
            };
            await window.SupabaseBranches.update(branchId, updateData);
            showToast('✅ อัพเดทสาขาสำเร็จ', 'success');
            try { await window.SupabaseActivityLog.add('branch_edit', null, { branch_id: branchId, before: { name_th: branch.name_th }, after: { name_th: updateData.name_th } }); } catch (e) { console.warn('Audit log error:', e); }
            await showBranchManagement();
        } catch (err) {
            alert('เกิดข้อผิดพลาด: ' + err.message);
        }
    });
}

// ==================== //
// Add Branch Form
// ==================== //

async function showAddBranchForm() {
    DOM.umContent.innerHTML = `
        <div class="um-section um-form-area">
            <h2>➕ เพิ่มสาขาใหม่</h2>

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
                    <button type="button" class="btn btn-secondary" data-action="show-branch-mgmt">ยกเลิก</button>
                    <button type="submit" class="btn btn-success">➕ สร้างสาขา</button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('addBranchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const branchData = {
                code: document.getElementById('addBranchCode').value,
                province_code: document.getElementById('addBranchProvince').value,
                name_th: document.getElementById('addBranchNameTh').value,
                name_en: document.getElementById('addBranchNameEn').value
            };
            await window.SupabaseBranches.create(branchData);
            showToast('✅ สร้างสาขาสำเร็จ', 'success');
            try { await window.SupabaseActivityLog.add('branch_create', null, { code: branchData.code }); } catch (e) { console.warn('Audit log error:', e); }
            // Refresh branches cache
            state.branches = await window.SupabaseBranches.getAll(true) || [];
            await showBranchManagement();
        } catch (err) {
            alert('เกิดข้อผิดพลาด: ' + err.message);
        }
    });
}

// ==================== //
// Toggle Branch Status
// ==================== //

async function toggleBranchStatus(branchId, activate) {
    const action = activate ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
    if (!confirm(`ต้องการ${action}สาขานี้หรือไม่?`)) return;

    try {
        if (activate) {
            await window.SupabaseBranches.reactivate(branchId);
        } else {
            await window.SupabaseBranches.deactivate(branchId);
        }
        showToast(`✅ ${action}สาขาสำเร็จ`, 'success');
        try { await window.SupabaseActivityLog.add('branch_toggle', null, { branch_id: branchId, activated: activate }); } catch (e) { console.warn('Audit log error:', e); }
        await showBranchManagement();
    } catch (err) {
        alert('เกิดข้อผิดพลาด: ' + err.message);
    }
}

// ==================== //
// Global Exports
// ==================== //
window.showUserManagement = showUserManagement;
window.switchUserTab = switchUserTab;
window.showAddUserForm = showAddUserForm;
window.showEditUserForm = showEditUserForm;
window.handleApproveUser = handleApproveUser;
window.handleRejectUser = handleRejectUser;
window.confirmDeleteUser = confirmDeleteUser;
window.handleResetPassword = handleResetPassword;
window.showBranchManagement = showBranchManagement;
window.showEditBranchForm = showEditBranchForm;
window.showAddBranchForm = showAddBranchForm;
window.toggleBranchStatus = toggleBranchStatus;
window.copyRegisterLink = copyRegisterLink;
// v9.2 — Search, Sort, Pagination, Bulk ops
window.handleSort = handleSort;
window.goToUmPage = goToUmPage;
window.toggleSelectAll = toggleSelectAll;
window.toggleUserSelection = toggleUserSelection;
window.clearSelection = clearSelection;
window.bulkApprove = bulkApprove;
window.bulkRoleChange = bulkRoleChange;
window.bulkDeactivate = bulkDeactivate;
window.toggleUserActive = toggleUserActive;
window.exportUsersCsv = exportUsersCsv;
window.showAuditLog = showAuditLog;
window.goToAuditPage = goToAuditPage;
