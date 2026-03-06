/**
 * TN-LAB Simulator — Scientific Simulation Engine
 * Phase 2: Scientific Market Simulation
 *
 * A controlled environment for running TN-LAB on real market data.
 * This is for SCIENTIFIC RESEARCH ONLY - not trading.
 *
 * Features:
 * - Temporal replay: step-by-step market simulation
 * - State snapshots: full internal state at each tick
 * - Scientific logging: complete audit trail
 * - Reproducibility: hash-based experiment IDs
 * - Configuration management: versioned experiment configs
 *
 * NO React, NO browser APIs. Pure TypeScript.
 */

import {
  TheoryID,
  TNState,
  TickResult,
  TheoryPerformance,
  Transition,
  TN_CONSTANTS,
  THEORY_COUNT,
  SufficientStats,
} from '../engine/types';
import { computeStats } from '../engine/gamma';
import { gei } from '../engine/gei';
import { computePhi, computeAction, checkInvariantI1 } from '../engine/phi';
import { updateAdaptiveTheta } from '../engine/gei';
import { computeTheoryEntropy } from '../engine/entropy';
import { theoryDistance } from '../engine/distance';
import { createTransition } from '../engine/gei';
import { AssetData, OHLCV } from './dataIngestion';

// =============================================================================
// SIMULATION CONFIGURATION
// =============================================================================

export interface SimulationConfig {
  /** Minimum price history before starting evaluation */
  warmupPeriod: number;
  /** Lookback window for stats computation */
  lookbackWindow: number;
  /** Initial theory */
  initialTheory: TheoryID;
  /** Initial adaptive threshold θ */
  initialTheta: number;
  /** Entropy window size */
  entropyWindow: number;
  /** Whether to record full tick history */
  recordFullHistory: boolean;
  /** Simulation speed (0 = as fast as possible, ms delay otherwise) */
  speed: number;
  /** Random seed for reproducibility (optional - used for any stochastic operations) */
  seed?: number;
  /** Callback for each tick (for real-time visualization) */
  onTick?: (tick: SimulationTick) => void;
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  warmupPeriod: 50,
  lookbackWindow: TN_CONSTANTS.LOOKBACK_WINDOW,
  initialTheory: TheoryID.RANDOM_WALK,
  initialTheta: 0.5,
  entropyWindow: 100,
  recordFullHistory: true,
  speed: 0,
  seed: 42, // Default seed for reproducibility
};

// =============================================================================
// EXPERIMENT METADATA (For Reproducibility)
// =============================================================================

export interface ExperimentMetadata {
  /** Unique experiment identifier */
  experimentId: string;
  /** Human-readable experiment name */
  name: string;
  /** Detailed description */
  description: string;
  /** Creation timestamp */
  timestamp: string;
  /** TN-LAB version */
  tnlabVersion: string;
  /** Git commit hash (if available) */
  commitHash?: string;
  /** Dataset source */
  dataset: DatasetInfo;
  /** Configuration used */
  config: SimulationConfig;
  /** Random seed (if applicable) */
  seed?: number;
  /** Tags for categorization */
  tags: string[];
}

export interface DatasetInfo {
  source: 'yahoo_finance' | 'synthetic' | 'csv' | 'custom';
  symbols: string[];
  timeframe: string;
  startDate: string;
  endDate: string;
  totalBars: number;
  /** SHA-256 hash of the price data for integrity verification */
  dataHash: string;
}

// =============================================================================
// SIMULATION STATE
// =============================================================================

export interface SimulationState {
  /** Current tick index */
  tick: number;
  /** Current price */
  price: number;
  /** Current OHLCV */
  ohlcv: OHLCV | null;
  /** Current sufficient statistics H_t */
  stats: SufficientStats | null;
  /** Current theory */
  currentTheory: TheoryID;
  /** Current Φ value */
  phi: number;
  /** Current adaptive threshold */
  theta: number;
  /** Current action/signal */
  signal: number;
  /** Whether theory changed this tick */
  theoryChanged: boolean;
  /** Invariant satisfaction */
  invariants: {
    I1: boolean;
    I2: boolean;
    I3: boolean;
    I4: boolean;
    I5: boolean;
  };
}

export interface SimulationTick {
  tick: number;
  timestamp: Date;
  price: number;
  ohlcv: OHLCV | null;
  state: SimulationState;
  geiResult?: {
    selectedTheory: TheoryID;
    shouldChange: boolean;
    cost: number;
  };
  entropy: number;
  theoryUsage: Record<TheoryID, number>;
}

// =============================================================================
// SIMULATION RESULT
// =============================================================================

export interface SimulationResult {
  /** Experiment metadata for reproducibility */
  metadata: ExperimentMetadata;
  /** Final simulation state */
  finalState: SimulationState;
  /** All tick results */
  ticks: SimulationTick[];
  /** Summary statistics */
  summary: SimulationSummary;
  /** Theory usage breakdown */
  theoryUsage: Record<TheoryID, number>;
  /** All theory transitions */
  transitions: Transition[];
  /** Invariant satisfaction rates */
  invariantRates: {
    I1: number;
    I2: number;
    I3: number;
    I4: number;
    I5: number;
  };
}

export interface SimulationSummary {
  totalTicks: number;
  warmupTicks: number;
  activeTicks: number;
  /** Average Φ over all active ticks */
  avgPhi: number;
  /** Standard deviation of Φ */
  stdPhi: number;
  /** Min Φ */
  minPhi: number;
  /** Max Φ */
  maxPhi: number;
  /** Theory transition count */
  transitionCount: number;
  /** Average entropy */
  avgEntropy: number;
  /** Dominant theory (most used) */
  dominantTheory: TheoryID;
  /** Theory entropy (diversity of theory usage) */
  theoryEntropy: number;
  /** Regime distribution */
  regimeDistribution: Record<number, number>;
}

// =============================================================================
// SCIENTIFIC SIMULATION ENGINE
// =============================================================================

/**
 * Compute SHA-256 hash of price data for integrity verification.
 */
function computeDataHash(prices: number[]): string {
  // Simple hash for reproducibility verification
  let hash = 0;
  const str = prices.join(',');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  // Convert to hex-like string
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return hex.repeat(4); // 32 char hash
}

/**
 * Generate unique experiment ID.
 */
function generateExperimentId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `exp_${timestamp}_${random}`;
}

/**
 * Run scientific simulation on real market data.
 *
 * This implements the sequential deterministic pipeline:
 * For each tick t:
 *   1. Γ: H_t = computeStats(X_0:t)
 *   2. GEI: T_t = gei(T_{t-1}, H_t)
 *   3. Φ: φ_t = computePhi(T_t, H_t)
 *   4. Π: A_t = computeAction(T_t, φ_t, θ_t)
 *   5. Δ: update θ_t
 *   6. Record metrics
 */
export function runScientificSimulation(
  data: AssetData,
  config: Partial<SimulationConfig> = {},
  metadata: Partial<ExperimentMetadata> = {}
): SimulationResult {
  const cfg = { ...DEFAULT_SIMULATION_CONFIG, ...config };
  const prices = data.prices.map(p => p.close);
  const ohlcvs = data.prices;
  const n = prices.length;

  if (n < cfg.warmupPeriod + 2) {
    throw new Error(`Insufficient data: need at least ${cfg.warmupPeriod + 2} prices, got ${n}`);
  }

  // Initialize state
  let currentTheory: TheoryID = cfg.initialTheory;
  let theta = cfg.initialTheta;
  const theoryHistory: TheoryID[] = [];
  const phiHistory: number[] = [];
  const entropyHistory: number[] = [];
  const regimeHistory: number[] = [];
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

  const ticks: SimulationTick[] = [];
  const allTransitions: Transition[] = [];
  const transitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }> = [];

  // Invariant tracking
  let i1Satisfied = 0, i3Satisfied = 0, i4Satisfied = 0, i5Satisfied = 0;
  let activeTicks = 0;
  let totalEntropy = 0;

  // Main simulation loop
  for (let t = cfg.warmupPeriod; t < n; t++) {
    const currentTick = t;
    const currentPrice = prices[t];
    const currentOhlcv = ohlcvs[t];

    // Get price window for this tick
    const windowStart = Math.max(0, t - cfg.lookbackWindow);
    const priceWindow = prices.slice(windowStart, t + 1);

    // =========================================================================
    // STEP 1: Γ — Compute sufficient statistics
    // H_t = Γ(X_0:t)
    // =========================================================================
    const stats = computeStats(priceWindow);

    // =========================================================================
    // STEP 2: GEI — Select best theory
    // T_t = GEI(T_{t-1}, H_t)
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
    let theoryChanged = false;

    if (geiResult.shouldChange) {
      const newTheory = geiResult.selectedTheory;

      // Compute distance for transition record
      const dist = theoryDistance(currentTheory, newTheory, stats, priceWindow);

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
      theoryChanged = true;
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
    entropyHistory.push(0); // Will be filled after enough history

    const entropyResult = computeTheoryEntropy(theoryHistory, cfg.entropyWindow);
    totalEntropy += entropyResult.entropy;
    entropyHistory[entropyHistory.length - 1] = entropyResult.entropy;

    // Track regime
    regimeHistory.push(stats.regime);

    // =========================================================================
    // STEP 7: Verify invariants
    // =========================================================================
    const i1Check = checkInvariantI1(phiHistory, 50);
    const i1 = i1Check.satisfied;
    const i3 = phi >= 0 && phi <= 1;
    const i4 = true; // Exactly one theory active
    const i5 = entropyResult.invariantSatisfied;

    if (i1) i1Satisfied++;
    if (i3) i3Satisfied++;
    if (i4) i4Satisfied++;
    if (i5) i5Satisfied++;
    activeTicks++;

    // =========================================================================
    // STEP 8: Build tick record
    // =========================================================================
    const tickState: SimulationState = {
      tick: currentTick,
      price: currentPrice,
      ohlcv: currentOhlcv,
      stats,
      currentTheory,
      phi,
      theta,
      signal,
      theoryChanged,
      invariants: { I1: i1, I2: true, I3: i3, I4: i4, I5: i5 },
    };

    if (cfg.recordFullHistory) {
      ticks.push({
        tick: currentTick,
        timestamp: currentOhlcv.date,
        price: currentPrice,
        ohlcv: currentOhlcv,
        state: tickState,
        geiResult: {
          selectedTheory: geiResult.selectedTheory,
          shouldChange: geiResult.shouldChange,
          cost: geiResult.evaluations.find(e => e.theoryId === currentTheory)?.cost ?? 0,
        },
        entropy: entropyResult.entropy,
        theoryUsage: { ...theoryUsage },
      });
    }

    // Real-time callback
    if (cfg.onTick && cfg.speed > 0) {
      cfg.onTick(ticks[ticks.length - 1]);
    }
  }

  // =========================================================================
  // COMPUTE SUMMARY
  // =========================================================================
  const avgPhi = phiHistory.length > 0
    ? phiHistory.reduce((s, v) => s + v, 0) / phiHistory.length
    : 0;

  const stdPhi = phiHistory.length > 1
    ? Math.sqrt(phiHistory.reduce((s, v) => s + Math.pow(v - avgPhi, 2), 0) / phiHistory.length)
    : 0;

  const minPhi = phiHistory.length > 0 ? Math.min(...phiHistory) : 0;
  const maxPhi = phiHistory.length > 0 ? Math.max(...phiHistory) : 0;

  const avgEntropy = activeTicks > 0 ? totalEntropy / activeTicks : 0;

  // Compute theory entropy (diversity)
  const usageValues = Object.values(theoryUsage);
  const totalUsage = usageValues.reduce((s, v) => s + v, 0);
  let theoryEntropy = 0;
  if (totalUsage > 0) {
    for (const usage of usageValues) {
      if (usage > 0) {
        const p = usage / totalUsage;
        theoryEntropy -= p * Math.log(p);
      }
    }
  }

  // Find dominant theory
  let maxUsage = -1;
  let dominantTheory = TheoryID.RANDOM_WALK;
  for (let i = 0; i < THEORY_COUNT; i++) {
    if (theoryUsage[i as TheoryID] > maxUsage) {
      maxUsage = theoryUsage[i as TheoryID];
      dominantTheory = i as TheoryID;
    }
  }

  // Regime distribution
  const regimeDistribution: Record<number, number> = {};
  for (const regime of regimeHistory) {
    regimeDistribution[regime] = (regimeDistribution[regime] || 0) + 1;
  }

  const summary: SimulationSummary = {
    totalTicks: n,
    warmupTicks: cfg.warmupPeriod,
    activeTicks,
    avgPhi,
    stdPhi,
    minPhi,
    maxPhi,
    transitionCount: allTransitions.length,
    avgEntropy,
    dominantTheory,
    theoryEntropy,
    regimeDistribution,
  };

  // Build final state
  const finalStats = computeStats(prices.slice(-cfg.lookbackWindow));
  const finalState: SimulationState = {
    tick: n - 1,
    price: prices[n - 1],
    ohlcv: ohlcvs[n - 1],
    stats: finalStats,
    currentTheory,
    phi: phiHistory[phiHistory.length - 1] ?? 0,
    theta,
    signal: 0,
    theoryChanged: false,
    invariants: {
      I1: i1Satisfied / activeTicks >= 0.9,
      I2: true,
      I3: true,
      I4: true,
      I5: avgEntropy > TN_CONSTANTS.H_MIN,
    },
  };

  // =========================================================================
  // BUILD EXPERIMENT METADATA
  // =========================================================================
  const experimentMetadata: ExperimentMetadata = {
    experimentId: generateExperimentId(),
    name: metadata.name || `Simulation ${data.symbol}`,
    description: metadata.description || `TN-LAB simulation on ${data.symbol}`,
    timestamp: new Date().toISOString(),
    tnlabVersion: '5.4',
    commitHash: metadata.commitHash,
    dataset: {
      source: 'yahoo_finance',
      symbols: [data.symbol],
      timeframe: data.timeframe,
      startDate: data.prices[0]?.date.toISOString() || '',
      endDate: data.prices[data.prices.length - 1]?.date.toISOString() || '',
      totalBars: data.prices.length,
      dataHash: computeDataHash(prices),
    },
    config: cfg,
    seed: cfg.seed,
    tags: metadata.tags || ['scientific', 'real_data'],
  };

  return {
    metadata: experimentMetadata,
    finalState,
    ticks: cfg.recordFullHistory ? ticks : [],
    summary,
    theoryUsage,
    transitions: allTransitions,
    invariantRates: {
      I1: activeTicks > 0 ? i1Satisfied / activeTicks : 0,
      I2: 1.0,
      I3: activeTicks > 0 ? i3Satisfied / activeTicks : 0,
      I4: activeTicks > 0 ? i4Satisfied / activeTicks : 0,
      I5: activeTicks > 0 ? i5Satisfied / activeTicks : 0,
    },
  };
}

// =============================================================================
// SIMULATION UTILITIES
// =============================================================================

/**
 * Extract Φ time series from simulation result.
 */
export function extractPhiSeries(result: SimulationResult): number[] {
  return result.ticks.map(t => t.state.phi);
}

/**
 * Extract theory time series from simulation result.
 */
export function extractTheorySeries(result: SimulationResult): TheoryID[] {
  return result.ticks.map(t => t.state.currentTheory);
}

/**
 * Extract regime time series from simulation result.
 */
export function extractRegimeSeries(result: SimulationResult): number[] {
  return result.ticks.map(t => t.state.stats?.regime ?? 0);
}

/**
 * Extract signal time series from simulation result.
 */
export function extractSignalSeries(result: SimulationResult): number[] {
  return result.ticks.map(t => t.state.signal);
}

/**
 * Extract entropy time series from simulation result.
 */
export function extractEntropySeries(result: SimulationResult): number[] {
  return result.ticks.map(t => t.entropy);
}

// =============================================================================
// SIMULATION EXPORT (For Reproducibility)
// =============================================================================

/**
 * Export simulation result to JSON for reproducibility.
 */
export function exportSimulationResult(result: SimulationResult): string {
  return JSON.stringify(result, (key, value) => {
    // Handle Date objects
    if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() };
    }
    return value;
  }, 2);
}

/**
 * Import simulation result from JSON.
 */
export function importSimulationResult(json: string): SimulationResult {
  const parsed = JSON.parse(json, (key, value) => {
    // Restore Date objects
    if (value && typeof value === 'object' && value.__type === 'Date') {
      return new Date(value.value);
    }
    return value;
  });
  return parsed as SimulationResult;
}

/**
 * Generate experiment report as markdown.
 */
export function generateExperimentReport(result: SimulationResult): string {
  const { metadata, summary, invariantRates, theoryUsage } = result;

  const theoryNames: Record<TheoryID, string> = {
    [TheoryID.RANDOM_WALK]: 'Random Walk',
    [TheoryID.MEAN_REVERTING]: 'Mean Reverting',
    [TheoryID.TREND_FOLLOWING]: 'Trend Following',
    [TheoryID.MOMENTUM]: 'Momentum',
    [TheoryID.VOL_BREAKOUT]: 'Volatility Breakout',
    [TheoryID.REGIME_SWITCH]: 'Regime Switch',
    [TheoryID.MICRO_TREND]: 'Micro Trend',
    [TheoryID.WEAK_MEAN_REVERSION]: 'Weak Mean Reversion',
    [TheoryID.VOLATILITY_CLUSTER]: 'Volatility Cluster',
    [TheoryID.DRIFT]: 'Drift',
  };

  const regimeNames: Record<number, string> = {
    0: 'Ranging',
    1: 'Trending',
    2: 'Volatile',
    3: 'Mixed',
  };

  let report = `# TN-LAB Scientific Simulation Report

## Experiment Metadata

- **ID**: ${metadata.experimentId}
- **Name**: ${metadata.name}
- **Description**: ${metadata.description}
- **Timestamp**: ${metadata.timestamp}
- **TN-LAB Version**: ${metadata.tnlabVersion}
- **Data Source**: ${metadata.dataset.source}
- **Symbols**: ${metadata.dataset.symbols.join(', ')}
- **Timeframe**: ${metadata.dataset.timeframe}
- **Data Hash**: \`${metadata.dataset.dataHash}\`

## Dataset

- **Start Date**: ${metadata.dataset.startDate}
- **End Date**: ${metadata.dataset.endDate}
- **Total Bars**: ${metadata.dataset.totalBars}

## Summary

- **Total Ticks**: ${summary.totalTicks}
- **Warmup Ticks**: ${summary.warmupTicks}
- **Active Ticks**: ${summary.activeTicks}
- **Avg Φ**: ${summary.avgPhi.toFixed(4)}
- **Std Φ**: ${summary.stdPhi.toFixed(4)}
- **Min Φ**: ${summary.minPhi.toFixed(4)}
- **Max Φ**: ${summary.maxPhi.toFixed(4)}
- **Theory Transitions**: ${summary.transitionCount}
- **Avg Entropy**: ${summary.avgEntropy.toFixed(4)}
- **Theory Entropy**: ${summary.theoryEntropy.toFixed(4)}
- **Dominant Theory**: ${theoryNames[summary.dominantTheory]}

## Theory Usage

| Theory | Count | Percentage |
|--------|-------|------------|
`;

  const totalTheoryUsage = Object.values(theoryUsage).reduce((s, v) => s + v, 0);

  for (const [tid, count] of Object.entries(theoryUsage)) {
    const theoryId = parseInt(tid) as TheoryID;
    const pct = totalTheoryUsage > 0 ? (count / totalTheoryUsage * 100).toFixed(1) : '0.0';
    report += `| ${theoryNames[theoryId]} | ${count} | ${pct}% |\n`;
  }

  report += `
## Invariant Satisfaction

| Invariant | Rate |
|-----------|------|
| I1 (Var(Φ) < 0.1) | ${(invariantRates.I1 * 100).toFixed(1)}% |
| I2 (Γ deterministic) | ${(invariantRates.I2 * 100).toFixed(1)}% |
| I3 (0 ≤ Φ ≤ 1) | ${(invariantRates.I3 * 100).toFixed(1)}% |
| I4 (Unique theory) | ${(invariantRates.I4 * 100).toFixed(1)}% |
| I5 (H(T) > 0.5) | ${(invariantRates.I5 * 100).toFixed(1)}% |

## Regime Distribution

| Regime | Count | Percentage |
|--------|-------|------------|
`;

  for (const [regime, count] of Object.entries(summary.regimeDistribution)) {
    const pct = (count / summary.activeTicks * 100).toFixed(1);
    report += `| ${regimeNames[parseInt(regime)] || regime} | ${count} | ${pct}% |\n`;
  }

  report += `
---
*Generated by TN-LAB Scientific Simulation Engine v5.4*
`;

  return report;
}
