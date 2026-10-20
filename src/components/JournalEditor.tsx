import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { DAYS, MONTHS, dateOf } from '../lib/dates'
import { addTagToEntry, findOrCreateTag, removeTagFromEntry, saveEntry } from '../lib/journal'
import { MOODS, type JournalEntry, type Mood, type Tag } from '../lib/types'

const QUICK_EMOJI: [string, string][] = [['😊', 'smile'], ['❤️', 'heart'], ['😂', 'laughing'], ['🙏', 'praying hands'], ['🎉', 'party'], ['🥰', 'loved']]
const AUTO_STAMP_AFTER_MS = 2 * 60 * 60 * 1000   // come back 2+ hours later → time line added for you
const SAVE_DELAY_MS = 700                          // autosave this long after you stop typing

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: string } | { kind: 'error'; message: string }

interface Props {
  userId: string
  date: string
  today: string
  entry: JournalEntry | undefined
  allTags: Tag[]
  onSaved: (date: string, entry: JournalEntry | null) => void
  onTagCreated: (tag: Tag) => void
  /** Shown at the top of the right-hand column (payday, bills due, auto-pay) */
  side?: ReactNode
  /** Inside a phone card: no outer frame and no big date title */
  compact?: boolean
}

const timeNow = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** Mounted with key={date}, so each day starts fresh and any unsaved text is saved when you switch days. */
export default function JournalEditor({ userId, date, today, entry, allTags, onSaved, onTagCreated, side, compact }: Props) {
  const [body, setBody] = useState(entry?.body ?? '')
  const [mood, setMood] = useState<Mood | null>(entry?.mood ?? null)
  const [tags, setTags] = useState<Tag[]>(entry?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const textRef = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef(false)
  const latest = useRef({ body, mood, tags, entry })
  latest.current = { body, mood, tags, entry: latest.current.entry }
  const stampedThisVisit = useRef(false)
  const caret = useRef<number | null>(null)   // where to put the cursor after the next text change

  // Place the cursor in the same paint as the text change, so no keystroke lands in the wrong spot
  useLayoutEffect(() => {
    if (caret.current === null || !textRef.current) return
    textRef.current.setSelectionRange(caret.current, caret.current)
    caret.current = null
  }, [body])

  const persist = useCallback(async () => {
    window.clearTimeout(timer.current)
    if (!pending.current) return latest.current.entry ?? null
    pending.current = false
    const { body: b, mood: m, tags: t } = latest.current
    setStatus({ kind: 'saving' })
    try {
      const saved = await saveEntry(userId, date, { body: b, mood: m }, t.length > 0)
      if (saved) saved.tags = t
      latest.current.entry = saved ?? undefined
      onSaved(date, saved)
      setStatus({ kind: 'saved', at: timeNow() })
      return saved
    } catch (e) {
      pending.current = true
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
      return null
    }
  }, [userId, date, onSaved])

  const schedule = useCallback(() => {
    pending.current = true
    setStatus({ kind: 'saving' })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { void persist() }, SAVE_DELAY_MS)
  }, [persist])

  // Save right away when leaving the day, closing the tab, or switching apps on the phone
  useEffect(() => {
    const flush = () => { if (pending.current) void persist() }
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [persist])

  function stampLine(current: string) {
    return (current && !current.endsWith('\n') ? '\n' : '') + `— ${timeNow()} —\n`
  }

  function onFocus() {
    const e = latest.current.entry
    if (stampedThisVisit.current || !e?.body.trim()) return
    if (Date.now() - Date.parse(e.updated_at) < AUTO_STAMP_AFTER_MS) return
    stampedThisVisit.current = true
    const next = body + stampLine(body)
    caret.current = next.length
    setBody(next)
    latest.current.body = next
    schedule()
  }

  function addStamp() {
    const next = body + stampLine(body)
    // Focus in the same click, so the very next keystroke lands in the journal
    textRef.current?.focus()
    caret.current = next.length
    setBody(next)
    latest.current.body = next
    schedule()
    stampedThisVisit.current = true
  }

  function insertEmoji(emoji: string) {
    const el = textRef.current
    const active = document.activeElement === el
    const start = active && el ? el.selectionStart : body.length
    const end = active && el ? el.selectionEnd : body.length
    const next = body.slice(0, start) + emoji + body.slice(end)
    el?.focus()
    caret.current = start + emoji.length
    setBody(next)
    latest.current.body = next
    schedule()
  }

  function pickMood(m: Mood) {
    const next = mood === m ? null : m
    setMood(next)
    latest.current.mood = next
    schedule()
  }

  async function addTag() {
    const name = tagDraft.trim().replace(/^#/, '')
    setTagDraft('')
    if (!name || tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) return
    try {
      setStatus({ kind: 'saving' })
      const tag = await findOrCreateTag(name, allTags)
      if (!allTags.some((t) => t.id === tag.id)) onTagCreated(tag)
      const nextTags = [...tags, tag]
      setTags(nextTags)
      latest.current.tags = nextTags
      // The entry must exist before a tag can attach to it
      pending.current = true
      const saved = await persist()
      if (!saved) return
      await addTagToEntry(saved.id, tag.id)
      saved.tags = nextTags
      onSaved(date, saved)
      setStatus({ kind: 'saved', at: timeNow() })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Unknown error' })
    }
  }

  async function removeTag(tag: Tag) {
    const nextTags = tags.filter((t) => t.id !== tag.id)
    setTags(nextTags)
    latest.current.tags = nextTags
    const e = latest.current.entry
    if (!e) return
    try {
      setStatus({ kind: 'saving' })
      await removeTagFromEntry(e.id, tag.id)
      pending.current = true
      await persist()   // also deletes the entry if it's now completely empty
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); void addTag() }
  }

  const d = dateOf(date)
  const title = `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
  const suggestions = allTags.filter((t) => !tags.some((x) => x.id === t.id))

  return (
    <section aria-label={`Journal for ${title}`}
      className={compact
        ? 'flex flex-col-reverse gap-4 p-2'
        : 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_430px] gap-5 rounded-2xl border border-line border-t-[5px] border-t-accent-hi bg-surface p-4 sm:p-5'}>
      <div className="flex flex-col gap-3 min-w-0">
        <div className={compact ? 'sr-only' : 'flex flex-wrap items-center gap-2.5'}>
          <h2 className="m-0 text-3xl font-bold leading-tight">{title}</h2>
          {date === today && <span className="rounded-full bg-accent text-accent-ink px-2.5 py-0.5 text-xs font-extrabold tracking-wider">TODAY</span>}
          {date > today && <span className="rounded-full bg-accent-soft text-accent px-2.5 py-0.5 text-xs font-extrabold tracking-wider">UPCOMING</span>}
        </div>

        <label htmlFor="journal-body" className="text-xs font-bold tracking-widest uppercase text-muted">Journal</label>
        <textarea
          id="journal-body" ref={textRef} value={body} onFocus={onFocus}
          onChange={(e) => { setBody(e.target.value); latest.current.body = e.target.value; schedule() }}
          placeholder="Write about your day…"
          className={`${compact ? 'min-h-44 h-[26vh]' : 'min-h-60 h-[32vh]'} resize-y rounded-2xl border border-line bg-surface-2 p-4 text-[17px] leading-relaxed text-fg focus:outline-2 focus:outline-accent-hi`}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={addStamp}
            className="h-11 px-3.5 inline-flex items-center gap-2 rounded-xl border-0 bg-accent text-accent-ink font-bold cursor-pointer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            Timestamp
          </button>
          {QUICK_EMOJI.map(([emoji, label]) => (
            <button key={emoji} type="button" aria-label={`Insert ${label}`}
              onMouseDown={(e) => e.preventDefault()} onClick={() => insertEmoji(emoji)}
              className="size-11 rounded-xl border border-line bg-surface text-xl cursor-pointer hover:border-accent-hi">{emoji}</button>
          ))}
          <SaveStatus status={status} onRetry={() => { pending.current = true; void persist() }} />
        </div>
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        {side}
        <div className="flex flex-col gap-2">
          <span id="mood-label" className="text-xs font-bold tracking-widest uppercase text-muted">Mood</span>
          <div role="group" aria-labelledby="mood-label" className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {MOODS.map((m) => {
              const on = mood === m.id
              return (
                <button key={m.id} type="button" aria-pressed={on} onClick={() => pickMood(m.id)}
                  className={`min-h-16 flex flex-col items-center justify-center gap-1 rounded-xl border cursor-pointer px-0.5 ${on ? 'bg-accent border-accent text-accent-ink' : 'bg-surface border-line text-muted hover:border-accent-hi'}`}>
                  <span className="text-2xl leading-none" aria-hidden="true">{m.emoji}</span>
                  <span className="text-xs font-bold">{m.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold tracking-widest uppercase text-muted">Tags</span>
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-0.5 h-8 pl-3 pr-1 rounded-full bg-accent-soft text-fg text-sm font-bold">
                {t.name}
                <button type="button" aria-label={`Remove tag ${t.name}`} onClick={() => void removeTag(t)}
                  className="size-6 rounded-full border-0 bg-transparent text-accent grid place-items-center cursor-pointer">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </span>
            ))}
            <label htmlFor="tag-input" className="inline-flex items-center h-8 px-2.5 rounded-full border border-dashed border-muted focus-within:border-solid focus-within:border-accent-hi">
              <span className="sr-only">Add tag</span>
              <input id="tag-input" list="tag-suggestions" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={onTagKey} onBlur={() => { if (tagDraft.trim()) void addTag() }}
                placeholder="+ add tag" autoComplete="off"
                className="w-28 border-0 bg-transparent text-sm text-fg focus:outline-none" />
            </label>
            <datalist id="tag-suggestions">
              {suggestions.map((t) => <option key={t.id} value={t.name} />)}
            </datalist>
          </div>
        </div>
      </div>
    </section>
  )
}

function SaveStatus({ status, onRetry }: { status: Status; onRetry: () => void }) {
  if (status.kind === 'idle') return null
  if (status.kind === 'saving') return <span className="ml-auto text-sm font-bold text-muted" aria-live="polite">Saving…</span>
  if (status.kind === 'saved') {
    return (
      <span className="ml-auto inline-flex items-center gap-1.5 text-sm font-bold text-pay-ink" aria-live="polite">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
        Saved {status.at}
      </span>
    )
  }
  return (
    <span role="alert" className="ml-auto inline-flex flex-wrap items-center gap-2 text-sm font-bold text-bad">
      Couldn't save. Your text is still here.
      <button type="button" onClick={onRetry} className="h-8 px-3 rounded-lg border border-bad bg-transparent text-bad font-bold cursor-pointer">Try again</button>
    </span>
  )
}
