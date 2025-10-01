interface ParsedShoppingItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
}

// Common units and their variations
const UNIT_PATTERNS = {
  // Weight
  'lb': ['lb', 'lbs', 'pound', 'pounds'],
  'oz': ['oz', 'ounce', 'ounces'],
  'g': ['g', 'gram', 'grams'],
  'kg': ['kg', 'kilogram', 'kilograms'],

  // Volume
  'gal': ['gal', 'gallon', 'gallons'],
  'qt': ['qt', 'quart', 'quarts'],
  'pt': ['pt', 'pint', 'pints'],
  'cup': ['cup', 'cups', 'c'],
  'fl oz': ['fl oz', 'fl. oz', 'fluid ounce', 'fluid ounces'],
  'l': ['l', 'liter', 'liters', 'litre', 'litres'],
  'ml': ['ml', 'milliliter', 'milliliters'],

  // Counting
  'piece': ['piece', 'pieces', 'pc', 'pcs', 'item', 'items'],
  'dozen': ['dozen', 'doz'],
  'pack': ['pack', 'packs', 'package', 'packages', 'pkg'],
  'bag': ['bag', 'bags'],
  'box': ['box', 'boxes'],
  'bunch': ['bunch', 'bunches'],
  'head': ['head', 'heads'],
  'can': ['can', 'cans'],
  'jar': ['jar', 'jars'],
  'bottle': ['bottle', 'bottles'],
  'loaf': ['loaf', 'loaves'],
};

// Category keywords for smart categorization
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Dairy': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'sour cream', 'cottage cheese', 'ice cream'],
  'Meat': ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'sausage', 'ham', 'ground meat', 'steak'],
  'Seafood': ['fish', 'salmon', 'tuna', 'shrimp', 'crab', 'lobster', 'cod', 'tilapia'],
  'Produce': ['apple', 'banana', 'orange', 'lettuce', 'tomato', 'potato', 'onion', 'carrot', 'broccoli', 'spinach', 'pepper', 'cucumber', 'celery'],
  'Bakery': ['bread', 'bagel', 'muffin', 'croissant', 'donut', 'cake', 'pie', 'cookie'],
  'Grains': ['rice', 'pasta', 'quinoa', 'oats', 'cereal', 'flour', 'noodles'],
  'Beverages': ['water', 'juice', 'soda', 'coffee', 'tea', 'beer', 'wine'],
  'Snacks': ['chips', 'crackers', 'popcorn', 'pretzels', 'nuts', 'candy', 'chocolate'],
  'Condiments': ['ketchup', 'mustard', 'mayo', 'sauce', 'dressing', 'oil', 'vinegar', 'salt', 'pepper', 'spice'],
  'Frozen': ['frozen', 'ice', 'pizza'],
  'Canned': ['beans', 'soup', 'corn', 'tuna', 'tomatoes'],
  'Other': []
};

/**
 * Parse shopping text input into structured data
 * Examples:
 * - "milk 2 gal" → {name: "Milk", quantity: 2, unit: "gal", category: "Dairy"}
 * - "3 apples" → {name: "Apples", quantity: 3, unit: "piece", category: "Produce"}
 * - "cheese" → {name: "Cheese", quantity: 1, unit: null, category: "Dairy"}
 * - "dozen eggs" → {name: "Eggs", quantity: 12, unit: "piece", category: "Dairy"}
 */
export function parseShoppingText(text: string): ParsedShoppingItem {
  if (!text || !text.trim()) {
    throw new Error('Empty text provided');
  }

  const normalizedText = text.trim().toLowerCase();

  // Initialize result
  let result: ParsedShoppingItem = {
    name: '',
    quantity: null,
    unit: null,
    category: 'Other'
  };

  // Try to extract quantity and unit patterns
  let remainingText = normalizedText;
  let quantityFound = false;

  // Pattern 1: "number unit item" (e.g., "2 lbs chicken")
  const pattern1 = /^(\d+\.?\d*)\s+([a-z]+\.?\s?[a-z]*)\s+(.+)$/;
  const match1 = pattern1.exec(normalizedText);
  if (match1) {
    const [, qty, possibleUnit, item] = match1;
    const standardUnit = findStandardUnit(possibleUnit);

    if (standardUnit) {
      result.quantity = parseFloat(qty);
      result.unit = standardUnit;
      result.name = capitalizeWords(item);
      quantityFound = true;
    } else {
      // Not a unit, treat as part of the name
      result.quantity = parseFloat(qty);
      result.name = capitalizeWords(`${possibleUnit} ${item}`);
      quantityFound = true;
    }
  }

  // Pattern 2: "number item" (e.g., "3 apples")
  if (!quantityFound) {
    const pattern2 = /^(\d+\.?\d*)\s+(.+)$/;
    const match2 = pattern2.exec(normalizedText);
    if (match2) {
      const [, qty, item] = match2;
      result.quantity = parseFloat(qty);
      result.name = capitalizeWords(item);

      // Try to infer unit from item name
      if (item.match(/bottle|can|jar|box|bag|pack|loaf|head|bunch/)) {
        const unitMatch = item.match(/(bottle|can|jar|box|bag|pack|loaf|head|bunch)/);
        if (unitMatch) {
          result.unit = findStandardUnit(unitMatch[1]) || null;
        }
      } else {
        result.unit = 'piece'; // Default for countable items
      }
      quantityFound = true;
    }
  }

  // Pattern 3: "dozen/couple/few item" (e.g., "dozen eggs")
  if (!quantityFound) {
    const pattern3 = /^(dozen|couple|few|several|bunch)\s+(.+)$/;
    const match3 = pattern3.exec(normalizedText);
    if (match3) {
      const [, amount, item] = match3;
      switch (amount) {
        case 'dozen':
          result.quantity = 12;
          result.unit = 'piece';
          break;
        case 'couple':
          result.quantity = 2;
          result.unit = 'piece';
          break;
        case 'few':
          result.quantity = 3;
          result.unit = 'piece';
          break;
        case 'several':
          result.quantity = 5;
          result.unit = 'piece';
          break;
        case 'bunch':
          result.quantity = 1;
          result.unit = 'bunch';
          break;
      }
      result.name = capitalizeWords(item);
      quantityFound = true;
    }
  }

  // Pattern 4: Just item name (e.g., "milk")
  if (!quantityFound) {
    result.name = capitalizeWords(normalizedText);
    result.quantity = 1;

    // Check if the item name contains a unit
    const words = normalizedText.split(' ');
    for (const word of words) {
      const unit = findStandardUnit(word);
      if (unit) {
        result.unit = unit;
        break;
      }
    }
  }

  // Smart category detection
  result.category = detectCategory(result.name);

  // Handle pluralization in the name
  result.name = handlePluralization(result.name, result.quantity);

  return result;
}

function findStandardUnit(text: string): string | null {
  const normalized = text.toLowerCase().trim();

  for (const [standard, variations] of Object.entries(UNIT_PATTERNS)) {
    if (variations.some(v => v === normalized)) {
      return standard;
    }
  }

  return null;
}

function detectCategory(itemName: string): string {
  const normalized = itemName.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(keyword => normalized.includes(keyword))) {
      return category;
    }
  }

  return 'Other';
}

function capitalizeWords(text: string): string {
  return text
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function handlePluralization(name: string, quantity: number | null): string {
  // If quantity is 1 or null, try to singularize
  if (quantity === 1 || quantity === null) {
    // Simple pluralization rules
    if (name.endsWith('ies')) {
      return name.slice(0, -3) + 'y';
    } else if (name.endsWith('ves')) {
      return name.slice(0, -3) + 'f';
    } else if (name.endsWith('es') && !name.endsWith('ches') && !name.endsWith('shes')) {
      return name.slice(0, -2);
    } else if (name.endsWith('s') && !name.endsWith('ss')) {
      return name.slice(0, -1);
    }
  }

  return name;
}

// History-based suggestions
let itemHistory: string[] = [];

export function addToHistory(itemName: string) {
  if (!itemHistory.includes(itemName)) {
    itemHistory.unshift(itemName);
    // Keep only last 50 items
    if (itemHistory.length > 50) {
      itemHistory = itemHistory.slice(0, 50);
    }
  }
}

export function getSuggestions(partial: string): string[] {
  if (!partial) return [];

  const normalized = partial.toLowerCase();
  return itemHistory
    .filter(item => item.toLowerCase().startsWith(normalized))
    .slice(0, 5);
}

export function clearHistory() {
  itemHistory = [];
}