"""
Branch Staff / Branch Manager / Prep Kitchen Staff / Prep Kitchen Manager —
the view-only-vs-full-CRUD-incl-delete split, each scoped to exactly one
branch or one prep kitchen. These roles back the staff-facing Kitchen screen
(view-only) and the "admin experience narrowed to one branch/kitchen"
manager story.
"""
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Role
from apps.cookbook.models import Branch, DishRecipe, PrepKitchen, ProductionRecipe, Section, UnitScale

User = get_user_model()


def scoped_user(role_name, *, branches=(), prep_kitchens=()):
    u = User.objects.create_user(f'{role_name.lower().replace(" ", "_")}_{User.objects.count()}', password='x')
    p = u.profile
    p.role = Role.objects.get(name=role_name)
    p.scope_overridden = True
    p.save()
    p.branches.set(branches)
    p.prep_kitchens.set(prep_kitchens)
    return u


def api(user):
    c = APIClient(HTTP_ACCEPT='application/json')
    c.force_authenticate(user)
    return c


class BranchStaffAndManagerTests(APITestCase):
    def setUp(self):
        self.section = Section.objects.create(name='Grill', avg_monthly_salary=Decimal('300'))
        self.dine = Branch.objects.create(name_en='Dine', sort_order=1)
        self.luma = Branch.objects.create(name_en='Luma', sort_order=2)
        self.dine_dish = DishRecipe.objects.create(
            name_en='Dine Dish', recipe_code='D1', branch_ref=self.dine, section=self.section,
            selling_price=Decimal('3.000'), cost=Decimal('1.000'),
        )
        self.luma_dish = DishRecipe.objects.create(
            name_en='Luma Dish', recipe_code='L1', branch_ref=self.luma, section=self.section,
            selling_price=Decimal('3.000'), cost=Decimal('1.000'),
        )

    def test_branch_staff_can_view_but_not_edit_or_delete_own_branch_dish(self):
        c = api(scoped_user('Branch Staff', branches=[self.dine]))
        self.assertEqual(c.get(f'/api/cookbook/dish-recipes/{self.dine_dish.id}/').status_code, 200)
        self.assertEqual(c.patch(f'/api/cookbook/dish-recipes/{self.dine_dish.id}/', {'name_en': 'x'}).status_code, 403)
        self.assertEqual(c.delete(f'/api/cookbook/dish-recipes/{self.dine_dish.id}/').status_code, 403)

    def test_branch_staff_cannot_see_other_brand_dish(self):
        c = api(scoped_user('Branch Staff', branches=[self.dine]))
        self.assertEqual(c.get(f'/api/cookbook/dish-recipes/{self.luma_dish.id}/').status_code, 404)

    @mock.patch('apps.cookbook.services.InventoryClient')
    def test_branch_manager_can_edit_and_delete_own_branch_dish(self, mock_client):
        mock_client.return_value.get_items.return_value = []
        c = api(scoped_user('Branch Manager', branches=[self.dine]))
        resp = c.patch(f'/api/cookbook/dish-recipes/{self.dine_dish.id}/', {'notes': 'updated'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(c.delete(f'/api/cookbook/dish-recipes/{self.dine_dish.id}/').status_code, 204)

    def test_branch_manager_cannot_touch_other_brand_dish(self):
        c = api(scoped_user('Branch Manager', branches=[self.dine]))
        self.assertEqual(c.get(f'/api/cookbook/dish-recipes/{self.luma_dish.id}/').status_code, 404)
        self.assertEqual(c.patch(f'/api/cookbook/dish-recipes/{self.luma_dish.id}/', {'notes': 'x'}).status_code, 404)
        self.assertEqual(c.delete(f'/api/cookbook/dish-recipes/{self.luma_dish.id}/').status_code, 404)


class PrepKitchenStaffAndManagerTests(APITestCase):
    def setUp(self):
        self.g = UnitScale.objects.create(code='g', description='g', dimension='mass', factor_to_canonical=1)
        self.sauce = PrepKitchen.objects.get(name_en='Sauce')
        self.bread = PrepKitchen.objects.get(name_en='Bread')
        self.sauce_recipe = ProductionRecipe.objects.create(
            name_en='Sauce Batch', recipe_code='S1', prep_kitchen_ref=self.sauce,
            output_item_sku='SKU-1', output_qty=Decimal('1.000'), output_unit=self.g, cost=Decimal('0.5'),
        )
        self.bread_recipe = ProductionRecipe.objects.create(
            name_en='Bread Batch', recipe_code='B1', prep_kitchen_ref=self.bread,
            output_item_sku='SKU-2', output_qty=Decimal('1.000'), output_unit=self.g, cost=Decimal('0.5'),
        )

    def test_prep_kitchen_staff_can_view_but_not_edit_or_delete_own_kitchen_recipe(self):
        c = api(scoped_user('Prep Kitchen Staff', prep_kitchens=[self.sauce]))
        self.assertEqual(c.get(f'/api/cookbook/production-recipes/{self.sauce_recipe.id}/').status_code, 200)
        self.assertEqual(
            c.patch(f'/api/cookbook/production-recipes/{self.sauce_recipe.id}/', {'name_en': 'x'}).status_code, 403)
        self.assertEqual(c.delete(f'/api/cookbook/production-recipes/{self.sauce_recipe.id}/').status_code, 403)

    def test_prep_kitchen_staff_cannot_see_other_kitchen_recipe(self):
        c = api(scoped_user('Prep Kitchen Staff', prep_kitchens=[self.sauce]))
        self.assertEqual(c.get(f'/api/cookbook/production-recipes/{self.bread_recipe.id}/').status_code, 404)

    @mock.patch('apps.cookbook.services.InventoryClient')
    def test_prep_kitchen_manager_can_edit_and_delete_own_kitchen_recipe(self, mock_client):
        mock_client.return_value.get_items.return_value = []
        c = api(scoped_user('Prep Kitchen Manager', prep_kitchens=[self.sauce]))
        resp = c.patch(f'/api/cookbook/production-recipes/{self.sauce_recipe.id}/', {'notes': 'updated'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(c.delete(f'/api/cookbook/production-recipes/{self.sauce_recipe.id}/').status_code, 204)

    def test_prep_kitchen_manager_cannot_touch_other_kitchen_recipe(self):
        c = api(scoped_user('Prep Kitchen Manager', prep_kitchens=[self.sauce]))
        self.assertEqual(c.get(f'/api/cookbook/production-recipes/{self.bread_recipe.id}/').status_code, 404)
        self.assertEqual(
            c.patch(f'/api/cookbook/production-recipes/{self.bread_recipe.id}/', {'notes': 'x'}).status_code, 404)
        self.assertEqual(c.delete(f'/api/cookbook/production-recipes/{self.bread_recipe.id}/').status_code, 404)
