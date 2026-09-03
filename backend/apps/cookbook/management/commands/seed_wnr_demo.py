"""
Seed the WnR (Wok N Roll) branch with a demo menu — 15 dish recipes, their
ingredients, menu lines, and one shared modifier group — so the
Cookbook -> inventory-platform publish + POS-deduction loop can be exercised
end to end for a branch other than Dine.

    python manage.py seed_wnr_demo               # build in Cookbook only
    python manage.py seed_wnr_demo --publish     # also push each to inventory-platform

Idempotent: existing recipes / lines / options are updated in place.

The ingredient SKUs below are the WNR-* items from inventory-platform's
seed_pos_recipes fixture. --publish needs INVENTORY_API_* pointed at a
platform where those items and a matching production store exist, and the
service account must be able to write dish recipes (SUPER_ADMIN).
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.cookbook.models import (
    DishRecipe, DishRecipeIngredient, Branch, Menu, MenuLine, UnitScale,
    ModifierGroup, ModifierOption, ModifierOptionKind, ModifierSelection,
    DishModifierGroup, ModifierRole,
)
from apps.cookbook.services import apply_cost

# sku -> snapshot display name
_ITEM_NAMES = {
    'WNR-SHRIMP': 'Large Shrimp', 'WNR-CN-NOODLES': 'Chinese Egg Noodles',
    'WNR-MIXED-VEG': 'Mixed Vegetables', 'WNR-SOY-SAUCE': 'Soy Sauce',
    'WNR-CHILI-SAUCE': 'Chili Sauce', 'WNR-CORN': 'Sweet Corn', 'b1221': 'chicken breast',
    'WNR-MUSHROOM': 'Mixed Mushroom', 'WNR-TEMP-BATTER': 'Tempura Batter Mix',
    'WNR-POTATO': 'Potato', 'WNR-BEEF': 'Beef Local', 'WNR-RICE': 'Long Grain Rice',
    'WNR-GARLIC': 'Garlic', 'WNR-EDAMAME': 'Edamame Beans', 'WNR-SAUCE': 'Special Sauce',
    'WNR-CRAB': 'Imitation Crab Stick', 'WNR-AVOCADO': 'Avocado',
    'WNR-SUSHI-RICE': 'Sushi Rice', 'WNR-NORI': 'Nori Seaweed Sheet',
    # -- added for the ~70 previously-unmatched WnR POS report lines --
    'WNR-ANGUS-BEEF': 'Angus Beef', 'WNR-SALMON': 'Salmon Fillet', 'WNR-LOBSTER': 'Lobster Tail',
    'WNR-CUCUMBER': 'Cucumber', 'WNR-CREAM-CHEESE': 'Cream Cheese', 'WNR-TOBIKO': 'Tobiko Flying Fish Roe',
    'WNR-UDON': 'Udon Noodles', 'WNR-BROCCOLI': 'Broccoli', 'WNR-GYOZA-WRAP': 'Gyoza Wrapper',
    'WNR-MISO': 'Miso Paste', 'WNR-COCONUT-MILK': 'Coconut Milk', 'WNR-PINEAPPLE': 'Pineapple',
    'WNR-CREAM': 'Heavy Cream', 'WNR-LEMONGRASS': 'Lemongrass', 'WNR-TUNA': 'Tuna Fillet',
    'WNR-EEL': 'Unagi Eel Fillet', 'WNR-UNAGI-SAUCE': 'Unagi Glaze Sauce', 'WNR-HAMOOR': 'Baby Hamoor Fillet',
    'WNR-LASAGNA-SHEET': 'Lasagna Sheet', 'WNR-MOZZARELLA': 'Mozzarella Cheese', 'WNR-EGG': 'Egg',
    'WNR-MILK': 'Milk', 'WNR-FLOUR': 'All-Purpose Flour', 'WNR-CHOCOLATE': 'Dark Chocolate',
    'WNR-BUTTER': 'Butter', 'WNR-BANANA': 'Banana', 'WNR-WATER-SM': 'Mineral Water 500ml',
    'WNR-WATER-LG': 'Mineral Water 1.5L', 'WNR-WATER-SPARK': 'Sparkling Water Bottle',
    'WNR-PERRIER': 'Perrier Bottle', 'WNR-GINGER-ALE-CAN': 'Ginger Ale Can',
    'WNR-ICE-TEA-BOTTLE': 'Ice Tea Bottle', 'WNR-ORANGE-JUICE': 'Fresh Orange Juice',
    'WNR-LEMON': 'Lemon', 'WNR-MINT': 'Mint Leaves', 'WNR-SUGAR-SYRUP': 'Sugar Syrup',
    'WNR-SODA-WATER': 'Soda Water', 'WNR-LIME': 'Lime', 'WNR-CRANBERRY-JUICE': 'Cranberry Juice',
    'WNR-CORIANDER': 'Fresh Coriander', 'WNR-GINGER-SYRUP': 'Ginger Syrup',
    'WNR-BLUE-SYRUP': 'Blue Curacao Syrup (Non-Alcoholic)', 'WNR-PASSIONFRUIT-SYRUP': 'Passion Fruit Syrup',
    'WNR-STRAWBERRY-PUREE': 'Strawberry Puree', 'WNR-TOMATO-JUICE': 'Tomato Juice',
    'WNR-GRENADINE': 'Grenadine Syrup', 'WNR-COKE-CAN': 'Coke Can 330ml',
}

# name_en, pos_item_name, name_ar, price, [(sku, qty, unit_code)]
_DISHES = [
    ('Spicy Pink Shrimp', 'Spicy Pink Shrimp', 'روبيان بينك حار', '5.950',
     [('WNR-SHRIMP', '0.180', 'Kg'), ('WNR-CHILI-SAUCE', '0.030', 'Kg'), ('WNR-MIXED-VEG', '0.050', 'Kg')]),
    ('Chinese Fried Noodles', 'Chinese Fried Noodles', 'نودلز مقلي صيني', '2.550',
     [('WNR-CN-NOODLES', '0.200', 'Kg'), ('WNR-MIXED-VEG', '0.080', 'Kg'), ('WNR-SOY-SAUCE', '0.020', 'Kg')]),
    ('Chicken Corn Soup', 'Chicken Corn Soup', 'شوربة الدجاج بالذرة', '1.950',
     [('b1221', '0.050', 'Kg'), ('WNR-CORN', '0.100', 'Kg')]),
    ('Hot & Sour Soup', 'Hot & Sour Soup', 'شوربة الحامض الحاره', '1.950',
     [('WNR-MUSHROOM', '0.040', 'Kg'), ('WNR-MIXED-VEG', '0.050', 'Kg'), ('WNR-CHILI-SAUCE', '0.020', 'Kg')]),
    ('Tempura Ebi', 'Tempura Ebi', 'تيمبورا روبيان', '5.200',
     [('WNR-SHRIMP', '0.120', 'Kg'), ('WNR-TEMP-BATTER', '0.040', 'Kg')]),
    ('Spicy Potato', 'Spicy Potato', 'البطاطا الحاره', '3.900',
     [('WNR-POTATO', '0.150', 'Kg'), ('WNR-CHILI-SAUCE', '0.030', 'Kg'), ('WNR-BEEF', '0.100', 'Kg')]),
    ('Japanese Garlic Rice', 'Japanese Garlic Rice', 'أرز ياباني بالثوم', '2.400',
     [('WNR-RICE', '0.150', 'Kg'), ('WNR-GARLIC', '0.020', 'Kg'), ('WNR-SOY-SAUCE', '0.010', 'Kg')]),
    ('Japanese Fry Rice', 'Japanese Fry Rice', 'أرز مقلي ياباني', '2.850',
     [('WNR-RICE', '0.150', 'Kg'), ('WNR-MIXED-VEG', '0.060', 'Kg'), ('WNR-SOY-SAUCE', '0.020', 'Kg')]),
    ('Edamame Spicy', 'Edamame Spicy', 'ادمامي بالفلفل', '2.600',
     [('WNR-EDAMAME', '0.150', 'Kg'), ('WNR-CHILI-SAUCE', '0.020', 'Kg')]),
    ('Crispy Salad', 'Crispy Salad', 'سلطة مقرمشة', '3.200',
     [('WNR-MIXED-VEG', '0.120', 'Kg'), ('WNR-SAUCE', '0.030', 'Kg')]),
    ('Negimayaki', 'Negimayaki', 'نيجمياكي', '4.350',
     [('WNR-BEEF', '0.120', 'Kg'), ('WNR-SOY-SAUCE', '0.020', 'Kg')]),
    ('California Maki', 'California Maki', 'كاليفورنيا ماكي', '4.400',
     [('WNR-CRAB', '0.050', 'Kg'), ('WNR-AVOCADO', '0.040', 'Kg'), ('WNR-SUSHI-RICE', '0.090', 'Kg'), ('WNR-NORI', '1', 'Pcs')]),
    ('Mongolian', 'Mongolian', 'مانغوليان', '6.500',
     [('WNR-BEEF', '0.150', 'Kg'), ('WNR-MIXED-VEG', '0.050', 'Kg'), ('WNR-SOY-SAUCE', '0.020', 'Kg')]),
    ('Japanese Steam Rice', 'Japanese Steam Rice', 'أرز ياباني', '1.300',
     [('WNR-RICE', '0.150', 'Kg')]),
    ('Volcano', 'Volcano', 'فولكينو', '5.500',
     [('WNR-SUSHI-RICE', '0.100', 'Kg'), ('WNR-CRAB', '0.050', 'Kg'), ('WNR-SHRIMP', '0.030', 'Kg'), ('WNR-NORI', '1', 'Pcs')]),

    # -- 2026-09-03: recipes for the ~70 WnR POS report lines that had no
    # recipe anywhere (drinks, premium maki/sashimi, single-protein sides).
    # See seed_wnr_extra_items (inventory-platform) for the new SKUs.
    ('Mixed Style Sashimi', 'Mixed Style Sashimi', 'ستايل مكس ساشيمي', '6.500',
     [('WNR-SALMON', '0.060', 'Kg'), ('WNR-TUNA', '0.050', 'Kg'), ('WNR-SHRIMP', '0.040', 'Kg')]),
    ('Tuna Tataki', 'Tuna Tataki', 'تونه تاتاكي', '5.200',
     [('WNR-TUNA', '0.120', 'Kg'), ('WNR-SOY-SAUCE', '0.020', 'Kg')]),
    ('Akami Sushi', 'Akami Sushi', 'أكامي سوشي', '3.800',
     [('WNR-TUNA', '0.060', 'Kg'), ('WNR-SUSHI-RICE', '0.060', 'Kg')]),
    ('Unagi Sushi', 'Unagi Sushi', 'اوناجي سوشي', '4.600',
     [('WNR-EEL', '0.060', 'Kg'), ('WNR-SUSHI-RICE', '0.060', 'Kg'), ('WNR-UNAGI-SAUCE', '0.010', 'Kg')]),
    ('Kani Sushi', 'Kani Sushi', 'كاني سوشي', '3.500',
     [('WNR-CRAB', '0.060', 'Kg'), ('WNR-SUSHI-RICE', '0.060', 'Kg')]),
    ('Tobbiko Gunkan', 'Tobbiko Gunkan', 'توبيكو جانكن', '4.200',
     [('WNR-TOBIKO', '0.030', 'Kg'), ('WNR-SUSHI-RICE', '0.050', 'Kg'), ('WNR-NORI', '1', 'Pcs')]),
    ('Beef Rice Roll', 'Beef Rice Roll', 'لفائف الأرز باللحم', '4.400',
     [('WNR-BEEF', '0.100', 'Kg'), ('WNR-SUSHI-RICE', '0.080', 'Kg')]),
    ('Spicy Shrimp Temaki', 'Spicy Shrimp Temaki', 'روبيان حار تيماكي', '4.500',
     [('WNR-SHRIMP', '0.080', 'Kg'), ('WNR-SUSHI-RICE', '0.070', 'Kg'), ('WNR-NORI', '1', 'Pcs'), ('WNR-CHILI-SAUCE', '0.015', 'Kg')]),
    ('Fire Haitham Maki', 'Fire Haitham Maki', 'فايرهيثم ماكي', '5.200',
     [('WNR-SHRIMP', '0.060', 'Kg'), ('WNR-AVOCADO', '0.040', 'Kg'), ('WNR-SUSHI-RICE', '0.080', 'Kg'), ('WNR-NORI', '1', 'Pcs'), ('WNR-CHILI-SAUCE', '0.020', 'Kg')]),
    ('Salmon Avocado', 'Salmon Avocado', 'سالمون افوكادو', '4.900',
     [('WNR-SALMON', '0.060', 'Kg'), ('WNR-AVOCADO', '0.050', 'Kg'), ('WNR-SUSHI-RICE', '0.080', 'Kg'), ('WNR-NORI', '1', 'Pcs')]),
    ('Shrimp Lovers', 'Shrimp Lovers', 'روبيان لوفرز', '5.500',
     [('WNR-SHRIMP', '0.120', 'Kg'), ('WNR-TEMP-BATTER', '0.030', 'Kg'), ('WNR-SUSHI-RICE', '0.080', 'Kg'), ('WNR-NORI', '1', 'Pcs')]),
    ('Ali Maki', 'Ali Maki', 'علي ماكي', '5.000',
     [('WNR-SALMON', '0.050', 'Kg'), ('WNR-CREAM-CHEESE', '0.040', 'Kg'), ('WNR-SUSHI-RICE', '0.080', 'Kg'), ('WNR-NORI', '1', 'Pcs')]),
    ('Nami Maki', 'Nami Maki', 'نامي ماكي', '4.800',
     [('WNR-CRAB', '0.060', 'Kg'), ('WNR-AVOCADO', '0.040', 'Kg'), ('WNR-SUSHI-RICE', '0.080', 'Kg'), ('WNR-NORI', '1', 'Pcs')]),
    ('MMT', 'MMT', 'ام ام تي', '2.200',
     [('WNR-PASSIONFRUIT-SYRUP', '0.040', 'Kg'), ('WNR-SODA-WATER', '0.150', 'Kg'), ('WNR-MINT', '0.005', 'Kg'), ('WNR-LIME', '0.020', 'Kg')]),
    ('Hashem-Oto Maki', 'Hashem-Oto Maki', 'هاشيموتو ماكي', '5.400',
     [('WNR-SALMON', '0.070', 'Kg'), ('WNR-CREAM-CHEESE', '0.030', 'Kg'), ('WNR-AVOCADO', '0.030', 'Kg'), ('WNR-SUSHI-RICE', '0.080', 'Kg'), ('WNR-NORI', '1', 'Pcs')]),
    ('El-Dorado', 'El-Dorado', 'ايلديرادو', '2.400',
     [('WNR-PASSIONFRUIT-SYRUP', '0.040', 'Kg'), ('WNR-PINEAPPLE', '0.040', 'Kg'), ('WNR-SODA-WATER', '0.150', 'Kg')]),
    ('Cocktail Maki', 'Cocktail Maki', 'كوكتيل ماكي', '5.000',
     [('WNR-SHRIMP', '0.050', 'Kg'), ('WNR-CRAB', '0.040', 'Kg'), ('WNR-AVOCADO', '0.030', 'Kg'), ('WNR-SUSHI-RICE', '0.080', 'Kg'), ('WNR-NORI', '1', 'Pcs')]),
    ('MAB II', 'MAB II', 'ام اي بي 2', '2.300',
     [('WNR-BLUE-SYRUP', '0.030', 'Kg'), ('WNR-PINEAPPLE', '0.040', 'Kg'), ('WNR-SODA-WATER', '0.150', 'Kg')]),
    ('Prawn Lava', 'Prawn Lava', 'روبيان لافا', '5.600',
     [('WNR-SHRIMP', '0.100', 'Kg'), ('WNR-TEMP-BATTER', '0.030', 'Kg'), ('WNR-SUSHI-RICE', '0.080', 'Kg'), ('WNR-NORI', '1', 'Pcs'), ('WNR-CHILI-SAUCE', '0.020', 'Kg')]),
    ('Chai Thai Baby Hamoor', 'Chai Thai Baby Hamoor', 'سمك شاي تاي', '6.200',
     [('WNR-HAMOOR', '0.220', 'Kg'), ('WNR-LEMONGRASS', '0.020', 'Kg'), ('WNR-COCONUT-MILK', '0.040', 'Kg')]),
    ('Baked Japanese Lasagna', 'Baked Japanese Lasania', 'لازانيا يابانيه', '4.500',
     [('WNR-LASAGNA-SHEET', '4', 'Pcs'), ('WNR-BEEF', '0.150', 'Kg'), ('WNR-MOZZARELLA', '0.080', 'Kg'), ('WNR-CREAM', '0.050', 'Kg'), ('WNR-EGG', '1', 'Pcs')]),
    ('Lobster & Mushroom', 'Lobster & Mushroom', 'لوبستر بالمشروم', '8.500',
     [('WNR-LOBSTER', '0.180', 'Kg'), ('WNR-MUSHROOM', '0.080', 'Kg'), ('WNR-CREAM', '0.060', 'Kg')]),
    ('Miso Ramen', 'Miso Ramen', 'ميسو رامين', '3.200',
     [('WNR-UDON', '0.180', 'Kg'), ('WNR-MISO', '0.050', 'Kg'), ('b1221', '0.080', 'Kg'), ('WNR-MIXED-VEG', '0.050', 'Kg')]),
    ('French Fries', 'French Fries', 'بطاطا فرايز', '1.500',
     [('WNR-POTATO', '0.200', 'Kg')]),
    ('Chocolate Fondant', 'Chocolate Fondat', 'شوكولاتة فوندانت', '2.800',
     [('WNR-CHOCOLATE', '0.080', 'Kg'), ('WNR-BUTTER', '0.050', 'Kg'), ('WNR-EGG', '2', 'Pcs'), ('WNR-FLOUR', '0.030', 'Kg')]),
    ('Sora Iro Blue Sky', 'Sora Iro Blue Sky', 'بلو سكاي', '2.400',
     [('WNR-BLUE-SYRUP', '0.030', 'Kg'), ('WNR-SODA-WATER', '0.150', 'Kg'), ('WNR-LEMON', '0.020', 'Kg')]),
    ('Cranberry Akai Red', 'Cranberry Akai Red', 'كرانبيري اكاي', '2.200',
     [('WNR-CRANBERRY-JUICE', '0.150', 'Kg'), ('WNR-GRENADINE', '0.020', 'Kg'), ('WNR-SODA-WATER', '0.060', 'Kg')]),
    ('Mojito', 'Mojito', 'موهيتو', '2.000',
     [('WNR-MINT', '0.008', 'Kg'), ('WNR-LIME', '0.030', 'Kg'), ('WNR-SUGAR-SYRUP', '0.020', 'Kg'), ('WNR-SODA-WATER', '0.150', 'Kg')]),
    ('Mojito II', 'Mojito II', 'موهيتو 2', '2.300',
     [('WNR-MINT', '0.008', 'Kg'), ('WNR-LIME', '0.030', 'Kg'), ('WNR-SUGAR-SYRUP', '0.020', 'Kg'), ('WNR-STRAWBERRY-PUREE', '0.040', 'Kg'), ('WNR-SODA-WATER', '0.120', 'Kg')]),
    ('Ice Tea', 'Ice Tea', 'شاي مثلج', '1.500',
     [('WNR-ICE-TEA-BOTTLE', '1', 'Pcs')]),
    ('Perrier', 'Perrier', 'بيرييه', '1.800',
     [('WNR-PERRIER', '1', 'Pcs')]),
    ('Japanese Crepe', 'Japanese Crepe', 'كريب ياباني', '2.800',
     [('WNR-FLOUR', '0.060', 'Kg'), ('WNR-MILK', '0.080', 'Kg'), ('WNR-EGG', '1', 'Pcs'), ('WNR-CHOCOLATE', '0.040', 'Kg'), ('WNR-BANANA', '0.060', 'Kg')]),
    ('Coriander Lime', 'Corriander Lime', 'كوريندر لايم', '2.100',
     [('WNR-CORIANDER', '0.006', 'Kg'), ('WNR-LIME', '0.030', 'Kg'), ('WNR-SUGAR-SYRUP', '0.020', 'Kg'), ('WNR-SODA-WATER', '0.150', 'Kg')]),
    ('Bloody Lady', 'Bloody Lady', 'بلودي ليدي', '2.300',
     [('WNR-TOMATO-JUICE', '0.150', 'Kg'), ('WNR-LEMON', '0.015', 'Kg'), ('WNR-CORIANDER', '0.005', 'Kg')]),
    ('Pineapple Hinata Sunshine', 'Pineapple Hinata Sunshine', 'اناناس هيناتا', '2.400',
     [('WNR-PINEAPPLE', '0.060', 'Kg'), ('WNR-ORANGE-JUICE', '0.080', 'Kg'), ('WNR-SODA-WATER', '0.080', 'Kg')]),
    ('Ginger Ale', 'Ginger Ale', 'جنجر ال', '1.400',
     [('WNR-GINGER-ALE-CAN', '1', 'Pcs')]),
    ('Ginger Refresher', 'Ginger Refresher', 'جنجريل ريفريشـــر', '2.000',
     [('WNR-GINGER-SYRUP', '0.030', 'Kg'), ('WNR-LEMON', '0.020', 'Kg'), ('WNR-SODA-WATER', '0.150', 'Kg')]),
    ('Strawberries Mojito', 'Strawberries Mojito', 'موهيتو الفراولة', '2.400',
     [('WNR-MINT', '0.008', 'Kg'), ('WNR-LIME', '0.030', 'Kg'), ('WNR-STRAWBERRY-PUREE', '0.050', 'Kg'), ('WNR-SUGAR-SYRUP', '0.015', 'Kg'), ('WNR-SODA-WATER', '0.120', 'Kg')]),
    ('Shrimp Dumpling', 'Shrimp Dumpling', 'دمبلنج الروبيان', '3.300',
     [('WNR-SHRIMP', '0.100', 'Kg'), ('WNR-GYOZA-WRAP', '6', 'Pcs')]),
    ('Tom Yum Soup', 'Tum Yum Soup', 'شوربة تم يم', '2.100',
     [('WNR-SHRIMP', '0.070', 'Kg'), ('WNR-LEMONGRASS', '0.020', 'Kg'), ('WNR-COCONUT-MILK', '0.030', 'Kg')]),
    ('Crispy Kani', 'Crispy Kani', 'كاني مقرمش', '3.600',
     [('WNR-CRAB', '0.100', 'Kg'), ('WNR-TEMP-BATTER', '0.030', 'Kg')]),
    ('Chicken Lollipop', 'Chicken Lollipop', 'دجاج لولي بوب', '3.400',
     [('b1221', '0.180', 'Kg'), ('WNR-TEMP-BATTER', '0.030', 'Kg')]),
    ('Manchurian Lollipop', 'Manchurian Lollipop', 'دجاج منشورين لولي بوب', '3.600',
     [('b1221', '0.180', 'Kg'), ('WNR-TEMP-BATTER', '0.030', 'Kg'), ('WNR-CHILI-SAUCE', '0.020', 'Kg'), ('WNR-GARLIC', '0.010', 'Kg')]),
    ('Beef Tataki', 'Beef Tataki', 'لحم تاتاكي', '5.500',
     [('WNR-BEEF', '0.130', 'Kg'), ('WNR-SOY-SAUCE', '0.020', 'Kg'), ('WNR-GARLIC', '0.010', 'Kg')]),
    ('Garlic Edamame', 'Garlic Edamame', 'ادمامي بالثوم', '2.800',
     [('WNR-EDAMAME', '0.150', 'Kg'), ('WNR-GARLIC', '0.020', 'Kg')]),
    ('Shrimp Cocktail Small', 'Shrimp Cocktail S', 'روبيان كوكتيل صغير', '3.900',
     [('WNR-SHRIMP', '0.120', 'Kg')]),

    # single-protein "bracket" POS lines (only one variant sold in the
    # report) -- a standalone recipe is enough; no modifier group needed
    # since there's no other protein to disambiguate against.
    ('Sizzler Plate Beef', 'Sizzler Plate', 'طبق السيزلر', '5.800',
     [('WNR-BEEF', '0.200', 'Kg'), ('WNR-MIXED-VEG', '0.100', 'Kg')]),
    ('Crispy Lemon Chicken', 'Crispy Lemon', 'كريسبي بالليمون', '3.900',
     [('b1221', '0.180', 'Kg'), ('WNR-TEMP-BATTER', '0.030', 'Kg'), ('WNR-LEMON', '0.020', 'Kg')]),
    ('The Sweet The Chilli The Sour Chicken', 'The Sweet,The Chilli & The Sour', 'الحلو الحار و الحامض', '4.300',
     [('b1221', '0.180', 'Kg'), ('WNR-MIXED-VEG', '0.060', 'Kg'), ('WNR-CHILI-SAUCE', '0.020', 'Kg')]),
    ('Black Pepper Beef', 'Black Pepper Style', 'طريقة الفلفل الأسود', '4.900',
     [('WNR-BEEF', '0.180', 'Kg'), ('WNR-MIXED-VEG', '0.060', 'Kg'), ('WNR-GARLIC', '0.010', 'Kg')]),
    ('Salmon Teriyaki', 'Salmon Teriyaki', 'سالمون ترياكي', '6.200',
     [('WNR-SALMON', '0.220', 'Kg'), ('WNR-MIXED-VEG', '0.100', 'Kg'), ('WNR-SOY-SAUCE', '0.020', 'Kg')]),
    ('Mix Teppanyaki Angus Beef Prawn', 'Mix Teppanyaki 2', 'تيبانياكي مشكل', '7.500',
     [('WNR-ANGUS-BEEF', '0.150', 'Kg'), ('WNR-SHRIMP', '0.120', 'Kg'), ('WNR-MIXED-VEG', '0.100', 'Kg')]),
    ('Spicy Thai Noodles Veggie', 'Spicy Thai Noodles', 'نودلز تاي بالفلفل', '2.900',
     [('WNR-CN-NOODLES', '0.150', 'Kg'), ('WNR-MIXED-VEG', '0.100', 'Kg'), ('WNR-CHILI-SAUCE', '0.025', 'Kg'), ('WNR-LEMONGRASS', '0.010', 'Kg')]),
    ('Chinese Garlic Rice', 'Chinese Garlic Rice', 'أرز صيني بالثوم', '2.300',
     [('WNR-RICE', '0.150', 'Kg'), ('WNR-GARLIC', '0.020', 'Kg'), ('WNR-SOY-SAUCE', '0.010', 'Kg')]),
    ('Pineapple Rice Shrimp', 'Pineapple Rice', 'أرز بالأناناس', '3.600',
     [('WNR-RICE', '0.150', 'Kg'), ('WNR-PINEAPPLE', '0.060', 'Kg'), ('WNR-SHRIMP', '0.080', 'Kg')]),
    ('Robata Beef', 'Robata', 'روباتا', '5.200',
     [('WNR-BEEF', '0.200', 'Kg'), ('WNR-SOY-SAUCE', '0.020', 'Kg'), ('WNR-GARLIC', '0.010', 'Kg')]),
]

_MOD_DISHES = {'Chinese Fried Noodles', 'Japanese Fry Rice', 'Spicy Potato', 'Mongolian'}


def _ascii(s):
    return str(s).encode('ascii', 'replace').decode('ascii')


class Command(BaseCommand):
    help = 'Seed the WnR branch with a 15-dish demo menu (recipes + menu lines + a modifier group).'

    def add_arguments(self, parser):
        parser.add_argument('--publish', action='store_true',
                            help='Also publish each recipe to inventory-platform.')
        parser.add_argument('--branch', default='WnR', help='Branch name_en (default: WnR).')

    def _upsert_recipe(self, branch, units, name_en, pos_name, name_ar, price, ings):
        """Create/update a WnR DishRecipe + its ingredients. No MenuLine —
        callers add one only for the dish that actually sits on the menu
        (a variant-only recipe referenced solely via a modifier option
        never gets its own line)."""
        r = DishRecipe.objects.filter(name_en=name_en, branch_ref=branch, is_current=True).first()
        if r:
            r.ingredients.all().delete()
        else:
            r = DishRecipe(name_en=name_en, branch_ref=branch, is_current=True, version=1)
        r.name_ar = name_ar
        r.pos_item_name = pos_name
        r.selling_price = Decimal(price)
        r.include_labor_cost = False
        r.save()
        for j, (sku, qty, ucode) in enumerate(ings):
            DishRecipeIngredient.objects.create(
                recipe=r, item_sku=sku, item_name_snapshot=_ITEM_NAMES.get(sku, sku),
                quantity=Decimal(qty), unit=units[ucode], order=j)
        apply_cost(r)
        r.save()
        return r

    def _build_variant_family(self, branch, units, menu, order, group_name, group_name_ar,
                               base, variants, extra_options=()):
        """One POS item that's really N protein/flavor variants with distinct
        BOMs (Thai Rice Chicken/Plain/Prawn, Shanghai Broccoli Beef/Angus...).
        `base` = (name_en, pos_name, name_ar, price, ings, mods_string, delta) —
        published as the menu-facing dish AND as the option matching its own
        mods_string (self-referencing variant_recipe). `variants` = same tuple
        shape for the other options, each getting its own recipe (no MenuLine).
        `extra_options` = (mods_string, price_delta, variant_recipe) triples
        for options that reuse an already-built recipe (e.g. Ginger Ale under
        Soft Drinks) instead of a name/ings tuple.
        """
        b_name, b_pos, b_ar, b_price, b_ings, b_mods, b_delta = base
        base_recipe = self._upsert_recipe(branch, units, b_name, b_pos, b_ar, b_price, b_ings)
        MenuLine.objects.update_or_create(
            menu=menu, dish=base_recipe,
            defaults=dict(pos_name=b_pos, sort_order=order * 10, menu_price=Decimal(b_price)))

        group, _ = ModifierGroup.objects.get_or_create(
            name_en=group_name,
            defaults=dict(name_ar=group_name_ar, selection=ModifierSelection.SINGLE,
                          min_select=1, max_select=1))

        options = [(b_mods, b_delta, base_recipe)]
        built = [base_recipe]
        for i, (v_name, v_pos, v_ar, v_price, v_ings, v_mods, v_delta) in enumerate(variants):
            v_recipe = self._upsert_recipe(branch, units, v_name, v_pos or '', v_ar, v_price, v_ings)
            options.append((v_mods, v_delta, v_recipe))
            built.append(v_recipe)
        options.extend(extra_options)

        for i, (mods, delta, variant_recipe) in enumerate(options):
            ModifierOption.objects.update_or_create(
                group=group, pos_mods_string=mods,
                defaults=dict(name_en=mods, price_delta=Decimal(delta), kind=ModifierOptionKind.TYPE,
                              variant_recipe=variant_recipe, sort_order=i))
        DishModifierGroup.objects.get_or_create(
            dish=base_recipe, group=group, defaults=dict(default_role=ModifierRole.FORCED))

        self.stdout.write(_ascii(f'  {b_name:26s} cost={base_recipe.cost}  [family: {group_name}, '
                                 f'{len(options)} options]'))
        # variants first, base last: _publish_pos_modifiers (fired when the
        # base dish publishes, since that's what holds the DishModifierGroup)
        # needs every variant_recipe.inventory_recipe_id already set, or its
        # TYPE-option mapping is silently skipped as "not published yet".
        return built[1:] + built[:1]

    def handle(self, *args, **opts):
        try:
            branch = Branch.objects.get(name_en__iexact=opts['branch'])
        except Branch.DoesNotExist:
            raise CommandError(f'No branch "{opts["branch"]}". Available: '
                               f'{list(Branch.objects.values_list("name_en", flat=True))}')
        menu = Menu.objects.filter(branch=branch, is_active=True).first()
        if not menu:
            menu = Menu.objects.create(branch=branch, name=f'{branch.name_en} Menu')
            self.stdout.write(f'created menu for {branch.name_en}')

        units = {u.code: u for u in UnitScale.objects.all()}

        with transaction.atomic():
            grp, _ = ModifierGroup.objects.get_or_create(
                name_en='WnR Protein Choice',
                defaults=dict(name_ar='اختيار البروتين', selection=ModifierSelection.SINGLE,
                              min_select=1, max_select=1))
            for i, (nm, delta) in enumerate([('Chicken', '1.000'), ('Beef', '1.500'),
                                             ('Shrimp', '2.000'), ('Veggie', '0.000')]):
                ModifierOption.objects.update_or_create(
                    group=grp, name_en=nm,
                    defaults=dict(price_delta=Decimal(delta), kind=ModifierOptionKind.CHOICE,
                                  pos_mods_string=nm, sort_order=i))

            built = []
            for order, (name_en, pos_name, name_ar, price, ings) in enumerate(_DISHES):
                r = self._upsert_recipe(branch, units, name_en, pos_name, name_ar, price, ings)
                MenuLine.objects.update_or_create(
                    menu=menu, dish=r,
                    defaults=dict(pos_name=pos_name, sort_order=order * 10, menu_price=Decimal(price)))
                if name_en in _MOD_DISHES:
                    DishModifierGroup.objects.get_or_create(
                        dish=r, group=grp, defaults=dict(default_role=ModifierRole.FORCED))
                built.append(r)
                self.stdout.write(_ascii(f'  {name_en:26s} cost={r.cost}'
                                         + ('  [+modifier]' if name_en in _MOD_DISHES else '')))

            next_order = len(_DISHES)

            # -- Shanghai Broccoli: Beef (base) / Angus Beef --
            built += self._build_variant_family(
                branch, units, menu, next_order,
                'Shanghai Broccoli Protein', 'اختيار اللحم - شانغهاي بروكلي',
                base=('Shanghai Broccoli Beef', 'Shanghai Broccoli', 'شانغهاي بروكلي', '4.700',
                      [('WNR-BEEF', '0.180', 'Kg'), ('WNR-BROCCOLI', '0.120', 'Kg'),
                       ('WNR-GARLIC', '0.010', 'Kg'), ('WNR-SOY-SAUCE', '0.020', 'Kg')],
                      'Beef', '0.000'),
                variants=[
                    ('Shanghai Broccoli Angus Beef', '', 'شانغهاي بروكلي انجس بيف', '5.500',
                     [('WNR-ANGUS-BEEF', '0.180', 'Kg'), ('WNR-BROCCOLI', '0.120', 'Kg'),
                      ('WNR-GARLIC', '0.010', 'Kg'), ('WNR-SOY-SAUCE', '0.020', 'Kg')],
                     'ANGUS Beef', '0.800'),
                ])
            next_order += 1

            # -- Thai Rice: Plain (base) / Chicken / Prawn --
            built += self._build_variant_family(
                branch, units, menu, next_order,
                'Thai Rice Protein', 'اختيار البروتين - أرز تايلندي',
                base=('Thai Rice Plain', 'Thai Rice', 'أرز تايلندي', '2.400',
                      [('WNR-RICE', '0.150', 'Kg'), ('WNR-CHILI-SAUCE', '0.015', 'Kg'), ('WNR-GARLIC', '0.010', 'Kg')],
                      'Plain', '0.000'),
                variants=[
                    ('Thai Rice Chicken', '', 'أرز تايلندي بالدجاج', '2.900',
                     [('WNR-RICE', '0.150', 'Kg'), ('b1221', '0.100', 'Kg'),
                      ('WNR-CHILI-SAUCE', '0.015', 'Kg'), ('WNR-GARLIC', '0.010', 'Kg')],
                     'Chicken', '0.300'),
                    ('Thai Rice Prawn', '', 'أرز تايلندي بالروبيان', '3.400',
                     [('WNR-RICE', '0.150', 'Kg'), ('WNR-SHRIMP', '0.100', 'Kg'),
                      ('WNR-CHILI-SAUCE', '0.015', 'Kg'), ('WNR-GARLIC', '0.010', 'Kg')],
                     'Prawn', '0.600'),
                ])
            next_order += 1

            # -- Mineral Water: Small (base) / Big / Sparkling / T Water (reuses Small) --
            built += self._build_variant_family(
                branch, units, menu, next_order,
                'Mineral Water Size', 'اختيار الحجم - مياه معدنيه',
                base=('Mineral Water Small', 'Mineral Water', 'مياه معدنيه', '0.500',
                      [('WNR-WATER-SM', '1', 'Pcs')], 'Small', '0.000'),
                variants=[
                    ('Mineral Water Big', '', 'مياه معدنية كبيرة', '0.800',
                     [('WNR-WATER-LG', '1', 'Pcs')], 'Big', '0.300'),
                    ('Mineral Water Sparkling', '', 'مياه فوارة', '1.200',
                     [('WNR-WATER-SPARK', '1', 'Pcs')], 'Sparkling', '0.700'),
                ],
                extra_options=[('T Water', '0.000', None)],
            )
            # 'T Water' reuses the base (Small) recipe -- patch it in now that
            # base_recipe exists (extra_options above can't see it yet).
            mw_group = ModifierGroup.objects.get(name_en='Mineral Water Size')
            mw_base = built[-1]  # base is last of the 3 objects just appended (variants first)
            ModifierOption.objects.filter(group=mw_group, pos_mods_string='T Water').update(
                variant_recipe=mw_base)
            next_order += 1

            # -- Juice: Orange (base) / Lemon Mint --
            # the modifier string carries the report's own EN/AR text verbatim --
            # exact-match is required, there is no bilingual splitting for it.
            built += self._build_variant_family(
                branch, units, menu, next_order,
                'Juice Flavor', 'اختيار النكهة - عصير طازج',
                base=('Fresh Orange Juice', 'Juice', 'عصير طازج', '1.800',
                      [('WNR-ORANGE-JUICE', '0.200', 'Kg')], 'Orange JUice', '0.000'),
                variants=[
                    ('Fresh Lemon Mint Juice', '', 'عصير الليمون بالنعناع', '1.800',
                     [('WNR-LEMON', '0.060', 'Kg'), ('WNR-MINT', '0.010', 'Kg'), ('WNR-SUGAR-SYRUP', '0.020', 'Kg')],
                     'Lemon Mint Juice/عصير الليمون بالنعناع', '0.000'),
                ])
            next_order += 1

            # -- Soft Drinks: cross-links to the standalone Ginger Ale recipe
            # built earlier in _DISHES rather than duplicating it.
            ginger_ale = DishRecipe.objects.get(name_en='Ginger Ale', branch_ref=branch, is_current=True)
            built += self._build_variant_family(
                branch, units, menu, next_order,
                'Soft Drink Flavor', 'اختيار المشروب الغازي',
                base=('Soft Drinks', 'Soft Drinks', 'مشروبات غازيه', '1.400',
                      [('WNR-COKE-CAN', '1', 'Pcs')], 'Coke', '0.000'),
                variants=[],
                extra_options=[('Ginger Ale', '0.000', ginger_ale)],
            )

        self.stdout.write(self.style.SUCCESS(f'{len(built)} WnR recipes on the menu.'))

        if not opts['publish']:
            self.stdout.write('run again with --publish to push them to inventory-platform.')
            return

        from apps.cookbook.publishing import publish_dish_recipe, RecipePublishError
        from apps.integrations.inventory_client import InventoryClient
        client = InventoryClient()
        ok = fail = 0
        for r in built:
            try:
                if not r.inventory_recipe_id:
                    row = client.find_dish_recipe(r.name_en)
                    if row:
                        r.inventory_recipe_id = str(row['id'])
                        r.save(update_fields=['inventory_recipe_id'])
                publish_dish_recipe(r, client=client)
                ok += 1
                self.stdout.write(_ascii(f'  published {r.name_en:26s} -> {r.inventory_recipe_id}'))
            except RecipePublishError as e:
                fail += 1
                self.stdout.write(self.style.WARNING(_ascii(f'  FAILED {r.name_en}: {e}')))
        self.stdout.write(self.style.SUCCESS(f'publish: {ok} ok, {fail} failed'))
