// Row shapes for the tables created by 01_schema.sql (the columns the app reads)

export type Mood = 'happy' | 'loved' | 'neutral' | 'sad' | 'tired' | 'sick' | 'stressed'

export const MOODS: { id: Mood; emoji: string; label: string }[] = [
  { id: 'happy', emoji: '😊', label: 'Happy' },
  { id: 'loved', emoji: '🥰', label: 'Loved' },
  { id: 'neutral', emoji: '😐', label: 'Neutral' },
  { id: 'sad', emoji: '😔', label: 'Sad' },
  { id: 'tired', emoji: '😴', label: 'Tired' },
  { id: 'sick', emoji: '🤒', label: 'Sick' },
  { id: 'stressed', emoji: '😰', label: 'Stressed' },
]

export const MOOD_EMOJI: Record<Mood, string> = Object.fromEntries(MOODS.map((m) => [m.id, m.emoji])) as Record<Mood, string>

/** Bright colors that sit well next to the violet theme */
export const SWATCHES: { hex: string; name: string }[] = [
  { hex: '#00A3A3', name: 'Teal' },
  { hex: '#E11D74', name: 'Rose' },
  { hex: '#2563EB', name: 'Cobalt' },
  { hex: '#E0A100', name: 'Gold' },
  { hex: '#0EA5E9', name: 'Sky' },
  { hex: '#F97316', name: 'Tangerine' },
]

export interface Settings {
  user_id: string
  display_name: string
  week_starts_on: number
  pay_start: string | null
  pay_every_days: number
  hide_balances: boolean
}

export interface Account { id: string; name: string; institution: string | null; kind: 'checking' | 'savings' | 'vault'; balance: number | null; role_note: string | null; sort: number }
export interface PaycheckSplit { id: string; account_id: string; amount: number }

export interface Card {
  id: string
  name: string
  last4: string | null
  due_day: number
  balance: number | null
  credit_limit: number | null
  minimum_payment: number | null
  apr: number | null
  autopay: boolean
  color: string
  tracking_since: string
  is_active: boolean
}

export interface Bill {
  id: string
  name: string
  due_day: number
  amount: number | null
  account_id: string | null
  autopay: boolean
  color: string
  tracking_since: string
  is_active: boolean
}

export interface Subscription {
  id: string
  name: string
  amount: number
  cycle: 'weekly' | 'monthly' | 'yearly'
  charge_day: number
  charge_month: number | null
  account_id: string | null
  card_id: string | null
  category: string
  started_on: string
  is_active: boolean
}

export interface AfterpayOrder {
  id: string
  name: string
  total: number
  order_date: string
  installments: number
  interval_days: number
  account_id: string | null
  card_id: string | null
}

export interface Payment {
  id: string
  card_id: string | null
  bill_id: string | null
  afterpay_order_id: string | null
  installment_no: number | null
  due_date: string
  amount: number
  paid_on: string
}

export interface Todo { id: string; text: string; due_date: string | null; done_at: string | null; repeat: string }

export interface Tag { id: string; name: string; color: string }

export interface JournalEntry {
  id: string
  entry_date: string
  body: string
  mood: Mood | null
  updated_at: string
  tags: Tag[]
}
