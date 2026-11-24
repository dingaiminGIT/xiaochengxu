// Campaign-scoped and device-local: changing accounts must not repeat the popup.
const STORAGE_KEY = 'activity:guzi-diy-2026:intro-dismissed';
let dismissedThisSession = false;

export function shouldShowGuziIntro() {
  if (dismissedThisSession) return false;
  try { return !wx.getStorageSync(STORAGE_KEY); }
  catch (_) { return false; }
}

export function dismissGuziIntro() {
  dismissedThisSession = true;
  try { wx.setStorageSync(STORAGE_KEY, true); }
  catch (_) { /* Keep it dismissed this session even if local storage is unavailable. */ }
}
