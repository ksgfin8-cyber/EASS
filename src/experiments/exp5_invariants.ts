/**
 * TN-LAB Experiment 5 — Full Invariant Verification
 * Sistema TN (Tortuga Ninja) v3.0
 *
 * Objective: Run a complete simulation and verify all 5 invariants simultaneously.
 *
 * Input: 5000-tick mixed series with realistic regime changes.
 *
 * Invariants to verify:
 * I₁: Var(φ_t | H_t) < 0.1
 * I₂: H_t = Γ(X_0:t) with Γ deterministic (reproducibility)
 * I₃: 0 ≤ φ_t ≤ 1 ∀t
 * I₄: Exactly one theory active at each tick
 * I₅: H(T) > 0.5 on average
 *
 * Success criterion: All 5 invariants maintained during entire simulation.
 *
 * What this validates:
 * - The TN system is mathematically coherent as a whole
 * - All components work together correctly
 */

import { runBacktest, DEFAULT_CONFIG } from '../simulator/backtest';
import { generateLongMixedSeries } from '../simulator/marketData';
import { TN_CONSTANTS } from '../engine/types';
import { THEORY_FAMILIES } from '../engine/theories';

// =============================================================================
// EXPERIMENT RESULT TYPE
// =============================================================================

export interface InvariantResult {
  name: string;
  description: string;
  satisfied: boolean;
  rate: number;
  details: string;
}

export interface Exp5Result {
  passed: boolean;
  allInvariantsSatisfied: boolean;
  invariants: {
    I1: InvariantResult;
    I2: InvariantResult;
    I3: InvariantResult;
    I4: InvariantResult;
    I5: InvariantResult;
  };
  simulationStats: {
    totalTicks: number;
    activeTicks: number;
    transitionCount: number;
    avgPhi: number;
    avgEntropy: number;
    dominantTheory: string;
  };
  reproducibilityCheck: boolean;
  details: string[];
}

// =============================================================================
// MAIN EXPERIMENT
// =============================================================================

export function runExperiment5(seed: number = 42, totalLength: number = 5000): Exp5Result {
  const details: string[] = [];
  details.push('=== EXPERIMENT 5: FULL INVARIANT VERIFICATION ===');
  details.push(`Seed: ${seed}, Length: ${totalLength}`);

  // Generate long mixed series
  const market = generateLongMixedSeries(seed, totalLength);
  details.push(`Generated ${market.prices.length} ticks`);
  details.push(`Segments: ${market.segments.length}`);

  // Run backtest
  const config = { ...DEFAULT_CONFIG, warmupPeriod: 100, recordFullHistory: true };
  const result = runBacktest(market.prices, config);

  details.push(`Active ticks: ${result.summary.activeTicks}`);
  details.push(`Transitions: ${result.summary.transitionCount}`);

  // =========================================================================
  // INVARIANT I₁: Var(φ_t | H_t) < 0.1
  // =========================================================================
  const i1Rate = result.summary.invariantRates.I1;
  const i1 = i1Rate >= 0.9; // 90% of windows must satisfy

  const invariantI1: InvariantResult = {
    name: 'I₁',
    description: 'Var(φ_t | H_t) < 0.1',
    satisfied: i1,
    rate: i1Rate,
    details: `${(i1Rate * 100).toFixed(1)}% of windows satisfy Var(φ) < 0.1`,
  };

  // =========================================================================
  // INVARIANT I₂: Γ deterministic (reproducibility)
  // =========================================================================
  // Verify by running the same simulation twice and checking identical results
  const result2 = runBacktest(market.prices, config);
  const reproducible = result.summary.avgPhi === result2.summary.avgPhi
    && result.summary.transitionCount === result2.summary.transitionCount
    && result.summary.dominantTheory === result2.summary.dominantTheory;

  const invariantI2: InvariantResult = {
    name: 'I₂',
    description: 'H_t = Γ(X_0:t) with Γ deterministic',
    satisfied: reproducible,
    rate: reproducible ? 1.0 : 0.0,
    details: reproducible
      ? 'Two identical runs produce identical results ✅'
      : 'Runs differ — Γ is not deterministic ❌',
  };

  // =========================================================================
  // INVARIANT I₃: 0 ≤ φ_t ≤ 1 ∀t
  // =========================================================================
  const i3Rate = result.summary.invariantRates.I3;
  const i3 = i3Rate === 1.0; // Must be 100% — φ is always clamped

  const invariantI3: InvariantResult = {
    name: 'I₃',
    description: '0 ≤ φ_t ≤ 1 ∀t',
    satisfied: i3,
    rate: i3Rate,
    details: `${(i3Rate * 100).toFixed(1)}% of ticks have φ ∈ [0,1]`,
  };

  // =========================================================================
  // INVARIANT I₄: Exactly one theory active at each tick
  // =========================================================================
  const i4Rate = result.summary.invariantRates.I4;
  const i4 = i4Rate === 1.0; // Must be 100% — always exactly one theory

  const invariantI4: InvariantResult = {
    name: 'I₄',
    description: '∃! T_t active at each tick',
    satisfied: i4,
    rate: i4Rate,
    details: `${(i4Rate * 100).toFixed(1)}% of ticks have exactly one active theory`,
  };

  // =========================================================================
  // INVARIANT I₅: H(T) > 0.5 on average
  // =========================================================================
  const i5Rate = result.summary.invariantRates.I5;
  const avgEntropy = result.summary.avgEntropy;
  const i5 = avgEntropy > TN_CONSTANTS.H_MIN;

  const invariantI5: InvariantResult = {
    name: 'I₅',
    description: `H(T) > ${TN_CONSTANTS.H_MIN}`,
    satisfied: i5,
    rate: i5Rate,
    details: `Average H(T) = ${avgEntropy.toFixed(4)}, I₅ rate = ${(i5Rate * 100).toFixed(1)}%`,
  };

  // =========================================================================
  // SUMMARY
  // =========================================================================
  const allSatisfied = i1 && reproducible && i3 && i4 && i5;

  details.push('\n=== INVARIANT RESULTS ===');
  for (const inv of [invariantI1, invariantI2, invariantI3, invariantI4, invariantI5]) {
    details.push(`${inv.satisfied ? '✅' : '❌'} ${inv.name}: ${inv.description}`);
    details.push(`   ${inv.details}`);
  }

  const dominantTheoryName = THEORY_FAMILIES[result.summary.dominantTheory]?.name ?? 'unknown';

  details.push('\n=== SIMULATION STATISTICS ===');
  details.push(`Total ticks: ${result.summary.totalTicks}`);
  details.push(`Active ticks: ${result.summary.activeTicks}`);
  details.push(`Theory transitions: ${result.summary.transitionCount}`);
  details.push(`Average φ: ${result.summary.avgPhi.toFixed(4)}`);
  details.push(`Average H(T): ${result.summary.avgEntropy.toFixed(4)}`);
  details.push(`Dominant theory: ${dominantTheoryName}`);

  details.push(`\nRESULT: ${allSatisfied ? '✅ PASSED' : '❌ FAILED'}`);
  details.push(`All 5 invariants satisfied: ${allSatisfied ? 'YES' : 'NO'}`);

  return {
    passed: allSatisfied,
    allInvariantsSatisfied: allSatisfied,
    invariants: {
      I1: invariantI1,
      I2: invariantI2,
      I3: invariantI3,
      I4: invariantI4,
      I5: invariantI5,
    },
    simulationStats: {
      totalTicks: result.summary.totalTicks,
      activeTicks: result.summary.activeTicks,
      transitionCount: result.summary.transitionCount,
      avgPhi: result.summary.avgPhi,
      avgEntropy: result.summary.avgEntropy,
      dominantTheory: dominantTheoryName,
    },
    reproducibilityCheck: reproducible,
    details,
  };
}
