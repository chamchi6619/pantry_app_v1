// Simple, fast normalization for ingredient matching
// Strips units, quantities, and common modifiers to get the core ingredient

const STOP_WORDS = new Set([
  'fresh', 'whole', 'low', 'fat', '2%', 'organic', 'unsalted', 'salted',
  'large', 'small', 'medium', 'extra', 'virgin', 'dried', 'frozen',
  'canned', 'chopped', 'sliced', 'diced', 'minced', 'ground', 'crushed',
  'grated', 'shredded', 'boneless', 'skinless', 'cooked', 'raw', 'ripe',
  'plain', 'all', 'purpose', 'self', 'rising', 'white', 'brown', 'dark',
  'light', 'heavy', 'thick', 'thin', 'fine', 'coarse', 'kosher', 'sea',
  'table', 'granulated', 'powdered', 'confectioners', 'icing'
]);

export function normalizeName(s: string): string {
  if (!s) return '';

  return s
    .toLowerCase()
    // Remove punctuation and special chars (but keep spaces)
    .replace(/[^a-z0-9\s]/g, ' ')
    // Remove measurements and units
    .replace(/\b(\d+([./]\d+)?|cup(s)?|tsp|tbsp|tablespoon(s)?|teaspoon(s)?|oz|ounce(s)?|lb(s)?|pound(s)?|g|gram(s)?|kg|kilogram(s)?|ml|liter(s)?|l|pinch(es)?|dash(es)?|handful(s)?|bunch(es)?|can(s)?|jar(s)?|package(s)?|packet(s)?|bag(s)?|box(es)?)\b/g, ' ')
    // Split and filter
    .split(/\s+/)
    .filter(w => w && !STOP_WORDS.has(w))
    // Crude singularization (remove trailing 's' from plurals)
    .map(w => {
      if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) {
        return w.slice(0, -1);
      }
      return w;
    })
    .join(' ')
    .trim();
}

// Normalize with caching for performance
const normalizeCache = new Map<string, string>();

export function normalizeNameCached(s: string): string {
  if (normalizeCache.has(s)) {
    return normalizeCache.get(s)!;
  }
  const normalized = normalizeName(s);
  normalizeCache.set(s, normalized);
  return normalized;
}

// Clear cache if it gets too large (simple memory management)
export function clearNormalizeCache(): void {
  if (normalizeCache.size > 1000) {
    normalizeCache.clear();
  }
}