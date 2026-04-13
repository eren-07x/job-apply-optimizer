// ── Elements ──
const authScreen   = document.getElementById('authScreen')
const mainApp      = document.getElementById('mainApp')
const authTitle    = document.getElementById('authTitle')
const authSub      = document.getElementById('authSub')
const authEmail    = document.getElementById('authEmail')
const authPassword = document.getElementById('authPassword')
const authBtn      = document.getElementById('authBtn')
const authError    = document.getElementById('authError')
const authSwitch   = document.getElementById('authSwitch')
const authToggle   = document.getElementById('authToggle')
const userChip     = document.getElementById('userChip')
const usageText    = document.getElementById('usageText')
const upgradeLink  = document.getElementById('upgradeLink')
const tabs         = document.querySelectorAll('.tab')
const panels       = document.querySelectorAll('.panel')
const tailorBtn    = document.getElementById('tailorBtn')
const resumeInput  = document.getElementById('resumeInput')
const errorBox     = document.getElementById('errorBox')
const paywallBox   = document.getElementById('paywallBox')
const paywallUpgradeBtn = document.getElementById('paywallUpgradeBtn')
const jdDot        = document.getElementById('jdDot')
const jdStatus     = document.getElementById('jdStatus')
const jdRetry      = document.getElementById('jdRetry')
const savedResume  = document.getElementById('savedResume')
const saveResumeBtn = document.getElementById('saveResumeBtn')
const savedMsg     = document.getElementById('savedMsg')
const signOutBtn   = document.getElementById('signOutBtn')
const resultContent = document.getElementById('resultContent')

let detectedJobDescription = ''
let isSignUp = true

// ── On open: check if already logged in ──
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['session'], (result) => {
    if (result.session) {
      showMainApp(result.session.user)
    } else {
      showAuthScreen()
    }
  })
})

// ── Auth mode toggle (signup ↔ login) ──
authSwitch.addEventListener('click', () => {
  isSignUp = !isSignUp
  if (isSignUp) {
    authTitle.textContent = 'Create your account'
    authSub.textContent = 'Get 3 free tailored resumes + cover letters'
    authBtn.textContent = 'Create account'
    authSwitch.textContent = 'Log in'
    authToggle.childNodes[0].textContent = 'Already have an account? '
  } else {
    authTitle.textContent = 'Welcome back'
    authSub.textContent = 'Log in to your account'
    authBtn.textContent = 'Log in'
    authSwitch.textContent = 'Sign up'
    authToggle.childNodes[0].textContent = "Don't have an account? "
  }
  hideAuthError()
})

// ── Submit auth form ──
authBtn.addEventListener('click', async () => {
  const email = authEmail.value.trim()
  const password = authPassword.value.trim()

  if (!email || !password) {
    showAuthError('Please enter your email and password.')
    return
  }
  if (password.length < 6) {
    showAuthError('Password must be at least 6 characters.')
    return
  }

  authBtn.disabled = true
  authBtn.textContent = isSignUp ? 'Creating account...' : 'Logging in...'
  hideAuthError()

  chrome.runtime.sendMessage(
    isSignUp
      ? { action: 'signUp', email, password }
      : { action: 'signIn', email, password },
    (response) => {
      authBtn.disabled = false
      authBtn.textContent = isSignUp ? 'Create account' : 'Log in'

      if (!response || !response.success) {
        showAuthError(response?.error || 'Something went wrong.')
        return
      }
      showMainApp(response.user)
    }
  )
})

// Allow pressing Enter to submit
authPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') authBtn.click()
})

// ── Show main app after login ──
function showMainApp(user) {
  authScreen.style.display = 'none'
  mainApp.style.display = 'block'

  // Safely get email — handle different response shapes from Supabase
  const email = user?.email || user?.identities?.[0]?.identity_data?.email || ''
  const emailShort = email ? email.split('@')[0] : 'account'
  userChip.textContent = emailShort

  loadSavedResume()
  loadProfile()
  detectJobDescription()
}

// ── Show auth screen ──
function showAuthScreen() {
  mainApp.style.display = 'none'
  authScreen.style.display = 'block'
}

// ── Load profile and show usage count ──
function loadProfile() {
  chrome.runtime.sendMessage({ action: 'getProfile' }, (response) => {
    if (!response || !response.success) return

    const { free_uses_remaining, is_subscribed } = response.profile

    if (is_subscribed) {
      usageText.textContent = 'Pro plan — unlimited uses'
      upgradeLink.style.display = 'none'
    } else {
      usageText.textContent = `${free_uses_remaining} free use${free_uses_remaining !== 1 ? 's' : ''} remaining`
      if (free_uses_remaining === 0) {
        upgradeLink.style.display = 'block'
        tailorBtn.style.display = 'none'
        paywallBox.style.display = 'block'
      } else {
        upgradeLink.style.display = free_uses_remaining <= 1 ? 'block' : 'none'
      }
    }
  })
}

// ── Sign out ──
signOutBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'signOut' }, () => {
    showAuthScreen()
  })
})

// ── Clicking username chip signs out too (with confirm) ──
userChip.addEventListener('click', () => {
  if (confirm('Sign out?')) {
    chrome.runtime.sendMessage({ action: 'signOut' }, () => {
      showAuthScreen()
    })
  }
})

// ── Tab switching ──
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'))
    panels.forEach(p => p.classList.remove('active'))
    tab.classList.add('active')
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active')
  })
})

// ── Load saved resume ──
function loadSavedResume() {
  chrome.storage.local.get(['savedResume'], (result) => {
    if (result.savedResume) {
      resumeInput.value = result.savedResume
      savedResume.value = result.savedResume
    }
  })
}

// ── Save resume ──
saveResumeBtn.addEventListener('click', () => {
  const text = savedResume.value.trim()
  if (!text) return
  chrome.storage.local.set({ savedResume: text }, () => {
    resumeInput.value = text
    savedMsg.style.display = 'block'
    setTimeout(() => savedMsg.style.display = 'none', 2500)
  })
})

// ── Detect job description ──
function detectJobDescription() {
  jdDot.classList.remove('detected')
  jdStatus.textContent = 'Looking for job description...'

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0]
    const supported = ['linkedin.com/jobs', 'indeed.com', 'naukri.com']
    const isSupported = supported.some(s => currentTab.url.includes(s))

    if (!isSupported) {
      jdStatus.textContent = 'Open a job on LinkedIn, Indeed, or Naukri'
      return
    }

    chrome.tabs.sendMessage(currentTab.id, { action: 'getJobDescription' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        jdStatus.textContent = 'Could not read page. Try refreshing.'
        return
      }
      if (response.jobDescription && response.jobDescription.length > 100) {
        detectedJobDescription = response.jobDescription
        jdDot.classList.add('detected')
        jdStatus.textContent = 'Detected: ' + response.jobDescription.slice(0, 60) + '...'
      } else {
        jdStatus.textContent = 'No job description found on this page.'
      }
    })
  })
}

jdRetry.addEventListener('click', detectJobDescription)

// ── Main action ──
tailorBtn.addEventListener('click', () => {
  const resume = resumeInput.value.trim()

  if (!resume) { showError('Please paste your resume first.'); return }
  if (!detectedJobDescription) {
    showError('No job description detected. Open a job page first, then retry.')
    return
  }

  tailorBtn.disabled = true
  tailorBtn.textContent = 'Analyzing...'
  hideError()

  chrome.runtime.sendMessage({
    action: 'tailorResume',
    data: { resume, jobDescription: detectedJobDescription }
  }, (response) => {
    tailorBtn.disabled = false
    tailorBtn.textContent = 'Tailor my resume + generate cover letter'

    if (!response || !response.success) {
      if (response?.error === 'FREE_LIMIT_REACHED') {
        tailorBtn.style.display = 'none'
        paywallBox.style.display = 'block'
        usageText.textContent = '0 free uses remaining'
        upgradeLink.style.display = 'block'
        return
      }
      showError(response?.error || 'Something went wrong.')
      return
    }

    // Update usage count display
    loadProfile()
    renderResult(response.result)
    switchToTab('result')
  })
})

// ── Upgrade button — opens Stripe (we'll add the real link in the next step) ──
paywallUpgradeBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://forms.gle/JXcZBWxKu4dSizF56' })
})
upgradeLink.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://forms.gle/JXcZBWxKu4dSizF56' })
})

// ── Render Claude's result ──
function renderResult(rawText) {
  const sections = {
    'Tailored Resume Bullets': '',
    'Cover Letter': '',
    'Keywords to Add': ''
  }
  let currentSection = null

  rawText.split('\n').forEach(line => {
    if (line.startsWith('## ')) {
      const heading = line.replace('## ', '').trim()
      if (sections.hasOwnProperty(heading)) { currentSection = heading; return }
    }
    if (currentSection) sections[currentSection] += line + '\n'
  })

  let html = ''
  for (const [title, content] of Object.entries(sections)) {
    const trimmed = content.trim()
    if (!trimmed) continue
    const id = 'box-' + title.replace(/\s+/g, '-')
    html += `
      <div class="result-section">
        <div class="result-label">${title}</div>
        <div class="result-box" id="${id}">${formatMarkdown(trimmed)}</div>
        <button class="copy-btn" data-target="${id}">Copy</button>
      </div>`
  }

  if (!html) html = `<div class="result-box">${formatMarkdown(rawText)}</div>`
  resultContent.innerHTML = html

  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = document.getElementById(btn.dataset.target).innerText
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!'
        btn.classList.add('copied')
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied') }, 2000)
      })
    })
  })
}

function formatMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[•\-]\s+(.*)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n/g, '<br>')
}

// ── Helpers ──
function showError(msg) { errorBox.textContent = msg; errorBox.style.display = 'block' }
function hideError() { errorBox.style.display = 'none' }
function showAuthError(msg) { authError.textContent = msg; authError.style.display = 'block' }
function hideAuthError() { authError.style.display = 'none' }
function switchToTab(name) {
  tabs.forEach(t => t.classList.remove('active'))
  panels.forEach(p => p.classList.remove('active'))
  document.querySelector(`[data-tab="${name}"]`).classList.add('active')
  document.getElementById(`panel-${name}`).classList.add('active')
}