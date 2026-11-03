-- =====================================================================
-- Jae's Runway · 17_stash.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- Emergency cash stash: when your Wallet goes over $100, Runway suggests
-- putting 40% in the stash (up to $250; after that, into DECU).
-- Never counts in "Can I afford it?". Nothing here deletes data.
-- =====================================================================

alter table public.accounts drop constraint if exists accounts_kind_check;
alter table public.accounts add constraint accounts_kind_check check (kind in ('checking', 'savings', 'vault', 'cash', 'stash'));

insert into public.accounts (user_id, name, institution, kind, role_note, sort, balance, balance_as_of, goal_amount)
select s.user_id, 'Emergency stash', 'Cash', 'stash', 'Emergency cash · up to $250', 6, 0, now(), 250
from public.settings s
where not exists (select 1 from public.accounts x where x.user_id = s.user_id and x.kind = 'stash');

select 'Emergency stash is set up ✓' as result;
