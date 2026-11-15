import { keyOf, lastDayOfMonth } from './dates'
import { installmentAmount, installmentDate, type MoneyData } from './money'

// 💡 Ideas to free up cash: plain rules over your own data (nothing leaves Runway).
// Each idea says roughly how much it would free up per month; the biggest ones show first.

export const FAST_FOOD = [
  "mcdonald", 'chick-fil-a', 'chickfila', 'wendy', 'popeyes', 'burger king', 'taco bell', 'kfc', "zaxby", "arby", 'sonic drive', 'sonic',
  'checkers', 'rally', 'krystal', 'subway', 'five guys', 'wingstop', 'bojangles', 'jack in the box', 'whataburger', "domino", 'pizza hut',
  "papa john", 'little caesars', 'church', "hardee", "carl's jr", 'white castle', 'dairy queen', 'panda express', 'chipotle', 'shake shack',
  'raising cane', "culver", 'jersey mike', 'firehouse subs', 'jimmy john', 'el pollo loco', 'del taco', 'waffle house', 'ihop', 'cookout',
  'doordash', 'uber eats', 'ubereats', 'grubhub', 'postmates', 'starbucks', 'dunkin',
]
const DELIVERY = ['doordash', 'uber eats', 'ubereats', 'grubhub', 'postmates']
export const isFastFood = (s: string) => { const t = s.toLowerCase().replace(/[’']/g, "'"); return FAST_FOOD.some((w) => t.includes(w)) }

export interface Idea { key: string; icon: string; title: string; detail: string; frees: number | null }

const r0 = (n: number) => Math.round(n)
const money0 = (n: number) => `$${r0(n).toLocaleString('en-US')}`

export function cashIdeas(m: MoneyData, today: string): Idea[] {
  const ideas: Idea[] = []
  const first = today.slice(0, 8) + '01'
  const dayN = Number(today.slice(8, 10))
  const daysInMonth = lastDayOfMonth(today)
  const pace = (n: number) => (n / Math.max(dayN, 1)) * daysInMonth   // this month's pace for a full month
  const thisMonth = m.transactions.filter((t) => t.occurred_on >= first && t.occurred_on <= today && t.amount > 0)

  // Fast food & delivery
  const ff = thisMonth.filter((t) => isFastFood(t.description))
  if (ff.length >= 3) {
    const total = ff.reduce((s, t) => s + t.amount, 0)
    const delivery = ff.filter((t) => DELIVERY.some((w) => t.description.toLowerCase().includes(w))).length
    ideas.push({
      key: 'fastfood', icon: '🍔', title: `${ff.length} fast-food stops this month · ${money0(total)}`,
      detail: `On pace for about ${money0(pace(total))} this month.${delivery ? ` ${delivery} of them were delivery, which costs more.` : ''} Cutting it in half frees about ${money0(pace(total) / 2)} a month.`,
      frees: pace(total) / 2,
    })
  }

  // Categories running higher than your usual (last 3 full months)
  const prev = [1, 2, 3].map((k) => {
    const [y, mo] = today.split('-').map(Number)
    const f = keyOf(new Date(y, mo - 1 - k, 1)); const l = keyOf(new Date(y, mo - k, 0))
    return m.transactions.filter((t) => t.occurred_on >= f && t.occurred_on <= l && t.amount > 0)
  }).filter((list) => list.length > 0)
  if (prev.length && dayN >= 7) {
    const cats = new Set(thisMonth.map((t) => t.category))
    for (const c of cats) {
      if (c === 'Cash') continue
      const now = pace(thisMonth.filter((t) => t.category === c).reduce((s, t) => s + t.amount, 0))
      const usual = prev.reduce((s, list) => s + list.filter((t) => t.category === c).reduce((a, t) => a + t.amount, 0), 0) / prev.length
      if (now - usual >= 40 && now > usual * 1.25) {
        ideas.push({ key: `cat:${c}`, icon: '📈', title: `${c} is running high`, detail: `On pace for ${money0(now)} this month vs your usual ${money0(usual)}.`, frees: now - usual })
      }
    }
  }

  // Subscriptions
  const subs = m.subs.map((s) => ({ name: s.name, monthly: s.cycle === 'monthly' ? s.amount : s.cycle === 'yearly' ? s.amount / 12 : (s.amount * 52) / 12 }))
  const subTotal = subs.reduce((t, s) => t + s.monthly, 0)
  if (subs.length >= 3 && subTotal >= 30) {
    const top = [...subs].sort((a, b) => b.monthly - a.monthly).slice(0, 3)
    ideas.push({
      key: 'subs', icon: '↻', title: `${subs.length} subscriptions · ${money0(subTotal)} a month`,
      detail: `Biggest: ${top.map((s) => `${s.name} ${money0(s.monthly)}`).join(', ')}. Canceling one you rarely use frees about ${money0(top[top.length - 1].monthly)}+ a month.`,
      frees: top[top.length - 1].monthly,
    })
  }

  // Card interest
  const interest = m.cards.reduce((t, c) => t + (c.balance && c.apr ? (c.balance * c.apr) / 100 / 12 : 0), 0)
  if (interest >= 10) {
    ideas.push({ key: 'interest', icon: '💳', title: `Card interest ≈ ${money0(interest)} a month`, detail: 'That\'s money that buys nothing. The paydown plan (Bills) shows which card to hit first.', frees: interest / 3 })
  }

  // Pay-later this month
  const last = today.slice(0, 8) + String(daysInMonth).padStart(2, '0')
  let payLater = 0
  for (const o of m.orders) for (let n = 1; n <= o.installments; n++) { const d = installmentDate(o, n); if (d >= first && d <= last) payLater += installmentAmount(o, n) }
  if (payLater >= 50) {
    ideas.push({ key: 'paylater', icon: '🧾', title: `Afterpay + Affirm take ${money0(payLater)} this month`, detail: 'Skipping new pay-later buys until these finish frees that money up as each plan ends.', frees: null })
  }

  return ideas.sort((a, b) => (b.frees ?? 0) - (a.frees ?? 0))
}

