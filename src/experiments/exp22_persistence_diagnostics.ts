/**
 * TN-LAB Experiment 22: GEI Persistence Diagnostics
 * 
 * Phase 3: Scientific Validation Framework
 * 
 * OBJECTIVE:
 * Identify the structural cause of GEI theory persistence ≈ 99%.
 * This is a DIAGNOSTIC experiment - no engine modifications allowed.
 * 
 * HYPOTHESIS:
 * Persistence ≈ 99% (target: 30-70%)
 * 
 * DIAGNOSTIC METRICS:
 * 1. Score Gap: separation between best and second-best theory cost
 * 2. Theory Selection Entropy: diversity of theory selections
 * 3. Γ State Drift: statistical change between consecutive windows
 * 4. Theory Duration: length of continuous theory segments
 * 
 * METHODOLOGY:
 * 1. For each time point t:
 *    - Build historical window W_past = 500 ticks
 *    - Compute Γ_t = Γ(W_past)
 *    - Evaluate all 10 theories using GEI scoring
 *    - Store diagnostic metrics
 * 
 * DATASETS:
 * - Simulators: trending, ranging, volatile, mixed
 * - Real markets: AAPL, BTC-USD, EURUSD=X, ^GSPC
 * 
 * MONTE CARLO: N = 500 simulations per dataset
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, SufficientStats, TN_CONSTANTS, THEORY_COUNT, GEIResult } from '../engine/types';
import { computeStats } from '../engine/gamma';
import { gei, evaluateTheory } from '../engine/gei';
import { predict } from '../engine/theories';
import { AssetData, OHLCV, ingestAsset, IngestionConfig } from '../simulator/dataIngestion';
import { getScientificVersion } from '../simulator/scientificSimulation';

// =============================================================================
// EXPERIMENT CONFIGURATION
// =============================================================================

const CONFIG = {
  W_PAST: 500,        // Historical window for H_t computation
  W_FUTURE: 50,       // Future window for evaluation
  STEP: 5,            // Step size between evaluation points
  N_SIMULATIONS: 500, // Monte Carlo runs
  MIN_HISTORY: 100,   // Minimum price history required
};

// =============================================================================
// DIAGNOSTIC RESULTS STRUCTURE
// =============================================================================

interface DiagnosticMetrics {
  // Persistence metrics
  persistence: number;  // P(T*_t = T*_{t+1})
  
  // Score gap metrics
  scoreGapMean: number;
  scoreGapMedian: number;
  scoreGapStd: number;
  
  // Theory selection entropy
  theoryEntropy: number;
  theoryEntropyNormalized: number;
  
  // Γ drift metrics
  gammaDriftMean: number;
  gammaDriftMedian: number;
  
  // Theory duration metrics
  theoryDurationMean: number;
  theoryDurationMedian: number;
  theoryDurationMax: number;
  
  // Theory distribution
  theoryDistribution: Map<TheoryID, number>;
}

interface GeneratorResult {
  name: string;
  metrics: DiagnosticMetrics;
  scoreGaps: number[];
  theoryDurations: number[];
}

interface RealMarketResult {
  name: string;
  metrics: DiagnosticMetrics;
  scoreGaps: number[];
  theoryDurations: number[];
  status: 'success' | 'insufficient_data';
}

// =============================================================================
// MARKET GENERATORS (same as Exp21)
// =============================================================================

/**
 * Generate trending market segment
 */
function generateTrendingSegment(n: number, seed: number): number[] {
  const prices: number[] = [100];
  let price = 100;
  const trend = 0.001;
  
  for (let i = 1; i < n; i++) {
    const noise = (seededRandom(seed + i) - 0.5) * 0.5;
    price = price * (1 + trend + noise * 0.01);
    prices.push(price);
  }
  return prices;
}

/**
 * Generate ranging market segment
 */
function generateRangingSegment(n: number, seed: number): number[] {
  const prices: number[] = [100];
  let price = 100;
  const mean = 100;
  const range = 2;
  
  for (let i = 1; i < n; i++) {
    const noise = (seededRandom(seed + i) - 0.5) * 2;
    price = mean + (price - mean) * 0.95 + noise;
    prices.push(price);
  }
  return prices;
}

/**
 * Generate volatile market segment
 */
function generateVolatileSegment(n: number, seed: number): number[] {
  const prices: number[] = [100];
  let price = 100;
  let volatility = 0.5;
  
  for (let i = 1; i < n; i++) {
    if (i % 20 === 0) {
      volatility = 0.5 + seededRandom(seed + i) * 2;
    }
    const move = (seededRandom(seed + i * 2) - 0.5) * volatility;
    price = price * (1 + move * 0.1);
    prices.push(price);
  }
  return prices;
}

/**
 * Generate mixed market segment (regime switching)
 */
function generateMixedSegment(n: number, seed: number): number[] {
  const prices: number[] = [100];
  let price = 100;
  let regime = seededRandom(seed) > 0.5 ? 1 : 0;
  
  for (let i = 1; i < n; i++) {
    if (i % 75 === 0) {
      regime = 1 - regime;
    }
    
    let move: number;
    if (regime === 1) {
      move = 0.001 + (seededRandom(seed + i) - 0.5) * 0.01;
    } else {
      move = (seededRandom(seed + i) - 0.5) * 0.02;
    }
    price = price * (1 + move);
    prices.push(price);
  }
  return prices;
}

// Simple seeded random number generator
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// =============================================================================
// DIAGNOSTIC COMPUTATION
// =============================================================================

/**
 * Compute L2 norm between two SufficientStats objects
 */
function computeGammaDrift(stats1: SufficientStats, stats2: SufficientStats): number {
  let sum = 0;
  
  // Mean difference
  sum += Math.pow(stats1.mean - stats2.mean, 2);
  
  // Variance difference
  sum += Math.pow(stats1.variance - stats2.variance, 2);
  
  // Skew difference
  sum += Math.pow(stats1.skew - stats2.skew, 2);
  
  // Kurtosis difference
  sum += Math.pow(stats1.kurtosis - stats2.kurtosis, 2);
  
  // Hurst difference
  sum += Math.pow(stats1.hurst - stats2.hurst, 2);
  
  // Autocorrelation differences
  for (let i = 0; i < 20; i++) {
    sum += Math.pow(stats1.autocorr[i] - stats2.autocorr[i], 2);
  }
  
  // Spectrum differences
  for (let i = 0; i < Math.min(stats1.spectrum.powers.length, stats2.spectrum.powers.length); i++) {
    sum += Math.pow(stats1.spectrum.powers[i] - stats2.spectrum.powers[i], 2);
  }
  
  return Math.sqrt(sum);
}

/**
 * Compute Shannon entropy of theory distribution
 */
function computeTheoryEntropy(theoryCounts: Map<TheoryID, number>): { entropy: number; normalizedEntropy: number } {
  const total = Array.from(theoryCounts.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return { entropy: 0, normalizedEntropy: 0 };
  
  let entropy = 0;
  for (const count of theoryCounts.values()) {
    const p = count / total;
    if (p > 0) {
      entropy -= p * Math.log(p);
    }
  }
  
  // Normalize by max entropy (uniform distribution)
  const maxEntropy = Math.log(THEORY_COUNT);
  const normalizedEntropy = maxEntropy > 0 ? entropy / maxEntropy : 0;
  
  return { entropy, normalizedEntropy };
}

/**
 * Compute theory durations from sequence of theory selections
 */
function computeTheoryDurations(selections: TheoryID[]): number[] {
  if (selections.length === 0) return [];
  
  const durations: number[] = [];
  let currentTheory = selections[0];
  let currentDuration = 1;
  
  for (let i = 1; i < selections.length; i++) {
    if (selections[i] === currentTheory) {
      currentDuration++;
    } else {
      durations.push(currentDuration);
      currentTheory = selections[i];
      currentDuration = 1;
    }
  }
  
  // Don't forget the last segment
  if (currentDuration > 0) {
    durations.push(currentDuration);
  }
  
  return durations;
}

/**
 * Compute all diagnostic metrics for a single simulation
 */
function computeDiagnosticMetrics(
  prices: number[],
  generatorName: string
): DiagnosticMetrics {
  const n = prices.length;
  const W = CONFIG.W_PAST;
  const step = CONFIG.STEP;
  
  if (n < W + CONFIG.W_FUTURE + step) {
    throw new Error(`Insufficient data: need ${W + CONFIG.W_FUTURE + step}, got ${n}`);
  }
  
  const selections: TheoryID[] = [];
  const scoreGaps: number[] = [];
  const gammaDrifts: number[] = [];
  let prevStats: SufficientStats | null = null;
  
  // Evaluate at each time step
  for (let t = W; t < n - CONFIG.W_FUTURE; t += step) {
    const windowPrices = prices.slice(t - W, t);
    
    if (windowPrices.length < W) continue;
    
    // Compute Γ
    const stats = computeStats(windowPrices);
    
    // Compute Γ drift
    if (prevStats !== null) {
      const drift = computeGammaDrift(stats, prevStats);
      gammaDrifts.push(drift);
    }
    prevStats = stats;
    
    // Run GEI
    const currentTheory = selections.length > 0 ? selections[selections.length - 1] : 0;
    const result = gei(stats, windowPrices, currentTheory, [], t);
    
    // Store selection
    selections.push(result.selectedTheory);
    
    // Store score gap (deltaC)
    scoreGaps.push(result.deltaC);
  }
  
  // Compute persistence
  let transitions = 0;
  for (let i = 1; i < selections.length; i++) {
    if (selections[i] !== selections[i - 1]) {
      transitions++;
    }
  }
  const persistence = selections.length > 1 ? 1 - (transitions / (selections.length - 1)) : 1;
  
  // Compute theory distribution
  const theoryCounts = new Map<TheoryID, number>();
  for (let i = 0; i < THEORY_COUNT; i++) {
    theoryCounts.set(i as TheoryID, 0);
  }
  for (const sel of selections) {
    theoryCounts.set(sel, (theoryCounts.get(sel) || 0) + 1);
  }
  
  // Compute entropy
  const { entropy, normalizedEntropy } = computeTheoryEntropy(theoryCounts);
  
  // Compute theory durations
  const durations = computeTheoryDurations(selections);
  const theoryDurationMean = durations.length > 0 
    ? durations.reduce((a, b) => a + b, 0) / durations.length 
    : 0;
  const theoryDurationMedian = durations.length > 0 
    ? [...durations].sort((a, b) => a - b)[Math.floor(durations.length / 2)]
    : 0;
  const theoryDurationMax = durations.length > 0 
    ? Math.max(...durations)
    : 0;
  
  // Compute score gap statistics
  const scoreGapMean = scoreGaps.length > 0 
    ? scoreGaps.reduce((a, b) => a + b, 0) / scoreGaps.length 
    : 0;
  const scoreGapMedian = scoreGaps.length > 0 
    ? [...scoreGaps].sort((a, b) => a - b)[Math.floor(scoreGaps.length / 2)]
    : 0;
  const scoreGapStd = scoreGaps.length > 0 
    ? Math.sqrt(scoreGaps.reduce((sum, g) => sum + Math.pow(g - scoreGapMean, 2), 0) / scoreGaps.length)
    : 0;
  
  // Compute Γ drift statistics
  const gammaDriftMean = gammaDrifts.length > 0 
    ? gammaDrifts.reduce((a, b) => a + b, 0) / gammaDrifts.length 
    : 0;
  const gammaDriftMedian = gammaDrifts.length > 0 
    ? [...gammaDrifts].sort((a, b) => a - b)[Math.floor(gammaDrifts.length / 2)]
    : 0;
  
  return {
    persistence,
    scoreGapMean,
    scoreGapMedian,
    scoreGapStd,
    theoryEntropy: entropy,
    theoryEntropyNormalized: normalizedEntropy,
    gammaDriftMean,
    gammaDriftMedian,
    theoryDurationMean,
    theoryDurationMedian,
    theoryDurationMax,
    theoryDistribution: theoryCounts,
  };
}

// =============================================================================
// MONTE CARLO SIMULATION
// =============================================================================

/**
 * Run Monte Carlo for a single generator
 */
function runGeneratorMonteCarlo(
  generatorName: string,
  generatorFn: (n: number, seed: number) => number[],
  nSimulations: number
): GeneratorResult {
  const allMetrics: DiagnosticMetrics[] = [];
  const allScoreGaps: number[] = [];
  const allDurations: number[] = [];
  
  for (let sim = 0; sim < nSimulations; sim++) {
    try {
      // Generate prices
      const totalTicks = CONFIG.W_PAST + CONFIG.W_FUTURE + 200;
      const prices = generatorFn(totalTicks, sim * 1000 + Date.now());
      
      // Compute diagnostics
      const metrics = computeDiagnosticMetrics(prices, generatorName);
      allMetrics.push(metrics);
      
      // Store raw data
      const diagnostics = computeDiagnosticMetrics(prices, generatorName);
      
      // Re-run to get score gaps (this is a simplified approach)
      const W = CONFIG.W_PAST;
      const step = CONFIG.STEP;
      let selections: TheoryID[] = [];
      let scoreGaps: number[] = [];
      let prevStats: SufficientStats | null = null;
      
      for (let t = W; t < prices.length - CONFIG.W_FUTURE; t += step) {
        const windowPrices = prices.slice(t - W, t);
        if (windowPrices.length < W) continue;
        
        const stats = computeStats(windowPrices);
        
        if (prevStats !== null) {
          // Compute drift
        }
        prevStats = stats;
        
        const currentTheory = selections.length > 0 ? selections[selections.length - 1] : 0;
        const result = gei(stats, windowPrices, currentTheory, [], t);
        
        selections.push(result.selectedTheory);
        scoreGaps.push(result.deltaC);
      }
      
      allScoreGaps.push(...scoreGaps);
      allDurations.push(...computeTheoryDurations(selections));
      
    } catch (e) {
      // Skip failed simulations
    }
  }
  
  // Aggregate results
  if (allMetrics.length === 0) {
    return {
      name: generatorName,
      metrics: {
        persistence: 0,
        scoreGapMean: 0,
        scoreGapMedian: 0,
        scoreGapStd: 0,
        theoryEntropy: 0,
        theoryEntropyNormalized: 0,
        gammaDriftMean: 0,
        gammaDriftMedian: 0,
        theoryDurationMean: 0,
        theoryDurationMedian: 0,
        theoryDurationMax: 0,
        theoryDistribution: new Map(),
      },
      scoreGaps: [],
      theoryDurations: [],
    };
  }
  
  // Average metrics
  const avgMetrics: DiagnosticMetrics = {
    persistence: allMetrics.reduce((a, m) => a + m.persistence, 0) / allMetrics.length,
    scoreGapMean: allMetrics.reduce((a, m) => a + m.scoreGapMean, 0) / allMetrics.length,
    scoreGapMedian: allMetrics.reduce((a, m) => a + m.scoreGapMedian, 0) / allMetrics.length,
    scoreGapStd: allMetrics.reduce((a, m) => a + m.scoreGapStd, 0) / allMetrics.length,
    theoryEntropy: allMetrics.reduce((a, m) => a + m.theoryEntropy, 0) / allMetrics.length,
    theoryEntropyNormalized: allMetrics.reduce((a, m) => a + m.theoryEntropyNormalized, 0) / allMetrics.length,
    gammaDriftMean: allMetrics.reduce((a, m) => a + m.gammaDriftMean, 0) / allMetrics.length,
    gammaDriftMedian: allMetrics.reduce((a, m) => a + m.gammaDriftMedian, 0) / allMetrics.length,
    theoryDurationMean: allMetrics.reduce((a, m) => a + m.theoryDurationMean, 0) / allMetrics.length,
    theoryDurationMedian: allMetrics.reduce((a, m) => a + m.theoryDurationMedian, 0) / allMetrics.length,
    theoryDurationMax: allMetrics.reduce((a, m) => a + m.theoryDurationMax, 0) / allMetrics.length,
    theoryDistribution: allMetrics[0].theoryDistribution,
  };
  
  return {
    name: generatorName,
    metrics: avgMetrics,
    scoreGaps: allScoreGaps,
    theoryDurations: allDurations,
  };
}

// =============================================================================
// REAL MARKET DATA
// =============================================================================

/**
 * Run diagnostics on real market data
 */
async function runRealMarketDiagnostics(asset: string): Promise<RealMarketResult> {
  try {
    const data = await ingestAsset({
      symbol: asset,
      timeframe: '1d',
      startDate: new Date(Date.now() - 2000 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
      adjustPrices: true,
      maxRetries: 3,
      cacheTTL: 60 * 60 * 1000,
    });
    
    if (!data || !data.prices || data.prices.length < CONFIG.W_PAST + CONFIG.W_FUTURE) {
      return {
        name: asset,
        metrics: {
          persistence: 0,
          scoreGapMean: 0,
          scoreGapMedian: 0,
          scoreGapStd: 0,
          theoryEntropy: 0,
          theoryEntropyNormalized: 0,
          gammaDriftMean: 0,
          gammaDriftMedian: 0,
          theoryDurationMean: 0,
          theoryDurationMedian: 0,
          theoryDurationMax: 0,
          theoryDistribution: new Map(),
        },
        scoreGaps: [],
        theoryDurations: [],
        status: 'insufficient_data',
      };
    }
    
    // Extract close prices
    const prices = data.prices.map((d: OHLCV) => d.close);
    
    // Compute diagnostics
    const metrics = computeDiagnosticMetrics(prices, asset);
    
    // Get raw data
    const W = CONFIG.W_PAST;
    const step = CONFIG.STEP;
    let selections: TheoryID[] = [];
    let scoreGaps: number[] = [];
    let prevStats: SufficientStats | null = null;
    
    for (let t = W; t < prices.length - CONFIG.W_FUTURE; t += step) {
      const windowPrices = prices.slice(t - W, t);
      if (windowPrices.length < W) continue;
      
      const stats = computeStats(windowPrices);
      prevStats = stats;
      
      const currentTheory = selections.length > 0 ? selections[selections.length - 1] : 0;
      const result = gei(stats, windowPrices, currentTheory, [], t);
      
      selections.push(result.selectedTheory);
      scoreGaps.push(result.deltaC);
    }
    
    return {
      name: asset,
      metrics,
      scoreGaps,
      theoryDurations: computeTheoryDurations(selections),
      status: 'success',
    };
  } catch (e) {
    return {
      name: asset,
      metrics: {
        persistence: 0,
        scoreGapMean: 0,
        scoreGapMedian: 0,
        scoreGapStd: 0,
        theoryEntropy: 0,
        theoryEntropyNormalized: 0,
        gammaDriftMean: 0,
        gammaDriftMedian: 0,
        theoryDurationMean: 0,
        theoryDurationMedian: 0,
        theoryDurationMax: 0,
        theoryDistribution: new Map(),
      },
      scoreGaps: [],
      theoryDurations: [],
      status: 'insufficient_data',
    };
  }
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

/**
 * Main experiment runner
 */
async function runExperiment22() {
  console.log('='.repeat(80));
  console.log('TN-LAB Experiment 22: GEI Persistence Diagnostics');
  console.log('Version:', getScientificVersion());
  console.log('='.repeat(80));
  console.log('');
  
  const results: GeneratorResult[] = [];
  
  // Run Monte Carlo for each generator
  const generators = [
    { name: 'Trending', fn: generateTrendingSegment },
    { name: 'Ranging', fn: generateRangingSegment },
    { name: 'Volatile', fn: generateVolatileSegment },
    { name: 'Mixed', fn: generateMixedSegment },
  ];
  
  for (const gen of generators) {
    console.log(`Running Monte Carlo: ${gen.name} (N=${CONFIG.N_SIMULATIONS})...`);
    const result = runGeneratorMonteCarlo(gen.name, gen.fn, CONFIG.N_SIMULATIONS);
    results.push(result);
    console.log(`  Persistence: ${(result.metrics.persistence * 100).toFixed(1)}%`);
    console.log(`  Score Gap Mean: ${result.metrics.scoreGapMean.toFixed(4)}`);
    console.log(`  Score Gap Median: ${result.metrics.scoreGapMedian.toFixed(4)}`);
    console.log(`  Theory Entropy (norm): ${result.metrics.theoryEntropyNormalized.toFixed(3)}`);
    console.log(`  Γ Drift Mean: ${result.metrics.gammaDriftMean.toFixed(4)}`);
    console.log(`  Theory Duration Mean: ${result.metrics.theoryDurationMean.toFixed(1)}`);
    console.log(`  Theory Duration Max: ${result.metrics.theoryDurationMax.toFixed(1)}`);
    console.log('');
  }
  
  // Run real markets
  console.log('Running real market diagnostics...');
  const realAssets = ['AAPL', 'BTC-USD', 'EURUSD=X', '^GSPC'];
  const realResults: RealMarketResult[] = [];
  
  for (const asset of realAssets) {
    const result = await runRealMarketDiagnostics(asset);
    realResults.push(result);
    console.log(`${asset}: ${result.status}`);
    if (result.status === 'success') {
      console.log(`  Persistence: ${(result.metrics.persistence * 100).toFixed(1)}%`);
      console.log(`  Score Gap Mean: ${result.metrics.scoreGapMean.toFixed(4)}`);
      console.log(`  Theory Entropy (norm): ${result.metrics.theoryEntropyNormalized.toFixed(3)}`);
    }
    console.log('');
  }
  
  // Print summary
  console.log('='.repeat(80));
  console.log('DIAGNOSTIC SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  
  console.log('SYNTHETIC DATA:');
  for (const r of results) {
    console.log(`  ${r.name}:`);
    console.log(`    Persistence: ${(r.metrics.persistence * 100).toFixed(1)}% (target: 30-70%)`);
    console.log(`    Score Gap: mean=${r.metrics.scoreGapMean.toFixed(4)}, median=${r.metrics.scoreGapMedian.toFixed(4)}`);
    console.log(`    Entropy (norm): ${r.metrics.theoryEntropyNormalized.toFixed(3)} (0=single theory, 1=uniform)`);
    console.log(`    Γ Drift: mean=${r.metrics.gammaDriftMean.toFixed(4)}, median=${r.metrics.gammaDriftMedian.toFixed(4)}`);
    console.log(`    Theory Duration: mean=${r.metrics.theoryDurationMean.toFixed(1)}, max=${r.metrics.theoryDurationMax.toFixed(1)}`);
  }
  
  console.log('');
  console.log('REAL MARKETS:');
  for (const r of realResults) {
    console.log(`  ${r.name}: ${r.status}`);
    if (r.status === 'success') {
      console.log(`    Persistence: ${(r.metrics.persistence * 100).toFixed(1)}% (target: 30-70%)`);
      console.log(`    Score Gap: mean=${r.metrics.scoreGapMean.toFixed(4)}, median=${r.metrics.scoreGapMedian.toFixed(4)}`);
      console.log(`    Entropy (norm): ${r.metrics.theoryEntropyNormalized.toFixed(3)}`);
      console.log(`    Γ Drift: mean=${r.metrics.gammaDriftMean.toFixed(4)}, median=${r.metrics.gammaDriftMedian.toFixed(4)}`);
    }
  }
  
  console.log('');
  console.log('DIAGNOSIS:');
  
  // Compute average metrics across all generators
  const avgPersistence = results.reduce((a, r) => a + r.metrics.persistence, 0) / results.length;
  const avgScoreGapMean = results.reduce((a, r) => a + r.metrics.scoreGapMean, 0) / results.length;
  const avgEntropy = results.reduce((a, r) => a + r.metrics.theoryEntropyNormalized, 0) / results.length;
  const avgGammaDrift = results.reduce((a, r) => a + r.metrics.gammaDriftMean, 0) / results.length;
  
  console.log(`  Average Persistence: ${(avgPersistence * 100).toFixed(1)}% (target: 30-70%)`);
  console.log(`  Average Score Gap: ${avgScoreGapMean.toFixed(4)}`);
  console.log(`  Average Entropy (norm): ${avgEntropy.toFixed(3)}`);
  console.log(`  Average Γ Drift: ${avgGammaDrift.toFixed(4)}`);
  
  console.log('');
  console.log('INTERPRETATION:');
  
  if (avgScoreGapMean < 0.01) {
    console.log('  → Score gaps are very small (< 0.01): theories are statistically indistinguishable');
    console.log('  → This explains high persistence: GEI sees minimal difference between theories');
  } else if (avgScoreGapMean < 0.05) {
    console.log('  → Score gaps are small but non-trivial: theories have some distinction');
  } else {
    console.log('  → Score gaps are significant: theory selection has clear winners');
  }
  
  if (avgEntropy < 0.2) {
    console.log('  → Very low entropy (< 0.2): always selects same theory');
    console.log('  → This confirms the persistence problem');
  } else if (avgEntropy < 0.5) {
    console.log('  → Low-moderate entropy: limited theory diversity');
  } else {
    console.log('  → Good entropy: theory selection is diverse');
  }
  
  if (avgGammaDrift < 0.1) {
    console.log('  → Very low Γ drift (< 0.1): market state appears stable');
    console.log('  → This explains why theories don\'t change: market seems stationary');
  } else if (avgGammaDrift < 1.0) {
    console.log('  → Low-moderate Γ drift: some market state variation');
  } else {
    console.log('  → Significant Γ drift: market state changes substantially');
  }
  
  console.log('');
  console.log('ROOT CAUSE ANALYSIS:');
  
  // Determine the likely cause
  const causes: string[] = [];
  
  if (avgScoreGapMean < 0.02) {
    causes.push('A) Very small score differences between theories');
  }
  if (avgEntropy < 0.2) {
    causes.push('B) Theory selection has minimal diversity (always same theory)');
  }
  if (avgGammaDrift < 0.1) {
    causes.push('C) Γ state appears stable (low drift between windows)');
  }
  
  if (causes.length > 0) {
    console.log('  Likely causes:');
    for (const cause of causes) {
      console.log(`    ${cause}`);
    }
  } else {
    console.log('  Persistence likely due to GEI algorithmic inertia (needs further investigation)');
  }
  
  console.log('');
  console.log('='.repeat(80));
  console.log('Experiment 22 Complete');
  console.log('='.repeat(80));
}

// Run if executed directly
runExperiment22().catch(console.error);
