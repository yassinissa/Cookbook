"""
Weekly cost-report digest — the payload builder, the subscription endpoint,
the public unsubscribe link, and the send command (opt-out enrolment, resend
guard, empty-digest skip).
"""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Capability, Role
from apps.cookbook.models import (
    Branch, DishPriceHistory, DishRecipe, DigestSubscription,
)
from apps.cookbook.reporting import build_weekly_digest

User = get_user_model()


def make_dish(name, code, *, cost, price, branch=None, fcp=None, issues=None):
    bd = {}
    if fcp is not None:
        bd['food_cost_pct'] = str(fcp)
    if issues:
        bd['issues'] = issues
    return DishRecipe.objects.create(
        name_en=name, recipe_code=code,
        branch=branch.name_en if branch else '', branch_ref=branch,
        cost=Decimal(cost), selling_price=Decimal(price), cost_breakdown=bd,
    )


class DigestBuilderTests(APITestCase):
    def setUp(self):
        self.dine = Branch.objects.create(name_en='Dine', code='DINE', sort_order=1)
        self.luma = Branch.objects.create(name_en='Luma', code='LUMA', sort_order=2)
        make_dish('Meat Tikka', 'T1', cost='5.6', price='7.0', branch=self.dine, fcp='80.0')
        make_dish('Tabbouleh', 'T2', cost='0.8', price='3.0', branch=self.dine, fcp='26.7')
        make_dish('Molokhia', 'T3', cost='1.5', price='6.0', branch=self.dine, fcp='25.0',
                  issues=[{'sku': 'B591', 'status': 'no_conversion'}])
        make_dish('Luma Fattoush', 'L1', cost='2.0', price='4.0', branch=self.luma, fcp='50.0')
        self.admin = User.objects.create_superuser('boss', password='x', email='boss@x.com')

    def test_superuser_digest_covers_all_branches_sorted_by_pct(self):
        d = build_weekly_digest(self.admin)
        self.assertEqual(d['branches'], 'all')
        self.assertEqual(d['dish_count'], 4)
        self.assertEqual([o['name_en'] for o in d['over_target']], ['Meat Tikka', 'Luma Fattoush'])
        self.assertEqual(d['gaps'][0]['name_en'], 'Molokhia')
        self.assertEqual(d['gaps'][0]['issues'], ['B591: no_conversion'])

    def test_branch_scoped_user_only_sees_their_branch(self):
        u = User.objects.create_user('cook', password='x', email='c@x.com')
        u.profile.role = Role.objects.get(name='Cost Controller')
        u.profile.scope_overridden = True
        u.profile.save()
        u.profile.branches.set([self.dine])
        d = build_weekly_digest(u)
        self.assertEqual(d['branches'], ['Dine'])
        self.assertEqual([o['name_en'] for o in d['over_target']], ['Meat Tikka'])

    def test_user_without_costing_view_gets_nothing(self):
        u = User.objects.create_user('prep', password='x', email='p@x.com')
        u.profile.role = Role.objects.get(name='Prep Cook')   # no costing.view
        u.profile.save()
        self.assertIsNone(build_weekly_digest(u))

    def test_nothing_to_report_returns_none(self):
        DishRecipe.objects.all().delete()
        make_dish('All Good', 'G1', cost='0.8', price='3.0', branch=self.dine, fcp='26.0')
        self.assertIsNone(build_weekly_digest(self.admin))

    def test_movers_from_price_history(self):
        dish = DishRecipe.objects.get(name_en='Tabbouleh')
        now = timezone.now()
        DishPriceHistory.objects.create(dish_recipe=dish, cost=Decimal('0.700'), selling_price=Decimal('3.0'))
        DishPriceHistory.objects.filter(dish_recipe=dish).update(created_at=now - timedelta(days=10))
        DishPriceHistory.objects.create(dish_recipe=dish, cost=Decimal('0.900'), selling_price=Decimal('3.0'))
        d = build_weekly_digest(self.admin)
        movers = {m['name_en']: m for m in d['movers']}
        self.assertIn('Tabbouleh', movers)
        self.assertEqual(movers['Tabbouleh']['from_cost'], '0.700')
        self.assertEqual(movers['Tabbouleh']['to_cost'], '0.900')


class DigestSubscriptionEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_superuser('boss', password='x', email='boss@x.com')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(self.user)

    def test_get_defaults_to_weekly_then_patch(self):
        g = self.client.get('/api/cookbook/digest-subscription/')
        self.assertEqual(g.data, {'enrolled': True, 'cadence': 'weekly', 'last_sent_at': None})

        p = self.client.patch('/api/cookbook/digest-subscription/', {'cadence': 'off'}, format='json')
        self.assertEqual(p.data['cadence'], 'off')
        self.assertTrue(DigestSubscription.objects.filter(user=self.user, cadence='off').exists())

        self.assertEqual(
            self.client.patch('/api/cookbook/digest-subscription/', {'cadence': 'daily'},
                              format='json').status_code, 400)

    def test_unsubscribe_link_is_public_and_idempotent(self):
        sub = DigestSubscription.objects.create(user=self.user)
        url = f'/api/cookbook/public/digest/unsubscribe/{sub.unsubscribe_token}/'
        r = APIClient().get(url)                       # no auth
        self.assertEqual(r.status_code, 200)
        self.assertIn(b'unsubscribed', r.content)
        sub.refresh_from_db()
        self.assertEqual(sub.cadence, 'off')
        self.assertEqual(APIClient().get(url).status_code, 200)   # again, still fine

        self.assertEqual(
            APIClient().get('/api/cookbook/public/digest/unsubscribe/'
                            '00000000-0000-0000-0000-000000000000/').status_code, 404)


class SendCostDigestCommandTests(APITestCase):
    def setUp(self):
        self.dine = Branch.objects.create(name_en='Dine', code='DINE', sort_order=1)
        make_dish('Meat Tikka', 'T1', cost='5.6', price='7.0', branch=self.dine, fcp='80.0')
        self.cc = User.objects.create_user('cc', password='x', email='cc@x.com')
        self.cc.profile.role = Role.objects.get(name='Cost Controller')
        self.cc.profile.save()
        self.prep = User.objects.create_user('prep', password='x', email='prep@x.com')
        self.prep.profile.role = Role.objects.get(name='Prep Cook')
        self.prep.profile.save()

    def test_sends_only_to_costing_users_and_stamps(self):
        call_command('send_cost_digest')
        self.assertEqual([m.to for m in mail.outbox], [['cc@x.com']])
        self.assertEqual(len(mail.outbox[0].alternatives), 1)     # html part
        sub = DigestSubscription.objects.get(user=self.cc)
        self.assertIsNotNone(sub.last_sent_at)

    def test_resend_guard(self):
        call_command('send_cost_digest')
        mail.outbox.clear()
        call_command('send_cost_digest')                          # too soon
        self.assertEqual(mail.outbox, [])
        call_command('send_cost_digest', '--force')
        self.assertEqual(len(mail.outbox), 1)

    def test_opt_out_is_respected(self):
        DigestSubscription.objects.create(user=self.cc, cadence='off')
        call_command('send_cost_digest')
        self.assertEqual(mail.outbox, [])

    def test_dry_run_sends_nothing(self):
        call_command('send_cost_digest', '--dry-run')
        self.assertEqual(mail.outbox, [])
        self.assertFalse(DigestSubscription.objects.filter(user=self.cc, last_sent_at__isnull=False).exists())
