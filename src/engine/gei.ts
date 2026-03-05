/**
 * TN-LAB Engine — GEI Operator (Epistemic Selection)
 * Sistema TN (Tortuga Ninja) v3.0
 *
 * GEI: (T, H) → T
 * GEI(T, H) = argmin_{T_i ∈ T} C(T_i, H)
 *
 * Cost function:
 * C(T_i, H) = α·E_pred + β·V_inst + γ·K + δ·U + λ·S
 * where:
 * - α = 0.4: prediction error weight
 * - β = 0.2: instability weight
 * - γ = 0.15: complexity weight (K(T_i))
 * - δ = 0.15: uncertainty weight
 * - λ = 0.1: switching penalty
 *
 * Ajuste Final 4: GEI as formal operator (T,H) → T
 *
 * Δ operator: theory changes only if C(new) < C(current) - η
 * where η = MARGIN_EPISTEMIC = 0.05
 *
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import {
  TheoryID,
  GEIResult,
  TheoryEvaluation,
  SufficientStats,
  Transition,
  TN_CONSTANTS,
  THEORY_COUNT,
} from './types';
import {
  computePredictionError,
  getTheoryComplexity,
  getTheoryOptimalRegime,
  predict,
} from './theories';
import { isCycleDetected } from './distance';

// =============================================================================
// MAIN GEI OPERATOR
// =============================================================================

/**
 * GEI: (T, H) → T
 * Selects the theory with minimum epistemic cost.
 *
 * Ajuste Final 4: This is the formal implementation of the GEI operator.
 * It evaluates ALL theories and returns the argmin.
 *
 * Cost function with exploration bonus:
 * C(T) = λ_E·E_pred + λ_K·K(T) + λ_S·S(T) - λ_R·R(T) - λ_X·X(T)
 * where X(T) = -log(p(T) + ε) incentivizes rarely-used theories
 *
 * @param stats - Sufficient statistics H_t
 * @param prices - Recent price history
 * @param currentTheory - Currently active theory (for switching penalty)
 * @param transitionHistory - History of transitions (for cycle detection)
 * @param currentTick - Current tick index
 * @param theoryUsage - Usage counts per theory (for exploration bonus)
 * @returns GEIResult with selected theory, all evaluations, and ΔC
 */
export function gei(
  stats: SufficientStats,
  prices: number[],
  currentTheory: TheoryID,
  transitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }>,
  currentTick: number,
  theoryUsage?: Record<TheoryID, number>
): GEIResult {
  // Evaluate all theories with usage tracking for exploration bonus
  const evaluations: TheoryEvaluation[] = [];

  for (let i = 0; i < THEORY_COUNT; i++) {
    const theoryId = i as TheoryID;
    const evaluation = evaluateTheory(
      theoryId,
      stats,
      prices,
      currentTheory,
      theoryUsage
    );
    evaluations.push(evaluation);
  }

  // Sort by cost (ascending)
  evaluations.sort((a, b) => a.cost - b.cost);

  // Assign ranks
  for (let i = 0; i < evaluations.length; i++) {
    evaluations[i].rank = i + 1;
  }

  const bestEval = evaluations[0];
  const secondBestEval = evaluations[1];

  // ΔC = C(second_best) - C(best): epistemic confidence margin
  const deltaC = secondBestEval.cost - bestEval.cost;

  // Check if theory should change (Δ operator)
  const currentCost = evaluations.find(e => e.theoryId === currentTheory)?.cost ?? Infinity;
  const bestCost = bestEval.cost;

  // Δ: change if C(new) < C(current) - η
  const costImprovement = currentCost - bestCost;
  const meetsEpistemicMargin = costImprovement > TN_CONSTANTS.MARGIN_EPISTEMIC;

  // Check for cycles
  let cycleDetected = false;
  if (bestEval.theoryId !== currentTheory && meetsEpistemicMargin) {
    const cycleResult = isCycleDetected(
      currentTheory,
      bestEval.theoryId,
      transitionHistory,
      currentTick,
      stats,
      prices
    );
    cycleDetected = cycleResult.isCycle;
  }

  const shouldChange = bestEval.theoryId !== currentTheory
    && meetsEpistemicMargin
    && !cycleDetected;

  return {
    selectedTheory: shouldChange ? bestEval.theoryId : currentTheory,
    evaluations,
    deltaC,
    shouldChange,
  };
}

// =============================================================================
// THEORY COST FUNCTION
// C(T_i, H) = α·E_pred + β·V_inst + γ·K + δ·U + λ·S
// =============================================================================

/**
 * Evaluate a single theory's epistemic cost.
 *
 * C = α·E_pred + β·V_inst + γ·K + δ·U + λ·S - λ_X·X(T)
 *
 * Components:
 * - E_pred: prediction error relative to baseline (normalized)
 * - V_inst: instability (variance of recent errors)
 * - K: Kolmogorov complexity proxy
 * - U: uncertainty (variance / mean ratio)
 * - S: switching penalty (0 if current theory, 0.1 otherwise)
 * - X(T): exploration bonus = -log(p(T) + ε), incentivizes rarely-used theories
 *
 * KEY DESIGN DECISION:
 * E_pred is computed as RELATIVE error vs baseline (random walk).
 * This means theories that beat the baseline get lower cost.
 * Theories that match the current regime get a regime bonus.
 */
export function evaluateTheory(
  theoryId: TheoryID,
  stats: SufficientStats,
  prices: number[],
  currentTheory: TheoryID,
  theoryUsage?: Record<TheoryID, number>
): TheoryEvaluation {
  // GUARD: Early check for invalid stats or prices
  if (!stats || !prices || prices.length < 2) {
    return createInvalidEvaluation(theoryId);
  }
  
  // GUARD: Check if theory ID is valid
  if (theoryId < 0 || theoryId >= THEORY_COUNT) {
    return createInvalidEvaluation(theoryId);
  }

  // Split prices into train (70%) and validation (30%)
  const splitIdx = Math.floor(prices.length * 0.7);
  const trainPrices = prices.slice(0, splitIdx);
  const valPrices = prices.slice(splitIdx);

  // Baseline error (random walk)
  const baselineError = computeBaselineErrorForGEI(prices);

  // E_pred: weighted combination of train and validation error
  const trainError = computePredictionError(theoryId, stats, trainPrices);
  const valError = computePredictionError(theoryId, stats, valPrices);
  const rawEPred = 0.7 * trainError + 0.3 * valError;

  // Guard against NaN in rawEPred
  if (!isFinite(rawEPred) || !isFinite(baselineError)) {
    return createInvalidEvaluation(theoryId);
  }

  // Guard: if ePredRelative is NaN or Infinity, return invalid
  const ePredRelative = rawEPred / (baselineError + 1e-10);
  if (!isFinite(ePredRelative)) {
    return createInvalidEvaluation(theoryId);
  }

  // V_inst: instability — variance of prediction errors over recent window
  const vInst = computeInstability(theoryId, stats, prices);

  // K: complexity (precomputed) — normalized to [0,1]
  const k = getTheoryComplexity(theoryId);
  const kNorm = k / 5.0; // Max complexity is 5.0

  // U: uncertainty = variance / (|mean| + ε) — normalized
  const u = stats.variance / (Math.abs(stats.mean) + 1e-10);
  const uNorm = Math.min(1, u);

  // S: switching penalty
  const s = theoryId === currentTheory ? 0 : 0.1;

  // REGIME ALIGNMENT: theories that match the current regime get reduced cost.
  const optimalRegime = getTheoryOptimalRegime(theoryId);
  const currentRegime = stats.regime;

  let regimeAdjustment = 0.0;
  if (optimalRegime === currentRegime) {
    regimeAdjustment = TN_CONSTANTS.REGIME_BONUS_EXACT;
  } else if (optimalRegime === 3 && currentRegime !== 3) {
    regimeAdjustment = -0.10;
  } else if (theoryId === TheoryID.RANDOM_WALK && currentRegime !== 3) {
    regimeAdjustment = TN_CONSTANTS.REGIME_PENALTY_MISMATCH;
  } else if (theoryId === TheoryID.RANDOM_WALK && currentRegime === 3) {
    regimeAdjustment = -0.30;
  }

  // Normalize E_pred: values < 1 mean theory beats baseline (good)
  // Cap at 2.0 to prevent extreme values from dominating
  const ePredNorm = Math.min(2.0, isFinite(ePredRelative) ? ePredRelative : 2.0);

  // V_inst normalization
  const vInstNorm = normalizeError(vInst * 1000);

  // X(T): exploration bonus = -log(p(T) + ε)
  const explorationBonus = computeExplorationBonus(theoryId, theoryUsage);

  // C = α·E + β·V + γ·K + δ·U + λ·S + regime_adjustment - λ_X·X(T)
  const predictionError = TN_CONSTANTS.COST_ALPHA * ePredNorm;
  const instability = TN_CONSTANTS.COST_BETA * (isFinite(vInstNorm) ? vInstNorm : 1);
  const complexity = TN_CONSTANTS.COST_GAMMA * (isFinite(kNorm) ? kNorm : 1);
  const uncertainty = TN_CONSTANTS.COST_DELTA * (isFinite(uNorm) ? uNorm : 1);
  const switchingPenalty = TN_CONSTANTS.COST_LAMBDA * s;
  const exploration = TN_CONSTANTS.WEIGHT_EXPLORATION * (isFinite(explorationBonus) ? explorationBonus : 0);

  const cost = Math.max(0, predictionError + instability + complexity + uncertainty + switchingPenalty + regimeAdjustment - exploration);

  // Final guard: if cost is NaN/Infinity, return high cost
  if (!isFinite(cost)) {
    return createInvalidEvaluation(theoryId);
  }

  return {
    theoryId,
    cost: isFinite(cost) ? cost : 100.0,
    components: {
      predictionError,
      instability,
      complexity,
      uncertainty,
      switchingPenalty,
    },
    rank: 0,
  };
}

/**
 * Create a high-cost evaluation for theories that fail to compute.
 */
function createInvalidEvaluation(theoryId: TheoryID): TheoryEvaluation {
  return {
    theoryId,
    cost: 100.0, // High cost to discourage selection
    components: {
      predictionError: 100,
      instability: 0,
      complexity: 0,
      uncertainty: 0,
      switchingPenalty: 0,
    },
    rank: 0,
  };
}

/**
 * Compute baseline error for GEI (random walk one-step-ahead).
 * Used to normalize E_pred in the cost function.
 */
function computeBaselineErrorForGEI(prices: number[]): number {
  const n = prices.length;
  if (n < 2) return 1.0;
  let total = 0;
  const window = Math.min(20, n - 1);
  for (let i = n - window - 1; i < n - 1; i++) {
    if (i < 0) continue;
    total += Math.abs(prices[i + 1] - prices[i]);
  }
  return total / window;
}

// =============================================================================
// INSTABILITY COMPUTATION
// V_inst = variance of prediction errors over recent window
// =============================================================================

/**
 * Compute prediction instability for a theory.
 * V_inst = variance of |predicted - actual| over recent window.
 *
 * High instability = theory is inconsistent (bad sign).
 */
function computeInstability(
  theoryId: TheoryID,
  stats: SufficientStats,
  prices: number[],
  windowSize: number = 20
): number {
  const n = prices.length;
  if (n < 4) return 1.0;

  const window = Math.min(windowSize, n - 1);
  const errors: number[] = [];

  for (let i = n - window - 1; i < n - 1; i++) {
    if (i < 0) continue;
    const subPrices = prices.slice(Math.max(0, i - 10), i + 1);
    if (subPrices.length < 2) continue;

    const predicted = predict(theoryId, stats, subPrices);
    const actual = prices[i + 1];
    errors.push(Math.abs(predicted - actual));
  }

  if (errors.length < 2) return 0;

  const mean = errors.reduce((s, v) => s + v, 0) / errors.length;
  const variance = errors.reduce((s, v) => s + (v - mean) ** 2, 0) / (errors.length - 1);

  return variance;
}

// =============================================================================
// EXPLORATION BONUS X(T)
// X(T) = -log(p(T) + ε)
// =============================================================================

/**
 * Compute exploration bonus X(T) for a theory.
 *
 * X(T) = -log(p(T) + ε) where p(T) is the historical usage frequency.
 *
 * Theories that are rarely used get a higher bonus (larger X(T)),
 * which reduces their cost and encourages exploration.
 *
 * @param theoryId - The theory to evaluate
 * @param theoryUsage - Map of theory IDs to usage counts
 * @returns Exploration bonus value (higher = more exploration incentive)
 */
function computeExplorationBonus(
  theoryId: TheoryID,
  theoryUsage?: Record<TheoryID, number>
): number {
  // If no usage tracking provided, no exploration bonus
  if (!theoryUsage) {
    return 0;
  }

  // Calculate total usage across all theories
  let totalUsage = 0;
  for (let i = 0; i < THEORY_COUNT; i++) {
    totalUsage += theoryUsage[i as TheoryID] || 0;
  }

  // If no theory has been used yet, give equal exploration bonus to all
  if (totalUsage === 0) {
    return 1.0; // Maximum exploration bonus
  }

  // Calculate usage probability p(T)
  const usage = theoryUsage[theoryId] || 0;
  const p = (usage + 1e-6) / (totalUsage + THEORY_COUNT * 1e-6); // Add smoothing

  // X(T) = -log(p(T) + ε)
  // Higher when p is low (rarely used)
  const x = -Math.log(p + 1e-6);

  return x;
}

// =============================================================================
// ADAPTIVE THRESHOLD θ
// =============================================================================

/**
 * Update adaptive threshold θ based on recent φ performance.
 * θ increases when φ is consistently high (raise the bar).
 * θ decreases when φ is consistently low (lower the bar to allow action).
 *
 * θ_{t+1} = θ_t + α·(φ_t - θ_t)
 * where α = 0.1 (learning rate)
 */
export function updateAdaptiveTheta(
  currentTheta: number,
  currentPhi: number,
  learningRate: number = 0.1
): number {
  const newTheta = currentTheta + learningRate * (currentPhi - currentTheta);
  return Math.max(0.1, Math.min(0.9, newTheta)); // Clamp to [0.1, 0.9]
}

// =============================================================================
// TRANSITION REGISTRATION
// =============================================================================

/**
 * Create a new transition record when theory changes.
 */
export function createTransition(
  from: TheoryID,
  to: TheoryID,
  improvement: number,
  distance: number,
  regime: number,
  tick: number
): Transition {
  return {
    from,
    to,
    timestamp: new Date(),
    improvement,
    distance,
    regime,
  };
}

// =============================================================================
// FORCED EXPLORATION
// =============================================================================

/**
 * Force exploration when entropy I₅ is violated.
 * Selects a theory different from current with some randomness.
 *
 * In TN-LAB (deterministic), we select the least-used theory.
 * In TN-PROD (MQL5), this would use a random selection.
 */
export function forceExploration(
  currentTheory: TheoryID,
  theoryUsageCounts: Record<TheoryID, number>
): TheoryID {
  let minUsage = Infinity;
  let leastUsed = (currentTheory + 1) % THEORY_COUNT as TheoryID;

  for (let i = 0; i < THEORY_COUNT; i++) {
    if (i !== currentTheory) {
      const usage = theoryUsageCounts[i as TheoryID] ?? 0;
      if (usage < minUsage) {
        minUsage = usage;
        leastUsed = i as TheoryID;
      }
    }
  }

  return leastUsed;
}

// =============================================================================
// UTILITY
// =============================================================================

/**
 * Normalize error to [0, 1] range using sigmoid-like function.
 * Prevents large errors from dominating the cost function.
 */
function normalizeError(error: number): number {
  // Soft normalization: error / (1 + error)
  // Maps [0, ∞) → [0, 1)
  return error / (1 + error);
}

/**
 * Get the ranking of all theories by cost.
 * Returns array of {theoryId, cost, rank} sorted by cost ascending.
 */
export function rankTheories(
  stats: SufficientStats,
  prices: number[],
  currentTheory: TheoryID
): Array<{ theoryId: TheoryID; cost: number; rank: number }> {
  const evaluations = getAllTheoryIds().map(id =>
    evaluateTheory(id, stats, prices, currentTheory)
  );

  evaluations.sort((a, b) => a.cost - b.cost);

  return evaluations.map((e, i) => ({
    theoryId: e.theoryId,
    cost: e.cost,
    rank: i + 1,
  }));
}

// Avoid circular import — import getAllTheoryIds directly
function getAllTheoryIds(): TheoryID[] {
  return Array.from({ length: THEORY_COUNT }, (_, i) => i as TheoryID);
}
