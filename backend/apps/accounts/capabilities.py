"""
The capability catalogue — the single source of truth for what a permission
*is*. Roles bundle these; a user's profile can grant extras or deny some.

`code` is what the frontend `can(...)` checks and what DRF permission classes
reference. `group` drives the grouped checklists in the admin UI. Add a
capability here, then run `manage.py sync_capabilities` (a migration also runs
it) to create/update the DB rows the M2M relations point at.

Keep codes stable — they are referenced across the frontend, tests and data.
"""

# (code, label, group)
CAPABILITIES = [
    # Dashboard
    ('dashboard.view',      'View the dashboard',                'Dashboard'),

    # Dish recipes
    ('dish.view',           'View dish recipes',                 'Dish recipes'),
    ('dish.edit',           'Create & edit dish recipes',        'Dish recipes'),
    ('dish.delete',         'Delete dish recipes',               'Dish recipes'),
    ('recipe.history',      'View version history & diffs',      'Dish recipes'),

    # Production recipes
    ('production.view',     'View production recipes',           'Production recipes'),
    ('production.edit',     'Create & edit production recipes',  'Production recipes'),
    ('production.delete',   'Delete production recipes',         'Production recipes'),

    # Publishing to inventory-platform
    ('recipe.publish',      'Publish recipes to inventory-platform', 'Publishing'),

    # Menus & branches
    ('menu.view',           'View branch menus',                 'Menus'),
    ('menu.edit',           'Edit menu lines & build menus',     'Menus'),
    ('menu.snapshot',       'Take menu cost snapshots',          'Menus'),
    ('menu.publish',        'Publish the public QR / print menu', 'Menus'),

    # QA / QC standards
    ('standard.view',       'View QA / QC dish standards',       'QA standards'),
    ('standard.edit',       'Create & edit QA / QC standards',   'QA standards'),

    # Costing
    ('costing.view',        'See cost, price & margin figures',  'Costing'),
    ('costing.recalculate', 'Recalculate recipe cost',           'Costing'),

    # Inventory
    ('inventory.view',      'Browse inventory items',            'Inventory'),

    # Nutrition & allergens
    ('nutrition.view',      'View nutrition & allergen roll-ups','Nutrition'),

    # Documents
    ('document.export',     'Export / print recipe documents',   'Documents'),

    # POS
    ('pos.manage',          'Manage POS modifiers & cross-check','POS'),

    # Activity
    ('activity.view',       'View the company change log',       'Activity'),

    # Administration
    ('admin.users',         'Manage users & assignments',        'Administration'),
    ('admin.roles',         'Manage roles & capabilities',       'Administration'),
]

CAPABILITY_CODES = [c for c, _, _ in CAPABILITIES]
CAPABILITY_GROUPS = list(dict.fromkeys(g for _, _, g in CAPABILITIES))


# ── built-in roles (seeded by a data migration; admins can add more) ─────────
# capability list "*" means every code.
SYSTEM_ROLES = [
    {
        'name': 'Administrator',
        'description': 'Full access to everything, including user & role management.',
        'capabilities': '*',
        'grants_all_branches': True,
        'grants_all_prep_kitchens': True,
    },
    {
        'name': 'Executive Chef',
        'description': 'Authors and approves recipes across the group.',
        'capabilities': [
            'dashboard.view', 'dish.view', 'dish.edit', 'dish.delete', 'recipe.history',
            'production.view', 'production.edit', 'production.delete',
            'menu.view', 'menu.edit', 'menu.snapshot', 'menu.publish',
            'standard.view', 'standard.edit',
            'costing.view', 'costing.recalculate', 'inventory.view', 'nutrition.view',
            'document.export', 'activity.view', 'recipe.publish',
        ],
        'grants_all_branches': True,
        'grants_all_prep_kitchens': True,
    },
    {
        'name': 'QA Manager',
        'description': 'Owns the QA / QC dish standards; reads recipes.',
        'capabilities': [
            'dashboard.view', 'dish.view', 'recipe.history', 'production.view',
            'menu.view', 'standard.view', 'standard.edit', 'nutrition.view',
            'inventory.view', 'activity.view',
        ],
        'grants_all_branches': True,
        'grants_all_prep_kitchens': True,
    },
    {
        'name': 'Cost Controller',
        'description': 'Owns costing and pricing; reads everything.',
        'capabilities': [
            'dashboard.view', 'dish.view', 'recipe.history', 'production.view',
            'menu.view', 'menu.snapshot', 'standard.view', 'nutrition.view',
            'costing.view', 'costing.recalculate', 'inventory.view',
            'document.export', 'activity.view',
        ],
        'grants_all_branches': True,
        'grants_all_prep_kitchens': True,
    },
    {
        'name': 'Restaurant Cook',
        'description': 'Authors dish recipes for their own branch only.',
        'capabilities': [
            'dashboard.view', 'dish.view', 'dish.edit', 'recipe.history',
            'menu.view', 'inventory.view', 'nutrition.view', 'production.view',
        ],
        'grants_all_branches': False,
        'grants_all_prep_kitchens': False,
    },
    {
        'name': 'Prep Cook',
        'description': 'Authors production recipes for their own prep kitchen only.',
        'capabilities': [
            'dashboard.view', 'production.view', 'production.edit', 'recipe.history',
            'inventory.view', 'nutrition.view',
        ],
        'grants_all_branches': False,
        'grants_all_prep_kitchens': False,
    },
]
