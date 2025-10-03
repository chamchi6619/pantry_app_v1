function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    // Remove "s " prefix (parser bug)
    .replace(/^s\s+/, '')
    // Remove diet/quality modifiers
    .replace(/\b(low-fat|lowfat|reduced-fat|fat-free|nonfat|non-fat)\b/gi, '')
    .replace(/\b(low-sodium|reduced-sodium|sodium-free)\b/gi, '')
    .replace(/\b(lite|light|reduced|part-skim|plain)\b/gi, '')
    // Remove apple varieties (map to "apples")
    .replace(/\b(granny smith|gala|fuji|honeycrisp|red delicious|tart)\s+(apple)/gi, '$2')
    // Remove common prep words
    .replace(/\b(finely|coarsely|freshly|thinly|thickly|roughly|lightly)\s+/g, '')
    .replace(/\b(chopped|sliced|diced|minced|grated|shredded|crushed|ground|whole)\b/g, '')
    .replace(/\b(fresh|dried|frozen|canned|raw|roasted|toasted|cooked|prepared|uncooked)\b/g, '')
    .replace(/\b(instant|quick-cooking|rapid-rise|ready-to-eat)\b/g, '')
    // Remove quantity/container words
    .replace(/\b(bunch|sprig|sprigs|leaves|leaf|clove|cloves|head|heads|piece|pieces)\s+(of\s+)?/g, '')
    .replace(/\b(pinch|dash|envelope|can|jar|package|box|container)\s+(of\s+)?/g, '')
    // Remove state descriptors
    .replace(/\b(peeled|seeded|trimmed|drained|rinsed|scrubbed|halved|quartered|pitted|cubed)\b/g, '')
    .replace(/\b(divided|plus more|to taste|optional|if desired|if needed)\b/g, '')
    // Remove "or X" alternatives
    .replace(/\s+or\s+\w+(\s+\w+)?/g, '')
    // Remove parenthetical content
    .replace(/\([^)]*\)/g, '')
    // Remove measurement words
    .replace(/\b(cup|cups|tablespoon|tablespoons|teaspoon|teaspoons|tbsp|tsp|oz|ounce|ounces|lb|pound|pounds|g|gram|grams|ml|liter|liters)\b/g, '')
    // Remove numbers and measurements like "1 ", "2.5 ", etc
    .replace(/\b\d+(\.\d+)?\s*/g, '')
    // Clean up extra spaces, commas, dashes
    .replace(/[,;]+/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const testCases = [
  "low-fat vanilla yogurt",
  "plain yogurt",
  "plain low-fat yogurt",
  "s lite whipped topping",
  "s pancake mix",
  "s apricot spread",
  "s yellow summer squash",
  "tart apple",
  "granny smith apple",
  "Gala or Fuji apple",
];

console.log('NORMALIZATION TESTS:\n');
testCases.forEach(test => {
  const normalized = normalize(test);
  console.log(`"${test}"`);
  console.log(`  → "${normalized}"`);
  console.log('');
});
