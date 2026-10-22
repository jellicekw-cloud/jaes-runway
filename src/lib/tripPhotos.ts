import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { keyOf } from './dates'
import type { Trip, TripPhoto } from './trips'

// Trip photos: private files in Supabase Storage (bucket "trip-photos"), shrunk on your phone before upload.
// Each photo is saved twice: a 1600px copy to look at and a small thumbnail for grids.

const BUCKET = 'trip-photos'
const FULL_SIDE = 1600
const THUMB_SIDE = 480

// ---------------------------------------------------------------------------
// When was it taken? (reads the date your phone saved inside the photo)
// ---------------------------------------------------------------------------

/** "YYYY-MM-DD" from a JPEG's EXIF DateTimeOriginal (or DateTime), or null. */
export async function exifDate(file: Blob): Promise<string | null> {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer()
    const v = new DataView(buf)
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null
    let off = 2
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off)
      const len = v.getUint16(off + 2)
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return readTiff(v, off + 10)   // "Exif"
      if ((marker & 0xff00) !== 0xff00) return null
      off += 2 + len
    }
  } catch { /* not readable: fall back */ }
  return null
}

function readTiff(v: DataView, start: number): string | null {
  const little = v.getUint16(start) === 0x4949
  const u16 = (o: number) => v.getUint16(start + o, little)
  const u32 = (o: number) => v.getUint32(start + o, little)
  const ascii = (o: number, n: number) => { let s = ''; for (let i = 0; i < n; i++) { const c = v.getUint8(start + o + i); if (!c) break; s += String.fromCharCode(c) } return s }
  const scan = (ifd: number, want: number[]): Record<number, number> => {
    const found: Record<number, number> = {}
    const n = u16(ifd)
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12
      const tag = u16(e)
      if (want.includes(tag)) found[tag] = e
    }
    return found
  }
  const toDay = (s: string) => { const m = s.match(/^(\d{4}):(\d{2}):(\d{2})/); return m && m[1] !== '0000' ? `${m[1]}-${m[2]}-${m[3]}` : null }
  const ifd0 = u32(4)
  const t0 = scan(ifd0, [0x8769, 0x0132])
  if (t0[0x8769] !== undefined) {
    const exif = scan(u32(t0[0x8769] + 8), [0x9003])
    if (exif[0x9003] !== undefined) { const d = toDay(ascii(u32(exif[0x9003] + 8), 19)); if (d) return d }
  }
  if (t0[0x0132] !== undefined) return toDay(ascii(u32(t0[0x0132] + 8), 19))
  return null
}

// ---------------------------------------------------------------------------
// Shrinking
// ---------------------------------------------------------------------------

type Source = { el: CanvasImageSource; width: number; height: number; done: () => void }

async function decode(file: Blob): Promise<Source> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { el: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() }
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return { el: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) }
    } catch {
      URL.revokeObjectURL(url)
      throw new Error('This photo type can\'t be read here. Try a JPEG, or share it from Photos as "Most Compatible".')
    }
  }
}

function toJpeg(src: Source, maxSide: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height))
  const width = Math.max(1, Math.round(src.width * scale)), height = Math.max(1, Math.round(src.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src.el, 0, 0, width, height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve({ blob: b, width, height }) : reject(new Error('Couldn\'t shrink the photo'))), 'image/jpeg', quality))
}

// ---------------------------------------------------------------------------
// Uploading, changing, deleting
// ---------------------------------------------------------------------------

/** Shrinks and uploads photos one at a time. onProgress(done, total). Returns how many failed. */
export async function uploadTripPhotos(tripId: string, files: File[], onProgress: (done: number, total: number) => void): Promise<{ failed: number; lastError: string }> {
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) throw new Error('Sign in again to add photos.')
  let failed = 0, lastError = '', done = 0
  onProgress(0, files.length)
  for (const file of files) {
    try {
      const taken = (await exifDate(file)) ?? keyOf(new Date(file.lastModified || Date.now()))
      const src = await decode(file)
      const full = await toJpeg(src, FULL_SIDE, 0.82)
      const thumb = await toJpeg(src, THUMB_SIDE, 0.74)
      src.done()
      const id = crypto.randomUUID()
      const path = `${uid}/${tripId}/${id}.jpg`, thumb_path = `${uid}/${tripId}/${id}_t.jpg`
      const store = supabase.storage.from(BUCKET)
      const a = await store.upload(path, full.blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
      if (a.error) throw a.error
      const b = await store.upload(thumb_path, thumb.blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
      if (b.error) { await store.remove([path]); throw b.error }
      const row = await supabase.from('trip_photos').insert({ trip_id: tripId, path, thumb_path, taken_on: taken, width: full.width, height: full.height })
      if (row.error) { await store.remove([path, thumb_path]); throw row.error }
    } catch (e) {
      failed++
      lastError = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
    }
    onProgress(++done, files.length)
  }
  return { failed, lastError }
}

export async function updatePhoto(id: string, patch: { caption?: string | null; taken_on?: string | null }): Promise<void> {
  const { error } = await supabase.from('trip_photos').update(patch).eq('id', id)
  if (error) throw error
}

export async function deletePhoto(p: TripPhoto): Promise<void> {
  const { error } = await supabase.from('trip_photos').delete().eq('id', p.id)
  if (error) throw error
  await supabase.storage.from(BUCKET).remove([p.path, p.thumb_path])
}

// ---------------------------------------------------------------------------
// Seeing them (private links that last an hour, cached)
// ---------------------------------------------------------------------------

const cache = new Map<string, { url: string; until: number }>()

async function signed(paths: string[]): Promise<void> {
  const need = paths.filter((p) => { const c = cache.get(p); return !c || c.until < Date.now() + 60_000 })
  if (!need.length) return
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(need, 3600)
  for (const r of data ?? []) if (r.signedUrl && r.path) cache.set(r.path, { url: r.signedUrl, until: Date.now() + 3_500_000 })
}

/** Viewable links for these storage paths (fills in as they load). */
export function usePhotoUrls(paths: string[]): Record<string, string> {
  const key = paths.join('|')
  const [, bump] = useState(0)
  useEffect(() => {
    let live = true
    if (paths.length) void signed(paths).then(() => { if (live) bump((n) => n + 1) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const out: Record<string, string> = {}
  for (const p of paths) { const c = cache.get(p); if (c) out[p] = c.url }
  return out
}

// ---------------------------------------------------------------------------
// Covers
// ---------------------------------------------------------------------------

export type CoverView =
  | { src: 'photo'; photo: TripPhoto }
  | { src: 'stock'; url: string; thumb: string; credit_name: string | null; credit_link: string | null }

export const photosOf = (photos: TripPhoto[], tripId: string) => photos.filter((p) => p.trip_id === tripId)

/** The cover to show: the one you picked, otherwise your first photo, otherwise nothing. */
export function coverOf(t: Trip, photos: TripPhoto[]): CoverView | null {
  const mine = photosOf(photos, t.id)
  if (t.cover.kind === 'stock' && t.cover.url) {
    return { src: 'stock', url: t.cover.url, thumb: t.cover.thumb_url ?? t.cover.url, credit_name: t.cover.credit_name, credit_link: t.cover.credit_link }
  }
  const picked = t.cover.kind === 'photo' ? mine.find((p) => p.id === t.cover.photo_id) : undefined
  const first = picked ?? mine[0]
  return first ? { src: 'photo', photo: first } : null
}

export async function setPhotoCover(tripId: string, photoId: string): Promise<void> {
  const { error } = await supabase.from('trips').update({
    cover_kind: 'photo', cover_photo_id: photoId, cover_url: null, cover_thumb_url: null, cover_credit_name: null, cover_credit_link: null,
  }).eq('id', tripId)
  if (error) throw error
}

export interface StockPhoto { id: string; thumb: string; regular: string; alt: string; credit_name: string; credit_link: string; download_location: string }

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('runway-inbox', { body })
  if (error) {
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      const j = ctx ? await ctx.json() : null
      if (j?.error) msg = j.error === 'Unknown action' ? 'Update the email reader in Supabase to get place photos (see the setup notes).' : j.error
    } catch { /* keep generic */ }
    throw new Error(msg)
  }
  return data as T
}

export const searchCovers = (query: string) => call<{ photos: StockPhoto[] }>({ action: 'cover_search', query }).then((r) => r.photos ?? [])
export const pickCover = (tripId: string, photo: StockPhoto) => call<{ ok: boolean }>({ action: 'cover_pick', trip_id: tripId, photo })

/** Unsplash asks for links back to them with these tags. */
export const UNSPLASH_HOME = 'https://unsplash.com/?utm_source=jaes_runway&utm_medium=referral'
