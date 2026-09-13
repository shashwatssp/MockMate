// Teacher Page OG metadata (Phase 5.3)
//
// Social crawlers (WhatsApp, iMessage, Twitter/X, Slack…) do not execute JS,
// so the SPA's client-side meta injection is invisible to them. This edge
// function serves a minimal prerendered HTML shell for a teacher page with
// REAL Open Graph/Twitter tags for published pages only.
//
// Deploy:
//   supabase functions deploy teacher-page-og --no-verify-jwt
// Then point a rewrite (or a custom domain route) for /t/* at this function,
// or share links of the form:
//   https://<project>.supabase.co/functions/v1/teacher-page-og/t/<slug>
//
// The function is read-only, uses the service role ONLY to bypass RLS for
// the published-page lookup, and never exposes draft pages.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const html = (title: string, description: string, image: string | null, slug: string): string => {
  const safeTitle = escapeHtml(title)
  const safeDescription = escapeHtml(description)
  const safeImage = image ? escapeHtml(image) : ''
  const imageTags = image
    ? `<meta property="og:image" content="${safeImage}" />
    <meta property="og:image:alt" content="${safeTitle}" />
    <meta name="twitter:image" content="${safeImage}" />
    <meta name="twitter:card" content="summary_large_image" />`
    : `<meta name="twitter:card" content="summary" />`
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:type" content="profile" />
    <meta property="og:url" content="/t/${escapeHtml(slug)}" />
    ${imageTags}
  </head>
  <body>
    <p>${safeTitle} — ${safeDescription}</p>
    <p><a href="/t/${escapeHtml(slug)}">Open this teacher page</a></p>
  </body>
</html>`
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('STORAGE_URL') || ''
  const supabaseServiceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('SERVICE_ROLE_KEY') ||
    ''

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response('Server misconfigured', { status: 500 })
  }

  // Accept both /t/<slug> (path rewrite) and ?slug=<slug> (query form).
  const url = new URL(req.url)
  const slug = url.pathname.split('/').filter(Boolean).pop()?.toLowerCase() ??
    url.searchParams.get('slug')?.toLowerCase() ?? ''
  if (!slug) {
    return new Response('Not found', { status: 404 })
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // Published pages only — drafts must stay hidden (slug discovery).
    const { data, error } = await supabaseAdmin
      .from('teacher_pages')
      .select('slug, display_name, coaching_name, tagline, bio, hero_image_url')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()

    if (error || !data) {
      return new Response('Not found', { status: 404 })
    }

    const title = data.coaching_name
      ? `${data.coaching_name} — ${data.display_name ?? 'MockMate teacher page'}`
      : `${data.display_name ?? 'Teacher'} on MockMate`
    const description = data.tagline || (data.bio ? String(data.bio).slice(0, 160) : 'View classes, results and batches on this MockMate teacher page.')
    const image = typeof data.hero_image_url === 'string' && data.hero_image_url
      ? data.hero_image_url
      : null

    return new Response(html(title, description, image, data.slug), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Cache crawls briefly — published metadata changes are not urgent.
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (err) {
    console.error('teacher-page-og error:', err)
    return new Response('Internal error', { status: 500 })
  }
})
