"""
Modifier pick rules ("Customer picks") — the preset a stored min/max reads as,
the suggestion from option kinds, the mixed-group warning, `selection` derived
from the maximum on write, and the readiness feed's `rule_issues`.
"""
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from rest_framework.test import APIClient, APITestCase

from apps.cookbook import modifier_rules as mr
from apps.cookbook.models import ModifierGroup, ModifierOption

User = get_user_model()


class PickRuleTests(SimpleTestCase):
    def test_presets(self):
        self.assertEqual(mr.pick_rule(1, 1), 'exactly')
        self.assertEqual(mr.pick_rule(3, 3), 'exactly')         # the import's "pick 3"
        self.assertEqual(mr.pick_rule(0, 1), 'optional_one')
        self.assertEqual(mr.pick_rule(0, 4), 'up_to')
        self.assertEqual(mr.pick_rule(0, None), 'any')
        self.assertEqual(mr.pick_rule(1, 3), 'range')
        self.assertEqual(mr.pick_rule(2, None), 'range')

    def test_suggestion_follows_kinds(self):
        self.assertIsNone(mr.suggested_rule([]))
        self.assertEqual(mr.suggested_rule(['choice', 'type'])['rule'], 'exactly')
        self.assertEqual(mr.suggested_rule(['addon'])['rule'], 'any')
        self.assertEqual(mr.suggested_rule(['instruction', 'addon'])['rule'], 'any')

    def test_mixed_single_pick(self):
        # pick-one over a protein + an extra + a removal: one of the three, never all
        issues = mr.rule_issues(1, 1, ['type', 'addon', 'instruction'])
        self.assertEqual(issues, [{'code': 'mixed_single_pick',
                                   'families': ['pick', 'extra', 'instruction']}])
        self.assertEqual(mr.rule_issues(1, 1, ['choice', 'type']), [])     # one question
        self.assertEqual(mr.rule_issues(0, 1, ['addon', 'addon']), [])     # "one sauce, optional"
        self.assertEqual(mr.rule_issues(0, None, ['type', 'addon']), [])   # several allowed

    def test_min_over_options(self):
        self.assertEqual(mr.rule_issues(3, 3, ['choice', 'choice'])[0]['code'], 'min_over_options')
        self.assertEqual(mr.rule_issues(2, 2, ['choice', 'choice']), [])


class PickRuleApiTests(APITestCase):
    def setUp(self):
        admin = User.objects.create_superuser('boss', password='x', email='b@x.com')
        self.client = APIClient(HTTP_ACCEPT='application/json')
        self.client.force_authenticate(admin)

    def _create(self, **over):
        body = {
            'name_en': 'Burrito', 'selection': 'multi', 'min_select': 1, 'max_select': 1,
            'options': [
                {'name_en': 'Chicken', 'kind': 'choice', 'no_consumption_impact': True},
                {'name_en': 'Extra Cheese', 'kind': 'addon', 'no_consumption_impact': True},
                {'name_en': 'No Onion', 'kind': 'instruction', 'no_consumption_impact': True},
            ],
        }
        body.update(over)
        return self.client.post('/api/cookbook/modifier-groups/', body, format='json')

    def test_read_shape_and_derived_selection(self):
        r = self._create()
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['selection'], 'single')   # sent "multi" — max 1 wins
        self.assertEqual(r.data['pick_rule'], 'exactly')
        self.assertEqual(r.data['suggested_rule']['rule'], 'any')
        self.assertEqual([i['code'] for i in r.data['rule_issues']], ['mixed_single_pick'])

        p = self.client.patch(f"/api/cookbook/modifier-groups/{r.data['id']}/",
                              {'min_select': 0, 'max_select': None}, format='json')
        self.assertEqual(p.status_code, 200, p.data)
        self.assertEqual(p.data['selection'], 'multi')
        self.assertEqual(p.data['pick_rule'], 'any')
        self.assertEqual(p.data['rule_issues'], [])

    def test_unavailable_options_do_not_count(self):
        r = self._create()
        ModifierOption.objects.filter(group_id=r.data['id']).exclude(name_en='Chicken') \
            .update(is_available=False)
        g = self.client.get(f"/api/cookbook/modifier-groups/{r.data['id']}/")
        self.assertEqual(g.data['rule_issues'], [])

    def test_max_zero_rejected(self):
        self.assertEqual(self._create(min_select=0, max_select=0).status_code, 400)

    def test_readiness_lists_groups_with_rule_issues(self):
        self._create()
        self._create(name_en='Protein', options=[
            {'name_en': 'Beef', 'kind': 'choice', 'no_consumption_impact': True}])
        r = self.client.get('/api/cookbook/modifier-readiness/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['summary']['rule_issues'], 1)
        self.assertEqual([g['group'] for g in r.data['rule_issues']], ['Burrito'])
        self.assertTrue(ModifierGroup.objects.filter(name_en='Protein').exists())
