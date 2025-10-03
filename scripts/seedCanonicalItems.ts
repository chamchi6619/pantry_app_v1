import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface CanonicalItem {
  canonical_name: string;
  aliases: string[];
  category: string;
  typical_unit: string;
  typical_location: 'fridge' | 'freezer' | 'pantry';
  is_perishable: boolean;
  typical_shelf_life_days: number;
}

const CANONICAL_ITEMS: CanonicalItem[] = [
  // Proteins (20)
  { canonical_name: 'chicken breast', aliases: ['chicken', 'chicken breasts', 'boneless chicken', 'skinless chicken breast'], category: 'protein', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 2 },
  { canonical_name: 'ground beef', aliases: ['beef', 'hamburger meat', 'minced beef', 'ground chuck'], category: 'protein', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 2 },
  { canonical_name: 'salmon', aliases: ['salmon fillet', 'fresh salmon', 'atlantic salmon'], category: 'protein', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 2 },
  { canonical_name: 'eggs', aliases: ['egg', 'large eggs', 'chicken eggs', 'whole eggs'], category: 'protein', typical_unit: 'piece', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 21 },
  { canonical_name: 'tofu', aliases: ['bean curd', 'firm tofu', 'silken tofu', 'extra firm tofu'], category: 'protein', typical_unit: 'pack', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'shrimp', aliases: ['prawns', 'fresh shrimp', 'raw shrimp', 'peeled shrimp'], category: 'protein', typical_unit: 'lb', typical_location: 'freezer', is_perishable: true, typical_shelf_life_days: 90 },
  { canonical_name: 'pork chops', aliases: ['pork', 'pork chop', 'bone-in pork chops'], category: 'protein', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 3 },
  { canonical_name: 'turkey breast', aliases: ['turkey', 'turkey slices', 'deli turkey', 'sliced turkey'], category: 'protein', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 5 },
  { canonical_name: 'bacon', aliases: ['pork bacon', 'turkey bacon', 'bacon strips'], category: 'protein', typical_unit: 'pack', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'ground turkey', aliases: ['turkey mince', 'minced turkey', 'lean ground turkey'], category: 'protein', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 2 },
  { canonical_name: 'chicken thighs', aliases: ['chicken thigh', 'boneless chicken thighs', 'bone-in thighs'], category: 'protein', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 2 },
  { canonical_name: 'sausage', aliases: ['pork sausage', 'italian sausage', 'breakfast sausage'], category: 'protein', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'tuna', aliases: ['canned tuna', 'tuna can', 'tuna fish'], category: 'protein', typical_unit: 'can', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 1095 },
  { canonical_name: 'salmon canned', aliases: ['canned salmon', 'pink salmon', 'salmon can'], category: 'protein', typical_unit: 'can', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 1095 },
  { canonical_name: 'beef steak', aliases: ['steak', 'ribeye', 'sirloin', 'ny strip'], category: 'protein', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 3 },
  { canonical_name: 'ham', aliases: ['deli ham', 'sliced ham', 'honey ham'], category: 'protein', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 5 },
  { canonical_name: 'cod', aliases: ['cod fillet', 'fresh cod', 'white fish'], category: 'protein', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 2 },
  { canonical_name: 'tilapia', aliases: ['tilapia fillet', 'fresh tilapia'], category: 'protein', typical_unit: 'lb', typical_location: 'freezer', is_perishable: true, typical_shelf_life_days: 90 },
  { canonical_name: 'chickpeas', aliases: ['garbanzo beans', 'canned chickpeas', 'chickpea can'], category: 'protein', typical_unit: 'can', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'black beans', aliases: ['canned black beans', 'black bean can'], category: 'protein', typical_unit: 'can', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },

  // Dairy (15)
  { canonical_name: 'milk', aliases: ['whole milk', '2% milk', 'skim milk', 'cow milk'], category: 'dairy', typical_unit: 'fl_oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'butter', aliases: ['salted butter', 'unsalted butter', 'stick butter'], category: 'dairy', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 30 },
  { canonical_name: 'cheese', aliases: ['cheddar cheese', 'shredded cheese', 'block cheese'], category: 'dairy', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 14 },
  { canonical_name: 'yogurt', aliases: ['greek yogurt', 'plain yogurt', 'vanilla yogurt'], category: 'dairy', typical_unit: 'oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 14 },
  { canonical_name: 'sour cream', aliases: ['sour cream tub', 'light sour cream'], category: 'dairy', typical_unit: 'oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 14 },
  { canonical_name: 'cream cheese', aliases: ['philadelphia cream cheese', 'plain cream cheese'], category: 'dairy', typical_unit: 'oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 14 },
  { canonical_name: 'heavy cream', aliases: ['heavy whipping cream', 'whipping cream'], category: 'dairy', typical_unit: 'fl_oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'parmesan cheese', aliases: ['parmesan', 'parmigiano reggiano', 'grated parmesan'], category: 'dairy', typical_unit: 'oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 30 },
  { canonical_name: 'mozzarella', aliases: ['mozzarella cheese', 'fresh mozzarella', 'shredded mozzarella'], category: 'dairy', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 14 },
  { canonical_name: 'cottage cheese', aliases: ['small curd cottage cheese', 'low fat cottage cheese'], category: 'dairy', typical_unit: 'oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 10 },
  { canonical_name: 'feta cheese', aliases: ['feta', 'crumbled feta'], category: 'dairy', typical_unit: 'oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 14 },
  { canonical_name: 'almond milk', aliases: ['unsweetened almond milk', 'vanilla almond milk'], category: 'dairy', typical_unit: 'fl_oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'oat milk', aliases: ['oatmilk', 'oat beverage'], category: 'dairy', typical_unit: 'fl_oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'whipped cream', aliases: ['canned whipped cream', 'reddi whip'], category: 'dairy', typical_unit: 'oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 21 },
  { canonical_name: 'ricotta', aliases: ['ricotta cheese', 'whole milk ricotta'], category: 'dairy', typical_unit: 'oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },

  // Vegetables (25)
  { canonical_name: 'tomatoes', aliases: ['tomato', 'roma tomatoes', 'cherry tomatoes', 'grape tomatoes'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'onions', aliases: ['onion', 'yellow onion', 'white onion', 'red onion'], category: 'produce', typical_unit: 'lb', typical_location: 'pantry', is_perishable: true, typical_shelf_life_days: 30 },
  { canonical_name: 'garlic', aliases: ['garlic clove', 'garlic bulb', 'fresh garlic'], category: 'produce', typical_unit: 'piece', typical_location: 'pantry', is_perishable: true, typical_shelf_life_days: 60 },
  { canonical_name: 'carrots', aliases: ['carrot', 'baby carrots', 'carrot sticks'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 21 },
  { canonical_name: 'potatoes', aliases: ['potato', 'russet potatoes', 'red potatoes', 'yukon gold'], category: 'produce', typical_unit: 'lb', typical_location: 'pantry', is_perishable: true, typical_shelf_life_days: 60 },
  { canonical_name: 'bell peppers', aliases: ['bell pepper', 'red bell pepper', 'green pepper', 'sweet pepper'], category: 'produce', typical_unit: 'piece', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'broccoli', aliases: ['broccoli florets', 'fresh broccoli', 'broccoli crown'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'spinach', aliases: ['baby spinach', 'fresh spinach', 'spinach leaves'], category: 'produce', typical_unit: 'oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 5 },
  { canonical_name: 'lettuce', aliases: ['romaine lettuce', 'iceberg lettuce', 'green leaf lettuce'], category: 'produce', typical_unit: 'piece', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'mushrooms', aliases: ['mushroom', 'white mushrooms', 'button mushrooms', 'cremini'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'cucumber', aliases: ['cucumbers', 'english cucumber', 'persian cucumber'], category: 'produce', typical_unit: 'piece', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'celery', aliases: ['celery stalk', 'celery stalks'], category: 'produce', typical_unit: 'bunch', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 14 },
  { canonical_name: 'zucchini', aliases: ['zucchinis', 'green zucchini', 'summer squash'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'corn', aliases: ['sweet corn', 'corn on the cob', 'corn kernels'], category: 'produce', typical_unit: 'piece', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 5 },
  { canonical_name: 'green beans', aliases: ['string beans', 'fresh green beans'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'asparagus', aliases: ['asparagus spears', 'fresh asparagus'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 5 },
  { canonical_name: 'cabbage', aliases: ['green cabbage', 'red cabbage', 'napa cabbage'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 14 },
  { canonical_name: 'kale', aliases: ['fresh kale', 'kale leaves', 'curly kale'], category: 'produce', typical_unit: 'bunch', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 5 },
  { canonical_name: 'cauliflower', aliases: ['cauliflower head', 'fresh cauliflower'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'sweet potatoes', aliases: ['sweet potato', 'yams'], category: 'produce', typical_unit: 'lb', typical_location: 'pantry', is_perishable: true, typical_shelf_life_days: 30 },
  { canonical_name: 'avocado', aliases: ['avocados', 'hass avocado'], category: 'produce', typical_unit: 'piece', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 5 },
  { canonical_name: 'squash', aliases: ['butternut squash', 'acorn squash', 'yellow squash'], category: 'produce', typical_unit: 'lb', typical_location: 'pantry', is_perishable: true, typical_shelf_life_days: 30 },
  { canonical_name: 'eggplant', aliases: ['eggplants', 'aubergine'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'peas', aliases: ['green peas', 'frozen peas', 'garden peas'], category: 'produce', typical_unit: 'oz', typical_location: 'freezer', is_perishable: true, typical_shelf_life_days: 180 },
  { canonical_name: 'brussels sprouts', aliases: ['brussels sprout', 'brussel sprouts'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },

  // Fruits (15)
  { canonical_name: 'apples', aliases: ['apple', 'gala apple', 'honeycrisp', 'fuji apple', 'granny smith'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 30 },
  { canonical_name: 'bananas', aliases: ['banana', 'yellow banana'], category: 'produce', typical_unit: 'lb', typical_location: 'pantry', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'oranges', aliases: ['orange', 'navel orange', 'valencia orange'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 14 },
  { canonical_name: 'strawberries', aliases: ['strawberry', 'fresh strawberries'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 5 },
  { canonical_name: 'blueberries', aliases: ['blueberry', 'fresh blueberries'], category: 'produce', typical_unit: 'oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'grapes', aliases: ['grape', 'red grapes', 'green grapes', 'seedless grapes'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'lemons', aliases: ['lemon', 'fresh lemon'], category: 'produce', typical_unit: 'piece', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 14 },
  { canonical_name: 'limes', aliases: ['lime', 'fresh lime', 'key lime'], category: 'produce', typical_unit: 'piece', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 14 },
  { canonical_name: 'watermelon', aliases: ['watermelons', 'seedless watermelon'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'pineapple', aliases: ['pineapples', 'fresh pineapple'], category: 'produce', typical_unit: 'piece', typical_location: 'pantry', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'mango', aliases: ['mangos', 'fresh mango'], category: 'produce', typical_unit: 'piece', typical_location: 'pantry', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'berries', aliases: ['mixed berries', 'berry mix'], category: 'produce', typical_unit: 'oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 5 },
  { canonical_name: 'peaches', aliases: ['peach', 'fresh peaches'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 5 },
  { canonical_name: 'pears', aliases: ['pear', 'bartlett pear', 'anjou pear'], category: 'produce', typical_unit: 'lb', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 14 },
  { canonical_name: 'raspberries', aliases: ['raspberry', 'fresh raspberries'], category: 'produce', typical_unit: 'oz', typical_location: 'fridge', is_perishable: true, typical_shelf_life_days: 3 },

  // Pantry Staples (25)
  { canonical_name: 'rice', aliases: ['white rice', 'jasmine rice', 'basmati rice', 'long grain rice'], category: 'grains', typical_unit: 'lb', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'pasta', aliases: ['spaghetti', 'penne', 'fettuccine', 'noodles'], category: 'grains', typical_unit: 'lb', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'flour', aliases: ['all-purpose flour', 'wheat flour', 'white flour'], category: 'baking', typical_unit: 'lb', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 365 },
  { canonical_name: 'sugar', aliases: ['white sugar', 'granulated sugar', 'cane sugar'], category: 'baking', typical_unit: 'lb', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 1095 },
  { canonical_name: 'brown sugar', aliases: ['light brown sugar', 'dark brown sugar'], category: 'baking', typical_unit: 'lb', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'olive oil', aliases: ['extra virgin olive oil', 'evoo', 'pure olive oil'], category: 'oils', typical_unit: 'fl_oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 365 },
  { canonical_name: 'vegetable oil', aliases: ['canola oil', 'cooking oil'], category: 'oils', typical_unit: 'fl_oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 365 },
  { canonical_name: 'soy sauce', aliases: ['soya sauce', 'tamari', 'low sodium soy sauce'], category: 'condiments', typical_unit: 'fl_oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'salt', aliases: ['table salt', 'sea salt', 'kosher salt', 'iodized salt'], category: 'spices', typical_unit: 'oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 1825 },
  { canonical_name: 'black pepper', aliases: ['pepper', 'ground black pepper', 'peppercorns'], category: 'spices', typical_unit: 'oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'garlic powder', aliases: ['dried garlic', 'garlic seasoning'], category: 'spices', typical_unit: 'oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'onion powder', aliases: ['dried onion', 'onion seasoning'], category: 'spices', typical_unit: 'oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'paprika', aliases: ['sweet paprika', 'smoked paprika'], category: 'spices', typical_unit: 'oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'cumin', aliases: ['ground cumin', 'cumin powder'], category: 'spices', typical_unit: 'oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'oregano', aliases: ['dried oregano', 'oregano leaves'], category: 'spices', typical_unit: 'oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'basil', aliases: ['dried basil', 'sweet basil'], category: 'spices', typical_unit: 'oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'cinnamon', aliases: ['ground cinnamon', 'cinnamon powder'], category: 'spices', typical_unit: 'oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'chili powder', aliases: ['chilli powder', 'red chili powder'], category: 'spices', typical_unit: 'oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'tomato sauce', aliases: ['canned tomato sauce', 'tomato puree'], category: 'canned', typical_unit: 'oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'chicken broth', aliases: ['chicken stock', 'chicken bouillon'], category: 'canned', typical_unit: 'fl_oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'beef broth', aliases: ['beef stock', 'beef bouillon'], category: 'canned', typical_unit: 'fl_oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'honey', aliases: ['pure honey', 'raw honey', 'organic honey'], category: 'condiments', typical_unit: 'oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 1095 },
  { canonical_name: 'peanut butter', aliases: ['pb', 'creamy peanut butter', 'crunchy peanut butter'], category: 'condiments', typical_unit: 'oz', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 180 },
  { canonical_name: 'bread', aliases: ['white bread', 'wheat bread', 'whole grain bread', 'loaf'], category: 'bakery', typical_unit: 'loaf', typical_location: 'pantry', is_perishable: true, typical_shelf_life_days: 7 },
  { canonical_name: 'tortillas', aliases: ['flour tortillas', 'corn tortillas', 'wraps'], category: 'bakery', typical_unit: 'pack', typical_location: 'pantry', is_perishable: true, typical_shelf_life_days: 14 },

  // Grains & Legumes (5)
  { canonical_name: 'quinoa', aliases: ['white quinoa', 'red quinoa', 'tri-color quinoa'], category: 'grains', typical_unit: 'lb', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'lentils', aliases: ['red lentils', 'green lentils', 'brown lentils'], category: 'grains', typical_unit: 'lb', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'oats', aliases: ['oatmeal', 'rolled oats', 'quick oats', 'old fashioned oats'], category: 'grains', typical_unit: 'lb', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 365 },
  { canonical_name: 'couscous', aliases: ['israeli couscous', 'pearl couscous'], category: 'grains', typical_unit: 'lb', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
  { canonical_name: 'barley', aliases: ['pearl barley', 'hulled barley'], category: 'grains', typical_unit: 'lb', typical_location: 'pantry', is_perishable: false, typical_shelf_life_days: 730 },
];

async function seedCanonicalItems() {
  console.log('🌱 Seeding canonical items...\n');

  // Check if already seeded
  const { count: existingCount } = await supabase
    .from('canonical_items')
    .select('*', { count: 'exact', head: true });

  if (existingCount && existingCount > 0) {
    console.log(`⚠️  Found ${existingCount} existing canonical items.`);
    console.log('Clearing existing items...');
    await supabase.from('canonical_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  let inserted = 0;
  let failed = 0;

  for (const item of CANONICAL_ITEMS) {
    try {
      const { error } = await supabase
        .from('canonical_items')
        .insert(item);

      if (error) throw error;

      inserted++;
      console.log(`  ✅ ${inserted}/${CANONICAL_ITEMS.length}: ${item.canonical_name}`);
    } catch (error) {
      failed++;
      console.error(`  ❌ Failed to insert "${item.canonical_name}":`, error);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`  ✅ Inserted: ${inserted}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📈 Total items: ${CANONICAL_ITEMS.length}`);

  // Verify counts by category
  const { data: categories } = await supabase
    .from('canonical_items')
    .select('category');

  const categoryCounts = categories?.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\n📂 Category breakdown:');
  Object.entries(categoryCounts || {}).forEach(([category, count]) => {
    console.log(`  ${category}: ${count} items`);
  });
}

seedCanonicalItems().catch(console.error);
