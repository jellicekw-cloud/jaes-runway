-- =====================================================================
-- Jae's Runway · 21_nfcu_savings.sql
-- Paste into Supabase → SQL Editor → New query → Run (once; safe to run again).
-- Adds your NFCU savings account and a second 52-week plan going UP:
-- two weeks per payday ($3, $7, $11 … $103), 26 paydays from Nov 13, 2026,
-- $1,378 in all. You move it yourself from NFCU checking and tap "Saved it".
-- Never counted in "Can I afford it?". Nothing here deletes data.
-- =====================================================================

insert into public.accounts (user_id, name, institution, kind, role_note, sort)
select a.user_id, 'NFCU Savings', 'NFCU', 'savings', '52-week plan, going up', 5
from public.accounts a
where a.institution = 'NFCU' and a.kind = 'checking'
  and not exists (select 1 from public.accounts x where x.user_id = a.user_id and x.institution = 'NFCU' and x.kind = 'savings');

insert into public.savings_challenges (user_id, name, start_date, every_days, deposit_count, first_amount, step_amount, from_account_id, to_account_id)
select c.user_id, 'NFCU 52-week · going up', date '2026-11-13', 14, 26, 3, 4, c.id, s.id
from public.accounts c
join public.accounts s on s.user_id = c.user_id and s.institution = 'NFCU' and s.kind = 'savings'
where c.institution = 'NFCU' and c.kind = 'checking'
  and not exists (select 1 from public.savings_challenges x where x.user_id = c.user_id and x.to_account_id = s.id);

select 'NFCU savings plan is set up ✓' as result;
