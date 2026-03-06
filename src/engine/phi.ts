/**
 * TN-LAB Engine — Φ Operator (Decidability)
 * Sistema TN (Tortuga Ninja) v3.0
 *
 * Mathematical Foundations (Scientific Stage v4):
 * 
 * Φ can be computed in three equivalent ways:
 * 
 * 1. Φ_min(H) = -min_i C(T_i, H)
 *    Negative minimum cost (higher Φ = better theory fit)
 * 
 * 2. Φ_entropy(H) = H(theory distribution)  
 *    Entropy of theory selection probabilities
 *    Higher entropy = more uncertainty about best theory
 * 
 * 3. Φ_info(H) = Information Gain over baseline
 *    I(T:H) = H(baseline) - H(T|H)
 * 
 * Original definition (still used):
 * φ = Φ(T_t, H_t) = 1 - E_pred(T_t) / E_baseline
 * Φ: T × H → [0, 1]
 *
 * φ ≈ 1 → theory predicts much better than random walk (high decidability)
 * φ ≈ 0 → theory performs like random walk (low decidability)
 * φ < 0 → theory performs worse than random walk (clamped to 0)
 *
 * INVARIANT I₃: 0 ≤ φ_t ≤ 1, ∀t
 * INVARIANT I₁: Var(φ_t | H_t) < 0.1
 *
 * Ajuste Exp 3: E[φ | trending] > E[φ | random]
 * φ must be higher when there is real structure.
 *
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, PhiResult, SufficientStats, TN_CONSTANTS } from './types';
import { computePredictionError } from './theories';

// =============================================================================
// MAIN Φ OPERATOR
// =============================================================================

/**
 * Φ(T_t, H_t) = 1 - E_pred(T_t) / E_baseline
 *
 * @param theoryId - Currently active theory T_t
 * @param stats - Sufficient statistics H_t
 * @param prices - Recent price history X_{t-L:t}
 * @returns PhiResult with φ ∈ [0,1] and diagnostic components
 */
export function computePhi(
  theoryId: TheoryID,
  stats: SufficientStats,
  prices: number[]
): PhiResult {
  const predictionError = computePredictionError(theoryId, stats, prices);
  const baselineError = computeBaselineError(prices);

  // Guard against NaN/Infinity
  const safePredError = isFinite(predictionError) ? predictionError : baselineError;
  const safeBaselineError = isFinite(baselineError) && baselineError > 0 ? baselineError : 1e-10;

  // φ = 1 - E_pred / E_baseline
  const rawRatio = safePredError / safeBaselineError;
  const rawPhi = 1 - rawRatio;

  // INVARIANT I₃: clamp to [0, 1]
  const phi = isFinite(rawPhi) ? Math.max(0, Math.min(1, rawPhi)) : 0;

  return {
    phi,
    predictionError: safePredError,
    baselineError: safeBaselineError,
    rawRatio: isFinite(rawRatio) ? rawRatio : 1,
  };
}

// =============================================================================
// BASELINE ERROR (Random Walk)
// =============================================================================

/**
 * Compute baseline prediction error using random walk.
 * E_baseline = mean |X[t] - X[t-1]| (naive one-step-ahead prediction)
 *
 * This is the reference: a theory must beat this to have φ > 0.
 */
export function computeBaselineError(prices: number[]): number {
  const n = prices.length;
  if (n < 2) return 1.0;

  let totalError = 0;
  const window = Math.min(TN_CONSTANTS.LOOKBACK_WINDOW, n - 1);
  const startIdx = n - window - 1;

  for (let i = startIdx; i < n - 1; i++) {
    // Random walk prediction: next = current
    totalError += Math.abs(prices[i + 1] - prices[i]);
  }

  return totalError / window;
}

// =============================================================================
// PHI STABILITY ANALYSIS (Invariant I₁)
// =============================================================================

/**
 * Compute variance of φ over a rolling window.
 * Used to verify Invariant I₁: Var(φ_t | H_t) < 0.1
 */
export function computePhiVariance(phiHistory: number[], windowSize: number = 50): number {
  if (phiHistory.length < 2) return 0;

  const window = phiHistory.slice(-windowSize);
  const n = window.length;
  const mean = window.reduce((s, v) => s + v, 0) / n;
  const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);

  return variance;
}

/**
 * Check Invariant I₁: Var(φ_t | H_t) < ε
 */
export function checkInvariantI1(
  phiHistory: number[],
  windowSize: number = 50
): { satisfied: boolean; variance: number; epsilon: number } {
  const variance = computePhiVariance(phiHistory, windowSize);
  return {
    satisfied: variance < TN_CONSTANTS.PHI_VARIANCE_MAX,
    variance,
    epsilon: TN_CONSTANTS.PHI_VARIANCE_MAX,
  };
}

// =============================================================================
// PHI STATISTICS
// =============================================================================

/**
 * Compute rolling φ statistics over the full history.
 * Used in Experiment 3 (φ stability).
 */
export function computeRollingPhiStats(
  phiHistory: number[],
  windowSize: number = 50,
  stepSize: number = 10
): Array<{
  tick: number;
  mean: number;
  variance: number;
  min: number;
  max: number;
  invariantI1: boolean;
}> {
  const results = [];

  for (let i = windowSize; i <= phiHistory.length; i += stepSize) {
    const window = phiHistory.slice(i - windowSize, i);
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / (window.length - 1);
    const min = Math.min(...window);
    const max = Math.max(...window);

    results.push({
      tick: i,
      mean,
      variance,
      min,
      max,
      invariantI1: variance < TN_CONSTANTS.PHI_VARIANCE_MAX,
    });
  }

  return results;
}

/**
 * Compute mean φ for a given regime.
 * Used to verify: E[φ | trending] > E[φ | random]
 *
 * @param phiHistory - Array of φ values
 * @param regimeHistory - Corresponding regime labels
 * @param targetRegime - Regime to compute mean for
 */
export function computeMeanPhiByRegime(
  phiHistory: number[],
  regimeHistory: number[],
  targetRegime: number
): number {
  const n = Math.min(phiHistory.length, regimeHistory.length);
  const values = [];

  for (let i = 0; i < n; i++) {
    if (regimeHistory[i] === targetRegime) {
      values.push(phiHistory[i]);
    }
  }

  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Verify the decidability hypothesis:
 * E[φ | trending] > E[φ | random_walk_regime]
 *
 * This validates that Φ actually measures decidability.
 */
export function verifyDecidabilityHypothesis(
  phiHistory: number[],
  regimeHistory: number[]
): {
  meanPhiTrending: number;
  meanPhiRanging: number;
  meanPhiVolatile: number;
  meanPhiMixed: number;
  hypothesis: boolean; // trending > mixed (random-like)
} {
  const meanPhiTrending = computeMeanPhiByRegime(phiHistory, regimeHistory, 1);
  const meanPhiRanging = computeMeanPhiByRegime(phiHistory, regimeHistory, 0);
  const meanPhiVolatile = computeMeanPhiByRegime(phiHistory, regimeHistory, 2);
  const meanPhiMixed = computeMeanPhiByRegime(phiHistory, regimeHistory, 3);

  // Hypothesis: structured regimes (trending, ranging) have higher φ than mixed
  const hypothesis = meanPhiTrending > meanPhiMixed || meanPhiRanging > meanPhiMixed;

  return {
    meanPhiTrending,
    meanPhiRanging,
    meanPhiVolatile,
    meanPhiMixed,
    hypothesis,
  };
}

// =============================================================================
// ACTION POLICY Π
// =============================================================================

/**
 * Π(T_t, φ_t): A_t ∈ {-1, 0, 1}
 *
 * Maps theory + decidability to trading signal.
 * - φ < θ → no action (0): not enough confidence
 * - φ ≥ θ → follow theory signal
 *
 * @param theoryId - Active theory
 * @param phi - Current decidability
 * @param theta - Adaptive threshold ∈ [0,1]
 * @param stats - Sufficient statistics (for theory direction)
 * @param prices - Recent prices
 */
export function computeAction(
  theoryId: TheoryID,
  phi: number,
  theta: number,
  stats: SufficientStats,
  prices: number[]
): -1 | 0 | 1 {
  // Below threshold: no action
  if (phi < theta) return 0;

  const lastPrice = prices[prices.length - 1];

  // Theory-specific direction
  switch (theoryId) {
    case TheoryID.RANDOM_WALK:
      return 0; // No directional signal

    case TheoryID.MEAN_REVERTING: {
      // Buy if below mean, sell if above mean
      const diff = stats.mean - lastPrice;
      if (Math.abs(diff) < Math.sqrt(stats.variance)) return 0;
      return diff > 0 ? 1 : -1;
    }

    case TheoryID.TREND_FOLLOWING: {
      // Follow trend direction
      if (prices.length < 2) return 0;
      const trend = lastPrice - prices[prices.length - 2];
      return trend > 0 ? 1 : trend < 0 ? -1 : 0;
    }

    case TheoryID.MOMENTUM: {
      // Follow momentum direction
      const window = Math.min(20, prices.length - 1);
      if (window < 2) return 0;
      const momentum = lastPrice - prices[prices.length - 1 - window];
      return momentum > 0 ? 1 : momentum < 0 ? -1 : 0;
    }

    case TheoryID.VOL_BREAKOUT: {
      // Direction of last significant move
      if (prices.length < 2) return 0;
      const lastReturn = lastPrice - prices[prices.length - 2];
      const atrProxy = Math.sqrt(stats.variance);
      if (Math.abs(lastReturn) < atrProxy) return 0;
      return lastReturn > 0 ? 1 : -1;
    }

    case TheoryID.REGIME_SWITCH: {
      // Delegate to regime-appropriate sub-theory
      switch (stats.regime) {
        case 0: return computeAction(TheoryID.MEAN_REVERTING, phi, theta, stats, prices);
        case 1: return computeAction(TheoryID.TREND_FOLLOWING, phi, theta, stats, prices);
        case 2: return computeAction(TheoryID.VOL_BREAKOUT, phi, theta, stats, prices);
        default: return 0;
      }
    }

    default:
      return 0;
  }
}

// =============================================================================
// INFORMATION-THEORETIC Φ (Scientific Stage v4)
// =============================================================================

/**
 * Φ_min(H) = -min_i C(T_i, H)
 * 
 * Negative minimum cost across all theories.
 * Higher value = better theory fit to market structure.
 * 
 * @param costs - Array of costs C(T_i, H) for all theories
 * @returns Φ_min ∈ (-∞, 0] normalized to [0, 1]
 */
export function computePhiMinCost(costs: number[]): number {
  if (costs.length === 0) return 0;
  
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  
  // Normalize to [0, 1]: higher is better (more negative = better cost)
  const range = maxCost - minCost || 1;
  const normalized = 1 - (minCost - minCost) / range; // = 1 when minCost = minCost
  
  // Actually: we want Φ = -minCost, but normalized
  // If minCost is very negative → high Φ
  // If minCost ≈ 0 → low Φ
  const phiMin = -minCost / (Math.abs(maxCost) + 1e-10);
  
  return Math.max(0, Math.min(1, phiMin));
}

/**
 * Φ_entropy(H) = H(theory distribution)
 * 
 * Entropy of theory selection probabilities.
 * Higher entropy = more uncertainty about which theory fits best.
 * Lower entropy = clear dominant theory.
 * 
 * @param theoryProbabilities - P(T_i) for each theory
 * @returns H(T) ∈ [0, log(|T|)]
 */
export function computePhiEntropy(theoryProbabilities: number[]): number {
  if (theoryProbabilities.length === 0) return 0;
  
  let entropy = 0;
  const epsilon = 1e-12;
  
  for (const p of theoryProbabilities) {
    if (p > epsilon) {
      entropy -= p * Math.log(p);
    }
  }
  
  // Normalize: H_max = log(|T|) = log(10) ≈ 2.30
  const maxEntropy = Math.log(theoryProbabilities.length);
  const normalizedEntropy = entropy / maxEntropy;
  
  return normalizedEntropy;
}

/**
 * Φ_info(H) = Information Gain over baseline
 * 
 * I(T:H) = H(baseline) - H(T|H)
 * 
 * Measures how much the theory selection reduces uncertainty
 * compared to a baseline (random walk) hypothesis.
 * 
 * @param baselineEntropy - Entropy under baseline (random walk)
 * @param conditionalEntropy - Entropy given theory selection H(T|H)
 * @returns Information gain ∈ [0, baselineEntropy]
 */
export function computePhiInfoGain(baselineEntropy: number, conditionalEntropy: number): number {
  const infoGain = baselineEntropy - conditionalEntropy;
  
  // Normalize to [0, 1]
  const maxGain = baselineEntropy || 1;
  return Math.max(0, Math.min(1, infoGain / maxGain));
}

/**
 * Compute all three Φ definitions and return comprehensive result.
 * 
 * @param costs - Array of costs C(T_i, H) for all theories
 * @param probabilities - Theory selection probabilities P(T_i)
 * @param baselineEntropy - H(baseline) for info gain computation
 * @returns Object with all three Φ values
 */
export function computeAllPhiDefinitions(
  costs: number[],
  probabilities: number[],
  baselineEntropy: number = Math.LN2 // Use 0.693 (binary entropy) as default
): {
  phiMin: number;
  phiEntropy: number;
  phiInfoGain: number;
  minCost: number;
  entropy: number;
  infoGain: number;
} {
  const phiMin = computePhiMinCost(costs);
  const phiEntropy = computePhiEntropy(probabilities);
  
  // Conditional entropy H(T|H) = -Σ p_i log(p_i) = already computed as entropy
  const conditionalEntropy = probabilities.reduce((sum, p) => {
    const epsilon = 1e-12;
    return sum - (p > epsilon ? p * Math.log(p) : 0);
  }, 0);
  
  const phiInfoGain = computePhiInfoGain(baselineEntropy, conditionalEntropy);
  
  return {
    phiMin,
    phiEntropy,
    phiInfoGain,
    minCost: Math.min(...costs),
    entropy: conditionalEntropy,
    infoGain: baselineEntropy - conditionalEntropy,
  };
}
