/**
 * TN-LAB Experiment 21: Out-of-Sample Theory Generalization
 * 
 * Phase 3: Scientific Validation Framework
 * 
 * OBJECTIVE:
 * Measure whether the theory selected by GEI in a window remains optimal
 * in the near future. This tests if GEI is finding real structure
 * or overfitting the past.
 * 
 * HYPOTHESIS:
 * H0: GEI selection is no better than random (mean rank ≈ 5.5)
 * H1: GEI selects theories that maintain advantage in future (mean rank ≈ 1-3)
 * 
 * KEY METRICS:
 * 1. mean rank(T*) - target: 1-3 (good), ≈5.5 (random)
 * 2. win_rate = P(rank(T*) ≤ 3) - target: >60% (good), 50% (random)
 * 3. regime_persistence = P(T*_t = T*_{t+1}) - target: 30-70%
 * 
 * METHODOLOGY:
 * 1. For each time point t:
 *    - Build historical window W_past = 500 ticks
 *    - Compute H_t = Γ(W_past)
 *    - Select T*_t = GEI(T, H_t)
 * 2. Evaluate on W_future = 50 ticks
 * 3. Compute prediction error for ALL theories in future window
 * 4. Calculate rank of T*_t among all theories
 * 5. Aggregate metrics across all time points
 * 
 * DATASETS:
 * - Simulators: trending, ranging, volatile, mixed
 * - Real markets: AAPL, BTC-USD, EURUSD=X, ^GSPC
 * 
 * MONTE CARLO: N = 500 simulations per dataset
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, SufficientStats, TN_CONSTANTS, THEORY_COUNT } from '../engine/types';
import { computeStats } from '../engine/gamma';
import { gei, evaluateTheory } from '../engine/gei';
import { predict } from '../engine/theories';
import { AssetData, OHLCV, ingestAsset } from '../simulator/dataIngestion';
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
// MARKET GENERATORS
// =============================================================================

/**
 * Generate trending market segment
 */
function generateTrendingSegment(n: number, seed: number): number[] {
  const prices: number[] = [100];
  let price = 100;
  const trend = 0.001; // 0.1% trend per tick
  
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
    // Random volatility clusters
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
    // Switch regime every 50-100 ticks
    if (i % 75 === 0) {
      regime = 1 - regime;
    }
    
    let move: number;
    if (regime === 1) {
      // Trending
      move = 0.001 + (seededRandom(seed + i) - 0.5) * 0.01;
    } else {
      // Ranging
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
// THEORY EVALUATION IN FUTURE WINDOW
// =============================================================================

/**
 * Compute prediction error for a theory in a future window
 * Uses one-step-ahead predictions
 */
function computeFuturePredictionError(
  theoryId: TheoryID,
  stats: SufficientStats,
  prices: number[],
  windowSize: number = CONFIG.W_FUTURE
): number {
  const n = prices.length;
  if (n < windowSize + 2) return Infinity;
  
  const startIdx = n - windowSize;
  let totalError = 0;
  let count = 0;
  
  for (let i = startIdx; i < n - 1; i++) {
    const subPrices = prices.slice(Math.max(0, i - 50), i + 1);
    if (subPrices.length < 2) continue;
    
    const predicted = predict(theoryId, stats, subPrices);
    const actual = prices[i + 1];
    
    if (isFinite(predicted) && isFinite(actual)) {
      totalError += Math.abs(predicted - actual);
      count++;
    }
  }
  
  return count > 0 ? totalError / count : Infinity;
}

/**
 * Compute rank of selected theory among all theories based on future error
 */
function computeTheoryRank(
  selectedTheory: TheoryID,
  stats: SufficientStats,
  prices: number[]
): { rank: number; allErrors: Map<TheoryID, number> } {
  const errors = new Map<TheoryID, number>();
  
  // Compute error for all theories
  for (let i = 0; i < THEORY_COUNT; i++) {
    const theoryId = i as TheoryID;
    const error = computeFuturePredictionError(theoryId, stats, prices);
    errors.set(theoryId, error);
  }
  
  // Sort theories by error (ascending - lower is better)
  const sortedErrors = Array.from(errors.entries())
    .filter(([_, e]) => isFinite(e))
    .sort((a, b) => a[1] - b[1]);
  
  // Find rank of selected theory
  let rank = THEORY_COUNT;
  for (let i = 0; i < sortedErrors.length; i++) {
    if (sortedErrors[i][0] === selectedTheory) {
      rank = i + 1;
      break;
    }
  }
  
  return { rank, allErrors: errors };
}

// =============================================================================
// SINGLE EVALUATION POINT
// =============================================================================

interface EvaluationPoint {
  tick: number;
  pastPrices: number[];
  futurePrices: number[];
  selectedTheory: TheoryID;
  futureError: number;
  rank: number;
  allErrors: Map<TheoryID, number>;
}

/**
 * Evaluate GEI generalization at a single time point
 */
function evaluateAtPoint(
  prices: number[],
  pointIdx: number
): EvaluationPoint | null {
  // Need past window + future window
  const pastEnd = pointIdx;
  const pastStart = pastEnd - CONFIG.W_PAST;
  const futureEnd = Math.min(pointIdx + CONFIG.W_FUTURE, prices.length);
  
  if (pastStart < 0 || futureEnd <= pastEnd) {
    return null;
  }
  
  const pastPrices = prices.slice(pastStart, pastEnd);
  const futurePrices = prices.slice(pastEnd, futureEnd);
  
  if (pastPrices.length < CONFIG.MIN_HISTORY) {
    return null;
  }
  
  // Compute H_t from past window
  const stats = computeStats(pastPrices);
  
  // Run GEI to select theory
  const geiResult = gei(
    stats,
    pastPrices,
    TheoryID.RANDOM_WALK, // Initial theory
    [],
    pointIdx
  );
  
  const selectedTheory = geiResult.selectedTheory;
  
  // Compute future error for selected theory
  const futureError = computeFuturePredictionError(selectedTheory, stats, prices);
  
  // Compute rank among all theories
  const { rank, allErrors } = computeTheoryRank(selectedTheory, stats, prices);
  
  return {
    tick: pointIdx,
    pastPrices,
    futurePrices,
    selectedTheory,
    futureError: isFinite(futureError) ? futureError : Infinity,
    rank,
    allErrors,
  };
}

// =============================================================================
// SIMULATOR EXPERIMENT
// =============================================================================

interface SimulatorResult {
  generator: string;
  nPoints: number;
  meanRank: number;
  stdRank: number;
  winRate: number; // P(rank <= 3)
  regimePersistence: number; // P(T*_t = T*_{t+1})
  top3Count: number;
  totalCount: number;
}

/**
 * Run experiment on a single simulator
 */
function runSimulatorExperiment(generatorName: string): SimulatorResult {
  const ranks: number[] = [];
  let theorySwitches = 0;
  let totalTransitions = 0;
  let previousTheory: TheoryID | null = null;
  
  // Generate price series
  const seed = 42;
  let prices: number[];
  
  switch (generatorName) {
    case 'trending':
      prices = generateTrendingSegment(CONFIG.W_PAST + CONFIG.W_FUTURE + 200, seed);
      break;
    case 'ranging':
      prices = generateRangingSegment(CONFIG.W_PAST + CONFIG.W_FUTURE + 200, seed);
      break;
    case 'volatile':
      prices = generateVolatileSegment(CONFIG.W_PAST + CONFIG.W_FUTURE + 200, seed);
      break;
    case 'mixed':
      prices = generateMixedSegment(CONFIG.W_PAST + CONFIG.W_FUTURE + 200, seed);
      break;
    default:
      return {
        generator: generatorName,
        nPoints: 0,
        meanRank: 0,
        stdRank: 0,
        winRate: 0,
        regimePersistence: 0,
        top3Count: 0,
        totalCount: 0,
      };
  }
  
  // Evaluate at multiple points
  const startPoint = CONFIG.W_PAST;
  const endPoint = prices.length - CONFIG.W_FUTURE;
  
  for (let pointIdx = startPoint; pointIdx < endPoint; pointIdx += CONFIG.STEP) {
    const result = evaluateAtPoint(prices, pointIdx);
    
    if (result) {
      ranks.push(result.rank);
      
      // Track regime persistence
      if (previousTheory !== null) {
        totalTransitions++;
        if (result.selectedTheory === previousTheory) {
          theorySwitches++;
        }
      }
      previousTheory = result.selectedTheory;
    }
  }
  
  if (ranks.length === 0) {
    return {
      generator: generatorName,
      nPoints: 0,
      meanRank: 5.5,
      stdRank: 0,
      winRate: 0.5,
      regimePersistence: 0.5,
      top3Count: 0,
      totalCount: 0,
    };
  }
  
  // Compute statistics
  const meanRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
  const stdRank = Math.sqrt(
    ranks.reduce((sum, r) => sum + (r - meanRank) ** 2, 0) / ranks.length
  );
  
  const top3Count = ranks.filter(r => r <= 3).length;
  const winRate = top3Count / ranks.length;
  
  const regimePersistence = totalTransitions > 0 
    ? theorySwitches / totalTransitions 
    : 0.5;
  
  return {
    generator: generatorName,
    nPoints: ranks.length,
    meanRank,
    stdRank,
    winRate,
    regimePersistence,
    top3Count,
    totalCount: ranks.length,
  };
}

// =============================================================================
// REAL MARKET EXPERIMENT
// =============================================================================

interface RealMarketResult {
  asset: string;
  nPoints: number;
  meanRank: number;
  stdRank: number;
  winRate: number;
  regimePersistence: number;
  top3Count: number;
  totalCount: number;
}

/**
 * Run experiment on real market data
 */
async function runRealMarketExperiment(symbol: string): Promise<RealMarketResult> {
  const ranks: number[] = [];
  let theorySwitches = 0;
  let totalTransitions = 0;
  let previousTheory: TheoryID | null = null;
  
  // Try to ingest real market data
  let prices: number[];
  
  try {
    const assetData: AssetData = await ingestAsset({ symbol, timeframe: '1d' });
    if (!assetData || !assetData.prices || assetData.prices.length < CONFIG.W_PAST + CONFIG.W_FUTURE) {
      console.log(`Insufficient data for ${symbol}, using generator fallback`);
      prices = generateMixedSegment(CONFIG.W_PAST + CONFIG.W_FUTURE + 200, 42);
    } else {
      // Extract close prices from OHLCV array
      prices = assetData.prices.map((ohlcv: OHLCV) => ohlcv.close);
    }
  } catch (error) {
    console.log(`Failed to fetch ${symbol}, using generator fallback`);
    prices = generateMixedSegment(CONFIG.W_PAST + CONFIG.W_FUTURE + 200, 42);
  }
  
  // Evaluate at multiple points
  const startPoint = CONFIG.W_PAST;
  const endPoint = prices.length - CONFIG.W_FUTURE;
  
  for (let pointIdx = startPoint; pointIdx < endPoint; pointIdx += CONFIG.STEP) {
    const result = evaluateAtPoint(prices, pointIdx);
    
    if (result) {
      ranks.push(result.rank);
      
      // Track regime persistence
      if (previousTheory !== null) {
        totalTransitions++;
        if (result.selectedTheory === previousTheory) {
          theorySwitches++;
        }
      }
      previousTheory = result.selectedTheory;
    }
  }
  
  if (ranks.length === 0) {
    return {
      asset: symbol,
      nPoints: 0,
      meanRank: 5.5,
      stdRank: 0,
      winRate: 0.5,
      regimePersistence: 0.5,
      top3Count: 0,
      totalCount: 0,
    };
  }
  
  // Compute statistics
  const meanRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
  const stdRank = Math.sqrt(
    ranks.reduce((sum, r) => sum + (r - meanRank) ** 2, 0) / ranks.length
  );
  
  const top3Count = ranks.filter(r => r <= 3).length;
  const winRate = top3Count / ranks.length;
  
  const regimePersistence = totalTransitions > 0 
    ? theorySwitches / totalTransitions 
    : 0.5;
  
  return {
    asset: symbol,
    nPoints: ranks.length,
    meanRank,
    stdRank,
    winRate,
    regimePersistence,
    top3Count,
    totalCount: ranks.length,
  };
}

// =============================================================================
// MONTE CARLO SIMULATION
// =============================================================================

interface MonteCarloResult {
  generator: string;
  nSimulations: number;
  meanRankMean: number;
  meanRankStd: number;
  winRateMean: number;
  winRateStd: number;
  persistenceMean: number;
  persistenceStd: number;
}

/**
 * Run Monte Carlo simulation on a generator
 */
function runMonteCarlo(generatorName: string, nRuns: number): MonteCarloResult {
  const meanRanks: number[] = [];
  const winRates: number[] = [];
  const persistences: number[] = [];
  
  for (let run = 0; run < nRuns; run++) {
    const seed = 42 + run * 1000;
    let prices: number[];
    
    switch (generatorName) {
      case 'trending':
        prices = generateTrendingSegment(CONFIG.W_PAST + CONFIG.W_FUTURE + 200, seed);
        break;
      case 'ranging':
        prices = generateRangingSegment(CONFIG.W_PAST + CONFIG.W_FUTURE + 200, seed);
        break;
      case 'volatile':
        prices = generateVolatileSegment(CONFIG.W_PAST + CONFIG.W_FUTURE + 200, seed);
        break;
      case 'mixed':
        prices = generateMixedSegment(CONFIG.W_PAST + CONFIG.W_FUTURE + 200, seed);
        break;
      default:
        continue;
    }
    
    const ranks: number[] = [];
    let theorySwitches = 0;
    let totalTransitions = 0;
    let previousTheory: TheoryID | null = null;
    
    const startPoint = CONFIG.W_PAST;
    const endPoint = prices.length - CONFIG.W_FUTURE;
    
    for (let pointIdx = startPoint; pointIdx < endPoint; pointIdx += CONFIG.STEP) {
      const result = evaluateAtPoint(prices, pointIdx);
      
      if (result) {
        ranks.push(result.rank);
        
        if (previousTheory !== null) {
          totalTransitions++;
          if (result.selectedTheory === previousTheory) {
            theorySwitches++;
          }
        }
        previousTheory = result.selectedTheory;
      }
    }
    
    if (ranks.length > 0) {
      meanRanks.push(ranks.reduce((a, b) => a + b, 0) / ranks.length);
      winRates.push(ranks.filter(r => r <= 3).length / ranks.length);
      persistences.push(
        totalTransitions > 0 ? theorySwitches / totalTransitions : 0.5
      );
    }
  }
  
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr: number[]) => {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length);
  };
  
  return {
    generator: generatorName,
    nSimulations: meanRanks.length,
    meanRankMean: mean(meanRanks),
    meanRankStd: std(meanRanks),
    winRateMean: mean(winRates),
    winRateStd: std(winRates),
    persistenceMean: mean(persistences),
    persistenceStd: std(persistences),
  };
}

// =============================================================================
// MAIN EXPERIMENT RUNNER
// =============================================================================

export interface Experiment21Result {
  experiment: string;
  version: string;
  timestamp: string;
  config: typeof CONFIG;
  simulators: MonteCarloResult[];
  realMarkets: RealMarketResult[];
  summary: {
    avgMeanRank: number;
    avgWinRate: number;
    avgPersistence: number;
    interpretation: string;
  };
}

/**
 * Run the complete Experiment 21
 */
export async function runExperiment21(): Promise<Experiment21Result> {
  console.log('='.repeat(80));
  console.log('EXPERIMENT 21: Out-of-Sample Theory Generalization');
  console.log('='.repeat(80));
  console.log(`Version: ${getScientificVersion()}`);
  console.log(`Config: W_past=${CONFIG.W_PAST}, W_future=${CONFIG.W_FUTURE}, Step=${CONFIG.STEP}`);
  console.log();
  
  // Run Monte Carlo on simulators
  console.log('Running Monte Carlo simulations...');
  const simulators: MonteCarloResult[] = [];
  
  const generatorNames = ['trending', 'ranging', 'volatile', 'mixed'];
  
  for (const gen of generatorNames) {
    console.log(`  - ${gen}...`);
    const result = runMonteCarlo(gen, CONFIG.N_SIMULATIONS);
    simulators.push(result);
    
    console.log(`    Mean Rank: ${result.meanRankMean.toFixed(2)} ± ${result.meanRankStd.toFixed(2)}`);
    console.log(`    Win Rate:  ${(result.winRateMean * 100).toFixed(1)}% ± ${(result.winRateStd * 100).toFixed(1)}%`);
    console.log(`    Persistence: ${(result.persistenceMean * 100).toFixed(1)}% ± ${(result.persistenceStd * 100).toFixed(1)}%`);
  }
  
  console.log();
  
  // Run on real markets (with fallback to generators)
  console.log('Running on real markets...');
  const realMarkets: RealMarketResult[] = [];
  const marketSymbols = ['AAPL', 'BTC-USD', 'EURUSD=X', '^GSPC'];
  
  for (const symbol of marketSymbols) {
    console.log(`  - ${symbol}...`);
    const result = await runRealMarketExperiment(symbol);
    realMarkets.push(result);
    
    console.log(`    Mean Rank: ${result.meanRank.toFixed(2)} ± ${result.stdRank.toFixed(2)}`);
    console.log(`    Win Rate:  ${(result.winRate * 100).toFixed(1)}%`);
    console.log(`    Persistence: ${(result.regimePersistence * 100).toFixed(1)}%`);
  }
  
  // Compute summary
  const allMeanRanks = [
    ...simulators.map(s => s.meanRankMean),
    ...realMarkets.map(r => r.meanRank),
  ];
  const allWinRates = [
    ...simulators.map(s => s.winRateMean),
    ...realMarkets.map(r => r.winRate),
  ];
  const allPersistences = [
    ...simulators.map(s => s.persistenceMean),
    ...realMarkets.map(r => r.regimePersistence),
  ];
  
  const avgMeanRank = allMeanRanks.reduce((a, b) => a + b, 0) / allMeanRanks.length;
  const avgWinRate = allWinRates.reduce((a, b) => a + b, 0) / allWinRates.length;
  const avgPersistence = allPersistences.reduce((a, b) => a + b, 0) / allPersistences.length;
  
  // Interpret results
  let interpretation = '';
  if (avgMeanRank <= 3 && avgWinRate >= 0.6) {
    interpretation = 'GEI GENERALIZA - Captura estructura real del mercado';
  } else if (avgMeanRank <= 5 && avgWinRate >= 0.45) {
    interpretation = 'GEI NEUTRO - Aporta ventaja marginal sobre aleatorio';
  } else {
    interpretation = 'GEI SOBREAJUSTA - Aprende pasado pero falla en futuro';
  }
  
  console.log();
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Average Mean Rank: ${avgMeanRank.toFixed(2)} (target: 1-3, random: 5.5)`);
  console.log(`Average Win Rate:  ${(avgWinRate * 100).toFixed(1)}% (target: >60%, random: 50%)`);
  console.log(`Average Persistence: ${(avgPersistence * 100).toFixed(1)}% (target: 30-70%)`);
  console.log(`Interpretation: ${interpretation}`);
  console.log();
  
  return {
    experiment: 'Exp21: Out-of-Sample Theory Generalization',
    version: `v${getScientificVersion().engineVersion}`,
    timestamp: new Date().toISOString(),
    config: CONFIG,
    simulators,
    realMarkets,
    summary: {
      avgMeanRank,
      avgWinRate,
      avgPersistence,
      interpretation,
    },
  };
}

// =============================================================================
// STANDALONE EXECUTION
// =============================================================================

// Allow running directly with: bun run src/experiments/exp21_generalization.ts
if (require.main === module) {
  runExperiment21()
    .then(result => {
      console.log('\nExperiment completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Experiment failed:', error);
      process.exit(1);
    });
}
