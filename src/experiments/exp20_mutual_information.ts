/**
 * TN-LAB Experiment 20: Φ vs Predictive Information (Mutual Information Test)
 * 
 * Phase 3: Scientific Validation Framework
 * 
 * OBJECTIVE:
 * Test whether Φ_t contains measurable information about future returns r_{t+1}.
 * 
 * HYPOTHESIS:
 * H0: Φ has no predictive information (MI ≈ 0)
 * H1: Φ contains predictive information (MI > 0)
 * 
 * METHODOLOGY:
 * 1. Run TN-LAB pipeline on real market data
 * 2. Compute time series: Φ_t (predictability) and r_{t+1} (log returns)
 * 3. Estimate mutual information I(Φ_t ; r_{t+1}) using histogram estimation
 * 4. Compute baseline controls by shuffling Φ_t (null distribution)
 * 5. Statistical test: compare real MI vs shuffled baseline
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, SufficientStats, TN_CONSTANTS, PhiResult, GEIResult } from '../engine/types';
import { computeStats } from '../engine/gamma';
import { gei } from '../engine/gei';
import { computePhi } from '../engine/phi';
import { AssetData, ingestAsset } from '../simulator/dataIngestion';
import { getScientificVersion } from '../simulator/scientificSimulation';

// =============================================================================
// ASSETS TO TEST
// =============================================================================

const ASSETS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'BTC-USD', name: 'Bitcoin' },
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: 'EURUSD=X', name: 'EUR/USD' },
];

// =============================================================================
// MUTUAL INFORMATION ESTIMATION (HISTOGRAM METHOD)
// =============================================================================

interface MIResult {
  mi: number;
  hPhi: number;
  hReturns: number;
  jointEntropy: number;
}

/**
 * Compute histogram bins for a given array
 */
function computeHistogram(values: number[], nBins: number): { bins: number[]; binWidth: number; min: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binWidth = (max - min) / nBins || 1;
  
  const bins = new Array(nBins).fill(0);
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / binWidth), nBins - 1);
    bins[idx]++;
  }
  
  return { bins, binWidth, min };
}

/**
 * Estimate mutual information using histogram method
 * I(X; Y) = H(X) + H(Y) - H(X, Y)
 */
function estimateMutualInformation(phi: number[], returns: number[], nBins: number = 20): MIResult {
  const n = Math.min(phi.length, returns.length);
  if (n < 10) {
    return { mi: 0, hPhi: 0, hReturns: 0, jointEntropy: 0 };
  }
  
  // Compute marginal entropies
  const phiHist = computeHistogram(phi, nBins);
  const retHist = computeHistogram(returns, nBins);
  
  let hPhi = 0;
  let hReturns = 0;
  
  for (let i = 0; i < nBins; i++) {
    const pPhi = phiHist.bins[i] / n;
    const pRet = retHist.bins[i] / n;
    if (pPhi > 0) hPhi -= pPhi * Math.log(pPhi);
    if (pRet > 0) hReturns -= pRet * Math.log(pRet);
  }
  
  // Compute joint entropy
  const jointBins = new Array(nBins * nBins).fill(0);
  for (let i = 0; i < n; i++) {
    const phiIdx = Math.min(Math.floor((phi[i] - phiHist.min) / phiHist.binWidth), nBins - 1);
    const retIdx = Math.min(Math.floor((returns[i] - retHist.min) / retHist.binWidth), nBins - 1);
    jointBins[phiIdx * nBins + retIdx]++;
  }
  
  let jointEntropy = 0;
  for (let i = 0; i < jointBins.length; i++) {
    const p = jointBins[i] / n;
    if (p > 0) jointEntropy -= p * Math.log(p);
  }
  
  // Mutual information
  const mi = hPhi + hReturns - jointEntropy;
  
  return { mi, hPhi, hReturns, jointEntropy };
}

/**
 * Shuffle array (Fisher-Yates)
 */
function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Compute null distribution by shuffling Φ
 */
function computeNullDistribution(phi: number[], returns: number[], nShuffles: number = 100): number[] {
  const nullMI: number[] = [];
  
  for (let i = 0; i < nShuffles; i++) {
    const shuffledPhi = shuffleArray(phi);
    const result = estimateMutualInformation(shuffledPhi, returns);
    nullMI.push(result.mi);
  }
  
  return nullMI;
}

/**
 * Compute p-value: proportion of null MI values >= observed MI
 */
function computePValue(observedMI: number, nullDistribution: number[]): number {
  let count = 0;
  for (const v of nullDistribution) {
    if (v >= observedMI) count++;
  }
  return count / nullDistribution.length;
}

// =============================================================================
// Φ AND RETURN EXTRACTION
// =============================================================================

interface PhiReturnPair {
  phi: number[];
  returns: number[];
}

/**
 * Run TN-LAB simulation and extract Φ_t and r_{t+1} time series
 */
function extractPhiAndReturns(data: AssetData, _seed: number = 42): PhiReturnPair {
  const prices = data.prices.map((p: { close: number }) => p.close);
  const n = prices.length;
  
  if (n < TN_CONSTANTS.LOOKBACK_WINDOW + 10) {
    return { phi: [], returns: [] };
  }
  
  const phiSeries: number[] = [];
  const returnSeries: number[] = [];
  
  // Initialize state
  let currentTheory: TheoryID = TheoryID.RANDOM_WALK;
  const transitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }> = [];
  
  // Compute returns first
  for (let t = 1; t < n; t++) {
    const r = Math.log(prices[t] / prices[t - 1]);
    returnSeries.push(r);
  }
  
  // Main simulation loop
  for (let t = TN_CONSTANTS.LOOKBACK_WINDOW; t < n - 1; t++) {
    const lookback = prices.slice(Math.max(0, t - TN_CONSTANTS.LOOKBACK_WINDOW), t);
    
    if (lookback.length < TN_CONSTANTS.LOOKBACK_WINDOW) continue;
    
    // Compute sufficient statistics
    const stats = computeStats(lookback);
    
    // Compute GEI: gei(stats, prices, currentTheory, transitionHistory, currentTick, theoryUsage?)
    const geiResult: GEIResult = gei(stats, lookback, currentTheory, transitionHistory, t);
    
    // Compute Φ: returns PhiResult, use .phi
    const phiResult: PhiResult = computePhi(geiResult.selectedTheory, stats, lookback);
    
    phiSeries.push(phiResult.phi);
    
    // Update theory
    currentTheory = geiResult.selectedTheory;
  }
  
  // Align lengths (Φ_t corresponds to r_{t+1})
  const minLen = Math.min(phiSeries.length, returnSeries.length - 1);
  
  return {
    phi: phiSeries.slice(0, minLen),
    returns: returnSeries.slice(1, minLen + 1),
  };
}

// =============================================================================
// SINGLE ASSET ANALYSIS
// =============================================================================

interface AssetMIResult {
  symbol: string;
  name: string;
  nPoints: number;
  mi: number;
  hPhi: number;
  hReturns: number;
  nullMean: number;
  nullStd: number;
  pValue: number;
  significant: boolean;
  conclusion: string;
}

/**
 * Analyze a single asset for predictive information
 */
async function analyzeAsset(symbol: string, name: string): Promise<AssetMIResult> {
  console.log(`\n📊 Analyzing ${symbol} (${name})...`);
  
  // Fetch data
  const data = await ingestAsset({
    symbol,
    timeframe: '1d',
    startDate: new Date('2023-01-01'),
    endDate: new Date('2024-12-31'),
    adjustPrices: true,
  });
  
  // Extract Φ and returns
  const { phi, returns } = extractPhiAndReturns(data);
  
  if (phi.length < 50) {
    return {
      symbol,
      name,
      nPoints: phi.length,
      mi: 0,
      hPhi: 0,
      hReturns: 0,
      nullMean: 0,
      nullStd: 0,
      pValue: 1,
      significant: false,
      conclusion: 'Insufficient data',
    };
  }
  
  // Compute MI
  const miResult = estimateMutualInformation(phi, returns);
  
  // Compute null distribution
  const nullDistribution = computeNullDistribution(phi, returns, 100);
  const nullMean = nullDistribution.reduce((s, v) => s + v, 0) / nullDistribution.length;
  const nullStd = Math.sqrt(nullDistribution.reduce((s, v) => s + (v - nullMean) ** 2, 0) / nullDistribution.length);
  
  // Compute p-value
  const pValue = computePValue(miResult.mi, nullDistribution);
  const significant = pValue < 0.05;
  
  const conclusion = significant 
    ? 'Φ contains predictive information (p < 0.05)'
    : 'Φ does not contain significant predictive information (p >= 0.05)';
  
  console.log(`   Data points: ${phi.length}`);
  console.log(`   I(Φ; r): ${miResult.mi.toFixed(6)} bits`);
  console.log(`   Null mean: ${nullMean.toFixed(6)} bits`);
  console.log(`   p-value: ${pValue.toFixed(4)}`);
  console.log(`   Conclusion: ${conclusion}`);
  
  return {
    symbol,
    name,
    nPoints: phi.length,
    mi: miResult.mi,
    hPhi: miResult.hPhi,
    hReturns: miResult.hReturns,
    nullMean,
    nullStd,
    pValue,
    significant,
    conclusion,
  };
}

// =============================================================================
// MONTE CARLO VALIDATION
// =============================================================================

interface MonteCarloMIResult {
  meanMI: number;
  stdMI: number;
  ci95: [number, number];
  nSignificant: number;
  significanceRate: number;
}

/**
 * Run Monte Carlo validation for a single asset
 */
async function runMCIValidation(symbol: string, name: string, nRuns: number = 100): Promise<MonteCarloMIResult> {
  console.log(`\n🎲 Monte Carlo validation for ${symbol}: ${nRuns} runs`);
  
  // Get data once
  const data = await ingestAsset({
    symbol,
    timeframe: '1d',
    startDate: new Date('2023-01-01'),
    endDate: new Date('2024-12-31'),
    adjustPrices: true,
  });
  
  const miValues: number[] = [];
  let nSignificant = 0;
  
  for (let i = 0; i < nRuns; i++) {
    const seed = 1000 + i;
    const { phi, returns } = extractPhiAndReturns(data, seed);
    
    if (phi.length < 50) continue;
    
    const miResult = estimateMutualInformation(phi, returns);
    const nullDist = computeNullDistribution(phi, returns, 50);
    const pValue = computePValue(miResult.mi, nullDist);
    
    miValues.push(miResult.mi);
    if (pValue < 0.05) nSignificant++;
    
    if ((i + 1) % 25 === 0) {
      console.log(`  Progress: ${i + 1}/${nRuns}`);
    }
  }
  
  const meanMI = miValues.reduce((s, v) => s + v, 0) / miValues.length;
  const stdMI = Math.sqrt(miValues.reduce((s, v) => s + (v - meanMI) ** 2, 0) / miValues.length);
  
  // 95% CI
  const sorted = [...miValues].sort((a, b) => a - b);
  const lowerIdx = Math.floor(sorted.length * 0.025);
  const upperIdx = Math.floor(sorted.length * 0.975);
  const ci95: [number, number] = [sorted[lowerIdx] || 0, sorted[upperIdx] || 0];
  
  const significanceRate = nSignificant / miValues.length;
  
  console.log(`   Mean MI: ${meanMI.toFixed(6)} bits`);
  console.log(`   Std MI: ${stdMI.toFixed(6)} bits`);
  console.log(`   CI95: [${ci95[0].toFixed(6)}, ${ci95[1].toFixed(6)}]`);
  console.log(`   Significance rate: ${(significanceRate * 100).toFixed(1)}%`);
  
  return {
    meanMI,
    stdMI,
    ci95,
    nSignificant,
    significanceRate,
  };
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

/**
 * Main experiment execution
 */
async function main() {
  console.log('='.repeat(70));
  console.log('🔬 TN-LAB Experiment 20: Φ Predictive Information Test');
  console.log('='.repeat(70));
  console.log('\nOBJECTIVE:');
  console.log('Test whether Φ_t contains measurable information about future returns r_{t+1}');
  console.log('\nMETHOD:');
  console.log('1. Run TN-LAB pipeline on real market data');
  console.log('2. Extract Φ_t (predictability) and r_{t+1} (log returns) time series');
  console.log('3. Estimate mutual information I(Φ_t ; r_{t+1})');
  console.log('4. Compare with null distribution (shuffled Φ)');
  console.log('5. Statistical significance test (p < 0.05)');
  
  const version = getScientificVersion();
  console.log(`\n📋 Scientific Version: ${version.timestamp}`);
  
  // Analyze each asset
  const results: AssetMIResult[] = [];
  
  for (const asset of ASSETS) {
    const result = await analyzeAsset(asset.symbol, asset.name);
    results.push(result);
  }
  
  // Summary table
  console.log('\n' + '='.repeat(70));
  console.log('📊 SUMMARY: Predictive Information Test Results');
  console.log('='.repeat(70));
  console.log('\n| Asset       | I(Φ;r) [bits] | Null Mean | p-value | Significant |');
  console.log('|-------------|---------------|------------|---------|-------------|');
  
  for (const r of results) {
    console.log(`| ${r.symbol.padEnd(11)} | ${r.mi.toFixed(6).padEnd(13)} | ${r.nullMean.toFixed(6).padEnd(10)} | ${r.pValue.toFixed(4).padEnd(7)} | ${r.significant ? 'YES ✓' : 'NO ✗'.padEnd(11)} |`);
  }
  
  // Aggregate analysis
  const nSignificant = results.filter(r => r.significant).length;
  const avgMI = results.reduce((s, r) => s + r.mi, 0) / results.length;
  const avgPValue = results.reduce((s, r) => s + r.pValue, 0) / results.length;
  
  console.log('\n' + '-'.repeat(70));
  console.log('\n📈 CROSS-ASSET ANALYSIS:');
  console.log(`   Average MI: ${avgMI.toFixed(6)} bits`);
  console.log(`   Average p-value: ${avgPValue.toFixed(4)}`);
  console.log(`   Significant assets: ${nSignificant}/${results.length}`);
  
  const overallConclusion = nSignificant >= 2 
    ? 'Φ CONTAINS PREDICTIVE INFORMATION (significant in ≥2 assets)'
    : 'Φ DOES NOT CONTAIN SIGNIFICANT PREDICTIVE INFORMATION';
  
  console.log(`\n🎯 CONCLUSION: ${overallConclusion}`);
  
  // Run Monte Carlo validation for first asset (AAPL)
  console.log('\n' + '='.repeat(70));
  console.log('🎲 MONTE CARLO VALIDATION (AAPL, N=100)');
  console.log('='.repeat(70));
  
  const mcResult = await runMCIValidation('AAPL', 'Apple Inc.', 100);
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Experiment Complete');
  console.log('='.repeat(70));
  
  return {
    results,
    aggregate: {
      avgMI,
      avgPValue,
      nSignificant,
      overallConclusion,
    },
    monteCarlo: mcResult,
  };
}

// Run if executed directly
main().catch(console.error);

export { main, analyzeAsset, estimateMutualInformation, computeNullDistribution };
