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

// v9.0 — Helper to get current branch_id for queries
function getCurrentBranchId() {
    return window._viewingBranchId || window._currentBranchId || null;
}

// Load from Supabase - filtered by date (default = today)
// Pass date as 'YYYY-MM-DD' string, or null to load today
// v9.0: branchId param for explicit branch filter (super admin)
async function loadRegistryFromSupabase(date = null, branchId = null) {
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

        // v9.0: Apply branch filter (RLS also filters, but explicit is better for super admin)
        const effectiveBranchId = branchId || getCurrentBranchId();

        let query = window.supabaseClient
            .from('receipts')
            .select('*')
            .eq('receipt_date', date)
            .order('created_at', { ascending: false });

        if (effectiveBranchId) {
            query = query.eq('branch_id', effectiveBranchId);
        }

        const { data: records, error } = await query;

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
            receivedAt: row.received_at,
            // v7.0 - Photo & Signature
            recipientPhotoUrl: row.recipient_photo_url || null,
            recipientSignatureUrl: row.recipient_signature_url || null,
            officerSignatureUrl: row.officer_signature_url || null,
            // v8.5 - Card printer name
            cardPrinterName: row.card_printer_name || null
        }));
    } catch (e) {
        console.error('Error loading from Supabase:', e);
        return [];
    }
}

// Load monthly data with optimized column selection for reports
// NOTE: Current implementation loads full month client-side (~600-1500 records).
// If data volume grows to 10,000+/day, migrate to Server-side RPC with
// PostgreSQL GROUP BY + COUNT for aggregation (requires SQL migration).
// v9.0: branchId param for explicit branch filter (super admin cross-branch report)
async function loadMonthlyDataFromSupabase(month, year, branchId = null) {
    try {
        const monthNum = parseInt(month);
        const yearNum = parseInt(year);

        // Calculate date range for the month
        const startDate = `${yearNum}-${monthNum.toString().padStart(2, '0')}-01`;
        const lastDay = new Date(yearNum, monthNum, 0).getDate();
        const endDate = `${yearNum}-${monthNum.toString().padStart(2, '0')}-${lastDay}`;

        console.log(`📊 Loading monthly data: ${startDate} to ${endDate}`);

        // v9.0: Apply branch filter
        const effectiveBranchId = branchId || getCurrentBranchId();

        // Select only columns needed for monthly report (skip images/signatures)
        let query = window.supabaseClient
            .from('receipts')
            .select('receipt_no, receipt_date, foreigner_name, sn_number, request_no, appointment_no, is_printed, is_received')
            .gte('receipt_date', startDate)
            .lte('receipt_date', endDate)
            .order('receipt_date', { ascending: true })
            .order('created_at', { ascending: false });

        if (effectiveBranchId) {
            query = query.eq('branch_id', effectiveBranchId);
        }

        const { data: records, error } = await query;

        if (error) throw error;

        console.log(`📊 Loaded ${(records || []).length} records for ${month}/${year}`);

        return (records || []).map(row => ({
            receiptNo: row.receipt_no,
            date: formatThaiDateFromISO(row.receipt_date),
            name: row.foreigner_name,
            sn: row.sn_number,
            requestNo: row.request_no,
            appointmentNo: row.appointment_no,
            isPrinted: row.is_printed || false,
            isReceived: row.is_received || false
        }));
    } catch (e) {
        console.error('❌ Failed to load monthly data:', e.message);
        throw e;
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

        let data = null;
        let searchMethod = 'ilike';

        // Try fuzzy search first (requires pg_trgm extension)
        try {
            const { data: fuzzyData, error: fuzzyError } = await window.supabaseClient
                .rpc('search_receipts_fuzzy', {
                    search_query: cleanQuery,
                    max_results: 100
                });

            if (!fuzzyError && fuzzyData) {
                data = fuzzyData;
                searchMethod = 'fuzzy';
            }
        } catch (e) {
            // Fuzzy search not available — fallback to ilike
        }

        // Fallback to ilike if fuzzy not available
        if (!data) {
            const { data: ilikeData, error } = await window.supabaseClient
                .from('receipts')
                .select('*')
                .or(`foreigner_name.ilike.%${cleanQuery}%,receipt_no.ilike.%${cleanQuery}%,request_no.ilike.%${cleanQuery}%,sn_number.ilike.%${cleanQuery}%,appointment_no.ilike.%${cleanQuery}%`)
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            data = ilikeData;
        }

        console.log(`🔍 Search "${cleanQuery}" [${searchMethod}]: found ${(data || []).length} results`);

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
            receivedAt: row.received_at,
            // v7.0 - Photo & Signature
            recipientPhotoUrl: row.recipient_photo_url || null,
            recipientSignatureUrl: row.recipient_signature_url || null,
            officerSignatureUrl: row.officer_signature_url || null,
            // v8.5 - Card printer name
            cardPrinterName: row.card_printer_name || null
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
        // v8.5.2 — Card image upload moved to app-supabase.js (parallel with photo/sig)
        // receiptData.cardImage is now already a URL (or null)
        // Keep cardImageFile param for backward compatibility but prefer receiptData.cardImage
        let cardImageUrl = receiptData.cardImage;
        if (!cardImageUrl && cardImageFile && cardImageFile.startsWith('data:')) {
            // Fallback: upload here if caller still passes raw file (e.g. card-print-app.js)
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
            card_image_url: cardImageUrl,
            // v9.0: branch_id
            branch_id: receiptData.branchId || window._currentBranchId || null
        };

        // Only include api_photo_url if it has a value (column may not exist yet before migration)
        if (receiptData.apiPhotoUrl) {
            receiptPayload.api_photo_url = receiptData.apiPhotoUrl;
        }

        // v7.0 - Include photo & signature URLs if provided
        if (receiptData.recipientPhotoUrl) {
            receiptPayload.recipient_photo_url = receiptData.recipientPhotoUrl;
        }
        if (receiptData.recipientSignatureUrl) {
            receiptPayload.recipient_signature_url = receiptData.recipientSignatureUrl;
        }
        if (receiptData.officerSignatureUrl) {
            receiptPayload.officer_signature_url = receiptData.officerSignatureUrl;
        }

        // v8.5 - Include card printer name (officer who printed the card)
        receiptPayload.card_printer_name = receiptData.cardPrinterName || null;

        console.log('📋 saveReceipt payload v7.0 fields:', {
            recipient_photo_url: receiptPayload.recipient_photo_url || '(none)',
            recipient_signature_url: receiptPayload.recipient_signature_url || '(none)',
            officer_signature_url: receiptPayload.officer_signature_url || '(none)'
        });

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

async function markPrintedBatchInSupabase(receiptNos) {
    try {
        const { error } = await window.supabaseClient
            .from('receipts')
            .update({
                is_printed: true,
                printed_at: new Date().toISOString()
            })
            .in('receipt_no', receiptNos);

        if (error) throw error;

        // Log activity for batch
        await logActivity('batch_print', receiptNos.join(','), {
            count: receiptNos.length,
            receipt_nos: receiptNos
        });
        return true;
    } catch (e) {
        console.error('Error batch marking as printed:', e);
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

// v9.0: includes branch_id in activity log
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
                user_name: profile?.name || 'Unknown',
                branch_id: profile?.branch_id || window._currentBranchId || null
            });
    } catch (e) {
        console.error('Error logging activity:', e);
    }
}

// v9.0: branchId param for branch-scoped activity log
async function loadActivityLogFromSupabase(limit = 100, branchId = null) {
    try {
        const effectiveBranchId = branchId || getCurrentBranchId();

        let query = window.supabaseClient
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (effectiveBranchId) {
            query = query.eq('branch_id', effectiveBranchId);
        }

        const { data, error } = await query;

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
// v9.0: NO branch filter — SN must be unique across ALL branches (RLS bypassed via RPC if needed)
async function checkDuplicateSNFromSupabase(snNumber, excludeReceiptNo = null) {
    try {
        if (!snNumber || !snNumber.trim()) return [];

        // Use RPC with SECURITY DEFINER to check cross-branch duplicates
        const { data, error } = await window.supabaseClient
            .rpc('check_sn_duplicate', {
                p_sn_number: snNumber.trim(),
                p_exclude_receipt_no: excludeReceiptNo || null
            });

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

// v9.0: scope by branch_id to prevent collision across branches
async function getNextReceiptNoFromSupabase() {
    try {
        const today = new Date();
        const year = today.getFullYear();
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const day = today.getDate().toString().padStart(2, '0');
        const datePrefix = `${year}${month}${day}`;

        let query = window.supabaseClient
            .from('receipts')
            .select('receipt_no')
            .like('receipt_no', `${datePrefix}-%`)
            .order('receipt_no', { ascending: false })
            .limit(1);

        // v9.0: scope to current branch
        const branchId = getCurrentBranchId();
        if (branchId) {
            query = query.eq('branch_id', branchId);
        }

        const { data, error } = await query;

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

// ==================== //
// Photo & Signature Upload (v7.0)
// ==================== //

// Upload recipient photo to Storage
async function uploadPhotoToStorage(base64Data, receiptNo) {
    try {
        console.log('📷 uploadPhotoToStorage called, receiptNo:', receiptNo, 'dataLen:', base64Data?.length);
        if (!base64Data || !base64Data.startsWith('data:')) {
            console.warn('📷 uploadPhoto: Invalid data - not a data URL');
            return null;
        }

        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches) {
            console.warn('📷 uploadPhoto: Regex did not match data URL');
            return null;
        }

        const mimeType = matches[1];
        const base64 = matches[2];
        const fileName = `photos/${receiptNo}_photo.jpg`;
        console.log('📷 uploadPhoto: mimeType:', mimeType, 'fileName:', fileName, 'base64Len:', base64.length);

        const byteCharacters = atob(base64);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteArray[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: mimeType });
        console.log('📷 uploadPhoto: blob size:', blob.size, 'bytes');

        const { data, error } = await window.supabaseClient.storage
            .from('card-images')
            .upload(fileName, blob, { contentType: mimeType, upsert: true });

        if (error) {
            console.error('📷 uploadPhoto: Storage upload error:', error);
            throw error;
        }
        console.log('📷 uploadPhoto: Upload success, data:', data);

        const { data: urlData } = window.supabaseClient.storage
            .from('card-images')
            .getPublicUrl(fileName);

        console.log('📷 uploadPhoto: Public URL:', urlData.publicUrl);
        return urlData.publicUrl;
    } catch (e) {
        console.error('📷 uploadPhoto: EXCEPTION:', e);
        return null;
    }
}

// Upload signature image to Storage
async function uploadSignatureToStorage(base64Data, fileName) {
    try {
        if (!base64Data || !base64Data.startsWith('data:')) return null;

        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches) return null;

        const mimeType = matches[1];
        const base64 = matches[2];

        const byteCharacters = atob(base64);
        const byteArray = new Uint8Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteArray[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: mimeType });

        const { data, error } = await window.supabaseClient.storage
            .from('card-images')
            .upload(fileName, blob, { contentType: mimeType, upsert: true });

        if (error) throw error;

        const { data: urlData } = window.supabaseClient.storage
            .from('card-images')
            .getPublicUrl(fileName);

        return urlData.publicUrl;
    } catch (e) {
        console.error('Error uploading signature:', e);
        return null;
    }
}

// Save officer signature to profile
async function saveOfficerSignatureToProfile(userId, base64Data) {
    try {
        const fileName = `officer-signatures/${userId}.png`;
        const signatureUrl = await uploadSignatureToStorage(base64Data, fileName);
        if (!signatureUrl) throw new Error('Upload failed');

        const { error } = await window.supabaseClient
            .from('profiles')
            .update({ signature_url: signatureUrl })
            .eq('id', userId);

        if (error) throw error;
        return signatureUrl;
    } catch (e) {
        console.error('Error saving officer signature:', e);
        throw e;
    }
}

// Get officer signature from profile
async function getOfficerSignatureFromProfile(userId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('profiles')
            .select('signature_url')
            .eq('id', userId)
            .maybeSingle();

        if (error) throw error;
        return data?.signature_url || null;
    } catch (e) {
        console.error('Error getting officer signature:', e);
        return null;
    }
}

window.SupabaseAdapter = {
    loadRegistry: loadRegistryFromSupabase,
    searchRegistry: searchRegistryFromSupabase,
    saveReceipt: saveReceiptToSupabase,
    deleteReceipt: deleteReceiptFromSupabase,
    markPrinted: markPrintedInSupabase,
    markPrintedBatch: markPrintedBatchInSupabase,
    toggleReceived: toggleReceivedInSupabase,
    loadActivityLog: loadActivityLogFromSupabase,
    getNextReceiptNo: getNextReceiptNoFromSupabase,
    uploadImage: uploadImageToSupabase,
    loadAnalyticsSummary: loadAnalyticsSummary,
    // v7.0 - Photo & Signature
    uploadPhoto: uploadPhotoToStorage,
    uploadSignature: uploadSignatureToStorage,
    saveOfficerSignature: saveOfficerSignatureToProfile,
    getOfficerSignature: getOfficerSignatureFromProfile,
    // v7.1 - Duplicate check
    checkDuplicateSN: checkDuplicateSNFromSupabase,
    checkDuplicateName: checkDuplicateNameFromSupabase,
    // v8.2 - Monthly report
    loadMonthlyData: loadMonthlyDataFromSupabase
};

console.log('✅ Supabase Adapter Loaded (v7.1)');
