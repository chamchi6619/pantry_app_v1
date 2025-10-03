import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface CanonicalItem {
  id: string;
  canonical_name: string;
  aliases: string[] | null;
}

interface PantryItem {
  id: string;
  name: string;
  normalized?: string;
  canonical_item_id?: string | null;
}

/**
 * Normalize text for fuzzy matching
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Calculate similarity score between two strings (Levenshtein distance)
 */
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1: string, s2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[s2.length][s1.length];
}

/**
 * Find best canonical item match using fuzzy matching
 */
function findBestMatch(
  pantryItemName: string,
  canonicalItems: CanonicalItem[]
): { canonical_item_id: string | null; confidence: number; matched_name: string | null } {
  const normalized = normalize(pantryItemName);

  let bestMatch: { id: string; score: number; name: string } | null = null;

  for (const canonical of canonicalItems) {
    // Check canonical name
    const canonicalNorm = normalize(canonical.canonical_name);
    let score = similarity(normalized, canonicalNorm);

    // Exact match bonus
    if (normalized === canonicalNorm) {
      score = 1.0;
    }

    // Substring match bonus
    if (normalized.includes(canonicalNorm) || canonicalNorm.includes(normalized)) {
      score = Math.max(score, 0.85);
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { id: canonical.id, score, name: canonical.canonical_name };
    }

    // Check aliases
    if (canonical.aliases) {
      for (const alias of canonical.aliases) {
        const aliasNorm = normalize(alias);
        let aliasScore = similarity(normalized, aliasNorm);

        if (normalized === aliasNorm) {
          aliasScore = 1.0;
        }

        if (normalized.includes(aliasNorm) || aliasNorm.includes(normalized)) {
          aliasScore = Math.max(aliasScore, 0.85);
        }

        if (!bestMatch || aliasScore > bestMatch.score) {
          bestMatch = { id: canonical.id, score: aliasScore, name: alias };
        }
      }
    }
  }

  // Only return match if confidence is high enough
  if (bestMatch && bestMatch.score >= 0.7) {
    return {
      canonical_item_id: bestMatch.id,
      confidence: bestMatch.score,
      matched_name: bestMatch.name
    };
  }

  return { canonical_item_id: null, confidence: 0, matched_name: null };
}

async function linkPantryItems() {
  console.log('🔗 Linking pantry items to canonical items...\n');

  // 1. Load canonical items
  const { data: canonical, error: canonicalError } = await supabase
    .from('canonical_items')
    .select('id, canonical_name, aliases');

  if (canonicalError) throw canonicalError;

  console.log(`✅ Loaded ${canonical.length} canonical items\n`);

  // 2. Load pantry items
  const { data: pantryItems, error: pantryError } = await supabase
    .from('pantry_items')
    .select('id, name, normalized, canonical_item_id');

  if (pantryError) throw pantryError;

  console.log(`📦 Found ${pantryItems.length} pantry items to link\n`);

  // 3. Match and update
  let matched = 0;
  let unmatched = 0;
  let alreadyLinked = 0;

  for (const item of pantryItems) {
    if (item.canonical_item_id) {
      alreadyLinked++;
      continue;
    }

    const match = findBestMatch(item.name, canonical);

    if (match.canonical_item_id) {
      await supabase
        .from('pantry_items')
        .update({ canonical_item_id: match.canonical_item_id })
        .eq('id', item.id);

      matched++;
      console.log(`✓ "${item.name}" → "${match.matched_name}" (${Math.round(match.confidence * 100)}%)`);
    } else {
      unmatched++;
      console.log(`✗ "${item.name}" - no match found`);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Matched: ${matched}`);
  console.log(`   Unmatched: ${unmatched}`);
  console.log(`   Already linked: ${alreadyLinked}`);
  console.log(`   Total: ${pantryItems.length}\n`);

  console.log('✅ Pantry items linking complete!\n');
}

linkPantryItems().catch(console.error);
