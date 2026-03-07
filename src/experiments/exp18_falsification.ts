/**
 * TN-LAB Experiment 18: Φ Falsification Test
 * 
 * Phase 3: Scientific Validation Framework
 * 
 * OBJECTIVE:
 * Test whether Φ responds correctly to known structural components.
 * This is a FALSIFICATION test - build generators with KNOWN structure
 * and verify Φ correctly identifies them.
 * 
 * HYPOTHESIS:
 * H0 (Falsification): Φ cannot distinguish structured generators from random
 * H1: Φ responds correctly to each known component:
 *   - Random Walk: Φ ≈ 0 (baseline)
 *   - Trend: Φ > baseline (detectable structure)
 *   - Mean Reversion: Φ > baseline (detectable structure)
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, SufficientStats, PhiResult } from '../engine/types';
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

  gaussian(): number {
    const u1 = this.next() + 1e-10;
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// =============================================================================
// PARAMETRIZED GENERATORS
// =============================================================================

interface GeneratorConfig {
  name: string;
  trendStrength: number;
  meanReversion: number;
  noiseLevel: number;
}

const GENERATORS: GeneratorConfig[] = [
  { name: 'Random Walk', trendStrength: 0, meanReversion: 0, noiseLevel: 1.0 },
  { name: 'Weak Trend', trendStrength: 0.001, meanReversion: 0, noiseLevel: 1.0 },
  { name: 'Medium Trend', trendStrength: 0.005, meanReversion: 0, noiseLevel: 1.0 },
  { name: 'Strong Trend', trendStrength: 0.01, meanReversion: 0, noiseLevel: 1.0 },
  { name: 'Mean Reversion', trendStrength: 0, meanReversion: 0.1, noiseLevel: 1.0 },
];

/**
 * Generate series with known structure
 */
function generateSeries(config: GeneratorConfig, length: number, seed: number): number[] {
  const rng = new SeededRNG(seed);
  const prices: number[] = [100];
  
  for (let i = 1; i < length; i++) {
    const trend = config.trendStrength * prices[i - 1];
    const reversion = config.meanReversion * (100 - prices[i - 1]);
    const noise = rng.gaussian() * config.noiseLevel * prices[i - 1] * 0.1;
    prices.push(prices[i - 1] + trend + reversion + noise);
  }
  
  return prices;
}

/**
 * Compute Φ from series
 */
function computePhiFromSeries(prices: number[]): number {
  const warmup = 50;
  const phis: number[] = [];
  
  for (let t = warmup; t < prices.length - 1; t++) {
    const window = prices.slice(Math.max(0, t - 50), t + 1);
    
    const mean = window.reduce((s, x) => s + x, 0) / window.length;
    const variance = window.reduce((s, x) => s + (x - mean) ** 2, 0) / window.length;
    
    const returns: number[] = [];
    for (let i = 1; i < window.length; i++) {
      returns.push((window[i] - window[i - 1]) / window[i - 1]);
    }
    
    const volatility = Math.sqrt(
      returns.reduce((s, x) => s + x * x, 0) / returns.length
    );
    
    let autocorr = 0;
    if (returns.length > 1) {
      const meanRet = returns.reduce((s, x) => s + x, 0) / returns.length;
      let num = 0, den = 0;
      for (let i = 1; i < returns.length; i++) {
        num += (returns[i] - meanRet) * (returns[i - 1] - meanRet);
        den += (returns[i] - meanRet) ** 2;
      }
      autocorr = den > 0 ? num / den : 0;
    }
    
    const stats: SufficientStats = {
      mean,
      variance,
      skew: 0,
      kurtosis: 0,
      hurst: 0.5,
      autocorr: new Array(20).fill(autocorr),
      spectrum: { frequencies: [], powers: [], count: 0 },
      regime: 0,
      sampleSize: window.length,
      lastUpdate: new Date(),
    };
    
    const phiResult: PhiResult = computePhi(TheoryID.RANDOM_WALK, stats, window);
    phis.push(phiResult.phi);
  }
  
  return phis.reduce((s, x) => s + x, 0) / phis.length;
}

// =============================================================================
// MAIN EXPERIMENT
// =============================================================================

export interface Exp18Result {
  generatorResults: GeneratorResult[];
  falsification: FalsificationCheck;
}

export interface GeneratorResult {
  generator: string;
  meanPhi: number;
  stdPhi: number;
  nSamples: number;
}

export interface FalsificationCheck {
  randomWalkLow: boolean;
  trendHigherThanRandom: boolean;
  randomMeanPhi: number;
  trendMeanPhi: number;
}

export async function runExp18(nRunsPerGenerator: number = 100): Promise<Exp18Result> {
  console.log('\\n🔬 EXPERIMENT 18: Φ Falsification Test');
  console.log('==========================================');
  console.log(`Runs per generator: ${nRunsPerGenerator}`);
  
  const generatorResults: GeneratorResult[] = [];
  
  for (const gen of GENERATORS) {
    console.log(`Testing: ${gen.name}`);
    
    const phiValues: number[] = [];
    
    for (let run = 0; run < nRunsPerGenerator; run++) {
      const seed = GENERATORS.indexOf(gen) * 10000 + run;
      const prices = generateSeries(gen, 200, seed);
      const phi = computePhiFromSeries(prices);
      phiValues.push(phi);
    }
    
    const meanPhi = phiValues.reduce((s, x) => s + x, 0) / phiValues.length;
    const variance = phiValues.reduce((s, x) => s + (x - meanPhi) ** 2, 0) / phiValues.length;
    const stdPhi = Math.sqrt(variance);
    
    generatorResults.push({
      generator: gen.name,
      meanPhi,
      stdPhi,
      nSamples: phiValues.length,
    });
  }
  
  // Falsification checks
  const randomResult = generatorResults.find(r => r.generator === 'Random Walk');
  const trendResult = generatorResults.find(r => r.generator === 'Medium Trend');
  const meanRevResult = generatorResults.find(r => r.generator === 'Mean Reversion');
  
  const falsification: FalsificationCheck = {
    randomWalkLow: (randomResult?.meanPhi || 1) < 0.15,
    trendHigherThanRandom: (trendResult?.meanPhi || 0) > (randomResult?.meanPhi || 0),
    randomMeanPhi: randomResult?.meanPhi || 0,
    trendMeanPhi: trendResult?.meanPhi || 0,
  };
  
  return { generatorResults, falsification };
}

export function formatExp18Report(result: Exp18Result): string {
  let report = `# TN-LAB Experiment 18: Φ Falsification Test

## Configuration
- **Generators**: ${GENERATORS.map(g => g.name).join(', ')}
- **Runs per generator**: 100

## Results

| Generator | Mean Φ | Std Φ | Samples |
|-----------|--------|-------|---------|
`;

  for (const r of result.generatorResults) {
    report += `| ${r.generator} | ${r.meanPhi.toFixed(4)} | ${r.stdPhi.toFixed(4)} | ${r.nSamples} |\n`;
  }

  report += `
## Falsification Checks

| Check | Result |
|-------|--------|
| Random Walk Φ < 0.15 | ${result.falsification.randomWalkLow ? '✓ PASS' : '✗ FAIL'} |
| Trend Φ > Random Φ | ${result.falsification.trendHigherThanRandom ? '✓ PASS' : '✗ FAIL'} |

## Key Findings

- **Random Walk Φ**: ${result.falsification.randomMeanPhi.toFixed(4)}
- **Medium Trend Φ**: ${result.falsification.trendMeanPhi.toFixed(4)}

---
*Generated by TN-LAB Exp18 v5.5*
`;

  return report;
}

// =============================================================================
// MAIN
// =============================================================================

if (require.main === module) {
  runExp18(100).then(result => {
    console.log('\\n' + formatExp18Report(result));
  }).catch(error => {
    console.error('Experiment failed:', error);
    process.exit(1);
  });
}
