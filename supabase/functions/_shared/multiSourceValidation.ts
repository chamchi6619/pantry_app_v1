/**
 * Multi-Source Cross-Validation
 *
 * Purpose: Validate and merge ingredients from multiple extraction sources
 * Sources: Vision, ASR, Transcript, LLM text extraction
 *
 * Strategy:
 * - If multiple sources agree → High confidence
 * - If sources conflict → Flag for review (amber confidence)
 * - Combine unique ingredients from all sources
 */

import { RawLLMIngredient } from "./llm.ts";

export interface SourcedIngredient extends RawLLMIngredient {
  source: 'vision' | 'asr' | 'transcript' | 'llm_text' | 'youtube_comment';
  confidence: number;
}

export interface ValidationResult {
  ingredients: SourcedIngredient[];
  conflicts: IngredientConflict[];
  overall_confidence: number;
  sources_used: string[];
}

export interface IngredientConflict {
  ingredient_name: string;
  vision_amount?: number;
  asr_amount?: number;
  transcript_amount?: number;
  recommended_action: 'review' | 'prefer_vision' | 'prefer_audio';
}

/**
 * Normalize ingredient name for matching
 */
function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/s$/, '') // Remove plural
    .replace(/[^\w\s]/g, ''); // Remove punctuation
}

/**
 * Cross-validate ingredients from multiple sources
 *
 * Logic:
 * 1. Group ingredients by normalized name
 * 2. If multiple sources agree on amount → Use that amount (high confidence)
 * 3. If sources conflict → Flag for review (medium confidence)
 * 4. If only one source → Use that source (medium confidence)
 *
 * @param visionIngredients - Ingredients from Vision L4
 * @param asrIngredients - Ingredients from ASR L5
 * @param transcriptIngredients - Ingredients from Transcript (free)
 * @returns Validated and merged ingredient list
 */
export function crossValidateIngredients(
  visionIngredients: RawLLMIngredient[] = [],
  asrIngredients: RawLLMIngredient[] = [],
  transcriptIngredients: RawLLMIngredient[] = []
): ValidationResult {
  const sourcesUsed: string[] = [];
  if (visionIngredients.length > 0) sourcesUsed.push('vision');
  if (asrIngredients.length > 0) sourcesUsed.push('asr');
  if (transcriptIngredients.length > 0) sourcesUsed.push('transcript');

  console.log(`🔍 Cross-validating ingredients from ${sourcesUsed.length} sources`);

  // Map: normalized_name → list of sourced ingredients
  const ingredientMap = new Map<string, SourcedIngredient[]>();

  // Add all ingredients to map
  for (const ing of visionIngredients) {
    const normalized = normalizeIngredientName(ing.name);
    if (!ingredientMap.has(normalized)) {
      ingredientMap.set(normalized, []);
    }
    ingredientMap.get(normalized)!.push({
      ...ing,
      source: 'vision',
      confidence: 0.85, // Vision is generally reliable
    });
  }

  for (const ing of asrIngredients) {
    const normalized = normalizeIngredientName(ing.name);
    if (!ingredientMap.has(normalized)) {
      ingredientMap.set(normalized, []);
    }
    ingredientMap.get(normalized)!.push({
      ...ing,
      source: 'asr',
      confidence: 0.80, // ASR slightly less reliable (transcription errors)
    });
  }

  for (const ing of transcriptIngredients) {
    const normalized = normalizeIngredientName(ing.name);
    if (!ingredientMap.has(normalized)) {
      ingredientMap.set(normalized, []);
    }
    ingredientMap.get(normalized)!.push({
      ...ing,
      source: 'transcript',
      confidence: 0.75, // Transcript may have timing/context issues
    });
  }

  // Resolve conflicts and merge
  const mergedIngredients: SourcedIngredient[] = [];
  const conflicts: IngredientConflict[] = [];

  for (const [normalizedName, sources] of ingredientMap.entries()) {
    if (sources.length === 1) {
      // Single source - use as-is
      mergedIngredients.push(sources[0]);
    } else {
      // Multiple sources - check for agreement
      const amounts = sources
        .map(s => s.amount)
        .filter(a => a !== undefined && a !== null) as number[];

      if (amounts.length === 0) {
        // No amounts specified by any source - just use first occurrence
        mergedIngredients.push(sources[0]);
      } else if (amounts.length === 1) {
        // Only one source specified amount - use that
        const sourceWithAmount = sources.find(s => s.amount !== undefined);
        mergedIngredients.push(sourceWithAmount!);
      } else {
        // Multiple amounts - check for agreement
        const uniqueAmounts = [...new Set(amounts)];

        if (uniqueAmounts.length === 1) {
          // All sources agree - high confidence!
          mergedIngredients.push({
            ...sources[0],
            confidence: 0.95, // Boosted confidence (multiple sources agree)
            evidence_phrase: sources.map(s => s.evidence_phrase).filter(Boolean).join(' | '),
          });
        } else {
          // Conflict detected!
          const conflict: IngredientConflict = {
            ingredient_name: sources[0].name,
            vision_amount: sources.find(s => s.source === 'vision')?.amount as number | undefined,
            asr_amount: sources.find(s => s.source === 'asr')?.amount as number | undefined,
            transcript_amount: sources.find(s => s.source === 'transcript')?.amount as number | undefined,
            recommended_action: 'prefer_vision', // Default to vision (more accurate for measurements)
          };

          conflicts.push(conflict);

          // Use vision amount if available (visual measurements more accurate)
          const preferredSource = sources.find(s => s.source === 'vision') || sources[0];
          mergedIngredients.push({
            ...preferredSource,
            confidence: 0.65, // Reduced confidence due to conflict
          });

          console.warn(`⚠️  Conflict: ${sources[0].name} - Vision: ${conflict.vision_amount}, ASR: ${conflict.asr_amount}, Transcript: ${conflict.transcript_amount}`);
        }
      }
    }
  }

  // Calculate overall confidence
  const avgConfidence = mergedIngredients.reduce((sum, ing) => sum + ing.confidence, 0) / mergedIngredients.length;
  const overallConfidence = conflicts.length > 0
    ? Math.max(avgConfidence - 0.1, 0.60) // Penalize for conflicts
    : avgConfidence;

  console.log(`✅ Merged ${mergedIngredients.length} ingredients from ${sourcesUsed.length} sources (${conflicts.length} conflicts)`);
  console.log(`   Overall confidence: ${overallConfidence.toFixed(2)}`);

  return {
    ingredients: mergedIngredients,
    conflicts,
    overall_confidence: overallConfidence,
    sources_used: sourcesUsed,
  };
}

/**
 * Combine text from multiple sources for LLM extraction
 *
 * Formats multi-source text in a way that helps LLM understand context
 *
 * @param title - Recipe title
 * @param description - Original description (L1)
 * @param transcript - YouTube transcript (L2.5)
 * @param visionIngredients - Ingredients extracted by Vision (L4)
 * @param asrTranscript - Audio transcript from ASR (L5)
 * @returns Combined text for LLM
 */
export function combineMultiSourceText(
  title: string,
  description: string,
  transcript?: string,
  visionIngredients?: RawLLMIngredient[],
  asrTranscript?: string
): string {
  const sections: string[] = [];

  sections.push(`Title: "${title}"`);
  sections.push('');

  if (description) {
    sections.push('=== Original Description ===');
    sections.push(description.slice(0, 2000));
    sections.push('');
  }

  if (transcript) {
    sections.push('=== YouTube Transcript (Auto-Generated) ===');
    sections.push(transcript.slice(0, 2000));
    sections.push('');
  }

  if (visionIngredients && visionIngredients.length > 0) {
    sections.push('=== Ingredients Seen on Screen (Vision Analysis) ===');
    for (const ing of visionIngredients) {
      const amountStr = ing.amount && ing.unit ? `${ing.amount} ${ing.unit}` : '';
      sections.push(`- ${ing.name}${amountStr ? ': ' + amountStr : ''}`);
    }
    sections.push('');
  }

  if (asrTranscript) {
    sections.push('=== Audio Narration (Whisper Transcription) ===');
    sections.push(asrTranscript.slice(0, 2000));
    sections.push('');
  }

  sections.push('Extract the complete ingredient list by combining ALL sources above.');
  sections.push('Prioritize visual measurements (more accurate) over audio if they conflict.');

  return sections.join('\n');
}

/**
 * Calculate extraction cost from multiple sources
 */
export function calculateMultiSourceCost(
  visionCost: number,
  asrCost: number,
  llmCost: number
): { total_cents: number; breakdown: Record<string, number> } {
  return {
    total_cents: visionCost + asrCost + llmCost,
    breakdown: {
      vision_l4: visionCost,
      asr_l5: asrCost,
      llm_extraction: llmCost,
    },
  };
}
