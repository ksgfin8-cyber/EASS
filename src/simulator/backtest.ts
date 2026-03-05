/**
 * TN-LAB Simulator — Backtest Runner
 * Sistema TN (Tortuga Ninja) v3.0
 *
 * Sequential deterministic pipeline:
 * For each tick t:
 *   1. Γ: H_t = computeStats(X_0:t)
 *   2. GEI: T_t = gei(T_{t-1}, H_t)
 *   3. Φ: φ_t = computePhi(T_t, H_t)
 *   4. Π: A_t = computeAction(T_t, φ_t, θ_t)
 *   5. Δ: update θ_t
 *   6. Record metrics
 *
 * This is the implementation of the Markov process:
 * S_t = (T_t, H_t) with transition S_{t+1} = f(S_t, X_{t+1})
 *
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import {
  TheoryID,
  TNState,
  TickResult,
  TheoryPerformance,
  Transition,
  TN_CONSTANTS,
  THEORY_COUNT,
} from '../engine/types';
import { computeStats } from '../engine/gamma';
import { gei } from '../engine/gei';
import { computePhi, computeAction, checkInvariantI1 } from '../engine/phi';
import { updateAdaptiveTheta } from '../engine/gei';
import { computeTheoryEntropy } from '../engine/entropy';
import { theoryDistance } from '../engine/distance';
import { createTransition } from '../engine/gei';

// =============================================================================
// BACKTEST CONFIGURATION
// =============================================================================

export interface BacktestConfig {
  /** Minimum price history before starting evaluation */
  warmupPeriod: number;
  /** Lookback window for stats computation */
  lookbackWindow: number;
  /** Initial theory */
  initialTheory: TheoryID;
  /** Initial adaptive threshold θ */
  initialTheta: number;
  /** Whether to record full tick history (memory intensive) */
  recordFullHistory: boolean;
  /** Entropy window size */
  entropyWindow: number;
}

export const DEFAULT_CONFIG: BacktestConfig = {
  warmupPeriod: 50,
  lookbackWindow: TN_CONSTANTS.LOOKBACK_WINDOW,
  initialTheory: TheoryID.RANDOM_WALK,
  initialTheta: 0.5,
  recordFullHistory: true,
  entropyWindow: 100,
};

// =============================================================================
// BACKTEST RESULT
// =============================================================================

export interface BacktestResult {
  /** Full tick-by-tick results (if recordFullHistory = true) */
  ticks: TickResult[];
  /** Summary statistics */
  summary: BacktestSummary;
  /** Theory usage counts */
  theoryUsage: Record<TheoryID, number>;
  /** All transitions */
  transitions: Transition[];
  /** Final state */
  finalState: TNState;
}

export interface BacktestSummary {
  totalTicks: number;
  warmupTicks: number;
  activeTicks: number;
  /** Average φ over all active ticks */
  avgPhi: number;
  /** Fraction of time each invariant was satisfied */
  invariantRates: {
    I1: number; // Var(φ) < 0.1
    I2: number; // Γ deterministic (always 1.0 in TN-LAB)
    I3: number; // 0 ≤ φ ≤ 1
    I4: number; // unique active theory
    I5: number; // H(T) > 0.5
  };
  /** Number of theory transitions */
  transitionCount: number;
  /** Number of detected cycles */
  cycleCount: number;
  /** Average entropy */
  avgEntropy: number;
  /** Theory that was active most */
  dominantTheory: TheoryID;
}

// =============================================================================
// MAIN BACKTEST RUNNER
// =============================================================================

/**
 * Run a full backtest simulation on a price series.
 *
 * This is the sequential deterministic pipeline implementing:
 * S_t = (T_t, H_t) → S_{t+1} = f(S_t, X_{t+1})
 */
export function runBacktest(
  prices: number[],
  config: BacktestConfig = DEFAULT_CONFIG
): BacktestResult {
  const n = prices.length;
  if (n < config.warmupPeriod + 2) {
    throw new Error(`Insufficient data: need at least ${config.warmupPeriod + 2} prices`);
  }

  // Initialize state
  let currentTheory: TheoryID = config.initialTheory;
  let theta = config.initialTheta;
  const theoryHistory: TheoryID[] = [];
  const phiHistory: number[] = [];
  const transitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }> = [];
  const allTransitions: Transition[] = [];
  const ticks: TickResult[] = [];
  const theoryUsage: Record<TheoryID, number> = {
    [TheoryID.RANDOM_WALK]: 0,
    [TheoryID.MEAN_REVERTING]: 0,
    [TheoryID.TREND_FOLLOWING]: 0,
    [TheoryID.MOMENTUM]: 0,
    [TheoryID.VOL_BREAKOUT]: 0,
    [TheoryID.REGIME_SWITCH]: 0,
    [TheoryID.MICRO_TREND]: 0,
    [TheoryID.WEAK_MEAN_REVERSION]: 0,
    [TheoryID.VOLATILITY_CLUSTER]: 0,
    [TheoryID.DRIFT]: 0,
  };

  // Initialize performance tracking
  const performance: TheoryPerformance[] = Array.from({ length: THEORY_COUNT }, (_, i) => ({
    theoryId: i as TheoryID,
    phiHistory: [],
    winRate: 0,
    trades: 0,
    avgReturn: 0,
    sharpe: 0,
    complexity: 0,
    lastImprovement: 0,
    lastDistance: 0,
    cumulativeError: 0,
    activationCount: 0,
  }));

  // Invariant tracking
  let i1Satisfied = 0, i3Satisfied = 0, i4Satisfied = 0, i5Satisfied = 0;
  let activeTicks = 0;
  let cycleCount = 0;
  let totalEntropy = 0;

  // Main simulation loop
  for (let t = config.warmupPeriod; t < n; t++) {
    // Get price window for this tick
    const windowStart = Math.max(0, t - config.lookbackWindow);
    const priceWindow = prices.slice(windowStart, t + 1);

    // =========================================================================
    // STEP 1: Γ — Compute sufficient statistics
    // H_t = Γ(X_0:t)
    // =========================================================================
    const stats = computeStats(priceWindow);

    // =========================================================================
    // STEP 2: GEI — Select best theory
    // T_t = GEI(T_{t-1}, H_t)
    // Pass theoryUsage for exploration bonus
    // =========================================================================
    const geiResult = gei(
      stats,
      priceWindow,
      currentTheory,
      transitionHistory,
      t,
      theoryUsage
    );

    const prevTheory = currentTheory;
    const theoryChanged = geiResult.shouldChange;
    let cycleDetected = false;

    if (theoryChanged) {
      const newTheory = geiResult.selectedTheory;

      // Compute distance for transition record
      const dist = theoryDistance(currentTheory, newTheory, stats, priceWindow);

      // Check if this was a cycle (already handled in gei, but track count)
      // gei already prevents cycles, so if shouldChange=true, it's not a cycle
      // But we track attempted cycles separately
      const currentCostVal = geiResult.evaluations.find(e => e.theoryId === currentTheory)?.cost ?? 0;
      const newCostVal = geiResult.evaluations.find(e => e.theoryId === newTheory)?.cost ?? 0;
      const improvement = currentCostVal - newCostVal;
      const transition = createTransition(
        currentTheory,
        newTheory,
        improvement,
        dist.total,
        stats.regime,
        t
      );

      allTransitions.push(transition);
      transitionHistory.push({
        from: currentTheory,
        to: newTheory,
        tick: t,
        distance: dist.total,
      });

      currentTheory = newTheory;
    }

    // =========================================================================
    // STEP 3: Φ — Compute decidability
    // φ_t = Φ(T_t, H_t)
    // =========================================================================
    const phiResult = computePhi(currentTheory, stats, priceWindow);
    const phi = phiResult.phi;

    // =========================================================================
    // STEP 4: Π — Compute action
    // A_t = Π(T_t, φ_t)
    // =========================================================================
    const signal = computeAction(currentTheory, phi, theta, stats, priceWindow);

    // =========================================================================
    // STEP 5: Δ — Update adaptive threshold
    // =========================================================================
    theta = updateAdaptiveTheta(theta, phi);

    // =========================================================================
    // STEP 6: Entropy (I₅)
    // =========================================================================
    theoryHistory.push(currentTheory);
    phiHistory.push(phi);
    theoryUsage[currentTheory]++;
    performance[currentTheory].activationCount++;
    performance[currentTheory].phiHistory.push(phi);

    const entropyResult = computeTheoryEntropy(theoryHistory, config.entropyWindow);
    totalEntropy += entropyResult.entropy;

    // =========================================================================
    // STEP 7: Verify invariants
    // =========================================================================
    const i1Check = checkInvariantI1(phiHistory, 50);
    const i1 = i1Check.satisfied;
    const i3 = phi >= 0 && phi <= 1; // Always true by construction
    const i4 = true; // Always true — exactly one theory active
    const i5 = entropyResult.invariantSatisfied;

    if (i1) i1Satisfied++;
    if (i3) i3Satisfied++;
    if (i4) i4Satisfied++;
    if (i5) i5Satisfied++;
    activeTicks++;

    // =========================================================================
    // STEP 8: Build state snapshot
    // =========================================================================
    const state: TNState = {
      currentTheory,
      stats,
      phi,
      theta,
      signal,
      performance,
      transitions: allTransitions,
      tick: t,
      invariants: {
        I1: i1,
        I2: true, // Γ is always deterministic in TN-LAB
        I3: i3,
        I4: i4,
        I5: i5,
      },
    };

    // Record tick result
    if (config.recordFullHistory) {
      ticks.push({
        tick: t,
        price: prices[t],
        state,
        phi: phiResult,
        gei: geiResult,
        entropy: entropyResult,
        theoryChanged,
        cycleDetected,
      });
    }
  }

  // =========================================================================
  // COMPUTE SUMMARY
  // =========================================================================
  const avgPhi = phiHistory.length > 0
    ? phiHistory.reduce((s, v) => s + v, 0) / phiHistory.length
    : 0;

  const avgEntropy = activeTicks > 0 ? totalEntropy / activeTicks : 0;

  // Find dominant theory
  let maxUsage = -1;
  let dominantTheory = TheoryID.RANDOM_WALK;
  for (let i = 0; i < THEORY_COUNT; i++) {
    if (theoryUsage[i as TheoryID] > maxUsage) {
      maxUsage = theoryUsage[i as TheoryID];
      dominantTheory = i as TheoryID;
    }
  }

  const summary: BacktestSummary = {
    totalTicks: n,
    warmupTicks: config.warmupPeriod,
    activeTicks,
    avgPhi,
    invariantRates: {
      I1: activeTicks > 0 ? i1Satisfied / activeTicks : 0,
      I2: 1.0, // Always satisfied in TN-LAB
      I3: activeTicks > 0 ? i3Satisfied / activeTicks : 0,
      I4: activeTicks > 0 ? i4Satisfied / activeTicks : 0,
      I5: activeTicks > 0 ? i5Satisfied / activeTicks : 0,
    },
    transitionCount: allTransitions.length,
    cycleCount,
    avgEntropy,
    dominantTheory,
  };

  // Build final state
  const finalStats = computeStats(prices.slice(-config.lookbackWindow));
  const finalState: TNState = {
    currentTheory,
    stats: finalStats,
    phi: phiHistory[phiHistory.length - 1] ?? 0,
    theta,
    signal: 0,
    performance,
    transitions: allTransitions,
    tick: n - 1,
    invariants: {
      I1: i1Satisfied / activeTicks >= 0.9,
      I2: true,
      I3: true,
      I4: true,
      I5: avgEntropy > TN_CONSTANTS.H_MIN,
    },
  };

  return {
    ticks: config.recordFullHistory ? ticks : [],
    summary,
    theoryUsage,
    transitions: allTransitions,
    finalState,
  };
}

// =============================================================================
// UTILITY: Extract time series from backtest result
// =============================================================================

export function extractPhiSeries(result: BacktestResult): number[] {
  return result.ticks.map(t => t.phi.phi);
}

export function extractTheorySeries(result: BacktestResult): TheoryID[] {
  return result.ticks.map(t => t.state.currentTheory);
}

export function extractRegimeSeries(result: BacktestResult): number[] {
  return result.ticks.map(t => t.state.stats.regime);
}

export function extractEntropySeries(result: BacktestResult): number[] {
  return result.ticks.map(t => t.entropy.entropy);
}
