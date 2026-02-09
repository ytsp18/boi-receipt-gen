// Edge Function: vpapi-sync
// Scheduled polling to fetch new data from VP/SWD API
// Deploy: supabase functions deploy vpapi-sync
// Schedule: Set up via Supabase Cron (e.g., every 15 minutes)
//
// Manual trigger: POST /vpapi-sync with Authorization header
// Cron trigger: Supabase scheduler calls this automatically

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// VP API configuration
const VP_API_BASE_URL = Deno.env.get('VP_API_BASE_URL') || 'https://ewp-api.doe.go.th/admin_boi_delphi_api'

interface AuthResponse {
    token?: string
    access_token?: string
    Token?: string
    [key: string]: unknown
}

interface VPDataResponse {
    ResponseStatus: number
    ResponseMessage?: string
    Appointment?: string
    SwAppNo?: string
    NameEn?: string
    Pic?: string
    [key: string]: unknown
}

// Step 1: Authenticate with VP API
async function authenticateVP(): Promise<string> {
    const username = Deno.env.get('VP_API_USERNAME')
    const password = Deno.env.get('VP_API_PASSWORD')

    if (!username || !password) {
        throw new Error('VP API credentials not configured (VP_API_USERNAME, VP_API_PASSWORD)')
    }

    const authUrl = `${VP_API_BASE_URL}/api/AdminBoi/VPxWams/Auth`

    console.log(`🔐 Authenticating with VP API: ${authUrl}`)

    const response = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            Username: username,
            Password: password,
        }),
    })

    if (!response.ok) {
        const text = await response.text()
        throw new Error(`VP Auth failed (${response.status}): ${text}`)
    }

    const data: AuthResponse = await response.json()

    // Try different token field names
    const token = data.token || data.access_token || data.Token
    if (!token) {
        throw new Error(`VP Auth response missing token: ${JSON.stringify(data)}`)
    }

    console.log('✅ VP API authenticated successfully')
    return token as string
}

// Step 2: Fetch data from VP API for a specific appointment
async function fetchVPData(token: string, appointmentNo: string): Promise<VPDataResponse | null> {
    const dataUrl = `${VP_API_BASE_URL}/api/AdminBoi/VPxWams/GetData`

    console.log(`📡 Fetching VP data for appointment: ${appointmentNo}`)

    const response = await fetch(dataUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
            Appointment: appointmentNo,
        }),
    })

    if (!response.ok) {
        console.error(`VP GetData failed (${response.status}) for ${appointmentNo}`)
        return null
    }

    const data: VPDataResponse = await response.json()

    if (data.ResponseStatus !== 1) {
        console.log(`⚠️ VP GetData returned status ${data.ResponseStatus} for ${appointmentNo}: ${data.ResponseMessage}`)
        return null
    }

    return data
}

// Step 3: Fetch list of available appointments (if API supports it)
async function fetchVPList(token: string): Promise<VPDataResponse[]> {
    const listUrl = `${VP_API_BASE_URL}/api/AdminBoi/VPxWams/GetList`

    console.log('📋 Fetching VP appointment list...')

    try {
        const response = await fetch(listUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({}),
        })

        if (!response.ok) {
            console.log(`VP GetList not available (${response.status}), skipping list fetch`)
            return []
        }

        const data = await response.json()

        // Handle different response formats
        if (Array.isArray(data)) {
            return data
        } else if (data.data && Array.isArray(data.data)) {
            return data.data
        } else if (data.ResponseStatus === 1) {
            return [data]
        }

        return []
    } catch (err) {
        console.log('VP GetList error:', err.message)
        return []
    }
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Create Supabase admin client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Allow manual trigger with specific appointments
        let specificAppointments: string[] = []
        if (req.method === 'POST') {
            try {
                const body = await req.json()
                if (body.appointments && Array.isArray(body.appointments)) {
                    specificAppointments = body.appointments
                }
            } catch {
                // No body or invalid JSON - that's OK for scheduled runs
            }
        }

        // Step 1: Authenticate
        let token: string
        try {
            token = await authenticateVP()
        } catch (authErr) {
            console.error('❌ VP Authentication failed:', authErr.message)
            return new Response(
                JSON.stringify({ error: 'VP Authentication failed', details: authErr.message }),
                { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const results = {
            synced: 0,
            skipped: 0,
            errors: 0,
            details: [] as Array<{ appointment: string; status: string; name?: string }>,
        }

        // Step 2: Get list of appointments to process
        let appointmentsToProcess: string[] = specificAppointments

        if (appointmentsToProcess.length === 0) {
            // Try to get list from VP API
            const vpList = await fetchVPList(token)

            if (vpList.length > 0) {
                // Extract appointment numbers from list
                appointmentsToProcess = vpList
                    .map(item => String(item.Appointment || ''))
                    .filter(a => a.length > 0)

                console.log(`📋 Found ${appointmentsToProcess.length} appointments from VP API`)
            } else {
                console.log('ℹ️ No appointments to process (VP GetList returned empty)')
                return new Response(
                    JSON.stringify({
                        success: true,
                        message: 'No new appointments available from VP API',
                        results,
                    }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        }

        // Step 3: Check which appointments we already have
        const { data: existingRecords } = await supabase
            .from('pending_receipts')
            .select('appointment_no')
            .in('appointment_no', appointmentsToProcess)

        const existingSet = new Set((existingRecords || []).map(r => r.appointment_no))

        // Filter to only new appointments
        const newAppointments = appointmentsToProcess.filter(a => !existingSet.has(a))
        console.log(`🆕 ${newAppointments.length} new appointments to fetch (${existingSet.size} already exist)`)

        // Step 4: Fetch data for each new appointment
        for (const appointmentNo of newAppointments) {
            try {
                const vpData = await fetchVPData(token, appointmentNo)

                if (!vpData) {
                    results.skipped++
                    results.details.push({ appointment: appointmentNo, status: 'skipped' })
                    continue
                }

                // Store in pending_receipts
                const { error } = await supabase
                    .from('pending_receipts')
                    .upsert({
                        appointment_no: String(vpData.Appointment || appointmentNo),
                        request_no: vpData.SwAppNo || null,
                        foreigner_name: vpData.NameEn || null,
                        api_photo_url: vpData.Pic || null,
                        raw_data: vpData,
                        status: 'pending',
                    }, {
                        onConflict: 'appointment_no',
                        ignoreDuplicates: false,
                    })

                if (error) {
                    console.error(`❌ DB error for ${appointmentNo}:`, error)
                    results.errors++
                    results.details.push({ appointment: appointmentNo, status: 'error' })
                } else {
                    results.synced++
                    results.details.push({
                        appointment: appointmentNo,
                        status: 'synced',
                        name: vpData.NameEn || undefined,
                    })
                    console.log(`✅ Synced: ${appointmentNo} (${vpData.NameEn})`)
                }

                // Small delay between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200))

            } catch (fetchErr) {
                console.error(`❌ Error fetching ${appointmentNo}:`, fetchErr.message)
                results.errors++
                results.details.push({ appointment: appointmentNo, status: 'error' })
            }
        }

        console.log(`📊 Sync complete: ${results.synced} synced, ${results.skipped} skipped, ${results.errors} errors`)

        return new Response(
            JSON.stringify({
                success: true,
                message: `Sync complete: ${results.synced} new, ${results.skipped} skipped, ${results.errors} errors`,
                results,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        console.error('Sync error:', err)
        return new Response(
            JSON.stringify({ error: 'Sync failed', details: err.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
