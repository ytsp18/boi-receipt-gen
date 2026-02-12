/**
 * Authentication System - Work Permit Receipt System
 * ระบบยืนยันตัวตนและจัดการผู้ใช้ (Supabase Version)
 */

// ==================== //
// Environment-aware redirect helper
// ==================== //
function getEnvParam() {
    const urlParams = new URLSearchParams(window.location.search);
    const env = urlParams.get('env');
    return env ? `?env=${env}` : '';
}

// ==================== //
// Role Permissions (v9.0 — Branch-based)
// ==================== //

// Legacy role mapping (backward compat)
const ROLE_PERMISSIONS = {
    admin: {
        name: 'Admin',
        description: 'Full access including User Management and Activity Log',
        permissions: ['view', 'create', 'edit', 'delete', 'print', 'export', 'user_management', 'activity_log', 'monthly_report']
    },
    manager: {
        name: 'Manager',
        description: 'Full access except User Management and Activity Log',
        permissions: ['view', 'create', 'edit', 'print', 'export', 'monthly_report']
    },
    staff: {
        name: 'Staff',
        description: 'Normal operations only',
        permissions: ['view', 'create', 'edit', 'print']
    }
};

// New branch role permissions (v9.0)
const BRANCH_ROLE_PERMISSIONS = {
    head: {
        name: 'หัวหน้าศูนย์',
        name_en: 'Branch Head',
        permissions: ['view', 'create', 'edit', 'delete', 'print', 'export', 'user_management', 'activity_log', 'monthly_report', 'branch_settings']
    },
    deputy: {
        name: 'รองหัวหน้า',
        name_en: 'Deputy Head',
        permissions: ['view', 'create', 'edit', 'print', 'export', 'user_management', 'monthly_report']
    },
    officer: {
        name: 'เจ้าหน้าที่',
        name_en: 'Officer',
        permissions: ['view', 'create', 'edit', 'print']
    },
    temp_officer: {
        name: 'เจ้าหน้าที่ชั่วคราว',
        name_en: 'Temp Officer',
        permissions: ['view', 'create', 'edit', 'print']
    },
    other: {
        name: 'อื่นๆ',
        name_en: 'Other',
        permissions: ['view']
    }
};

// Super admin permissions (cross-branch)
const SUPER_ADMIN_PERMISSIONS = [
    'view', 'create', 'edit', 'delete', 'print', 'export',
    'user_management', 'activity_log', 'monthly_report',
    'branch_settings', 'branch_management', 'cross_branch_report', 'transfer_user'
];

// ==================== //
// Cache for current user profile
// ==================== //
let cachedProfile = null;

// ==================== //
// Helper: Get Supabase Client
// ==================== //
function getSupabaseClient() {
    return window.supabaseClient || (window.supabase && window.supabase.auth ? window.supabase : null);
}

// ==================== //
// Authentication Functions
// ==================== //

async function login(email, password) {
    try {
        const client = getSupabaseClient();

        if (!client || !client.auth) {
            console.error('Supabase not initialized');
            return { success: false, error: 'ระบบยังไม่พร้อม กรุณา refresh หน้าแล้วลองใหม่' };
        }

        console.log('Attempting login for:', email);

        const { data, error } = await client.auth.signInWithPassword({
            email,
            password
        });

        console.log('Auth result:', { data: data ? 'success' : 'null', error: error?.message });

        if (error) {
            return { success: false, error: error.message };
        }

        if (!data || !data.user) {
            return { success: false, error: 'ไม่สามารถเข้าสู่ระบบได้' };
        }

        // Get user profile (with fallback)
        console.log('Getting profile...');
        const profile = await getProfile(data.user.id);
        cachedProfile = profile;
        console.log('Profile result:', profile);

        // Check if user is approved
        if (profile && profile.is_approved === false) {
            // Sign out the user
            await client.auth.signOut();
            return {
                success: false,
                error: 'บัญชีของคุณยังไม่ได้รับอนุมัติ กรุณารอการอนุมัติจาก Admin'
            };
        }

        const branchRole = profile?.branch_role || null;
        const legacyRole = profile?.role || 'admin';

        return {
            success: true,
            session: {
                userId: data.user.id,
                email: data.user.email,
                name: profile?.name || 'Admin',
                role: branchRole || legacyRole,
                legacyRole: legacyRole,
                branchRole: branchRole,
                username: profile?.username || email,
                branchId: profile?.branch_id || null,
                branchCode: profile?.branchCode || null,
                branchName: profile?.branchName || null,
                branchNameEn: profile?.branchNameEn || null,
                branchFeatures: profile?.branchFeatures || {},
                isSuperAdmin: profile?.is_super_admin || false
            }
        };
    } catch (e) {
        console.error('Login error:', e);
        return { success: false, error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + e.message };
    }
}

async function logout() {
    try {
        const client = getSupabaseClient();
        if (client && client.auth) {
            await client.auth.signOut();
        }
        cachedProfile = null;
        window.location.href = 'login.html' + getEnvParam();
    } catch (e) {
        console.error('Logout error:', e);
        window.location.href = 'login.html' + getEnvParam();
    }
}

async function getSession() {
    try {
        const client = getSupabaseClient();
        if (!client || !client.auth) return null;

        const { data: { session } } = await client.auth.getSession();
        if (!session) return null;

        // Get or use cached profile
        if (!cachedProfile) {
            cachedProfile = await getProfile(session.user.id);
        }

        // Determine effective role: use branch_role if available, fallback to legacy role
        const branchRole = cachedProfile?.branch_role || null;
        const legacyRole = cachedProfile?.role || 'staff';
        const effectiveRole = branchRole || legacyRole;
        const isSuperAdmin = cachedProfile?.is_super_admin || false;

        return {
            userId: session.user.id,
            email: session.user.email,
            name: cachedProfile?.name || 'Unknown',
            role: effectiveRole,
            legacyRole: legacyRole,
            branchRole: branchRole,
            username: cachedProfile?.username || session.user.email,
            // Branch info (v9.0)
            branchId: cachedProfile?.branch_id || null,
            branchCode: cachedProfile?.branchCode || null,
            branchName: cachedProfile?.branchName || null,
            branchNameEn: cachedProfile?.branchNameEn || null,
            branchFeatures: cachedProfile?.branchFeatures || {},
            isSuperAdmin: isSuperAdmin
        };
    } catch (e) {
        console.error('Error getting session:', e);
        return null;
    }
}

async function getProfile(userId) {
    try {
        const client = getSupabaseClient();
        if (!client) {
            console.warn('No Supabase client for getProfile');
            return null;
        }

        console.log('Fetching profile for userId:', userId);

        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
        );

        // JOIN with branches to get branch info
        const fetchPromise = client
            .from('profiles')
            .select('*, branches:branch_id(id, code, name_th, name_en, address_th, address_en, features, is_active)')
            .eq('id', userId)
            .single();

        const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

        if (error) {
            console.warn('Profile fetch error (will use defaults):', error.message);
            return null;
        }

        // Flatten branch info into profile
        if (data && data.branches) {
            data.branchCode = data.branches.code;
            data.branchName = data.branches.name_th;
            data.branchNameEn = data.branches.name_en;
            data.branchFeatures = data.branches.features || {};
            data.branchActive = data.branches.is_active;
        }

        console.log('Profile loaded:', data);
        return data;
    } catch (e) {
        console.warn('Error getting profile (will use defaults):', e.message);
        return null;
    }
}

async function isLoggedIn() {
    const session = await getSession();
    return session !== null;
}

async function getCurrentUser() {
    return await getSession();
}

async function hasPermission(permission) {
    const session = await getSession();
    if (!session) return false;

    // Super admin has all permissions
    if (session.isSuperAdmin) return true;

    // Check branch role first, then legacy role
    const branchRoleInfo = BRANCH_ROLE_PERMISSIONS[session.branchRole];
    if (branchRoleInfo) {
        return branchRoleInfo.permissions.includes(permission);
    }

    // Fallback to legacy role
    const roleInfo = ROLE_PERMISSIONS[session.legacyRole];
    if (!roleInfo) return false;
    return roleInfo.permissions.includes(permission);
}

async function requireAuth() {
    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
        window.location.href = 'login.html' + getEnvParam();
        return false;
    }
    return true;
}

async function requirePermission(permission) {
    const authOk = await requireAuth();
    if (!authOk) return false;

    const hasPerm = await hasPermission(permission);
    if (!hasPerm) {
        alert('คุณไม่มีสิทธิ์เข้าถึงส่วนนี้');
        return false;
    }
    return true;
}

// ==================== //
// User Management Functions (Admin only)
// ==================== //

async function getUsers(filterBranchId) {
    try {
        const client = getSupabaseClient();
        if (!client) return [];

        // v9.0: JOIN branches to get branch name + code
        let query = client
            .from('profiles')
            .select('*, branches(id, code, name_th)')
            .order('created_at', { ascending: true });

        // v9.0: Filter by branch if specified
        if (filterBranchId) {
            query = query.eq('branch_id', filterBranchId);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('Error loading users:', e);
        return [];
    }
}

async function getUserById(id) {
    try {
        const client = getSupabaseClient();
        if (!client) return null;

        const { data, error } = await client
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single();

        if (error) return null;
        return data;
    } catch (e) {
        console.error('Error getting user:', e);
        return null;
    }
}

async function updateUser(id, userData) {
    try {
        const client = getSupabaseClient();
        if (!client) return { success: false, error: 'ระบบไม่พร้อม' };

        // Build update payload — only include fields that are provided
        const updatePayload = {};
        if (userData.name !== undefined) updatePayload.name = userData.name;
        if (userData.username !== undefined) updatePayload.username = userData.username;
        if (userData.role !== undefined) updatePayload.role = userData.role;
        if (userData.branch_role !== undefined) updatePayload.branch_role = userData.branch_role;
        if (userData.branch_id !== undefined) updatePayload.branch_id = userData.branch_id;
        if (userData.is_super_admin !== undefined) updatePayload.is_super_admin = userData.is_super_admin;

        // Sync legacy role from branch_role for backward compat
        if (userData.branch_role) {
            const roleMap = { head: 'admin', deputy: 'manager', officer: 'staff', temp_officer: 'staff', other: 'staff' };
            updatePayload.role = roleMap[userData.branch_role] || 'staff';
        }

        const { data, error } = await client
            .from('profiles')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }
        return { success: true, user: data };
    } catch (e) {
        console.error('Error updating user:', e);
        return { success: false, error: 'เกิดข้อผิดพลาดในการอัพเดต' };
    }
}

async function transferUser(userId, newBranchId) {
    try {
        const client = getSupabaseClient();
        if (!client) return { success: false, error: 'ระบบไม่พร้อม' };

        const { data, error } = await client
            .from('profiles')
            .update({ branch_id: newBranchId })
            .eq('id', userId)
            .select()
            .single();

        if (error) return { success: false, error: error.message };
        return { success: true, user: data };
    } catch (e) {
        console.error('Error transferring user:', e);
        return { success: false, error: 'เกิดข้อผิดพลาดในการย้ายสาขา' };
    }
}

async function addUser(userData) {
    return {
        success: false,
        error: 'กรุณาสร้างผู้ใช้ใหม่ผ่าน Supabase Dashboard แล้วเพิ่ม Profile ในตาราง profiles'
    };
}

async function deleteUser(id) {
    return {
        success: false,
        error: 'กรุณาลบผู้ใช้ผ่าน Supabase Dashboard'
    };
}

// ==================== //
// User Registration (with Approval)
// ==================== //

async function registerUser(email, password, name, branchId) {
    try {
        const client = getSupabaseClient();
        if (!client) {
            return { success: false, error: 'ระบบไม่พร้อม กรุณา refresh หน้า' };
        }

        if (!branchId) {
            return { success: false, error: 'กรุณาเลือกสาขา' };
        }

        // Sign up with Supabase Auth (pass branch_id in metadata for trigger)
        const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name: name,
                    branch_id: branchId
                }
            }
        });

        if (error) {
            return { success: false, error: error.message };
        }

        if (!data || !data.user) {
            return { success: false, error: 'ไม่สามารถสร้างบัญชีได้' };
        }

        // Create profile with is_approved = false (pending approval)
        const { error: profileError } = await client
            .from('profiles')
            .insert({
                id: data.user.id,
                username: email,
                name: name,
                role: 'staff',
                branch_id: branchId,
                branch_role: 'officer',
                is_approved: false,
                created_at: new Date().toISOString()
            });

        if (profileError) {
            console.error('Profile creation error:', profileError);
            // Profile might already exist from trigger, try update
            await client
                .from('profiles')
                .update({
                    name: name,
                    branch_id: branchId,
                    branch_role: 'officer',
                    is_approved: false
                })
                .eq('id', data.user.id);
        }

        return {
            success: true,
            message: 'สมัครสำเร็จ! กรุณารอการอนุมัติจาก Admin / หัวหน้าศูนย์'
        };
    } catch (e) {
        console.error('Registration error:', e);
        return { success: false, error: 'เกิดข้อผิดพลาดในการสมัคร: ' + e.message };
    }
}

// Get pending users (Admin only)
async function getPendingUsers() {
    try {
        const client = getSupabaseClient();
        if (!client) return [];

        const { data, error } = await client
            .from('profiles')
            .select('*')
            .eq('is_approved', false)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('Error loading pending users:', e);
        return [];
    }
}

// Approve user (Admin only)
async function approveUser(userId) {
    try {
        const client = getSupabaseClient();
        if (!client) return { success: false, error: 'ระบบไม่พร้อม' };

        const currentUser = await client.auth.getUser();

        const { error } = await client
            .from('profiles')
            .update({
                is_approved: true
            })
            .eq('id', userId);

        if (error) {
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (e) {
        console.error('Error approving user:', e);
        return { success: false, error: 'เกิดข้อผิดพลาดในการอนุมัติ' };
    }
}

// Reject user (Admin only) - Deletes the profile
async function rejectUser(userId) {
    try {
        const client = getSupabaseClient();
        if (!client) return { success: false, error: 'ระบบไม่พร้อม' };

        const { error } = await client
            .from('profiles')
            .delete()
            .eq('id', userId);

        if (error) {
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (e) {
        console.error('Error rejecting user:', e);
        return { success: false, error: 'เกิดข้อผิดพลาดในการปฏิเสธ' };
    }
}

// Reset password (Admin only) - Sends reset email to user
async function resetPassword(email) {
    try {
        const client = getSupabaseClient();
        if (!client) return { success: false, error: 'ระบบไม่พร้อม' };

        const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password.html'
        });

        if (error) {
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (e) {
        console.error('Error sending reset password email:', e);
        return { success: false, error: 'เกิดข้อผิดพลาดในการส่งอีเมล' };
    }
}

// ==================== //
// Session Timeout (15 min inactivity)
// ==================== //
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const TIMEOUT_WARNING_MS = 14 * 60 * 1000;
const TIMEOUT_CHECK_MS = 60 * 1000;

let _lastActivity = Date.now();
let _timeoutInterval = null;
let _warningShown = false;

function _resetActivity() {
    _lastActivity = Date.now();
    if (_warningShown) {
        _warningShown = false;
        const el = document.getElementById('sessionTimeoutWarning');
        if (el) el.remove();
    }
}

function _checkTimeout() {
    const elapsed = Date.now() - _lastActivity;

    // Warning at 14 min
    if (elapsed >= TIMEOUT_WARNING_MS && !_warningShown) {
        _warningShown = true;
        const div = document.createElement('div');
        div.id = 'sessionTimeoutWarning';
        div.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#f97316;color:#fff;padding:10px;text-align:center;z-index:10000;font-family:Sarabun,sans-serif;font-size:0.9rem;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
        div.textContent = 'ระบบจะออกจากระบบอัตโนมัติใน 1 นาที เนื่องจากไม่มีการใช้งาน';
        document.body.appendChild(div);
    }

    // Force logout at 15 min
    if (elapsed >= SESSION_TIMEOUT_MS) {
        clearInterval(_timeoutInterval);
        const el = document.getElementById('sessionTimeoutWarning');
        if (el) el.remove();
        alert('ระบบออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งาน 15 นาที');
        logout();
    }
}

function startSessionTimeout() {
    // Skip on login page
    if (document.getElementById('loginForm')) return;

    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, _resetActivity, { passive: true });
    });

    _timeoutInterval = setInterval(_checkTimeout, TIMEOUT_CHECK_MS);
    console.log('Session timeout armed (15 min)');
}

// Auto-start on authenticated pages
startSessionTimeout();

// ==================== //
// Login Page Handler
// ==================== //

// Only run if on login page
if (document.getElementById('loginForm')) {
    // Don't auto-redirect - let user login manually

    document.getElementById('loginForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('loginError');
        const submitBtn = this.querySelector('button[type="submit"]');

        // Disable button while loading
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังเข้าสู่ระบบ...';

        const result = await login(email, password);

        if (result.success) {
            window.location.href = 'index.html' + getEnvParam();
        } else {
            errorEl.textContent = result.error;
            errorEl.classList.add('show');
            submitBtn.disabled = false;
            submitBtn.textContent = 'เข้าสู่ระบบ';
        }
    });
}

// Export functions for use in other files
window.AuthSystem = {
    login,
    logout,
    getSession,
    isLoggedIn,
    getCurrentUser,
    hasPermission,
    requireAuth,
    requirePermission,
    getUsers,
    getUserById,
    addUser,
    updateUser,
    deleteUser,
    registerUser,
    getPendingUsers,
    approveUser,
    rejectUser,
    resetPassword,
    transferUser,
    startSessionTimeout,
    ROLE_PERMISSIONS,
    BRANCH_ROLE_PERMISSIONS,
    SUPER_ADMIN_PERMISSIONS
};

console.log('✅ Auth System Loaded (Supabase v9.0 — Multi-Branch)');
