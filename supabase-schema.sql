-- Vollständiges Basisschema bis Version 0.10.0. Für den aktuellen Stand danach
-- alle Dateien in supabase/migrations in aufsteigender Reihenfolge anwenden.
create extension if not exists pgcrypto;
create table if not exists public.inventory_items(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,game text not null default 'Pokémon',language text not null default 'de',name text not null,set_name text not null default '',card_number text not null default '',condition text not null default 'NM',variant text not null default 'Normal',quantity integer not null default 1 check(quantity>=0),location text not null default '',purchase_price numeric(12,2),market_value numeric(12,2),notes text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.transactions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,kind text not null check(kind in('purchase','sale','expense')),inventory_item_id uuid references public.inventory_items(id) on delete set null,description text not null,transaction_date date not null default current_date,quantity integer not null default 1 check(quantity>0),amount numeric(12,2) not null default 0 check(amount>=0),fees numeric(12,2) not null default 0 check(fees>=0),platform text not null default '',notes text not null default '',created_at timestamptz not null default now());
create index if not exists inventory_items_user_id_idx on public.inventory_items(user_id);create index if not exists inventory_items_name_idx on public.inventory_items(name);create index if not exists transactions_user_date_idx on public.transactions(user_id,transaction_date desc);
alter table public.inventory_items enable row level security;alter table public.transactions enable row level security;
drop policy if exists "Users manage own inventory" on public.inventory_items;create policy "Users manage own inventory" on public.inventory_items for all using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
drop policy if exists "Users manage own transactions" on public.transactions;create policy "Users manage own transactions" on public.transactions for all using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant usage on schema public to anon,authenticated;grant select,insert,update,delete on public.inventory_items to authenticated;grant select,insert,update,delete on public.transactions to authenticated;
alter table public.inventory_items add column if not exists selling_price numeric(12,2);
alter table public.inventory_items add column if not exists cardmarket_product_id bigint;
alter table public.inventory_items add column if not exists source text not null default 'manual';
alter table public.inventory_items add column if not exists tcgdex_card_id text;
alter table public.inventory_items add column if not exists image_url text;
alter table public.inventory_items add column if not exists market_price numeric(12,2) check(market_price>=0);
alter table public.inventory_items add column if not exists market_price_source text;
alter table public.inventory_items add column if not exists market_price_updated_at timestamptz;
alter table public.transactions add column if not exists import_batch text;
create index if not exists inventory_cardmarket_product_idx on public.inventory_items(user_id,cardmarket_product_id);
create index if not exists inventory_tcgdex_card_idx on public.inventory_items(user_id,tcgdex_card_id);
create index if not exists transactions_import_batch_idx on public.transactions(user_id,import_batch);
alter table public.transactions add column if not exists external_reference text;
alter table public.transactions add column if not exists transaction_group uuid;
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check check(kind in('purchase','sale','expense','adjustment'));
create index if not exists transactions_group_idx on public.transactions(user_id,transaction_group);
create index if not exists transactions_inventory_item_idx on public.transactions(inventory_item_id);
alter table public.transactions add column if not exists voided_at timestamptz;
alter table public.transactions add column if not exists void_reason text;
alter table public.transactions add column if not exists shipping_cost numeric(12,2) not null default 0;
alter table public.transactions add column if not exists shipping_charged numeric(12,2) not null default 0;
alter table public.transactions add column if not exists item_snapshot jsonb;
create index if not exists transactions_active_import_idx on public.transactions(user_id,import_batch,voided_at);
alter table public.inventory_items add column if not exists is_test boolean not null default false;
alter table public.transactions add column if not exists is_test boolean not null default false;
create or replace function public.set_card_collector_mode() returns trigger language plpgsql set search_path=public as $$ begin new.is_test := coalesce(nullif(current_setting('request.headers',true),'')::jsonb ->> 'x-app-mode','live')='test'; return new; end; $$;
drop trigger if exists inventory_items_set_mode on public.inventory_items;
create trigger inventory_items_set_mode before insert on public.inventory_items for each row execute function public.set_card_collector_mode();
drop trigger if exists transactions_set_mode on public.transactions;
create trigger transactions_set_mode before insert on public.transactions for each row execute function public.set_card_collector_mode();
create index if not exists inventory_items_mode_idx on public.inventory_items(user_id,is_test);
create index if not exists transactions_mode_idx on public.transactions(user_id,is_test);

create table if not exists public.set_mappings(
  id uuid primary key default gen_random_uuid(),
  printed_code text not null,
  language text not null default 'all',
  tcgdex_set_id text not null,
  set_name text not null default '',
  source text not null default 'automatic',
  updated_at timestamptz not null default now(),
  unique(printed_code,language)
);
alter table public.set_mappings enable row level security;
drop policy if exists "Authenticated users read set mappings" on public.set_mappings;
create policy "Authenticated users read set mappings" on public.set_mappings for select to authenticated using(true);

-- Atomare Stornierungen: Bestand und Finanzbuchung werden innerhalb derselben
-- Datenbanktransaktion geändert. Bei einem Fehler wird alles zurückgerollt.
create or replace function public.void_purchase_transaction(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_tx public.transactions%rowtype;
  v_stock integer;
begin
  select * into v_tx
  from public.transactions
  where id=p_transaction_id and user_id=auth.uid() and kind='purchase'
  for update;
  if not found then raise exception 'Einkaufsbuchung wurde nicht gefunden.'; end if;
  if v_tx.voided_at is not null then raise exception 'Diese Einkaufsbuchung ist bereits storniert.'; end if;
  if v_tx.inventory_item_id is null then raise exception 'Die Einkaufsbuchung ist keiner Bestandskarte zugeordnet.'; end if;

  select quantity into v_stock
  from public.inventory_items
  where id=v_tx.inventory_item_id and user_id=auth.uid() and is_test=v_tx.is_test
  for update;
  if not found or v_stock < v_tx.quantity then
    raise exception 'Die eingekaufte Menge ist nicht mehr vollständig im Bestand. Zuerst abhängige Vorgänge stornieren.';
  end if;

  update public.inventory_items
  set quantity=quantity-v_tx.quantity, updated_at=now()
  where id=v_tx.inventory_item_id and user_id=auth.uid();
  update public.transactions
  set voided_at=now(), void_reason=coalesce(nullif(trim(p_reason),''),'Fehlbuchung')
  where id=v_tx.id and user_id=auth.uid();
end;
$$;

create or replace function public.void_sale_transaction(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_tx public.transactions%rowtype;
  v_line record;
begin
  select * into v_tx
  from public.transactions
  where id=p_transaction_id and user_id=auth.uid() and kind='sale'
  for update;
  if not found then raise exception 'Verkaufsbuchung wurde nicht gefunden.'; end if;
  if v_tx.voided_at is not null then raise exception 'Dieser Verkauf ist bereits storniert.'; end if;

  for v_line in
    select inventory_item_id, sum(quantity)::integer as quantity
    from public.transactions
    where user_id=auth.uid() and kind='sale' and voided_at is null
      and is_test=v_tx.is_test
      and (case when v_tx.transaction_group is null then id=v_tx.id else transaction_group=v_tx.transaction_group end)
    group by inventory_item_id
  loop
    if v_line.inventory_item_id is null then raise exception 'Eine Verkaufsposition besitzt keine Bestandszuordnung.'; end if;
    perform 1 from public.inventory_items
      where id=v_line.inventory_item_id and user_id=auth.uid() and is_test=v_tx.is_test
      for update;
    if not found then raise exception 'Eine verkaufte Bestandsposition wurde inzwischen gelöscht.'; end if;
    update public.inventory_items
      set quantity=quantity+v_line.quantity, updated_at=now()
      where id=v_line.inventory_item_id and user_id=auth.uid();
  end loop;

  update public.transactions
  set voided_at=now(), void_reason=coalesce(nullif(trim(p_reason),''),'Fehlbuchung')
  where user_id=auth.uid() and kind='sale' and voided_at is null and is_test=v_tx.is_test
    and (case when v_tx.transaction_group is null then id=v_tx.id else transaction_group=v_tx.transaction_group end);
end;
$$;

grant execute on function public.void_purchase_transaction(uuid,text) to authenticated;
grant execute on function public.void_sale_transaction(uuid,text) to authenticated;

-- Ein Mehrkartenverkauf sperrt die betroffenen Bestandszeilen in stabiler
-- Reihenfolge und schreibt Bestand sowie Finanzpositionen in einer Transaktion.
create or replace function public.record_multi_sale(
  p_lines jsonb,
  p_transaction_date date,
  p_platform text,
  p_external_reference text,
  p_fees numeric,
  p_shipping_charged numeric,
  p_shipping_cost numeric,
  p_notes text
)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_is_test boolean := coalesce(nullif(current_setting('request.headers',true),'')::jsonb ->> 'x-app-mode','live')='test';
  v_group uuid := gen_random_uuid();
  v_line_count integer;
  v_matched_count integer;
begin
  if v_user is null then raise exception 'Anmeldung erforderlich.'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines)=0 then raise exception 'Mindestens eine Verkaufsposition ist erforderlich.'; end if;
  if coalesce(p_fees,0)<0 or coalesce(p_shipping_charged,0)<0 or coalesce(p_shipping_cost,0)<0 then raise exception 'Gebühren und Versandwerte dürfen nicht negativ sein.'; end if;

  select count(*),count(distinct inventory_item_id)
  into v_line_count,v_matched_count
  from jsonb_to_recordset(p_lines) as line(inventory_item_id uuid,quantity integer,price numeric);
  if v_line_count<>v_matched_count then raise exception 'Eine Karte darf nur einmal im Verkauf vorkommen.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_lines) as line(inventory_item_id uuid,quantity integer,price numeric) where quantity is null or quantity<1 or price is null or price<0) then raise exception 'Anzahl oder Preis ist ungültig.'; end if;

  perform 1
  from public.inventory_items item
  join jsonb_to_recordset(p_lines) as line(inventory_item_id uuid,quantity integer,price numeric) on line.inventory_item_id=item.id
  where item.user_id=v_user and item.is_test=v_is_test
  order by item.id
  for update of item;

  select count(*) into v_matched_count
  from public.inventory_items item
  join jsonb_to_recordset(p_lines) as line(inventory_item_id uuid,quantity integer,price numeric) on line.inventory_item_id=item.id
  where item.user_id=v_user and item.is_test=v_is_test and item.quantity>=line.quantity;
  if v_matched_count<>v_line_count then raise exception 'Mindestens eine Karte fehlt oder die gewünschte Menge ist nicht mehr verfügbar.'; end if;

  insert into public.transactions(user_id,kind,inventory_item_id,description,transaction_date,quantity,amount,fees,shipping_charged,shipping_cost,platform,external_reference,transaction_group,notes,item_snapshot)
  select v_user,'sale',item.id,'Verkauf: '||item.name,coalesce(p_transaction_date,current_date),line.quantity,line.quantity*line.price,
    case when row_number() over(order by item.id)=1 then coalesce(p_fees,0) else 0 end,
    case when row_number() over(order by item.id)=1 then coalesce(p_shipping_charged,0) else 0 end,
    case when row_number() over(order by item.id)=1 then coalesce(p_shipping_cost,0) else 0 end,
    coalesce(p_platform,''),coalesce(p_external_reference,''),v_group,coalesce(p_notes,''),to_jsonb(item)
  from public.inventory_items item
  join jsonb_to_recordset(p_lines) as line(inventory_item_id uuid,quantity integer,price numeric) on line.inventory_item_id=item.id
  where item.user_id=v_user and item.is_test=v_is_test
  order by item.id;

  update public.inventory_items item
  set quantity=item.quantity-line.quantity,updated_at=now()
  from jsonb_to_recordset(p_lines) as line(inventory_item_id uuid,quantity integer,price numeric)
  where item.id=line.inventory_item_id and item.user_id=v_user and item.is_test=v_is_test;
  return v_group;
end;
$$;

-- Marktpreisaktualisierungen werden als ein geprüfter Stapel gespeichert.
create or replace function public.update_inventory_market_prices(p_prices jsonb)
returns integer
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_is_test boolean := coalesce(nullif(current_setting('request.headers',true),'')::jsonb ->> 'x-app-mode','live')='test';
  v_updated integer;
begin
  if v_user is null then raise exception 'Anmeldung erforderlich.'; end if;
  if jsonb_typeof(p_prices)<>'array' then raise exception 'Marktpreisdaten sind ungültig.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_prices) as price(id uuid,price numeric,source text,updated_at timestamptz) where price is null or price<0) then raise exception 'Ein Marktpreis ist ungültig.'; end if;
  update public.inventory_items item
  set market_price=price.price,market_price_source=left(coalesce(price.source,'Unbekannt'),120),market_price_updated_at=coalesce(price.updated_at,now()),updated_at=now()
  from jsonb_to_recordset(p_prices) as price(id uuid,price numeric,source text,updated_at timestamptz)
  where item.id=price.id and item.user_id=v_user and item.is_test=v_is_test;
  get diagnostics v_updated=row_count;
  if v_updated<>jsonb_array_length(p_prices) then raise exception 'Mindestens eine Bestandskarte wurde nicht gefunden.'; end if;
  return v_updated;
end;
$$;

revoke execute on function public.record_multi_sale(jsonb,date,text,text,numeric,numeric,numeric,text) from public,anon;
revoke execute on function public.update_inventory_market_prices(jsonb) from public,anon;
grant execute on function public.record_multi_sale(jsonb,date,text,text,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.update_inventory_market_prices(jsonb) to authenticated;
drop policy if exists "Authenticated users create set mappings" on public.set_mappings;
create policy "Authenticated users create set mappings" on public.set_mappings for insert to authenticated with check(true);
drop policy if exists "Authenticated users update set mappings" on public.set_mappings;
create policy "Authenticated users update set mappings" on public.set_mappings for update to authenticated using(true) with check(true);
grant select,insert,update on public.set_mappings to authenticated;
create index if not exists set_mappings_code_idx on public.set_mappings(printed_code,language);
insert into public.set_mappings(printed_code,language,tcgdex_set_id,set_name,source) values
  ('OBF','all','sv03','Obsidianflammen','verified'),
  ('CRI','all','me04','Wachsendes Chaos','verified')
on conflict(printed_code,language) do update set tcgdex_set_id=excluded.tcgdex_set_id,set_name=excluded.set_name,source=excluded.source,updated_at=now();
