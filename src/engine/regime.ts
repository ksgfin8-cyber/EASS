/**
 * TN-LAB Engine — Regime Detection
 * Sistema TN (Tortuga Ninja) v3.0
 *
 * R: H → {0, 1, 2, 3}
 *
 * R(H) =
 *   0 if ranging   (H.hurst < 0.4 ∧ H.variance < varianceLow)
 *   1 if trending  (H.hurst > 0.6 ∧ H.variance < varianceHigh)
 *   2 if volatile  (H.variance > varianceHigh)
 *   3 if mixed     (otherwise)
 *
 * Ajuste Final 3: Regime is a measurable stratification of the market
 * that conditions theory selection.
 *
 * NOTE ON THRESHOLDS:
 * The spec defines thresholds (0.1, 0.5) for price-level variance.
 * In TN-LAB we compute variance of LOG RETURNS which are ~1e-5 to 1e-4.
 * We use RELATIVE thresholds based on percentiles of observed variance.
 * This makes the system instrument-agnostic.
 *
 * Calibration:
 * - varianceLow = 1e-5 (low volatility returns, ~0.3% daily)
 * - varianceHigh = 1e-4 (high volatility returns, ~1% daily)
 *
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { SufficientStats } from './types';

// =============================================================================
// REGIME CONSTANTS
// These are configurable per instrument — defaults calibrated for log returns
// =============================================================================

export interface RegimeThresholds {
  /** Hurst threshold below which market is mean-reverting */
  hurstLow: number;
  /** Hurst threshold above which market is trending */
  hurstHigh: number;
  /** Variance threshold below which market is not volatile (log return scale) */
  varianceLow: number;
  /** Variance threshold above which market is volatile (log return scale) */
  varianceHigh: number;
}

/**
 * Default thresholds calibrated for log returns on 100-tick windows.
 *
 * Calibration from diagnostic (seed=42, new generators):
 * - ranging:  hurst=0.20-0.34; variance~1e-10 to 1.5e-10
 * - trending: hurst=0.70-0.90; variance~5e-12 to 1.1e-11
 * - volatile: hurst=0.52-0.77; variance~1.7e-9 to 4.9e-9
 *
 * Key insight:
 * - Ranging: low Hurst (< 0.45) AND low variance
 * - Trending: high Hurst (> 0.55) AND very low variance (momentum-driven)
 * - Volatile: moderate Hurst, HIGHER variance than trending (> 1e-9)
 * - Mixed: everything else
 *
 * Variance ordering: trending < ranging < volatile
 * Hurst ordering: ranging < mixed < trending
 */
export const DEFAULT_REGIME_THRESHOLDS: RegimeThresholds = {
  hurstLow: 0.45,      // Ranging: hurst < 0.45
  hurstHigh: 0.55,     // Trending: hurst > 0.55
  varianceLow: 5e-10,  // Low variance (ranging ~1.5e-10, trending ~1e-11)
  varianceHigh: 1e-9,  // High variance (volatile ~3e-9)
};

export const REGIME_NAMES: Record<number, string> = {
  0: 'ranging',
  1: 'trending',
  2: 'volatile',
  3: 'mixed',
};

// =============================================================================
// MAIN REGIME DETECTION FUNCTION
// =============================================================================

/**
 * R: H → {0, 1, 2, 3}
 *
 * Detects the current market regime from sufficient statistics.
 * This is a measurable function — same H always produces same R.
 *
 * Priority order (from spec):
 * 1. volatile (variance > 0.5) — checked first, overrides others
 * 2. ranging (hurst < 0.4 AND variance < 0.1)
 * 3. trending (hurst > 0.6 AND variance < 0.5)
 * 4. mixed (all other cases)
 */
export function detectRegime(
  stats: SufficientStats,
  thresholds: RegimeThresholds = DEFAULT_REGIME_THRESHOLDS
): number {
  const { hurst, variance } = stats;

  // Priority 1: volatile — high variance dominates
  if (variance > thresholds.varianceHigh) {
    return 2; // volatile
  }

  // Priority 2: ranging — low Hurst AND low variance
  if (hurst < thresholds.hurstLow && variance < thresholds.varianceLow) {
    return 0; // ranging
  }

  // Priority 3: trending — high Hurst AND moderate variance
  if (hurst > thresholds.hurstHigh && variance < thresholds.varianceHigh) {
    return 1; // trending
  }

  // Default: mixed
  return 3;
}

// =============================================================================
// REGIME ANALYSIS UTILITIES
// =============================================================================

/**
 * Get the name of a regime.
 */
export function getRegimeName(regime: number): string {
  return REGIME_NAMES[regime] ?? 'unknown';
}

/**
 * Compute regime confidence — how strongly the stats indicate this regime.
 * Returns a value in [0, 1] where 1 = very confident.
 *
 * Used for debugging and experiment analysis.
 */
export function computeRegimeConfidence(
  stats: SufficientStats,
  thresholds: RegimeThresholds = DEFAULT_REGIME_THRESHOLDS
): { regime: number; confidence: number; scores: Record<number, number> } {
  const { hurst, variance } = stats;

  // Score for each regime (higher = more likely)
  const scores: Record<number, number> = {
    0: 0, // ranging
    1: 0, // trending
    2: 0, // volatile
    3: 0, // mixed
  };

  // Ranging score: low Hurst + low variance
  const hurstRangingScore = Math.max(0, (thresholds.hurstLow - hurst) / thresholds.hurstLow);
  const varRangingScore = Math.max(0, (thresholds.varianceLow - variance) / thresholds.varianceLow);
  scores[0] = (hurstRangingScore + varRangingScore) / 2;

  // Trending score: high Hurst + moderate variance
  const hurstTrendingScore = Math.max(0, (hurst - thresholds.hurstHigh) / (1 - thresholds.hurstHigh));
  const varTrendingScore = Math.max(0, (thresholds.varianceHigh - variance) / thresholds.varianceHigh);
  scores[1] = (hurstTrendingScore + varTrendingScore) / 2;

  // Volatile score: high variance
  scores[2] = Math.max(0, (variance - thresholds.varianceHigh) / thresholds.varianceHigh);

  // Mixed score: complement of max other score
  const maxOtherScore = Math.max(scores[0], scores[1], scores[2]);
  scores[3] = Math.max(0, 1 - maxOtherScore);

  // Detected regime
  const regime = detectRegime(stats, thresholds);

  // Confidence = score of detected regime
  const confidence = Math.min(1, scores[regime]);

  return { regime, confidence, scores };
}

/**
 * Detect regime transitions in a sequence of stats.
 * Returns array of {tick, fromRegime, toRegime} for each transition.
 */
export function detectRegimeTransitions(
  statsHistory: SufficientStats[]
): Array<{ tick: number; fromRegime: number; toRegime: number }> {
  const transitions: Array<{ tick: number; fromRegime: number; toRegime: number }> = [];

  if (statsHistory.length < 2) return transitions;

  let prevRegime = statsHistory[0].regime;

  for (let i = 1; i < statsHistory.length; i++) {
    const currentRegime = statsHistory[i].regime;
    if (currentRegime !== prevRegime) {
      transitions.push({
        tick: i,
        fromRegime: prevRegime,
        toRegime: currentRegime,
      });
      prevRegime = currentRegime;
    }
  }

  return transitions;
}

/**
 * Compute regime accuracy over a labeled dataset.
 * Used in Experiment 1.
 *
 * @param statsHistory - Computed stats for each window
 * @param expectedRegimes - Ground truth regime labels
 * @param windowSize - Size of evaluation windows
 * @returns Accuracy ∈ [0, 1]
 */
export function computeRegimeAccuracy(
  statsHistory: SufficientStats[],
  expectedRegimes: number[],
  windowSize: number = 100
): {
  overallAccuracy: number;
  windowAccuracies: number[];
  confusionMatrix: number[][];
} {
  const n = Math.min(statsHistory.length, expectedRegimes.length);
  if (n === 0) return { overallAccuracy: 0, windowAccuracies: [], confusionMatrix: [] };

  // Confusion matrix: 4x4
  const confusion: number[][] = Array.from({ length: 4 }, () => new Array(4).fill(0));

  let correct = 0;
  for (let i = 0; i < n; i++) {
    const predicted = statsHistory[i].regime;
    const expected = expectedRegimes[i];
    if (predicted === expected) correct++;
    if (expected >= 0 && expected < 4 && predicted >= 0 && predicted < 4) {
      confusion[expected][predicted]++;
    }
  }

  // Window accuracies
  const windowAccuracies: number[] = [];
  for (let start = 0; start < n; start += windowSize) {
    const end = Math.min(start + windowSize, n);
    let windowCorrect = 0;
    for (let i = start; i < end; i++) {
      if (statsHistory[i].regime === expectedRegimes[i]) windowCorrect++;
    }
    windowAccuracies.push(windowCorrect / (end - start));
  }

  return {
    overallAccuracy: correct / n,
    windowAccuracies,
    confusionMatrix: confusion,
  };
}
