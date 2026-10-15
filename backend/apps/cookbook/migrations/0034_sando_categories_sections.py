"""
Sando's own menu categories and kitchen sections (owner's list, 2026-10-15).

Once a brand has a list, the dish editor and the write serializer offer it
only that list (`models.reference.brand_options`). Sections all exist already
and are matched by name, case-insensitively; categories are created if
missing. A database without a Sando brand is left untouched.
"""
from django.db import migrations

SANDO_CATEGORIES = [
    ('Starters', 'المقبـــلات'),
    ('Arabic Sandwich', 'ساندويتش عربي'),
    ('Burrito', 'بوريتو'),
    ('Mini Manakish', 'ميني مناقيش'),
    ('Mini Light', 'المينـــي لايـــت'),
    ('Philly Sandwich', 'ساندويتش فيلي'),
    ('Mini Slider', 'المينـــي السلايـــدرز'),
    ('Sub Sandwich', 'ساندويتش صَب'),
    ('Manakish', 'المناقيش'),
    ('Hotdog', 'الهوت دوج'),
    ('Calzone Sandwich', 'سندويتشات الكالزوني'),
    ('Cold Sandwich', 'السندويتشات الباردة'),
    ('Burger', 'البيرغر'),
    ('Buns', 'البان'),
    ('Panini', 'البانينـــي'),
    ('Sauce', 'صوص'),
]

SANDO_SECTIONS = [
    'Appetizer', 'Arabic', 'Bakery', 'Breakfast', 'Chinese', 'Dessert', 'Dispatcher',
    'Executive Chef', 'Griddle', 'Grill', 'HOH Cleaner', 'Japanese', 'Kitchen Manager',
    'Kitchen Supervisor', 'Nikkei', 'Pasta', 'Salad', 'Saltado', 'Sandwich', 'Seafood',
    'Smoking', 'Staff Cook', 'Teppanyaki',
]


def _sando(apps):
    Branch = apps.get_model('cookbook', 'Branch')
    return (Branch.objects.filter(slug='sando').first()
            or Branch.objects.filter(name_en__iexact='sando').first())


def forwards(apps, schema_editor):
    sando = _sando(apps)
    if sando is None:
        return
    MenuCategory = apps.get_model('cookbook', 'MenuCategory')
    Section = apps.get_model('cookbook', 'Section')

    for i, (name, name_ar) in enumerate(SANDO_CATEGORIES, start=1):
        cat = MenuCategory.objects.filter(name__iexact=name).first()
        if cat is None:
            cat = MenuCategory.objects.create(name=name, name_ar=name_ar, menu_title_ar=name_ar, sort_order=i)
        elif not cat.name_ar:
            cat.name_ar = name_ar
            cat.save(update_fields=['name_ar'])
        cat.branches.add(sando)

    for name in SANDO_SECTIONS:
        section = Section.objects.filter(name__iexact=name).first()
        if section is None:
            section = Section.objects.create(name=name)
        section.branches.add(sando)


def backwards(apps, schema_editor):
    sando = _sando(apps)
    if sando is None:
        return
    sando.menu_categories.clear()
    sando.sections.clear()


class Migration(migrations.Migration):
    dependencies = [('cookbook', '0033_brand_category_section_lists')]
    operations = [migrations.RunPython(forwards, backwards)]
