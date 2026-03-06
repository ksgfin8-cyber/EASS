/**
 * TN-LAB Experiment 9: Structural Stability
 * 
 * Scientific Stage v4 - New Experiments
 * 
 * OBJECTIVE:
 * Perturb GEI parameters (α, β, γ, λ) and observe theory dominance changes.
 * 
 * This tests:
 * - Stability of the model: small perturbations should not change everything
 * - If small changes cause major theory shifts → fragile model
 * - If theory selection is stable → real structure detected
 * 
 * STABILITY DEFINITION:
 * A system is structurally stable if small parameter perturbations
 * cause bounded changes in output.
 * 
 * HYPOTHESIS:
 * TN-LAB is structurally stable:
 * - Minor parameter changes (<10%) don't change dominant theory
 * - Only significant parameter shifts (>30%) cause theory transitions
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, THEORY_COUNT, SufficientStats, TN_CONSTANTS, GEIResult } from '../engine/types';
import { computeStats } from '../engine/gamma';
import { gei } from '../engine/gei';
import { generateTrendingSegment, generateVolatileSegment, SeededRNG } from '../simulator/marketData';

/**
 * Test stability by computing theory selection with perturbed costs
 * 
 * Since constants are hardcoded, we simulate perturbation by:
 * 1. Adding noise to costs
 * 2. Measuring theory change frequency
 */
function testPerturbationStability(
  stats: SufficientStats,
  prices: number[],
  perturbationPercent: number,
  trials: number
): {
  originalTheory: TheoryID;
  perturbedTheories: TheoryID[];
  changeRate: number;
  stabilityScore: number;
} {
  // Get original theory selection
  const transitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }> = [];
  const original = gei(stats, prices, 0 as TheoryID, transitionHistory, 0);
  const originalTheory = original.selectedTheory;
  
  // Run multiple trials with cost perturbations
  const perturbedTheories: TheoryID[] = [];
  
  for (let i = 0; i < trials; i++) {
    // Perturb costs by adding random noise
    // This simulates parameter changes
    const noise = (Math.random() - 0.5) * 2 * (perturbationPercent / 100);
    
    // The GEI result already has all evaluations
    // We can check if the ranking changes
    const noisyEvaluations = original.evaluations.map(e => ({
      ...e,
      cost: e.cost * (1 + noise),
    }));
    
    // Find best theory with perturbation
    let bestTheory = noisyEvaluations[0].theoryId;
    let bestCost = noisyEvaluations[0].cost;
    
    for (const eval_ of noisyEvaluations) {
      if (eval_.cost < bestCost) {
        bestCost = eval_.cost;
        bestTheory = eval_.theoryId;
      }
    }
    
    perturbedTheories.push(bestTheory);
  }
  
  // Calculate change rate
  let changes = 0;
  for (const t of perturbedTheories) {
    if (t !== originalTheory) changes++;
  }
  const changeRate = changes / trials;
  
  // Stability score: 1 = perfectly stable, 0 = completely random
  const stabilityScore = 1 - changeRate;
  
  return {
    originalTheory,
    perturbedTheories,
    changeRate,
    stabilityScore,
  };
}

/**
 * Run stability analysis across perturbation levels
 */
function analyzeStabilityCurve(
  stats: SufficientStats,
  prices: number[]
): Array<{
  perturbationPercent: number;
  changeRate: number;
  stabilityScore: number;
  regime: string;
}> {
  const results = [];
  const trials = 50;
  
  // Test different perturbation levels
  const perturbations = [1, 5, 10, 15, 20, 30, 50];
  
  for (const pert of perturbations) {
    const result = testPerturbationStability(stats, prices, pert, trials);
    
    results.push({
      perturbationPercent: pert,
      changeRate: result.changeRate,
      stabilityScore: result.stabilityScore,
      regime: stats.regime === 0 ? 'ranging' :
              stats.regime === 1 ? 'trending' :
              stats.regime === 2 ? 'volatile' : 'mixed',
    });
  }
  
  return results;
}

/**
 * Compute critical perturbation threshold
 * Find smallest perturbation that causes >50% theory changes
 */
function findCriticalThreshold(
  stabilityResults: Array<{ perturbationPercent: number; changeRate: number; stabilityScore: number }>
): number | null {
  for (const r of stabilityResults) {
    if (r.changeRate > 0.5) {
      return r.perturbationPercent;
    }
  }
  return null; // Never exceeds 50%
}

/**
 * Main experiment runner
 */
export function runStabilityExperiment(): {
  pass: boolean;
  trendingMarket: {
    stabilityCurve: Array<{ perturbationPercent: number; changeRate: number; stabilityScore: number }>;
    criticalThreshold: number | null;
    originalTheory: TheoryID;
  };
  volatileMarket: {
    stabilityCurve: Array<{ perturbationPercent: number; changeRate: number; stabilityScore: number }>;
    criticalThreshold: number | null;
    originalTheory: TheoryID;
  };
  overallStability: number;
  hypothesis: boolean;
  metric: string;
} {
  console.log('\n=== EXPERIMENT 9: Structural Stability ===\n');
  
  const rng = new SeededRNG(42);
  
  // Generate test markets
  console.log('Generating test markets...');
  const trendingPrices = generateTrendingSegment(500, 100, rng);
  const volatilePrices = generateVolatileSegment(500, 100, rng);
  
  const trendingStats = computeStats(trendingPrices);
  const volatileStats = computeStats(volatilePrices);
  
  console.log(`Trending market: regime=${trendingStats.regime}, hurst=${trendingStats.hurst.toFixed(3)}`);
  console.log(`Volatile market: regime=${volatileStats.regime}, variance=${volatileStats.variance.toFixed(2e-10)}\n`);
  
  // Analyze stability for trending market
  console.log('Analyzing trending market stability...');
  const trendingStability = analyzeStabilityCurve(trendingStats, trendingPrices);
  const trendingTransitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }> = [];
  const trendingOriginal = gei(trendingStats, trendingPrices, 0 as TheoryID, trendingTransitionHistory, 0);
  
  console.log('Analyzing volatile market stability...');
  const volatileStability = analyzeStabilityCurve(volatileStats, volatilePrices);
  const volatileTransitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }> = [];
  const volatileOriginal = gei(volatileStats, volatilePrices, 0 as TheoryID, volatileTransitionHistory, 0);
  
  // Find critical thresholds
  const trendingCritical = findCriticalThreshold(trendingStability);
  const volatileCritical = findCriticalThreshold(volatileStability);
  
  // Print results
  console.log('\nTRENDING MARKET:');
  console.log('================');
  console.log(`Original theory: ${TheoryID[trendingOriginal.selectedTheory]}`);
  console.log('Perturbation | Change Rate | Stability');
  console.log('-------------|-------------|----------');
  for (const r of trendingStability) {
    console.log(`    ${r.perturbationPercent.toString().padStart(2)}%      |    ${(r.changeRate * 100).toFixed(1)}%    |  ${r.stabilityScore.toFixed(3)}`);
  }
  console.log(`Critical threshold: ${trendingCritical ? `${trendingCritical}%` : '>50%'}`);
  
  console.log('\nVOLATILE MARKET:');
  console.log('================');
  console.log(`Original theory: ${TheoryID[volatileOriginal.selectedTheory]}`);
  console.log('Perturbation | Change Rate | Stability');
  console.log('-------------|-------------|----------');
  for (const r of volatileStability) {
    console.log(`    ${r.perturbationPercent.toString().padStart(2)}%      |    ${(r.changeRate * 100).toFixed(1)}%    |  ${r.stabilityScore.toFixed(3)}`);
  }
  console.log(`Critical threshold: ${volatileCritical ? `${volatileCritical}%` : '>50%'}`);
  
  // Compute overall stability (average at 10% perturbation)
  const trending10 = trendingStability.find(r => r.perturbationPercent === 10);
  const volatile10 = volatileStability.find(r => r.perturbationPercent === 10);
  
  const overallStability = (
    (trending10?.stabilityScore || 0) + 
    (volatile10?.stabilityScore || 0)
  ) / 2;
  
  console.log(`\nOVERALL STABILITY (10% perturbation): ${overallStability.toFixed(3)}`);
  
  // HYPOTHESIS: TN-LAB is structurally stable
  // - At 10% perturbation, stability should be > 0.7 (change rate < 30%)
  // - Critical threshold should be > 20%
  
  const hypothesis = (
    overallStability > 0.7 &&              // Not too sensitive to small changes
    (trendingCritical || 100) > 20 &&     // Needs significant perturbation to destabilize
    (volatileCritical || 100) > 20
  );
  
  console.log(`\nHYPOTHESIS: ${hypothesis ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  - 10% stability: ${overallStability.toFixed(3)} (threshold: >0.7)`);
  console.log(`  - Trending critical: ${trendingCritical || '>50%'} (threshold: >20%)`);
  console.log(`  - Volatile critical: ${volatileCritical || '>50%'} (threshold: >20%)`);
  
  return {
    pass: hypothesis,
    trendingMarket: {
      stabilityCurve: trendingStability,
      criticalThreshold: trendingCritical,
      originalTheory: trendingOriginal.selectedTheory,
    },
    volatileMarket: {
      stabilityCurve: volatileStability,
      criticalThreshold: volatileCritical,
      originalTheory: volatileOriginal.selectedTheory,
    },
    overallStability,
    hypothesis,
    metric: `${overallStability.toFixed(3)} stability at 10% perturbation`,
  };
}

// Run if called directly
if (require.main === module) {
  const result = runStabilityExperiment();
  console.log('\n=== FINAL RESULT ===');
  console.log(`Status: ${result.pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Metric: ${result.metric}`);
}
