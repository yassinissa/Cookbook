"""
Seeds apps.cookbook's reference tables with the real values from
"200 Lebanese Menu Cook Book.xlsm" (Restaurant Information + Action Log
sheets' dropdown-source lists). Idempotent — safe to re-run.

Usage: python manage.py seed_cookbook_reference_data
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.cookbook.models import (
    MenuCategory, Branch, Section, Approver, Allergen, ServiceStyle, UnitScale,
    StandardMeasurementConversion, TasteDescriptor, TasteDescriptorCategory,
)

# name_en -> (name_ar, menu_title_ar) — Restaurant Information sheet cols B / D / F
MENU_CATEGORIES = {
    'Salad':            ('سلطة', 'سلطة'),
    'Cold Mizze':       ('المقبلات الباردة', 'المقبلات الباردة'),
    'Hot Mizze':        ('المقبلات الساخنة', 'المقبلات الساخنة'),
    'Sides':            ('اطباق جانبيه', 'اطباق جانبيه'),
    'Grill':            ('المشاوي', 'المشاوي'),
    'Dish OF The Day':  ('طبق اليوم', 'طبق اليوم'),
    'Sweet':            ('الحلويات', 'الحلويات'),
    'Forced Modifier':  ('التعديل الإجباري', 'التعديل الإجباري'),
    'Optional Modifier':('التعديل الإختياري', 'التعديل الإختياري'),
}

# name_en -> name_ar — Restaurant Information sheet cols N / O
BRANCHES = {
    'WnR':           'ووك ان روول',
    'BL':            'بيت لادان',
    'Dine':          'داين',
    'Estepona':      'استبونا',
    'Sando':         'ساندو',
    'Levant':        'ليفانت',
    'Dainty Pastry': 'دينتي بيستري',
    'Luma':          'لوما',
}

# name -> avg monthly salary (KWD), None where the sheet had #DIV/0!
SECTIONS = {
    'Accounting': 582.5, 'Appetizer': 280.84, 'Arabic': 302.29411764705884,
    'Bakery': 314.55555555555554, 'Bartender': 288.2, 'Breakfast': None,
    'Busser': 200.05357142857142, 'Cashier': 321.7352941176471, 'CEO Office': 700,
    'Chinese': 356.7142857142857, 'Coordination': 120, 'Dessert': 337.5,
    'Dispatcher': 291.625, 'Driver': 255.17708333333334,
    'Elect & A/C': 326.8333333333333, 'Executive Chef': 1150, 'Finance': None,
    'Griddle': None, 'Grill': 258.2307692307692, 'HOH Cleaner': 192.34722222222223,
    'Host': 287.88235294117646, 'HR': 812, 'IT': None,
    'Japanese': 419.4761904761905, 'Kitchen Manager': None,
    'Kitchen Supervisor': 566.1666666666666, 'Manitenance Manager': 1125,
    'Marketing': 659, 'Nikkei': None, 'Operation': 1130, 'Pasta': None,
    'Pastry': 246, 'Plumbing': 433, 'Preparation': 273.77272727272725,
    'Q/A': 695.75, 'Restaurant Manager': 683.6666666666666,
    'Restaurant Supervisor': 475.8, 'Runner': 236.8235294117647,
    'Salad': 285.78, 'Saltado': 307.3333333333333, 'Sandwich': 392,
    'Seafood': 299, 'Smoking': 362, 'Staff Cook': 228.66666666666666,
    'Store': 245.1875, 'Store Supervisor': 400.3333333333333,
    'Supply Chain': None, 'Teppanyaki': 418.65384615384613,
    'Trainee': 399.8888888888889, 'Trainer': None, 'Waiter': 318.47727272727275,
}

APPROVERS = [
    'Maitham', 'Mohaiman', 'Nour', 'Chef. Fakhri', 'Chef. Bashar', 'Edward', 'John',
    'Chef. Mohammad', 'Kristal', 'Chef. Khader', 'Chef. Meril', 'Chef. Zahir',
    'Chef Costa', 'Chef. Nasir', 'Chef. Mokhtar', 'Chef. Moneer', 'Chef. Mizan',
    'Chef. Amzad', 'Chef Rose', 'Chef. Ahmad', 'Chef Loukman',
]

ALLERGENS = [
    'Almond', 'Anchovy', 'Anise', 'Apple', 'Apricot', 'Artificial Coloring',
    'Aspartame', 'Avocado', 'Banana', 'Barley', 'Basil', 'Bean', 'Beef',
    'Bell Pepper', 'Black Bean', 'Black Pepper', 'Blueberry', 'Brazil Nut',
    'Broccoli', 'Buckwheat', 'Cabbage', 'Carrot', 'Casein', 'Cashew',
    'Cauliflower', 'Celery', 'Cherry', 'Chia Seed', 'Chicken', 'Chickpea',
    'Chili Pepper', 'Chocolate', 'Cinnamon', 'Clam', 'Clove', 'Cocoa',
    'Coconut', 'Cod', 'Coffee', 'Coriander', 'Corn', 'Crab', 'Cucumber',
    'Dairy', 'Date', 'Egg', 'Egg White', 'Egg Yolk', 'Eggplant', 'Fig',
    'Fish', 'Flaxseed', 'Food Dye', 'Garlic', 'Gelatin', 'Gluten', 'Grape',
    'Grapefruit', 'Green Pea', 'Hazelnut', 'Histamine', 'Honey',
    'Kidney Bean', 'Kiwi', 'Lactose', 'Lamb', 'Lemon', 'Lentil', 'Lettuce',
    'Lime', 'Lobster', 'Lupin', 'Macadamia Nut', 'Maize', 'Mango', 'Melon',
    'Milk', 'Mint', 'MSG', 'Mushroom', 'Mussel', 'Mustard', 'Nitrates',
    'Nutmeg', 'Oats', 'Octopus', 'Olive', 'Onion', 'Orange', 'Oregano',
    'Oyster', 'Papaya', 'Paprika', 'Parsley', 'Pea', 'Peach', 'Peanut',
    'Pear', 'Pecan', 'Pine Nut', 'Pineapple', 'Pistachio', 'Plum',
    'Pomegranate', 'Poppy Seed', 'Potato', 'Preservatives', 'Pumpkin Seed',
    'Quinoa', 'Raspberry', 'Rice', 'Rye', 'Saffron', 'Salmon', 'Sardine',
    'Scallop', 'Sesame', 'Shellfish', 'Shrimp', 'Soy', 'Soybean', 'Spinach',
    'Squid', 'Strawberry', 'Sulfites', 'Sunflower Seed', 'Sweet Potato',
    'Tea', 'Tilapia', 'Tomato', 'Tree Nuts', 'Tuna', 'Turkey', 'Vanilla',
    'Walnut', 'Watermelon', 'Wheat', 'Whey', 'Yeast', 'Zucchini', 'Nuts', 'None',
]

SERVICE_STYLES = ['Dine-in', 'Delivery', 'Takeaway', 'Buffet', 'Catering']

# code -> (description, dimension, factor_to_canonical)
# canonical unit per dimension: mass=g, volume=ml, count=each, length=cm
UNIT_SCALES = {
    'Tbs':     ('Table spoon', 'volume', 15),
    'Ts':      ('Tea Spoon', 'volume', 5),
    'g':       ('Gram', 'mass', 1),
    'Pc':      ('Piece', 'count', 1),
    'Pcs':     ('Pieces', 'count', 1),
    'EA':      ('Each', 'count', 1),
    'Ltr':     ('Liter', 'volume', 1000),
    'Kg':      ('Kilogram', 'mass', 1000),
    'ml':      ('Milliliter', 'volume', 1),
    'Cup':     ('Cup', 'volume', 240),
    'Pinch':   ('Pinch = <1/8 Ts = Dash', 'volume', '0.31'),
    'cm':      ('Centimeter', 'length', 1),
    'm':       ('Meter', 'length', 100),
    'Portion': ('Portion', 'count', 1),
}

# label, [equiv_1..5] (padded/truncated to 5)
MEASUREMENT_CONVERSIONS = [
    ('1 Tbs',    ['3 Ts', '15 ml', '1/2 fl oz (Fluid Ounce)']),
    ('1/2 Tbs',  ['1-1/2 Ts', '7.5 ml', '1/4 fl oz (Fluid Ounce)']),
    ('3 Ts',     ['1 Tbs', '15 ml', '1/2 fl oz (Fluid Ounce)']),
    ('1 Ts',     ['1/3 Tbs', '5 ml']),
    ('1/2 Ts',   ['2.5 ml']),
    ('1/4 Ts',   ['1.25 ml']),
    ('1/8 Ts',   ['0.625 ml']),
    ('1/5 Ts',   ['1 ml']),
    ('>1/8 Ts',  ['', '', 'Dash', 'Pinch']),
    ('1/8 Cup',  ['2 Tbs', '30 ml', '1 fl oz (Fluid Ounce)']),
    ('1/4 Cup',  ['4 Tbs', '60 ml', '2 fl oz (Fluid Ounce)']),
    ('1/3 Cup',  ['80 ml']),
    ('1/2 Cup',  ['8 Tbs', '125 ml', '4 fl oz (Fluid Ounce)']),
    ('2/3 Cup',  ['160 ml']),
    ('3/4 Cup',  ['12 Tbs', '180 ml', '6 fl oz (Fluid Ounce)']),
    ('1 Cup',    ['16 Tbs', '250 ml / 237 ml', '8 fl oz (Fluid Ounce)', '1/2 Pint']),
    ('1 Liter',  ['4 Cups', '1000 ml / 950 ml', '32 fl oz (Fluid Ounce)', '2 Pints', '1 Quart']),
]

# Action Log sheet dropdown-source columns V–AF
TASTE_DESCRIPTORS = {
    TasteDescriptorCategory.APPEARANCE: [
        'Glossy', 'Matte', 'Golden Brown', 'Light Golden', 'Deep Brown',
        'Bright', 'Fresh-looking', 'Neat / Clean', 'Caramelized', 'Charred',
    ],
    TasteDescriptorCategory.COLOR: [
        'White', 'Cream', 'Yellow', 'Golden', 'Light Brown', 'Brown',
        'Dark Brown', 'Red', 'Orange', 'Green', 'Mixed / Multicolor',
    ],
    TasteDescriptorCategory.AROMA: [
        'Fresh', 'Mild', 'Strong', 'Garlic', 'Buttery', 'Herbal', 'Citrusy',
        'Smoky', 'Roasted', 'Meaty', 'Seafood', 'Spicy', 'Sweet', 'Earthy',
    ],
    TasteDescriptorCategory.TEXTURE: [
        'Crispy', 'Crunchy', 'Tender', 'Juicy', 'Moist', 'Soft', 'Firm',
        'Chewy', 'Creamy', 'Velvety', 'Smooth', 'Fluffy', 'Dense',
    ],
    TasteDescriptorCategory.PRESENTATION: [
        'Centered', 'Clean Rim', 'Garnish on Top', 'Sauce Under', 'Sauce on Side',
        'Layered', 'Bowl Presentation', 'Plate Presentation', 'Takeaway Standard',
    ],
    TasteDescriptorCategory.PRIMARY_FLAVOR: [
        'Savory / Umami', 'Sweet', 'Salty', 'Sour / Tangy', 'Spicy', 'Smoky',
        'Garlic', 'Herbal', 'Citrusy', 'Creamy', 'Buttery', 'Meaty', 'Seafood',
    ],
    TasteDescriptorCategory.SECONDARY_FLAVOR: [
        'None', 'Garlic', 'Chili', 'Ginger', 'Soy', 'Sesame', 'Lemon', 'Lime',
        'Herbal', 'Sweet', 'Smoky', 'Buttery', 'Peppery',
    ],
    TasteDescriptorCategory.AFTERTASTE: [
        'Clean', 'Refreshing', 'Mildly Spicy', 'Lingering', 'Sweet', 'Savory',
        'Citrusy', 'Smoky', 'Cooling', 'Warming',
    ],
    TasteDescriptorCategory.MOUTHFEEL: [
        'Light', 'Rich', 'Creamy', 'Smooth', 'Velvety', 'Juicy', 'Crispy',
        'Not Greasy', 'Thick', 'Silky',
    ],
    TasteDescriptorCategory.FRESHNESS: [
        'Fresh Aroma', 'Freshly Cooked', 'No Stale Notes', 'No Oxidation',
        'No Rancidity', 'No Off-Odor',
    ],
    TasteDescriptorCategory.CRITICAL_DEFECT: [
        'Burnt', 'Rancid', 'Metallic', 'Stale', 'Raw', 'Overcooked', 'Undercooked',
        'Over-salted', 'Too Sweet', 'Too Sour', 'Soggy', 'Rubbery', 'Greasy',
    ],
}


class Command(BaseCommand):
    help = 'Seed apps.cookbook reference tables with real data from the Lebanese Menu Cook Book.'

    @transaction.atomic
    def handle(self, *args, **options):
        created = {}

        cats_created = 0
        for i, (name, (name_ar, title_ar)) in enumerate(MENU_CATEGORIES.items()):
            _, was_created = MenuCategory.objects.update_or_create(
                name=name,
                defaults={'name_ar': name_ar, 'menu_title_ar': title_ar, 'sort_order': i},
            )
            cats_created += was_created
        created['categories'] = cats_created

        branches_created = 0
        for i, (name_en, name_ar) in enumerate(BRANCHES.items()):
            _, was_created = Branch.objects.update_or_create(
                name_en=name_en, defaults={'name_ar': name_ar, 'sort_order': i},
            )
            branches_created += was_created
        created['branches'] = branches_created

        created['sections'] = sum(
            Section.objects.get_or_create(name=n, defaults={'avg_monthly_salary': s})[1]
            for n, s in SECTIONS.items()
        )

        created['approvers'] = sum(
            Approver.objects.get_or_create(name=n)[1] for n in APPROVERS
        )

        created['allergens'] = sum(
            Allergen.objects.get_or_create(name=n)[1] for n in dict.fromkeys(ALLERGENS)
        )

        created['service_styles'] = sum(
            ServiceStyle.objects.get_or_create(name=n)[1] for n in SERVICE_STYLES
        )

        units_created = 0
        for code, (desc, dim, factor) in UNIT_SCALES.items():
            _, was_created = UnitScale.objects.update_or_create(
                code=code,
                defaults={'description': desc, 'dimension': dim, 'factor_to_canonical': factor},
            )
            units_created += was_created
        created['units'] = units_created

        n = 0
        for label, equivs in MEASUREMENT_CONVERSIONS:
            equivs = (equivs + [''] * 5)[:5]
            _, was_created = StandardMeasurementConversion.objects.get_or_create(
                label=label,
                defaults=dict(zip(['equiv_1', 'equiv_2', 'equiv_3', 'equiv_4', 'equiv_5'], equivs)),
            )
            n += was_created
        created['conversions'] = n

        n = 0
        for category, values in TASTE_DESCRIPTORS.items():
            for v in values:
                _, was_created = TasteDescriptor.objects.get_or_create(category=category, value=v)
                n += was_created
        created['taste_descriptors'] = n

        self.stdout.write(self.style.SUCCESS(f'Seeded/verified: {created}'))
