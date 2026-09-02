"""
NOTE — Menus

A Menu is the set of dishes a branch actually offers, with a per-branch menu
price that may differ from the recipe's own selling_price. Mirrors the source
workbook's per-branch "Menu" sheets (Dine Menu, Luma Menu, …).

MenuSnapshot / MenuSnapshotLine replace the manual "The Menu Copy" →
"Menu History" copy-paste: a snapshot freezes every line's cost + price + food
cost % at a point in time, so cost/price trends can be charted.

MenuPeriod / MenuPeriodLine layer *dated* changes over a branch's base menu — a
seasonal range, a recurring daily special, a one-off event. A period never
copies the menu; it carries a short list of operations (add / remove / reprice
/ swap photo / rewrite copy) against it. apps.cookbook.specials.resolve_menu
applies every period active on a given date, in precedence order, to produce
the effective menu. This is NOT MenuSnapshot (a cost freeze for trend charts)
and NOT MenuCategory (a customer-facing menu section).
"""
from django.db import models

from apps.core.models import BaseModel
from .recipes import DishRecipe
from .reference import Branch


class Menu(BaseModel):
    branch          = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name='menus')
    name            = models.CharField(max_length=120, blank=True,
                        help_text='Defaults to "<Branch> Menu".')
    name_ar         = models.CharField(max_length=120, blank=True)
    notes           = models.TextField(blank=True)
    last_snapshot_at = models.DateTimeField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=['branch'], condition=models.Q(is_active=True),
                                    name='one_active_menu_per_branch'),
        ]

    def __str__(self):
        return self.name or f'{self.branch.name_en} Menu'


class MenuLine(BaseModel):
    menu         = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name='lines')
    dish         = models.ForeignKey(DishRecipe, on_delete=models.PROTECT, related_name='menu_lines')
    menu_price   = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True,
                     help_text='Price on this branch menu. Falls back to the recipe selling_price.')
    pos_name     = models.CharField(max_length=255, blank=True)
    image_url    = models.URLField(blank=True)
    # Customer-facing menu copy for this dish on this branch's menu — distinct
    # from DishRecipe.taste_profile (internal shorthand) and pos_name (POS
    # match key). A MenuPeriod can override it (op='replace_copy').
    menu_description_en = models.TextField(blank=True)
    menu_description_ar = models.TextField(blank=True)
    sort_order   = models.PositiveIntegerField(default=0)
    is_available = models.BooleanField(default=True)

    class Meta(BaseModel.Meta):
        ordering = ['sort_order', 'id']
        unique_together = ['menu', 'dish']

    def __str__(self):
        return f'{self.dish.name_en} @ {self.menu}'

    @property
    def effective_price(self):
        return self.menu_price if self.menu_price is not None else self.dish.selling_price


class MenuSnapshot(BaseModel):
    menu     = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name='snapshots')
    taken_by = models.CharField(max_length=255, blank=True)
    label    = models.CharField(max_length=120, blank=True)

    class Meta(BaseModel.Meta):
        pass

    def __str__(self):
        return f'{self.menu} snapshot @ {self.created_at:%Y-%m-%d %H:%M}'


class MenuSnapshotLine(BaseModel):
    snapshot       = models.ForeignKey(MenuSnapshot, on_delete=models.CASCADE, related_name='lines')
    dish_name      = models.CharField(max_length=255)
    recipe_code    = models.CharField(max_length=30, blank=True)
    category       = models.CharField(max_length=100, blank=True)
    cost           = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    menu_price     = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    food_cost_pct  = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    class Meta(BaseModel.Meta):
        ordering = ['dish_name']


# ── Dated menu variations (specials calendar) ───────────────────────────────

class MenuPeriodKind(models.TextChoices):
    SEASONAL      = 'seasonal',      'Seasonal'
    DAILY_SPECIAL = 'daily_special', 'Daily special'
    EVENT         = 'event',         'Event'


# Higher rank wins when several periods cover one date. An event overrides a
# daily special overrides a seasonal menu.
_KIND_RANK = {
    MenuPeriodKind.EVENT: 3,
    MenuPeriodKind.DAILY_SPECIAL: 2,
    MenuPeriodKind.SEASONAL: 1,
}

WEEKDAY_ALL = 0b1111111  # Mon(bit 0) … Sun(bit 6)


class MenuPeriod(BaseModel):
    """A dated window of changes over one branch's Menu. Carries operations,
    not a copy of the menu — see MenuPeriodLine + apps.cookbook.specials."""
    menu         = models.ForeignKey(Menu, on_delete=models.CASCADE, related_name='periods')
    kind         = models.CharField(max_length=15, choices=MenuPeriodKind.choices)
    name_en      = models.CharField(max_length=120)
    name_ar      = models.CharField(max_length=120, blank=True)
    starts_on    = models.DateField()
    ends_on      = models.DateField(null=True, blank=True, help_text='Blank = open-ended.')
    weekday_mask = models.PositiveSmallIntegerField(default=WEEKDAY_ALL,
                     help_text='Which weekdays the period is active. Bit 0 = Monday … bit 6 = '
                               'Sunday; 127 = every day. Lets a "Friday special" recur.')
    is_live      = models.BooleanField(default=True,
                     help_text='Uncheck to hold the period as a draft the resolver ignores.')
    notes        = models.TextField(blank=True)

    class Meta(BaseModel.Meta):
        ordering = ['-starts_on', 'name_en']

    def __str__(self):
        return f'{self.name_en} ({self.get_kind_display()})'

    @property
    def rank(self):
        return _KIND_RANK.get(self.kind, 0)

    def covers(self, on):
        """True if this period is active on the given date."""
        if not self.is_live or on < self.starts_on:
            return False
        if self.ends_on and on > self.ends_on:
            return False
        return bool(self.weekday_mask & (1 << on.weekday()))


class MenuPeriodOp(models.TextChoices):
    ADD           = 'add',           'Add dish'
    REMOVE        = 'remove',        'Remove dish'
    REPRICE       = 'reprice',       'Change price'
    REPLACE_PHOTO = 'replace_photo', 'Swap photo'
    REPLACE_COPY  = 'replace_copy',  'Rewrite description'


class MenuPeriodLine(BaseModel):
    """One operation a MenuPeriod performs against the base menu."""
    period        = models.ForeignKey(MenuPeriod, on_delete=models.CASCADE, related_name='lines')
    dish          = models.ForeignKey(DishRecipe, on_delete=models.PROTECT, related_name='+')
    op            = models.CharField(max_length=15, choices=MenuPeriodOp.choices)
    menu_price    = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True,
                      help_text='For add / reprice.')
    image_url     = models.URLField(blank=True, help_text='For add / replace_photo.')
    description_en = models.TextField(blank=True, help_text='For add / replace_copy.')
    description_ar = models.TextField(blank=True)
    pos_name      = models.CharField(max_length=255, blank=True, help_text='For add.')
    sort_order    = models.PositiveIntegerField(default=0)

    class Meta(BaseModel.Meta):
        ordering = ['sort_order', 'id']
        unique_together = ['period', 'dish', 'op']

    def __str__(self):
        return f'{self.get_op_display()}: {self.dish.name_en}'
