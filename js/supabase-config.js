/**
 * Supabase Configuration
 * ระบบเชื่อมต่อ Supabase - BOI Work Permit Receipt System
 *
 * Environment Switching:
 * - Production (default): ใช้งานจริง
 * - SIT: สำหรับทดสอบ v7.0 features
 *
 * วิธีสลับ environment:
 * 1. เปลี่ยน SUPABASE_ENV ด้านล่าง
 * 2. หรือเพิ่ม ?env=sit ใน URL (e.g. index.html?env=sit)
 */

// Environment configs
const SUPABASE_ENVIRONMENTS = {
    production: {
        url: 'https://pyyltrcqeyfhidpcdtvc.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5eWx0cmNxZXlmaGlkcGNkdHZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjE0MzcsImV4cCI6MjA4NTc5NzQzN30.vRJk8x6Kmo2rFYrJ6ZGqPWf3LSjLmb41COLJAP5glYo',
        label: 'Production'
    },
    sit: {
        url: 'https://cctzbereqvuaunweuqho.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjdHpiZXJlcXZ1YXVud2V1cWhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2ODg0MDAsImV4cCI6MjA4NjI2NDQwMH0.jUEWda9uWtsJPak73fqvRZKnk6Qi2ciYNio3B3ex5Yo',
        label: 'SIT (Testing)'
    }
};

// Default environment - change this to switch
const SUPABASE_DEFAULT_ENV = 'production';

// Detect environment from URL param, hostname, or use default
function detectEnvironment() {
    // 1. Check URL param first (?env=sit)
    const urlParams = new URLSearchParams(window.location.search);
    const envParam = urlParams.get('env');
    if (envParam && SUPABASE_ENVIRONMENTS[envParam]) {
        return envParam;
    }
    // 2. Auto-detect from hostname (Cloudflare Pages SIT domain)
    const hostname = window.location.hostname;
    if (hostname.includes('sit.pages.dev') || hostname.includes('-sit.pages.dev')) {
        return 'sit';
    }
    return SUPABASE_DEFAULT_ENV;
}

const CURRENT_ENV = detectEnvironment();
const SUPABASE_URL = SUPABASE_ENVIRONMENTS[CURRENT_ENV].url;
const SUPABASE_ANON_KEY = SUPABASE_ENVIRONMENTS[CURRENT_ENV].anonKey;

// Initialize Supabase Client - check if already initialized or library is loaded
if (!window.supabaseClient) {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log(`✅ Supabase client initialized [${SUPABASE_ENVIRONMENTS[CURRENT_ENV].label}]`);
    } else {
        console.error('❌ Supabase library not loaded');
    }
}

// Store current environment info for UI display
window.SUPABASE_ENV = {
    name: CURRENT_ENV,
    label: SUPABASE_ENVIRONMENTS[CURRENT_ENV].label,
    isSIT: CURRENT_ENV === 'sit'
};

// Helper function to get the client
function getSupabase() {
    return window.supabaseClient;
}

// ==================== //
// Auth Functions
// ==================== //

const SupabaseAuth = {
    // Login with email/password
    async login(email, password) {
        const client = getSupabase();
        const { data, error } = await client.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return data;
    },

    // Logout
    async logout() {
        const client = getSupabase();
        const { error } = await client.auth.signOut();
        if (error) throw error;
    },

    // Get current session
    async getSession() {
        const client = getSupabase();
        const { data: { session } } = await client.auth.getSession();
        return session;
    },

    // Get current user
    async getUser() {
        const client = getSupabase();
        const { data: { user } } = await client.auth.getUser();
        return user;
    },

    // Get user profile (including role)
    async getProfile() {
        const client = getSupabase();
        const user = await this.getUser();
        if (!user) return null;

        const { data, error } = await client
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) throw error;
        return data;
    },

    // Listen to auth changes
    onAuthStateChange(callback) {
        const client = getSupabase();
        return client.auth.onAuthStateChange(callback);
    }
};

// ==================== //
// Receipts Functions
// ==================== //

const SupabaseReceipts = {
    // Get all receipts
    async getAll() {
        const client = getSupabase();
        const { data, error } = await client
            .from('receipts')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    // Get receipts by date
    async getByDate(date) {
        const client = getSupabase();
        const { data, error } = await client
            .from('receipts')
            .select('*')
            .eq('receipt_date', date)
            .order('receipt_no', { ascending: true });

        if (error) throw error;
        return data;
    },

    // Get receipts by date range (for monthly report)
    async getByDateRange(startDate, endDate) {
        const client = getSupabase();
        const { data, error } = await client
            .from('receipts')
            .select('*')
            .gte('receipt_date', startDate)
            .lte('receipt_date', endDate)
            .order('receipt_date', { ascending: true });

        if (error) throw error;
        return data;
    },

    // Get single receipt by receipt_no
    async getByReceiptNo(receiptNo) {
        const client = getSupabase();
        const { data, error } = await client
            .from('receipts')
            .select('*')
            .eq('receipt_no', receiptNo)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    // Create new receipt (v9.0: includes branch_id)
    async create(receiptData) {
        const client = getSupabase();
        const user = await SupabaseAuth.getUser();

        const { data, error } = await client
            .from('receipts')
            .insert({
                ...receiptData,
                created_by: user?.id,
                branch_id: receiptData.branch_id || window._currentBranchId || null
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Update receipt
    async update(receiptNo, updates) {
        const client = getSupabase();
        const { data, error } = await client
            .from('receipts')
            .update(updates)
            .eq('receipt_no', receiptNo)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Delete receipt
    async delete(receiptNo) {
        const client = getSupabase();
        const { error } = await client
            .from('receipts')
            .delete()
            .eq('receipt_no', receiptNo);

        if (error) throw error;
    },

    // Mark as printed
    async markPrinted(receiptNo) {
        return this.update(receiptNo, {
            is_printed: true,
            printed_at: new Date().toISOString()
        });
    },

    // Mark as received
    async markReceived(receiptNo) {
        return this.update(receiptNo, {
            is_received: true,
            received_at: new Date().toISOString()
        });
    },

    // Unmark received
    async unmarkReceived(receiptNo) {
        return this.update(receiptNo, {
            is_received: false,
            received_at: null
        });
    },

    // Get next receipt number for today
    async getNextReceiptNo() {
        const client = getSupabase();
        const today = new Date();
        const year = today.getFullYear();
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const day = today.getDate().toString().padStart(2, '0');
        const datePrefix = `${year}${month}${day}`;

        const { data, error } = await client
            .from('receipts')
            .select('receipt_no')
            .like('receipt_no', `${datePrefix}-%`)
            .order('receipt_no', { ascending: false })
            .limit(1);

        if (error) throw error;

        let nextNumber = 1;
        if (data && data.length > 0) {
            const lastNo = data[0].receipt_no;
            const lastNumber = parseInt(lastNo.split('-')[1]);
            nextNumber = lastNumber + 1;
        }

        return `${datePrefix}-${nextNumber.toString().padStart(3, '0')}`;
    },

    // Search receipts
    async search(query) {
        const client = getSupabase();
        const { data, error } = await client
            .from('receipts')
            .select('*')
            .or(`foreigner_name.ilike.%${query}%,receipt_no.ilike.%${query}%,request_no.ilike.%${query}%`)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    }
};

// ==================== //
// Storage Functions
// ==================== //

const SupabaseStorage = {
    // Upload card image
    async uploadImage(receiptNo, file) {
        const client = getSupabase();
        const fileExt = file.name.split('.').pop();
        const fileName = `${receiptNo}.${fileExt}`;

        const { data, error } = await client.storage
            .from('card-images')
            .upload(fileName, file, {
                upsert: true // Replace if exists
            });

        if (error) throw error;

        // Get public URL
        const { data: urlData } = client.storage
            .from('card-images')
            .getPublicUrl(fileName);

        return urlData.publicUrl;
    },

    // Upload from base64
    async uploadBase64(receiptNo, base64Data) {
        const client = getSupabase();
        // Extract mime type and data
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches) throw new Error('Invalid base64 string');

        const mimeType = matches[1];
        const base64 = matches[2];
        const ext = mimeType.split('/')[1] || 'jpg';
        const fileName = `${receiptNo}.${ext}`;

        // Convert base64 to Blob
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });

        const { data, error } = await client.storage
            .from('card-images')
            .upload(fileName, blob, {
                contentType: mimeType,
                upsert: true
            });

        if (error) throw error;

        const { data: urlData } = client.storage
            .from('card-images')
            .getPublicUrl(fileName);

        return urlData.publicUrl;
    },

    // Delete image
    async deleteImage(receiptNo) {
        const client = getSupabase();
        // Try common extensions
        const extensions = ['jpg', 'jpeg', 'png', 'gif'];

        for (const ext of extensions) {
            const fileName = `${receiptNo}.${ext}`;
            await client.storage
                .from('card-images')
                .remove([fileName]);
        }
    },

    // Get image URL
    getImageUrl(receiptNo, ext = 'jpg') {
        const client = getSupabase();
        const fileName = `${receiptNo}.${ext}`;
        const { data } = client.storage
            .from('card-images')
            .getPublicUrl(fileName);
        return data.publicUrl;
    }
};

// ==================== //
// Activity Log Functions
// ==================== //

const SupabaseActivityLog = {
    // Add log entry (v9.0: includes branch_id)
    async add(action, receiptNo, details = {}) {
        const client = getSupabase();
        const profile = await SupabaseAuth.getProfile();

        const { error } = await client
            .from('activity_logs')
            .insert({
                action,
                receipt_no: receiptNo,
                details,
                user_id: profile?.id,
                user_name: profile?.name || 'Unknown',
                branch_id: profile?.branch_id || window._currentBranchId || null
            });

        if (error) throw error;
    },

    // Get logs (admin only)
    async getAll(limit = 100) {
        const client = getSupabase();
        const { data, error } = await client
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data;
    },

    // Get logs by action type
    async getByAction(action, limit = 100) {
        const client = getSupabase();
        const { data, error } = await client
            .from('activity_logs')
            .select('*')
            .eq('action', action)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data;
    }
};

// ==================== //
// Branch Management Functions (v9.0)
// ==================== //

const SupabaseBranches = {
    // Get all active branches (for dropdowns, selectors)
    async getAll(includeInactive = false) {
        const client = getSupabase();
        let query = client
            .from('branches')
            .select('*')
            .order('display_order', { ascending: true })
            .order('name_th', { ascending: true });

        if (!includeInactive) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    // Get single branch by ID
    async getById(id) {
        const client = getSupabase();
        const { data, error } = await client
            .from('branches')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    // Get single branch by code
    async getByCode(code) {
        const client = getSupabase();
        const { data, error } = await client
            .from('branches')
            .select('*')
            .eq('code', code)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    // Create new branch (super admin only)
    async create(branchData) {
        const client = getSupabase();
        const { data, error } = await client
            .from('branches')
            .insert(branchData)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Update branch (super admin only)
    async update(id, updates) {
        const client = getSupabase();
        const { data, error } = await client
            .from('branches')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Soft-deactivate branch (super admin only)
    async deactivate(id) {
        return this.update(id, { is_active: false });
    },

    // Reactivate branch (super admin only)
    async reactivate(id) {
        return this.update(id, { is_active: true });
    },

    // Get user count per branch
    async getUserCounts() {
        const client = getSupabase();
        const { data, error } = await client
            .from('profiles')
            .select('branch_id');

        if (error) throw error;

        const counts = {};
        (data || []).forEach(p => {
            if (p.branch_id) {
                counts[p.branch_id] = (counts[p.branch_id] || 0) + 1;
            }
        });
        return counts;
    }
};

// ==================== //
// User Management Functions
// ==================== //

const SupabaseUsers = {
    // Get all profiles (with branch info)
    async getAll(branchId = null) {
        const client = getSupabase();
        let query = client
            .from('profiles')
            .select('*, branches:branch_id(id, code, name_th, name_en)')
            .order('created_at', { ascending: true });

        if (branchId) {
            query = query.eq('branch_id', branchId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    // Update profile
    async updateProfile(userId, updates) {
        const client = getSupabase();
        const { data, error } = await client
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }
};

// ==================== //
// Card Print Lock Functions
// ==================== //

const SupabaseCardPrintLock = {
    // Get today's locks (all officers)
    async getToday() {
        const client = getSupabase();
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await client
            .from('card_print_locks')
            .select('*')
            .eq('lock_date', today)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    // Create a new lock (v9.0: includes branch_id)
    async create(lockData) {
        const client = getSupabase();
        const { data, error } = await client
            .from('card_print_locks')
            .insert({
                ...lockData,
                branch_id: lockData.branch_id || window._currentBranchId || null
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // Update serial number and status
    async updateSN(id, snData) {
        const client = getSupabase();
        const { data, error } = await client
            .from('card_print_locks')
            .update({ ...snData, status: 'printed' })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // Mark as completed
    async complete(id) {
        const client = getSupabase();
        const { data, error } = await client
            .from('card_print_locks')
            .update({ status: 'completed' })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // Update lock details (v8.5 — inline edit: request_no, passport_no, foreigner_name)
    async updateDetails(id, details) {
        const client = getSupabase();
        const { data, error } = await client
            .from('card_print_locks')
            .update(details)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // Delete lock (admin only — RLS enforced)
    async delete(id) {
        const client = getSupabase();
        const { error } = await client
            .from('card_print_locks')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // Search locks (current + recent)
    async search(query) {
        const client = getSupabase();
        const { data, error } = await client
            .from('card_print_locks')
            .select('*')
            .or(`appointment_id.ilike.%${query}%,foreigner_name.ilike.%${query}%,request_no.ilike.%${query}%`)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        return data || [];
    },

    // Get by appointment_id (for cross-use auto-fill)
    async getByAppointment(appointmentId) {
        const client = getSupabase();
        const { data, error } = await client
            .from('card_print_locks')
            .select('*')
            .ilike('appointment_id', appointmentId.trim())
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    // Search archive (for S/N history lookup)
    async searchArchive(query) {
        const client = getSupabase();
        const { data, error } = await client
            .from('card_print_locks_archive')
            .select('*')
            .or(`sn_good.ilike.%${query}%,sn_spoiled.ilike.%${query}%,appointment_id.ilike.%${query}%`)
            .order('created_at', { ascending: false })
            .limit(20);
        if (error) throw error;
        return data || [];
    },

    // Update card image URL
    async updateImage(id, imageUrl) {
        const client = getSupabase();
        const { data, error } = await client
            .from('card_print_locks')
            .update({ card_image_url: imageUrl })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    // Check if receipt already exists for this appointment
    async checkExistingReceipt(appointmentId) {
        const client = getSupabase();
        const { data, error } = await client
            .from('receipts')
            .select('receipt_no, foreigner_name')
            .eq('appointment_no', appointmentId.trim())
            .limit(1);
        if (error) throw error;
        return data && data.length > 0 ? data[0] : null;
    },

    // Get summary stats for today
    async getTodayStats() {
        const data = await this.getToday();
        const stats = {
            total: data.length,
            byOfficer: {},
            spoiledCount: 0
        };
        data.forEach(lock => {
            const name = lock.officer_name || 'Unknown';
            stats.byOfficer[name] = (stats.byOfficer[name] || 0) + 1;
            if (lock.sn_spoiled) stats.spoiledCount++;
        });
        return stats;
    }
};

// Export for use
window.SupabaseAuth = SupabaseAuth;
window.SupabaseReceipts = SupabaseReceipts;
window.SupabaseStorage = SupabaseStorage;
window.SupabaseActivityLog = SupabaseActivityLog;
window.SupabaseUsers = SupabaseUsers;
window.SupabaseCardPrintLock = SupabaseCardPrintLock;
window.SupabaseBranches = SupabaseBranches;
window.getSupabase = getSupabase;

console.log('✅ Supabase Config Loaded (v9.0)');
