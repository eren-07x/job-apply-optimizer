// This script runs automatically on job pages (LinkedIn, Indeed, Naukri)
// Its only job: find the job description text and make it available

function extractJobDescription() {
  // Each job site puts the description in a different HTML element
  // We try each one until we find text

 const selectors = [
  // LinkedIn — these are the actual containers for full JD
  '.jobs-description__container',
  '.jobs-description-content__text',
  '.job-details-jobs-unified-top-card__job-insight',
  '.jobs-box__html-content',
  // Indeed
  '#jobDescriptionText',
  '.jobsearch-jobDescriptionText',
  // Naukri  
  '.job-desc',
  '.dang-inner-html',
  // Generic fallback
  '[class*="description"]',
  '[class*="job-desc"]'
]

  for (const selector of selectors) {
    const element = document.querySelector(selector)
    if (element && element.innerText.trim().length > 100) {
      return element.innerText.trim()
    }
  }

  // Last resort: get all visible text (less accurate but works anywhere)
  return document.body.innerText.trim().slice(0, 3000)
}

// Listen for a message from popup.js asking for the job description
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getJobDescription") {
    
    // Wait 500ms for LinkedIn's JS to finish rendering
    setTimeout(() => {
      const jobDescription = extractJobDescription()
      sendResponse({ jobDescription })
    }, 500)

  }
  return true
})