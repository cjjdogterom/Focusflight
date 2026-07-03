import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import FlightCanvas, { type FlightCanvasHandle, type FollowMode } from '../components/FlightCanvas'
import {
  IconSoundOn, IconSoundOff, IconFollow, IconTrackUp, IconExpand, IconMoon,
  IconPause, IconPlay, IconX, IconLayers,
} from '../components/icons'
import { aircraftById } from '../data/aircraft'
import { liveryById } from '../data/liveries'
import { buildProfile, type FlightProfile } from '../lib/profile'
import { positionAt } from '../lib/geo'
import { startAmbience, stopAmbience, SOUNDSCAPES } from '../lib/audio'
import runwaysData from '../data/runways.json'

const RUNWAYS = runwaysData as Record<string, { lengthM: number; ident: string }>

const PHASE_NL: Record<string, string> = {
  roll: 'Startrol',
  climb: 'Klimmen',
  cruise: 'Kruishoogte',
  descent: 'Daling',
  landing: 'Landing',
  arrived: 'Geland',
}

function phaseAt(tSec: number, durationSec: number, p: FlightProfile): string {
  const s = p.segments
  if (tSec >= durationSec) return 'arrived'
  if (tSec < s.roll) return 'roll'
  if (tSec < s.roll + s.climb) return 'climb'
  if (tSec < s.roll + s.climb + s.cruise) return 'cruise'
  if (tSec < s.roll + s.climb + s.cruise + s.descent) return 'descent'
  return 'landing'
}

/** "29 min" / "1 u 43 m" — big-type formatting like the reference app */
function bigTime(totalSec: number): string {
  const min = Math.max(0, Math.ceil(totalSec / 60))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}u ${m}m`
}

export default function ActiveFlight() {
  const active = useStore((s) => s.active)!
  const soundOn = useStore((s) => s.soundOn)
  const setSound = useStore((s) => s.setSound)
  const soundscape = useStore((s) => s.soundscape)
  const setSoundscape = useStore((s) => s.setSoundscape)
  const strictMode = useStore((s) => s.strictMode)
  const finishFlight = useStore((s) => s.finishFlight)
  const abortFlight = useStore((s) => s.abortFlight)
  const mapStyle = useStore((s) => s.mapStyle)
  const setMapStyle = useStore((s) => s.setMapStyle)
  const followPref = useStore((s) => s.followPref)
  const setFollowPref = useStore((s) => s.setFollowPref)

  const mapRef = useRef<FlightCanvasHandle>(null)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)
  const pausedAccum = useRef<number>(0)
  const pauseStart = useRef<number>(0)
  const pausedRef = useRef<boolean>(false)
  const lastRemain = useRef<number>(-1)
  const lastTel = useRef<number>(-1)
  const wakeRef = useRef<WakeLockSentinel | null>(null)
  const doneRef = useRef<boolean>(false)

  const aircraft = aircraftById(active.aircraftId)
  const livery = liveryById(active.liveryId)
  const duration = active.durationSec
  const routeKm = active.route.distanceKm

  const depRwy = RUNWAYS[active.route.from.iata] ?? { lengthM: 3200, ident: '?' }
  const arrRwy = RUNWAYS[active.route.to.iata] ?? { lengthM: 3000, ident: '?' }

  const profile = useMemo(
    () => buildProfile(duration, aircraft, depRwy.lengthM, arrRwy.lengthM),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active.startedAtMs],
  )

  const [remaining, setRemaining] = useState(duration)
  const [phase, setPhase] = useState<string>('roll')
  const [pct, setPct] = useState(0)
  const [paused, setPaused] = useState(false)
  const [pure, setPure] = useState(false)
  const [soundPanel, setSoundPanel] = useState(false)
  const [followMode, setFollowMode] = useState<FollowMode>(followPref)
  const [distractions, setDistractions] = useState(0)
  const [showBanner, setShowBanner] = useState(false)
  const [clock, setClock] = useState(() =>
    new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
  )
  const [tel, setTel] = useState({ speedKmh: 0, altitudeM: 0, heading: 0, dtgKm: routeKm })

  const procedures = useMemo(() => {
    if (!active.route.chart) return null
    const sid = active.route.waypoints.find((w) => w.segment === 'SID' && w.airway)?.airway
    const star = active.route.waypoints.find((w) => w.segment === 'STAR' && w.airway)?.airway
    return { sid, star }
  }, [active.route])

  useEffect(() => {
    startRef.current = 0
    pausedAccum.current = 0
    pauseStart.current = 0
    pausedRef.current = false
    lastRemain.current = -1
    lastTel.current = -1
    doneRef.current = false
    setPaused(false)
    setRemaining(duration)
    setPct(0)
    setPhase('roll')

    const tick = (now: number) => {
      if (startRef.current === 0) startRef.current = now
      if (!pausedRef.current) {
        const elapsedMs = now - startRef.current - pausedAccum.current
        const tSec = Math.min(duration, elapsedMs / 1000)
        const distFrac = profile.distFrac(tSec)
        const dyn = profile.telemetry(tSec)
        mapRef.current?.update(distFrac, dyn.altitudeM)

        const remain = Math.max(0, Math.ceil(duration - tSec))
        if (remain !== lastRemain.current) {
          lastRemain.current = remain
          setRemaining(remain)
          setPhase(phaseAt(tSec, duration, profile))
          setPct((tSec / duration) * 100)
          setClock(new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }))
        }
        const q = Math.floor(elapsedMs / 250)
        if (q !== lastTel.current) {
          lastTel.current = q
          const heading = positionAt(active.route.points, distFrac).heading
          setTel({
            speedKmh: dyn.speedKmh,
            altitudeM: dyn.altitudeM,
            heading: Math.round(heading),
            dtgKm: Math.max(0, routeKm * (1 - distFrac)),
          })
        }

        if (tSec >= duration && !doneRef.current) {
          doneRef.current = true
          cancelAnimationFrame(rafRef.current)
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(`Geland in ${active.route.to.city}`, {
                body: `Focussessie voltooid — +${Math.round(active.route.distanceKm)} km`,
              })
            } catch { /* notification optional */ }
          }
          void finishFlight(duration, 1)
          return
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.startedAtMs])

  useEffect(() => {
    if (soundOn) startAmbience(soundscape, 0.5)
    else stopAmbience()
    return () => stopAmbience()
  }, [soundOn, soundscape])

  // ask notification permission once; notify on touchdown
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    const anyNav = navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> }
    }
    anyNav.wakeLock?.request('screen').then((s) => (wakeRef.current = s)).catch(() => {})
    return () => {
      void wakeRef.current?.release().catch(() => {})
      wakeRef.current = null
    }
  }, [])

  useEffect(() => {
    const onHide = () => {
      if (document.hidden && !pausedRef.current && !doneRef.current) {
        setDistractions((d) => d + 1)
        if (strictMode) {
          setShowBanner(true)
          window.setTimeout(() => setShowBanner(false), 4000)
        }
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [strictMode])

  const togglePause = () => {
    const next = !paused
    setPaused(next)
    pausedRef.current = next
    if (next) pauseStart.current = performance.now()
    else pausedAccum.current += performance.now() - pauseStart.current
  }

  const onCancel = () => {
    const elapsed = duration - remaining
    const frac = duration > 0 ? elapsed / duration : 0
    if (window.confirm('Vlucht afbreken? Je omgeleide vlucht telt maar half mee.')) {
      cancelAnimationFrame(rafRef.current)
      void abortFlight(elapsed, frac)
    }
  }

  return (
    <div className="relative h-full w-full select-none">
      <FlightCanvas
        ref={mapRef}
        route={active.route}
        aircraft={aircraft}
        livery={livery}
        followMode={followMode}
        mapStyle={mapStyle}
        onUserInteract={() => setFollowMode('off')}
      />

      {/* readability gradients, no boxes (reference style) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />

      {showBanner && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-white text-black font-semibold text-sm shadow-lg animate-fade-in">
          Blijf aan boord — terug naar je focus
        </div>
      )}

      {!pure && (
        <>
          {/* minimal flight info, no box */}
          <div className="absolute top-0 left-0 p-5 animate-fade-in pointer-events-none [text-shadow:0_1px_8px_rgba(0,0,0,0.7)]">
            <p className="font-semibold text-[15px]">
              {active.route.from.iata} → {active.route.to.iata}
              <span className="text-white/55 font-normal">
                {'  '}· {active.flightNo}
              </span>
            </p>
            <p className="text-[12px] text-white/60 mt-0.5">
              {PHASE_NL[phase] ?? phase}
              {procedures?.sid && procedures?.star ? ` · ${procedures.sid} → ${procedures.star}` : ''} · RWY{' '}
              {['descent', 'landing', 'arrived'].includes(phase)
                ? active.route.runways?.arr?.ident ?? arrRwy.ident
                : active.route.runways?.dep?.ident ?? depRwy.ident}
            </p>
            <p className="font-mono text-[11px] text-white/45 mt-0.5 tabular-nums">
              {tel.speedKmh} km/u · {tel.altitudeM.toLocaleString('nl-NL')} m ·{' '}
              {String(tel.heading).padStart(3, '0')}°
            </p>
          </div>

          {/* iOS map buttons */}
          <div className="absolute top-0 right-0 p-4 flex flex-col gap-2.5 animate-fade-in">
            <button
              className={`ios-btn ${mapStyle === 'sat' ? 'ios-btn--active' : ''}`}
              aria-label="Satellietbeeld"
              onClick={() => setMapStyle(mapStyle === 'sat' ? 'dark' : 'sat')}
            >
              <IconLayers />
            </button>
            <button
              className={`ios-btn ${followMode !== 'off' ? 'ios-btn--active' : ''}`}
              aria-label={followMode === 'track' ? 'Track-up volgen' : 'Volg toestel'}
              onClick={() =>
                setFollowMode((m) => {
                  const next = m === 'off' ? 'north' : m === 'north' ? 'track' : 'off'
                  setFollowPref(next) // remembered as "always" preference
                  return next
                })
              }
            >
              {followMode === 'track' ? <IconTrackUp /> : <IconFollow />}
            </button>
            <button
              className="ios-btn"
              aria-label="Hele route"
              onClick={() => { setFollowMode('off'); mapRef.current?.recenter() }}
            >
              <IconExpand />
            </button>
            <button
              className={`ios-btn ${soundPanel ? 'ios-btn--active' : ''}`}
              aria-label="Geluid"
              onClick={() => setSoundPanel((p) => !p)}
            >
              {soundOn ? <IconSoundOn /> : <IconSoundOff />}
            </button>
            <button className="ios-btn" aria-label="Pure modus" onClick={() => setPure(true)}>
              <IconMoon />
            </button>
          </div>

          {soundPanel && (
            <div className="absolute top-[178px] right-[70px] z-20 w-60 glass rounded-2xl overflow-hidden animate-fade-in">
              <p className="avlabel uppercase tracking-[0.12em] px-4 pt-3 pb-1.5">Geluid aan boord</p>
              <div className="divide-y divide-white/[0.06]">
                <button
                  onClick={() => { setSound(false); setSoundPanel(false) }}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left text-[13px] hover:bg-white/[0.06] active:bg-white/[0.1] transition"
                >
                  Uit
                  {!soundOn && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </button>
                {SOUNDSCAPES.map((sc) => (
                  <button
                    key={sc.id}
                    onClick={() => { setSoundscape(sc.id); setSound(true); setSoundPanel(false) }}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left text-[13px] hover:bg-white/[0.06] active:bg-white/[0.1] transition"
                  >
                    {sc.name}
                    {soundOn && soundscape === sc.id && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* big-type HUD (reference style) */}
          <div className="absolute bottom-0 inset-x-0 px-6 pb-6 pt-2 animate-fade-in [text-shadow:0_2px_12px_rgba(0,0,0,0.8)]">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[14px] text-white/60 font-medium">Resterende tijd</p>
                <p className="text-[30px] leading-[1.05] font-bold tracking-tight tabular-nums whitespace-nowrap">
                  {bigTime(remaining)}
                </p>
              </div>
              <div className="flex flex-col items-center pb-1">
                <p className="text-[22px] font-semibold tabular-nums leading-none">{clock}</p>
                <p className="text-[11px] text-white/50 mb-2 mt-1">
                  Aankomst{' '}
                  {new Date(Date.now() + remaining * 1000).toLocaleTimeString('nl-NL', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={togglePause}
                    aria-label={paused ? 'Hervat' : 'Pauze'}
                    className="w-10 h-10 rounded-full bg-white text-black grid place-items-center active:scale-95 transition-transform shadow-lg"
                  >
                    {paused ? <IconPlay size={16} /> : <IconPause size={16} />}
                  </button>
                  <button
                    onClick={onCancel}
                    aria-label="Vlucht afbreken"
                    className="w-10 h-10 rounded-full bg-black/55 border border-white/20 text-white/85 grid place-items-center active:scale-95 transition-transform"
                  >
                    <IconX size={15} />
                  </button>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[14px] text-white/60 font-medium">Afstand te gaan</p>
                <p className="text-[30px] leading-[1.05] font-bold tracking-tight tabular-nums whitespace-nowrap">
                  {Math.round(tel.dtgKm).toLocaleString('nl-NL')}
                  <span className="text-[17px] font-semibold text-white/80"> km</span>
                </p>
              </div>
            </div>
            {distractions > 0 && (
              <p className="text-center text-[12px] text-amber-300/90 mt-3">
                {distractions}× afgeleid
              </p>
            )}
            {/* slim progress line */}
            <div className="mt-4 h-[4px] rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </>
      )}

      {pure && (
        <button onClick={() => setPure(false)} className="absolute inset-0 z-10 grid place-items-center">
          <div className="text-center [text-shadow:0_2px_12px_rgba(0,0,0,0.8)]">
            <p className="text-7xl font-bold tabular-nums tracking-tight">{bigTime(remaining)}</p>
            <p className="text-white/50 mt-3 text-sm">tik om terug te keren</p>
          </div>
        </button>
      )}
    </div>
  )
}
