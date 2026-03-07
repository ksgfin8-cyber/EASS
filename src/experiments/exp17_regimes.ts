/**
 * TN-LAB Experiment 17: Φ vs Real Market Regimes
 * 
 * Phase 3: Scientific Validation Framework
 * 
 * OBJECTIVE:
 * Evaluate if Φ detects real structural changes in market regimes.
 * 
 * HYPOTHESIS:
 * H0: Φ is independent of market regime
 * H1: Φ decreases during crisis/volatile regimes
 * H1: Φ increases during structured/trending phases
 * 
 * METHODOLOGY:
 * 1. Generate synthetic data mimicking different regimes
 * 2. Compute Φ for each regime period
 * 3. Compare Φ across regimes
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, SufficientStats, TN_CONSTANTS, PhiResult } from '../engine/types';
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
// PARAMETRIZED GENERATORS FOR DIFFERENT REGIMES
// =============================================================================

interface GeneratorConfig {
  name: string;
  trendStrength: number;
  volatility: number;
  meanReversion: number;
}

/**
 * Different market regimes as generator configurations
 */
const REGIMES: GeneratorConfig[] = [
  { name: 'Bull', trendStrength: 0.002, volatility: 0.01, meanReversion: 0 },
  { name: 'Bear', trendStrength: -0.002, volatility: 0.02, meanReversion: 0 },
  { name: 'Ranging', trendStrength: 0, volatility: 0.01, meanReversion: 0.1 },
  { name: 'Volatile', trendStrength: 0.001, volatility: 0.03, meanReversion: 0 },
  { name: 'Crisis', trendStrength: -0.003, volatility: 0.05, meanReversion: 0 },
];

/**
 * Generate price series for a given regime
 */
function generateRegimeSeries(config: GeneratorConfig, length: number, seed: number): number[] {
  const rng = new SeededRNG(seed);
  const prices: number[] = [100];
  
  for (let i = 1; i < length; i++) {
    const trend = config.trendStrength * prices[i - 1];
    const noise = rng.gaussian() * config.volatility * prices[i - 1];
    const reversion = config.meanReversion * (100 - prices[i - 1]);
    prices.push(prices[i - 1] + trend + noise + reversion);
  }
  
  return prices;
}

/**
 * Compute Φ from price series
 */
function computePhiFromSeries(prices: number[]): number {
  const warmup = 50;
  const phis: number[] = [];
  
  for (let t = warmup; t < prices.length - 1; t++) {
    const window = prices.slice(Math.max(0, t - 50), t + 1);
    
    // Compute sufficient statistics
    const mean = window.reduce((s, x) => s + x, 0) / window.length;
    const variance = window.reduce((s, x) => s + (x - mean) ** 2, 0) / window.length;
    
    // Compute returns for autocorrelation
    const returns: number[] = [];
    for (let i = 1; i < window.length; i++) {
      returns.push((window[i] - window[i - 1]) / window[i - 1]);
    }
    
    // Volatility
    const volatility = Math.sqrt(
      returns.reduce((s, x) => s + x * x, 0) / returns.length
    );
    
    // Autocorrelation
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
    
    // Create SufficientStats
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
    
    // Compute Φ
    const phiResult: PhiResult = computePhi(TheoryID.RANDOM_WALK, stats, window);
    phis.push(phiResult.phi);
  }
  
  return phis.reduce((s, x) => s + x, 0) / phis.length;
}

// =============================================================================
// MAIN EXPERIMENT
// =============================================================================

export interface Exp17Result {
  regimeResults: RegimeResult[];
  hypothesisTest: HypothesisTest;
}

export interface RegimeResult {
  regime: string;
  meanPhi: number;
  stdPhi: number;
  nSamples: number;
}

export interface HypothesisTest {
  crisisLowerThanBull: boolean;
  volatileHigherThanRanging: boolean;
  crisisMeanPhi: number;
  bullMeanPhi: number;
  rangingMeanPhi: number;
}

/**
 * Run the experiment
 */
export async function runExp17(nRunsPerRegime: number = 100): Promise<Exp17Result> {
  console.log('\\n🔬 EXPERIMENT 17: Φ vs Real Market Regimes');
  console.log('============================================');
  console.log(`Runs per regime: ${nRunsPerRegime}`);
  
  const regimeResults: RegimeResult[] = [];
  
  for (const regime of REGIMES) {
    console.log(`Testing: ${regime.name}`);
    
    const phiValues: number[] = [];
    
    for (let run = 0; run < nRunsPerRegime; run++) {
      const seed = REGIMES.indexOf(regime) * 10000 + run;
      const prices = generateRegimeSeries(regime, 200, seed);
      const phi = computePhiFromSeries(prices);
      phiValues.push(phi);
    }
    
    const meanPhi = phiValues.reduce((s, x) => s + x, 0) / phiValues.length;
    const variance = phiValues.reduce((s, x) => s + (x - meanPhi) ** 2, 0) / phiValues.length;
    const stdPhi = Math.sqrt(variance);
    
    regimeResults.push({
      regime: regime.name,
      meanPhi,
      stdPhi,
      nSamples: phiValues.length,
    });
  }
  
  // Hypothesis testing
  const crisisResult = regimeResults.find(r => r.regime === 'Crisis');
  const bullResult = regimeResults.find(r => r.regime === 'Bull');
  const rangingResult = regimeResults.find(r => r.regime === 'Ranging');
  const volatileResult = regimeResults.find(r => r.regime === 'Volatile');
  
  const hypothesisTest: HypothesisTest = {
    crisisLowerThanBull: (crisisResult?.meanPhi || 0) < (bullResult?.meanPhi || 1),
    volatileHigherThanRanging: (volatileResult?.meanPhi || 0) > (rangingResult?.meanPhi || 0),
    crisisMeanPhi: crisisResult?.meanPhi || 0,
    bullMeanPhi: bullResult?.meanPhi || 0,
    rangingMeanPhi: rangingResult?.meanPhi || 0,
  };
  
  return { regimeResults, hypothesisTest };
}

/**
 * Format results as markdown
 */
export function formatExp17Report(result: Exp17Result): string {
  let report = `# TN-LAB Experiment 17: Φ vs Real Market Regimes

## Configuration
- **Regimes tested**: ${REGIMES.map(r => r.name).join(', ')}
- **Samples per regime**: 100

## Results

| Regime | Mean Φ | Std Φ | Samples |
|--------|--------|-------|---------|
`;

  for (const r of result.regimeResults) {
    report += `| ${r.regime} | ${r.meanPhi.toFixed(4)} | ${r.stdPhi.toFixed(4)} | ${r.nSamples} |\n`;
  }

  report += `
## Hypothesis Test

| Hypothesis | Result |
|------------|--------|
| Crisis Φ < Bull Φ | ${result.hypothesisTest.crisisLowerThanBull ? '✓ PASS' : '✗ FAIL'} |
| Volatile Φ > Ranging Φ | ${result.hypothesisTest.volatileHigherThanRanging ? '✓ PASS' : '✗ FAIL'} |

## Key Findings

- **Crisis Φ**: ${result.hypothesisTest.crisisMeanPhi.toFixed(4)}
- **Bull Φ**: ${result.hypothesisTest.bullMeanPhi.toFixed(4)}
- **Ranging Φ**: ${result.hypothesisTest.rangingMeanPhi.toFixed(4)}

---
*Generated by TN-LAB Exp17 v5.5*
`;

  return report;
}

// =============================================================================
// MAIN
// =============================================================================

if (require.main === module) {
  runExp17(100).then(result => {
    console.log('\\n' + formatExp17Report(result));
  }).catch(error => {
    console.error('Experiment failed:', error);
    process.exit(1);
  });
}
