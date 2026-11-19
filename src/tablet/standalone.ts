import { EMPTY_MONEY, type MoneyData } from '../lib/money'
import type { TabletData } from './store'

// The stand-alone budget: no sign-in, no Runway. It starts from your Clover Brook sheet
// (Roth IRA and the "billed to Amex" notes left out) and lives only on this tablet.
// Bill due days are a best guess (the 1st, cards the 15th); amounts are from the sheet: change any budget by clicking it.

const UID = 'standalone'
const id = (k: string) => `sa-${k}`
const at = () => new Date().toISOString()

export function seedStandalone(today: string): TabletData {
  const month = today.slice(0, 7)
  const since = `${month}-01`
  const acct = (key: string, name: string, institution: string, kind: MoneyData['accounts'][number]['kind'], sort: number, role: string) => ({
    id: id(key), user_id: UID, name, institution, kind, balance: null, balance_as_of: null, role_note: role, sort, is_active: true,
    created_at: at(), updated_at: at(), auto_from_account_id: null, auto_amount: null, auto_every_days: null, auto_next_on: null, goal_amount: null,
  })
  const accounts = [
    acct('nfcu', 'NFCU Checking', 'NFCU', 'checking', 1, 'Bills & subscriptions'),
    acct('sofi', 'SoFi Checking', 'SoFi', 'checking', 2, 'Savings challenge & AARP'),
    acct('vault', 'SoFi Vault', 'SoFi', 'vault', 3, 'Savings challenge'),
    acct('decu', 'DECU Savings', 'DECU', 'savings', 4, 'Savings'),
    acct('nfcusav', 'NFCU Savings', 'NFCU', 'savings', 5, '52-week plan, going up'),
    acct('fidelity', 'Fidelity', 'Fidelity', 'invest', 8, 'Saving · from your paycheck'),
  ]
  const NFCU = id('nfcu'), SOFI = id('sofi')
  const bill = (key: string, name: string, amount: number | null, account: string, due = 1, extra: Record<string, unknown> = {}) => ({
    id: id(key), user_id: UID, name, due_day: due, amount, account_id: account, autopay: false, color: '#22405F', tracking_since: since,
    is_active: true, frequency: 'monthly', created_at: at(), updated_at: at(), ...extra,
  })
  const bills = [
    bill('cbm', 'Clover Brook Mortgage', 875, NFCU, 1, { frequency: 'payday', autopay: true }),
    bill('lizella', 'Lizella Mortgage', 300, NFCU),
    bill('hoa', 'HOA', 75, NFCU),
    bill('ring', 'Ring Alarm', null, NFCU),
    bill('att', 'AT&T Fiber', null, NFCU),
    bill('power', 'Georgia Power', 492, NFCU),
    bill('water', 'Locust Grove Water', null, NFCU),
    bill('tmobile', 'T-Mobile', null, NFCU),
    bill('carloan', 'Car loan', 593.93, NFCU, 19, { autopay: true }),
    bill('root', 'Root Auto Insurance', null, NFCU),
    bill('aarp', 'AARP Life ($100K)', 51, SOFI),
    bill('pacific', 'Pacific Life ($750K)', 280.93, NFCU),
    bill('msoffice', 'Microsoft Office', 9.99, NFCU),
  ]
  const card = (key: string, name: string, min: number | null) => ({
    id: id(key), user_id: UID, name, last4: null, due_day: 15, balance: null, credit_limit: null, minimum_payment: min, apr: null,
    autopay: false, color: '#E8562A', tracking_since: since, is_active: true, created_at: at(), updated_at: at(),
  })
  const cards = [
    card('bjs', "BJ's Capital One", 461.91), card('oldnavy', 'Old Navy', 234.89), card('bestbuy', 'Best Buy', 160),
    card('creditone', 'Credit One Amex', 557.95), card('hilton', 'Hilton Amex', 1320.14),
    card('kohls', "Kohl's", null), card('vs', "Victoria's Secret", null), card('lowes', "Lowe's", null),
  ]
  const sub = (key: string, name: string, amount: number, category: string) => ({
    id: id(key), user_id: UID, name, amount, cycle: 'monthly', charge_day: 5, charge_month: null, account_id: NFCU, card_id: null,
    category, trial_ends: null, started_on: since, is_active: true, created_at: at(), updated_at: at(),
  })
  const subs = [
    sub('prime', 'Amazon Prime', 16.19, 'Streaming'), sub('netflix', 'Netflix', 22.99, 'Streaming'), sub('disney', 'Disney Plus', 12, 'Streaming'),
  ]
  const ch = (key: string, name: string, first: number, step: number, from: string, to: string) => ({
    id: id(key), user_id: UID, name, start_date: '2026-10-30', every_days: 14, deposit_count: 26, first_amount: first, step_amount: step,
    from_account_id: from, to_account_id: to, is_active: true, created_at: at(), updated_at: at(),
  })
  const challenges = [
    ch('sofi52', '52-Week Challenge (reverse, by payday)', 103, -4, SOFI, id('vault')),
    { ...ch('nfcu52', 'NFCU 52-week · going up', 3, 4, NFCU, id('nfcusav')), start_date: '2026-11-13' },
  ]
  const m = {
    ...EMPTY_MONEY,
    settings: { user_id: UID, display_name: 'Jae', timezone: 'America/New_York', week_starts_on: 1, pay_start: '2026-10-30', pay_every_days: 14, hide_balances: false, cash_per_payday: 40 },
    accounts, bills, cards, subs, challenges, challenge: challenges[0],
    splits: [{ id: id('split-nfcu'), account_id: NFCU, amount: 1623.62 }, { id: id('split-sofi'), account_id: SOFI, amount: 650 }],
    historyFrom: '2026-01-01',
  } as unknown as MoneyData
  const amounts = [
    ['spend:Food', 350], ['spend:fastfood', 80], ['spend:Charging', 40], ['spend:Sent to people', 440], ['spend:Shopping', 290],
  ].map(([line_key, amount]) => ({ month, line_key: line_key as string, amount: amount as number }))
  return {
    version: 1, userId: UID, m, pulledAt: null, outbox: [],
    x: { amounts, lineCats: [], notes: [], ready: true },
  }
}
