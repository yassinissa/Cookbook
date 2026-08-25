"""
Seeds apps.cookbook's reference tables with the real values from
"200 Lebanese Menu Cook Book.xlsm" (Restaurant Information + Action Log
sheets' dropdown-source lists). Idempotent — safe to re-run.

Usage: python manage.py seed_cookbook_reference_data
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.cookbook.models import (
    MenuCategory, Section, Approver, Allergen, ServiceStyle, UnitScale,
    StandardMeasurementConversion, TasteDescriptor, TasteDescriptorCategory,
)

MENU_CATEGORIES = [
    'Salad', 'Cold Mizze', 'Hot Mizze', 'Sides', 'Grill',
    'Dish OF The Day', 'Sweet', 'Forced Modifier', 'Optional Modifier',
]

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

# code -> description
UNIT_SCALES = {
    'Tbs': 'Table spoon', 'Ts': 'Tea Spoon', 'g': 'Gram', 'Pc': 'Piece',
    'Pcs': 'Pieces', 'EA': 'Each', 'Ltr': 'Liter', 'Kg': 'Kilogram',
    'ml': 'Milliliter', 'Cup': 'Cup', 'Pinch': 'Pinch = <1/8 Ts = Dash',
    'cm': 'Centimeter', 'm': 'Meter', 'Portion': 'Portion',
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
}


class Command(BaseCommand):
    help = 'Seed apps.cookbook reference tables with real data from the Lebanese Menu Cook Book.'

    @transaction.atomic
    def handle(self, *args, **options):
        created = {}

        created['categories'] = sum(
            MenuCategory.objects.get_or_create(name=n)[1] for n in MENU_CATEGORIES
        )

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

        created['units'] = sum(
            UnitScale.objects.get_or_create(code=c, defaults={'description': d})[1]
            for c, d in UNIT_SCALES.items()
        )

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
