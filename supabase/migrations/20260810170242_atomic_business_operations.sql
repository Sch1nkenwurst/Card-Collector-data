-- Schinkenwurst Kartenlager 0.11.0
-- Additive Sicherheits- und Nachvollziehbarkeitsmigration. Es werden keine
-- Bestands- oder Vorgangsdaten gelöscht.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.transactions
  add column if not exists reversal_of uuid references public.transactions(id) on delete restrict;

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  reference_transaction_id uuid references public.transactions(id) on delete set null deferrable initially deferred,
  movement_type text not null check (movement_type in ('opening','purchase','sale','purchase_reversal','sale_reversal','correction','manual_adjustment')),
  quantity_delta integer not null check (quantity_delta <> 0),
  item_snapshot jsonb not null default '{}'::jsonb,
  reason text not null default '',
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_user_date_idx
  on public.stock_movements(user_id, is_test, created_at desc);
create index if not exists stock_movements_item_idx
  on public.stock_movements(inventory_item_id, created_at desc);
create index if not exists audit_events_user_date_idx
  on public.audit_events(user_id, created_at desc);
create index if not exists transactions_reversal_of_idx
  on public.transactions(reversal_of);

alter table public.stock_movements enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists "Users read own stock movements" on public.stock_movements;
create policy "Users read own stock movements"
  on public.stock_movements for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read own audit events" on public.audit_events;
create policy "Users read own audit events"
  on public.audit_events for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.stock_movements, public.audit_events to authenticated;
revoke insert, update, delete on public.stock_movements, public.audit_events from authenticated;

-- Live-Buchungen können nicht mehr direkt gelöscht werden. Das Löschen bleibt
-- ausschließlich für ausdrücklich bestätigte Testdaten möglich.
drop policy if exists "Users manage own inventory" on public.inventory_items;
drop policy if exists "Users manage own transactions" on public.transactions;

create policy "Users read own inventory"
  on public.inventory_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create own inventory"
  on public.inventory_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own inventory"
  on public.inventory_items for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete own test inventory"
  on public.inventory_items for delete to authenticated
  using ((select auth.uid()) = user_id and is_test);

create policy "Users read own transactions"
  on public.transactions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create own transactions"
  on public.transactions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update own transactions"
  on public.transactions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete own test transactions"
  on public.transactions for delete to authenticated
  using ((select auth.uid()) = user_id and is_test);

-- Zentrale Set-Zuordnungen sind kuratierte Referenzdaten. Angemeldete Browser
-- dürfen sie lesen, aber nicht global für alle Nutzer verändern.
drop policy if exists "Authenticated users create set mappings" on public.set_mappings;
drop policy if exists "Authenticated users update set mappings" on public.set_mappings;
revoke insert, update, delete on public.set_mappings from authenticated;
grant select on public.set_mappings to authenticated;

create or replace function private.log_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delta integer;
  v_row public.inventory_items%rowtype;
  v_type text;
  v_reference uuid;
begin
  if tg_op = 'INSERT' then
    v_delta := new.quantity;
    v_row := new;
  elsif tg_op = 'DELETE' then
    v_delta := -old.quantity;
    v_row := old;
  else
    v_delta := new.quantity - old.quantity;
    v_row := new;
  end if;

  if v_delta = 0 then return coalesce(new, old); end if;

  v_type := coalesce(
    nullif(current_setting('app.stock_movement_type', true), ''),
    case when tg_op = 'INSERT' then 'opening' else 'manual_adjustment' end
  );
  v_reference := nullif(current_setting('app.reference_transaction_id', true), '')::uuid;

  insert into public.stock_movements(
    user_id, inventory_item_id, reference_transaction_id, movement_type,
    quantity_delta, item_snapshot, reason, is_test
  ) values (
    v_row.user_id, v_row.id, v_reference, v_type, v_delta, to_jsonb(v_row),
    coalesce(nullif(current_setting('app.movement_reason', true), ''), ''), v_row.is_test
  );
  return coalesce(new, old);
end;
$$;

create or replace function private.log_business_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_row_id uuid;
begin
  v_user := coalesce(new.user_id, old.user_id);
  v_row_id := coalesce(new.id, old.id);
  insert into public.audit_events(user_id, table_name, row_id, action, old_data, new_data)
  values (
    v_user, tg_table_name, v_row_id, tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists inventory_items_movement_log on public.inventory_items;
create trigger inventory_items_movement_log
  after insert or update of quantity or delete on public.inventory_items
  for each row execute function private.log_inventory_movement();

drop trigger if exists inventory_items_audit_log on public.inventory_items;
create trigger inventory_items_audit_log
  after insert or update or delete on public.inventory_items
  for each row execute function private.log_business_audit();

drop trigger if exists transactions_audit_log on public.transactions;
create trigger transactions_audit_log
  after insert or update or delete on public.transactions
  for each row execute function private.log_business_audit();

create or replace function public.record_transaction(
  p_kind text,
  p_inventory_item_id uuid,
  p_description text,
  p_transaction_date date,
  p_quantity integer,
  p_amount numeric,
  p_fees numeric,
  p_platform text,
  p_notes text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_is_test boolean := coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-app-mode', 'live') = 'test';
  v_item public.inventory_items%rowtype;
  v_transaction_id uuid := gen_random_uuid();
begin
  if v_user is null then raise exception 'Anmeldung erforderlich.'; end if;
  if p_kind not in ('purchase','sale','expense') then raise exception 'Unzulässige Vorgangsart.'; end if;
  if coalesce(p_quantity, 0) < 1 then raise exception 'Die Anzahl muss mindestens eins sein.'; end if;
  if coalesce(p_amount, 0) < 0 or coalesce(p_fees, 0) < 0 then raise exception 'Betrag und Gebühren dürfen nicht negativ sein.'; end if;
  if p_kind = 'sale' and p_inventory_item_id is null then raise exception 'Ein Verkauf benötigt eine Bestandskarte.'; end if;

  if p_inventory_item_id is not null then
    select * into v_item from public.inventory_items
    where id = p_inventory_item_id and user_id = v_user and is_test = v_is_test
    for update;
    if not found then raise exception 'Die Bestandskarte wurde nicht gefunden.'; end if;
    if p_kind = 'sale' and v_item.quantity < p_quantity then raise exception 'Der Bestand reicht für diesen Verkauf nicht aus.'; end if;
  end if;

  insert into public.transactions(
    id, user_id, kind, inventory_item_id, description, transaction_date,
    quantity, amount, fees, platform, notes, item_snapshot
  ) values (
    v_transaction_id, v_user, p_kind, p_inventory_item_id,
    coalesce(nullif(trim(p_description), ''), initcap(p_kind)),
    coalesce(p_transaction_date, current_date), p_quantity,
    coalesce(p_amount, 0), coalesce(p_fees, 0), coalesce(p_platform, ''),
    coalesce(p_notes, ''), case when p_inventory_item_id is not null then to_jsonb(v_item) end
  );

  if p_inventory_item_id is not null and p_kind in ('purchase','sale') then
    perform set_config('app.stock_movement_type', p_kind, true);
    perform set_config('app.reference_transaction_id', v_transaction_id::text, true);
    perform set_config('app.movement_reason', coalesce(p_description, ''), true);
    update public.inventory_items
    set quantity = quantity + case when p_kind = 'purchase' then p_quantity else -p_quantity end,
        updated_at = now()
    where id = p_inventory_item_id and user_id = v_user and is_test = v_is_test;
  end if;
  return v_transaction_id;
end;
$$;

create or replace function public.record_cardmarket_purchase(
  p_rows jsonb,
  p_transaction_date date,
  p_external_reference text,
  p_location text,
  p_import_batch text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_is_test boolean := coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-app-mode', 'live') = 'test';
  v_group uuid := gen_random_uuid();
  v_line record;
  v_item_id uuid;
  v_transaction_id uuid;
begin
  if v_user is null then raise exception 'Anmeldung erforderlich.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Der Import enthält keine Karten.'; end if;
  if coalesce(trim(p_import_batch), '') = '' then raise exception 'Dem Import fehlt die eindeutige Dateikennung.'; end if;
  if exists (
    select 1 from public.transactions
    where user_id = v_user and is_test = v_is_test and import_batch = p_import_batch and voided_at is null
  ) then raise exception 'Diese Cardmarket-Datei wurde bereits importiert.'; end if;

  for v_line in
    select * from jsonb_to_recordset(p_rows) as line(
      language text, name text, set_name text, card_number text, condition text,
      variant text, quantity integer, price numeric, product_id bigint,
      tcgdex_card_id text, image_url text, identifier text
    )
  loop
    if coalesce(trim(v_line.name), '') = '' or coalesce(v_line.quantity, 0) < 1 or coalesce(v_line.price, -1) < 0 then
      raise exception 'Mindestens eine Importposition ist unvollständig oder ungültig.';
    end if;
    v_item_id := gen_random_uuid();
    v_transaction_id := gen_random_uuid();
    perform set_config('app.stock_movement_type', 'purchase', true);
    perform set_config('app.reference_transaction_id', v_transaction_id::text, true);
    perform set_config('app.movement_reason', 'Cardmarket-Import', true);
    insert into public.inventory_items(
      id, user_id, game, language, name, set_name, card_number, condition,
      variant, quantity, location, purchase_price, cardmarket_product_id,
      tcgdex_card_id, image_url, source, notes
    ) values (
      v_item_id, v_user, 'Pokémon', coalesce(v_line.language, 'de'), v_line.name,
      coalesce(v_line.set_name, ''), coalesce(v_line.card_number, ''), coalesce(v_line.condition, 'NM'),
      coalesce(v_line.variant, 'Normal'), v_line.quantity, coalesce(p_location, ''), v_line.price,
      v_line.product_id, v_line.tcgdex_card_id, v_line.image_url, 'cardmarket_import',
      concat_ws(' · ', nullif(v_line.identifier, ''), case when v_line.product_id is not null then 'Cardmarket-Produkt #' || v_line.product_id end)
    );
    insert into public.transactions(
      id, user_id, kind, inventory_item_id, description, transaction_date,
      quantity, amount, fees, platform, external_reference, transaction_group,
      notes, import_batch, item_snapshot
    ) values (
      v_transaction_id, v_user, 'purchase', v_item_id, 'Cardmarket-Einkauf: ' || v_line.name,
      coalesce(p_transaction_date, current_date), v_line.quantity, v_line.price * v_line.quantity,
      0, 'Cardmarket', coalesce(p_external_reference, ''), v_group,
      concat_ws(' · ', nullif(v_line.identifier, ''), case when v_line.product_id is not null then 'Produkt-ID ' || v_line.product_id end),
      p_import_batch, (select to_jsonb(item) from public.inventory_items item where item.id = v_item_id)
    );
  end loop;
  return v_group;
end;
$$;

create or replace function public.correct_inventory_purchase(
  p_inventory_item_id uuid,
  p_quantity integer,
  p_reason text,
  p_reference text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_is_test boolean := coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-app-mode', 'live') = 'test';
  v_item public.inventory_items%rowtype;
  v_transaction_id uuid := gen_random_uuid();
begin
  if v_user is null then raise exception 'Anmeldung erforderlich.'; end if;
  if coalesce(p_quantity, 0) < 1 then raise exception 'Die Korrekturmenge muss mindestens eins sein.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Für eine Korrektur ist ein Grund erforderlich.'; end if;

  select * into v_item from public.inventory_items
  where id = p_inventory_item_id and user_id = v_user and is_test = v_is_test
  for update;
  if not found then raise exception 'Die Bestandskarte wurde nicht gefunden.'; end if;
  if v_item.quantity < p_quantity then raise exception 'Die Korrekturmenge ist größer als der vorhandene Bestand.'; end if;

  insert into public.transactions(
    id, user_id, kind, inventory_item_id, description, transaction_date,
    quantity, amount, fees, platform, external_reference, notes, item_snapshot
  ) values (
    v_transaction_id, v_user, 'adjustment', v_item.id,
    'Buchungskorrektur: ' || v_item.name, current_date, p_quantity, 0, 0,
    'Buchungskorrektur', coalesce(p_reference, ''), p_reason, to_jsonb(v_item)
  );

  perform set_config('app.stock_movement_type', 'correction', true);
  perform set_config('app.reference_transaction_id', v_transaction_id::text, true);
  perform set_config('app.movement_reason', p_reason, true);
  update public.inventory_items
  set quantity = quantity - p_quantity, updated_at = now()
  where id = v_item.id and user_id = v_user and is_test = v_is_test;
  return v_transaction_id;
end;
$$;

revoke execute on function public.record_transaction(text,uuid,text,date,integer,numeric,numeric,text,text) from public, anon;
revoke execute on function public.record_cardmarket_purchase(jsonb,date,text,text,text) from public, anon;
revoke execute on function public.correct_inventory_purchase(uuid,integer,text,text) from public, anon;
grant execute on function public.record_transaction(text,uuid,text,date,integer,numeric,numeric,text,text) to authenticated;
grant execute on function public.record_cardmarket_purchase(jsonb,date,text,text,text) to authenticated;
grant execute on function public.correct_inventory_purchase(uuid,integer,text,text) to authenticated;
