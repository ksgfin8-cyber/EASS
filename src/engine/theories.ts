/**
 * TN-LAB Engine — Theory Families
 * Sistema TN (Tortuga Ninja) v3.0
 *
 * Implements the 6 theory functional families:
 * T_i(H, X) = f_i(θ_i, H, X) where f_i is a fixed parametric family
 *
 * Each theory is a function: (SufficientStats, prices[]) → predicted_next_price
 * This is the implementation of T: H × X_{t-L:t} → ℝ
 *
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, TheoryFamily, SufficientStats, THEORY_COUNT, TN_CONSTANTS } from './types';
import { guardPrediction, checkMinHistory, sanitize, isValidNumber, EPSILON } from './numeric';

// =============================================================================
// THEORY FAMILY DESCRIPTORS
// Ajuste Final 1: explicit functional forms with precomputed complexity
// =============================================================================

export const THEORY_FAMILIES: TheoryFamily[] = [
  {
    id: TheoryID.RANDOM_WALK,
    name: 'Random Walk',
    functionalForm: 'f(H,X) = X[-1] + ε, ε ~ N(0, σ²)',
    complexity: 1.0,    // Simplest model — baseline
    optimalRegime: 3,   // Mixed / no structure
  },
  {
    id: TheoryID.MEAN_REVERTING,
    name: 'Mean Reverting',
    functionalForm: 'f(H,X) = μ + α(μ - X[-1]), α ∈ [0,1]',
    complexity: 2.0,    // One extra parameter α
    optimalRegime: 0,   // Ranging markets
  },
  {
    id: TheoryID.TREND_FOLLOWING,
    name: 'Trend Following',
    functionalForm: 'f(H,X) = X[-1] + β·∇_trend, β > 0',
    complexity: 2.5,    // Gradient estimation adds complexity
    optimalRegime: 1,   // Trending markets
  },
  {
    id: TheoryID.MOMENTUM,
    name: 'Momentum',
    functionalForm: 'f(H,X) = sign(momentum(20)) · |X[-1]|',
    complexity: 3.0,    // Requires momentum window
    optimalRegime: 1,   // Trending markets
  },
  {
    id: TheoryID.VOL_BREAKOUT,
    name: 'Volatility Breakout',
    functionalForm: 'f(H,X) = X[-1] + γ·ATR, γ > 0',
    complexity: 3.5,    // ATR computation adds complexity
    optimalRegime: 2,   // Volatile markets
  },
  {
    id: TheoryID.REGIME_SWITCH,
    name: 'Regime Switch',
    functionalForm: 'f(H,X) = switch(regime) { 0: mean_rev; 1: trend; 2: vol_break; 3: rw }',
    complexity: 5.0,    // Highest complexity — meta-theory
    optimalRegime: 3,   // Mixed markets
  },
  // NEW: Intermediate theories for better coverage
  {
    id: TheoryID.MICRO_TREND,
    name: 'MicroTrend',
    functionalForm: 'f(H,X) = X[-1] + δ·∇_micro, δ > 0 (short-term 5-bar)',
    complexity: 2.2,    // Slightly more than trend following
    optimalRegime: 1,   // Trending markets (short-term)
  },
  {
    id: TheoryID.WEAK_MEAN_REVERSION,
    name: 'WeakMeanReversion',
    functionalForm: 'f(H,X) = μ + α_w(μ - X[-1]), α_w ∈ [0,0.3]',
    complexity: 2.3,    // Similar to mean reverting but slower
    optimalRegime: 0,   // Ranging markets
  },
  {
    id: TheoryID.VOLATILITY_CLUSTER,
    name: 'VolatilityCluster',
    functionalForm: 'f(H,X) = X[-1] + σ·vol_factor, based on recent vol',
    complexity: 3.8,    // Vol-of-vol adds complexity
    optimalRegime: 2,   // Volatile markets
  },
  {
    id: TheoryID.DRIFT,
    name: 'Drift',
    functionalForm: 'f(H,X) = X[-1] + d·decay^m, d=drift, m=lookback',
    complexity: 3.2,    // Drift with exponential decay
    optimalRegime: 1,   // Trending markets (drift detection)
  },
];

// =============================================================================
// THEORY PREDICTION FUNCTIONS
// Each returns a predicted next price given stats and recent prices
// =============================================================================

/**
 * RANDOM_WALK: f(H,X) = X[-1] + ε
 * Baseline theory — no structure assumed.
 * ε is drawn from N(0, σ²) where σ² = H.variance
 */
export function predictRandomWalk(
  stats: SufficientStats,
  prices: number[],
  seed?: number
): number {
  const lastPrice = prices[prices.length - 1];
  const sigma = Math.sqrt(stats.variance);
  // Deterministic noise using Box-Muller with optional seed
  const noise = seed !== undefined
    ? deterministicNormal(seed, sigma)
    : 0; // For error computation, use expected value (0)
  return lastPrice + noise;
}

/**
 * MEAN_REVERTING: f(H,X) = μ + α(μ - X[-1])
 * α is estimated from autocorrelation: α = -autocorr[0] (lag-1)
 * Positive autocorr → trending, negative → mean-reverting
 */
export function predictMeanReverting(
  stats: SufficientStats,
  prices: number[]
): number {
  const lastPrice = prices[prices.length - 1];
  const mu = stats.mean;
  // α estimated from lag-1 autocorrelation (clamped to [0,1])
  const alpha = Math.max(0, Math.min(1, -stats.autocorr[0]));
  return mu + alpha * (mu - lastPrice);
}

/**
 * TREND_FOLLOWING: f(H,X) = X[-1] + β·∇_trend
 * ∇_trend = linear regression slope over last L prices
 * β = 1 (unit trend following)
 */
export function predictTrendFollowing(
  stats: SufficientStats,
  prices: number[]
): number {
  const lastPrice = prices[prices.length - 1];
  const trend = computeLinearTrend(prices);
  // β = 1 + Hurst adjustment: stronger trend following when Hurst > 0.5
  const beta = 1.0 + Math.max(0, stats.hurst - 0.5);
  return lastPrice + beta * trend;
}

/**
 * MOMENTUM: f(H,X) = sign(momentum(20)) · predicted_move
 * momentum = sum of returns over last 20 periods
 */
export function predictMomentum(
  stats: SufficientStats,
  prices: number[]
): number {
  const lastPrice = prices[prices.length - 1];
  const window = Math.min(20, prices.length - 1);
  if (window < 2) return lastPrice;

  const startPrice = prices[prices.length - 1 - window];
  const momentum = lastPrice - startPrice;
  const momentumSign = Math.sign(momentum);

  // Expected move = mean absolute return * momentum sign
  const avgMove = Math.sqrt(stats.variance);
  return lastPrice + momentumSign * avgMove;
}

/**
 * VOL_BREAKOUT: f(H,X) = X[-1] + γ·ATR
 * ATR = Average True Range (proxy: sqrt(variance) * 1.5)
 * γ = sign of last return (direction of breakout)
 */
export function predictVolBreakout(
  stats: SufficientStats,
  prices: number[]
): number {
  const lastPrice = prices[prices.length - 1];
  const atr = computeATR(prices, 14);
  const gamma = 1.0;

  // Direction: follow last significant move
  const lastReturn = prices.length >= 2
    ? prices[prices.length - 1] - prices[prices.length - 2]
    : 0;
  const direction = Math.sign(lastReturn);

  return lastPrice + direction * gamma * atr;
}

/**
 * REGIME_SWITCH: f(H,X) = switch(regime) { ... }
 * Meta-theory that delegates to the appropriate sub-theory
 */
export function predictRegimeSwitch(
  stats: SufficientStats,
  prices: number[]
): number {
  switch (stats.regime) {
    case 0: return predictMeanReverting(stats, prices);
    case 1: return predictTrendFollowing(stats, prices);
    case 2: return predictVolBreakout(stats, prices);
    case 3: return predictRandomWalk(stats, prices);
    default: return predictRandomWalk(stats, prices);
  }
}

// =============================================================================
// NEW THEORY PREDICTIONS (T7-T10)
// =============================================================================

/**
 * MICRO_TREND: Short-term trend detection (5-bar window)
 * f(H,X) = X[-1] + δ·∇_micro, δ > 0
 */
export function predictMicroTrend(
  stats: SufficientStats,
  prices: number[]
): number {
  const n = prices.length;
  if (n < 6) return prices[n - 1] || 100;
  
  // Short-term gradient (5-bar)
  const microGradient = prices[n - 1] - prices[n - 6];
  const delta = 0.5; // Scaling factor
  
  // Guard against NaN
  if (!isFinite(microGradient)) return prices[n - 1];
  
  return prices[n - 1] + delta * microGradient;
}

/**
 * WEAK_MEAN_REVERSION: Slow mean reversion
 * f(H,X) = μ + α_w(μ - X[-1]), α_w ∈ [0,0.3]
 */
export function predictWeakMeanReversion(
  stats: SufficientStats,
  prices: number[]
): number {
  const n = prices.length;
  if (n < 2) return prices[n - 1] || 100;
  
  // Use mean from stats, fallback to computed mean
  const mean = (stats.mean !== undefined && isFinite(stats.mean) && Math.abs(stats.mean) > 1e-10) 
    ? stats.mean 
    : prices.reduce((s, p) => s + p, 0) / n;
  
  // Guard against invalid mean
  if (!isFinite(mean)) return prices[n - 1];
  
  const alpha = 0.15; // Weak reversion coefficient (within [0, 0.3])
  const prediction = mean + alpha * (mean - prices[n - 1]);
  
  // Guard against NaN
  return isFinite(prediction) ? prediction : prices[n - 1];
}

/**
 * VOLATILITY_CLUSTER: Based on recent volatility patterns
 * f(H,X) = X[-1] + σ·vol_factor
 */
export function predictVolatilityCluster(
  stats: SufficientStats,
  prices: number[]
): number {
  const n = prices.length;
  if (n < 3) return prices[n - 1] || 100;
  
  // Recent volatility (last 5 returns)
  const recentReturns: number[] = [];
  for (let i = Math.max(1, n - 6); i < n; i++) {
    const ret = Math.abs(prices[i] - prices[i - 1]);
    if (isFinite(ret)) recentReturns.push(ret);
  }
  
  const recentVol = recentReturns.length > 0
    ? recentReturns.reduce((s, v) => s + v, 0) / recentReturns.length
    : 0.01; // Minimum volatility to prevent collapse
    
  // Guard against NaN
  if (!isFinite(recentVol)) return prices[n - 1];
  
  const volFactor = 0.3; // Volatility scaling
  const prediction = prices[n - 1] + volFactor * recentVol;
  
  // Guard against NaN
  return isFinite(prediction) ? prediction : prices[n - 1];
}

/**
 * DRIFT: Drift detection with exponential decay
 * f(H,X) = X[-1] + d·decay^m, d=drift, m=lookback
 */
export function predictDrift(
  stats: SufficientStats,
  prices: number[]
): number {
  const n = prices.length;
  if (n < 10) return prices[n - 1] || 100;
  
  // Calculate drift with exponential decay weighting
  let weightedSum = 0;
  let weightSum = 0;
  const decay = 0.9;
  
  for (let i = 1; i < Math.min(10, n); i++) {
    const weight = Math.pow(decay, i);
    const drift = prices[n - i] - prices[n - i - 1];
    
    // Guard against invalid drift values
    if (!isFinite(drift)) continue;
    
    weightedSum += weight * drift;
    weightSum += weight;
  }
  
  // Guard against division by zero or invalid values
  const driftComponent = (weightSum > 1e-10 && isFinite(weightedSum)) 
    ? weightedSum / weightSum 
    : 0;
  
  const prediction = prices[n - 1] + driftComponent;
  
  // Guard against final NaN
  return isFinite(prediction) ? prediction : prices[n - 1];
}

// =============================================================================
// UNIFIED PREDICTION DISPATCHER
// =============================================================================

/**
 * Dispatch prediction to the appropriate theory function.
 * This is the implementation of T_i: H × X_{t-L:t} → ℝ
 * 
 * GUARD: Ensures valid output even with degenerate inputs.
 */
export function predict(
  theoryId: TheoryID,
  stats: SufficientStats,
  prices: number[]
): number {
  // GUARD: Check for valid inputs
  if (!prices || prices.length < 2) {
    return 100; // Default fallback
  }
  
  const lastPrice = prices[prices.length - 1];
  
  // GUARD: Validate last price
  if (!isValidNumber(lastPrice)) {
    return 100;
  }
  
  // GUARD: Check for degenerate price window
  if (checkMinHistory(prices, 2)) {
    // Check if variance is too low (degenerate case)
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (isValidNumber(prices[i]) && isValidNumber(prices[i-1])) {
        returns.push(Math.abs(prices[i] - prices[i-1]));
      }
    }
    const variance = returns.length > 1 
      ? returns.reduce((s, v) => s + v, 0) / returns.length 
      : 0;
    if (variance < EPSILON.VARIANCE) {
      // Degenerate window - return last price (acts as Random Walk)
      return lastPrice;
    }
  }
  
  // GUARD: Check stats validity
  if (!stats || !isValidNumber(stats.mean) || !isValidNumber(stats.variance)) {
    // Fall back to Random Walk
    return lastPrice;
  }
  
  try {
    let prediction: number;
    
    switch (theoryId) {
      case TheoryID.RANDOM_WALK:      prediction = predictRandomWalk(stats, prices); break;
      case TheoryID.MEAN_REVERTING:   prediction = predictMeanReverting(stats, prices); break;
      case TheoryID.TREND_FOLLOWING:  prediction = predictTrendFollowing(stats, prices); break;
      case TheoryID.MOMENTUM:         prediction = predictMomentum(stats, prices); break;
      case TheoryID.VOL_BREAKOUT:     prediction = predictVolBreakout(stats, prices); break;
      case TheoryID.REGIME_SWITCH:    prediction = predictRegimeSwitch(stats, prices); break;
      // NEW: T7-T10
      case TheoryID.MICRO_TREND:      prediction = predictMicroTrend(stats, prices); break;
      case TheoryID.WEAK_MEAN_REVERSION: prediction = predictWeakMeanReversion(stats, prices); break;
      case TheoryID.VOLATILITY_CLUSTER:  prediction = predictVolatilityCluster(stats, prices); break;
      case TheoryID.DRIFT:            prediction = predictDrift(stats, prices); break;
      default:
        throw new Error(`Unknown theory ID: ${theoryId}`);
    }
    
    // Final GUARD: ensure prediction is valid
    return guardPrediction(prediction, lastPrice);
    
  } catch (error) {
    // Any error - fall back to Random Walk
    return lastPrice;
  }
}

// =============================================================================
// PREDICTION ERROR COMPUTATION
// Used by GEI cost function and Φ operator
// =============================================================================

/**
 * Compute mean absolute prediction error for a theory over a price window.
 * Uses one-step-ahead prediction: predict X[t] from X[0..t-1]
 */
export function computePredictionError(
  theoryId: TheoryID,
  stats: SufficientStats,
  prices: number[],
  windowSize: number = TN_CONSTANTS.LOOKBACK_WINDOW
): number {
  const n = Math.min(windowSize, prices.length - 1);
  if (n < 2) return 1.0; // Default high error if insufficient data

  let totalError = 0;
  let validCount = 0;
  const startIdx = prices.length - n - 1;

  for (let i = startIdx; i < prices.length - 1; i++) {
    const subPrices = prices.slice(Math.max(0, i - 20), i + 1);
    if (subPrices.length < 2) continue;
    
    const predicted = predict(theoryId, stats, subPrices);
    const actual = prices[i + 1];
    
    // Guard against NaN/Invalid predictions
    if (!isFinite(predicted) || !isFinite(actual)) continue;
    
    const error = Math.abs(predicted - actual);
    if (isFinite(error)) {
      totalError += error;
      validCount++;
    }
  }

  // If no valid predictions, return high error
  if (validCount < 2) return 1.0;
  
  const result = totalError / validCount;
  return isFinite(result) ? result : 1.0;
}

/**
 * Get the precomputed complexity K(T_i) for a theory.
 */
export function getTheoryComplexity(theoryId: TheoryID): number {
  return THEORY_FAMILIES[theoryId].complexity;
}

/**
 * Get the optimal regime for a theory.
 */
export function getTheoryOptimalRegime(theoryId: TheoryID): number {
  return THEORY_FAMILIES[theoryId].optimalRegime;
}

/**
 * Get all theory IDs as an array.
 */
export function getAllTheoryIds(): TheoryID[] {
  return Array.from({ length: THEORY_COUNT }, (_, i) => i as TheoryID);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Compute linear regression slope (trend) over prices.
 * Returns the slope in price units per tick.
 */
function computeLinearTrend(prices: number[]): number {
  const n = prices.length;
  if (n < 2) return 0;

  const window = Math.min(20, n);
  const slice = prices.slice(n - window);
  const m = slice.length;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < m; i++) {
    sumX += i;
    sumY += slice[i];
    sumXY += i * slice[i];
    sumX2 += i * i;
  }

  const denom = m * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return 0;

  return (m * sumXY - sumX * sumY) / denom;
}

/**
 * Compute Average True Range (ATR) approximation.
 * ATR = mean of |X[t] - X[t-1]| over last `period` ticks
 */
function computeATR(prices: number[], period: number = 14): number {
  const n = prices.length;
  if (n < 2) return 0;

  const window = Math.min(period, n - 1);
  let sum = 0;
  for (let i = n - window; i < n; i++) {
    sum += Math.abs(prices[i] - prices[i - 1]);
  }
  return sum / window;
}

/**
 * Deterministic normal distribution sample using Box-Muller transform.
 * Used for reproducible random walk predictions.
 */
function deterministicNormal(seed: number, sigma: number): number {
  // Simple LCG for deterministic pseudo-random
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;
  const r1 = ((a * seed + c) % m) / m;
  const r2 = ((a * (seed + 1) + c) % m) / m;
  // Box-Muller transform
  const z = Math.sqrt(-2 * Math.log(r1 + 1e-10)) * Math.cos(2 * Math.PI * r2);
  return z * sigma;
}
