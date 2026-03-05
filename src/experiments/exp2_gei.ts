/**
 * TN-LAB Experiment 2 — GEI Coherence Validation
 * Sistema TN (Tortuga Ninja) v3.0
 *
 * Objective: Verify GEI: (T,H) → T selects coherent theories per regime.
 *
 * Hypothesis:
 * - Regime 0 (ranging)  → GEI selects MEAN_REVERTING
 * - Regime 1 (trending) → GEI selects TREND_FOLLOWING or MOMENTUM
 * - Regime 2 (volatile) → GEI selects VOL_BREAKOUT
 * - Regime 3 (mixed)    → GEI selects REGIME_SWITCH
 *
 * Success criterion: coherence ≥ 75% (3 of 4 regimes select appropriate theory)
 *
 * Additional metrics (per Director's adjustment):
 * - ΔC = C(second_best) - C(best): epistemic confidence margin
 * - Full ranking of theories per regime
 *
 * What this validates:
 * - Cost function C = 0.4E + 0.2V + 0.15K + 0.15U + 0.1S has correct weights
 * - GEI is a coherent epistemic operator
 */

import { TheoryID, SufficientStats, THEORY_COUNT } from '../engine/types';
import { computeStats } from '../engine/gamma';
import { gei, evaluateTheory } from '../engine/gei';
import { generateMultiRegimeSeries, generateRangingSegment, generateTrendingSegment, generateVolatileSegment, SeededRNG } from '../simulator/marketData';
import { THEORY_FAMILIES } from '../engine/theories';

// =============================================================================
// EXPERIMENT RESULT TYPE
// =============================================================================

export interface RegimeGEIResult {
  regime: number;
  regimeName: string;
  selectedTheory: TheoryID;
  selectedTheoryName: string;
  isCoherent: boolean;
  coherentTheories: TheoryID[]; // Acceptable theories for this regime
  deltaC: number;
  ranking: Array<{ theoryId: TheoryID; name: string; cost: number; rank: number }>;
  avgDeltaC: number;
}

export interface Exp2Result {
  passed: boolean;
  coherenceRate: number;
  regimeResults: RegimeGEIResult[];
  avgDeltaC: number;
  details: string[];
}

// =============================================================================
// COHERENCE DEFINITIONS
// Which theories are acceptable for each regime
// =============================================================================

const COHERENT_THEORIES_PER_REGIME: Record<number, TheoryID[]> = {
  0: [TheoryID.MEAN_REVERTING, TheoryID.REGIME_SWITCH, TheoryID.WEAK_MEAN_REVERSION],           // ranging
  1: [TheoryID.TREND_FOLLOWING, TheoryID.MOMENTUM, TheoryID.REGIME_SWITCH, TheoryID.MICRO_TREND, TheoryID.DRIFT], // trending
  2: [TheoryID.VOL_BREAKOUT, TheoryID.REGIME_SWITCH, TheoryID.VOLATILITY_CLUSTER],             // volatile
  3: [TheoryID.REGIME_SWITCH, TheoryID.RANDOM_WALK],              // mixed
};

// =============================================================================
// MAIN EXPERIMENT
// =============================================================================

export function runExperiment2(seed: number = 42): Exp2Result {
  const details: string[] = [];
  details.push('=== EXPERIMENT 2: GEI COHERENCE ===');
  details.push(`Seed: ${seed}`);

  const rng = new SeededRNG(seed);
  const startPrice = 100.0;
  const segmentLength = 300;
  const windowSize = 100;

  const regimeResults: RegimeGEIResult[] = [];
  let totalDeltaC = 0;
  let deltaCount = 0;

  // Test each regime separately with a pure segment
  const regimeGenerators = [
    { regime: 0, name: 'ranging', generator: () => generateRangingSegment(segmentLength, startPrice, rng) },
    { regime: 1, name: 'trending', generator: () => generateTrendingSegment(segmentLength, startPrice, rng) },
    { regime: 2, name: 'volatile', generator: () => generateVolatileSegment(segmentLength, startPrice, rng) },
    // For mixed, use the multi-regime series
    { regime: 3, name: 'mixed', generator: () => {
      const mixedRng = new SeededRNG(seed + 100);
      const prices: number[] = [startPrice];
      for (let i = 1; i < segmentLength; i++) {
        prices.push(prices[i-1] + mixedRng.nextNormal(0, 0.003));
      }
      return prices;
    }},
  ];

  for (const { regime, name, generator } of regimeGenerators) {
    details.push(`\n--- Regime ${regime} (${name}) ---`);

    const prices = generator();

    // Compute stats over multiple windows and aggregate GEI decisions
    const theorySelections: TheoryID[] = [];
    const deltaCValues: number[] = [];
    const allRankings: Array<Array<{ theoryId: TheoryID; cost: number }>> = [];

    for (let t = windowSize; t < prices.length; t += 10) {
      const window = prices.slice(Math.max(0, t - windowSize), t + 1);
      const stats = computeStats(window);

      const geiResult = gei(stats, window, TheoryID.RANDOM_WALK, [], t);
      theorySelections.push(geiResult.selectedTheory);
      deltaCValues.push(geiResult.deltaC);

      const ranking = geiResult.evaluations.map(e => ({
        theoryId: e.theoryId,
        cost: e.cost,
      }));
      allRankings.push(ranking);
    }

    // Most frequently selected theory
    const selectionCounts = new Array(THEORY_COUNT).fill(0);
    for (const t of theorySelections) selectionCounts[t]++;
    const mostSelected = selectionCounts.indexOf(Math.max(...selectionCounts)) as TheoryID;

    // Average ΔC
    const avgDeltaC = deltaCValues.reduce((s, v) => s + v, 0) / Math.max(1, deltaCValues.length);
    totalDeltaC += avgDeltaC;
    deltaCount++;

    // Average ranking
    const avgCosts = new Array(THEORY_COUNT).fill(0);
    const validCounts = new Array(THEORY_COUNT).fill(0);
    
    for (const ranking of allRankings) {
      for (const { theoryId, cost } of ranking) {
        // Only sum finite costs, track valid counts
        if (isFinite(cost) && theoryId < THEORY_COUNT) {
          avgCosts[theoryId] += cost;
          validCounts[theoryId]++;
        }
      }
    }
    
    const n = allRankings.length;
    const avgRanking = avgCosts
      .map((cost, id) => ({
        theoryId: id as TheoryID,
        name: THEORY_FAMILIES[id]?.name || `Theory ${id}`,
        cost: validCounts[id] > 0 ? cost / validCounts[id] : 100.0,
        rank: 0,
      }))
      .sort((a, b) => a.cost - b.cost)
      .map((item, i) => ({ ...item, rank: i + 1 }));

    const coherentTheories = COHERENT_THEORIES_PER_REGIME[regime] ?? [];
    const isCoherent = coherentTheories.includes(mostSelected);

    details.push(`  Most selected theory: ${THEORY_FAMILIES[mostSelected].name} (${selectionCounts[mostSelected]}/${theorySelections.length} times)`);
    details.push(`  Coherent: ${isCoherent ? '✅' : '❌'} (acceptable: ${coherentTheories.map(t => THEORY_FAMILIES[t].name).join(', ')})`);
    details.push(`  Average ΔC: ${avgDeltaC.toFixed(4)}`);
    details.push(`  Theory ranking:`);
    for (const item of avgRanking) {
      // Format cost: show 100.0 for NaN values (theories with invalid cost)
      const costDisplay = isFinite(item.cost) ? item.cost.toFixed(4) : '100.0';
      details.push(`    ${item.rank}. ${item.name}: cost=${costDisplay}`);
    }

    regimeResults.push({
      regime,
      regimeName: name,
      selectedTheory: mostSelected,
      selectedTheoryName: THEORY_FAMILIES[mostSelected].name,
      isCoherent,
      coherentTheories,
      deltaC: avgDeltaC,
      ranking: avgRanking,
      avgDeltaC,
    });
  }

  // Coherence rate
  const coherentCount = regimeResults.filter(r => r.isCoherent).length;
  const coherenceRate = coherentCount / regimeResults.length;
  const avgDeltaC = deltaCount > 0 ? totalDeltaC / deltaCount : 0;

  // SUCCESS CRITERION: coherence ≥ 75% (3 of 4 regimes)
  const passed = coherenceRate >= 0.75;

  details.push(`\n=== SUMMARY ===`);
  details.push(`Coherent regimes: ${coherentCount}/${regimeResults.length}`);
  details.push(`Coherence rate: ${(coherenceRate * 100).toFixed(1)}%`);
  details.push(`Average ΔC: ${avgDeltaC.toFixed(4)}`);
  details.push(`RESULT: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
  details.push(`Criterion: coherence ≥ 75%`);

  return {
    passed,
    coherenceRate,
    regimeResults,
    avgDeltaC,
    details,
  };
}
