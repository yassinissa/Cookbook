# WNR1 beverage stock backfill — Render Shell steps

**Where:** Render dashboard → the **greenhill-api** service → **Shell** tab.
The shell opens in `backend/` (where `manage.py` is), so the commands below
work as-is.

**What this does:** adds **200 units** of opening stock to **8 beverage SKUs**
at branch **WNR1**, through the app's own `add_to_stock()` service (weighted-
average cost + a `StockMovement` audit row per item). Nothing else is touched.

Do the steps in order. **Step 1 writes nothing** — read its output first.

---

## STEP 1 — CHECK (safe, writes nothing)

Copy this whole block, paste into the Render shell, press Enter:

```bash
python manage.py shell <<'PYEOF'
from decimal import Decimal
from apps.branches.models import Branch
from apps.items.models import Item
from apps.stock.models import StockEntry, StockType

SKUS = ["WNR-COKE-CAN","WNR-GINGER-ALE-CAN","WNR-SOY-SAUCE","WNR-ORANGE-JUICE",
        "WNR-SUGAR-SYRUP","WNR-WATER-SM","WNR-WATER-LG","WNR-WATER-SPARK"]

bs = list(Branch.objects.filter(name_en="WNR1"))
print("branches named WNR1:", len(bs))
assert len(bs) == 1, "expected exactly 1 branch named WNR1 - STOP, do not run step 2"
branch = bs[0]
print("branch id:", branch.id, "\n")

problems = []
for sku in SKUS:
    ms = list(Item.objects.filter(sku=sku))
    if len(ms) != 1:
        problems.append((sku, "%d matches" % len(ms)))
        print(f"{sku:<22} !! {len(ms)} items with this SKU")
        continue
    it = ms[0]
    st = StockType.PREPARED_PRODUCT if it.item_type == "prepared_product" else StockType.RAW_MATERIAL
    rows = StockEntry.objects.filter(item=it, branch=branch, store=None,
                                     prep_kitchen=None, stock_type=st)
    cur = sum((r.quantity for r in rows), Decimal("0"))
    flag = ""
    if not it.is_active:
        flag += " INACTIVE"
    if not it.unit_cost or it.unit_cost <= 0:
        flag += " NO-COST(->1.000)"
    print(f"{sku:<22} {it.name_en[:26]:<26} cur={str(cur):>8}  cost={it.unit_cost}  -> new={cur + Decimal('200')}{flag}")

print("\nUNRESOLVED:", problems if problems else "none")
print("If UNRESOLVED is not 'none', STOP and send this output back.")
PYEOF
```

**Expected:** `branches named WNR1: 1`, then 8 lines each with `cur=0` and
`-> new=200`, then `UNRESOLVED: none`.
If anything else shows up, stop here and paste the output back.

---

## STEP 2 — APPLY (writes +200 to each of the 8 items)

Only after Step 1 looked right. Copy the whole block, paste, Enter:

```bash
python manage.py shell <<'PYEOF'
from decimal import Decimal
from django.db import transaction
from apps.branches.models import Branch
from apps.items.models import Item
from apps.stock.models import MovementType
from apps.stock.services import add_to_stock

SKUS = ["WNR-COKE-CAN","WNR-GINGER-ALE-CAN","WNR-SOY-SAUCE","WNR-ORANGE-JUICE",
        "WNR-SUGAR-SYRUP","WNR-WATER-SM","WNR-WATER-LG","WNR-WATER-SPARK"]

branch = Branch.objects.get(name_en="WNR1")
items = {s: Item.objects.get(sku=s) for s in SKUS}   # raises here if any SKU is wrong -> nothing written

with transaction.atomic():
    for s in SKUS:
        it = items[s]
        e = add_to_stock(
            item=it,
            quantity=Decimal("200"),
            unit_cost=it.unit_cost or Decimal("1.000"),
            movement_type=MovementType.ADJUSTMENT,
            reference_type="opening_stock",
            reference_id="wnr1-beverage-backfill-2026-09-06",
            branch=branch,
            notes="Opening stock backfill after sales-by-item-wnr.xls upload showed zero on hand.",
            created_by="manual-render-shell",
        )
        unit = it.unit.code if it.unit else ""
        print(f"{s}: now {e.quantity} {unit} @ WAC {e.unit_cost}")

print("DONE - committed.")
PYEOF
```

**Expected:** 8 lines `... now 200.000 ... @ WAC ...`, then `DONE - committed.`
If it errors, the whole thing rolls back (the `with transaction.atomic()`) —
nothing partial. Paste the error back.

---

## STEP 3 — VERIFY (optional, writes nothing)

```bash
python manage.py shell <<'PYEOF'
from apps.stock.models import StockMovement
qs = StockMovement.objects.filter(reference_id="wnr1-beverage-backfill-2026-09-06").order_by("created_at")
print("movements created:", qs.count())
for m in qs:
    print(f"{m.item.name_en[:30]:<30} qty={m.quantity}  balance_after={m.balance_after}")
PYEOF
```

Should list 8 movements, each `qty=200.000`.

---

## UNDO (only if you need to reverse it)

```bash
python manage.py shell <<'PYEOF'
from decimal import Decimal
from django.db import transaction
from apps.branches.models import Branch
from apps.items.models import Item
from apps.stock.models import MovementType
from apps.stock.services import remove_from_stock

SKUS = ["WNR-COKE-CAN","WNR-GINGER-ALE-CAN","WNR-SOY-SAUCE","WNR-ORANGE-JUICE",
        "WNR-SUGAR-SYRUP","WNR-WATER-SM","WNR-WATER-LG","WNR-WATER-SPARK"]

branch = Branch.objects.get(name_en="WNR1")
with transaction.atomic():
    for s in SKUS:
        it = Item.objects.get(sku=s)
        e = remove_from_stock(
            item=it,
            quantity=Decimal("200"),
            unit_cost=it.unit_cost or Decimal("1.000"),
            movement_type=MovementType.ADJUSTMENT,
            reference_type="opening_stock_reversal",
            reference_id="wnr1-beverage-backfill-2026-09-06-reversal",
            branch=branch,
            notes="Reversal of the 2026-09-06 opening stock backfill.",
            created_by="manual-render-shell",
        )
        print(f"{s}: removed 200, now {e.quantity}")
print("REVERSED.")
PYEOF
```

(This leaves the original audit rows in place and adds matching reversal rows —
the honest way to undo. It will error if some of the 200 has already been sold;
that's expected, deal with those items individually.)
