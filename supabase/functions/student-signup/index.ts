import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const withCors = (extra: Record<string, string> = {}) => ({ ...corsHeaders, ...extra })

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('STORAGE_URL') || ''
  const supabaseServiceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('SERVICE_ROLE_KEY') ||
    ''

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: withCors({ 'Content-Type': 'application/json' }) }
    )
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  try {
    const body = await req.json()
    const { email, password, name } = body

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
      { status: 400, headers: withCors({ 'Content-Type': 'application/json' }) }
      )
    }
    // Use the Admin API to create the user with email already confirmed.
    // createUser() with email_confirm: true does NOT send any email — no
    // confirmation email, no welcome email. The student is created confirmed
    // and ready to sign in immediately. The on_auth_user_created trigger will
    // auto-provision a `students` profile row (is_approved=false).
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: name ? { full_name: name } : {},
    })

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
      { status: 400, headers: withCors({ 'Content-Type': 'application/json' }) }
      )
    }

    return new Response(
      JSON.stringify({
        user_id: data.user?.id,
        email: data.user?.email,
        confirmed: true,
      }),
      { status: 200, headers: withCors({ 'Content-Type': 'application/json' }) }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: withCors({ 'Content-Type': 'application/json' }) }
    )
  }
})
