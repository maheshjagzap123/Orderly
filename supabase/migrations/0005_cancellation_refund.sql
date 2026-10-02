-- Orderly — order cancellation reason + refund handling (V1: full refund only)

-- Store why an order was cancelled (vendor-facing operational insight).
alter table orders add column if not exists cancel_reason text;
alter table orders add column if not exists cancelled_at timestamptz;

-- Cancel an order (owner-only path is enforced by RLS on the UPDATE this wraps).
-- If the order was already paid, mark its payment REFUNDED and the order payment_status
-- REFUNDED so reports and the customer tracker can reflect it. V1 = full refund, manual.
--
-- SECURITY DEFINER so it can touch payments atomically, but it re-checks ownership
-- against auth.uid() so a vendor can only cancel their own order.
create or replace function cancel_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer as $$
declare
  v_business uuid;
  v_owner uuid;
  v_pay_status payment_status;
begin
  select business_id, payment_status into v_business, v_pay_status
    from orders where id = p_order_id for update;
  if v_business is null then
    raise exception 'order % not found', p_order_id;
  end if;

  -- Ownership check: caller must own the business.
  select owner_id into v_owner from businesses where id = v_business;
  if v_owner is distinct from auth.uid() then
    raise exception 'not authorized to cancel this order';
  end if;

  -- If it was paid, flag a full refund.
  if v_pay_status = 'SUCCESS' then
    update payments set status = 'REFUNDED' where order_id = p_order_id;
    update orders
      set status = 'CANCELLED',
          payment_status = 'REFUNDED',
          cancel_reason = p_reason,
          cancelled_at = now()
      where id = p_order_id;
  else
    update orders
      set status = 'CANCELLED',
          payment_status = case when payment_status = 'INITIATED' then 'CANCELLED' else payment_status end,
          cancel_reason = p_reason,
          cancelled_at = now()
      where id = p_order_id;
  end if;
end $$;
