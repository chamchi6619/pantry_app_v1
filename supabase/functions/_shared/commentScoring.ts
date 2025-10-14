/**
 * Comment Scoring Heuristic
 *
 * Purpose: Score YouTube comments for likelihood of containing ingredient lists
 *
 * Strategy:
 * - Look for structural signals (bullets, numbers, quantities)
 * - Look for explicit keywords ("ingredients", "recipe")
 * - Penalize spam patterns ("subscribe", "link in bio")
 * - Boost high-quality comments (highly liked, from creator)
 *
 * Threshold: score >= 30 = likely ingredient list
 *
 * Expected Success Rate: 15-25% of comments score >= 30
 */

import { YouTubeComment } from './commentHarvester.ts';

export interface CommentScore {
  comment: YouTubeComment;
  score: number;
  signals: string[];
  breakdown: Record<string, number>;
}

/**
 * Score a comment for ingredient list likelihood
 *
 * Scoring breakdown:
 * - Strong signals: 10 pts each (keywords like "ingredient", "recipe")
 * - Structure signals: 5 pts each (bullets, numbers)
 * - Quantity signals: 3 pts each (measurements like "1 cup", "2 tbsp")
 * - List structure bonus: 15 pts (5+ lines with numbers)
 * - Spam penalty: -10 pts
 *
 * @param comment - YouTube comment to score
 * @returns Score (0-100+) with breakdown
 */
export function scoreCommentForIngredients(comment: YouTubeComment): CommentScore {
  const text = comment.text;
  const breakdown: Record<string, number> = {};
  const signals: string[] = [];
  let score = 0;

  // Signal 1: Explicit ingredient keywords (10 pts each)
  if (/ingredient/i.test(text)) {
    score += 10;
    breakdown.keyword_ingredient = 10;
    signals.push('keyword:ingredient');
  }

  if (/recipe/i.test(text)) {
    score += 10;
    breakdown.keyword_recipe = 10;
    signals.push('keyword:recipe');
  }

  if (/you need|you'll need|you will need/i.test(text)) {
    score += 10;
    breakdown.keyword_you_need = 10;
    signals.push('keyword:you_need');
  }

  // Signal 2: List structure bullets (5 pts each, max 25)
  const bulletMatches = text.match(/[▢▣□☐•●○◦⦿⦾\-\*]/g) || [];
  const bulletCount = bulletMatches.length;
  if (bulletCount > 0) {
    const bulletPoints = Math.min(bulletCount, 5) * 5;
    score += bulletPoints;
    breakdown.bullets = bulletPoints;
    signals.push(`bullets:${bulletCount}`);
  }

  // Signal 3: Quantity measurements (3 pts each, max 30)
  const quantityMatches = text.match(/\d+\s*(cup|cups|tbsp|tbs|tsp|lb|lbs|oz|g|kg|ml|l|clove|cloves|piece|pieces)/gi) || [];
  const quantityCount = quantityMatches.length;
  if (quantityCount > 0) {
    const quantityPoints = Math.min(quantityCount, 10) * 3;
    score += quantityPoints;
    breakdown.quantities = quantityPoints;
    signals.push(`quantities:${quantityCount}`);
  }

  // Signal 4: Fractions (3 pts each, max 15)
  const fractionMatches = text.match(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+\/\d+/g) || [];
  const fractionCount = fractionMatches.length;
  if (fractionCount > 0) {
    const fractionPoints = Math.min(fractionCount, 5) * 3;
    score += fractionPoints;
    breakdown.fractions = fractionPoints;
    signals.push(`fractions:${fractionCount}`);
  }

  // Signal 5: List structure (lines with numbers) - 15 pts bonus
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const linesWithNumbers = lines.filter(l => /\d/.test(l)).length;
  if (linesWithNumbers >= 5) {
    score += 15;
    breakdown.list_structure = 15;
    signals.push('list_structure:5+_lines');
  }

  // Signal 6: High like count bonus (popular = quality)
  // 1-10 likes: +5, 11-50: +10, 51+: +15
  if (comment.likeCount > 0) {
    let likeBonus = 0;
    if (comment.likeCount >= 51) {
      likeBonus = 15;
    } else if (comment.likeCount >= 11) {
      likeBonus = 10;
    } else {
      likeBonus = 5;
    }
    score += likeBonus;
    breakdown.like_bonus = likeBonus;
    signals.push(`likes:${comment.likeCount}`);
  }

  // Penalty: Spam patterns (-10 pts)
  const spamPatterns = [
    /subscribe/i,
    /follow me/i,
    /link in bio/i,
    /check out/i,
    /click here/i,
    /buy now/i,
  ];

  for (const pattern of spamPatterns) {
    if (pattern.test(text)) {
      score -= 10;
      breakdown.spam_penalty = (breakdown.spam_penalty || 0) - 10;
      signals.push('spam_detected');
      break; // Only penalize once
    }
  }

  return {
    comment,
    score: Math.max(0, score), // Floor at 0
    signals,
    breakdown,
  };
}

/**
 * Score multiple comments and sort by score
 *
 * @param comments - Array of comments
 * @returns Array of scored comments, sorted by score (descending)
 */
export function scoreAndRankComments(comments: YouTubeComment[]): CommentScore[] {
  const scored = comments.map(c => scoreCommentForIngredients(c));

  // Sort by score (highest first)
  scored.sort((a, b) => b.score - a.score);

  return scored;
}

/**
 * Find best ingredient comment from array
 *
 * Returns the highest-scoring comment that meets the threshold
 *
 * @param comments - Array of comments
 * @param threshold - Minimum score to be considered (default: 30)
 * @returns Best comment or null if none meet threshold
 */
export function findBestIngredientComment(
  comments: YouTubeComment[],
  threshold: number = 30
): CommentScore | null {
  const scored = scoreAndRankComments(comments);

  // Return first comment that meets threshold
  const best = scored.find(s => s.score >= threshold);

  if (best) {
    console.log(
      `✅ Found ingredient comment (score: ${best.score}, signals: ${best.signals.join(', ')})`
    );
  } else {
    console.log(`⚠️  No comments met threshold (best score: ${scored[0]?.score || 0})`);
  }

  return best || null;
}

/**
 * Get top N ingredient comments
 *
 * @param comments - Array of comments
 * @param n - Number of top comments to return
 * @param threshold - Minimum score to be considered
 * @returns Top N comments that meet threshold
 */
export function getTopIngredientComments(
  comments: YouTubeComment[],
  n: number = 3,
  threshold: number = 30
): CommentScore[] {
  const scored = scoreAndRankComments(comments);

  return scored
    .filter(s => s.score >= threshold)
    .slice(0, n);
}

/**
 * Format score breakdown for logging/debugging
 *
 * @param score - Comment score result
 * @returns Formatted string
 */
export function formatScoreBreakdown(score: CommentScore): string {
  const parts = [`Score: ${score.score}`];

  for (const [key, value] of Object.entries(score.breakdown)) {
    parts.push(`${key}: ${value > 0 ? '+' : ''}${value}`);
  }

  parts.push(`Signals: ${score.signals.join(', ')}`);

  return parts.join(' | ');
}

/**
 * Analyze comment corpus for telemetry
 *
 * @param comments - Array of comments
 * @returns Statistics about comment scores
 */
export function analyzeCommentScores(comments: YouTubeComment[]): {
  total_comments: number;
  avg_score: number;
  max_score: number;
  above_threshold: number;
  threshold: number;
  top_signals: Record<string, number>;
} {
  const scored = comments.map(c => scoreCommentForIngredients(c));
  const threshold = 30;

  const avgScore = scored.length > 0
    ? scored.reduce((sum, s) => sum + s.score, 0) / scored.length
    : 0;

  const maxScore = scored.length > 0
    ? Math.max(...scored.map(s => s.score))
    : 0;

  const aboveThreshold = scored.filter(s => s.score >= threshold).length;

  // Count signal frequencies
  const signalCounts: Record<string, number> = {};
  for (const s of scored) {
    for (const signal of s.signals) {
      signalCounts[signal] = (signalCounts[signal] || 0) + 1;
    }
  }

  return {
    total_comments: comments.length,
    avg_score: Math.round(avgScore * 10) / 10,
    max_score: maxScore,
    above_threshold: aboveThreshold,
    threshold,
    top_signals: signalCounts,
  };
}

/**
 * Feature flag: Enable/disable comment scoring
 */
export function isCommentScoringEnabled(): boolean {
  const envFlag = Deno.env.get('ENABLE_COMMENT_SCORING');
  if (envFlag !== undefined) {
    return envFlag.toLowerCase() === 'true';
  }
  // Default: enabled
  return true;
}
