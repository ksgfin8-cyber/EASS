/**
 * TN-LAB Experiment 13: Φ vs Predictive Power
 * 
 * Scientific Stage v5 - New Experiments
 * 
 * OBJECTIVE:
 * Verify if Φ actually measures market structure/predictability.
 * 
 * HYPOTHESIS:
 * mayor Φ ⇒ mayor predictibilidad
 * (higher Φ → better predictions)
 * 
 * IMPLEMENTATION:
 * At each tick compute:
 * - phi_t
 * - prediction_error_t
 * 
 * Compute correlations:
 * - corr(Φ, -error)
 * - corr(Φ, |future_return|)
 * - corr(Φ, accuracy_signal)
 * 
 * CONTROL:
 * Repeat with pure random walk
 * Expected: correlation ≈ 0
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, THEORY_COUNT, SufficientStats } from '../engine/types';
import { computeStats } from '../engine/gamma';
import { gei } from '../engine/gei';
import { computePhi, computeAction } from '../engine/phi';
import { predict } from '../engine/theories';
import { generateMultiRegimeSeries, generateRandomWalk } from '../simulator/marketData';

/**
 * Compute prediction error for a theory
 */
function computePredictionErrorForTheory(
  theoryId: TheoryID,
  stats: SufficientStats,
  prices: number[],
  actualNextPrice: number
): number {
  // Get prediction from theory
  const prediction = predict(theoryId, stats, prices);
  
  // Compute error
  const error = Math.abs(prediction - actualNextPrice);
  
  return error;
}

/**
 * Compute statistics for an array
 */
function computeStatsArray(arr: number[]): { mean: number; std: number; min: number; max: number } {
  const n = arr.length;
  if (n === 0) return { mean: 0, std: 0, min: 0, max: 0 };
  
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  
  return {
    mean,
    std: Math.sqrt(variance),
    min: Math.min(...arr),
    max: Math.max(...arr),
  };
}

/**
 * Compute Pearson correlation
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
  
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Run predictability analysis on a price series
 */
function analyzePredictability(
  prices: number[],
  windowSize: number,
  stepSize: number
): {
  phis: number[];
  errors: number[];
  futureReturns: number[];
  signals: number[];
  correctSignals: number[];
  phiStats: { mean: number; std: number; min: number; max: number };
  errorStats: { mean: number; std: number };
  correlations: {
    phiNegError: number;
    phiFutureReturn: number;
    phiAccuracy: number;
  };
} {
  const phis: number[] = [];
  const errors: number[] = [];
  const futureReturns: number[] = [];
  const signals: number[] = [];
  const correctSignals: number[] = [];
  
  const transitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }> = [];
  
  for (let i = windowSize; i + 1 < prices.length; i += stepSize) {
    const window = prices.slice(i - windowSize, i);
    const actualNext = prices[i + 1];
    
    const stats = computeStats(window);
    const geiResult = gei(stats, window, 0 as TheoryID, transitionHistory, phis.length);
    const phiResult = computePhi(geiResult.selectedTheory, stats, window);
    
    // Get prediction and error
    const prediction = predict(geiResult.selectedTheory, stats, window);
    const error = Math.abs(prediction - actualNext);
    
    // Future return
    const futureReturn = Math.abs(actualNext - window[window.length - 1]);
    
    // Signal and accuracy
    const signal = computeAction(geiResult.selectedTheory, phiResult.phi, 0.5, stats, window);
    const actualDirection = actualNext > window[window.length - 1] ? 1 : 
                           actualNext < window[window.length - 1] ? -1 : 0;
    const correct = (signal === actualDirection) ? 1 : 0;
    
    phis.push(phiResult.phi);
    errors.push(error);
    futureReturns.push(futureReturn);
    signals.push(signal);
    correctSignals.push(correct);
  }
  
  // Compute correlations
  const phiNegError = computeCorrelation(phis, errors.map(e => -e));
  const phiFutureReturn = computeCorrelation(phis, futureReturns);
  const phiAccuracy = computeCorrelation(phis, correctSignals);
  
  // Compute statistics
  const phiStats = computeStatsArray(phis);
  const errorStats = computeStatsArray(errors);
  
  return {
    phis,
    errors,
    futureReturns,
    signals,
    correctSignals,
    phiStats,
    errorStats,
    correlations: {
      phiNegError,
      phiFutureReturn,
      phiAccuracy,
    },
  };
}

/**
 * Main experiment runner
 */
export function runPredictabilityExperiment(): {
  pass: boolean;
  results: {
    multiRegime: {
      phiStats: { mean: number; std: number; min: number; max: number };
      errorStats: { mean: number; std: number };
      correlations: {
        phiNegError: number;
        phiFutureReturn: number;
        phiAccuracy: number;
      };
    };
    randomWalk: {
      phiStats: { mean: number; std: number; min: number; max: number };
      errorStats: { mean: number; std: number };
      correlations: {
        phiNegError: number;
        phiFutureReturn: number;
        phiAccuracy: number;
      };
    };
  };
  hypothesis: boolean;
  metric: string;
} {
  console.log('\n=== EXPERIMENT 13: Φ vs Predictive Power ===\n');
  
  const windowSize = 100;
  const stepSize = 20;
  
  // Test 1: Multi-regime market
  console.log('Testing multi-regime market...');
  const multiMarket = generateMultiRegimeSeries(42, 1250);
  const multiResults = analyzePredictability(multiMarket.prices, windowSize, stepSize);
  
  console.log(`  Samples: ${multiResults.phis.length}`);
  console.log(`  Φ: ${multiResults.phiStats.mean.toFixed(3)} ± ${multiResults.phiStats.std.toFixed(3)}`);
  console.log(`  Error: ${multiResults.errorStats.mean.toFixed(4)} ± ${multiResults.errorStats.std.toFixed(4)}`);
  console.log(`  corr(Φ, -error): ${multiResults.correlations.phiNegError.toFixed(3)}`);
  console.log(`  corr(Φ, |return|): ${multiResults.correlations.phiFutureReturn.toFixed(3)}`);
  console.log(`  corr(Φ, accuracy): ${multiResults.correlations.phiAccuracy.toFixed(3)}`);
  
  // Test 2: Pure random walk (control)
  console.log('\nTesting pure random walk (control)...');
  const rwMarket = generateRandomWalk(5000, 100, 42, 0.005);
  const rwResults = analyzePredictability(rwMarket.prices, windowSize, stepSize);
  
  console.log(`  Samples: ${rwResults.phis.length}`);
  console.log(`  Φ: ${rwResults.phiStats.mean.toFixed(3)} ± ${rwResults.phiStats.std.toFixed(3)}`);
  console.log(`  Error: ${rwResults.errorStats.mean.toFixed(4)} ± ${rwResults.errorStats.std.toFixed(4)}`);
  console.log(`  corr(Φ, -error): ${rwResults.correlations.phiNegError.toFixed(3)}`);
  console.log(`  corr(Φ, |return|): ${rwResults.correlations.phiFutureReturn.toFixed(3)}`);
  console.log(`  corr(Φ, accuracy): ${rwResults.correlations.phiAccuracy.toFixed(3)}`);
  
  // HYPOTHESIS: Φ measures predictability
  // 1. In structured markets: positive correlation between Φ and prediction quality
  // 2. In random walk: correlation ≈ 0
  
  const hasPositiveCorrelation = multiResults.correlations.phiNegError > 0.1;
  const randomIsNearZero = Math.abs(rwResults.correlations.phiNegError) < 0.2;
  const multiLowerError = multiResults.errorStats.mean < rwResults.errorStats.mean * 1.1;
  
  const hypothesis = hasPositiveCorrelation && randomIsNearZero;
  
  console.log(`\nHYPOTHESIS: ${hypothesis ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  - Multi-regime has positive Φ-error correlation: ${hasPositiveCorrelation ? 'yes' : 'no'} (${multiResults.correlations.phiNegError.toFixed(3)})`);
  console.log(`  - Random walk has near-zero correlation: ${randomIsNearZero ? 'yes' : 'no'} (${rwResults.correlations.phiNegError.toFixed(3)})`);
  console.log(`  - Multi-regime error similar/lower than random: ${multiLowerError ? 'yes' : 'no'}`);
  
  return {
    pass: hypothesis,
    results: {
      multiRegime: {
        phiStats: multiResults.phiStats,
        errorStats: multiResults.errorStats,
        correlations: multiResults.correlations,
      },
      randomWalk: {
        phiStats: rwResults.phiStats,
        errorStats: rwResults.errorStats,
        correlations: rwResults.correlations,
      },
    },
    hypothesis,
    metric: `${multiResults.correlations.phiNegError.toFixed(3)} Φ-error correlation (multi-regime)`,
  };
}

// Run if called directly
if (require.main === module) {
  const result = runPredictabilityExperiment();
  console.log('\n=== FINAL RESULT ===');
  console.log(`Status: ${result.pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Metric: ${result.metric}`);
}
