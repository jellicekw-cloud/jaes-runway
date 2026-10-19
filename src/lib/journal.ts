import { supabase } from './supabase'
import type { JournalEntry, Mood, Tag } from './types'

// Journal reads and writes. One entry per calendar day (unique user_id + entry_date).

const ENTRY_FIELDS = 'id, entry_date, body, mood, updated_at, entry_tags(tags(id, name, color))'

interface RawEntry {
  id: string
  entry_date: string
  body: string
  mood: Mood | null
  updated_at: string
  entry_tags?: { tags: Tag | null }[]
}

function shape(raw: RawEntry): JournalEntry {
  return {
    id: raw.id,
    entry_date: raw.entry_date,
    body: raw.body ?? '',
    mood: raw.mood,
    updated_at: raw.updated_at,
    tags: (raw.entry_tags ?? []).map((et) => et.tags).filter((t): t is Tag => Boolean(t)),
  }
}

export async function loadEntries(from: string, to: string): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select(ENTRY_FIELDS)
    .gte('entry_date', from)
    .lte('entry_date', to)
  if (error) throw error
  return ((data ?? []) as unknown as RawEntry[]).map(shape)
}

/**
 * Create or update the entry for a day. Returns the saved entry.
 * An entry with no text, no mood and no tags is deleted instead, so empty days stay empty.
 */
export async function saveEntry(
  userId: string,
  date: string,
  fields: { body: string; mood: Mood | null },
  hasTags: boolean,
): Promise<JournalEntry | null> {
  if (!fields.body.trim() && !fields.mood && !hasTags) {
    const { error } = await supabase.from('journal_entries').delete().eq('entry_date', date)
    if (error) throw error
    return null
  }
  const { data, error } = await supabase
    .from('journal_entries')
    .upsert({ user_id: userId, entry_date: date, body: fields.body, mood: fields.mood }, { onConflict: 'user_id,entry_date' })
    .select(ENTRY_FIELDS)
    .single()
  if (error) throw error
  return shape(data as unknown as RawEntry)
}

export async function loadTags(): Promise<Tag[]> {
  const { data, error } = await supabase.from('tags').select('id, name, color').order('name')
  if (error) throw error
  return (data ?? []) as Tag[]
}

/** Finds a tag by name (any capitalization) or creates it. Tags are stored lowercase. */
export async function findOrCreateTag(name: string, known: Tag[]): Promise<Tag> {
  const clean = name.trim().toLowerCase().replace(/^#/, '')
  const existing = known.find((t) => t.name.toLowerCase() === clean)
  if (existing) return existing
  const { data, error } = await supabase.from('tags').insert({ name: clean }).select('id, name, color').single()
  if (error) throw error
  return data as Tag
}

export async function addTagToEntry(entryId: string, tagId: string): Promise<void> {
  const { error } = await supabase.from('entry_tags').upsert({ entry_id: entryId, tag_id: tagId }, { onConflict: 'entry_id,tag_id', ignoreDuplicates: true })
  if (error) throw error
}

export async function removeTagFromEntry(entryId: string, tagId: string): Promise<void> {
  const { error } = await supabase.from('entry_tags').delete().eq('entry_id', entryId).eq('tag_id', tagId)
  if (error) throw error
}

export interface SearchHit { entry_date: string; body: string; mood: Mood | null; via: 'text' | 'tag'; tag?: string }

/** Searches journal text (any part of a word, emoji included) and tag names. */
export async function searchJournal(query: string): Promise<SearchHit[]> {
  const q = query.trim()
  if (!q) return []
  const pattern = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`
  const [byText, byTag] = await Promise.all([
    supabase.from('journal_entries').select('entry_date, body, mood').ilike('body', pattern).order('entry_date', { ascending: false }).limit(25),
    supabase.from('tags').select('name, entry_tags(journal_entries(entry_date, body, mood))').ilike('name', pattern).limit(10),
  ])
  if (byText.error) throw byText.error
  if (byTag.error) throw byTag.error

  const hits = new Map<string, SearchHit>()
  for (const e of (byText.data ?? []) as { entry_date: string; body: string; mood: Mood | null }[]) {
    hits.set(e.entry_date, { ...e, via: 'text' })
  }
  type TagRow = { name: string; entry_tags: { journal_entries: { entry_date: string; body: string; mood: Mood | null } | null }[] }
  for (const t of (byTag.data ?? []) as unknown as TagRow[]) {
    for (const et of t.entry_tags ?? []) {
      const e = et.journal_entries
      if (e && !hits.has(e.entry_date)) hits.set(e.entry_date, { ...e, via: 'tag', tag: t.name })
    }
  }
  return [...hits.values()].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1)).slice(0, 25)
}
