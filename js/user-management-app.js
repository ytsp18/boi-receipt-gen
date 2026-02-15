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
    filterBranchId: null
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

// ==================== //
// Init
// ==================== //
document.addEventListener('DOMContentLoaded', async () => {
    cacheDOMElements();

    // Preserve env param in back link
    const envParam = typeof getEnvParam === 'function' ? getEnvParam() : '';
    if (envParam && DOM.backToLandingBtn) {
        DOM.backToLandingBtn.href = 'landing.html' + envParam;
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
        state.currentUserId = session.userId;
        state.currentBranchId = session.branchId || null;
        state.isSuperAdmin = session.isSuperAdmin || false;

        // Check permission
        if (!state.isSuperAdmin && !window.AuthSystem?.hasPermission('user_management')) {
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
// Main View — User List
// ==================== //

async function showUserManagement() {
    state.currentTab = state.currentTab || 'approved';

    // Load users with branch info, filter by branch for non-super-admin
    const filterBranchId = state.isSuperAdmin ? state.filterBranchId : state.currentBranchId;
    const allUsers = await window.AuthSystem.getUsers(filterBranchId);
    const pendingUsers = allUsers.filter(u => u.is_approved === false);
    const approvedUsers = allUsers.filter(u => u.is_approved !== false);

    // Branch filter dropdown for super admin
    const branchFilterHtml = state.isSuperAdmin ? `
        <div class="um-branch-filter">
            <label>กรองสาขา:</label>
            <select id="umBranchFilter">
                <option value="">ทุกสาขา</option>
                ${state.branches.map(b => `<option value="${b.id}" ${state.filterBranchId === b.id ? 'selected' : ''}>${sanitizeHTML(b.name_th)} (${sanitizeHTML(b.code)})</option>`).join('')}
            </select>
        </div>
    ` : '';

    DOM.umContent.innerHTML = `
        <div class="um-section">
            ${branchFilterHtml}

            <!-- Tabs -->
            <div class="um-tabs">
                <button class="btn ${state.currentTab === 'approved' ? 'btn-primary' : 'btn-outline'} btn-sm" id="tabApproved" onclick="switchUserTab('approved')">
                    ✅ ผู้ใช้งาน (${approvedUsers.length})
                </button>
                <button class="btn ${state.currentTab === 'pending' ? 'btn-primary' : 'btn-outline'} btn-sm" id="tabPending" onclick="switchUserTab('pending')">
                    ⏳ รออนุมัติ (${pendingUsers.length})
                    ${pendingUsers.length > 0 ? `<span class="pending-badge">${pendingUsers.length}</span>` : ''}
                </button>
                ${state.isSuperAdmin ? `
                    <button class="btn ${state.currentTab === 'branches' ? 'btn-primary' : 'btn-outline'} btn-sm" id="tabBranches" onclick="showBranchManagement()">
                        🏢 จัดการสาขา
                    </button>
                ` : ''}
            </div>

            <!-- Approved Users Tab -->
            <div id="approvedUsersTab" style="${state.currentTab !== 'approved' ? 'display:none' : ''}">
                <div class="um-toolbar">
                    <button class="btn btn-success btn-sm" onclick="showAddUserForm()">➕ เพิ่มผู้ใช้ใหม่</button>
                </div>
                <div class="um-table-wrapper">
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
                            ${approvedUsers.length === 0 ? '<tr><td colspan="5" style="text-align:center; color:#6b7280; padding:20px;">ไม่มีผู้ใช้งาน</td></tr>' : approvedUsers.map(user => {
                                const safeUsername = sanitizeHTML(user.username || '-');
                                const safeName = sanitizeHTML(user.name || '-');
                                const safeId = sanitizeHTML(user.id);
                                const branchName = user.branches?.name_th || '-';
                                const branchCode = user.branches?.code || '';
                                const bRole = user.branch_role || user.role || 'officer';
                                const bRoleLabel = BRANCH_ROLE_LABELS[bRole] || ROLE_LABELS[bRole] || bRole;
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
            <div id="pendingUsersTab" style="${state.currentTab !== 'pending' ? 'display:none' : ''}">
                ${pendingUsers.length === 0 ? '<p style="text-align: center; color: #6b7280; padding: 20px;">ไม่มีผู้ใช้รออนุมัติ</p>' : `
                    <div class="um-table-wrapper">
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
        </div>
    `;

    // Branch filter event for super admin
    const umBranchFilter = document.getElementById('umBranchFilter');
    if (umBranchFilter) {
        umBranchFilter.addEventListener('change', async () => {
            state.filterBranchId = umBranchFilter.value || null;
            await showUserManagement();
        });
    }
}

// ==================== //
// Tab Switching
// ==================== //

function switchUserTab(tab) {
    state.currentTab = tab;

    const approvedTab = document.getElementById('approvedUsersTab');
    const pendingTab = document.getElementById('pendingUsersTab');
    const btnApproved = document.getElementById('tabApproved');
    const btnPending = document.getElementById('tabPending');
    const btnBranches = document.getElementById('tabBranches');

    if (tab === 'approved') {
        if (approvedTab) approvedTab.style.display = 'block';
        if (pendingTab) pendingTab.style.display = 'none';
        if (btnApproved) { btnApproved.classList.remove('btn-outline'); btnApproved.classList.add('btn-primary'); }
        if (btnPending) { btnPending.classList.remove('btn-primary'); btnPending.classList.add('btn-outline'); }
        if (btnBranches) { btnBranches.classList.remove('btn-primary'); btnBranches.classList.add('btn-outline'); }
    } else if (tab === 'pending') {
        if (approvedTab) approvedTab.style.display = 'none';
        if (pendingTab) pendingTab.style.display = 'block';
        if (btnPending) { btnPending.classList.remove('btn-outline'); btnPending.classList.add('btn-primary'); }
        if (btnApproved) { btnApproved.classList.remove('btn-primary'); btnApproved.classList.add('btn-outline'); }
        if (btnBranches) { btnBranches.classList.remove('btn-primary'); btnBranches.classList.add('btn-outline'); }
    }
}

// ==================== //
// Approve / Reject
// ==================== //

async function handleApproveUser(userId) {
    if (!confirm('ต้องการอนุมัติผู้ใช้นี้หรือไม่?')) return;

    const result = await window.AuthSystem.approveUser(userId);
    if (result.success) {
        showToast('✅ อนุมัติผู้ใช้แล้ว — อย่าลืมกำหนด Role ให้เหมาะสม', 'success', 5000);
        await showUserManagement();
    } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
    }
}

async function handleRejectUser(userId) {
    if (!confirm('ต้องการปฏิเสธผู้ใช้นี้หรือไม่? ข้อมูลจะถูกลบ')) return;

    const result = await window.AuthSystem.rejectUser(userId);
    if (result.success) {
        alert('ปฏิเสธผู้ใช้เรียบร้อยแล้ว');
        await showUserManagement();
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
                    <button type="button" class="btn btn-primary btn-sm" onclick="copyRegisterLink()" id="copyLinkBtn">📋 คัดลอก</button>
                </div>
            </div>

            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="showUserManagement()">← กลับ</button>
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
                    <button type="button" class="btn btn-secondary" onclick="showUserManagement()">ยกเลิก</button>
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
                <button class="btn btn-outline btn-sm" id="tabApproved" onclick="switchUserTab('approved'); showUserManagement();">
                    ✅ ผู้ใช้งาน
                </button>
                <button class="btn btn-outline btn-sm" id="tabPending" onclick="switchUserTab('pending'); showUserManagement();">
                    ⏳ รออนุมัติ
                </button>
                <button class="btn btn-primary btn-sm" id="tabBranches">
                    🏢 จัดการสาขา
                </button>
            </div>

            <div class="um-toolbar">
                <button class="btn btn-success btn-sm" onclick="showAddBranchForm()">➕ เพิ่มสาขาใหม่</button>
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
                            const features = b.features || {};
                            const featureTags = Object.keys(features).filter(k => features[k]).map(k => `<span class="feature-tag">${k}</span>`).join(' ') || '<span style="color:#999;">-</span>';
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
        </div>
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
            showToast('✅ อัพเดทสาขาสำเร็จ', 'success');
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
                    <button type="button" class="btn btn-secondary" onclick="showBranchManagement()">ยกเลิก</button>
                    <button type="submit" class="btn btn-success">➕ สร้างสาขา</button>
                </div>
            </form>
        </div>
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
            showToast('✅ สร้างสาขาสำเร็จ', 'success');
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
