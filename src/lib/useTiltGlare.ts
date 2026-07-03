import { useEffect } from 'react'

// Moves the sheen on the metal membership cards with the phone's physical
// tilt (gyroscope), like the glare on a real card. Sets --glare-x/--glare-y
// on <html> plus a `has-tilt` class; CSS does the rest. On iOS the motion
// API needs a permission prompt from a user gesture, so we ask on the first
// tap. Without a gyroscope (desktop) nothing changes — the subtle drift
// animation stays.

export function useTiltGlare() {
  useEffect(() => {
    const root = document.documentElement
    let raf = 0
    let x = 0
    let y = 0
    let sx = 0 // smoothed
    let sy = 0
    let active = false

    const apply = () => {
      raf = 0
      sx += (x - sx) * 0.25
      sy += (y - sy) * 0.25
      root.style.setProperty('--glare-x', sx.toFixed(3))
      root.style.setProperty('--glare-y', sy.toFixed(3))
      if (Math.abs(x - sx) > 0.002 || Math.abs(y - sy) > 0.002) {
        raf = requestAnimationFrame(apply)
      }
    }

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return
      if (!active) {
        active = true
        root.classList.add('has-tilt')
      }
      // gamma: left/right roll (±90°), beta: pitch — 40° is a natural
      // in-hand holding angle, so that reads as "neutral"
      x = Math.max(-1, Math.min(1, e.gamma / 28))
      y = Math.max(-1, Math.min(1, (e.beta - 40) / 28))
      if (!raf) raf = requestAnimationFrame(apply)
    }

    const attach = () => window.addEventListener('deviceorientation', onOrient)

    const D = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>
    }
    let once: (() => void) | null = null
    if (typeof D?.requestPermission === 'function') {
      once = () => {
        D.requestPermission!()
          .then((state) => {
            if (state === 'granted') attach()
          })
          .catch(() => {})
        if (once) window.removeEventListener('pointerdown', once)
        once = null
      }
      window.addEventListener('pointerdown', once)
    } else {
      attach()
    }

    return () => {
      if (once) window.removeEventListener('pointerdown', once)
      window.removeEventListener('deviceorientation', onOrient)
      if (raf) cancelAnimationFrame(raf)
      root.classList.remove('has-tilt')
      root.style.removeProperty('--glare-x')
      root.style.removeProperty('--glare-y')
    }
  }, [])
}
