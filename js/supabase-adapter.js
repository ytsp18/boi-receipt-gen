/**
 * Supabase Adapter - Replace LocalStorage with Supabase
 * This file overrides LocalStorage functions to use Supabase instead
 */

// Wait for Supabase to be ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔄 Initializing Supabase Adapter...');

    // Check authentication
    const client = window.supabaseClient;
    if (!client) {
        console.error('❌ Supabase client not initialized');
        return;
    }

    const { data: { session } } = await client.auth.getSession();
    if (!session) {
        console.log('❌ Not authenticated, redirecting to login...');
        window.location.href = 'login.html';
        return;
    }

    console.log('✅ Authenticated as:', session.user.email);
});

// ==================== //
// Data Loading Functions
// ==================== //

// Load from Supabase - filtered by date (default = today)
// Pass date as 'YYYY-MM-DD' string, or null to load today
async function loadRegistryFromSupabase(date = null) {
    try {
        // Default to today if no date provided
        if (!date) {
            const today = new Date();
            date = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
        }

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            console.error('Invalid date format:', date);
            return [];
        }

        const { data: records, error } = await window.supabaseClient
            .from('receipts')
            .select('*')
            .eq('receipt_date', date)
            .order('created_at', { ascending: false });

        if (error) throw error;

        console.log(`📋 Loaded ${(records || []).length} records for ${date}`);

        // Transform to match existing data structure
        return (records || []).map(row => ({
            receiptNo: row.receipt_no,
            date: formatThaiDateFromISO(row.receipt_date),
            name: row.foreigner_name,
            sn: row.sn_number,
            requestNo: row.request_no,
            appointmentNo: row.appointment_no,
            cardImage: row.card_image_url,
            apiPhotoUrl: row.api_photo_url,
            // Include status fields
            isPrinted: row.is_printed,
            printedAt: row.printed_at,
            isReceived: row.is_received,
            receivedAt: row.received_at
        }));
    } catch (e) {
        console.error('Error loading from Supabase:', e);
        return [];
    }
}

// Search across all dates (server-side) — for cross-date search
async function searchRegistryFromSupabase(query) {
    try {
        if (!query || query.trim().length < 2) return [];

        // Validate query (no HTML, no script injection, escape SQL wildcards & PostgREST chars)
        const cleanQuery = query.trim()
            .replace(/[<>"'`;]/g, '')       // Remove HTML/script chars
            .replace(/[%_]/g, '')           // Remove SQL wildcard chars
            .replace(/[(),.\\\[\]]/g, '');  // Remove PostgREST-significant chars

        if (cleanQuery.length < 2) return [];

        const { data, error } = await window.supabaseClient
            .from('receipts')
            .select('*')
            .or(`foreigner_name.ilike.%${cleanQuery}%,receipt_no.ilike.%${cleanQuery}%,request_no.ilike.%${cleanQuery}%,sn_number.ilike.%${cleanQuery}%,appointment_no.ilike.%${cleanQuery}%`)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        console.log(`🔍 Search "${cleanQuery}": found ${(data || []).length} results`);

        return (data || []).map(row => ({
            receiptNo: row.receipt_no,
            date: formatThaiDateFromISO(row.receipt_date),
            name: row.foreigner_name,
            sn: row.sn_number,
            requestNo: row.request_no,
            appointmentNo: row.appointment_no,
            cardImage: row.card_image_url,
            apiPhotoUrl: row.api_photo_url,
            isPrinted: row.is_printed,
            printedAt: row.printed_at,
            isReceived: row.is_received,
            receivedAt: row.received_at
        }));
    } catch (e) {
        console.error('Error searching Supabase:', e);
        return [];
    }
}

// Helper: Format date from ISO to Thai format
function formatThaiDateFromISO(isoDate) {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear() + 543;
    return `${day}/${month}/${year}`;
}

// Helper: Parse Thai date to ISO format
function parseThaiDateToISO(thaiDate) {
    if (!thaiDate) return null;
    const parts = thaiDate.split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const year = parseInt(parts[2]) - 543;
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

// ==================== //
// Save Functions
// ==================== //

// Save a single receipt to Supabase
async function saveReceiptToSupabase(receiptData, cardImageFile = null) {
    try {
        let cardImageUrl = receiptData.cardImage;

        // Upload image if it's a new base64 image
        if (cardImageFile && cardImageFile.startsWith('data:')) {
            cardImageUrl = await uploadImageToSupabase(receiptData.receiptNo, cardImageFile);
        }

        // Check if receipt exists (use maybeSingle to avoid 406 error when not found)
        const { data: existing } = await window.supabaseClient
            .from('receipts')
            .select('id')
            .eq('receipt_no', receiptData.receiptNo)
            .maybeSingle();

        const receiptPayload = {
            receipt_no: receiptData.receiptNo,
            receipt_date: receiptData.receiptDate || parseThaiDateToISO(receiptData.date),
            foreigner_name: receiptData.foreignerName || receiptData.name,
            sn_number: receiptData.snNumber || receiptData.sn,
            request_no: receiptData.requestNo,
            appointment_no: receiptData.appointmentNo,
            card_image_url: cardImageUrl
        };

        // Only include api_photo_url if it has a value (column may not exist yet before migration)
        if (receiptData.apiPhotoUrl) {
            receiptPayload.api_photo_url = receiptData.apiPhotoUrl;
        }

        let result;
        if (existing && receiptData.isEdit) {
            // v7.1 - Set updated_at explicitly for update
            receiptPayload.updated_at = new Date().toISOString();
            console.log('📝 UPDATE mode - payload:', JSON.stringify(receiptPayload));

            // Update existing (only when explicitly editing)
            result = await window.supabaseClient
                .from('receipts')
                .update(receiptPayload)
                .eq('receipt_no', receiptData.receiptNo)
                .select()
                .single();

            // v7.1 - Validate update actually succeeded
            console.log('📝 UPDATE result:', result.data ? 'success' : 'no data returned', result.error ? 'error: ' + result.error.message : '');
            if (!result.data && !result.error) {
                throw new Error('ไม่สามารถอัพเดทข้อมูลได้ — ไม่พบรายการที่ต้องการแก้ไข');
            }
        } else if (existing && !receiptData.isEdit) {
            // Race condition: another user already saved this receipt number
            // Throw error so the caller can handle it
            throw new Error(`เลขรับที่ ${receiptData.receiptNo} ถูกใช้ไปแล้วโดยผู้ใช้อื่น กรุณาลองใหม่อีกครั้ง`);
        } else {
            // Insert new
            const user = await window.supabaseClient.auth.getUser();
            receiptPayload.created_by = user.data.user?.id;

            result = await window.supabaseClient
                .from('receipts')
                .insert(receiptPayload)
                .select()
                .single();
        }

        if (result.error) throw result.error;

        // Log activity
        await logActivity(existing ? 'edit' : 'add', receiptData.receiptNo, {
            name: receiptPayload.foreigner_name
        });

        return result.data;
    } catch (e) {
        console.error('Error saving to Supabase:', e);
        throw e;
    }
}

// Upload image to Supabase Storage
async function uploadImageToSupabase(receiptNo, base64Data) {
    try {
        // Extract mime type and data
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches) return base64Data; // Return as-is if not base64

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

        const { data, error } = await window.supabaseClient.storage
            .from('card-images')
            .upload(fileName, blob, {
                contentType: mimeType,
                upsert: true
            });

        if (error) throw error;

        const { data: urlData } = window.supabaseClient.storage
            .from('card-images')
            .getPublicUrl(fileName);

        return urlData.publicUrl;
    } catch (e) {
        console.error('Error uploading image:', e);
        return base64Data; // Return original on error
    }
}

// Delete receipt from Supabase
async function deleteReceiptFromSupabase(receiptNo) {
    try {
        // Get receipt info first for logging
        const { data: receipt } = await window.supabaseClient
            .from('receipts')
            .select('foreigner_name')
            .eq('receipt_no', receiptNo)
            .single();

        // Delete from database
        const { error } = await window.supabaseClient
            .from('receipts')
            .delete()
            .eq('receipt_no', receiptNo);

        if (error) throw error;

        // Try to delete image from storage
        const extensions = ['jpg', 'jpeg', 'png', 'gif'];
        for (const ext of extensions) {
            await window.supabaseClient.storage
                .from('card-images')
                .remove([`${receiptNo}.${ext}`]);
        }

        // Log activity
        await logActivity('delete', receiptNo, {
            name: receipt?.foreigner_name
        });

        return true;
    } catch (e) {
        console.error('Error deleting from Supabase:', e);
        throw e;
    }
}

// ==================== //
// Print & Receive Status
// ==================== //

async function markPrintedInSupabase(receiptNo) {
    try {
        const { error } = await window.supabaseClient
            .from('receipts')
            .update({
                is_printed: true,
                printed_at: new Date().toISOString()
            })
            .eq('receipt_no', receiptNo);

        if (error) throw error;

        await logActivity('print', receiptNo);
        return true;
    } catch (e) {
        console.error('Error marking as printed:', e);
        return false;
    }
}

async function toggleReceivedInSupabase(receiptNo) {
    try {
        // Get current status
        const { data: current } = await window.supabaseClient
            .from('receipts')
            .select('is_received, foreigner_name')
            .eq('receipt_no', receiptNo)
            .single();

        const newStatus = !current?.is_received;

        const { error } = await window.supabaseClient
            .from('receipts')
            .update({
                is_received: newStatus,
                received_at: newStatus ? new Date().toISOString() : null
            })
            .eq('receipt_no', receiptNo);

        if (error) throw error;

        await logActivity('receive', receiptNo, {
            name: current?.foreigner_name,
            action: newStatus ? 'received' : 'cancelled'
        });

        return newStatus;
    } catch (e) {
        console.error('Error toggling received status:', e);
        return null;
    }
}

// ==================== //
// Activity Log
// ==================== //

async function logActivity(action, receiptNo, details = {}) {
    try {
        const profile = await SupabaseAuth.getProfile();

        await window.supabaseClient
            .from('activity_logs')
            .insert({
                action,
                receipt_no: receiptNo,
                details,
                user_id: profile?.id,
                user_name: profile?.name || 'Unknown'
            });
    } catch (e) {
        console.error('Error logging activity:', e);
    }
}

async function loadActivityLogFromSupabase(limit = 100) {
    try {
        const { data, error } = await window.supabaseClient
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        return (data || []).map(log => ({
            id: log.id,
            type: log.action,
            title: getActivityTitle(log.action, log.receipt_no),
            details: log.details?.name || '',
            timestamp: log.created_at,
            userName: log.user_name
        }));
    } catch (e) {
        console.error('Error loading activity log:', e);
        return [];
    }
}

function getActivityTitle(action, receiptNo) {
    const titles = {
        'add': `เพิ่มข้อมูล ${receiptNo}`,
        'edit': `แก้ไขข้อมูล ${receiptNo}`,
        'delete': `ลบข้อมูล ${receiptNo}`,
        'print': `พิมพ์ใบรับ ${receiptNo}`,
        'receive': `รับบัตร ${receiptNo}`
    };
    return titles[action] || `${action} ${receiptNo}`;
}

// ==================== //
// UX Analytics (Admin)
// ==================== //

async function loadAnalyticsSummary(days = 30) {
    try {
        const since = new Date();
        since.setDate(since.getDate() - days);

        const { data, error } = await window.supabaseClient
            .from('ux_analytics')
            .select('event_type, event_name, duration_ms, created_at, user_role')
            .gte('created_at', since.toISOString())
            .order('created_at', { ascending: false })
            .limit(1000);

        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('Error loading analytics:', e);
        return [];
    }
}

// ==================== //
// Duplicate Check (v7.1)
// ==================== //

// Check if SN number already exists across all dates
async function checkDuplicateSNFromSupabase(snNumber, excludeReceiptNo = null) {
    try {
        if (!snNumber || !snNumber.trim()) return [];

        let query = window.supabaseClient
            .from('receipts')
            .select('receipt_no, foreigner_name, receipt_date')
            .eq('sn_number', snNumber.trim());

        if (excludeReceiptNo) {
            query = query.neq('receipt_no', excludeReceiptNo);
        }

        const { data, error } = await query.limit(5);
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('Error checking duplicate SN:', e);
        return []; // Don't block save on check failure
    }
}

// Check if same name exists on the same date
async function checkDuplicateNameFromSupabase(foreignerName, receiptDate, excludeReceiptNo = null) {
    try {
        if (!foreignerName || !foreignerName.trim()) return [];

        let query = window.supabaseClient
            .from('receipts')
            .select('receipt_no, foreigner_name, sn_number')
            .eq('foreigner_name', foreignerName.trim())
            .eq('receipt_date', receiptDate);

        if (excludeReceiptNo) {
            query = query.neq('receipt_no', excludeReceiptNo);
        }

        const { data, error } = await query.limit(5);
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('Error checking duplicate name:', e);
        return []; // Don't block save on check failure
    }
}

// ==================== //
// Get Next Receipt Number
// ==================== //

async function getNextReceiptNoFromSupabase() {
    try {
        const today = new Date();
        const year = today.getFullYear();
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const day = today.getDate().toString().padStart(2, '0');
        const datePrefix = `${year}${month}${day}`;

        const { data, error } = await window.supabaseClient
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
    } catch (e) {
        console.error('Error getting next receipt no:', e);
        // Fallback to date-based number
        const today = new Date();
        return `${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}-001`;
    }
}

// ==================== //
// Export for global use
// ==================== //

window.SupabaseAdapter = {
    loadRegistry: loadRegistryFromSupabase,
    searchRegistry: searchRegistryFromSupabase,
    saveReceipt: saveReceiptToSupabase,
    deleteReceipt: deleteReceiptFromSupabase,
    markPrinted: markPrintedInSupabase,
    toggleReceived: toggleReceivedInSupabase,
    loadActivityLog: loadActivityLogFromSupabase,
    getNextReceiptNo: getNextReceiptNoFromSupabase,
    uploadImage: uploadImageToSupabase,
    loadAnalyticsSummary: loadAnalyticsSummary,
    // v7.1 - Duplicate check
    checkDuplicateSN: checkDuplicateSNFromSupabase,
    checkDuplicateName: checkDuplicateNameFromSupabase
};

console.log('✅ Supabase Adapter Loaded (v7.1)');
