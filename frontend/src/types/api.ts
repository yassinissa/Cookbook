/* Shapes returned by the Cookbook API — mirror the DRF serializers. */

export type ID = string

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

/* ── reference data ──────────────────────────────────────────────────── */
export interface MenuCategory {
  id: ID
  name: string
  name_ar: string
  menu_title_ar: string
  sort_order: number
}
export interface Branch {
  id: ID
  name_en: string
  name_ar: string
  code: string
  sort_order: number
}
export interface Section {
  id: ID
  name: string
  avg_monthly_salary: string | null
}
export interface Approver {
  id: ID
  name: string
}
export interface Allergen {
  id: ID
  name: string
}
export interface ServiceStyle {
  id: ID
  name: string
}
export interface UnitScale {
  id: ID
  code: string
  description: string
  dimension: string
  factor_to_canonical: string
}
export interface TasteDescriptor {
  id: ID
  category: string
  value: string
}

export interface PrepKitchen {
  id: ID
  name_en: string
  name_ar: string
  code: string
  sort_order: number
  inventory_store_id: string
}

export interface ReferenceData {
  categories: MenuCategory[]
  branches: Branch[]
  prepKitchens: PrepKitchen[]
  sections: Section[]
  approvers: Approver[]
  allergens: Allergen[]
  serviceStyles: ServiceStyle[]
  units: UnitScale[]
  tasteDescriptors: TasteDescriptor[]
}

/* ── costing breakdown (JSON stored on the recipe) ───────────────────── */
export type LineStatus = 'ok' | 'no_price' | 'no_conversion' | 'unknown_sku'

export interface CostLine {
  sku: string
  quantity: string | null
  unit: string
  amount: string | null
  status: LineStatus
  detail: string
}
export interface CostIssue {
  sku: string
  status: LineStatus
  detail: string
}
export interface PricingScenario {
  markup: number
  price: string | null
  cost_pct: string | null
}
export interface CostBreakdown {
  items: string | null
  waste: string | null
  labor: string | null
  per_serving: string | null
  food_cost_pct: string | null
  revenue_pct: string | null
  cost_per_unit: string | null
  scenarios: PricingScenario[]
  lines: CostLine[]
  issues: CostIssue[]
}

/* ── nutrition + allergens ──────────────────────────────────────────── */
export interface NutritionRollup {
  calories?: string
  fat_g?: string
  saturated_fat_g?: string
  trans_fat_g?: string
  cholesterol_mg?: string
  sodium_mg?: string
  carbs_g?: string
  fibers_g?: string
  sugars_g?: string
  added_sugars_g?: string
  protein_g?: string
  _coverage?: { covered: number; total: number }
}
export interface AllergenRollup {
  all: string[]
  from_ingredients: { sku: string; name: string; allergens: string[] }[]
  dish: string[]
}

/* ── recipes ───────────────────────────────────────────────────────── */
export type RatingStatus = '' | 'ok' | 'attention' | 'fix'

export interface IngredientLine {
  id?: ID
  order?: number
  item_sku: string
  item_name_snapshot: string
  prep_note: string
  quantity: string
  unit: ID | null
  unit_detail?: UnitScale | null
}
export interface StepLine {
  id?: ID
  step_number: number
  instruction: string
}

export interface DishRecipeListItem {
  id: ID
  name_en: string
  name_ar: string
  recipe_code: string
  branch: string
  category: ID | null
  category_name: string | null
  section: ID | null
  section_name: string | null
  pos_item_name: string
  selling_price: string | null
  cost: string
  image_url: string
  rating: string | null
  rating_status: RatingStatus
  has_standard: boolean
  is_published: boolean
  version: number
  is_current: boolean
  ingredient_count: number
  created_at: string
}

export interface DishRecipeDetail {
  id: ID
  name_en: string
  name_ar: string
  recipe_code: string
  revision: string
  revision_date: string | null
  branch: string
  branch_ref: ID | null
  category: MenuCategory | null
  section: Section | null
  service_style: ServiceStyle | null
  allergens: Allergen[]
  allergen_rollup: AllergenRollup
  pos_item_name: string
  selling_price: string | null
  rating: string | null
  rating_status: RatingStatus
  rating_date: string | null
  taste_profile: string
  image_url: string
  prep_time_minutes: number | null
  expected_waste_pct: string
  include_labor_cost: boolean
  labor_cost: string
  cost: string
  cost_breakdown: CostBreakdown | Record<string, never>
  nutrition: NutritionRollup | Record<string, never>
  food_cost_pct: string | null
  approved_by: Approver | null
  qa_approved_by: Approver | null
  approved_at: string | null
  notes: string
  version: number
  is_current: boolean
  ingredients: IngredientLine[]
  steps: StepLine[]
  standard: DishStandard | null
  price_history: { id: ID; cost: string; selling_price: string | null; created_at: string }[]
  activity_log: ActivityLogEntry[]
  inventory_recipe_id: string
  published_at: string | null
  publish_error: string
  publish_stale: boolean
  created_at: string
  updated_at: string
  _warnings?: string[]
  _publish?: PublishResult
}

export interface PublishResult {
  inventory_recipe_id: string
  published_at: string
  warnings: string[]
}

export interface ActivityLogEntry {
  id: ID
  action_type: string
  action_type_display: string
  description: string
  changed_by: string
  created_at: string
}

export interface DishStandard {
  id?: ID
  service_style: string
  branch_applicability: string
  portion_weight_g: string | null
  portion_tolerance_g: string | null
  serving_temp_c: string | null
  temp_tolerance_c: string | null
  holding_time_minutes: number | null
  appearance: string
  color: string
  aroma: string
  texture: string
  presentation: string
  primary_flavor: string
  secondary_flavor: string
  aftertaste: string
  mouthfeel: string
  freshness_standard: string
  critical_defects_not_allowed: string
  qa_approved_by?: ID | null
  approval_date?: string | null
  [k: string]: string | number | null | undefined
}

/* ── production recipes (prep kitchen) ──────────────────────────────── */
export interface ProductionRecipeListItem {
  id: ID
  name_en: string
  name_ar: string
  recipe_code: string
  prep_kitchen: string
  prep_kitchen_ref: ID | null
  prep_kitchen_name: string | null
  section: ID | null
  section_name: string | null
  output_item_sku: string
  output_qty: string
  output_unit: ID | null
  output_unit_code: string | null
  cost: string
  version: number
  is_current: boolean
  is_published: boolean
  ingredient_count: number
  created_at: string
}

export interface ProductionCostHistoryRow {
  id: ID
  cost: string
  output_qty: string
  created_at: string
}

export interface ProductionRecipeDetail {
  id: ID
  name_en: string
  name_ar: string
  recipe_code: string
  revision: string
  revision_date: string | null
  prep_kitchen: string
  prep_kitchen_ref: ID | null
  section: Section | null
  output_item_sku: string
  output_qty: string
  output_unit: UnitScale | null
  prep_time_minutes: number | null
  expected_waste_pct: string
  include_labor_cost: boolean
  labor_cost: string
  cost: string
  cost_breakdown: CostBreakdown | Record<string, never>
  nutrition: NutritionRollup | Record<string, never>
  cost_per_unit: string | null
  approved_by: Approver | null
  qa_approved_by: Approver | null
  approved_at: string | null
  notes: string
  version: number
  is_current: boolean
  ingredients: IngredientLine[]
  steps: StepLine[]
  cost_history: ProductionCostHistoryRow[]
  activity_log: ActivityLogEntry[]
  inventory_recipe_id: string
  published_at: string | null
  publish_error: string
  publish_stale: boolean
  created_at: string
  updated_at: string
  _warnings?: string[]
  _publish?: PublishResult
}

/* ── QA/QC standards (standalone screen) ────────────────────────────── */
export interface SpecCoverage {
  filled: number
  total: number
}

export interface DishStandardListItem {
  id: ID
  name_en: string
  name_ar: string
  recipe_code: string
  branch: string
  branch_ref: ID | null
  category: ID | null
  category_name: string | null
  rating_status: RatingStatus
  has_standard: boolean
  is_approved: boolean
  qa_approved_by_name: string | null
  approval_date: string | null
  portion_weight_g: string | null
  serving_temp_c: string | null
  holding_time_minutes: number | null
  taste_axis_count: number
  spec_coverage: SpecCoverage
  needs_review: boolean
}

export interface DishStandardDetail {
  id: ID
  name_en: string
  name_ar: string
  recipe_code: string
  revision: string
  branch: string
  branch_ref: ID | null
  category: string | null
  section: string | null
  image_url: string
  rating: string | null
  rating_status: RatingStatus
  taste_profile: string
  version: number
  standard: DishStandard | null
  spec_coverage: SpecCoverage
  needs_review: boolean
  qa_approved_by: Approver | null
  updated_at: string
  _warnings?: string[]
}

/* ── activity & history feed ────────────────────────────────────────── */
export interface ActivityEntry {
  id: ID
  kind: 'dish' | 'production'
  action: string
  action_display: string
  description: string
  recipe_id: ID
  recipe_name: string
  recipe_name_ar: string
  recipe_code: string
  recipe_path: string
  scope_name: string | null
  changed_by: string | null
  created_at: string
}

export interface ActivityActionOption {
  value: string
  label: string
}

export interface ActivityFeed {
  count: number
  page: number
  page_size: number
  num_pages: number
  results: ActivityEntry[]
  actors: string[]
  action_types: ActivityActionOption[]
}

export interface ActivityQuery {
  page?: number
  kind?: string
  action?: string
  actor?: string
  recipe?: string
  q?: string
  date_from?: string
  date_to?: string
}

/* ── version history ────────────────────────────────────────────────── */
export interface VersionSummary {
  fields_changed: string[]
  ingredients_added: number
  ingredients_removed: number
  ingredients_changed: number
  steps_added: number
  steps_removed: number
}
export interface VersionRow {
  id: ID
  version: number
  is_current: boolean
  is_viewed: boolean
  revision: string
  revision_date: string | null
  cost: string
  selling_price: string | null
  output_qty: string | null
  created_at: string
  updated_at: string
  changes_from_previous: VersionSummary | null
}
export interface VersionDiff {
  from: { id: ID; version: number }
  to: { id: ID; version: number }
  fields: { field: string; from: string | null; to: string | null }[]
  ingredients: {
    added: IngredientSummary[]
    removed: IngredientSummary[]
    changed: { label: string; from: IngredientSummary; to: IngredientSummary }[]
  }
  steps: { added: string[]; removed: string[]; count_from: number; count_to: number }
}
export interface IngredientSummary {
  item_sku: string
  item_name_snapshot: string
  prep_note: string
  quantity: string
  unit: string | null
}

/* ── menus ─────────────────────────────────────────────────────────── */
export interface MenuListItem {
  id: ID
  branch: ID
  branch_detail: Branch
  name: string
  name_ar: string
  line_count: number
  last_snapshot_at: string | null
  is_active: boolean
  created_at: string
}
export interface MenuLine {
  id: ID
  dish: ID
  dish_name: string
  dish_name_ar: string
  recipe_code: string
  category: string | null
  category_ar: string
  category_order: number
  recipe_cost: string
  recipe_price: string | null
  rating: string | null
  rating_status: RatingStatus
  menu_price: string | null
  effective_price: string | null
  food_cost_pct: string | null
  pos_name: string
  image_url: string
  sort_order: number
  is_available: boolean
}
export interface MenuDetail extends MenuListItem {
  notes: string
  lines: MenuLine[]
}
export interface MenuSnapshotLine {
  id: ID
  dish_name: string
  recipe_code: string
  category: string
  cost: string
  menu_price: string | null
  food_cost_pct: string | null
}
export interface MenuSnapshot {
  id: ID
  label: string
  taken_by: string
  created_at: string
  lines: MenuSnapshotLine[]
}
export interface MenuTrendPoint {
  date: string
  label: string
  dishes: number
  total_cost: string
  total_price: string
  avg_food_cost_pct: string | null
  over_30: number
}
export interface MenuTrends {
  menu: string
  points: MenuTrendPoint[]
}

/* ── dashboard ─────────────────────────────────────────────────────── */
export interface Dashboard {
  target_pct: string
  totals: {
    dishes: number
    production_recipes: number
    menus: number
    standards: number
    branches: number
  }
  food_cost: { avg_pct: string | null; over_target: number; priced: number }
  attention: {
    count: number
    items: {
      id: ID
      name_en: string
      name_ar: string
      recipe_code: string
      branch: string
      reasons: string[]
    }[]
  }
  over_target: {
    id: ID
    name_en: string
    name_ar: string
    branch: string
    food_cost_pct: string
    cost: string
    selling_price: string | null
  }[]
  branch_health: {
    branch_id: ID
    name_en: string
    name_ar: string
    menu_id: ID | null
    dishes: number
    avg_food_cost_pct: string | null
    over_target: number
    last_snapshot_at: string | null
    trend: { label: string; date: string; avg_food_cost_pct: string | null }[]
  }[]
  recent_activity: {
    id: ID
    kind: 'dish' | 'production'
    action: string
    action_display: string
    description: string
    recipe_id: ID
    recipe_name: string
    changed_by: string | null
    created_at: string
  }[]
  cost_trend: {
    label: string
    date: string
    avg_food_cost_pct: string | null
    total_cost: string
  }[]
}

/* ── inventory (proxied from inventory-platform) ────────────────────── */
export interface InventoryItem {
  id: ID
  sku: string
  name_en: string
  name_ar?: string
  unit_code?: string
  unit_name?: string
  unit_cost?: string
  category?: string
  category_display?: string
  item_type?: string
  item_type_display?: string
  barcode?: string | null
  image_url?: string | null
  is_active?: boolean
}

export interface InventoryItemDetail extends InventoryItem {
  unit_detail?: { code: string; name_en: string; name_ar?: string; category_display?: string }
  selling_price?: string | null
  reorder_level?: string | null
  shelf_life_value?: number | null
  shelf_life_unit?: string | null
  expiry_tracking?: boolean
  expiry_alert_days?: number | null
  origin_country?: string | null
  default_location_name?: string | null
  suppliers_info?: { id: ID; name_en: string; name_ar?: string; country?: string }[]
  notes?: string | null
}
