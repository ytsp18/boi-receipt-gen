/**
 * Authentication System - Work Permit Receipt System
 * ระบบยืนยันตัวตนและจัดการผู้ใช้ (Supabase Version)
 */

// ==================== //
// Role Permissions
// ==================== //
const ROLE_PERMISSIONS = {
    admin: {
        name: 'Admin',
        description: 'Full access including User Management and Activity Log',
        permissions: ['view', 'create', 'edit', 'delete', 'print', 'export', 'user_management', 'activity_log', 'monthly_report']
    },
    manager: {
        name: 'Manager',
        description: 'Full access except User Management and Activity Log',
        permissions: ['view', 'create', 'edit', 'delete', 'print', 'export', 'monthly_report']
    },
    staff: {
        name: 'Staff',
        description: 'Normal operations only',
        permissions: ['view', 'create', 'edit', 'print']
    }
};

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

        return {
            success: true,
            session: {
                userId: data.user.id,
                email: data.user.email,
                name: profile?.name || 'Admin',
                role: profile?.role || 'admin',
                username: profile?.username || email
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
        window.location.href = 'login.html';
    } catch (e) {
        console.error('Logout error:', e);
        window.location.href = 'login.html';
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

        return {
            userId: session.user.id,
            email: session.user.email,
            name: cachedProfile?.name || 'Unknown',
            role: cachedProfile?.role || 'staff',
            username: cachedProfile?.username || session.user.email
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

        const fetchPromise = client
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

        if (error) {
            console.warn('Profile fetch error (will use defaults):', error.message);
            return null;
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

    const roleInfo = ROLE_PERMISSIONS[session.role];
    if (!roleInfo) return false;

    return roleInfo.permissions.includes(permission);
}

async function requireAuth() {
    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
        window.location.href = 'login.html';
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

async function getUsers() {
    try {
        const client = getSupabaseClient();
        if (!client) return [];

        const { data, error } = await client
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: true });

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

        const { data, error } = await client
            .from('profiles')
            .update({
                name: userData.name,
                role: userData.role,
                username: userData.username
            })
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
            window.location.href = 'index.html';
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
    ROLE_PERMISSIONS
};

console.log('✅ Auth System Loaded (Supabase)');
