import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {

  // Handle CORS — browsers require this for cross-origin requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      }
    })
  }

  try {
    // 1. Get the user's auth token from the request header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return errorResponse('Not logged in', 401)
    }

    // 2. Verify the token is valid and get the user
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return errorResponse('Invalid session. Please log in again.', 401)
    }

    // 3. Check their profile — are they subscribed or have free uses left?
    const { data: profile } = await supabase
      .from('profiles')
      .select('free_uses_remaining, is_subscribed')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return errorResponse('Profile not found.', 404)
    }

    const canUse = profile.is_subscribed || profile.free_uses_remaining > 0

    if (!canUse) {
      return errorResponse('FREE_LIMIT_REACHED', 403)
    }

    // 4. Get resume + job description from the request
    const { resume, jobDescription } = await req.json()

    if (!resume || !jobDescription) {
      return errorResponse('Missing resume or job description.', 400)
    }

    // 5. Call Claude — API key is safe here on the server
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: buildPrompt(resume, jobDescription)
        }]
      })
    })

    const claudeData = await claudeResponse.json()
    const result = claudeData.content[0].text

    // 6. If they used a free credit, decrement the count
    if (!profile.is_subscribed) {
      await supabase
        .from('profiles')
        .update({ free_uses_remaining: profile.free_uses_remaining - 1 })
        .eq('id', user.id)
    }

    // 7. Return the result
    return new Response(
      JSON.stringify({ success: true, result, freUsesRemaining: profile.free_uses_remaining - 1 }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )

  } catch (err) {
    return errorResponse('Server error: ' + err.message, 500)
  }
})

function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  )
}

function buildPrompt(resume: string, jobDescription: string): string {
  return `You are an expert resume coach and career advisor.

A user wants to apply for this job:
<job_description>
${jobDescription}
</job_description>

Their current resume:
<resume>
${resume}
</resume>

Please provide:

1. TAILORED RESUME BULLETS (3-5 bullet points that rewrite their experience to match this specific job)
2. COVER LETTER (a concise, 3-paragraph professional cover letter for this role)
3. KEYWORDS MISSING (3-5 keywords from the job description not in their resume)

Format your response clearly with these exact headings:
## Tailored Resume Bullets
## Cover Letter
## Keywords to Add`
}