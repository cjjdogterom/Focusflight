import { useEffect } from 'react'

// Moves the sheen on the metal membership cards with the phone's physical
// tilt (gyroscope), like the glare on a real card. Sets --glare-x/--glare-y
// on <html> plus a `has-tilt` class; CSS does the rest.
//
// iOS quirks handled here: DeviceOrientationEvent.requestPermission() only
// shows its prompt from a REAL user activation — Safari does not count
// `pointerdown`, so we listen to `click`/`touchend`. We also keep asking on
// every tap until granted (a dismissed prompt would otherwise disable the
// effect for the whole session), and we try once silently on mount for the
// case where permission was granted before.

export function useTiltGlare() {
  useEffect(() => {
    const root = document.documentElement
    let raf = 0
    let x = 0
    let y = 0
    let sx = 0
    let sy = 0
    let active = false
    let attached = false

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
      // gamma: left/right roll, beta: pitch — ~40° is the natural in-hand angle
      x = Math.max(-1, Math.min(1, e.gamma / 28))
      y = Math.max(-1, Math.min(1, (e.beta - 40) / 28))
      if (!raf) raf = requestAnimationFrame(apply)
    }

    const attach = () => {
      if (attached) return
      attached = true
      window.addEventListener('deviceorientation', onOrient)
    }

    const D = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>
    }
    const needsPermission = typeof D?.requestPermission === 'function'

    const tryPermission = () => {
      if (attached) return
      D.requestPermission!()
        .then((state) => {
          if (state === 'granted') {
            attach()
            window.removeEventListener('click', tryPermission)
            window.removeEventListener('touchend', tryPermission)
          }
        })
        .catch(() => {
          /* not a user gesture yet — the next tap will retry */
        })
    }

    if (needsPermission) {
      // if it was granted earlier, this resolves without showing a prompt
      tryPermission()
      window.addEventListener('click', tryPermission)
      window.addEventListener('touchend', tryPermission)
    } else {
      attach()
    }

    return () => {
      window.removeEventListener('click', tryPermission)
      window.removeEventListener('touchend', tryPermission)
      window.removeEventListener('deviceorientation', onOrient)
      if (raf) cancelAnimationFrame(raf)
      root.classList.remove('has-tilt')
      root.style.removeProperty('--glare-x')
      root.style.removeProperty('--glare-y')
    }
  }, [])
}
