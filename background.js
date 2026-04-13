const SUPABASE_URL = 'https://luagsruximdeiasunrhk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1YWdzcnV4aW1kZWlhc3VucmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNDY0OTEsImV4cCI6MjA4OTgyMjQ5MX0.K53g77JU9L9_SrNLaE0JeAZF06Q4NoMhzcHafz9rl9s' // paste from Supabase → Settings → API

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === 'tailorResume') {
    handleTailorResume(request.data)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }))
    return true
  }

  if (request.action === 'signUp') {
    signUp(request.email, request.password)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }))
    return true
  }

  if (request.action === 'signIn') {
    signIn(request.email, request.password)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }))
    return true
  }

  if (request.action === 'signOut') {
    chrome.storage.local.remove(['session'], () => {
      sendResponse({ success: true })
    })
    return true
  }

  if (request.action === 'getProfile') {
    getProfile()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }))
    return true
  }

})

// ── Auth: Sign Up ──
async function signUp(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password })
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || data.msg)

  // After signup, immediately sign in to get a proper session token
  // (Supabase signup doesn't always return a full session)
  return await signIn(email, password)
}

// ── Auth: Sign In ──
async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password })
  })
  const data = await res.json()
  if (data.error || data.error_description) {
  throw new Error(data.error_description || data.error?.message || data.msg || 'Invalid email or password.')
}

  await saveSession(data)
  return { success: true, user: data.user }
}

// ── Get user profile (usage count + subscription status) ──
async function getProfile() {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not logged in' }

  // Always refresh token first so profile fetch never fails with expired token
  const freshToken = await refreshToken(session)

  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}&select=*`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${freshToken}`,
    }
  })
  const data = await res.json()
  if (!data || !data[0]) return { success: false, error: 'Profile not found' }
  return { success: true, profile: data[0] }
}

// ── Call your Edge Function ──
async function handleTailorResume({ resume, jobDescription }) {
  const session = await getSession()
  if (!session) throw new Error('Please log in first.')

  const res = await fetch(`${SUPABASE_URL}/functions/v1/tailor-resume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ resume, jobDescription })
  })

  const data = await res.json()

  // Special case: free limit reached
  if (data.error === 'FREE_LIMIT_REACHED') {
    return { success: false, error: 'FREE_LIMIT_REACHED' }
  }

  if (!data.success) throw new Error(data.error || 'Something went wrong')
  return { success: true, result: data.result, freeUsesRemaining: data.freeUsesRemaining }
}

// ── Session helpers (save/get from chrome.storage) ──
function saveSession(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      session: {
        access_token: data.access_token,
        user: data.user
      }
    }, resolve)
  })
}

function getSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['session'], (result) => {
      resolve(result.session || null)
    })
  })
}