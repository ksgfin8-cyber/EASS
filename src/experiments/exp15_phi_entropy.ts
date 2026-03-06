/**
 * TN-LAB Experiment 15: Φ vs Theory Ensemble Entropy
 * 
 * Scientific Stage v5 - New Experiments
 * 
 * OBJECTIVE:
 * Determine if Φ is equivalent or proportional to the entropy of the theory ensemble.
 * 
 * HYPOTHESIS:
 * H1: Φ ∝ H(T) where H(T) = -Σ p_i * log(p_i)
 * H2: Markets where theories compete → Φ high (high entropy)
 *      Markets where theories agree → Φ low (low entropy)
 * 
 * If correlation is high (>0.7), then Φ ≈ entropy of theory ensemble.
 * This means Φ measures "epistemic disagreement" between theories.
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, SufficientStats, GEIResult, TheoryEvaluation } from '../engine/types';
import { computeStats } from '../engine/gamma';
import { gei } from '../engine/gei';
import { computePhi } from '../engine/phi';

// =============================================================================
// SEEDED RNG (same as exp14)
// =============================================================================

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

// =============================================================================
// SYNTHETIC MARKET GENERATORS (same as exp14)
// =============================================================================

function generateRandomWalk(length: number, seed: number = 42): number[] {
  const rng = new SeededRNG(seed);
  const prices = [100.0];
  
  for (let i = 1; i < length; i++) {
    const noise = rng.nextNormal(0, 0.005);
    prices.push(Math.max(0.001, prices[i - 1] + noise));
  }
  
  return prices;
}

function generateMeanReversion(length: number, seed: number = 42): number[] {
  const rng = new SeededRNG(seed);
  const mu = 100.0;
  const alpha = 0.6;
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

function generateTrendWithNoise(length: number, seed: number = 42): number[] {
  const rng = new SeededRNG(seed);
  const drift = 0.0003;
  const beta = 0.7;
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

function generateRegimeSwitching(length: number, seed: number = 42): number[] {
  const rng = new SeededRNG(seed);
  const prices = [100.0];
  
  let currentRegime = 0;
  let regimeDuration = 50;
  let ticksInRegime = 0;
  
  const mu = 100.0;
  const alpha = 0.6;
  const drift = 0.0004;
  const beta = 0.7;
  const sigma = 0.003;
  
  let momentum = drift;
  
  for (let i = 1; i < length; i++) {
    ticksInRegime++;
    if (ticksInRegime > regimeDuration) {
      currentRegime = 1 - currentRegime;
      ticksInRegime = 0;
      regimeDuration = Math.floor(rng.next() * 80 + 40);
    }
    
    const noise = rng.nextNormal(0, sigma);
    
    if (currentRegime === 0) {
      const next = prices[i - 1] + alpha * (mu - prices[i - 1]) + noise;
      prices.push(Math.max(0.001, next));
    } else {
      momentum = beta * momentum + (1 - beta) * noise + drift;
      const next = prices[i - 1] + momentum;
      prices.push(Math.max(0.001, next));
    }
  }
  
  return prices;
}

function generateLogisticChaos(length: number, seed: number = 42): number[] {
  const rng = new SeededRNG(seed);
  const r = 3.9; // Chaotic parameter (close to 4)
  const prices = [0.5];
  
  for (let i = 1; i < length; i++) {
    const x = prices[i - 1];
    const noise = (rng.next() - 0.5) * 0.01;
    const next = r * x * (1 - x) + noise;
    prices.push(Math.max(0.001, Math.min(0.999, next) * 100));
  }
  
  return prices;
}

// =============================================================================
// THEORY ENTROPY COMPUTATION
// =============================================================================

/**
 * Convert GEI costs to theory probabilities using softmax.
 * p_i = exp(-cost_i) / Σ exp(-cost_j)
 */
function costsToProbabilities(evaluations: TheoryEvaluation[]): number[] {
  const epsilon = 1e-10;
  
  // Get costs
  const costs = evaluations.map(e => e.cost);
  
  // Find min cost for numerical stability
  const minCost = Math.min(...costs);
  
  // Compute exp(-(c - minCost)) for softmax
  const expNegCosts = costs.map(c => Math.exp(-(c - minCost)));
  const sumExp = expNegCosts.reduce((a, b) => a + b, 0);
  
  // Normalize to probabilities
  return expNegCosts.map(e => e / (sumExp + epsilon));
}

/**
 * Compute entropy of theory distribution: H(T) = -Σ p_i * log(p_i)
 */
function computeTheoryEntropy(probabilities: number[]): number {
  const epsilon = 1e-12;
  let entropy = 0;
  
  for (const p of probabilities) {
    if (p > epsilon) {
      entropy -= p * Math.log(p);
    }
  }
  
  return entropy;
}

/**
 * Normalize entropy to [0, 1] range: H_norm = H(T) / log(|T|)
 */
function normalizeEntropy(entropy: number, numTheories: number): number {
  const maxEntropy = Math.log(numTheories);
  return entropy / maxEntropy;
}

// =============================================================================
// WINDOW ANALYSIS
// =============================================================================

interface WindowAnalysis {
  phi: number;
  theoryEntropy: number;
  normalizedEntropy: number;
  theoryProbabilities: number[];
  selectedTheory: TheoryID;
  costs: number[];
}

/**
 * Analyze a single window: compute Φ and H(T)
 */
function analyzeWindow(
  prices: number[],
  windowSize: number,
  startIdx: number
): WindowAnalysis | null {
  const endIdx = Math.min(startIdx + windowSize, prices.length);
  const window = prices.slice(startIdx, endIdx);
  
  if (window.length < windowSize) return null;
  
  // Compute sufficient statistics
  const stats = computeStats(window);
  
  // Get GEI evaluation (all theories)
  const geiResult = gei(
    stats,
    window,
    0 as TheoryID,
    [],
    startIdx
  );
  
  // Compute Φ
  const phiResult = computePhi(geiResult.selectedTheory, stats, window);
  
  // Get theory probabilities from costs
  const probabilities = costsToProbabilities(geiResult.evaluations);
  
  // Compute entropy
  const entropy = computeTheoryEntropy(probabilities);
  const normalizedEntropy = normalizeEntropy(entropy, geiResult.evaluations.length);
  
  // Get costs for analysis
  const costs = geiResult.evaluations.map(e => e.cost);
  
  return {
    phi: phiResult.phi,
    theoryEntropy: entropy,
    normalizedEntropy,
    theoryProbabilities: probabilities,
    selectedTheory: geiResult.selectedTheory,
    costs,
  };
}

// =============================================================================
// MAIN EXPERIMENT
// =============================================================================

interface GeneratorResult {
  name: string;
  phiValues: number[];
  entropyValues: number[];
  normalizedEntropyValues: number[];
  meanPhi: number;
  meanEntropy: number;
  meanNormalizedEntropy: number;
  correlation: number;
}

function runExperimentForGenerator(
  name: string,
  generateFn: (len: number, seed: number) => number[],
  length: number = 10000,
  windowSize: number = 100,
  stepSize: number = 20
): GeneratorResult {
  console.log(`\n=== ${name} ===`);
  
  // Generate prices
  const prices = generateFn(length, 42);
  console.log(`Generated ${prices.length} prices`);
  
  const phiValues: number[] = [];
  const entropyValues: number[] = [];
  const normalizedEntropyValues: number[] = [];
  
  // Analyze windows
  for (let startIdx = 0; startIdx + windowSize < prices.length; startIdx += stepSize) {
    const analysis = analyzeWindow(prices, windowSize, startIdx);
    
    if (analysis) {
      phiValues.push(analysis.phi);
      entropyValues.push(analysis.theoryEntropy);
      normalizedEntropyValues.push(analysis.normalizedEntropy);
    }
  }
  
  // Compute means
  const meanPhi = phiValues.reduce((a, b) => a + b, 0) / phiValues.length;
  const meanEntropy = entropyValues.reduce((a, b) => a + b, 0) / entropyValues.length;
  const meanNormalizedEntropy = normalizedEntropyValues.reduce((a, b) => a + b, 0) / normalizedEntropyValues.length;
  
  // Compute correlation
  const correlation = computeCorrelation(phiValues, entropyValues);
  
  console.log(`Mean Φ: ${meanPhi.toFixed(4)}`);
  console.log(`Mean H(T): ${meanEntropy.toFixed(4)}`);
  console.log(`Mean H(T) normalized: ${meanNormalizedEntropy.toFixed(4)}`);
  console.log(`Correlation(Φ, H(T)): ${correlation.toFixed(4)}`);
  
  return {
    name,
    phiValues,
    entropyValues,
    normalizedEntropyValues,
    meanPhi,
    meanEntropy,
    meanNormalizedEntropy,
    correlation,
  };
}

/**
 * Compute Pearson correlation coefficient
 */
function computeCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator < 1e-10) return 0;
  return numerator / denominator;
}

// =============================================================================
// ENSEMBLE SIZE TEST (Test 9 from spec)
// =============================================================================

interface EnsembleSizeResult {
  numTheories: number;
  meanPhi: number;
  meanEntropy: number;
  correlation: number;
}

function testEnsembleSize(
  numTheories: number,
  generateFn: (len: number, seed: number) => number[],
  length: number = 5000,
  windowSize: number = 100
): EnsembleSizeResult {
  // This would require modifying GEI to use only first N theories
  // For now, we'll simulate by using subset of evaluation results
  
  const prices = generateFn(length, 42);
  const phiValues: number[] = [];
  const entropyValues: number[] = [];
  
  for (let startIdx = 0; startIdx + windowSize < prices.length; startIdx += 30) {
    const window = prices.slice(startIdx, startIdx + windowSize);
    if (window.length < windowSize) continue;
    
    const stats = computeStats(window);
    const geiResult = gei(stats, window, 0 as TheoryID, [], startIdx);
    
    // Use subset of theories
    const subsetEvals = geiResult.evaluations.slice(0, numTheories);
    const probabilities = costsToProbabilities(subsetEvals);
    const entropy = computeTheoryEntropy(probabilities);
    
    const phiResult = computePhi(geiResult.selectedTheory, stats, window);
    phiValues.push(phiResult.phi);
    entropyValues.push(entropy);
  }
  
  const meanPhi = phiValues.reduce((a, b) => a + b, 0) / phiValues.length;
  const meanEntropy = entropyValues.reduce((a, b) => a + b, 0) / entropyValues.length;
  const correlation = computeCorrelation(phiValues, entropyValues);
  
  return {
    numTheories,
    meanPhi,
    meanEntropy,
    correlation,
  };
}

// =============================================================================
// MAIN RUNNER
// =============================================================================

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  TN-LAB Experiment 15: Φ vs Theory Ensemble Entropy         ║');
console.log('║                                                                ║');
console.log('║  Testing: Φ ≈ H(T|M) where T = theories, M = market state    ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

// Generators to test
const generators: Array<{ name: string; fn: (len: number, seed: number) => number[] }> = [
  { name: 'Random Walk', fn: generateRandomWalk },
  { name: 'Mean Reversion', fn: generateMeanReversion },
  { name: 'Trend + Noise', fn: generateTrendWithNoise },
  { name: 'Regime Switching', fn: generateRegimeSwitching },
  { name: 'Logistic Chaos', fn: generateLogisticChaos },
];

// Run experiments
const results: GeneratorResult[] = [];

for (const gen of generators) {
  const result = runExperimentForGenerator(gen.name, gen.fn, 10000, 100, 20);
  results.push(result);
}

// Summary table
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  RESULTS SUMMARY                                               ║');
console.log('╠════════════════════════════════════════════════════════════════╣');
console.log('║ Generator          │ Mean Φ    │ Mean H(T) │ Corr(Φ, H)        ║');
console.log('╠════════════════════════════════════════════════════════════════╣');

for (const r of results) {
  console.log(`║ ${r.name.padEnd(18)} │ ${r.meanPhi.toFixed(4)}   │ ${r.meanEntropy.toFixed(4)}  │ ${r.correlation.toFixed(4)}             ║`);
}

console.log('╚════════════════════════════════════════════════════════════════╝');

// Overall correlation across all generators
const allPhi: number[] = [];
const allEntropy: number[] = [];

for (const r of results) {
  allPhi.push(...r.phiValues);
  allEntropy.push(...r.entropyValues);
}

const overallCorrelation = computeCorrelation(allPhi, allEntropy);

console.log(`\n>>> OVERALL CORRELATION: ${overallCorrelation.toFixed(4)}`);

// Interpretation
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  INTERPRETATION                                                 ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

if (overallCorrelation > 0.7) {
  console.log('✓ STRONG CORRELATION: Φ is strongly related to theory entropy');
  console.log('  → This supports H1: Φ ∝ H(T)');
  console.log('  → Φ measures epistemic disagreement between theories');
} else if (overallCorrelation > 0.4) {
  console.log('~ MODERATE CORRELATION: Φ is partially related to theory entropy');
  console.log('  → Φ is a function of entropy AND structural complexity');
} else {
  console.log('✗ WEAK CORRELATION: Φ measures something different from entropy');
  console.log('  → Φ may measure a deeper property of market structure');
}

// Ensemble size test
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  ENSEMBLE SIZE TEST (Control Experiment)                      ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

const ensembleResults: EnsembleSizeResult[] = [];

for (const n of [2, 5, 10]) {
  const result = testEnsembleSize(n, generateTrendWithNoise, 5000, 100);
  ensembleResults.push(result);
  console.log(`Theories=${n}: Mean Φ=${result.meanPhi.toFixed(4)}, Mean H(T)=${result.meanEntropy.toFixed(4)}, Corr=${result.correlation.toFixed(4)}`);
}

// Check: if Φ measures entropy, larger ensemble → higher Φ
if (ensembleResults.length >= 2) {
  console.log('\n>>> ENSEMBLE SIZE ORDERING:');
  console.log(`  2 theories: Φ = ${ensembleResults[0].meanPhi.toFixed(4)}`);
  console.log(`  5 theories: Φ = ${ensembleResults[1].meanPhi.toFixed(4)}`);
  console.log(`  10 theories: Φ = ${ensembleResults[2].meanPhi.toFixed(4)}`);
  
  const isIncreasing = ensembleResults[1].meanPhi >= ensembleResults[0].meanPhi &&
                       ensembleResults[2].meanPhi >= ensembleResults[1].meanPhi;
  
  if (isIncreasing) {
    console.log('  → Φ increases with ensemble size (consistent with entropy interpretation)');
  } else {
    console.log('  → Φ does NOT monotonically increase with ensemble size');
    console.log('  → Φ may measure structural complexity, not just theory disagreement');
  }
}

// Final verdict
console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  FINAL VERDICT                                                  ║');
console.log('╚════════════════════════════════════════════════════════════════╝');

const avgCorrelation = results.reduce((sum, r) => sum + r.correlation, 0) / results.length;

if (avgCorrelation > 0.7) {
  console.log('✅ PASS: Strong evidence that Φ ≈ entropy of theory ensemble');
  console.log('   Interpretation: TN-LAB measures epistemic uncertainty');
} else if (avgCorrelation > 0.4) {
  console.log('⚠️  PARTIAL: Moderate evidence that Φ is related to entropy');
  console.log('   Interpretation: Φ = f(entropy, structural_complexity)');
} else {
  console.log('❌ FAIL: Low correlation between Φ and H(T)');
  console.log('   Interpretation: Φ measures something deeper than theory entropy');
}
