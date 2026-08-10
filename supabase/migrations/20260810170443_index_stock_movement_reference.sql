create index if not exists stock_movements_reference_transaction_idx
  on public.stock_movements(reference_transaction_id)
  where reference_transaction_id is not null;
