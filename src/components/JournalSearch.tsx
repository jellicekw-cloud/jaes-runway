import { useEffect, useRef, useState } from 'react'
import { DAYS, MONTHS, dateOf } from '../lib/dates'
import { searchJournal, type SearchHit } from '../lib/journal'
import { MOOD_EMOJI } from '../lib/types'

/** Header search: finds journal text (partial words and emoji too) and tags; picking a result opens that day. */
export default function JournalSearch({ onPick }: { onPick: (date: string) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [error, setError] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const query = q.trim()
    if (!query) { setHits(null); setError(''); return }
    let cancelled = false
    const t = window.setTimeout(async () => {
      try {
        const res = await searchJournal(query)
        if (!cancelled) { setHits(res); setError('') }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Search failed')
      }
    }, 250)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [q])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setHits(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function pick(date: string) {
    setQ('')
    setHits(null)
    onPick(date)
  }

  function snippet(body: string, query: string) {
    const flat = body.replace(/\n/g, ' ')
    const i = flat.toLowerCase().indexOf(query.toLowerCase())
    if (i < 0) return <>{flat.slice(0, 90)}</>
    const start = Math.max(0, i - 25)
    return (
      <>
        {start > 0 ? '…' : ''}{flat.slice(start, i)}
        <mark className="bg-pay-soft text-pay-ink rounded px-0.5">{flat.slice(i, i + query.length)}</mark>
        {flat.slice(i + query.length, i + query.length + 60)}
      </>
    )
  }

  const open = q.trim() !== '' && (hits !== null || error !== '')

  return (
    <div ref={box} className="relative flex-[0_1_320px] min-w-56">
      <label className="flex items-center gap-2.5 h-11 px-3.5 rounded-xl bg-header-2 text-header-muted focus-within:outline-2 focus-within:outline-header-muted">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <span className="sr-only">Search journal</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search journal or tags…" autoComplete="off"
          onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); setHits(null) } }}
          className="flex-1 min-w-0 border-0 bg-transparent text-white placeholder:text-header-muted focus:outline-none" />
      </label>
      {open && (
        <div className="absolute right-0 left-0 top-13 z-20 max-h-96 overflow-auto rounded-xl border border-line bg-surface text-fg p-1.5 shadow-2xl">
          {error && <p className="m-0 p-3 text-sm text-bad">Couldn't search: {error}</p>}
          {hits && hits.length === 0 && <p className="m-0 p-3 text-sm text-muted">No entries match "{q.trim()}".</p>}
          {hits?.map((h) => {
            const d = dateOf(h.entry_date)
            return (
              <button key={h.entry_date} type="button" onClick={() => pick(h.entry_date)}
                className="block w-full text-left border-0 bg-transparent rounded-lg px-3 py-2.5 cursor-pointer hover:bg-accent-soft focus-visible:bg-accent-soft">
                <b className="block text-sm text-accent">
                  {h.mood ? MOOD_EMOJI[h.mood] + ' ' : ''}{DAYS[d.getDay()].slice(0, 3)}, {MONTHS[d.getMonth()]} {d.getDate()}, {d.getFullYear()}
                  {h.via === 'tag' && <span className="ml-2 font-bold text-muted">#{h.tag}</span>}
                </b>
                <span className="block text-sm text-muted truncate">{h.via === 'text' ? snippet(h.body, q.trim()) : h.body.replace(/\n/g, ' ').slice(0, 90)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
