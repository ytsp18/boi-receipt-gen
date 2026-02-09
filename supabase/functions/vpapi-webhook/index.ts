// Edge Function: vpapi-webhook
// Receives data from VP system and stores in pending_receipts table
// Deploy: supabase functions deploy vpapi-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    // Only accept POST
    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    try {
        // Validate API key
        const apiKey = req.headers.get('x-api-key')
        const expectedKey = Deno.env.get('VPAPI_WEBHOOK_SECRET')

        if (!expectedKey || apiKey !== expectedKey) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Parse request body
        const body = await req.json()

        // Validate required fields
        if (!body.Appointment) {
            return new Response(
                JSON.stringify({ error: 'Missing required field: Appointment' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Check response status from API
        if (body.ResponseStatus !== undefined && body.ResponseStatus !== 1) {
            return new Response(
                JSON.stringify({
                    error: 'Invalid response status',
                    responseStatus: body.ResponseStatus,
                    message: body.ResponseMessage || 'Unknown error'
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Create Supabase admin client (service_role)
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Prepare data for pending_receipts
        const pendingData = {
            appointment_no: String(body.Appointment || ''),
            request_no: body.SwAppNo || null,
            foreigner_name: body.NameEn || null,
            api_photo_url: body.Pic || null,
            raw_data: body,
            status: 'pending',
        }

        // Upsert (insert or update if appointment_no already exists)
        const { data, error } = await supabase
            .from('pending_receipts')
            .upsert(pendingData, {
                onConflict: 'appointment_no',
                ignoreDuplicates: false,
            })
            .select()
            .single()

        if (error) {
            console.error('Database error:', error)
            return new Response(
                JSON.stringify({ error: 'Database error', details: error.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log(`✅ Stored pending receipt: ${pendingData.appointment_no} (${pendingData.foreigner_name})`)

        return new Response(
            JSON.stringify({
                success: true,
                appointment: pendingData.appointment_no,
                name: pendingData.foreigner_name,
                id: data.id,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        console.error('Webhook error:', err)
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: err.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
