import { useEffect, useRef, useState } from 'react'
import { datesOn, yearsOn, type SpecialDate } from '../lib/specialDates'

// Your birthday: confetti the first time you open Runway that day, and a banner that sets it off again.

const COLORS = ['#8B3DFF', '#6D28D9', '#C29BFF', '#16A34A', '#34D06F', '#DB2777', '#F472B6', '#F5B700', '#FFFFFF']
const SEEN_KEY = 'runway-birthday-confetti'

/** Your own birthday entry: saved under your traveler name (Jae) or "Me". */
export function myBirthdayToday(list: SpecialDate[], today: string, selfName: string | undefined): SpecialDate | undefined {
  const names = new Set(['me', 'my birthday', (selfName ?? '').trim().toLowerCase()].filter(Boolean))
  return datesOn(list, today).find((d) => d.kind === 'birthday' && names.has(d.name.trim().toLowerCase()))
}

const prefersLessMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

function Burst({ onDone }: { onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const done = useRef(onDone)
  done.current = onDone

  // Runs once per burst; re-renders of the page don't restart it
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) { done.current(); return }
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const size = () => { c.width = window.innerWidth * dpr; c.height = window.innerHeight * dpr }
    size()
    window.addEventListener('resize', size)

    const W = () => c.width, H = () => c.height
    const count = Math.round(Math.min(220, Math.max(110, window.innerWidth / 5)))
    // Two cannons from the bottom corners, plus a sprinkle from the top
    const pieces = Array.from({ length: count }, (_, i) => {
      const fromTop = i % 3 === 0
      const left = i % 2 === 0
      const angle = fromTop ? Math.PI / 2 + (Math.random() - 0.5) * 0.6 : (left ? -Math.PI / 3 : -2 * Math.PI / 3) + (Math.random() - 0.5) * 0.7
      const speed = (fromTop ? 2 + Math.random() * 3 : 13 + Math.random() * 9) * dpr
      return {
        x: fromTop ? Math.random() * W() : left ? -10 : W() + 10,
        y: fromTop ? -20 * dpr - Math.random() * H() * 0.3 : H() * 0.85,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        w: (6 + Math.random() * 6) * dpr, h: (9 + Math.random() * 9) * dpr,
        rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.3,
        wobble: Math.random() * 10, color: COLORS[i % COLORS.length], round: i % 5 === 0,
      }
    })

    const start = performance.now()
    const LENGTH = 4800
    let frame = 0
    const tick = (now: number) => {
      const t = now - start
      ctx.clearRect(0, 0, W(), H())
      const fade = t > LENGTH - 1000 ? Math.max(0, (LENGTH - t) / 1000) : 1
      for (const p of pieces) {
        p.vy += 0.28 * dpr          // gravity
        p.vx *= 0.985; p.vy *= 0.985 // air
        p.wobble += 0.1
        p.x += p.vx + Math.sin(p.wobble) * 0.8 * dpr
        p.y += p.vy
        p.rot += p.spin
        if (p.y > H() + 40) continue
        ctx.save()
        ctx.globalAlpha = fade
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill() }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.wobble)))
        ctx.restore()
      }
      if (t < LENGTH) frame = requestAnimationFrame(tick)
      else done.current()
    }
    frame = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', size) }
  }, [])

  return <canvas ref={canvas} data-testid="confetti" aria-hidden="true" className="fixed inset-0 z-50 w-screen h-dvh pointer-events-none" />
}

/** The birthday banner (top of Home on phone, under the header on desktop) plus the confetti. */
export function BirthdayCelebration({ list, today, selfName, compact }: { list: SpecialDate[]; today: string; selfName: string | undefined; compact?: boolean }) {
  const mine = myBirthdayToday(list, today, selfName)
  const [burst, setBurst] = useState(0)

  // First open of the day: celebrate once (per device), unless the phone asks for less motion
  useEffect(() => {
    if (!mine || prefersLessMotion()) return
    let seen = ''
    try { seen = localStorage.getItem(SEEN_KEY) ?? '' } catch { /* private mode: just celebrate */ }
    if (seen === today) return
    try { localStorage.setItem(SEEN_KEY, today) } catch { /* fine */ }
    setBurst((n) => n + 1)
  }, [mine, today])

  if (!mine) return null
  const age = yearsOn(mine, today)
  const name = selfName || 'Jae'

  return (
    <>
      <button type="button" onClick={() => setBurst((n) => n + 1)} aria-label="Happy birthday! Tap for confetti"
        className={`w-full border-0 text-left text-white cursor-pointer flex items-center gap-3 ${compact ? 'rounded-2xl p-4' : 'safe-x py-3'}`}
        style={{ background: 'linear-gradient(120deg, #DB2777 0%, #8B3DFF 55%, #6D28D9 100%)' }}>
        <span aria-hidden="true" className="text-3xl">🎂</span>
        <span className="flex-1 min-w-0">
          <b className="block text-xl leading-tight">Happy birthday, {name}!{age ? ` ${age} looks good on you.` : ''}</b>
          <span className="block text-sm text-white/85">Tap for more confetti 🎉</span>
        </span>
      </button>
      {burst > 0 && <Burst key={burst} onDone={() => setBurst(0)} />}
    </>
  )
}
