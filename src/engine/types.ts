/**
 * TN-LAB Engine — Types
 * Sistema TN (Tortuga Ninja) v3.0
 *
 * All core types, interfaces, and enums for the TN engine.
 * This file has ZERO dependencies on React, browser APIs, or Next.js.
 * It is portable to MQL5, Python, C++, or Rust.
 */

// =============================================================================
// THEORY SPACE: T = {T_i : H × X_{t-L:t} → ℝ}
// =============================================================================

export enum TheoryID {
  RANDOM_WALK = 0,
  MEAN_REVERTING = 1,
  TREND_FOLLOWING = 2,
  MOMENTUM = 3,
  VOL_BREAKOUT = 4,
  REGIME_SWITCH = 5,
  // NEW: Intermediate theories for better coverage
  MICRO_TREND = 6,           // T7: Short-term trend detection
  WEAK_MEAN_REVERSION = 7,    // T8: Slow mean reversion
  VOLATILITY_CLUSTER = 8,     // T9: Vol-of-vol patterns
  DRIFT = 9,                  // T10: Drift/momentum with decay
}

export const THEORY_COUNT = 10;

/**
 * Functional family descriptor for each theory.
 * Ajuste Final 1: Each theory has an explicit functional form f(H,X).
 */
export interface TheoryFamily {
  id: TheoryID;
  name: string;
  /** Human-readable functional form: "f(H,X) = ..." */
  functionalForm: string;
  /** K(T_i): precomputed Kolmogorov complexity proxy */
  complexity: number;
  /** Regime where this theory performs best: 0=ranging, 1=trending, 2=volatile, 3=mixed */
  optimalRegime: number;
}

// =============================================================================
// MEMORY OPERATOR: Γ: ℝᵗ → H
// H = space of sufficient statistics + spectral density
// =============================================================================

export interface SpectralDensity {
  /** Frequency bins (normalized 0..0.5) */
  frequencies: number[];
  /** Power at each frequency bin */
  powers: number[];
  count: number;
}

/**
 * SufficientStats — the compressed memory H_t = Γ(X_0:t)
 * Contains all information needed for theory evaluation.
 */
export interface SufficientStats {
  mean: number;
  variance: number;
  skew: number;
  kurtosis: number;
  /** Hurst exponent ∈ [0,1]: <0.5 mean-reverting, >0.5 trending, =0.5 random */
  hurst: number;
  /** Autocorrelation at lags 1..20 */
  autocorr: number[]; // length 20
  /** Spectral density from FFT */
  spectrum: SpectralDensity;
  /** R(H) ∈ {0,1,2,3}: 0=ranging, 1=trending, 2=volatile, 3=mixed */
  regime: number;
  sampleSize: number;
  lastUpdate: Date;
}

// =============================================================================
// THEORY PERFORMANCE TRACKING
// =============================================================================

export interface TheoryPerformance {
  theoryId: TheoryID;
  /** Rolling history of φ values */
  phiHistory: number[];
  winRate: number;
  trades: number;
  avgReturn: number;
  sharpe: number;
  /** K(T_i) complexity */
  complexity: number;
  lastImprovement: number;
  /** d(T_actual, T_anterior): distance to previous theory */
  lastDistance: number;
  /** Cumulative prediction error */
  cumulativeError: number;
  /** Number of times this theory was active */
  activationCount: number;
}

// =============================================================================
// TRANSITION HISTORY
// =============================================================================

export interface Transition {
  from: TheoryID;
  to: TheoryID;
  timestamp: Date;
  /** C(new) - C(current): negative means improvement */
  improvement: number;
  /** d(T_from, T_to) */
  distance: number;
  /** Regime at time of transition */
  regime: number;
}

// =============================================================================
// THEORY DISTANCE METRIC (Ajuste Final 2)
// d(T_i, T_j) = |E_i - E_j| + λ|K_i - K_j| + μ(1 - δ(regime_i, regime_j))
// =============================================================================

export interface TheoryDistanceResult {
  errorDiff: number;
  complexityDiff: number;
  regimeDiff: number;
  /** Total distance d(T_i, T_j) */
  total: number;
}

// =============================================================================
// GEI EVALUATION RESULT
// =============================================================================

export interface TheoryEvaluation {
  theoryId: TheoryID;
  /** Total cost C(T_i, H) */
  cost: number;
  /** Breakdown of cost components */
  components: {
    /** 0.4 * E_pred */
    predictionError: number;
    /** 0.2 * V_inst */
    instability: number;
    /** 0.15 * K */
    complexity: number;
    /** 0.15 * U */
    uncertainty: number;
    /** 0.1 * S */
    switchingPenalty: number;
  };
  /** Rank among all theories (1 = best) */
  rank: number;
}

export interface GEIResult {
  /** Selected theory: argmin C(T_i, H) */
  selectedTheory: TheoryID;
  /** Full evaluation of all theories */
  evaluations: TheoryEvaluation[];
  /** ΔC = C(second_best) - C(best): epistemic confidence margin */
  deltaC: number;
  /** Whether a theory change is warranted (ΔC > η) */
  shouldChange: boolean;
}

// =============================================================================
// PHI OPERATOR: Φ = 1 - E_pred/E_baseline
// =============================================================================

export interface PhiResult {
  /** φ_t ∈ [0,1] */
  phi: number;
  predictionError: number;
  baselineError: number;
  /** Raw ratio before clamping */
  rawRatio: number;
}

// =============================================================================
// ENTROPY (Invariant I₅)
// =============================================================================

export interface EntropyResult {
  /** H(T) = -Σ p_i log(p_i) */
  entropy: number;
  /** Usage counts per theory */
  usageCounts: Record<TheoryID, number>;
  /** Usage probabilities per theory */
  usageProbabilities: Record<TheoryID, number>;
  /** Whether I₅ is satisfied: H(T) > h_min */
  invariantSatisfied: boolean;
  /** h_min = 0.5 */
  hMin: number;
}

// =============================================================================
// SYSTEM STATE: S_t = (T_t, H_t)
// The Markov state in the augmented space
// =============================================================================

export interface TNState {
  /** T_t: currently active theory */
  currentTheory: TheoryID;
  /** H_t: compressed memory */
  stats: SufficientStats;
  /** φ_t: current decidability */
  phi: number;
  /** θ_t: adaptive threshold ∈ [0,1] */
  theta: number;
  /** A_t: current action {-1, 0, 1} */
  signal: -1 | 0 | 1;
  /** Performance per theory */
  performance: TheoryPerformance[];
  /** Transition history */
  transitions: Transition[];
  /** Current tick index */
  tick: number;
  /** Invariant status */
  invariants: {
    I1: boolean; // Var(φ) < 0.1
    I2: boolean; // Γ deterministic
    I3: boolean; // 0 ≤ φ ≤ 1
    I4: boolean; // unique active theory
    I5: boolean; // H(T) > 0.5
  };
}

// =============================================================================
// SIMULATION TICK RESULT
// =============================================================================

export interface TickResult {
  tick: number;
  price: number;
  state: TNState;
  phi: PhiResult;
  gei: GEIResult;
  entropy: EntropyResult;
  theoryChanged: boolean;
  cycleDetected: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const TN_CONSTANTS = {
  /** Epistemic margin η: theory changes only if C(new) < C(current) - η */
  MARGIN_EPISTEMIC: 0.02,  // Reduced from 0.05 to allow smaller cost improvements to trigger switches
  /** Minimum entropy h_min for I₅ */
  H_MIN: 0.5,
  /** Maximum variance of φ for I₁ */
  PHI_VARIANCE_MAX: 0.1,
  /** Cycle detection window (seconds equivalent in ticks) */
  CYCLE_WINDOW: 5,
  /** Cycle detection distance threshold */
  CYCLE_DISTANCE_THRESHOLD: 0.2,
  /** Theory distance coefficients */
  LAMBDA: 0.3, // complexity weight
  MU: 0.2,     // regime weight
  /** GEI cost function weights: α=0.4, β=0.2, γ=0.15, δ=0.15, λ=0.1 */
  COST_ALPHA: 0.4,   // prediction error
  COST_BETA: 0.2,    // instability
  COST_GAMMA: 0.15,  // complexity
  COST_DELTA: 0.15,  // uncertainty
  COST_LAMBDA: 0.1,  // switching penalty
  /** Regime alignment bonus (negative = lower cost = better) */
  REGIME_BONUS_EXACT: -0.55,  // Stronger regime bonus for coherence
  REGIME_PENALTY_MISMATCH: 0.25,  // Stronger penalty for RW in structured regimes
  /** Exploration bonus weight (λ_X): prevents MDL collapse */
  WEIGHT_EXPLORATION: 0.12,  // Increased from 0.08 for more exploration diversity
  /** Exploration rate for forced diversity */
  EXPLORATION_RATE: 0.05,
  /** Lookback window L for theory evaluation */
  LOOKBACK_WINDOW: 50,
  /** Autocorrelation max lag */
  MAX_LAG: 20,
  /** FFT window size (power of 2) */
  FFT_SIZE: 64,
} as const;
