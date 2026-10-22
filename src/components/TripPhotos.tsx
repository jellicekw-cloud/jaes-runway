import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as RPointerEvent } from 'react'
import { DAYS, dateOf, shortDate } from '../lib/dates'
import type { Trip, TripPhoto, TripsData } from '../lib/trips'
import {
  UNSPLASH_HOME, coverOf, deletePhoto, photosOf, pickCover, searchCovers, setPhotoCover, updatePhoto, uploadTripPhotos, usePhotoUrls,
  type CoverView, type StockPhoto,
} from '../lib/tripPhotos'

type Reload = () => Promise<void>

const errText = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))

function tripDays(t: Trip): string[] {
  const out: string[] = []
  if (!t.start_date || !t.end_date) return out
  const d = dateOf(t.start_date)
  for (let i = 0; i < 60; i++) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (k > t.end_date) break
    out.push(k)
    d.setDate(d.getDate() + 1)
  }
  return out
}
const dayLabel = (t: Trip, k: string) => {
  const i = tripDays(t).indexOf(k)
  return `${i >= 0 ? `Day ${i + 1} · ` : ''}${DAYS[dateOf(k).getDay()]}, ${shortDate(k)}`
}

// ---------------------------------------------------------------------------
// Cover images
// ---------------------------------------------------------------------------

/** The cover as an <img> (thumbnail or full), or nothing. */
export function CoverImg({ cover, big, className = '' }: { cover: CoverView | null; big?: boolean; className?: string }) {
  const path = cover?.src === 'photo' ? (big ? cover.photo.path : cover.photo.thumb_path) : null
  const urls = usePhotoUrls(path ? [path] : [])
  if (!cover) return null
  const src = cover.src === 'stock' ? (big ? cover.url : cover.thumb) : urls[path!]
  if (!src) return <span className={`block bg-accent-soft ${className}`} />
  return <img src={src} alt="" loading="lazy" className={`block object-cover ${className}`} />
}

function Credit({ cover }: { cover: CoverView }) {
  if (cover.src !== 'stock') return null
  return (
    <span className="absolute right-2 bottom-1.5 text-[11px] text-white/90 drop-shadow">
      Photo by {cover.credit_link ? <a href={cover.credit_link} target="_blank" rel="noreferrer" className="underline text-white">{cover.credit_name}</a> : cover.credit_name} on{' '}
      <a href={UNSPLASH_HOME} target="_blank" rel="noreferrer" className="underline text-white">Unsplash</a>
    </span>
  )
}

/** Top of a trip: the place photo (or yours). Tap it to jump to your photos. */
export function CoverBanner({ trip: t, data, reload, onOpenAlbum }: { trip: Trip; data: TripsData; reload: Reload; onOpenAlbum: () => void }) {
  const cover = coverOf(t, data.photos)
  const [picking, setPicking] = useState(false)
  return (
    <>
      {cover ? (
        <div className="relative rounded-2xl overflow-hidden h-44 sm:h-64 bg-accent-soft">
          <button type="button" onClick={onOpenAlbum} aria-label={`See your ${t.name} photos`} className="absolute inset-0 border-0 p-0 bg-transparent cursor-pointer">
            <CoverImg cover={cover} big className="w-full h-full" />
            <span aria-hidden="true" className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,.55) 100%)' }} />
            <span className="absolute left-3.5 bottom-3 text-left text-white">
              <b className="block text-2xl leading-tight drop-shadow">{t.name}</b>
              <span className="block text-sm font-bold drop-shadow">📷 {photosOf(data.photos, t.id).length ? `${photosOf(data.photos, t.id).length} photos · tap to see them` : 'Tap to add your photos'}</span>
            </span>
          </button>
          <button type="button" onClick={() => setPicking(true)} className="absolute right-2.5 top-2.5 h-9 px-3 rounded-xl border-0 bg-black/45 text-white text-sm font-bold cursor-pointer">Change cover</button>
          <Credit cover={cover} />
        </div>
      ) : (
        <button type="button" onClick={() => setPicking(true)}
          className="h-28 rounded-2xl border-2 border-dashed border-accent-hi/60 bg-accent-soft text-accent font-bold cursor-pointer flex flex-col items-center justify-center gap-1">
          <span className="text-2xl" aria-hidden="true">🏝️</span>
          Add a cover photo{t.destination ? ` of ${t.destination}` : ''}
        </button>
      )}
      <CoverPicker open={picking} onClose={() => setPicking(false)} trip={t} data={data} reload={reload} />
    </>
  )
}

function CoverPicker({ open, onClose, trip: t, data, reload }: { open: boolean; onClose: () => void; trip: Trip; data: TripsData; reload: Reload }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState(t.destination || t.name)
  const [results, setResults] = useState<StockPhoto[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mine = photosOf(data.photos, t.id)
  const thumbs = usePhotoUrls(open ? mine.map((p) => p.thumb_path) : [])

  async function search(q = query) {
    setBusy(true); setError('')
    try { const r = await searchCovers(q); setResults(r); if (!r.length) setError('No photos found. Try a city or a bigger place, like "Maui" or "Hawaii beach".') }
    catch (e) { setError(errText(e)) }
    setBusy(false)
  }

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) { el.showModal(); const q = t.destination || t.name; setQuery(q); setResults([]); void search(q) }
    if (!open && el.open) el.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function choose(f: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await f(); await reload(); onClose() } catch (e) { setError(errText(e)); setBusy(false) }
  }

  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="cover-title"
      className="m-auto w-[min(680px,calc(100vw-16px))] max-h-[calc(100dvh-16px)] rounded-3xl border border-line bg-surface p-0 text-fg backdrop:bg-black/60">
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="cover-title" className="m-0 text-xl font-bold">Cover photo</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="size-10 rounded-full border border-line bg-transparent text-fg cursor-pointer">✕</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void search() }} className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search for a place"
            className="h-11 flex-1 min-w-0 rounded-xl border border-line bg-surface-2 px-3 text-fg focus:outline-2 focus:outline-accent-hi" />
          <button type="submit" disabled={busy} className="h-11 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">{busy ? '…' : 'Search'}</button>
        </form>
        {error && <p role="alert" className="m-0 text-sm font-bold text-bad">{error}</p>}
        {results.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {results.map((r) => (
              <button key={r.id} type="button" disabled={busy} onClick={() => void choose(() => pickCover(t.id, r))}
                className="relative aspect-[4/3] rounded-xl overflow-hidden border-0 p-0 cursor-pointer bg-accent-soft" aria-label={`Use: ${r.alt}`}>
                <img src={r.thumb} alt={r.alt} loading="lazy" className="w-full h-full object-cover" />
                <span className="absolute left-0 right-0 bottom-0 px-1.5 py-0.5 text-[11px] text-white bg-black/45 truncate">{r.credit_name}</span>
              </button>
            ))}
          </div>
        )}
        {results.length > 0 && (
          <p className="m-0 text-xs text-muted">Photos from <a href={UNSPLASH_HOME} target="_blank" rel="noreferrer" className="text-accent">Unsplash</a>. The photographer gets credit on the cover.</p>
        )}
        {mine.length > 0 && (
          <>
            <b className="text-sm tracking-widest uppercase text-muted pt-1">Or one of yours</b>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {mine.map((p) => (
                <button key={p.id} type="button" disabled={busy} onClick={() => void choose(() => setPhotoCover(t.id, p.id))}
                  className="aspect-square rounded-lg overflow-hidden border-0 p-0 cursor-pointer bg-accent-soft" aria-label="Use this photo as the cover">
                  {thumbs[p.thumb_path] && <img src={thumbs[p.thumb_path]} alt="" className="w-full h-full object-cover" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}

// ---------------------------------------------------------------------------
// The album
// ---------------------------------------------------------------------------

export function PhotoAlbum({ trip: t, data, reload, focus }: { trip: Trip; data: TripsData; reload: Reload; focus?: boolean }) {
  const mine = photosOf(data.photos, t.id)
  const thumbs = usePhotoUrls(mine.map((p) => p.thumb_path))
  const fileRef = useRef<HTMLInputElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)

  useEffect(() => { if (focus) sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [focus])

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!files.length) return
    setMsg(null)
    try {
      const r = await uploadTripPhotos(t.id, files, (done, total) => setProgress({ done, total }))
      await reload()
      setMsg(r.failed ? { ok: false, text: `${files.length - r.failed} added, ${r.failed} didn't upload: ${r.lastError}` } : { ok: true, text: `${files.length} photo${files.length === 1 ? '' : 's'} added` })
    } catch (err) { setMsg({ ok: false, text: errText(err) }) }
    setProgress(null)
  }

  const days = tripDays(t)
  const groups = [
    ...days.map((k) => ({ key: k, label: dayLabel(t, k), list: mine.filter((p) => p.taken_on === k) })),
    { key: 'other', label: days.length ? 'Before or after the trip' : 'Photos', list: mine.filter((p) => !p.taken_on || !days.includes(p.taken_on)) },
  ].filter((g) => g.list.length)

  return (
    <section ref={sectionRef} id="trip-photos" aria-label="Photos" className="flex flex-col gap-3 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-2xl font-bold">Photos{mine.length ? ` · ${mine.length}` : ''}</h2>
        <button type="button" disabled={!!progress} onClick={() => fileRef.current?.click()} className="h-11 px-4 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer disabled:opacity-60">
          {progress ? `Adding ${progress.done} of ${progress.total}…` : '+ Add photos'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e)} data-testid="photo-input" />
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`m-0 text-sm font-bold ${msg.ok ? 'text-pay-ink' : 'text-bad'}`}>{msg.text}</p>}
      {mine.length === 0 && !progress && <p className="m-0 text-muted">Beach days, dinners, everybody together. Add photos from your camera roll and they'll sort themselves by day.</p>}
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-1.5">
          <span className="text-xs font-extrabold tracking-widest uppercase text-accent">{g.label}</span>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {g.list.map((p) => (
              <button key={p.id} type="button" onClick={() => setViewing(p.id)} aria-label={p.caption || 'Open photo'}
                className="relative aspect-square rounded-lg overflow-hidden border-0 p-0 cursor-pointer bg-accent-soft">
                {thumbs[p.thumb_path] && <img src={thumbs[p.thumb_path]} alt={p.caption ?? ''} loading="lazy" className="w-full h-full object-cover" />}
                {t.cover.kind === 'photo' && t.cover.photo_id === p.id && <span className="absolute left-1 top-1 rounded-md bg-black/55 text-white text-[10px] font-bold px-1.5 py-0.5">Cover</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
      {viewing && <PhotoViewer trip={t} photos={groups.flatMap((g) => g.list)} startId={viewing} reload={reload} onClose={() => setViewing(null)} />}
    </section>
  )
}

/** Full screen: swipe or arrows, caption, move to another day, make cover, delete. */
export function PhotoViewer({ trip: t, photos, startId, reload, onClose }: { trip: Trip; photos: TripPhoto[]; startId: string; reload: Reload; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  // Follow the photo itself (not its position), so moving it to another day keeps it on screen
  const [curId, setCurId] = useState(startId)
  const found = photos.findIndex((x) => x.id === curId)
  const i = found >= 0 ? found : Math.min(photos.length - 1, 0)
  const p = photos[i]
  const near = [photos[i - 1], p, photos[i + 1]].filter(Boolean).map((x) => x!.path)
  const urls = usePhotoUrls(near)
  const [sure, setSure] = useState(false)
  const [error, setError] = useState('')
  const startX = useRef<number | null>(null)

  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => { setSure(false); setError('') }, [curId])
  useEffect(() => { if (!p) onClose() }, [p, onClose])

  const go = (d: number) => { const n = photos[Math.min(photos.length - 1, Math.max(0, i + d))]; if (n) setCurId(n.id) }
  async function run(f: () => Promise<unknown>, after?: () => void) {
    setError('')
    try { await f(); await reload(); after?.() } catch (e) { setError(errText(e)) }
  }
  if (!p) return null
  const days = tripDays(t)

  return (
    <dialog ref={dialog} onClose={onClose} aria-label="Photo"
      onKeyDown={(e) => { if ((e.target as HTMLElement).tagName === 'INPUT') return; if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1) }}
      className="m-0 w-full max-w-full h-dvh max-h-dvh p-0 bg-black text-white border-0 backdrop:bg-black">
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2" style={{ paddingTop: 'max(8px, env(safe-area-inset-top, 0px))' }}>
          <span className="flex-1 text-sm text-white/80">{i + 1} of {photos.length}{p.taken_on ? ` · ${dayLabel(t, p.taken_on)}` : ''}</span>
          <button type="button" onClick={onClose} aria-label="Close photo" className="size-10 rounded-full border border-white/30 bg-transparent text-white cursor-pointer">✕</button>
        </div>
        <div className="relative flex-1 min-h-0 flex items-center justify-center select-none touch-pan-y"
          onPointerDown={(e: RPointerEvent) => { startX.current = e.clientX }}
          onPointerUp={(e: RPointerEvent) => { if (startX.current !== null) { const dx = e.clientX - startX.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1) } startX.current = null }}>
          {urls[p.path] ? <img src={urls[p.path]} alt={p.caption ?? ''} draggable={false} className="max-w-full max-h-full object-contain" /> : <span className="text-white/60">Loading…</span>}
          {i > 0 && <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-2 top-1/2 -translate-y-1/2 size-11 rounded-full border-0 bg-black/40 text-white text-2xl cursor-pointer">‹</button>}
          {i < photos.length - 1 && <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-2 top-1/2 -translate-y-1/2 size-11 rounded-full border-0 bg-black/40 text-white text-2xl cursor-pointer">›</button>}
        </div>
        <div className="px-3 pt-2 flex flex-col gap-2" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}>
          <input key={p.id} defaultValue={p.caption ?? ''} placeholder="Add a caption" aria-label="Caption"
            onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== p.caption) void run(() => updatePhoto(p.id, { caption: v })) }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="h-11 rounded-xl border border-white/25 bg-white/10 px-3 text-white placeholder:text-white/50 focus:outline-2 focus:outline-white" />
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Which day" value={p.taken_on && days.includes(p.taken_on) ? p.taken_on : ''}
              onChange={(e) => { const v = e.target.value; if (v) void run(() => updatePhoto(p.id, { taken_on: v })) }}
              className="h-10 rounded-xl border border-white/25 bg-white/10 px-2 text-white">
              <option value="" className="text-black">{p.taken_on && !days.includes(p.taken_on) ? shortDate(p.taken_on) : 'Pick a day'}</option>
              {days.map((k) => <option key={k} value={k} className="text-black">{dayLabel(t, k)}</option>)}
            </select>
            <button type="button" onClick={() => void run(() => setPhotoCover(t.id, p.id))}
              className="h-10 px-3 rounded-xl border border-white/30 bg-transparent text-white font-bold cursor-pointer">
              {t.cover.kind === 'photo' && t.cover.photo_id === p.id ? '✓ Cover' : 'Make cover'}
            </button>
            {sure
              ? <button type="button" onClick={() => { const next = photos[i + 1] ?? photos[i - 1]; void run(() => deletePhoto(p), () => { if (next) setCurId(next.id) }) }} className="ml-auto h-10 px-3 rounded-xl border-0 bg-bad text-white font-bold cursor-pointer">Delete it</button>
              : <button type="button" onClick={() => setSure(true)} className="ml-auto h-10 px-3 rounded-xl border border-white/30 bg-transparent text-white font-bold cursor-pointer">Delete</button>}
          </div>
          {error && <p role="alert" className="m-0 text-sm font-bold text-[#FF8A8A]">{error}</p>}
        </div>
      </div>
    </dialog>
  )
}

// ---------------------------------------------------------------------------
// A trip day on the calendar: the cover strip and that day's photos
// ---------------------------------------------------------------------------

export function DayPhotos({ trip: t, date, data, reload, onOpenAlbum }: { trip: Trip; date: string; data: TripsData; reload: Reload; onOpenAlbum: () => void }) {
  const cover = coverOf(t, data.photos)
  const today = photosOf(data.photos, t.id).filter((p) => p.taken_on === date)
  const thumbs = usePhotoUrls(today.slice(0, 4).map((p) => p.thumb_path))
  const [viewing, setViewing] = useState<string | null>(null)
  if (!cover && today.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      {cover && (
        <button type="button" onClick={onOpenAlbum} aria-label={`${t.name} photos`}
          className="relative h-16 rounded-xl overflow-hidden border-0 p-0 cursor-pointer bg-accent-soft">
          <CoverImg cover={cover} className="w-full h-full" />
          <span aria-hidden="true" className="absolute inset-0 bg-black/30" />
          <b className="absolute left-3 top-1/2 -translate-y-1/2 text-white drop-shadow">📷 {t.name}</b>
        </button>
      )}
      {today.length > 0 && (
        <div className="grid grid-cols-4 gap-1">
          {today.slice(0, 4).map((p, idx) => (
            <button key={p.id} type="button" onClick={() => (idx === 3 && today.length > 4 ? onOpenAlbum() : setViewing(p.id))}
              className="relative aspect-square rounded-lg overflow-hidden border-0 p-0 cursor-pointer bg-accent-soft" aria-label={idx === 3 && today.length > 4 ? `See all ${today.length} photos` : 'Open photo'}>
              {thumbs[p.thumb_path] && <img src={thumbs[p.thumb_path]} alt="" className="w-full h-full object-cover" />}
              {idx === 3 && today.length > 4 && <span className="absolute inset-0 bg-black/50 text-white font-bold grid place-items-center">+{today.length - 3}</span>}
            </button>
          ))}
        </div>
      )}
      {viewing && <PhotoViewer trip={t} photos={today} startId={viewing} reload={reload} onClose={() => setViewing(null)} />}
    </div>
  )
}
