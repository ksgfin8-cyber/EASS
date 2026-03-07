/**
 * TN-LAB Simulator — Scientific Metrics & Analysis
 * Phase 2: Scientific Market Simulation
 *
 * Statistical analysis and data science instrumentation
 * for simulation results.
 *
 * Metrics:
 * - Distribution analysis
 * - Stability metrics
 * - Correlation analysis
 * - Sensitivity analysis
 * - Regime behavior analysis
 *
 * NO React, NO browser APIs. Pure TypeScript.
 */

import { TheoryID, Transition } from '../engine/types';
import { SimulationResult, SimulationTick } from './scientificSimulation';

// =============================================================================
// BASIC STATISTICS
// =============================================================================

export interface StatisticalSummary {
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  count: number;
  coefficientOfVariation: number;
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
}

/**
 * Compute basic statistics for an array of numbers.
 */
export function computeStatistics(values: number[]): StatisticalSummary {
  if (values.length === 0) {
    return {
      mean: 0,
      median: 0,
      std: 0,
      min: 0,
      max: 0,
      count: 0,
      coefficientOfVariation: 0,
      percentiles: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  const sum = values.reduce((s, v) => s + v, 0);
  const mean = sum / n;

  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  const cv = mean !== 0 ? std / Math.abs(mean) : 0;

  const percentile = (p: number): number => {
    const idx = Math.floor(p * n);
    return sorted[Math.min(idx, n - 1)];
  };

  return {
    mean,
    median: percentile(0.5),
    std,
    min: sorted[0],
    max: sorted[n - 1],
    count: n,
    coefficientOfVariation: cv,
    percentiles: {
      p5: percentile(0.05),
      p25: percentile(0.25),
      p50: percentile(0.5),
      p75: percentile(0.75),
      p95: percentile(0.95),
    },
  };
}

// =============================================================================
// Φ STABILITY METRICS
// =============================================================================

export interface PhiStabilityMetrics {
  /** Overall Φ statistics */
  overall: StatisticalSummary;
  /** Rolling Φ statistics (window = 50) */
  rolling: StatisticalSummary;
  /** Variance of Φ */
  variance: number;
  /** Coefficient of variation */
  coefficientOfVariation: number;
  /** Stability score (1 - CV) */
  stabilityScore: number;
  /** Trend in Φ (linear regression slope) */
  trend: number;
  /** Autocorrelation at lag 1 */
  autocorrelation: number;
}

/**
 * Compute Φ stability metrics.
 */
export function computePhiStabilityMetrics(result: SimulationResult): PhiStabilityMetrics {
  const phiSeries = result.ticks.map(t => t.state.phi);

  if (phiSeries.length === 0) {
    return {
      overall: computeStatistics([]),
      rolling: computeStatistics([]),
      variance: 0,
      coefficientOfVariation: 0,
      stabilityScore: 0,
      trend: 0,
      autocorrelation: 0,
    };
  }

  const overall = computeStatistics(phiSeries);
  const variance = overall.std ** 2;
  const cv = overall.mean !== 0 ? overall.std / Math.abs(overall.mean) : 0;
  const stabilityScore = Math.max(0, 1 - cv);

  // Compute rolling statistics (window = 50)
  const windowSize = 50;
  const rollingMeans: number[] = [];
  for (let i = windowSize; i < phiSeries.length; i++) {
    const window = phiSeries.slice(i - windowSize, i);
    rollingMeans.push(window.reduce((s, v) => s + v, 0) / windowSize);
  }
  const rolling = computeStatistics(rollingMeans);

  // Compute trend (simple linear regression)
  const n = phiSeries.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += phiSeries[i];
    sumXY += i * phiSeries[i];
    sumX2 += i * i;
  }
  const trend = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0;

  // Compute autocorrelation at lag 1
  const mean = overall.mean;
  let autocov0 = 0, autocov1 = 0;
  for (let i = 0; i < n; i++) {
    autocov0 += Math.pow(phiSeries[i] - mean, 2);
    if (i < n - 1) {
      autocov1 += (phiSeries[i] - mean) * (phiSeries[i + 1] - mean);
    }
  }
  const autocorrelation = autocov0 > 0 ? autocov1 / autocov0 : 0;

  return {
    overall,
    rolling,
    variance,
    coefficientOfVariation: cv,
    stabilityScore,
    trend,
    autocorrelation,
  };
}

// =============================================================================
// THEORY DYNAMICS METRICS
// =============================================================================

export interface TheoryDynamicsMetrics {
  /** Theory usage distribution */
  usageDistribution: Record<TheoryID, number>;
  /** Theory entropy */
  entropy: number;
  /** Theory transition matrix */
  transitionMatrix: number[][];
  /** Most common transitions */
  topTransitions: Array<{ from: string; to: string; count: number }>;
  /** Theory persistence (average ticks per theory) */
  persistence: number;
  /** Theory switch rate */
  switchRate: number;
}

/**
 * Compute theory dynamics metrics.
 */
export function computeTheoryDynamicsMetrics(result: SimulationResult): TheoryDynamicsMetrics {
  const theoryNames: Record<TheoryID, string> = {
    [TheoryID.RANDOM_WALK]: 'RandomWalk',
    [TheoryID.MEAN_REVERTING]: 'MeanReverting',
    [TheoryID.TREND_FOLLOWING]: 'TrendFollowing',
    [TheoryID.MOMENTUM]: 'Momentum',
    [TheoryID.VOL_BREAKOUT]: 'VolBreakout',
    [TheoryID.REGIME_SWITCH]: 'RegimeSwitch',
    [TheoryID.MICRO_TREND]: 'MicroTrend',
    [TheoryID.WEAK_MEAN_REVERSION]: 'WeakMeanRev',
    [TheoryID.VOLATILITY_CLUSTER]: 'VolCluster',
    [TheoryID.DRIFT]: 'Drift',
  };

  const theorySeries = result.ticks.map(t => t.state.currentTheory);
  const transitions = result.transitions;

  // Theory usage distribution
  const usageDistribution: Record<TheoryID, number> = { ...result.theoryUsage };

  // Theory entropy
  const usageValues = Object.values(usageDistribution);
  const totalUsage = usageValues.reduce((s, v) => s + v, 0);
  let entropy = 0;
  for (const usage of usageValues) {
    if (usage > 0) {
      const p = usage / totalUsage;
      entropy -= p * Math.log(p);
    }
  }

  // Transition matrix
  const transitionMatrix: number[][] = Array(10).fill(null).map(() => Array(10).fill(0));
  for (const t of transitions) {
    transitionMatrix[t.from][t.to]++;
  }

  // Top transitions
  const transitionCounts: Record<string, number> = {};
  for (const t of transitions) {
    const key = `${theoryNames[t.from]}→${theoryNames[t.to]}`;
    transitionCounts[key] = (transitionCounts[key] || 0) + 1;
  }

  const topTransitions = Object.entries(transitionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => {
      const [from, to] = key.split('→');
      return { from, to, count };
    });

  // Theory persistence
  let currentStreak = 1;
  let totalStreaks = 0;
  let streakCount = 0;
  for (let i = 1; i < theorySeries.length; i++) {
    if (theorySeries[i] === theorySeries[i - 1]) {
      currentStreak++;
    } else {
      totalStreaks += currentStreak;
      streakCount++;
      currentStreak = 1;
    }
  }
  totalStreaks += currentStreak;
  streakCount++;
  const persistence = streakCount > 0 ? totalStreaks / streakCount : 0;

  // Switch rate
  const switchRate = theorySeries.length > 1
    ? transitions.length / (theorySeries.length - 1)
    : 0;

  return {
    usageDistribution,
    entropy,
    transitionMatrix,
    topTransitions,
    persistence,
    switchRate,
  };
}

// =============================================================================
// REGIME BEHAVIOR METRICS
// =============================================================================

export interface RegimeBehaviorMetrics {
  /** Distribution of regimes detected */
  regimeDistribution: Record<number, number>;
  /** Average Φ per regime */
  avgPhiByRegime: Record<number, number>;
  /** Theory distribution per regime */
  theoryDistributionByRegime: Record<number, Record<TheoryID, number>>;
  /** Regime persistence */
  regimePersistence: number;
  /** Number of regime changes */
  regimeChangeCount: number;
}

/**
 * Compute regime behavior metrics.
 */
export function computeRegimeBehaviorMetrics(result: SimulationResult): RegimeBehaviorMetrics {
  const regimeNames: Record<number, string> = {
    0: 'Ranging',
    1: 'Trending',
    2: 'Volatile',
    3: 'Mixed',
  };

  const regimeSeries = result.ticks.map(t => t.state.stats?.regime ?? 0);
  const theorySeries = result.ticks.map(t => t.state.currentTheory);
  const phiSeries = result.ticks.map(t => t.state.phi);

  // Regime distribution
  const regimeDistribution: Record<number, number> = {};
  for (const r of regimeSeries) {
    regimeDistribution[r] = (regimeDistribution[r] || 0) + 1;
  }

  // Average Φ per regime
  const phiByRegime: Record<number, number[]> = {};
  for (let i = 0; i < regimeSeries.length; i++) {
    const r = regimeSeries[i];
    if (!phiByRegime[r]) phiByRegime[r] = [];
    phiByRegime[r].push(phiSeries[i]);
  }

  const avgPhiByRegime: Record<number, number> = {};
  for (const [r, phis] of Object.entries(phiByRegime)) {
    avgPhiByRegime[parseInt(r)] = phis.reduce((s, v) => s + v, 0) / phis.length;
  }

  // Theory distribution per regime
  const theoryDistributionByRegime: Record<number, Record<TheoryID, number>> = {};
  for (let i = 0; i < regimeSeries.length; i++) {
    const r = regimeSeries[i];
    const t = theorySeries[i];
    if (!theoryDistributionByRegime[r]) {
      theoryDistributionByRegime[r] = {
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
    }
    theoryDistributionByRegime[r][t]++;
  }

  // Regime persistence
  let regimeChanges = 0;
  let currentStreak = 1;
  let totalStreaks = 0;
  let streakCount = 0;
  for (let i = 1; i < regimeSeries.length; i++) {
    if (regimeSeries[i] !== regimeSeries[i - 1]) {
      regimeChanges++;
      totalStreaks += currentStreak;
      streakCount++;
      currentStreak = 1;
    } else {
      currentStreak++;
    }
  }
  totalStreaks += currentStreak;
  streakCount++;
  const regimePersistence = streakCount > 0 ? totalStreaks / streakCount : 0;

  return {
    regimeDistribution,
    avgPhiByRegime,
    theoryDistributionByRegime,
    regimePersistence,
    regimeChangeCount: regimeChanges,
  };
}

// =============================================================================
// CORRELATION ANALYSIS
// =============================================================================

export interface CorrelationMetrics {
  /** Φ vs regime correlation */
  phiRegimeCorrelation: number;
  /** Φ vs theory correlation */
  phiTheoryCorrelation: number;
  /** Φ vs price returns correlation */
  phiReturnCorrelation: number;
  /** Signal vs price returns correlation */
  signalReturnCorrelation: number;
  /** Theory entropy vs Φ correlation */
  entropyPhiCorrelation: number;
}

/**
 * Compute correlation between two series.
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);

  const meanX = xSlice.reduce((s, v) => s + v, 0) / n;
  const meanY = ySlice.reduce((s, v) => s + v, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - meanX;
    const dy = ySlice[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den > 0 ? num / den : 0;
}

/**
 * Compute correlation metrics.
 */
export function computeCorrelationMetrics(result: SimulationResult): CorrelationMetrics {
  const phiSeries = result.ticks.map(t => t.state.phi);
  const regimeSeries = result.ticks.map(t => t.state.stats?.regime ?? 0);
  const theorySeries = result.ticks.map(t => t.state.currentTheory);
  const signalSeries = result.ticks.map(t => t.state.signal);
  const entropySeries = result.ticks.map(t => t.entropy);

  // Compute price returns
  const prices = result.ticks.map(t => t.price);
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  // Align series lengths
  const phiForReturns = phiSeries.slice(0, returns.length);
  const signalForReturns = signalSeries.slice(0, returns.length);

  return {
    phiRegimeCorrelation: pearsonCorrelation(phiSeries, regimeSeries.map(r => r as number)),
    phiTheoryCorrelation: pearsonCorrelation(phiSeries, theorySeries.map(t => t as number)),
    phiReturnCorrelation: pearsonCorrelation(phiForReturns, returns),
    signalReturnCorrelation: pearsonCorrelation(signalForReturns, returns),
    entropyPhiCorrelation: pearsonCorrelation(entropySeries, phiSeries),
  };
}

// =============================================================================
// SENSITIVITY ANALYSIS
// =============================================================================

export interface SensitivityMetrics {
  /** Sensitivity to warmup period */
  warmupSensitivity: number;
  /** Sensitivity to lookback window */
  lookbackSensitivity: number;
  /** Sensitivity to entropy window */
  entropyWindowSensitivity: number;
}

/**
 * Compute sensitivity metrics by analyzing parameter variations.
 * This is a simplified version - full sensitivity would require
 * running multiple simulations with different parameters.
 */
export function computeSensitivityMetrics(result: SimulationResult): SensitivityMetrics {
  // For now, compute sensitivity based on parameter impact on Φ
  // Full implementation would require multiple simulation runs

  const phiSeries = result.ticks.map(t => t.state.phi);
  const phiStats = computeStatistics(phiSeries);

  // Sensitivity as coefficient of variation of key outputs
  // Higher CV = more sensitive to initial conditions
  const warmupSensitivity = phiStats.coefficientOfVariation;
  const lookbackSensitivity = phiStats.coefficientOfVariation;
  const entropyWindowSensitivity = phiStats.coefficientOfVariation;

  return {
    warmupSensitivity,
    lookbackSensitivity,
    entropyWindowSensitivity,
  };
}

// =============================================================================
// COMPREHENSIVE ANALYSIS REPORT
// =============================================================================

export interface ComprehensiveAnalysis {
  phiStability: PhiStabilityMetrics;
  theoryDynamics: TheoryDynamicsMetrics;
  regimeBehavior: RegimeBehaviorMetrics;
  correlation: CorrelationMetrics;
  sensitivity: SensitivityMetrics;
}

/**
 * Compute comprehensive analysis of simulation results.
 */
export function analyzeSimulation(result: SimulationResult): ComprehensiveAnalysis {
  return {
    phiStability: computePhiStabilityMetrics(result),
    theoryDynamics: computeTheoryDynamicsMetrics(result),
    regimeBehavior: computeRegimeBehaviorMetrics(result),
    correlation: computeCorrelationMetrics(result),
    sensitivity: computeSensitivityMetrics(result),
  };
}

// =============================================================================
// COMPLEXITY METRICS (Lempel-Ziv, Entropy Rate, etc.)
// =============================================================================

export interface ComplexityMetrics {
  /** Lempel-Ziv complexity (normalized) */
  lempelZiv: number;
  /** Entropy rate (bits per symbol) */
  entropyRate: number;
  /** Approximate entropy */
  approximateEntropy: number;
  /** Sample entropy */
  sampleEntropy: number;
}

/**
 * Compute Lempel-Ziv complexity (normalized).
 * Measures the number of unique substrings in the sequence.
 */
function computeLempelZivComplexity(sequence: number[]): number {
  if (sequence.length < 2) return 0;

  // Discretize the sequence into bins
  const n = sequence.length;
  const median = computeStatistics(sequence).median;
  const binarySeq = sequence.map(v => v >= median ? 1 : 0);

  // Lempel-Ziv 77 algorithm (simplified)
  let i = 0;
  let complexity = 0;
  const substrings: string[] = [];

  while (i < n) {
    let found = false;
    for (let j = substrings.length; j >= 1; j--) {
      const sub = binarySeq.slice(i, i + j).join('');
      if (substrings.includes(sub)) {
        found = true;
        break;
      }
    }
    if (!found) {
      const subLen = Math.min(substrings.length + 1, n - i);
      substrings.push(binarySeq.slice(i, i + subLen).join(''));
      complexity++;
    }
    i++;
    if (i >= n) break;
  }

  // Normalize by theoretical maximum
  const maxComplexity = n / Math.log2(n);
  return complexity / maxComplexity;
}

/**
 * Compute entropy rate using sliding window.
 * H_rate = limit as n->infinity of H(X_1...X_n) / n
 */
function computeEntropyRate(sequence: number[], windowSize: number = 10): number {
  if (sequence.length < windowSize * 2) return 0;

  // Count n-gram frequencies
  const ngrams: Record<string, number> = {};
  for (let i = 0; i < sequence.length - windowSize; i++) {
    const ngram = sequence.slice(i, i + windowSize).join(',');
    ngrams[ngram] = (ngrams[ngram] || 0) + 1;
  }

  // Compute entropy
  const total = sequence.length - windowSize;
  let entropy = 0;
  for (const count of Object.values(ngrams)) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }

  // Normalize by window size to get entropy rate
  return entropy / windowSize;
}

/**
 * Compute approximate entropy (ApEn).
 * Measures the regularity of a time series.
 */
function computeApproximateEntropy(sequence: number[], m: number = 2, r: number = 0.2): number {
  if (sequence.length < m * 2) return 0;

  const N = sequence.length;
  const rVal = r * computeStatistics(sequence).std;

  if (rVal === 0) return 0;

  // Count similar patterns
  const countSimilar = (len: number): number => {
    let sum = 0;
    for (let i = 0; i <= N - len; i++) {
      let matches = 0;
      for (let j = 0; j <= N - len; j++) {
        let similar = true;
        for (let k = 0; k < len; k++) {
          if (Math.abs(sequence[i + k] - sequence[j + k]) > rVal) {
            similar = false;
            break;
          }
        }
        if (similar) matches++;
      }
      sum += Math.log(matches / (N - len + 1));
    }
    return sum / (N - len + 1);
  };

  const phi_m = countSimilar(m);
  const phi_m1 = countSimilar(m + 1);

  return phi_m - phi_m1;
}

/**
 * Compute complexity metrics for a price series.
 */
export function computeComplexityMetrics(prices: number[]): ComplexityMetrics {
  if (prices.length < 50) {
    return {
      lempelZiv: 0,
      entropyRate: 0,
      approximateEntropy: 0,
      sampleEntropy: 0,
    };
  }

  // Convert to returns for complexity analysis
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  // Discretize returns into quantiles
  const stats = computeStatistics(returns);
  const discretized = returns.map(r => {
    if (r < stats.percentiles.p25) return 0;
    if (r < stats.percentiles.p50) return 1;
    if (r < stats.percentiles.p75) return 2;
    return 3;
  });

  return {
    lempelZiv: computeLempelZivComplexity(discretized),
    entropyRate: computeEntropyRate(discretized),
    approximateEntropy: computeApproximateEntropy(returns),
    sampleEntropy: 0, // Simplified - would need more complex implementation
  };
}

// =============================================================================
// MUTUAL INFORMATION (for Γ discrimination audit)
// =============================================================================

export interface MutualInformationResult {
  /** Mutual Information I(T; H) */
  mutualInformation: number;
  /** Theory entropy H(T) */
  theoryEntropy: number;
  /** Normalized MI (0-1 scale) */
  normalizedMI: number;
  /** Interpretation */
  interpretation: 'low' | 'medium' | 'high';
}

/**
 * Compute Mutual Information I(T; H) between theory selection and market state.
 * Low MI indicates Γ is not discriminating between theories.
 */
export function computeMutualInformation(
  theorySeries: TheoryID[],
  regimeSeries: number[]
): MutualInformationResult {
  const n = Math.min(theorySeries.length, regimeSeries.length);
  if (n < 100) {
    return {
      mutualInformation: 0,
      theoryEntropy: 0,
      normalizedMI: 0,
      interpretation: 'low',
    };
  }

  // Compute probability distributions
  const theoryCounts: Record<number, number> = {};
  const regimeCounts: Record<number, number> = {};
  const jointCounts: Record<string, number> = {};

  for (let i = 0; i < n; i++) {
    const t = theorySeries[i];
    const r = regimeSeries[i];
    theoryCounts[t] = (theoryCounts[t] || 0) + 1;
    regimeCounts[r] = (regimeCounts[r] || 0) + 1;
    jointCounts[`${t},${r}`] = (jointCounts[`${t},${r}`] || 0) + 1;
  }

  // Compute entropies
  let hTheory = 0;
  for (const count of Object.values(theoryCounts)) {
    const p = count / n;
    hTheory -= p * Math.log(p);
  }

  let hRegime = 0;
  for (const count of Object.values(regimeCounts)) {
    const p = count / n;
    hRegime -= p * Math.log(p);
  }

  // Compute joint entropy
  let hJoint = 0;
  for (const count of Object.values(jointCounts)) {
    const p = count / n;
    hJoint -= p * Math.log(p);
  }

  // Mutual information: I(T; H) = H(T) + H(H) - H(T, H)
  const mi = hTheory + hRegime - hJoint;

  // Normalize by min(H(T), H(H))
  const normalizedMI = mi / Math.min(hTheory, hRegime || 1);

  // Interpretation
  let interpretation: 'low' | 'medium' | 'high' = 'low';
  if (normalizedMI > 0.5) interpretation = 'high';
  else if (normalizedMI > 0.2) interpretation = 'medium';

  return {
    mutualInformation: mi,
    theoryEntropy: hTheory,
    normalizedMI: Math.min(1, normalizedMI),
    interpretation,
  };
}

// =============================================================================
// BOOTSTRAP CONFIDENCE INTERVALS
// =============================================================================

export interface BootstrapResult {
  statistic: number;
  standardError: number;
  ci95Lower: number;
  ci95Upper: number;
  confidenceLevel: number;
  bootstrapSamples: number;
}

/**
 * Compute bootstrap confidence interval for a statistic.
 * Uses resampling with replacement to estimate sampling distribution.
 */
export function bootstrapConfidenceInterval(
  data: number[],
  statistic: (sample: number[]) => number,
  nBootstrap: number = 1000,
  confidenceLevel: number = 0.95
): BootstrapResult {
  const n = data.length;
  if (n < 2) {
    return {
      statistic: statistic(data),
      standardError: 0,
      ci95Lower: statistic(data),
      ci95Upper: statistic(data),
      confidenceLevel,
      bootstrapSamples: nBootstrap,
    };
  }

  // Compute original statistic
  const originalStat = statistic(data);

  // Bootstrap resampling
  const bootstrapStats: number[] = [];
  for (let i = 0; i < nBootstrap; i++) {
    // Resample with replacement
    const sample: number[] = [];
    for (let j = 0; j < n; j++) {
      const idx = Math.floor(Math.random() * n);
      sample.push(data[idx]);
    }
    bootstrapStats.push(statistic(sample));
  }

  // Sort bootstrap statistics
  bootstrapStats.sort((a, b) => a - b);

  // Compute standard error
  const mean = bootstrapStats.reduce((s, v) => s + v, 0) / nBootstrap;
  const variance = bootstrapStats.reduce((s, v) => s + (v - mean) ** 2, 0) / nBootstrap;
  const standardError = Math.sqrt(variance);

  // Compute confidence interval
  const alpha = 1 - confidenceLevel;
  const lowerIdx = Math.floor((alpha / 2) * nBootstrap);
  const upperIdx = Math.floor((1 - alpha / 2) * nBootstrap);

  return {
    statistic: originalStat,
    standardError,
    ci95Lower: bootstrapStats[lowerIdx],
    ci95Upper: bootstrapStats[upperIdx],
    confidenceLevel,
    bootstrapSamples: nBootstrap,
  };
}

// =============================================================================
// ANALYSIS REPORT GENERATION
// =============================================================================

/**
 * Generate comprehensive analysis report as markdown.
 */
export function generateAnalysisReport(
  result: SimulationResult,
  analysis: ComprehensiveAnalysis
): string {
  const { phiStability, theoryDynamics, regimeBehavior, correlation, sensitivity } = analysis;

  const theoryNames: Record<TheoryID, string> = {
    [TheoryID.RANDOM_WALK]: 'Random Walk',
    [TheoryID.MEAN_REVERTING]: 'Mean Reverting',
    [TheoryID.TREND_FOLLOWING]: 'Trend Following',
    [TheoryID.MOMENTUM]: 'Momentum',
    [TheoryID.VOL_BREAKOUT]: 'Vol Breakout',
    [TheoryID.REGIME_SWITCH]: 'Regime Switch',
    [TheoryID.MICRO_TREND]: 'Micro Trend',
    [TheoryID.WEAK_MEAN_REVERSION]: 'Weak Mean Rev',
    [TheoryID.VOLATILITY_CLUSTER]: 'Vol Cluster',
    [TheoryID.DRIFT]: 'Drift',
  };

  const regimeNames: Record<number, string> = {
    0: 'Ranging',
    1: 'Trending',
    2: 'Volatile',
    3: 'Mixed',
  };

  let report = `# TN-LAB Scientific Analysis Report

## Φ Stability Analysis

| Metric | Value |
|--------|-------|
| Mean Φ | ${phiStability.overall.mean.toFixed(4)} |
| Median Φ | ${phiStability.overall.median.toFixed(4)} |
| Std Dev | ${phiStability.overall.std.toFixed(4)} |
| Variance | ${phiStability.variance.toFixed(6)} |
| CV | ${phiStability.coefficientOfVariation.toFixed(4)} |
| Stability Score | ${phiStability.stabilityScore.toFixed(4)} |
| Trend | ${phiStability.trend.toFixed(6)} |
| Autocorrelation (lag 1) | ${phiStability.autocorrelation.toFixed(4)} |

### Φ Distribution

- Min: ${phiStability.overall.min.toFixed(4)}
- 5th percentile: ${phiStability.overall.percentiles.p5.toFixed(4)}
- 25th percentile: ${phiStability.overall.percentiles.p25.toFixed(4)}
- 50th percentile: ${phiStability.overall.percentiles.p50.toFixed(4)}
- 75th percentile: ${phiStability.overall.percentiles.p75.toFixed(4)}
- 95th percentile: ${phiStability.overall.percentiles.p95.toFixed(4)}
- Max: ${phiStability.overall.max.toFixed(4)}

## Theory Dynamics

- **Theory Entropy**: ${theoryDynamics.entropy.toFixed(4)}
- **Theory Persistence**: ${theoryDynamics.persistence.toFixed(2)} ticks
- **Switch Rate**: ${(theoryDynamics.switchRate * 100).toFixed(2)}%

### Theory Usage

| Theory | Count |
|--------|-------|
`;

  for (const [tid, count] of Object.entries(theoryDynamics.usageDistribution)) {
    const theoryId = parseInt(tid) as TheoryID;
    report += `| ${theoryNames[theoryId]} | ${count} |\n`;
  }

  report += `
### Top Transitions

| From | To | Count |
|------|----|-------|
`;

  for (const t of theoryDynamics.topTransitions) {
    report += `| ${t.from} | ${t.to} | ${t.count} |\n`;
  }

  report += `
## Regime Behavior

- **Regime Persistence**: ${regimeBehavior.regimePersistence.toFixed(2)} ticks
- **Regime Changes**: ${regimeBehavior.regimeChangeCount}

### Regime Distribution

| Regime | Count | Avg Φ |
|--------|-------|-------|
`;

  for (const [rid, count] of Object.entries(regimeBehavior.regimeDistribution)) {
    const avgPhi = regimeBehavior.avgPhiByRegime[parseInt(rid)]?.toFixed(4) || 'N/A';
    report += `| ${regimeNames[parseInt(rid)] || rid} | ${count} | ${avgPhi} |\n`;
  }

  report += `
## Correlation Analysis

| Correlation | Value |
|-------------|-------|
| Φ ↔ Regime | ${correlation.phiRegimeCorrelation.toFixed(4)} |
| Φ ↔ Theory | ${correlation.phiTheoryCorrelation.toFixed(4)} |
| Φ ↔ Returns | ${correlation.phiReturnCorrelation.toFixed(4)} |
| Signal ↔ Returns | ${correlation.signalReturnCorrelation.toFixed(4)} |
| Entropy ↔ Φ | ${correlation.entropyPhiCorrelation.toFixed(4)} |

## Sensitivity Analysis

| Parameter | Sensitivity |
|-----------|-------------|
| Warmup Period | ${sensitivity.warmupSensitivity.toFixed(4)} |
| Lookback Window | ${sensitivity.lookbackSensitivity.toFixed(4)} |
| Entropy Window | ${sensitivity.entropyWindowSensitivity.toFixed(4)} |

---
*Generated by TN-LAB Metrics Engine v5.4*
`;

  return report;
}

// =============================================================================
// H-SPACE DIMENSION ANALYSIS (Phase 3)
// =============================================================================

/**
 * Result of PCA analysis on H-space
 */
export interface PCAResult {
  /** Eigenvalues (variance explained by each component) */
  eigenvalues: number[];
  /** Explained variance ratio for each component */
  explainedVarianceRatio: number[];
  /** Cumulative explained variance */
  cumulativeVariance: number[];
  /** Number of components needed for 95% variance */
  componentsFor95Variance: number;
  /** Effective dimension (using Kaiser criterion: eigenvalue > 1) */
  kaiserDimension: number;
  /** First 3 principal components (if available) */
  components?: number[][];
}

/**
 * Result of intrinsic dimension estimation
 */
export interface IntrinsicDimResult {
  /** Estimated intrinsic dimension */
  dimension: number;
  /** Method used */
  method: 'eigengap' | 'CorrelationDimension' | 'PCA';
  /** Confidence/quality metric */
  quality: number;
  /** Details from the estimation */
  details: Record<string, number>;
}

/**
 * Perform PCA on H-space data
 * 
 * @param hVectors - Array of H-space vectors (each is number[])
 * @returns PCA result with eigenvalues, variance explained, effective dimension
 */
export function computePCA(hVectors: number[][]): PCAResult {
  if (hVectors.length < 2) {
    throw new Error('Need at least 2 H-vectors for PCA');
  }
  
  const n = hVectors.length;
  const dim = hVectors[0].length;
  
  // Center the data
  const means = new Array(dim).fill(0);
  for (const v of hVectors) {
    for (let i = 0; i < dim; i++) {
      means[i] += v[i];
    }
  }
  for (let i = 0; i < dim; i++) {
    means[i] /= n;
  }
  
  const centered = hVectors.map(v => 
    v.map((x, i) => x - means[i])
  );
  
  // Compute covariance matrix
  const cov: number[][] = Array(dim).fill(0).map(() => Array(dim).fill(0));
  for (const v of centered) {
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        cov[i][j] += v[i] * v[j] / (n - 1);
      }
    }
  }
  
  // Power iteration for top eigenvalues (simplified)
  // For full PCA, would use SVD or eigendecomposition
  const eigenvalues: number[] = [];
  const maxIterations = 100;
  let remainingCov = cov.map(row => [...row]);
  
  for (let comp = 0; comp < dim; comp++) {
    // Power iteration to find largest eigenvalue
    let vector = new Array(dim).fill(0).map(() => Math.random());
    let norm = Math.sqrt(vector.reduce((s, x) => s + x * x, 0));
    vector = vector.map(x => x / norm);
    
    for (let iter = 0; iter < maxIterations; iter++) {
      const newVec = new Array(dim).fill(0);
      for (let i = 0; i < dim; i++) {
        for (let j = 0; j < dim; j++) {
          newVec[i] += remainingCov[i][j] * vector[j];
        }
      }
      norm = Math.sqrt(newVec.reduce((s, x) => s + x * x, 0));
      if (norm < 1e-10) break;
      vector = newVec.map(x => x / norm);
    }
    
    // Compute eigenvalue
    const eigenval = vector.reduce((s, x, i) => 
      s + vector[i] * (remainingCov[i].reduce((ss, y) => ss + y * vector[i], 0)), 0
    );
    eigenvalues.push(Math.max(0, eigenval));
    
    // Deflate covariance matrix
    if (comp < dim - 1) {
      for (let i = 0; i < dim; i++) {
        for (let j = 0; j < dim; j++) {
          remainingCov[i][j] -= eigenval * vector[i] * vector[j];
        }
      }
    }
  }
  
  // Sort eigenvalues descending
  eigenvalues.sort((a, b) => b - a);
  
  // Variance explained
  const totalVar = eigenvalues.reduce((s, x) => s + x, 0);
  const explainedVarianceRatio = eigenvalues.map(e => e / totalVar);
  
  // Cumulative variance
  const cumulativeVariance: number[] = [];
  let cumSum = 0;
  for (const e of explainedVarianceRatio) {
    cumSum += e;
    cumulativeVariance.push(cumSum);
  }
  
  // Components for 95% variance
  const componentsFor95Variance = cumulativeVariance.findIndex(v => v >= 0.95) + 1;
  
  // Kaiser criterion: eigenvalue > 1 (for standardized data)
  // Since we're using covariance (not correlation), normalize
  const kaiserDimension = eigenvalues.filter(e => e > totalVar / dim).length;
  
  return {
    eigenvalues,
    explainedVarianceRatio,
    cumulativeVariance,
    componentsFor95Variance,
    kaiserDimension,
  };
}

/**
 * Estimate intrinsic dimension using eigengap heuristic
 * 
 * The eigengap heuristic looks for the largest gap between
 * consecutive eigenvalues - this suggests the true dimension.
 * 
 * @param eigenvalues - PCA eigenvalues
 * @returns Intrinsic dimension estimate
 */
export function estimateIntrinsicDimension(eigenvalues: number[]): IntrinsicDimResult {
  // Compute eigengaps
  const eigengaps: number[] = [];
  for (let i = 0; i < eigenvalues.length - 1; i++) {
    eigengaps.push(eigenvalues[i] - eigenvalues[i + 1]);
  }
  
  // Find maximum eigengap
  let maxGap = -1;
  let maxGapIdx = 0;
  for (let i = 0; i < eigengaps.length; i++) {
    if (eigengaps[i] > maxGap) {
      maxGap = eigengaps[i];
      maxGapIdx = i;
    }
  }
  
  // Intrinsic dimension is typically at the gap + 1
  const dimension = maxGapIdx + 1;
  
  // Quality is normalized gap size
  const avgEigenvalue = eigenvalues.reduce((s, x) => s + x, 0) / eigenvalues.length;
  const quality = maxGap / avgEigenvalue;
  
  return {
    dimension,
    method: 'eigengap',
    quality,
    details: {
      maxEigengap: maxGap,
      maxEigengapIndex: maxGapIdx,
      avgEigenvalue,
    },
  };
}

/**
 * Full H-space geometry analysis
 */
export interface HSpaceGeometry {
  /** PCA results */
  pca: PCAResult;
  /** Intrinsic dimension */
  intrinsicDim: IntrinsicDimResult;
  /** Raw eigenvalues for further analysis */
  eigenvalues: number[];
  /** Number of samples analyzed */
  nSamples: number;
  /** Original dimension */
  originalDim: number;
}

/**
 * Analyze the geometry of H-space
 * 
 * @param hVectors - Array of H-space vectors from simulation
 * @returns Complete geometry analysis
 */
export function analyzeHSpaceGeometry(hVectors: number[][]): HSpaceGeometry {
  const nSamples = hVectors.length;
  const originalDim = hVectors[0].length;
  
  const pca = computePCA(hVectors);
  const intrinsicDim = estimateIntrinsicDimension(pca.eigenvalues);
  
  return {
    pca,
    intrinsicDim,
    eigenvalues: pca.eigenvalues,
    nSamples,
    originalDim,
  };
}

/**
 * Format H-space geometry as markdown
 */
export function formatHSpaceGeometryReport(analysis: HSpaceGeometry): string {
  const { pca, intrinsicDim, eigenvalues, nSamples, originalDim } = analysis;
  
  let report = `# H-Space Geometry Analysis

## Overview
- **Samples**: ${nSamples}
- **Original Dimension**: ${originalDim}
- **Estimated Intrinsic Dimension**: ${intrinsicDim.dimension} (${intrinsicDim.method})
- **Intrinsic Dimension Quality**: ${intrinsicDim.quality.toFixed(4)}

## PCA Results

### Eigenvalues (Top 10)
| Component | Eigenvalue | Variance % | Cumulative % |
|-----------|------------|------------|--------------|
`;
  
  for (let i = 0; i < Math.min(10, eigenvalues.length); i++) {
    report += `| ${i + 1} | ${eigenvalues[i].toFixed(4)} | ${(pca.explainedVarianceRatio[i] * 100).toFixed(2)}% | ${(pca.cumulativeVariance[i] * 100).toFixed(2)}% |\n`;
  }
  
  report += `
### Dimensionality Summary
- **Components for 95% Variance**: ${pca.componentsFor95Variance}
- **Kaiser Dimension** (eigenvalue > mean): ${pca.kaiserDimension}
- **Effective Compression**: ${((1 - pca.componentsFor95Variance / originalDim) * 100).toFixed(1)}% reduction

## Interpretation

The H-space has intrinsic dimension **${intrinsicDim.dimension}** out of ${originalDim} possible dimensions.
This suggests the market state space can be effectively described with fewer
variables than the full ${originalDim}-dimensional representation.

---
*Generated by TN-LAB H-Space Geometry Analyzer v5.5*
`;
  
  return report;
}
