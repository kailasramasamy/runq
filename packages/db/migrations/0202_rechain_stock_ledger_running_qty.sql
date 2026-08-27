-- Rebuild every stock-ledger running balance in display order.
--
-- `running_qty` was written as on-hand-plus-delta at posting time, so any
-- backdated document (a DN dated the 24th but entered on the 26th) carries a
-- balance measured after rows that print below it. One-time repair; the
-- writer keeps the chain correct from here on (stock-ledger-rechain.ts).
--
-- Quantity is order-independent in aggregate, so each chain still ends at
-- stock_on_hand.qty. Only the intermediate steps move. Valuation, GL and the
-- on-hand cache are untouched.

WITH ordered AS (
  SELECT id,
         SUM(qty_in - qty_out) OVER w AS run_qty,
         SUM((qty_in - qty_out) * unit_cost) OVER w AS run_value
    FROM stock_ledger
  WINDOW w AS (
    PARTITION BY tenant_id, item_id, warehouse_id, COALESCE(batch_no, '')
        ORDER BY (moved_at AT TIME ZONE 'Asia/Kolkata')::date, posted_at, id
        ROWS UNBOUNDED PRECEDING
  )
)
UPDATE stock_ledger sl
   SET running_qty = o.run_qty, running_value = o.run_value
  FROM ordered o
 WHERE sl.id = o.id
   AND (sl.running_qty <> o.run_qty OR sl.running_value <> o.run_value);
