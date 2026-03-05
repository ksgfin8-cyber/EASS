/**
 * TN-LAB Engine — Entropy (Invariant I₅)
 * Sistema TN (Tortuga Ninja) v3.0
 *
 * I₅: H(T) > h_min, h_min = 0.5
 * H(T) = -Σ p_i log(p_i)
 *
 * The system must maintain theoretical diversity.
 * If entropy drops below h_min, forced exploration is triggered.
 *
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, EntropyResult, TN_CONSTANTS, THEORY_COUNT } from './types';

// =============================================================================
// MAIN ENTROPY COMPUTATION
// =============================================================================

/**
 * Compute Shannon entropy of theory usage distribution.
 * H(T) = -Σ p_i log(p_i)
 *
 * @param theoryHistory - Array of theory IDs used over time
 * @param windowSize - Number of recent activations to consider (default: 100)
 * @returns EntropyResult with entropy value and usage statistics
 */
export function computeTheoryEntropy(
  theoryHistory: TheoryID[],
  windowSize: number = 100
): EntropyResult {
  // Use recent window
  const window = theoryHistory.slice(-windowSize);
  const total = window.length;

  if (total === 0) {
    return createEmptyEntropyResult();
  }

  // Count usage per theory
  const usageCounts: Record<TheoryID, number> = {
    [TheoryID.RANDOM_WALK]: 0,
    [TheoryID.MEAN_REVERTING]: 0,
    [TheoryID.TREND_FOLLOWING]: 0,
    [TheoryID.MOMENTUM]: 0,
    [TheoryID.VOL_BREAKOUT]: 0,
    [TheoryID.REGIME_SWITCH]: 0,
    [TheoryID.MICRO_TREND]: 0,
    [TheoryID.WEAK_MEAN_REVERSION]: 0,
    [TheoryID.VOLATILITY_CLUSTER]: 0,
    [TheoryID.DRIFT]: 0,
  };

  for (const theory of window) {
    usageCounts[theory]++;
  }

  // Compute probabilities
  const usageProbabilities: Record<TheoryID, number> = {
    [TheoryID.RANDOM_WALK]: 0,
    [TheoryID.MEAN_REVERTING]: 0,
    [TheoryID.TREND_FOLLOWING]: 0,
    [TheoryID.MOMENTUM]: 0,
    [TheoryID.VOL_BREAKOUT]: 0,
    [TheoryID.REGIME_SWITCH]: 0,
    [TheoryID.MICRO_TREND]: 0,
    [TheoryID.WEAK_MEAN_REVERSION]: 0,
    [TheoryID.VOLATILITY_CLUSTER]: 0,
    [TheoryID.DRIFT]: 0,
  };

  for (let i = 0; i < THEORY_COUNT; i++) {
    usageProbabilities[i as TheoryID] = usageCounts[i as TheoryID] / total;
  }

  // Shannon entropy: H = -Σ p_i log(p_i)
  let entropy = 0;
  for (let i = 0; i < THEORY_COUNT; i++) {
    const p = usageProbabilities[i as TheoryID];
    if (p > 0) {
      entropy -= p * Math.log(p); // Natural log
    }
  }

  const invariantSatisfied = entropy > TN_CONSTANTS.H_MIN;

  return {
    entropy,
    usageCounts,
    usageProbabilities,
    invariantSatisfied,
    hMin: TN_CONSTANTS.H_MIN,
  };
}

// =============================================================================
// MAXIMUM ENTROPY (REFERENCE)
// =============================================================================

/**
 * Maximum possible entropy for N theories (uniform distribution).
 * H_max = log(N)
 */
export function maxEntropy(): number {
  return Math.log(THEORY_COUNT);
}

/**
 * Normalized entropy ∈ [0, 1].
 * 0 = one theory dominates, 1 = uniform distribution
 */
export function normalizedEntropy(entropy: number): number {
  const hMax = maxEntropy();
  if (hMax < 1e-10) return 0;
  return entropy / hMax;
}

// =============================================================================
// ENTROPY OVER TIME
// =============================================================================

/**
 * Compute entropy in rolling windows over the full history.
 * Used in Experiment 4 (trajectory analysis) and Experiment 5 (invariants).
 */
export function computeRollingEntropy(
  theoryHistory: TheoryID[],
  windowSize: number = 100,
  stepSize: number = 10
): Array<{ tick: number; entropy: number; invariantSatisfied: boolean }> {
  const results: Array<{ tick: number; entropy: number; invariantSatisfied: boolean }> = [];

  for (let i = windowSize; i <= theoryHistory.length; i += stepSize) {
    const window = theoryHistory.slice(i - windowSize, i);
    const result = computeTheoryEntropy(window, windowSize);
    results.push({
      tick: i,
      entropy: result.entropy,
      invariantSatisfied: result.invariantSatisfied,
    });
  }

  return results;
}

// =============================================================================
// FORCED EXPLORATION
// =============================================================================

/**
 * Determine if forced exploration should be triggered.
 * Called when I₅ is violated (entropy < h_min).
 *
 * Returns the theory that has been least used recently.
 * This is the "exploration" theory to force diversity.
 */
export function selectExplorationTheory(
  theoryHistory: TheoryID[],
  currentTheory: TheoryID,
  windowSize: number = 100
): TheoryID {
  const window = theoryHistory.slice(-windowSize);

  // Count usage per theory
  const usageCounts = new Array(THEORY_COUNT).fill(0);
  for (const theory of window) {
    usageCounts[theory]++;
  }

  // Find least used theory (excluding current)
  let minUsage = Infinity;
  let leastUsed = (currentTheory + 1) % THEORY_COUNT as TheoryID;

  for (let i = 0; i < THEORY_COUNT; i++) {
    if (i !== currentTheory && usageCounts[i] < minUsage) {
      minUsage = usageCounts[i];
      leastUsed = i as TheoryID;
    }
  }

  return leastUsed;
}

// =============================================================================
// ENTROPY STATISTICS
// =============================================================================

/**
 * Compute entropy statistics over a simulation run.
 * Used for experiment reporting.
 */
export interface EntropyStats {
  mean: number;
  min: number;
  max: number;
  /** Fraction of time I₅ was satisfied */
  invariantSatisfactionRate: number;
  /** Number of times forced exploration was triggered */
  forcedExplorationCount: number;
}

export function computeEntropyStats(
  rollingEntropy: Array<{ tick: number; entropy: number; invariantSatisfied: boolean }>
): EntropyStats {
  if (rollingEntropy.length === 0) {
    return { mean: 0, min: 0, max: 0, invariantSatisfactionRate: 0, forcedExplorationCount: 0 };
  }

  const values = rollingEntropy.map(r => r.entropy);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  const satisfied = rollingEntropy.filter(r => r.invariantSatisfied).length;
  const invariantSatisfactionRate = satisfied / rollingEntropy.length;

  // Count transitions from satisfied to violated (forced exploration triggers)
  let forcedExplorationCount = 0;
  for (let i = 1; i < rollingEntropy.length; i++) {
    if (rollingEntropy[i - 1].invariantSatisfied && !rollingEntropy[i].invariantSatisfied) {
      forcedExplorationCount++;
    }
  }

  return { mean, min, max, invariantSatisfactionRate, forcedExplorationCount };
}

// =============================================================================
// UTILITY
// =============================================================================

function createEmptyEntropyResult(): EntropyResult {
  const usageCounts: Record<TheoryID, number> = {
    [TheoryID.RANDOM_WALK]: 0,
    [TheoryID.MEAN_REVERTING]: 0,
    [TheoryID.TREND_FOLLOWING]: 0,
    [TheoryID.MOMENTUM]: 0,
    [TheoryID.VOL_BREAKOUT]: 0,
    [TheoryID.REGIME_SWITCH]: 0,
    [TheoryID.MICRO_TREND]: 0,
    [TheoryID.WEAK_MEAN_REVERSION]: 0,
    [TheoryID.VOLATILITY_CLUSTER]: 0,
    [TheoryID.DRIFT]: 0,
  };

  const usageProbabilities: Record<TheoryID, number> = {
    [TheoryID.RANDOM_WALK]: 0,
    [TheoryID.MEAN_REVERTING]: 0,
    [TheoryID.TREND_FOLLOWING]: 0,
    [TheoryID.MOMENTUM]: 0,
    [TheoryID.VOL_BREAKOUT]: 0,
    [TheoryID.REGIME_SWITCH]: 0,
    [TheoryID.MICRO_TREND]: 0,
    [TheoryID.WEAK_MEAN_REVERSION]: 0,
    [TheoryID.VOLATILITY_CLUSTER]: 0,
    [TheoryID.DRIFT]: 0,
  };

  return {
    entropy: 0,
    usageCounts,
    usageProbabilities,
    invariantSatisfied: false,
    hMin: TN_CONSTANTS.H_MIN,
  };
}
