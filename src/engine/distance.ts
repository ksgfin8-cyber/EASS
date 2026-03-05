/**
 * TN-LAB Engine — Theory Distance Metric
 * Sistema TN (Tortuga Ninja) v3.0
 *
 * Ajuste Final 2: Metric in theory space
 *
 * d(T_i, T_j) = |E_i - E_j| + λ·|K_i - K_j| + μ·(1 - δ(regime_i, regime_j))
 *
 * where:
 * - E_i: average prediction error of theory i
 * - K_i: Kolmogorov complexity of theory i
 * - regime_i: optimal regime for theory i
 * - λ = 0.3 (complexity weight)
 * - μ = 0.2 (regime weight)
 *
 * Properties:
 * - d(T_i, T_j) ≥ 0
 * - d(T_i, T_j) = 0 iff T_i = T_j in performance
 * - Useful for cycle detection: d < δ indicates possible cycle
 *
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import {
  TheoryID,
  TheoryDistanceResult,
  SufficientStats,
  TN_CONSTANTS,
  THEORY_COUNT,
} from './types';
import {
  computePredictionError,
  getTheoryComplexity,
  getTheoryOptimalRegime,
  getAllTheoryIds,
} from './theories';

// =============================================================================
// MAIN DISTANCE FUNCTION
// =============================================================================

/**
 * d(T_i, T_j) = |E_i - E_j| + λ·|K_i - K_j| + μ·(1 - δ(regime_i, regime_j))
 *
 * Ajuste Final 2: Theory distance metric for cycle detection and diversity measurement.
 */
export function theoryDistance(
  t1: TheoryID,
  t2: TheoryID,
  stats: SufficientStats,
  prices: number[]
): TheoryDistanceResult {
  // Component 1: Error difference
  const e1 = computePredictionError(t1, stats, prices);
  const e2 = computePredictionError(t2, stats, prices);
  const errorDiff = Math.abs(e1 - e2);

  // Component 2: Complexity difference (weighted by λ = 0.3)
  const k1 = getTheoryComplexity(t1);
  const k2 = getTheoryComplexity(t2);
  const complexityDiff = Math.abs(k1 - k2) * TN_CONSTANTS.LAMBDA;

  // Component 3: Regime difference (weighted by μ = 0.2)
  const r1 = getTheoryOptimalRegime(t1);
  const r2 = getTheoryOptimalRegime(t2);
  const regimeDiff = (r1 === r2) ? 0 : TN_CONSTANTS.MU;

  const total = errorDiff + complexityDiff + regimeDiff;

  return { errorDiff, complexityDiff, regimeDiff, total };
}

// =============================================================================
// DISTANCE MATRIX
// =============================================================================

/**
 * Compute the full N×N distance matrix between all theories.
 * Useful for visualizing the theory space topology.
 */
export function computeDistanceMatrix(
  stats: SufficientStats,
  prices: number[]
): number[][] {
  const matrix: number[][] = Array.from(
    { length: THEORY_COUNT },
    () => new Array(THEORY_COUNT).fill(0)
  );

  for (let i = 0; i < THEORY_COUNT; i++) {
    for (let j = i + 1; j < THEORY_COUNT; j++) {
      const dist = theoryDistance(i as TheoryID, j as TheoryID, stats, prices);
      matrix[i][j] = dist.total;
      matrix[j][i] = dist.total; // Symmetric
    }
  }

  return matrix;
}

// =============================================================================
// CYCLE DETECTION
// =============================================================================

export interface CycleDetectionResult {
  isCycle: boolean;
  /** Distance between the two theories in the potential cycle */
  distance: number;
  /** Time since the reverse transition (in ticks) */
  ticksSinceReverseTransition: number;
}

/**
 * Detect if a proposed transition from→to would create a cycle.
 *
 * A cycle is detected when:
 * 1. There exists a recent transition to→from in history
 * 2. The distance d(from, to) < CYCLE_DISTANCE_THRESHOLD
 * 3. The reverse transition happened within CYCLE_WINDOW ticks
 */
export function isCycleDetected(
  from: TheoryID,
  to: TheoryID,
  transitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number }>,
  currentTick: number,
  stats: SufficientStats,
  prices: number[]
): CycleDetectionResult {
  const dist = theoryDistance(from, to, stats, prices);

  // Look for reverse transition (to → from) in recent history
  const windowStart = currentTick - TN_CONSTANTS.CYCLE_WINDOW;

  for (let i = transitionHistory.length - 1; i >= 0; i--) {
    const t = transitionHistory[i];
    if (t.tick < windowStart) break; // Outside window

    if (t.from === to && t.to === from) {
      // Found reverse transition
      const ticksSince = currentTick - t.tick;
      const isCycle = dist.total < TN_CONSTANTS.CYCLE_DISTANCE_THRESHOLD;

      return {
        isCycle,
        distance: dist.total,
        ticksSinceReverseTransition: ticksSince,
      };
    }
  }

  return {
    isCycle: false,
    distance: dist.total,
    ticksSinceReverseTransition: Infinity,
  };
}

// =============================================================================
// DIVERSITY METRICS
// =============================================================================

/**
 * Compute the average pairwise distance between all theories.
 * Higher = more diverse theory space.
 */
export function computeAveragePairwiseDistance(
  stats: SufficientStats,
  prices: number[]
): number {
  const ids = getAllTheoryIds();
  let totalDist = 0;
  let count = 0;

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const dist = theoryDistance(ids[i], ids[j], stats, prices);
      totalDist += dist.total;
      count++;
    }
  }

  return count > 0 ? totalDist / count : 0;
}

/**
 * Find the theory most distant from the current theory.
 * Used for forced exploration when entropy is low.
 */
export function findMostDistantTheory(
  currentTheory: TheoryID,
  stats: SufficientStats,
  prices: number[]
): { theoryId: TheoryID; distance: number } {
  const ids = getAllTheoryIds().filter(id => id !== currentTheory);

  let maxDist = -1;
  let mostDistant = ids[0];

  for (const id of ids) {
    const dist = theoryDistance(currentTheory, id, stats, prices);
    if (dist.total > maxDist) {
      maxDist = dist.total;
      mostDistant = id;
    }
  }

  return { theoryId: mostDistant, distance: maxDist };
}

/**
 * Compute the transition graph from history.
 * Returns edge weights (frequency) and average distances.
 * Used in Experiment 4 (trajectory analysis).
 */
export interface TransitionEdge {
  from: TheoryID;
  to: TheoryID;
  frequency: number;
  avgDistance: number;
}

export function buildTransitionGraph(
  transitions: Array<{ from: TheoryID; to: TheoryID; distance: number }>
): TransitionEdge[] {
  const edgeMap = new Map<string, { count: number; totalDist: number }>();

  for (const t of transitions) {
    const key = `${t.from}->${t.to}`;
    const existing = edgeMap.get(key) ?? { count: 0, totalDist: 0 };
    edgeMap.set(key, {
      count: existing.count + 1,
      totalDist: existing.totalDist + t.distance,
    });
  }

  const edges: TransitionEdge[] = [];
  for (const [key, data] of edgeMap.entries()) {
    const [fromStr, toStr] = key.split('->');
    edges.push({
      from: parseInt(fromStr) as TheoryID,
      to: parseInt(toStr) as TheoryID,
      frequency: data.count,
      avgDistance: data.totalDist / data.count,
    });
  }

  return edges.sort((a, b) => b.frequency - a.frequency);
}
