# WnR modifier worklist — consumption data for the chef

Every POS modifier that sold on Wok n Roll in the sample sales report
(`sales-by-item-wnr.xls`), and what each one needs before the inventory system
can deduct its true consumption. Fill this in, then enter it under
**POS → Readiness** in Cookbook.

Generated 2026-09-07 after `manage.py backfill_wnr_modifiers`. Re-run that command
(dry run) to regenerate the raw list.

---

## Two questions for every row

1. **Does this option change what the kitchen uses** vs. the standard dish? If
   not — a doneness level, "sauce on the side", the protein the dish already
   comes with — tick **"No stock impact"** on the option and you're done.
2. If it does change consumption, say **what and how much, per one portion**: an
   item SKU, a quantity, and whether it's **added** or **removed**. Each dish's
   current recipe is shown below so you can see the default.

**Action key:** `no change` = tick "No stock impact" · `swap` = remove one item,
add another · `add` = base has none, add the protein.

---

## A · Protein picks — 18 options, 12 dishes

All of these carry the **`WnR Protein Choice`** group. Where the dish already
comes with that protein, the pick is the default — `no change`.

### Chinese Fried Noodles  (POS: Chinese Fried Noodles)

Base recipe / portion: `0.200 kg WNR-CN-NOODLES`, 0.080 kg WNR-MIXED-VEG,
0.020 kg WNR-SOY-SAUCE — **no protein**.

| Option (Mods) | Action | Fill in |
|---|---|---|
| Beef | add | `+ WNR-BEEF` ____ kg |
| Chicken | add | `+` ____ (no `WNR-CHICKEN` SKU — pick one or ask inventory) · ____ kg |
| Shrimp | add | `+ WNR-SHRIMP` ____ kg |
| Veggie | no change | base is already meat-free |
| Plain | no change | same as the base |

### Japanese Fry Rice  (POS: Japanese Fry Rice)

Base: `0.150 kg WNR-RICE`, 0.060 kg WNR-MIXED-VEG, 0.020 kg WNR-SOY-SAUCE — **no protein**.

| Option | Action | Fill in |
|---|---|---|
| Beef | add | `+ WNR-BEEF` ____ kg |
| Chicken | add | `+` ____ SKU · ____ kg |
| Prawn | add | `+ WNR-SHRIMP` (or a prawn SKU) ____ kg |
| Veggie | no change | — |

### Mongolian  (POS: Mongolian)

Base: `0.150 kg WNR-BEEF`, 0.050 kg WNR-MIXED-VEG, 0.020 kg WNR-SOY-SAUCE.

| Option | Action | Fill in |
|---|---|---|
| Beef | no change | base is beef |
| ANGUS Beef | swap | `− WNR-BEEF` 0.150 kg, `+ WNR-ANGUS-BEEF` ____ kg (confirm 1:1) |

### Spicy Potato  (POS: Spicy Potato)

Base: 0.150 kg WNR-POTATO, 0.030 kg WNR-CHILI-SAUCE, `0.100 kg WNR-BEEF`.

| Option | Action | Fill in |
|---|---|---|
| Beef | no change | — |
| ANGUS Beef | swap | `− WNR-BEEF` 0.100 kg, `+ WNR-ANGUS-BEEF` ____ kg |

### Dishes where the pick is the dish's own protein — tick "No stock impact"

| Dish | Mods | Base protein |
|---|---|---|
| Black Pepper Beef (POS: Black Pepper Style) | Beef | 0.180 kg `WNR-BEEF` |
| Sizzler Plate Beef (POS: Sizzler Plate) | Beef | 0.200 kg `WNR-BEEF` |
| Crispy Lemon Chicken (POS: Crispy Lemon) | Chicken | 0.180 kg chicken breast |
| The Sweet, The Chilli & The Sour | Chicken | 0.180 kg chicken breast |
| Pineapple Rice Shrimp (POS: Pineapple Rice) | Shrimp | 0.080 kg `WNR-SHRIMP` |
| Spicy Thai Noodles Veggie (POS: Spicy Thai Noodles) | Veggie | none (already veg) |
| Chinese Garlic Rice | Plain | none |
| Japanese Garlic Rice | Plain | none |

One exception in that group:

| Dish | Mods | Action | Fill in |
|---|---|---|---|
| Pineapple Rice Shrimp | **Veghie** *(mis-spelled in POS)* | swap | `− WNR-SHRIMP` 0.080 kg. Also rename the option to "Veggie". |

---

## B · Drinks — 2 options

The `Soft Drinks` recipe deducts one `WNR-COKE-CAN`. Each other flavour swaps
that can; the SKUs already exist on inventory.

| Option (Mods) | Action | Fill in |
|---|---|---|
| Diet Coke | swap | `− WNR-COKE-CAN` 1 pc, `+ WNR-DIET-COKE` 1 pc |
| Sprite *(POS: "Sprit")* | swap | `− WNR-COKE-CAN` 1 pc, `+ WNR-SPRITE-CAN` 1 pc |

---

## C · Options not attached to a group yet — 9

These sold as modifiers but have no option on the dish's group. Add the option;
most are serving instructions → tick **"No stock impact"**. One is a real add-on.

| Item [Mods] | Kind | What to do |
|---|---|---|
| California Maki [With Shrimp] | **add-on** | Attach an add-on group with a "+ Shrimp" option: `+ WNR-SHRIMP` ____ kg / portion |
| Edamame Spicy [Mix] | instruction | add option, No stock impact |
| Edamame Spicy [Sauce Separate] | instruction | add option, No stock impact |
| Hot & Sour Soup [Only Veg] | check | if the soup normally has meat this *removes* it → removal delta; else No stock impact |
| Mix Teppanyaki 2 [US Angus Beef - Prawn] | check | the dish's own protein spec — if the recipe reflects it, No stock impact |
| Mojito [Regular] | instruction | add option, No stock impact |
| Robata [Local Beef - Well Done] | check | doneness + the dish's protein — if the recipe reflects it, No stock impact |
| Salmon Teriyaki [Regular Veggie] | instruction | add option, No stock impact |
| Tempura Ebi [Crispy] | instruction | add option, No stock impact |

---

## Reference · protein SKUs on inventory

| SKU | Item | Stock unit |
|---|---|---|
| `WNR-BEEF` | Beef Local | kg |
| `WNR-ANGUS-BEEF` | Angus Beef | kg |
| `WNR-SHRIMP` | Large Shrimp | kg |
| `WNR-COKE-CAN` | Coke Can 330ml | pcs |
| `WNR-DIET-COKE` | Diet Coke | pcs |
| `WNR-SPRITE-CAN` | Sprite Can | pcs |
| — | Chicken / Prawn — no dedicated SKU; pick an existing one (e.g. `B1242` Chicken Breast) or ask inventory to add `WNR-CHICKEN` / `WNR-PRAWN` | kg |

---

## After it's filled

1. Re-publish the WnR dish recipes so the new `POSItemMapping` /
   `POSModifierIngredient` rows reach inventory-platform.
2. Re-upload a Lavu "Sales by Item" report — every line should land on a success
   `deduction_note`; anything still amber is a row left on this list.

**Also on the list (unrelated):** the `Crispy Salad` "special sauce" add-on
points at SKU `556`, which isn't on inventory — replace it with the real sauce
SKU + quantity.

**Not this worklist:** ~60 other WnR items in the report (Dune, Kindo, 3zoz
Maki, …) have no Cookbook recipe at all — that's the separate "author the base
recipes" job.
