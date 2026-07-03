import { useEffect, useState } from 'react'

// Browser fullscreen as a toggle. Desktop Safari may still need the
// webkit-prefixed API; iPhone Safari has no fullscreen API for regular
// elements at all, so `supported` is false there — the PWA route
// ("Zet op beginscherm") is the iPhone equivalent.

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => void
}
type FsEl = HTMLElement & {
  webkitRequestFullscreen?: () => void
}

const doc = document as FsDoc
const rootEl = document.documentElement as FsEl

export const fullscreenSupported =
  typeof rootEl.requestFullscreen === 'function' ||
  typeof rootEl.webkitRequestFullscreen === 'function'

function fsElement(): Element | null {
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

export function toggleFullscreen(): void {
  if (fsElement()) {
    if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => {})
    else doc.webkitExitFullscreen?.()
  } else {
    if (rootEl.requestFullscreen) void rootEl.requestFullscreen().catch(() => {})
    else rootEl.webkitRequestFullscreen?.()
  }
}

export function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const [active, setActive] = useState(() => fsElement() != null)
  useEffect(() => {
    const onChange = () => setActive(fsElement() != null)
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])
  return { supported: fullscreenSupported, active, toggle: toggleFullscreen }
}
