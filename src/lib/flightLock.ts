// One tab owns the persisted active flight. Without this, a second window
// would restore the same flight, tick it independently and finish/abort it
// out from under the first one. The Web Lock auto-releases when the tab
// closes or reloads, so reload-resume keeps working.

let held = false

export function hasFlightLock(): boolean {
  return held
}

export async function acquireFlightLock(): Promise<boolean> {
  if (held) return true
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  if (!locks) {
    // very old browser: accept the pre-existing multi-tab risk
    held = true
    return true
  }
  return new Promise((resolve) => {
    locks
      .request('ff-active-flight', { ifAvailable: true }, (lock) => {
        if (lock === null) {
          resolve(false)
          return
        }
        held = true
        resolve(true)
        // hold the lock until the page dies
        return new Promise<void>(() => {})
      })
      .catch(() => resolve(false))
  })
}
