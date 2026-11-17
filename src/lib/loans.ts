import { supabase } from './supabase'
import { addMonthsKeepDay, type MoneyData } from './money'

// Loans (the car loan): balance now, payoff date, interest left, and what extra payments would do.
// Interest is figured monthly (APR ÷ 12 on what's left), which is how most car loans are quoted;
// your lender's own numbers can differ by a few dollars. Extra payments go straight to principal.

export interface Loan {
  id: string; name: string; principal: number; apr: number; term_months: number
  first_due: string; payment: number; bill_id: string | null; is_active: boolean
}
export interface LoanExtra { id: string; loan_id: string; amount: number; paid_on: string; account_id: string | null; created_at: string }

const r2 = (n: number) => Math.round(n * 100) / 100

export interface LoanStatus {
  balance: number            // what's left today
  paidOff: number            // principal paid so far
  paymentsMade: number
  interestPaid: number
  extraPaid: number
  payoff: string             // last payment date, as things stand
  paymentsLeft: number
  interestLeft: number
  next: string | null        // next payment date
  originalPayoff: string
  originalInterest: number
}

/** Runs the loan month by month: payments due through today count as made (it's on autopay), then projects the rest. */
export function loanStatus(loan: Loan, extras: LoanExtra[], today: string, whatIfExtra = 0): LoanStatus {
  const r = loan.apr / 1200
  const mine = extras.filter((x) => x.loan_id === loan.id).sort((a, b) => a.paid_on.localeCompare(b.paid_on))
  let b = loan.principal
  let i = 0, interestPaid = 0, interestLeft = 0, paymentsMade = 0, used = 0, prevDue = ''
  let balance: number | null = null
  let next: string | null = null
  let payoff = loan.first_due
  while (b > 0.005 && i < 600) {
    const due = addMonthsKeepDay(loan.first_due, i)
    // extra payments made before this due date come off the principal first
    while (used < mine.length && mine[used].paid_on < due) { b = r2(Math.max(0, b - mine[used].amount)); used++ }
    if (balance === null && due > today) {
      // today sits before this payment: count extras made up to today, then take the balance
      balance = b
      next = due
    }
    if (b <= 0.005) break
    const interest = r2(b * r)
    const future = due > today
    // the last scheduled payment settles the few cents rounding leaves (lenders adjust the final payment)
    const pay = i >= loan.term_months - 1 ? r2(b + interest) : Math.min(r2(b + interest), r2(loan.payment + (future ? whatIfExtra : 0)))
    b = r2(b + interest - pay)
    if (future) interestLeft += interest
    else { interestPaid += interest; paymentsMade++ }
    payoff = due
    prevDue = due
    i++
  }
  void prevDue
  while (used < mine.length) { b = r2(Math.max(0, b - mine[used].amount)); used++ }
  if (balance === null) balance = Math.max(0, b)
  const base = baseline(loan)
  const extraPaid = r2(mine.reduce((t, x) => t + x.amount, 0))
  return {
    balance: r2(balance), paidOff: r2(loan.principal - balance), paymentsMade, interestPaid: r2(interestPaid), extraPaid,
    payoff, paymentsLeft: Math.max(0, i - paymentsMade), interestLeft: r2(interestLeft), next,
    originalPayoff: base.payoff, originalInterest: base.interest,
  }
}

/** The loan as signed: no extra payments ever. */
function baseline(loan: Loan): { payoff: string; interest: number } {
  const r = loan.apr / 1200
  let b = loan.principal, i = 0, interest = 0, payoff = loan.first_due
  while (b > 0.005 && i < 600) {
    const due = addMonthsKeepDay(loan.first_due, i)
    const int = r2(b * r)
    interest += int
    b = i >= loan.term_months - 1 ? 0 : r2(b + int - Math.min(r2(b + int), loan.payment))
    payoff = due
    i++
  }
  return { payoff, interest: r2(interest) }
}

/** "Pay $100 more a month → paid off Apr 2030, $546 less interest" for a few amounts. */
export function whatIf(loan: Loan, extras: LoanExtra[], today: string, amounts = [50, 100, 200, 300]) {
  const now = loanStatus(loan, extras, today)
  return amounts.map((extra) => {
    const s = loanStatus(loan, extras, today, extra)
    return { extra, payoff: s.payoff, sooner: Math.max(0, now.paymentsLeft - s.paymentsLeft), saved: r2(now.interestLeft - s.interestLeft) }
  })
}

export async function addLoanExtra(loanId: string, amount: number, paidOn: string, accountId: string | null): Promise<void> {
  const { error } = await supabase.from('loan_extra_payments').insert({ loan_id: loanId, amount, paid_on: paidOn, account_id: accountId })
  if (error) throw error
}

export async function deleteLoanExtra(id: string): Promise<void> {
  const { error } = await supabase.from('loan_extra_payments').delete().eq('id', id)
  if (error) throw error
}

export const loanBill = (m: MoneyData, loan: Loan) => m.bills.find((b) => b.id === loan.bill_id) ?? null
