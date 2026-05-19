chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'UPDATE_PARTICIPANTS') {
    const names = msg.names;
    const now = Date.now();
    
    chrome.storage.local.get(['hk_participants', 'hk_tracking_session'], (res) => {
      // Only record if we are actively tracking a session
      if (!res.hk_tracking_session) return;
      
      const parts = res.hk_participants || {};
      let updated = false;

      names.forEach(name => {
        // Skip common UI artifacts that aren't names
        if (name === "You" || name.includes("Presenting") || name.length < 2) return;

        if (!parts[name]) {
          parts[name] = {
            name: name,
            first_seen: now,
            last_seen: now,
            total_minutes: 0
          };
          updated = true;
        } else {
          const p = parts[name];
          const diffMs = now - p.last_seen;
          
          // If we saw them within the last 5 minutes (300,000 ms), add to duration.
          // This creates a generous grace period because Google Meet frequently 
          // hides non-speaking participants from the grid to save memory.
          // It also doubles as a grace period for short internet drops!
          if (diffMs < 300000) {
            p.total_minutes += diffMs / 60000;
          }
          
          p.last_seen = now;
          updated = true;
        }
      });

      if (updated) {
        chrome.storage.local.set({ hk_participants: parts });
      }
    });
  }

  if (msg.action === 'LMS_START_CLASS') {
    chrome.storage.local.set({
      hk_tracking_session: { id: msg.session_id },
      hk_token: msg.token,
      hk_api_url: msg.api_url,
      hk_participants: {}
    });
    
    chrome.tabs.query({url: "*://meet.google.com/*"}, (tabs) => {
      tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, {action: 'START_TRACKING'}));
    });
  }

  if (msg.action === 'LMS_END_CLASS') {
    chrome.storage.local.get(['hk_tracking_session', 'hk_participants', 'hk_token', 'hk_api_url'], async (state) => {
      const sessionId = state.hk_tracking_session?.id;
      if (!sessionId) return;

      const rawParts = state.hk_participants || {};
      const payload = Object.values(rawParts).map(p => ({
        name: p.name,
        duration_minutes: p.total_minutes || 0
      }));

      try {
        await fetch(`${state.hk_api_url}/sessions/${sessionId}/attendance/extension-sync`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.hk_token}`
          },
          body: JSON.stringify({ participants: payload })
        });
        
        await chrome.storage.local.remove(['hk_tracking_session', 'hk_participants']);
      } catch (e) {
        console.error("LMS Sync failed from background:", e);
      }
    });
  }
});
