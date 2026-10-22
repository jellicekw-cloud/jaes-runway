-- =====================================================================
-- Jae's Runway · 09_progress.sql
-- Paste into Supabase → SQL Editor → New query → Run (once).
-- Card balance history (for the paydown chart and milestones) and each card's statement closing day.
-- Nothing here deletes data.
-- =====================================================================

-- One balance per card per day. Saved automatically whenever a card's balance changes.
create table public.card_balance_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  card_id      uuid not null references public.cards(id) on delete cascade,
  recorded_on  date not null,
  balance      numeric(12,2) not null,
  unique (card_id, recorded_on)
);
alter table public.card_balance_history enable row level security;
create policy "Owner can do everything" on public.card_balance_history for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.save_card_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.balance is not null and (tg_op = 'INSERT' or new.balance is distinct from old.balance) then
    insert into public.card_balance_history (user_id, card_id, recorded_on, balance)
    values (new.user_id, new.id, (now() at time zone 'America/New_York')::date, new.balance)
    on conflict (card_id, recorded_on) do update set balance = excluded.balance;
  end if;
  return new;
end;
$$;

create trigger save_card_balance after insert or update of balance on public.cards
  for each row execute function public.save_card_balance();

-- Start the history with today's balances
insert into public.card_balance_history (user_id, card_id, recorded_on, balance)
select user_id, id, (now() at time zone 'America/New_York')::date, balance from public.cards where balance is not null
on conflict (card_id, recorded_on) do nothing;

-- The day each card's statement closes (that's the balance the card reports to the credit bureaus)
alter table public.cards add column statement_day smallint check (statement_day between 1 and 31);

-- Done.
