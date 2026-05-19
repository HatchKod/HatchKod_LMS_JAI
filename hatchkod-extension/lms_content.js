// This script is injected into the HatchKod LMS website.
// It bridges communication between the LMS frontend (via window.postMessage) 
// and the Chrome Extension background script (via chrome.runtime.sendMessage).

console.log("[HatchKod Extension] LMS bridge initialized.");

// Listen for messages from the LMS frontend
window.addEventListener("message", (event) => {
  // Only accept messages from the same window
  if (event.source !== window) return;

  const msg = event.data;
  
  if (msg && msg.source === "HATCHKOD_LMS") {
    if (msg.action === "PING") {
      // Respond to ping to confirm extension is installed
      window.postMessage({ source: "HATCHKOD_EXTENSION", action: "PONG" }, "*");
    }
    
    else if (msg.action === "HATCHKOD_START_CLASS") {
      // Forward the start command to the background script
      chrome.runtime.sendMessage({
        action: "LMS_START_CLASS",
        session_id: msg.session_id,
        token: msg.token,
        api_url: msg.api_url
      });
      console.log("[HatchKod Extension] Sent LMS_START_CLASS to background.");
    }
    
    else if (msg.action === "HATCHKOD_END_CLASS") {
      // Forward the sync/end command to the background script
      chrome.runtime.sendMessage({
        action: "LMS_END_CLASS"
      });
      console.log("[HatchKod Extension] Sent LMS_END_CLASS to background.");
    }
  }
});
