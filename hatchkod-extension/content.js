let scrapingInterval = null;

function scrapeParticipants() {
  const participants = new Set();
  
  // Method 1: People tab list items (most reliable when tab is open)
  const listItems = document.querySelectorAll('div[role="listitem"]');
  listItems.forEach(el => {
    // Usually the name is in a span inside the list item
    // We look for direct text or nested span text
    const textNodes = Array.from(el.querySelectorAll('*')).filter(node => 
      node.childNodes.length === 1 && node.childNodes[0].nodeType === 3
    );
    
    // Pick the longest string that looks like a name
    let name = "";
    textNodes.forEach(node => {
      const text = node.innerText.trim();
      if (text.length > 2 && text.length < 40 && !text.includes('Meeting') && !text.includes('Pin') && !text.includes('Mute') && !text.includes('left') && !text.includes('joined')) {
        name = text.replace(/\(You\)/ig, '').trim();
      }
    });
    
    if (name) participants.add(name);
  });

  // Method 2: Data attributes (video grid / general elements)
  document.querySelectorAll('[data-participant-id], [data-requested-participant-id]').forEach(el => {
    // We can extract name from textContent of the element if it's short enough
    const text = el.textContent || "";
    let cleanText = text.replace(/is speaking/ig, '')
                        .replace(/microphone off/ig, '')
                        .replace(/\(You\)/ig, '')
                        .replace(/You/g, '')
                        .replace(/more actions/ig, '')
                        .replace(/adaptive_audio_mic_off/ig, '')
                        .replace(/devices/ig, '')
                        .trim();
    if (cleanText && cleanText.length > 2 && cleanText.length < 40 && !cleanText.includes('Presenting') && !cleanText.includes('left') && !cleanText.includes('joined') && !cleanText.includes('more actions') && !cleanText.includes('adaptive')) {
      participants.add(cleanText);
    }
  });

  // Method 3: Aria-labels on video tiles/avatars
  document.querySelectorAll('[aria-label]').forEach(el => {
    const label = el.getAttribute('aria-label') || "";
    // e.g. "John Doe's microphone is off" or "Jane Doe is speaking"
    if (label.includes('’s microphone') || label.includes(' is speaking') || label.includes('’s video')) {
      const name = label.split('’s ')[0].split(' is ')[0].trim();
      if (name && name.length > 2) participants.add(name);
    }
  });

  // Remove "You" and empty strings
  participants.delete("");
  participants.delete("You");

  if (participants.size > 0) {
    chrome.runtime.sendMessage({
      action: 'UPDATE_PARTICIPANTS',
      names: Array.from(participants)
    });
  }
}

// Start tracking immediately if background says we are active
chrome.storage.local.get(['hk_tracking_session'], (res) => {
  if (res.hk_tracking_session && !scrapingInterval) {
    console.log("[HatchKod] Auto-Attendance tracking started.");
    scrapingInterval = setInterval(scrapeParticipants, 5000);
    scrapeParticipants();
    startWatchdog();
  }
});

// Listen for explicit start message from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'START_TRACKING') {
    if (!scrapingInterval) {
      console.log("[HatchKod] Auto-Attendance tracking started manually.");
      scrapingInterval = setInterval(scrapeParticipants, 5000);
      scrapeParticipants();
      startWatchdog();
    }
  }
});

let watchdogInterval = null;

function ensurePeoplePanelOpen() {
  // Check if panel is already open by looking for list items
  const listItems = document.querySelectorAll('div[role="listitem"]');
  if (listItems.length > 0) {
    return; // Likely already open
  }

  const selectors = [
    'button[aria-label="Show everyone"]',
    'button[aria-label="People"]',
    'button[jsname="A5il2e"]'
  ];
  
  let btnToClick = null;
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      btnToClick = el;
      break;
    }
  }
  
  if (!btnToClick) {
    const buttons = document.querySelectorAll('button');
    for (const b of buttons) {
      const label = b.getAttribute('aria-label') || "";
      if (label.toLowerCase().includes('everyone') || label.toLowerCase().includes('participant')) {
        btnToClick = b;
        break;
      }
    }
  }
  
  if (btnToClick) {
    // Avoid closing it if it's somehow already marked as pressed
    if (btnToClick.getAttribute('aria-pressed') === 'true') return;
    btnToClick.click();
  }
}

function startWatchdog() {
  if (watchdogInterval) return;
  // Wait 3 seconds for UI to load before first click
  setTimeout(ensurePeoplePanelOpen, 3000);
  // Run silently every 30 seconds
  watchdogInterval = setInterval(ensurePeoplePanelOpen, 30000);
}
