"""
Publish a branch menu as a public edition.

`build_payload(menu, on)` resolves the effective menu for a date
(apps.cookbook.specials), then strips it to a public-safe shape: dish names,
customer copy, the menu price, an absolute photo URL, allergens and calories —
and NOTHING else. No cost, no margin, no supplier, no recipe code, no internal
ids beyond the dish id.

`publish_edition(...)` freezes that payload into an immutable MenuEdition,
flips the previous current edition off and bumps the version — the same
is_current / version vocabulary recipes use. A change is never an edit; it is
a new edition.

The public read path (`/m/<slug>`) only ever touches MenuEdition.payload, never
this module or the resolver.
"""
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from .models import DishRecipe, MenuEdition
from .specials import resolve_menu

# keys copied straight from a resolved line
_PUBLIC_LINE_KEYS = ('name_en', 'name_ar', 'description_en', 'description_ar')


def _abs(base_url, url):
    if not url:
        return ''
    if url.startswith(('http://', 'https://', 'data:')):
        return url
    return f'{base_url.rstrip("/")}{url}' if base_url else url


def _calories(nutrition):
    val = (nutrition or {}).get('calories')
    if val in (None, ''):
        return None
    try:
        return int(round(float(val)))
    except (TypeError, ValueError):
        return None


def build_payload(menu, on, *, base_url=''):
    resolved = resolve_menu(menu, on)

    dish_ids = [
        item['dish_id']
        for cat in resolved['categories']
        for item in cat['items']
    ]
    dishes = {
        str(d.id): d
        for d in DishRecipe.objects.filter(id__in=dish_ids).prefetch_related('allergens')
    }

    categories = []
    for cat in resolved['categories']:
        items = []
        for item in cat['items']:
            if not item['is_available']:
                continue
            dish = dishes.get(item['dish_id'])
            items.append({
                **{k: item[k] for k in _PUBLIC_LINE_KEYS},
                'price': item['price'],
                'image_url': _abs(base_url, item['image_url']),
                'allergens': sorted(a.name for a in dish.allergens.all()) if dish else [],
                'calories': _calories(dish.nutrition) if dish else None,
            })
        if items:
            categories.append({
                'name_en': cat['name'],
                'name_ar': cat['name_ar'],
                'items': items,
            })

    return {
        'branch': {
            'name_en': menu.branch.name_en,
            'name_ar': menu.branch.name_ar,
            'slug': menu.branch.slug,
        },
        'effective_on': on.isoformat(),
        'generated_at': timezone.now().isoformat(),
        'period_names': [
            {'en': p['name_en'], 'ar': p['name_ar']} for p in resolved['periods']
        ],
        'categories': categories,
        'item_count': sum(len(c['items']) for c in categories),
    }


@transaction.atomic
def publish_edition(menu, on, *, published_by='', base_url=''):
    payload = build_payload(menu, on, base_url=base_url)

    current = menu.editions.filter(is_current=True).first()
    lineage = current.lineage_key if current else None
    menu.editions.filter(is_current=True).update(is_current=False)
    version = (menu.editions.aggregate(m=Max('version'))['m'] or 0) + 1

    edition = MenuEdition(
        menu=menu, version=version, is_current=True,
        effective_on=on, published_by=published_by, payload=payload,
    )
    if lineage:
        edition.lineage_key = lineage
    edition.save()
    return edition
