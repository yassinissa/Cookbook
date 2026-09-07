# WNR1 full ingredient stock backfill — Render Shell steps

**Where:** Render dashboard → the **greenhill-api** service → **Shell** tab.

**What this does:** adds **200 units** of opening stock to the **58 remaining**
WnR recipe ingredients (everything except the 8 beverages already backfilled)
at branch **WNR1**, through the app's own `add_to_stock()` service (weighted-
average cost + a `StockMovement` audit row per item). Nothing else is touched.

Do the steps in order. **Step 1 writes nothing** — read its output first.

---

## STEP 1 — CHECK (safe, writes nothing)

```bash
python manage.py shell <<'PYEOF'
from decimal import Decimal
from apps.branches.models import Branch
from apps.items.models import Item
from apps.stock.models import StockEntry, StockType

SKUS = ["B1242","B1467","WNR-ANGUS-BEEF","WNR-AVOCADO","WNR-BANANA","WNR-BEEF",
"WNR-BLUE-SYRUP","WNR-BROCCOLI","WNR-BUTTER","WNR-CHILI-SAUCE","WNR-CHOCOLATE",
"WNR-CN-NOODLES","WNR-COCONUT-MILK","WNR-CORIANDER","WNR-CORN","WNR-CRAB",
"WNR-CRANBERRY-JUICE","WNR-CREAM","WNR-CREAM-CHEESE","WNR-EDAMAME","WNR-EEL",
"WNR-EGG","WNR-FLOUR","WNR-GARLIC","WNR-GINGER-SYRUP","WNR-GRENADINE",
"WNR-GYOZA-WRAP","WNR-HAMOOR","WNR-ICE-TEA-BOTTLE","WNR-LASAGNA-SHEET",
"WNR-LEMON","WNR-LEMONGRASS","WNR-LIME","WNR-LOBSTER","WNR-MILK","WNR-MINT",
"WNR-MISO","WNR-MIXED-VEG","WNR-MOZZARELLA","WNR-MUSHROOM","WNR-NORI",
"WNR-PASSIONFRUIT-SYRUP","WNR-PERRIER","WNR-PINEAPPLE","WNR-POTATO","WNR-RICE",
"WNR-SALMON","WNR-SAUCE","WNR-SHRIMP","WNR-SODA-WATER","WNR-STRAWBERRY-PUREE",
"WNR-SUSHI-RICE","WNR-TEMP-BATTER","WNR-TOBIKO","WNR-TOMATO-JUICE","WNR-TUNA",
"WNR-UDON","WNR-UNAGI-SAUCE"]

bs = list(Branch.objects.filter(name_en="WNR1"))
print("branches named WNR1:", len(bs))
assert len(bs) == 1, "expected exactly 1 branch named WNR1 - STOP, do not run step 2"
branch = bs[0]

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

print(f"\ntotal SKUs checked: {len(SKUS)}")
print("UNRESOLVED:", problems if problems else "none")
print("If UNRESOLVED is not 'none', STOP and send this output back.")
PYEOF
```

**Expected:** `branches named WNR1: 1`, 58 lines with `cur=0` (or near-zero for
B1467), then `total SKUs checked: 58`, then `UNRESOLVED: none`.

---

## STEP 2 — APPLY (writes +200 to each of the 58 items)

Only after Step 1 looked right.

```bash
python manage.py shell <<'PYEOF'
from decimal import Decimal
from django.db import transaction
from apps.branches.models import Branch
from apps.items.models import Item
from apps.stock.models import MovementType
from apps.stock.services import add_to_stock

SKUS = ["B1242","B1467","WNR-ANGUS-BEEF","WNR-AVOCADO","WNR-BANANA","WNR-BEEF",
"WNR-BLUE-SYRUP","WNR-BROCCOLI","WNR-BUTTER","WNR-CHILI-SAUCE","WNR-CHOCOLATE",
"WNR-CN-NOODLES","WNR-COCONUT-MILK","WNR-CORIANDER","WNR-CORN","WNR-CRAB",
"WNR-CRANBERRY-JUICE","WNR-CREAM","WNR-CREAM-CHEESE","WNR-EDAMAME","WNR-EEL",
"WNR-EGG","WNR-FLOUR","WNR-GARLIC","WNR-GINGER-SYRUP","WNR-GRENADINE",
"WNR-GYOZA-WRAP","WNR-HAMOOR","WNR-ICE-TEA-BOTTLE","WNR-LASAGNA-SHEET",
"WNR-LEMON","WNR-LEMONGRASS","WNR-LIME","WNR-LOBSTER","WNR-MILK","WNR-MINT",
"WNR-MISO","WNR-MIXED-VEG","WNR-MOZZARELLA","WNR-MUSHROOM","WNR-NORI",
"WNR-PASSIONFRUIT-SYRUP","WNR-PERRIER","WNR-PINEAPPLE","WNR-POTATO","WNR-RICE",
"WNR-SALMON","WNR-SAUCE","WNR-SHRIMP","WNR-SODA-WATER","WNR-STRAWBERRY-PUREE",
"WNR-SUSHI-RICE","WNR-TEMP-BATTER","WNR-TOBIKO","WNR-TOMATO-JUICE","WNR-TUNA",
"WNR-UDON","WNR-UNAGI-SAUCE"]

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
            reference_id="wnr1-ingredient-backfill-2026-09-07",
            branch=branch,
            notes="Opening stock backfill: remaining WnR recipe ingredients at zero stock.",
            created_by="manual-render-shell",
        )
        unit = it.unit.code if it.unit else ""
        print(f"{s}: now {e.quantity} {unit} @ WAC {e.unit_cost}")

print(f"DONE - committed {len(SKUS)} items.")
PYEOF
```

**Expected:** 58 lines `... now 200.000 ...`, then `DONE - committed 58 items.`
If it errors, the whole thing rolls back (transaction.atomic) — nothing
partial. Paste the error back.

---

## STEP 3 — VERIFY (optional, writes nothing)

```bash
python manage.py shell <<'PYEOF'
from apps.stock.models import StockMovement
qs = StockMovement.objects.filter(reference_id="wnr1-ingredient-backfill-2026-09-07").order_by("created_at")
print("movements created:", qs.count())
for m in qs:
    print(f"{m.item.name_en[:30]:<30} qty={m.quantity}  balance_after={m.balance_after}")
PYEOF
```

Should list 58 movements, each `qty=200.000`.
