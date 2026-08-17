// Native bridge. The Android WebView shell exposes window.Android.haptic(kind); optional-chained
// so the same call no-ops in a browser / on iOS. Call sites: task-complete ("confirm"), board
// move ("tap") — matching the current app exactly.
declare global {
  interface Window {
    Android?: { haptic?: (kind: string) => void };
  }
}
export function haptic(kind: "tap" | "confirm") {
  window.Android?.haptic?.(kind);
}
