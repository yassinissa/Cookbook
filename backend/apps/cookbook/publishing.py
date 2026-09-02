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
from django.utils import timezone

from apps.integrations.inventory_client import InventoryClient, InventoryAPIError


class RecipePublishError(Exception):
    """The recipe could not be pushed — bad reference data, or the platform
    rejected the payload. `args[0]` is a user-facing message."""


def _catalogue(client):
    """{sku: item_id}, {unit_code: unit_id} from a live pull."""
    items = client.get_items()
    units = client.get_units()
    if isinstance(units, dict):
        units = units.get('results', [])
    sku_to_id = {i['sku']: i['id'] for i in items if i.get('sku')}
    code_to_unit = {u['code']: u['id'] for u in units if u.get('code')}
    return sku_to_id, code_to_unit


def _ingredient_lines(recipe, sku_to_id, code_to_unit):
    lines, warnings = [], []
    for ing in recipe.ingredients.select_related('unit').all():
        item_id = sku_to_id.get(ing.item_sku)
        if item_id is None:
            warnings.append(
                f'{ing.item_sku} ({ing.item_name_snapshot or "?"}) is not an inventory '
                f'item — line skipped')
            continue
        unit_id = None
        if ing.unit_id:
            unit_id = code_to_unit.get(ing.unit.code)
            if unit_id is None:
                warnings.append(
                    f'unit "{ing.unit.code}" for {ing.item_sku} has no match on '
                    f'inventory-platform — the item default unit is used instead')
        lines.append({'item': item_id, 'quantity': str(ing.quantity), 'unit': unit_id})
    return lines, warnings


def _finish_ok(recipe, remote_id):
    recipe.inventory_recipe_id = str(remote_id)
    recipe.published_at = timezone.now()
    recipe.publish_error = ''
    recipe.save(update_fields=['inventory_recipe_id', 'published_at', 'publish_error', 'updated_at'])


def _finish_error(recipe, exc):
    recipe.publish_error = str(exc)[:2000]
    recipe.save(update_fields=['publish_error', 'updated_at'])


def publish_dish_recipe(recipe, *, client=None):
    client = client or InventoryClient()
    sku_to_id, code_to_unit = _catalogue(client)
    lines, warnings = _ingredient_lines(recipe, sku_to_id, code_to_unit)
    if not lines:
        raise RecipePublishError(
            'None of this recipe’s ingredients match an inventory item — nothing to publish.')

    payload = {
        'name_en': recipe.name_en,
        'name_ar': recipe.name_ar,
        'pos_item_name': recipe.pos_item_name or recipe.name_en,
        'notes': recipe.notes,
        'selling_price': str(recipe.selling_price) if recipe.selling_price is not None else None,
        'ingredients': lines,
    }
    try:
        if recipe.inventory_recipe_id:
            client.update_dish_recipe(recipe.inventory_recipe_id, payload)
            remote_id = recipe.inventory_recipe_id
        else:
            client.create_dish_recipe(payload)
            row = client.find_dish_recipe(recipe.name_en)
            if not row:
                raise InventoryAPIError('recipe was created but could not be found to link its id')
            remote_id = row['id']
    except InventoryAPIError as e:
        _finish_error(recipe, e)
        raise RecipePublishError(f'inventory-platform rejected the recipe: {e}')

    _finish_ok(recipe, remote_id)
    warnings += _publish_pos_modifiers(recipe, client, sku_to_id, code_to_unit)
    return _result(recipe, warnings)


def _publish_pos_modifiers(recipe, client, sku_to_id, code_to_unit):
    """After the dish recipe is on inventory-platform, push its POS deduction
    data: a POSItemMapping for the base dish + each `type` modifier option
    (→ a variant recipe), and a POSAddonIngredient for each `addon` option.
    Every failure is a warning, never a hard error — the recipe is already
    published."""
    from .models import ModifierOptionKind

    links = list(recipe.modifier_groups.select_related('group')
                 .prefetch_related('group__options__variant_recipe', 'group__options__unit'))
    if not links:
        return []

    warnings = []
    pos_name = recipe.pos_item_name or recipe.name_en

    def _push_mapping(mods, target_recipe_id, label):
        try:
            client.upsert_pos_mapping(pos_name, mods, target_recipe_id)
        except InventoryAPIError as e:
            warnings.append(f'POS mapping for {label} failed: {e}')

    _push_mapping('', recipe.inventory_recipe_id, 'the base dish')

    for link in links:
        for opt in link.group.options.all():
            where = f'"{opt.name_en}" in {link.group.name_en}'
            if opt.kind == ModifierOptionKind.TYPE:
                if not opt.pos_mods_string:
                    warnings.append(f'{where}: no POS “Mods” string — mapping skipped')
                    continue
                variant = opt.variant_recipe
                if not variant or not variant.inventory_recipe_id:
                    warnings.append(f'{where}: variant recipe not published yet — mapping skipped')
                    continue
                _push_mapping(opt.pos_mods_string, variant.inventory_recipe_id, where)
            elif opt.kind == ModifierOptionKind.ADDON:
                if not opt.pos_mods_string:
                    warnings.append(f'{where}: no POS “Mods” string — add-on skipped')
                    continue
                item_id = sku_to_id.get(opt.item_sku)
                if item_id is None:
                    warnings.append(f'{where}: SKU {opt.item_sku or "?"} not on inventory-platform — add-on skipped')
                    continue
                unit_id = code_to_unit.get(opt.unit.code) if opt.unit_id else None
                try:
                    client.upsert_pos_addon(opt.pos_mods_string, item_id, opt.quantity or 0, unit_id)
                except InventoryAPIError as e:
                    warnings.append(f'POS add-on for {where} failed: {e}')
    return warnings


def publish_production_recipe(recipe, *, client=None):
    client = client or InventoryClient()
    sku_to_id, code_to_unit = _catalogue(client)

    output_id = sku_to_id.get(recipe.output_item_sku)
    if output_id is None:
        raise RecipePublishError(
            f'The output item "{recipe.output_item_sku}" must exist on inventory-platform '
            f'before this recipe can be published.')

    prep_kitchen_id = getattr(recipe.prep_kitchen_ref, 'inventory_store_id', '') or ''
    if not prep_kitchen_id:
        raise RecipePublishError(
            'This recipe’s prep kitchen is not linked to an inventory-platform store '
            '(set PrepKitchen.inventory_store_id).')

    lines, warnings = _ingredient_lines(recipe, sku_to_id, code_to_unit)
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
        if recipe.inventory_recipe_id:
            client.update_production_recipe(recipe.inventory_recipe_id, payload)
            remote_id = recipe.inventory_recipe_id
        else:
            client.create_production_recipe(payload)
            row = client.find_production_recipe(recipe.name_en, prep_kitchen_id)
            if not row:
                raise InventoryAPIError('recipe was created but could not be found to link its id')
            remote_id = row['id']
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
