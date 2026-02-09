/**
 * Opens a URL in the system browser instead of within the PWA window.
 * Uses a temporary anchor element which reliably opens in the external browser
 * even when the app is running as an installed PWA (standalone mode).
 */
export function openInBrowser(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.click()
}
