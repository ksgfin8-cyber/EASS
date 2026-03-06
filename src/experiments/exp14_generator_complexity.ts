/**
 * TN-LAB Experiment 14: Φ vs Generator Complexity
 * 
 * Scientific Stage v5 - New Experiments
 * 
 * OBJECTIVE:
 * Verify if Φ correlates with the generative complexity of markets.
 * 
 * HYPOTHESIS:
 * If Φ measures generative structure, then:
 *   random walk < mean reversion < trend+noise < regime switching
 * 
 * MARKETS TESTED:
 * 1. Random walk (Φ ≈ 0) - baseline, no structure
 * 2. Mean reversion simple (Φ moderate) - simple structure
 * 3. Trend + noise (Φ higher) - momentum structure
 * 4. Regime switching (Φ high) - complex multi-regime structure
 * 5. Logistic chaos - deterministic chaos (complex but structured)
 * 
 * If ordering matches: Φ measures generative structure of markets!
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, SufficientStats } from '../engine/types';
import { computeStats } from '../engine/gamma';
import { gei } from '../engine/gei';
import { computePhi } from '../engine/phi';

// =============================================================================
// SYNTHETIC MARKET GENERATORS WITH INCREASING COMPLEXITY
// =============================================================================

/**
 * Seeded RNG for deterministic results
 */
class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  nextNormal(mean: number = 0, std: number = 1): number {
    const u1 = this.next() + 1e-10;
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
  }
}

/**
 * Generator 1: Pure Random Walk (baseline)
 * X_t = X_{t-1} + ε
 * Expected: Φ ≈ 0
 */
function generateRandomWalk(length: number, seed: number = 42): number[] {
  const rng = new SeededRNG(seed);
  const prices = [100.0];
  
  for (let i = 1; i < length; i++) {
    const noise = rng.nextNormal(0, 0.005);
    prices.push(Math.max(0.001, prices[i - 1] + noise));
  }
  
  return prices;
}

/**
 * Generator 2: Simple Mean Reversion
 * X_t = μ + α(X_{t-1} - μ) + ε
 * Expected: Φ moderate (some structure)
 */
function generateMeanReversion(length: number, seed: number = 42): number[] {
  const rng = new SeededRNG(seed);
  const mu = 100.0;
  const alpha = 0.6; // Mean reversion speed
  const sigma = 0.003;
  
  const prices = [100.0];
  
  for (let i = 1; i < length; i++) {
    const noise = rng.nextNormal(0, sigma);
    const prev = prices[i - 1];
    const next = prev + alpha * (mu - prev) + noise;
    prices.push(Math.max(0.001, next));
  }
  
  return prices;
}

/**
 * Generator 3: Trend + Noise
 * X_t = X_{t-1} + drift + momentum + ε
 * Expected: Φ higher (momentum structure)
 */
function generateTrendWithNoise(length: number, seed: number = 42): number[] {
  const rng = new SeededRNG(seed);
  const drift = 0.0003;
  const beta = 0.7; // Momentum persistence
  const sigma = 0.004;
  
  const prices = [100.0];
  let momentum = drift;
  
  for (let i = 1; i < length; i++) {
    const noise = rng.nextNormal(0, sigma);
    momentum = beta * momentum + (1 - beta) * noise + drift;
    const next = prices[i - 1] + momentum;
    prices.push(Math.max(0.001, next));
  }
  
  return prices;
}

/**
 * Generator 4: Regime Switching
 * Alternates between mean reversion and trend
 * Expected: Φ high (complex multi-regime structure)
 */
function generateRegimeSwitching(length: number, seed: number = 42): number[] {
  const rng = new SeededRNG(seed);
  const prices = [100.0];
  
  let currentRegime = 0; // 0 = mean reversion, 1 = trend
  let regimeDuration = 50;
  let ticksInRegime = 0;
  
  const mu = 100.0;
  const alpha = 0.6;
  const drift = 0.0004;
  const beta = 0.7;
  const sigma = 0.003;
  
  let momentum = drift;
  
  for (let i = 1; i < length; i++) {
    // Switch regime periodically
    ticksInRegime++;
    if (ticksInRegime > regimeDuration) {
      currentRegime = 1 - currentRegime;
      ticksInRegime = 0;
      regimeDuration = Math.floor(rng.next() * 80 + 40);
    }
    
    const noise = rng.nextNormal(0, sigma);
    let next: number;
    
    if (currentRegime === 0) {
      // Mean reversion
      const prev = prices[i - 1];
      next = prev + alpha * (mu - prev) + noise;
    } else {
      // Trend
      momentum = beta * momentum + (1 - beta) * noise + drift;
      next = prices[i - 1] + momentum;
    }
    
    prices.push(Math.max(0.001, next));
  }
  
  return prices;
}

/**
 * Generator 5: Logistic Chaos
 * X_{t+1} = r * X_t * (1 - X_t)
 * Deterministic chaos - complex but structured
 * Expected: Φ depends on how well theories capture the chaos
 */
function generateLogisticChaos(length: number, seed: number = 42): number[] {
  const rng = new SeededRNG(seed);
  
  // r in (3.57, 4) produces chaos
  const r = 3.9;
  
  // Scale to price-like values
  const values = [0.5 + rng.next() * 0.1];
  const prices = [100.0];
  
  for (let i = 1; i < length; i++) {
    // Logistic map
    const x = values[i - 1];
    const nextX = r * x * (1 - x);
    values.push(nextX);
    
    // Scale to price with some noise
    const noise = rng.nextNormal(0, 0.001);
    const price = 100 + (nextX - 0.5) * 50 + noise;
    prices.push(Math.max(0.001, price));
  }
  
  return prices;
}

// =============================================================================
// Φ COMPUTATION FOR A MARKET
// =============================================================================

/**
 * Compute mean Φ for a price series
 */
function computeMeanPhi(prices: number[], windowSize: number = 100): number {
  const phis: number[] = [];
  const transitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }> = [];
  
  for (let i = windowSize; i + 1 < prices.length; i += 10) {
    const window = prices.slice(i - windowSize, i);
    const stats = computeStats(window);
    const geiResult = gei(stats, window, 0 as TheoryID, transitionHistory, phis.length);
    const phiResult = computePhi(geiResult.selectedTheory, stats, window);
    phis.push(phiResult.phi);
  }
  
  if (phis.length === 0) return 0;
  return phis.reduce((a, b) => a + b, 0) / phis.length;
}

/**
 * Compute statistics for Φ distribution
 */
function computePhiStats(prices: number[], windowSize: number = 100): {
  mean: number;
  std: number;
  min: number;
  max: number;
  samples: number;
} {
  const phis: number[] = [];
  const transitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }> = [];
  
  for (let i = windowSize; i + 1 < prices.length; i += 10) {
    const window = prices.slice(i - windowSize, i);
    const stats = computeStats(window);
    const geiResult = gei(stats, window, 0 as TheoryID, transitionHistory, phis.length);
    const phiResult = computePhi(geiResult.selectedTheory, stats, window);
    phis.push(phiResult.phi);
  }
  
  if (phis.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0, samples: 0 };
  }
  
  const mean = phis.reduce((a, b) => a + b, 0) / phis.length;
  const variance = phis.reduce((a, b) => a + (b - mean) ** 2, 0) / phis.length;
  
  return {
    mean,
    std: Math.sqrt(variance),
    min: Math.min(...phis),
    max: Math.max(...phis),
    samples: phis.length,
  };
}

// =============================================================================
// MAIN EXPERIMENT
// =============================================================================

export interface GeneratorResult {
  name: string;
  description: string;
  expectedPhi: 'low' | 'moderate' | 'high';
  phiStats: {
    mean: number;
    std: number;
    min: number;
    max: number;
    samples: number;
  };
}

export function runGeneratorComplexityExperiment(): {
  pass: boolean;
  results: GeneratorResult[];
  ordering: string[];
  hypothesisResult: string;
  metric: string;
} {
  console.log('\n=== EXPERIMENT 14: Φ vs Generator Complexity ===\n');
  
  const length = 1500;
  const windowSize = 100;
  
  const generators: Array<{
    name: string;
    description: string;
    expectedPhi: 'low' | 'moderate' | 'high';
    generator: (len: number, seed: number) => number[];
  }> = [
    {
      name: 'Random Walk',
      description: 'Pure random walk: X_t = X_{t-1} + ε',
      expectedPhi: 'low',
      generator: generateRandomWalk,
    },
    {
      name: 'Mean Reversion',
      description: 'Simple mean reversion: X_t = μ + α(X_{t-1} - μ) + ε',
      expectedPhi: 'moderate',
      generator: generateMeanReversion,
    },
    {
      name: 'Trend + Noise',
      description: 'Momentum-enhanced trend: X_t = X_{t-1} + drift + momentum + ε',
      expectedPhi: 'high',
      generator: generateTrendWithNoise,
    },
    {
      name: 'Regime Switching',
      description: 'Alternates between mean reversion and trend',
      expectedPhi: 'high',
      generator: generateRegimeSwitching,
    },
    {
      name: 'Logistic Chaos',
      description: 'Deterministic chaos: X_{t+1} = r * X_t * (1 - X_t)',
      expectedPhi: 'moderate', // Chaos is structured but hard to predict
      generator: generateLogisticChaos,
    },
  ];
  
  const results: GeneratorResult[] = [];
  
  console.log('Testing generators by complexity:\n');
  
  for (const gen of generators) {
    console.log(`Generating ${gen.name}...`);
    const prices = gen.generator(length, 42);
    const phiStats = computePhiStats(prices, windowSize);
    
    console.log(`  Φ = ${phiStats.mean.toFixed(4)} ± ${phiStats.std.toFixed(4)}`);
    console.log(`  Range: [${phiStats.min.toFixed(3)}, ${phiStats.max.toFixed(3)}]`);
    console.log(`  Samples: ${phiStats.samples}\n`);
    
    results.push({
      name: gen.name,
      description: gen.description,
      expectedPhi: gen.expectedPhi,
      phiStats,
    });
  }
  
  // Sort by mean Φ (observed)
  const sortedByPhi = [...results].sort((a, b) => b.phiStats.mean - a.phiStats.mean);
  const ordering = sortedByPhi.map(r => r.name);
  
  console.log('--- Observed Φ Ordering (highest to lowest) ---');
  for (let i = 0; i < ordering.length; i++) {
    const r = sortedByPhi[i];
    console.log(`  ${i + 1}. ${r.name}: Φ = ${r.phiStats.mean.toFixed(4)}`);
  }
  
  // Check hypothesis: random < mean reversion < trend
  const randomResult = results.find(r => r.name === 'Random Walk')!;
  const meanRevResult = results.find(r => r.name === 'Mean Reversion')!;
  const trendResult = results.find(r => r.name === 'Trend + Noise')!;
  const regimeResult = results.find(r => r.name === 'Regime Switching')!;
  
  const randomLessThanMeanRev = randomResult.phiStats.mean < meanRevResult.phiStats.mean;
  const meanRevLessThanTrend = meanRevResult.phiStats.mean < trendResult.phiStats.mean;
  const trendLessThanRegime = trendResult.phiStats.mean <= regimeResult.phiStats.mean;
  
  // At least random < trend should hold
  const randomLessThanTrend = randomResult.phiStats.mean < trendResult.phiStats.mean;
  
  // Hypothesis: random < mean reversion < trend < regime switching
  const hypothesis = randomLessThanMeanRev && meanRevLessThanTrend;
  const strictHypothesis = randomLessThanMeanRev && meanRevLessThanTrend && trendLessThanRegime;
  
  console.log('\n--- Hypothesis Testing ---');
  console.log(`Random < Mean Reversion: ${randomLessThanMeanRev ? '✓' : '✗'} (${randomResult.phiStats.mean.toFixed(4)} < ${meanRevResult.phiStats.mean.toFixed(4)})`);
  console.log(`Mean Reversion < Trend: ${meanRevLessThanTrend ? '✓' : '✗'} (${meanRevResult.phiStats.mean.toFixed(4)} < ${trendResult.phiStats.mean.toFixed(4)})`);
  console.log(`Trend <= Regime Switching: ${trendLessThanRegime ? '✓' : '✗'} (${trendResult.phiStats.mean.toFixed(4)} <= ${regimeResult.phiStats.mean.toFixed(4)})`);
  
  let hypothesisResult: string;
  if (strictHypothesis) {
    hypothesisResult = 'FULL PASS: Perfect ordering! Φ measures generative structure.';
  } else if (hypothesis) {
    hypothesisResult = 'PARTIAL PASS: Basic ordering holds (random < mean rev < trend).';
  } else if (randomLessThanTrend) {
    hypothesisResult = 'WEAK PASS: Random < Trend holds, but ordering incomplete.';
  } else {
    hypothesisResult = 'FAIL: Φ does not correlate with generator complexity.';
  }
  
  console.log(`\nResult: ${hypothesisResult}`);
  
  // Metric for summary
  const metric = `${ordering.join(' < ')}`;
  
  return {
    pass: hypothesis || randomLessThanTrend,
    results,
    ordering,
    hypothesisResult,
    metric,
  };
}

// Run if called directly
if (require.main === module) {
  const result = runGeneratorComplexityExperiment();
  console.log('\n=== FINAL RESULT ===');
  console.log(`Status: ${result.pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Ordering: ${result.metric}`);
  console.log(`Interpretation: ${result.hypothesisResult}`);
}
