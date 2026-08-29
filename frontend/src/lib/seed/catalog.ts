/*
 * Seed catalogue — a realistic Green Hills dataset for the hermetic demo
 * (VITE_USE_SEED=1) and for screens whose data isn't loaded yet. Lebanese
 * dishes, 8 Kuwait branches, real-looking KWD costing.
 *
 * `image` points at /public/img/dishes/*.svg — on-brand generated stand-ins
 * until real plated-dish photography is shot. Swap the files (keep the
 * names) or set `image_url` on the real records to use photos; DishImage
 * falls back to a monogram treatment whenever a src is missing or 404s.
 */
import type {
  Allergen,
  Approver,
  Branch,
  MenuCategory,
  Section,
  ServiceStyle,
  UnitScale,
} from '@/types/api'

export const BRANCHES: Branch[] = [
  { id: 'br-salmiya', name_en: 'Salmiya', name_ar: 'السالمية', code: 'SLM', sort_order: 1 },
  { id: 'br-avenues', name_en: 'The Avenues', name_ar: 'الأفنيوز', code: 'AVN', sort_order: 2 },
  { id: 'br-kout', name_en: 'Al Kout', name_ar: 'الكوت', code: 'KUT', sort_order: 3 },
  { id: 'br-jabriya', name_en: 'Jabriya', name_ar: 'الجابرية', code: 'JBR', sort_order: 4 },
  { id: 'br-fintas', name_en: 'Al Fintas', name_ar: 'الفنطاس', code: 'FNT', sort_order: 5 },
  { id: 'br-hamra', name_en: 'Al Hamra', name_ar: 'الحمرا', code: 'HMR', sort_order: 6 },
  { id: 'br-boulevard', name_en: 'The Boulevard', name_ar: 'البوليفارد', code: 'BLV', sort_order: 7 },
  { id: 'br-sharq', name_en: 'Sharq', name_ar: 'شرق', code: 'SRQ', sort_order: 8 },
]

export const CATEGORIES: MenuCategory[] = [
  { id: 'cat-cold', name: 'Cold Mezze', name_ar: 'مقبلات باردة', menu_title_ar: 'المقبلات الباردة', sort_order: 1 },
  { id: 'cat-hot', name: 'Hot Mezze', name_ar: 'مقبلات ساخنة', menu_title_ar: 'المقبلات الساخنة', sort_order: 2 },
  { id: 'cat-salad', name: 'Salads', name_ar: 'سلطات', menu_title_ar: 'السلطات', sort_order: 3 },
  { id: 'cat-grill', name: 'From the Grill', name_ar: 'من الشواية', menu_title_ar: 'المشاوي', sort_order: 4 },
  { id: 'cat-main', name: 'Main Courses', name_ar: 'أطباق رئيسية', menu_title_ar: 'الأطباق الرئيسية', sort_order: 5 },
  { id: 'cat-dessert', name: 'Desserts', name_ar: 'حلويات', menu_title_ar: 'الحلويات', sort_order: 6 },
]

export const SECTIONS: Section[] = [
  { id: 'sec-cold', name: 'Cold Kitchen', avg_monthly_salary: '285.780' },
  { id: 'sec-grill', name: 'Grill', avg_monthly_salary: '342.500' },
  { id: 'sec-hot', name: 'Hot Kitchen', avg_monthly_salary: '318.000' },
  { id: 'sec-pastry', name: 'Pastry', avg_monthly_salary: '300.000' },
]

export const SERVICE_STYLES: ServiceStyle[] = [
  { id: 'ss-dinein', name: 'Dine-in' },
  { id: 'ss-delivery', name: 'Delivery' },
  { id: 'ss-catering', name: 'Catering' },
]

export const APPROVERS: Approver[] = [
  { id: 'ap-nadia', name: 'Chef Nadia Haddad' },
  { id: 'ap-karim', name: 'Chef Karim Fares' },
  { id: 'ap-lina', name: 'Lina Aoun (QA)' },
  { id: 'ap-omar', name: 'Omar Saleh (QA)' },
]

export const ALLERGENS: Allergen[] = [
  { id: 'al-gluten', name: 'Gluten' },
  { id: 'al-dairy', name: 'Dairy' },
  { id: 'al-nuts', name: 'Tree nuts' },
  { id: 'al-sesame', name: 'Sesame' },
  { id: 'al-egg', name: 'Egg' },
  { id: 'al-soy', name: 'Soy' },
  { id: 'al-sulphites', name: 'Sulphites' },
]

export const UNITS: UnitScale[] = [
  { id: 'u-g', code: 'g', description: 'Gram', dimension: 'mass', factor_to_canonical: '1' },
  { id: 'u-kg', code: 'Kg', description: 'Kilogram', dimension: 'mass', factor_to_canonical: '1000' },
  { id: 'u-ml', code: 'ml', description: 'Millilitre', dimension: 'volume', factor_to_canonical: '1' },
  { id: 'u-ltr', code: 'Ltr', description: 'Litre', dimension: 'volume', factor_to_canonical: '1000' },
  { id: 'u-tbs', code: 'Tbs', description: 'Tablespoon', dimension: 'volume', factor_to_canonical: '15' },
  { id: 'u-ts', code: 'Ts', description: 'Teaspoon', dimension: 'volume', factor_to_canonical: '5' },
  { id: 'u-pc', code: 'Pc', description: 'Piece', dimension: 'count', factor_to_canonical: '1' },
]

export const TASTE_DESCRIPTORS = [
  { id: 'td-1', category: 'appearance', value: 'Glossy' },
  { id: 'td-2', category: 'appearance', value: 'Rustic' },
  { id: 'td-3', category: 'aroma', value: 'Herbaceous' },
  { id: 'td-4', category: 'texture', value: 'Creamy' },
  { id: 'td-5', category: 'aftertaste', value: 'Lingering citrus' },
]

export interface SeedIngredient {
  sku: string
  name: string
  name_ar?: string
  qty: string
  unit: string // unit id
  prep?: string
  amount: string // computed KWD cost, 4dp
  status?: 'ok' | 'no_conversion'
  allergens?: string[]
}

export interface SeedDish {
  slug: string
  code: string
  name_en: string
  name_ar: string
  category: string // category id
  section: string // section id
  branchSlugs: string[] // which branches carry it
  price: number
  rating: number
  ratingStatus: '' | 'ok' | 'attention' | 'fix'
  prepMinutes: number
  wastePct: number
  image: string
  taste: string
  tasteAxes: Partial<Record<string, [number, number]>> // axis -> [target, tol]
  allergens: string[] // allergen ids
  ingredients: SeedIngredient[]
  steps: string[]
  portion?: [number, number]
  temp?: [number, number]
}

const U = {
  g: 'u-g',
  kg: 'u-kg',
  ml: 'u-ml',
  tbs: 'u-tbs',
  ts: 'u-ts',
  pc: 'u-pc',
}

export const DISHES: SeedDish[] = [
  {
    slug: 'tabbouleh',
    code: '1076.9',
    name_en: 'Tabbouleh',
    name_ar: 'تبولة',
    category: 'cat-salad',
    section: 'sec-cold',
    branchSlugs: ['br-salmiya', 'br-avenues', 'br-kout', 'br-jabriya', 'br-fintas', 'br-hamra', 'br-boulevard', 'br-sharq'],
    price: 3.1,
    rating: 7.9,
    ratingStatus: 'attention',
    prepMinutes: 4,
    wastePct: 1,
    image: '/img/dishes/tabbouleh.svg',
    taste: 'Fresh, tangy, herb-forward, light',
    tasteAxes: { sourness: [7, 1], saltiness: [4, 1], bitterness: [2, 1], richness: [2, 1] },
    allergens: ['al-gluten'],
    portion: [220, 15],
    temp: [6, 2],
    ingredients: [
      { sku: 'B72', name: 'Parsley', name_ar: 'بقدونس', qty: '140', unit: U.g, prep: 'Finely chopped', amount: '0.2568' },
      { sku: 'B2050', name: 'Lemon juice', name_ar: 'عصير ليمون', qty: '60', unit: U.ml, prep: 'Fresh', amount: '0.1950' },
      { sku: 'B2018', name: 'Burghul #1', name_ar: 'برغل ناعم', qty: '75', unit: U.g, prep: 'Soaked', amount: '0.1050' },
      { sku: 'B470', name: 'Olive oil', name_ar: 'زيت زيتون', qty: '40', unit: U.ml, prep: 'Extra virgin', amount: '0.1400' },
      { sku: 'B420', name: 'Spring onion', name_ar: 'بصل أخضر', qty: '35', unit: U.g, prep: 'Sliced thin', amount: '0.0651' },
      { sku: 'B674', name: 'Tomato', name_ar: 'طماطم', qty: '150', unit: U.g, prep: 'Small diced', amount: '0.1422' },
      { sku: 'B13', name: 'Sea salt', name_ar: 'ملح بحري', qty: '4', unit: U.g, amount: '0.0139' },
      { sku: 'B271', name: 'Cos lettuce', name_ar: 'خس روماني', qty: '60', unit: U.g, prep: 'For plating', amount: '0.0440' },
    ],
    steps: [
      'Soak the fine burghul in cold water for 10 minutes, then drain and press dry.',
      'Combine parsley, spring onion and tomato in a chilled bowl.',
      'Fold through the burghul, olive oil, lemon juice and salt.',
      'Rest 5 minutes, correct the acidity, and plate over cos leaves.',
    ],
  },
  {
    slug: 'hummus-beiruti',
    code: '1042.1',
    name_en: 'Hummus Beiruti',
    name_ar: 'حمّص بيروتي',
    category: 'cat-cold',
    section: 'sec-cold',
    branchSlugs: ['br-salmiya', 'br-avenues', 'br-kout', 'br-jabriya', 'br-fintas', 'br-hamra', 'br-boulevard', 'br-sharq'],
    price: 2.5,
    rating: 9.1,
    ratingStatus: 'ok',
    prepMinutes: 3,
    wastePct: 2,
    image: '/img/dishes/hummus.svg',
    taste: 'Nutty, creamy, garlicky, bright finish',
    tasteAxes: { saltiness: [5, 1], sourness: [4, 1], bitterness: [3, 1], richness: [6, 1] },
    allergens: ['al-sesame'],
    portion: [200, 10],
    temp: [8, 2],
    ingredients: [
      { sku: 'C120', name: 'Chickpeas', name_ar: 'حمّص حب', qty: '160', unit: U.g, prep: 'Cooked soft', amount: '0.1120' },
      { sku: 'C210', name: 'Tahini', name_ar: 'طحينة', qty: '55', unit: U.g, amount: '0.1595', allergens: ['al-sesame'] },
      { sku: 'B2050', name: 'Lemon juice', name_ar: 'عصير ليمون', qty: '30', unit: U.ml, amount: '0.0975' },
      { sku: 'C305', name: 'Garlic', name_ar: 'ثوم', qty: '6', unit: U.g, prep: 'Microplaned', amount: '0.0108' },
      { sku: 'B470', name: 'Olive oil', name_ar: 'زيت زيتون', qty: '20', unit: U.ml, amount: '0.0700' },
      { sku: 'C410', name: 'Parsley', name_ar: 'بقدونس', qty: '10', unit: U.g, prep: 'Chopped', amount: '0.0183' },
    ],
    steps: [
      'Warm the chickpeas, reserving a few for garnish.',
      'Blend chickpeas with tahini, lemon and garlic to a silky purée, loosening with iced water.',
      'Season, spread in a bowl and well the centre.',
      'Top with the reserved chickpeas, parsley, a dusting of paprika and olive oil.',
    ],
  },
  {
    slug: 'moutabal',
    code: '1043.0',
    name_en: 'Moutabal',
    name_ar: 'متبّل',
    category: 'cat-cold',
    section: 'sec-cold',
    branchSlugs: ['br-salmiya', 'br-avenues', 'br-kout', 'br-jabriya', 'br-hamra', 'br-sharq'],
    price: 2.6,
    rating: 8.2,
    ratingStatus: 'ok',
    prepMinutes: 5,
    wastePct: 3,
    image: '/img/dishes/moutabal.svg',
    taste: 'Smoky, creamy, tangy',
    tasteAxes: { smokiness: [7, 1], saltiness: [5, 1], sourness: [4, 1], richness: [6, 1] },
    allergens: ['al-sesame', 'al-dairy'],
    portion: [200, 10],
    temp: [8, 2],
    ingredients: [
      { sku: 'C520', name: 'Aubergine', name_ar: 'باذنجان', qty: '260', unit: U.g, prep: 'Fire-roasted, drained', amount: '0.1950' },
      { sku: 'C210', name: 'Tahini', name_ar: 'طحينة', qty: '40', unit: U.g, amount: '0.1160', allergens: ['al-sesame'] },
      { sku: 'C610', name: 'Labneh', name_ar: 'لبنة', qty: '25', unit: U.g, amount: '0.0525', allergens: ['al-dairy'] },
      { sku: 'B2050', name: 'Lemon juice', name_ar: 'عصير ليمون', qty: '25', unit: U.ml, amount: '0.0813' },
      { sku: 'C305', name: 'Garlic', name_ar: 'ثوم', qty: '5', unit: U.g, amount: '0.0090' },
      { sku: 'B470', name: 'Olive oil', name_ar: 'زيت زيتون', qty: '15', unit: U.ml, amount: '0.0525' },
    ],
    steps: [
      'Char the aubergines over open flame until collapsed; steam covered for 10 minutes.',
      'Peel, then hang the flesh in a sieve for 15 minutes to drain.',
      'Mash by hand with tahini, labneh, lemon and garlic — keep some texture.',
      'Season and finish with olive oil and pomegranate.',
    ],
  },
  {
    slug: 'fattoush',
    code: '1077.0',
    name_en: 'Fattoush',
    name_ar: 'فتوش',
    category: 'cat-salad',
    section: 'sec-cold',
    branchSlugs: ['br-salmiya', 'br-avenues', 'br-kout', 'br-jabriya', 'br-fintas', 'br-hamra', 'br-boulevard', 'br-sharq'],
    price: 3.1,
    rating: 7.4,
    ratingStatus: 'attention',
    prepMinutes: 4,
    wastePct: 4,
    image: '/img/dishes/fattoush.svg',
    taste: 'Crisp, sumac-sharp, saline',
    tasteAxes: { sourness: [8, 1], saltiness: [5, 1], bitterness: [3, 1] },
    allergens: ['al-gluten'],
    portion: [240, 15],
    temp: [6, 2],
    ingredients: [
      { sku: 'B271', name: 'Cos lettuce', name_ar: 'خس روماني', qty: '140', unit: U.g, prep: 'Torn', amount: '0.1026' },
      { sku: 'B674', name: 'Tomato', name_ar: 'طماطم', qty: '120', unit: U.g, prep: 'Wedged', amount: '0.1138' },
      { sku: 'C720', name: 'Cucumber', name_ar: 'خيار', qty: '110', unit: U.g, prep: 'Half-moons', amount: '0.0770' },
      { sku: 'C815', name: 'Pita bread', name_ar: 'خبز عربي', qty: '45', unit: U.g, prep: 'Fried crisp', amount: '0.0900', allergens: ['al-gluten'] },
      { sku: 'C905', name: 'Sumac', name_ar: 'سمّاق', qty: '5', unit: U.g, amount: '0.0300' },
      { sku: 'B2050', name: 'Lemon juice', name_ar: 'عصير ليمون', qty: '35', unit: U.ml, amount: '0.1138' },
      { sku: 'B470', name: 'Olive oil', name_ar: 'زيت زيتون', qty: '30', unit: U.ml, amount: '0.1050' },
      { sku: 'C930', name: 'Pomegranate molasses', name_ar: 'دبس رمان', qty: '8', unit: U.ml, amount: '0.0400', status: 'no_conversion' },
    ],
    steps: [
      'Whisk lemon, olive oil, pomegranate molasses and sumac into a dressing.',
      'Combine the cut vegetables and herbs in a wide bowl.',
      'Dress at the pass and fold through the fried pita so it stays crisp.',
      'Plate high and dust with extra sumac.',
    ],
  },
  {
    slug: 'kibbeh',
    code: '1210.2',
    name_en: 'Fried Kibbeh',
    name_ar: 'كبة مقلية',
    category: 'cat-hot',
    section: 'sec-hot',
    branchSlugs: ['br-salmiya', 'br-avenues', 'br-jabriya', 'br-hamra', 'br-boulevard', 'br-sharq'],
    price: 3.8,
    rating: 8.8,
    ratingStatus: 'ok',
    prepMinutes: 6,
    wastePct: 6,
    image: '/img/dishes/kibbeh.svg',
    taste: 'Savoury, warm-spiced, crisp shell',
    tasteAxes: { saltiness: [6, 1], spice: [5, 1], richness: [7, 1], umami: [6, 1] },
    allergens: ['al-gluten', 'al-nuts'],
    portion: [180, 10],
    temp: [65, 5],
    ingredients: [
      { sku: 'D110', name: 'Lamb mince', name_ar: 'لحم غنم مفروم', qty: '150', unit: U.g, prep: 'Twice ground', amount: '0.6750' },
      { sku: 'B2018', name: 'Fine burghul', name_ar: 'برغل ناعم', qty: '70', unit: U.g, amount: '0.0980', allergens: ['al-gluten'] },
      { sku: 'D220', name: 'Onion', name_ar: 'بصل', qty: '60', unit: U.g, prep: 'Grated', amount: '0.0360' },
      { sku: 'D315', name: 'Pine nuts', name_ar: 'صنوبر', qty: '15', unit: U.g, prep: 'Toasted', amount: '0.2250', allergens: ['al-nuts'] },
      { sku: 'D420', name: 'Seven-spice', name_ar: 'سبع بهارات', qty: '4', unit: U.g, amount: '0.0320' },
      { sku: 'D505', name: 'Sunflower oil', name_ar: 'زيت عباد الشمس', qty: '30', unit: U.ml, prep: 'For frying', amount: '0.0450' },
    ],
    steps: [
      'Knead the mince with soaked burghul and spice into a smooth shell paste; rest chilled.',
      'Cook the filling: onion, a little mince, seven-spice and toasted pine nuts.',
      'Shape torpedoes, fill, and seal both ends to a point.',
      'Fry at 175°C until deep brown; drain and serve with labneh.',
    ],
  },
  {
    slug: 'shish-taouk',
    code: '1305.4',
    name_en: 'Shish Taouk',
    name_ar: 'شيش طاووق',
    category: 'cat-grill',
    section: 'sec-grill',
    branchSlugs: ['br-salmiya', 'br-avenues', 'br-kout', 'br-jabriya', 'br-fintas', 'br-hamra', 'br-boulevard', 'br-sharq'],
    price: 4.2,
    rating: 8.1,
    ratingStatus: 'ok',
    prepMinutes: 5,
    wastePct: 8,
    image: '/img/dishes/shish-taouk.svg',
    taste: 'Garlic-lemon, charred, juicy',
    tasteAxes: { saltiness: [6, 1], sourness: [5, 1], spice: [3, 1], umami: [6, 1] },
    allergens: ['al-dairy'],
    portion: [260, 15],
    temp: [70, 5],
    ingredients: [
      { sku: 'E110', name: 'Chicken thigh', name_ar: 'فخذ دجاج', qty: '240', unit: U.g, prep: 'Diced 3cm', amount: '0.5040' },
      { sku: 'C610', name: 'Labneh', name_ar: 'لبنة', qty: '40', unit: U.g, prep: 'Marinade', amount: '0.0840', allergens: ['al-dairy'] },
      { sku: 'B2050', name: 'Lemon juice', name_ar: 'عصير ليمون', qty: '25', unit: U.ml, amount: '0.0813' },
      { sku: 'C305', name: 'Garlic', name_ar: 'ثوم', qty: '10', unit: U.g, amount: '0.0180' },
      { sku: 'E220', name: 'Tomato paste', name_ar: 'معجون طماطم', qty: '12', unit: U.g, amount: '0.0180' },
      { sku: 'B470', name: 'Olive oil', name_ar: 'زيت زيتون', qty: '15', unit: U.ml, amount: '0.0525' },
    ],
    steps: [
      'Marinate the chicken in labneh, garlic, lemon, tomato paste and oil for at least 4 hours.',
      'Thread onto skewers, not too tight.',
      'Grill over high charcoal, turning, to 74°C core with clear charring.',
      'Rest 3 minutes; serve with toum and grilled tomato.',
    ],
  },
  {
    slug: 'mixed-grill',
    code: '1320.0',
    name_en: 'Mixed Grill Platter',
    name_ar: 'مشاوي مشكّلة',
    category: 'cat-grill',
    section: 'sec-grill',
    branchSlugs: ['br-salmiya', 'br-avenues', 'br-jabriya', 'br-hamra', 'br-boulevard'],
    price: 8.9,
    rating: 8.4,
    ratingStatus: 'ok',
    prepMinutes: 8,
    wastePct: 9,
    image: '/img/dishes/mixed-grill.svg',
    taste: 'Smoky, rich, layered spice',
    tasteAxes: { saltiness: [6, 1], spice: [5, 1], richness: [8, 1], smokiness: [7, 1] },
    allergens: ['al-dairy', 'al-gluten'],
    portion: [420, 25],
    temp: [70, 5],
    ingredients: [
      { sku: 'E110', name: 'Chicken thigh', name_ar: 'فخذ دجاج', qty: '150', unit: U.g, amount: '0.3150' },
      { sku: 'D110', name: 'Lamb kofta', name_ar: 'كفتة غنم', qty: '150', unit: U.g, amount: '0.6750' },
      { sku: 'F110', name: 'Lamb cutlet', name_ar: 'ريش غنم', qty: '120', unit: U.g, amount: '1.4400' },
      { sku: 'C815', name: 'Pita bread', name_ar: 'خبز عربي', qty: '60', unit: U.g, amount: '0.1200', allergens: ['al-gluten'] },
      { sku: 'C305', name: 'Garlic toum', name_ar: 'ثومية', qty: '30', unit: U.g, amount: '0.0540' },
      { sku: 'D505', name: 'Grilling oil', name_ar: 'زيت شوي', qty: '20', unit: U.ml, amount: '0.0300' },
    ],
    steps: [
      'Bring all proteins to room temperature; season kofta and cutlets.',
      'Start the cutlets first, then chicken, then kofta so all finish together.',
      'Warm pita on the grill edge.',
      'Build the platter over pita with toum, grilled tomato and chilli.',
    ],
  },
  {
    slug: 'molokhia',
    code: '1415.7',
    name_en: 'Molokhia with Chicken',
    name_ar: 'ملوخية بالدجاج',
    category: 'cat-main',
    section: 'sec-hot',
    branchSlugs: ['br-salmiya', 'br-jabriya', 'br-hamra', 'br-sharq'],
    price: 4.9,
    rating: 6.9,
    ratingStatus: 'fix',
    prepMinutes: 6,
    wastePct: 7,
    image: '/img/dishes/molokhia.svg',
    taste: 'Earthy, garlic-coriander, unctuous',
    tasteAxes: { saltiness: [6, 1], bitterness: [4, 1], umami: [7, 1], richness: [6, 1] },
    allergens: [],
    portion: [320, 20],
    temp: [72, 5],
    ingredients: [
      { sku: 'G110', name: 'Molokhia leaves', name_ar: 'ورق ملوخية', qty: '180', unit: U.g, prep: 'Frozen, chopped', amount: '0.2160' },
      { sku: 'E110', name: 'Chicken leg', name_ar: 'فخذ دجاج', qty: '220', unit: U.g, prep: 'Poached, pulled', amount: '0.4620' },
      { sku: 'C305', name: 'Garlic', name_ar: 'ثوم', qty: '18', unit: U.g, prep: 'Crushed', amount: '0.0324' },
      { sku: 'G220', name: 'Coriander', name_ar: 'كزبرة', qty: '15', unit: U.g, prep: 'For taqliya', amount: '0.0300' },
      { sku: 'G330', name: 'Chicken stock', name_ar: 'مرق دجاج', qty: '400', unit: U.ml, amount: '0.2000' },
      { sku: 'B591', name: 'Dried lime', name_ar: 'لومي', qty: '1', unit: U.tbs, amount: '0.0000', status: 'no_conversion' },
    ],
    steps: [
      'Build a clear chicken stock and poach the legs; pull the meat.',
      'Add the molokhia to the simmering stock — do not boil hard.',
      'Fry garlic and coriander in ghee until fragrant; stir the taqliya through.',
      'Finish with dried-lime and lemon; serve with vermicelli rice.',
    ],
  },
  {
    slug: 'warak-enab',
    code: '1120.3',
    name_en: 'Warak Enab',
    name_ar: 'ورق عنب',
    category: 'cat-cold',
    section: 'sec-cold',
    branchSlugs: ['br-salmiya', 'br-avenues', 'br-kout', 'br-fintas', 'br-boulevard'],
    price: 3.3,
    rating: 8.0,
    ratingStatus: 'ok',
    prepMinutes: 8,
    wastePct: 5,
    image: '/img/dishes/warak-enab.svg',
    taste: 'Lemon-bright, herby, tender',
    tasteAxes: { sourness: [7, 1], saltiness: [5, 1], richness: [3, 1] },
    allergens: [],
    portion: [210, 12],
    temp: [8, 2],
    ingredients: [
      { sku: 'H110', name: 'Vine leaves', name_ar: 'ورق عنب', qty: '90', unit: U.g, prep: 'Blanched', amount: '0.1980' },
      { sku: 'H220', name: 'Short-grain rice', name_ar: 'رز مصري', qty: '80', unit: U.g, amount: '0.0640' },
      { sku: 'B674', name: 'Tomato', name_ar: 'طماطم', qty: '60', unit: U.g, prep: 'Fine diced', amount: '0.0569' },
      { sku: 'B72', name: 'Parsley', name_ar: 'بقدونس', qty: '25', unit: U.g, amount: '0.0459' },
      { sku: 'B2050', name: 'Lemon juice', name_ar: 'عصير ليمون', qty: '45', unit: U.ml, amount: '0.1463' },
      { sku: 'B470', name: 'Olive oil', name_ar: 'زيت زيتون', qty: '25', unit: U.ml, amount: '0.0875' },
    ],
    steps: [
      'Rinse the rice and mix with tomato, herbs, lemon, oil and spice.',
      'Roll each leaf tightly into a pencil, vein-side up.',
      'Layer in a pot over leaf offcuts and lemon slices; weight down.',
      'Barely cover with acidulated stock and cook gently 40 minutes; cool in the liquor.',
    ],
  },
  {
    slug: 'batata-harra',
    code: '1230.5',
    name_en: 'Batata Harra',
    name_ar: 'بطاطا حارة',
    category: 'cat-hot',
    section: 'sec-hot',
    branchSlugs: ['br-salmiya', 'br-avenues', 'br-kout', 'br-jabriya', 'br-fintas', 'br-boulevard', 'br-sharq'],
    price: 2.4,
    rating: 8.3,
    ratingStatus: 'ok',
    prepMinutes: 4,
    wastePct: 10,
    image: '/img/dishes/batata-harra.svg',
    taste: 'Crisp, chilli-garlic, coriander-lifted',
    tasteAxes: { spice: [7, 1], saltiness: [6, 1], sourness: [3, 1] },
    allergens: [],
    portion: [200, 12],
    temp: [62, 5],
    ingredients: [
      { sku: 'I110', name: 'Potato', name_ar: 'بطاطا', qty: '240', unit: U.g, prep: 'Cubed, fried', amount: '0.1200' },
      { sku: 'C305', name: 'Garlic', name_ar: 'ثوم', qty: '14', unit: U.g, amount: '0.0252' },
      { sku: 'I220', name: 'Red chilli', name_ar: 'فلفل حار', qty: '8', unit: U.g, amount: '0.0240' },
      { sku: 'G220', name: 'Coriander', name_ar: 'كزبرة', qty: '18', unit: U.g, amount: '0.0360' },
      { sku: 'D505', name: 'Frying oil', name_ar: 'زيت قلي', qty: '25', unit: U.ml, amount: '0.0375' },
      { sku: 'B13', name: 'Sea salt', name_ar: 'ملح', qty: '3', unit: U.g, amount: '0.0104' },
    ],
    steps: [
      'Double-fry the potato cubes until glassy then golden.',
      'Flash-fry garlic, chilli and coriander stalks in a little oil.',
      'Toss the hot potatoes through with salt and coriander leaf.',
      'Serve immediately with lemon.',
    ],
  },
  {
    slug: 'muhammara',
    code: '1050.8',
    name_en: 'Muhammara',
    name_ar: 'محمّرة',
    category: 'cat-cold',
    section: 'sec-cold',
    branchSlugs: ['br-avenues', 'br-jabriya', 'br-hamra', 'br-sharq'],
    price: 2.9,
    rating: 7.8,
    ratingStatus: 'attention',
    prepMinutes: 3,
    wastePct: 3,
    image: '/img/dishes/muhammara.svg',
    taste: 'Sweet-hot pepper, walnut, pomegranate',
    tasteAxes: { spice: [5, 1], sourness: [5, 1], richness: [6, 1], smokiness: [4, 1] },
    allergens: ['al-nuts', 'al-gluten'],
    portion: [180, 10],
    temp: [10, 2],
    ingredients: [
      { sku: 'J110', name: 'Roasted red pepper', name_ar: 'فلفل مشوي', qty: '150', unit: U.g, amount: '0.1650' },
      { sku: 'J220', name: 'Walnuts', name_ar: 'جوز', qty: '55', unit: U.g, prep: 'Toasted', amount: '0.3300', allergens: ['al-nuts'] },
      { sku: 'C815', name: 'Breadcrumb', name_ar: 'فتات خبز', qty: '25', unit: U.g, amount: '0.0500', allergens: ['al-gluten'] },
      { sku: 'C930', name: 'Pomegranate molasses', name_ar: 'دبس رمان', qty: '15', unit: U.ml, amount: '0.0750' },
      { sku: 'J330', name: 'Aleppo pepper', name_ar: 'فلفل حلبي', qty: '5', unit: U.g, amount: '0.0350' },
      { sku: 'B470', name: 'Olive oil', name_ar: 'زيت زيتون', qty: '20', unit: U.ml, amount: '0.0700' },
    ],
    steps: [
      'Blitz walnuts and breadcrumb to a coarse rubble.',
      'Add roasted pepper, pomegranate molasses and Aleppo pepper; pulse to a spoonable paste.',
      'Season and slacken with olive oil.',
      'Spread, well the centre and finish with oil, walnuts and mint.',
    ],
  },
  {
    slug: 'knafeh',
    code: '1610.1',
    name_en: 'Knafeh Nabulsieh',
    name_ar: 'كنافة نابلسية',
    category: 'cat-dessert',
    section: 'sec-pastry',
    branchSlugs: ['br-salmiya', 'br-avenues', 'br-kout', 'br-jabriya', 'br-fintas', 'br-hamra', 'br-boulevard', 'br-sharq'],
    price: 3.6,
    rating: 9.3,
    ratingStatus: 'ok',
    prepMinutes: 5,
    wastePct: 6,
    image: '/img/dishes/knafeh.svg',
    taste: 'Sweet, cheese-pull, orange-blossom',
    tasteAxes: { sweetness: [8, 1], saltiness: [3, 1], richness: [8, 1] },
    allergens: ['al-dairy', 'al-gluten', 'al-nuts'],
    portion: [190, 12],
    temp: [58, 5],
    ingredients: [
      { sku: 'K110', name: 'Kadaif pastry', name_ar: 'شعيرية كنافة', qty: '90', unit: U.g, amount: '0.1800', allergens: ['al-gluten'] },
      { sku: 'K220', name: 'Akkawi cheese', name_ar: 'جبنة عكاوي', qty: '110', unit: U.g, prep: 'De-salted', amount: '0.3850', allergens: ['al-dairy'] },
      { sku: 'K330', name: 'Ghee', name_ar: 'سمنة', qty: '35', unit: U.g, amount: '0.1050', allergens: ['al-dairy'] },
      { sku: 'K440', name: 'Sugar syrup', name_ar: 'قطر', qty: '50', unit: U.ml, prep: 'Orange-blossom', amount: '0.0500' },
      { sku: 'D315', name: 'Pistachio', name_ar: 'فستق حلبي', qty: '10', unit: U.g, prep: 'Ground', amount: '0.1200', allergens: ['al-nuts'] },
    ],
    steps: [
      'Toss the shredded pastry with warm ghee and orange food colour; press half into the pan.',
      'Layer the de-salted cheese, then the remaining pastry; press firm.',
      'Bake at 200°C until the base is deep gold; flip onto a plate.',
      'Douse with cool syrup while hot and crown with pistachio.',
    ],
  },
]

/* ── Inventory item catalogue ───────────────────────────────────────────
 * Derived from every ingredient line across the dishes, then fleshed out
 * with the fields inventory-platform's Item master actually carries
 * (type, unit, cost, barcode, origin, supplier, shelf life, …) so the
 * Inventory screen shows a real item definition, not just name + cost.
 * All values are deterministic from the SKU — the demo is reproducible. */

const ORIGINS = ['Kuwait', 'Lebanon', 'Turkey', 'Egypt', 'India', 'France', 'Italy', 'Jordan']
const SUPPLIERS = [
  { id: 'sup-levant', name_en: 'Levant Fresh Trading', name_ar: 'المشرق للتجارة', country: 'Lebanon' },
  { id: 'sup-gulfdry', name_en: 'Gulf Dry Goods Co.', name_ar: 'الخليج للمواد الجافة', country: 'Kuwait' },
  { id: 'sup-almarai', name_en: 'Al Marai Distribution', name_ar: 'المراعي للتوزيع', country: 'Kuwait' },
  { id: 'sup-anatolia', name_en: 'Anatolia Imports', name_ar: 'الأناضول للاستيراد', country: 'Turkey' },
  { id: 'sup-nilevalley', name_en: 'Nile Valley Produce', name_ar: 'وادي النيل للخضار', country: 'Egypt' },
]
const SHELF_LIFE: Record<string, [number, 'D' | 'M' | 'Y']> = {
  produce: [4, 'D'], dairy: [10, 'D'], meat: [3, 'D'], poultry: [3, 'D'], seafood: [2, 'D'],
  bakery: [3, 'D'], sauce: [6, 'M'], oil: [12, 'M'], dry: [12, 'M'], other: [6, 'M'],
}
const LOCATIONS: Record<string, string> = {
  produce: 'Produce Walk-in', dairy: 'Cold Room 2', meat: 'Meat Chiller', poultry: 'Meat Chiller',
  seafood: 'Seafood Chiller', bakery: 'Bakery Store', sauce: 'Central Dry Store',
  oil: 'Central Dry Store', dry: 'Central Dry Store', other: 'Central Dry Store',
}
const PERISHABLE = new Set(['produce', 'dairy', 'meat', 'poultry', 'seafood', 'bakery'])

const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function categoryFor(name: string): string {
  const n = name.toLowerCase()
  if (/lamb|beef|kofta|mince|meat|shawarma/.test(n)) return 'meat'
  if (/chicken|poultry/.test(n)) return 'poultry'
  if (/fish|shrimp|prawn|calamari|squid/.test(n)) return 'seafood'
  if (/cheese|akkawi|yog[hu]rt|labneh|milk|cream|ghee|butter|kishk/.test(n)) return 'dairy'
  if (/\boil\b/.test(n)) return 'oil'
  if (/molasses|syrup|tahini|pomegranate|paste|sauce|dibs/.test(n)) return 'sauce'
  if (/bread|pita|dough|khubz/.test(n)) return 'bakery'
  // dry spices & staples win over "pepper"/"leaf" which also read as produce
  if (
    /burghul|rice|flour|breadcrumb|sugar|\bsalt\b|spice|sumac|cumin|paprika|cinnamon|cardamom|nutmeg|chickpea|chick pea|lentil|pine nut|walnut|pistachio|almond|sesame|kadaif|kadayif|vermicelli|pastry|semolina|za.?atar|aleppo|chilli|chili|baharat/.test(
      n,
    )
  )
    return 'dry'
  if (
    /parsley|mint|tomato|onion|lettuce|cucumber|bell pepper|red pepper|green pepper|capsicum|garlic|lemon|lime|eggplant|aubergine|potato|coriander|rocket|radish|spring onion|\bcos\b|purslane/.test(
      n,
    )
  )
    return 'produce'
  return 'other'
}

function unitFor(unitIds: Set<string>): { code: string; name_en: string } {
  if ([...unitIds].some((u) => u === U.ml || u === U.tbs || u === U.ts))
    return { code: 'Ltr', name_en: 'Litre' }
  if (unitIds.has(U.pc)) return { code: 'Pc', name_en: 'Piece' }
  return { code: 'Kg', name_en: 'Kilogram' }
}

interface Agg {
  name_en: string
  name_ar: string
  units: Set<string>
  costPerBase: number[] // KWD per Kg / Ltr / Pc
}

const _agg = new Map<string, Agg>()
for (const line of DISHES.flatMap((d) => d.ingredients)) {
  const a =
    _agg.get(line.sku) ??
    { name_en: line.name, name_ar: line.name_ar ?? '', units: new Set<string>(), costPerBase: [] }
  a.units.add(line.unit)
  const qty = Number(line.qty)
  const amt = Number(line.amount)
  if (qty > 0 && amt > 0) {
    const perUnit = amt / qty
    a.costPerBase.push(line.unit === U.pc ? perUnit : perUnit * 1000)
  }
  _agg.set(line.sku, a)
}

export interface SeedInventoryItem {
  id: string
  sku: string
  name_en: string
  name_ar: string
  item_type: string
  item_type_display: string
  category: string
  category_display: string
  unit_code: string
  unit_name: string
  unit_detail: { code: string; name_en: string }
  unit_cost: string
  selling_price: string | null
  reorder_level: string
  shelf_life_value: number
  shelf_life_unit: string
  expiry_tracking: boolean
  expiry_alert_days: number
  origin_country: string
  barcode: string
  suppliers_info: { id: string; name_en: string; name_ar: string; country: string }[]
  default_location_name: string
  notes: string
  image_url: string | null
  is_active: boolean
}

export const SEED_INVENTORY_SKUS: SeedInventoryItem[] = [..._agg.entries()]
  .map(([sku, a]) => {
    const h = hash(sku)
    const category = categoryFor(a.name_en)
    const unit = unitFor(a.units)
    const prepared = /syrup|roasted|toasted|de-?salted|soaked|stock|confit/i.test(a.name_en)
    const avgCost = a.costPerBase.length
      ? a.costPerBase.reduce((s, n) => s + n, 0) / a.costPerBase.length
      : 1 + (h % 900) / 100
    const [slValue, slUnit] = SHELF_LIFE[category] ?? SHELF_LIFE.other
    const supplierCount = h % 5 === 0 ? 2 : 1
    const suppliers = Array.from(
      { length: supplierCount },
      (_, k) => SUPPLIERS[(h + k * 7) % SUPPLIERS.length],
    )
    return {
      id: sku,
      sku,
      name_en: a.name_en,
      name_ar: a.name_ar,
      item_type: prepared ? 'prepared_product' : 'raw_material',
      item_type_display: prepared ? 'Prepared Product' : 'Raw Material',
      category,
      category_display: titleCase(category),
      unit_code: unit.code,
      unit_name: unit.name_en,
      unit_detail: unit,
      unit_cost: avgCost.toFixed(3),
      selling_price: category === 'dry' && h % 3 === 0 ? (avgCost * 1.35).toFixed(3) : null,
      reorder_level: (2 + (h % 18)).toFixed(3),
      shelf_life_value: slValue,
      shelf_life_unit: slUnit,
      expiry_tracking: PERISHABLE.has(category),
      expiry_alert_days: PERISHABLE.has(category) ? 2 : 7,
      origin_country: ORIGINS[h % ORIGINS.length],
      barcode: '628' + String(1000000000 + (h % 8999999999)).slice(0, 10),
      suppliers_info: suppliers,
      default_location_name: LOCATIONS[category] ?? LOCATIONS.other,
      notes:
        h % 6 === 0
          ? 'Received against the weekly standing order; QC checks weight and temperature on arrival.'
          : '',
      image_url: null,
      is_active: h % 19 !== 0,
    }
  })
  .sort((x, y) => x.name_en.localeCompare(y.name_en))
