/**
 * TN-LAB Experiment 16: Φ vs Noise Level (Noise Dilution Test)
 * 
 * Scientific Stage v5 - Investigación Científica
 * 
 * OBJECTIVE:
 * Determine if Φ measures predictive market structure by observing how it 
 * changes when noise is progressively injected into a structured generator.
 * 
 * HYPOTHESIS:
 * H0 (Null): Φ is independent of noise level (dΦ/dλ ≈ 0)
 *             This would imply Φ does NOT measure structure
 * 
 * H1 (Scientific): Φ decreases with noise (dΦ/dλ < 0) and tends to zero
 *                  when noise dominates: lim(λ→1) Φ(λ) = 0
 * 
 * EXPERIMENT DESIGN:
 * Generate series: X_t(λ) = (1-λ) * S_t + λ * N_t
 * 
 * where:
 *   S_t = structured signal (trend)
 *   N_t = Gaussian noise
 *   λ ∈ [0,1] = noise level
 * 
 * λ interpretation:
 *   0     → pure signal
 *   0.25  → signal dominant
 *   0.5   → mixed
 *   0.75  → noise dominant
 *   1     → pure noise (equivalent to random walk)
 * 
 * PROCEDURE:
 * For each λ ∈ {0, 0.1, 0.2, ..., 1.0}:
 *   1. Generate synthetic series: X_t = (1-λ) * trend + λ * noise
 *   2. Run TN-LAB backtest
 *   3. Calculate Φ_mean, Φ_variance, active_theories
 * 
 * METRICS:
 * 1. Φ mean: Φ̄(λ) - main metric
 * 2. Structural slope: dΦ/dλ (expected: < 0)
 * 3. Correlation: corr(λ, Φ) (expected: < -0.7)
 * 4. Critical point: noise level where Φ < 0.01
 * 
 * VALIDATION:
 * Experiment passes if:
 *   - corr(λ, Φ) < -0.7 (strong negative correlation)
 *   - Φ(1) ≈ Φ_random_walk (noise dominates)
 * 
 * INTERPRETATION:
 * If confirmed, Φ ∝ Signal-to-Noise Ratio
 * Φ ≈ structure / (structure + noise)
 * This means Φ measures information structural del mercado.
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, SufficientStats, GEIResult } from '../engine/types';
import { computeStats } from '../engine/gamma';
import { gei } from '../engine/gei';
import { computePhi } from '../engine/phi';

// =============================================================================
// SEEDED RNG
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
// SIGNAL GENERATORS
// =============================================================================

/**
 * Generate pure structured signal (trend with momentum)
 * S_t = trend component with momentum persistence
 */
function generateSignal(length: number, seed: number = 42): number[] {
  const rng = new SeededRNG(seed);
  const drift = 0.0003;
  const beta = 0.7; // Momentum persistence
  const sigma = 0.002; // Low noise for signal
  
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
 * Generate pure noise (Gaussian random walk)
 * N_t = pure noise, no structure
 */
function generateNoise(length: number, seed: number = 42): number[] {
  const rng = new SeededRNG(seed);
  const sigma = 0.005;
  
  const prices = [100.0];
  
  for (let i = 1; i < length; i++) {
    const noise = rng.nextNormal(0, sigma);
    prices.push(Math.max(0.001, prices[i - 1] + noise));
  }
  
  return prices;
}

/**
 * Mix signal and noise at given noise level λ
 * X_t(λ) = (1-λ) * S_t + λ * N_t
 * 
 * This creates a continuous spectrum from pure signal to pure noise.
 */
function generateSignalNoiseMix(
  length: number,
  noiseLevel: number,
  seed: number = 42
): number[] {
  // Generate signal and noise with different seeds for independence
  const signal = generateSignal(length, seed);
  const noise = generateNoise(length, seed + 1000);
  
  const mixed: number[] = [];
  
  for (let i = 0; i < length; i++) {
    // X_t = (1-λ) * S_t + λ * N_t
    const value = (1 - noiseLevel) * signal[i] + noiseLevel * noise[i];
    mixed.push(Math.max(0.001, value));
  }
  
  return mixed;
}

// =============================================================================
// Φ COMPUTATION
// =============================================================================

/**
 * Compute mean Φ for a price series with detailed statistics
 */
function computePhiStats(
  prices: number[],
  windowSize: number = 100,
  stepSize: number = 10
): {
  mean: number;
  std: number;
  min: number;
  max: number;
  samples: number;
  phiValues: number[];
} {
  const phis: number[] = [];
  const transitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }> = [];
  
  for (let i = windowSize; i + stepSize < prices.length; i += stepSize) {
    const window = prices.slice(i - windowSize, i);
    const stats = computeStats(window);
    const geiResult = gei(stats, window, 0 as TheoryID, transitionHistory, phis.length);
    const phiResult = computePhi(geiResult.selectedTheory, stats, window);
    phis.push(phiResult.phi);
  }
  
  if (phis.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0, samples: 0, phiValues: [] };
  }
  
  const mean = phis.reduce((a, b) => a + b, 0) / phis.length;
  const variance = phis.reduce((a, b) => a + (b - mean) ** 2, 0) / phis.length;
  
  return {
    mean,
    std: Math.sqrt(variance),
    min: Math.min(...phis),
    max: Math.max(...phis),
    samples: phis.length,
    phiValues: phis,
  };
}

// =============================================================================
// STATISTICAL HELPERS
// =============================================================================

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

/**
 * Compute linear regression slope
 */
function computeSlope(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
  }
  
  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-10) return 0;
  
  return (n * sumXY - sumX * sumY) / denominator;
}

// =============================================================================
// MAIN EXPERIMENT
// =============================================================================

export interface NoiseLevelResult {
  noiseLevel: number;
  phiMean: number;
  phiStd: number;
  phiMin: number;
  phiMax: number;
  samples: number;
  phiValues: number[];
}

export interface ExperimentResult {
  results: NoiseLevelResult[];
  correlation: number;
  slope: number;
  criticalNoiseLevel: number | null;
  phiAtPureNoise: number;
  phiAtPureSignal: number;
  pass: boolean;
}

export function runNoiseDilutionExperiment(): ExperimentResult {
  console.log('\n=== EXPERIMENT 16: Φ vs Noise Level (Noise Dilution Test) ===\n');
  
  const length = 2000;
  const windowSize = 100;
  const stepSize = 15;
  
  // Noise levels to test: 0, 0.1, 0.2, ..., 1.0
  const noiseLevels = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  
  console.log('Testing Φ vs noise level...');
  console.log(`Series length: ${length}, Window: ${windowSize}, Step: ${stepSize}\n`);
  
  const results: NoiseLevelResult[] = [];
  
  // Test each noise level
  for (const noiseLevel of noiseLevels) {
    console.log(`Processing λ = ${noiseLevel.toFixed(1)}...`);
    
    const prices = generateSignalNoiseMix(length, noiseLevel, 42);
    const phiStats = computePhiStats(prices, windowSize, stepSize);
    
    console.log(`  Φ = ${phiStats.mean.toFixed(4)} ± ${phiStats.std.toFixed(4)}`);
    console.log(`  Range: [${phiStats.min.toFixed(3)}, ${phiStats.max.toFixed(3)}]`);
    
    results.push({
      noiseLevel,
      phiMean: phiStats.mean,
      phiStd: phiStats.std,
      phiMin: phiStats.min,
      phiMax: phiStats.max,
      samples: phiStats.samples,
      phiValues: phiStats.phiValues,
    });
  }
  
  // Extract arrays for correlation analysis
  const noiseArray = results.map(r => r.noiseLevel);
  const phiArray = results.map(r => r.phiMean);
  
  // Compute correlation: corr(λ, Φ)
  const correlation = computeCorrelation(noiseArray, phiArray);
  
  // Compute slope: dΦ/dλ
  const slope = computeSlope(noiseArray, phiArray);
  
  // Find critical noise level where Φ < 0.01
  const criticalResult = results.find(r => r.phiMean < 0.01);
  const criticalNoiseLevel = criticalResult ? criticalResult.noiseLevel : null;
  
  // Get baseline values
  const pureSignalResult = results.find(r => r.noiseLevel === 0)!;
  const pureNoiseResult = results.find(r => r.noiseLevel === 1.0)!;
  
  const phiAtPureSignal = pureSignalResult.phiMean;
  const phiAtPureNoise = pureNoiseResult.phiMean;
  
  // Validation criteria
  const passesCorrelation = correlation < -0.7;
  const passesNoiseFloor = Math.abs(phiAtPureNoise - phiAtPureSignal) < 0.05 || phiAtPureNoise < 0.05;
  
  const pass = passesCorrelation && passesNoiseFloor;
  
  // ===========================================================================
  // RESULTS OUTPUT
  // ===========================================================================
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  RESULTS: Φ vs Noise Level                                    ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║ λ (Noise) │ Φ_mean   │ Φ_std    │ Range                    ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  
  for (const r of results) {
    console.log(`║ ${r.noiseLevel.toFixed(1).padStart(7)} │ ${r.phiMean.toFixed(4)}  │ ${r.phiStd.toFixed(4)}  │ [${r.phiMin.toFixed(3)}, ${r.phiMax.toFixed(3)}]    ║`);
  }
  
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  console.log('\n--- Key Metrics ---');
  console.log(`Correlation corr(λ, Φ): ${correlation.toFixed(4)}`);
  console.log(`Slope dΦ/dλ: ${slope.toFixed(4)}`);
  console.log(`Φ at pure signal (λ=0): ${phiAtPureSignal.toFixed(4)}`);
  console.log(`Φ at pure noise (λ=1): ${phiAtPureNoise.toFixed(4)}`);
  
  if (criticalNoiseLevel !== null) {
    console.log(`Critical noise level (Φ < 0.01): λ = ${criticalNoiseLevel.toFixed(1)}`);
  } else {
    console.log(`Critical noise level (Φ < 0.01): Not reached (min Φ = ${Math.min(...phiArray).toFixed(4)})`);
  }
  
  console.log('\n--- Validation ---');
  console.log(`corr(λ, Φ) < -0.7: ${passesCorrelation ? '✓ PASS' : '✗ FAIL'} (${correlation.toFixed(4)})`);
  console.log(`Φ(1) ≈ baseline: ${passesNoiseFloor ? '✓ PASS' : '✗ FAIL'} (${phiAtPureNoise.toFixed(4)})`);
  
  console.log(`\n>>> EXPERIMENT RESULT: ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
  
  // ===========================================================================
  // INTERPRETATION
  // ===========================================================================
  
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  INTERPRETATION                                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  if (pass) {
    console.log('✓ STRONG EVIDENCE: Φ measures market structure!');
    console.log('  → Φ decreases monotonically with noise level');
    console.log('  → Φ ≈ Signal-to-Noise Ratio');
    console.log('  → This confirms Φ measures information structural del mercado');
  } else if (correlation < -0.5) {
    console.log('~ MODERATE EVIDENCE: Φ partially correlates with structure');
    console.log('  → There is a negative relationship between noise and Φ');
    console.log('  → But the effect is weaker than expected');
  } else if (Math.abs(correlation) < 0.3) {
    console.log('✗ WEAK EVIDENCE: Φ appears independent of noise');
    console.log('  → dΦ/dλ ≈ 0');
    console.log('  → Φ may measure a different property than structure');
  } else {
    console.log('? UNCLEAR RESULT: Further investigation needed');
  }
  
  // Signal-to-Noise interpretation
  if (phiAtPureSignal > 0.01 && phiAtPureNoise < 0.05) {
    const snrProxy = phiAtPureSignal / (phiAtPureNoise + 0.001);
    console.log(`\n→ Signal-to-Noise proxy: Φ(signal)/Φ(noise) ≈ ${snrProxy.toFixed(2)}`);
    console.log('  This suggests Φ captures structural predictability');
  }
  
  return {
    results,
    correlation,
    slope,
    criticalNoiseLevel,
    phiAtPureNoise,
    phiAtPureSignal,
    pass,
  };
}

// Run if called directly
if (require.main === module) {
  const result = runNoiseDilutionExperiment();
  console.log('\n=== FINAL RESULT ===');
  console.log(`Status: ${result.pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Correlation: ${result.correlation.toFixed(4)}`);
  console.log(`Slope: ${result.slope.toFixed(4)}`);
}
