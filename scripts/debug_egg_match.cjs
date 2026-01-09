const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function normalize(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/^s\s+/, '')
    .replace(/\b(low-fat|lowfat|reduced-fat|fat-free|nonfat|non-fat)\b/gi, '')
    .replace(/\b(low-sodium|reduced-sodium|sodium-free)\b/gi, '')
    .replace(/\b(lite|light|reduced|part-skim|plain)\b/gi, '')
    .replace(/\b(granny smith|gala|fuji|honeycrisp|red delicious|tart)\s+(apple)/gi, '$2')
    .replace(/\b(kirkland|365|great value|member's mark|store brand|organic)\b/gi, '')
    .replace(/\b(finely|coarsely|freshly|thinly|thickly|roughly|lightly)\s+/g, '')
    .replace(/\b(chopped|sliced|diced|minced|grated|shredded|crushed|ground|whole)\b/g, '')
    .replace(/\b(fresh|dried|frozen|canned|raw|roasted|toasted|cooked|prepared|uncooked)\b/g, '')
    .replace(/\b(instant|quick-cooking|rapid-rise|ready-to-eat)\b/g, '')
    .replace(/\b(bunch|sprig|sprigs|leaves|leaf|clove|cloves|head|heads|piece|pieces)\s+(of\s+)?/g, '')
    .replace(/\b(pinch|dash|envelope|can|jar|package|box|container)\s+(of\s+)?/g, '')
    .replace(/\b(peeled|seeded|trimmed|drained|rinsed|scrubbed|halved|quartered|pitted|cubed)\b/g, '')
    .replace(/\b(divided|plus more|to taste|optional|if desired|if needed)\b/g, '')
    .replace(/\s+or\s+\w+(\s+\w+)?/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(cup|cups|tablespoon|tablespoons|teaspoon|teaspoons|tbsp|tsp|oz|ounce|ounces|lb|pound|pounds|g|gram|grams|ml|liter|liters)\b/g, '')
    .replace(/\b\d+(\.\d+)?\s*/g, '')
    .replace(/[,;]+/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function debugEgg() {
  const input = "Organic Brown Eggs Grade A";
  const normalized = normalize(input);

  console.log(`Input: "${input}"`);
  console.log(`Normalized: "${normalized}"\n`);

  // Check if "egg" exists in canonical_items
  const { data: eggItems } = await supabase
    .from('canonical_items')
    .select('id, name, aliases')
    .or('name.eq.egg,name.eq.eggs');

  console.log('Canonical items matching "egg" or "eggs":');
  eggItems?.forEach(item => {
    const itemNorm = normalize(item.name);
    const contains = normalized.includes(itemNorm);
    console.log(`  - name: "${item.name}" (normalized: "${itemNorm}")`);
    console.log(`    aliases: ${JSON.stringify(item.aliases)}`);
    console.log(`    "${normalized}".includes("${itemNorm}"): ${contains}`);
  });

  // Check what "brown eggs grade a" contains
  console.log(`\nChecking contains logic:`);
  console.log(`  "brown eggs grade a".includes("egg"): ${normalized.includes('egg')}`);
  console.log(`  "egg".length >= 4: ${('egg').length >= 4}`);
}

debugEgg();
