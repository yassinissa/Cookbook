"""
Publish a finished Cookbook recipe to inventory-platform.

Manual and per-recipe: the `recipe.publish` capability plus a Publish action
on the dish / production detail endpoint. Cookbook references items by SKU
string; inventory-platform references them by id, so this resolves
SKU -> item id and unit code -> unit id at push time against a live snapshot
of the platform's catalogue.

First publish POSTs; once `inventory_recipe_id` is set a re-publish PATCHes
the same record (no duplicate). A push failure is stored on `publish_error`
and raised as RecipePublishError — the Cookbook row is never left corrupt.

Setup note: the service account (INVENTORY_API_EMAIL) must have a role that
can write recipes on inventory-platform — SUPER_ADMIN for both dish and
production recipes (dish writes also accept QA; production also accepts
PREP_KITCHEN_MANAGER).
"""
from decimal import Decimal

from django.utils import timezone

from apps.integrations.inventory_client import InventoryClient, InventoryAPIError


class RecipePublishError(Exception):
    """The recipe could not be pushed — bad reference data, or the platform
    rejected the payload. `args[0]` is a user-facing message."""


# Cookbook's UnitScale codes and inventory-platform's unit codes are the same
# measures spelled differently — case (Kg/kg, Pcs/pcs, Cup/cup) and a handful
# of stems (Tbs/tbsp, Ts/tsp, Ltr/l, Pc·EA/pcs). Without this map a publish
# resolves the unit to None and the platform silently falls back to the item's
# default stock unit, which changes the quantity it deducts on a POS sale.
_UNIT_ALIASES = {
    'tbs': 'tbsp', 'tbsp': 'tbsp', 'tablespoon': 'tbsp',
    'ts': 'tsp', 'tsp': 'tsp', 'teaspoon': 'tsp',
    'ltr': 'l', 'liter': 'l', 'litre': 'l',
    'pc': 'pcs', 'pcs': 'pcs', 'ea': 'pcs', 'each': 'pcs', 'piece': 'pcs', 'pieces': 'pcs',
}


class _Catalogue:
    """A live snapshot of the platform's items and units: SKU -> item id and
    stock unit code, and Cookbook unit code -> platform unit id / code."""

    def __init__(self, client, items=None):
        items = client.get_items() if items is None else items
        units = client.get_units()
        if isinstance(units, dict):
            units = units.get('results', [])
        self.sku_to_id = {i['sku']: i['id'] for i in items if i.get('sku')}
        self.stock_code = {i['sku']: (i.get('unit_code') or '') for i in items if i.get('sku')}
        self._by_code, self._code_by_id = {}, {}
        for u in units:
            code = (u.get('code') or '').strip()
            if code:
                self._by_code[code] = u['id']
                self._by_code.setdefault(code.lower(), u['id'])
                self._code_by_id[u['id']] = code

    def resolve_unit(self, code):
        if not code:
            return None
        code = code.strip()
        if code in self._by_code:
            return self._by_code[code]
        lc = code.lower()
        if lc in self._by_code:
            return self._by_code[lc]
        alias = _UNIT_ALIASES.get(lc)
        return self._by_code.get(alias) if alias else None

    def code_for(self, code):
        """The platform's spelling of a Cookbook unit code, or None."""
        uid = self.resolve_unit(code)
        return self._code_by_id.get(uid) if uid is not None else None


class _Units:
    """Per-SKU conversions into each item's inventory stock unit, for the
    SKUs of one publish (see stock_units.py)."""

    # a line that can't be sent in its own unit is re-expressed in the first
    # of these the item converts to
    FALLBACK_CODES = ('g', 'ml', 'Kg', 'Ltr')

    def __init__(self, cat, skus):
        from .costing import CostContext
        from .stock_units import ItemUnits
        self.cat = cat
        self.ctx = CostContext(skus)
        self.items = {sku: ItemUnits(sku, cat.stock_code[sku], self.ctx)
                      for sku in set(skus) if cat.stock_code.get(sku)}

    def line(self, sku, name, qty, unit):
        """(quantity, unit_id, note, issue) for one ingredient / delta line,
        in a unit inventory-platform can convert for this item. `issue` is a
        user-facing reason it can't be published; `note` a warning."""
        from .stock_units import same_unit
        unit_id = self.cat.resolve_unit(unit.code) if unit is not None else None
        iu = self.items.get(sku)
        if iu is None or unit is None:
            # platform has no stock unit for the item, or the line has none:
            # nothing to convert, the platform deducts the number as-is
            return qty, unit_id, None, None
        label = f'{name or sku} ({sku})'
        f = iu.factor(unit)
        if f is None:
            if iu.anchor is None:
                return qty, unit_id, None, f'{label}: {iu.problem}'
            return qty, unit_id, None, (
                f'{label}: no conversion from {unit.code} to its stock unit {iu.stock_code}; '
                f'add one in this item\'s conversions (e.g. "1 {unit.code} = 25 g")')
        code = self.cat.code_for(unit.code)
        if code is not None and not (same_unit(code, iu.stock_code) and f != 1):
            return qty, unit_id, None, None
        # Either the platform has no such unit, or the recipe's unit reads as
        # the stock unit there while meaning something else here (one piece
        # of a 6-piece PCS pack). Send the same amount in a plain measure.
        for alt_code in self.FALLBACK_CODES:
            alt = self.ctx.units_by_code.get(alt_code)
            alt_inv = self.cat.code_for(alt_code) if alt else None
            fa = iu.factor(alt) if alt_inv else None
            if fa and not same_unit(alt_inv, iu.stock_code):
                new_qty = (Decimal(qty) * f / fa).quantize(Decimal('0.001'))
                return new_qty, self.cat.resolve_unit(alt_code), (
                    f'{label}: {qty} {unit.code} published as {new_qty} {alt.code} '
                    f'(1 {iu.stock_code} of this item is not one {unit.code})'), None
        return qty, unit_id, None, (
            f'{label}: {unit.code} can\'t be sent to inventory-platform for this item; '
            f'use g or ml in the recipe')

    def sync_payload(self):
        units = sorted(self.ctx.units_by_code.values(), key=lambda u: u.code)
        # an item that can't be anchored sends an empty list, which clears any
        # rows it had — better a loud POS gap than deducting with stale numbers
        return [{'sku': sku, 'conversions': iu.sync_rows(units, self.cat.code_for)
                 if iu.anchor is not None else []}
                for sku, iu in sorted(self.items.items())]


def _sync_units(client, units):
    """Push the per-item conversions a publish relies on. inventory-platform
    replaces each SKU's rows, so this is also how an edit reaches it."""
    payload = units.sync_payload()
    if not payload:
        return []
    try:
        result = client.sync_recipe_conversions(payload) or {}
    except InventoryAPIError as e:
        raise RecipePublishError(
            f'Could not send the unit conversions to inventory-platform, so POS sales '
            f'could not be deducted correctly: {e}')
    return [' '.join(filter(None, ['conversion for', s.get('sku'), s.get('unit'),
                                   'not applied:', s.get('reason')]))
            for s in result.get('skipped', [])]


def _raise_issues(issues):
    if issues:
        raise RecipePublishError(
            'Not published. inventory-platform deducts stock in each item\'s stock unit, and '
            'these lines can\'t be converted to it, so POS sales would not deduct them:\n- '
            + '\n- '.join(issues))


def _ingredient_lines(recipe, cat, units):
    lines, warnings, issues = [], [], []
    for ing in recipe.ingredients.select_related('unit').all():
        item_id = cat.sku_to_id.get(ing.item_sku)
        if item_id is None:
            warnings.append(
                f'{ing.item_sku} ({ing.item_name_snapshot or "?"}) is not an inventory '
                f'item — line skipped')
            continue
        qty, unit_id, note, issue = units.line(
            ing.item_sku, ing.item_name_snapshot, ing.quantity, ing.unit if ing.unit_id else None)
        if issue:
            issues.append(issue)
            continue
        if note:
            warnings.append(note)
        line = {'item': item_id, 'quantity': str(qty), 'unit': unit_id}
        # alt_item_sku only exists on ProductionRecipeIngredient (a fallback
        # a prep kitchen's batch confirmation uses when item_sku is out of
        # stock) — getattr keeps this safe for DishRecipeIngredient rows too,
        # since this function is shared by both publish paths.
        alt_sku = getattr(ing, 'alt_item_sku', '')
        if alt_sku:
            alt_id = cat.sku_to_id.get(alt_sku)
            if alt_id is None:
                warnings.append(
                    f'alternate {alt_sku} ({ing.alt_item_name_snapshot or "?"}) is not an '
                    f'inventory item — no fallback published for {ing.item_sku}')
            else:
                line['alt_item'] = alt_id
        lines.append(line)
    return lines, warnings, issues


def _finish_ok(recipe, remote_id):
    recipe.inventory_recipe_id = str(remote_id)
    recipe.published_at = timezone.now()
    recipe.publish_error = ''
    recipe.save(update_fields=['inventory_recipe_id', 'published_at', 'publish_error', 'updated_at'])


def _finish_error(recipe, exc):
    recipe.publish_error = str(exc)[:2000]
    recipe.save(update_fields=['publish_error', 'updated_at'])


def _push(recipe, payload, *, create, update, relink):
    """PATCH the linked inventory-platform recipe, or POST a new one. If the
    stored id 404s — the row was deleted over there — drop the dead link and
    POST fresh instead of failing forever. Returns the remote id."""
    if recipe.inventory_recipe_id:
        try:
            update(recipe.inventory_recipe_id, payload)
            return recipe.inventory_recipe_id
        except InventoryAPIError as e:
            if e.status_code != 404:
                raise
            recipe.inventory_recipe_id = ''   # linked row is gone — recreate below
    create(payload)
    row = relink()
    if not row:
        raise InventoryAPIError('recipe was created but could not be found to link its id')
    return row['id']


def publish_dish_recipe(recipe, *, client=None):
    client = client or InventoryClient()

    # `brand` is Cookbook's Branch.slug for this dish (e.g. "wnr") — inventory-
    # platform scopes DishRecipe/POSItemMapping identity by (brand, name), so
    # two brands can each publish a same-named dish at their own price without
    # overwriting each other. Every dish must be linked to a branch before it
    # can be published; there is no safe default.
    brand = getattr(recipe.branch_ref, 'slug', '') or ''
    if not brand:
        raise RecipePublishError(
            'This dish has no branch set — link it to a branch (brand) before publishing, '
            'so its recipe and POS mappings don\'t collide with another brand\'s.')

    cat = _Catalogue(client)
    links = _modifier_links(recipe)
    deltas = list(_publishable_deltas(links))
    units = _Units(cat, [i.item_sku for i in recipe.ingredients.all()] + [d.item_sku for d in deltas])
    lines, warnings, issues = _ingredient_lines(recipe, cat, units)
    for d in deltas:
        if d.item_sku in cat.sku_to_id:
            issues.append(units.line(d.item_sku, d.item_name_snapshot, d.quantity,
                                     d.unit if d.unit_id else None)[3])
    _raise_issues([i for i in issues if i])
    if not lines:
        raise RecipePublishError(
            'None of this recipe’s ingredients match an inventory item — nothing to publish.')
    warnings += _sync_units(client, units)

    payload = {
        'brand': brand,
        'name_en': recipe.name_en,
        'name_ar': recipe.name_ar,
        'pos_item_name': recipe.pos_item_name or recipe.name_en,
        'notes': recipe.notes,
        'selling_price': str(recipe.selling_price) if recipe.selling_price is not None else None,
        'ingredients': lines,
    }
    try:
        remote_id = _push(
            recipe, payload,
            create=client.create_dish_recipe,
            update=client.update_dish_recipe,
            relink=lambda: client.find_dish_recipe(recipe.name_en, brand),
        )
    except InventoryAPIError as e:
        _finish_error(recipe, e)
        raise RecipePublishError(f'inventory-platform rejected the recipe: {e}')

    _finish_ok(recipe, remote_id)
    warnings += _publish_pos_modifiers(recipe, client, cat, units, links, brand)
    return _result(recipe, warnings)


def _modifier_links(recipe):
    return list(recipe.modifier_groups.select_related('group')
                .prefetch_related('group__options__variant_recipe',
                                  'group__options__deltas__unit'))


def _publishable_deltas(links):
    """Deltas of the options that will publish POS deduction rows — checked
    for unit conversions before anything is pushed."""
    from .models import DeductionStatus
    for link in links:
        for opt in link.group.options.all():
            if opt.no_consumption_impact or opt.deduction_status == DeductionStatus.NEEDS_DATA:
                continue
            yield from opt.deltas.all()


def _publish_pos_modifiers(recipe, client, cat, units, links, brand):
    """After the dish recipe is on inventory-platform, push its POS deduction
    data:
      - a POSItemMapping for the base dish;
      - a POSItemMapping for each `type` option that has a published variant
        recipe (full-replacement variant);
      - a POSModifierIngredient per `+`/`-` delta for every other option that
        carries deltas (add-ons, removals, and `type`/`choice` picks modelled
        as deltas from a protein-less base).
    `no_consumption_impact` options publish nothing. Every gap is a warning,
    never a hard error — the recipe is already published; the readiness
    endpoint is where gaps get fixed."""
    from .models import ModifierOptionKind, DeductionStatus

    if not links:
        return []

    warnings = []
    pos_name = recipe.pos_item_name or recipe.name_en

    def _push_mapping(mods, target_recipe_id, label):
        try:
            client.upsert_pos_mapping(pos_name, mods, target_recipe_id, brand)
        except InventoryAPIError as e:
            warnings.append(f'POS mapping for {label} failed: {e}')

    _push_mapping('', recipe.inventory_recipe_id, 'the base dish')

    seen_options = set()
    for link in links:
        for opt in link.group.options.all():
            if opt.id in seen_options:      # a group can hang off several dishes
                continue
            seen_options.add(opt.id)
            where = f'"{opt.name_en}" in {link.group.name_en}'

            if opt.no_consumption_impact:
                continue
            if opt.deduction_status == DeductionStatus.NEEDS_DATA:
                warnings.append(f'{where}: {(opt.missing or ["needs data"])[0]} — not published')
                continue
            if not opt.pos_mods_string:
                warnings.append(f'{where}: no POS “Mods” match key — not published')
                continue

            # full-replacement variant
            if opt.kind == ModifierOptionKind.TYPE and opt.variant_recipe and opt.variant_recipe.inventory_recipe_id:
                _push_mapping(opt.pos_mods_string, opt.variant_recipe.inventory_recipe_id, where)
                # clear any stale delta rows from a previous delta-based publish
                _prune_deltas(client, pos_name, opt.pos_mods_string, brand, warnings, where)
                continue

            # delta-based (add-on / removal / delta-modelled pick)
            _prune_deltas(client, pos_name, opt.pos_mods_string, brand, warnings, where)
            for d in opt.deltas.all():
                item_id = cat.sku_to_id.get(d.item_sku)
                if item_id is None:
                    warnings.append(
                        f'{where}: SKU {d.item_sku or "?"} ({d.item_name_snapshot or "?"}) '
                        f'not on inventory-platform — that delta not published')
                    continue
                qty, unit_id, note, issue = units.line(
                    d.item_sku, d.item_name_snapshot, d.quantity, d.unit if d.unit_id else None)
                if issue:       # checked before publishing; kept as a guard
                    warnings.append(f'{where}: {issue} — that delta not published')
                    continue
                if note:
                    warnings.append(f'{where}: {note}')
                try:
                    client.upsert_pos_modifier_ingredient(
                        pos_name, opt.pos_mods_string, item_id,
                        str(qty), unit_id, d.direction, brand)
                except InventoryAPIError as e:
                    warnings.append(f'POS modifier ingredient for {where} failed: {e}')
    return warnings


def _prune_deltas(client, pos_name, pos_modifier, brand, warnings, where):
    try:
        client.delete_pos_modifier_ingredients(pos_name, pos_modifier, brand)
    except InventoryAPIError as e:
        warnings.append(f'could not prune old POS deltas for {where}: {e}')


def publish_production_recipe(recipe, *, client=None):
    client = client or InventoryClient()
    cat = _Catalogue(client)

    output_id = cat.sku_to_id.get(recipe.output_item_sku)
    if output_id is None:
        raise RecipePublishError(
            f'The output item "{recipe.output_item_sku}" must exist on inventory-platform '
            f'before this recipe can be published.')

    prep_kitchen_id = getattr(recipe.prep_kitchen_ref, 'inventory_store_id', '') or ''
    if not prep_kitchen_id:
        raise RecipePublishError(
            'This recipe’s prep kitchen is not linked to an inventory-platform store '
            '(set PrepKitchen.inventory_store_id).')

    units = _Units(cat, [i.item_sku for i in recipe.ingredients.all()])
    lines, warnings, issues = _ingredient_lines(recipe, cat, units)
    _raise_issues(issues)
    warnings += _sync_units(client, units)
    payload = {
        'name_en': recipe.name_en,
        'name_ar': recipe.name_ar,
        'prep_kitchen': prep_kitchen_id,
        'output_item': output_id,
        'output_qty': str(recipe.output_qty),
        'notes': recipe.notes,
        'ingredients': lines,
    }
    try:
        remote_id = _push(
            recipe, payload,
            create=client.create_production_recipe,
            update=client.update_production_recipe,
            relink=lambda: client.find_production_recipe(recipe.name_en, prep_kitchen_id),
        )
    except InventoryAPIError as e:
        _finish_error(recipe, e)
        raise RecipePublishError(f'inventory-platform rejected the recipe: {e}')

    _finish_ok(recipe, remote_id)
    return _result(recipe, warnings)


def _result(recipe, warnings):
    return {
        'inventory_recipe_id': recipe.inventory_recipe_id,
        'published_at': recipe.published_at.isoformat(),
        'warnings': warnings,
    }


def sync_item_conversions(skus=None, *, client=None, chunk=200, dry_run=False):
    """Send Cookbook's per-item conversions to inventory-platform without a
    publish: after an item's conversions are edited (one SKU), or for every
    SKU Cookbook holds conversion data for (skus=None). Returns
    {'updated': [...], 'skipped': [...], 'problems': [...], 'rows': n};
    `problems` are SKUs whose stock unit can't be anchored (see
    stock_units.ItemUnits). dry_run works it all out but sends nothing."""
    from .models import ItemConversion
    client = client or InventoryClient()
    if skus is None:
        skus = list(ItemConversion.objects.values_list('item_sku', flat=True))
        items = None                                   # whole catalogue
    else:
        items = []
        for sku in skus:
            page = client.search_items({'search': sku, 'page_size': 50}) or {}
            items += [i for i in page.get('results', []) if i.get('sku') == sku]
    cat = _Catalogue(client, items=items)
    out = {'updated': [], 'skipped': [], 'problems': [], 'rows': 0}
    skus = [s for s in skus if cat.stock_code.get(s)]
    for start in range(0, len(skus), chunk):
        units = _Units(cat, skus[start:start + chunk])
        out['problems'] += [f'{sku}: {iu.problem}' for sku, iu in sorted(units.items.items())
                            if iu.anchor is None]
        payload = units.sync_payload()
        out['rows'] += sum(len(p['conversions']) for p in payload)
        if payload and not dry_run:
            result = client.sync_recipe_conversions(payload) or {}
            out['updated'] += result.get('updated', [])
            out['skipped'] += result.get('skipped', [])
    return out
