# TN-LAB Computational Architecture

**Version:** 5.2  
**Date:** 2026-03-05  
**Status:** Finalized

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Module Dependencies](#2-module-dependencies)
3. [Execution Pipeline](#3-execution-pipeline)
4. [Module Specifications](#4-module-specifications)
5. [Computational Complexity](#5-computational-complexity)
6. [Data Flow](#6-data-flow)
7. [Portability Considerations](#7-portability-considerations)

---

## 1. Architecture Overview

### 1.1 Design Principles

TN-LAB follows these architectural principles:

1. **Pure TypeScript**: No React, browser APIs, or external math libraries
2. **Determinism**: Same input always produces same output
3. **Numerical Stability**: Guards against NaN/Infinity propagation
4. **Modularity**: Each operator is a separate module
5. **Testability**: All experiments are reproducible with seeded RNG

### 1.2 Directory Structure

```
src/
├── engine/              # Core TN-LAB operators
│   ├── gamma.ts         # Γ: Memory compression
│   ├── regime.ts        # R: Regime detection
│   ├── gei.ts           # GEI: Theory selection
│   ├── phi.ts           # Φ: Decidability
│   ├── theories.ts      # Theory definitions
│   ├── entropy.ts       # Theory entropy
│   ├── distance.ts      # Theory distance metrics
│   ├── numeric.ts       # Numeric stability utilities
│   └── types.ts        # Type definitions
│
├── simulator/           # Market simulation
│   ├── marketData.ts    # Price generators
│   └── backtest.ts      # Backtesting engine
│
├── experiments/         # Scientific experiments
│   ├── exp1_regime.ts
│   ├── exp2_gei.ts
│   ├── exp3_phi.ts
│   ├── ... (exp1-16)
│   └── runAll.ts
│
└── app/                 # Next.js UI (optional)
```

---

## 2. Module Dependencies

### 2.1 Dependency Graph

```
                    ┌─────────────────┐
                    │   marketData.ts │
                    │  (generators)   │
                    └────────┬────────┘
                             │
                             ▼
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  numeric.ts  │◄───│   gamma.ts      │───►│   regime.ts      │
│   (guards)   │    │ (Γ operator)    │    │  (R function)    │
└──────────────┘    └────────┬────────┘    └──────────────────┘
                             │
                             ▼
                    ┌─────────────────┐    ┌──────────────────┐
                    │  theories.ts    │◄──│    gei.ts        │
                    │ (T definitions) │    │ (GEI operator)   │
                    └────────┬────────┘    └────────┬─────────┘
                             │                      │
                             ▼                      ▼
                    ┌─────────────────┐    ┌──────────────────┐
                    │    phi.ts       │◄──│   distance.ts    │
                    │ (Φ operator)   │    │ (theory metrics) │
                    └────────┬────────┘    └──────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │   entropy.ts    │
                    │  (I₅ invariant) │
                    └─────────────────┘
```

### 2.2 Module Responsibilities

| Module | Responsibility | Public API |
|--------|---------------|------------|
| `gamma.ts` | Compress price → stats | `computeStats(prices)` |
| `regime.ts` | Classify market regime | `detectRegime(stats)` |
| `gei.ts` | Select best theory | `gei(stats, prices, currentTheory, ...)` |
| `phi.ts` | Compute decidability | `computePhi(theoryId, stats, prices)` |
| `theories.ts` | Theory predictions | `predict(theoryId, stats, prices)` |
| `entropy.ts` | Compute theory entropy | `computeTheoryEntropy(history)` |
| `distance.ts` | Theory distance + cycles | `theoryDistance(t1, t2, stats, prices)` |
| `numeric.ts` | Stability guards | `safeDiv`, `isValidNumber`, etc. |

---

## 3. Execution Pipeline

### 3.1 Tick Processing

Each market tick follows this pipeline:

```
Price Update
     │
     ▼
┌─────────────┐
│ Γ: compute  │  ←─ H_t = Γ(X_{0:t})
│   Stats     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ R: detect   │  ←─ regime = R(H_t)
│   Regime    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ GEI: select │  ←─ T* = argmin C(T_i, H_t)
│   Theory    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Φ: compute  │  ←─ φ_t = 1 - E_pred/E_baseline
│   Decid.    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Π: generate │  ←─ A_t = Π(T*, φ_t, θ_t)
│   Signal    │
└─────────────┘
```

### 3.2 Theory Evaluation (Inside GEI)

```
For each theory T_i:
    │
    ├─► E_pred = prediction error
    ├─► V_inst = instability
    ├─► K = complexity
    ├─► U = uncertainty
    ├─► S = switching penalty
    ├─► X(T) = exploration bonus
    └─► regime alignment bonus/penalty

    C(T_i, H) = Σ w_i * component_i

Select T* = argmin_i C(T_i, H)
```

---

## 4. Module Specifications

### 4.1 types.ts

Defines all core interfaces:

```typescript
interface SufficientStats {
  mean: number;
  variance: number;
  skew: number;
  kurtosis: number;
  hurst: number;           // [0,1]
  autocorr: number[];      // length 20
  spectrum: SpectralDensity;
  regime: number;          // {0,1,2,3}
  sampleSize: number;
  lastUpdate: Date;
}

interface GEIResult {
  selectedTheory: TheoryID;
  evaluations: TheoryEvaluation[];
  deltaC: number;          // confidence margin
  shouldChange: boolean;
}

interface PhiResult {
  phi: number;             // [0,1]
  predictionError: number;
  baselineError: number;
  rawRatio: number;
}
```

### 4.2 gamma.ts (Γ Operator)

**Purpose**: Compress price history into sufficient statistics

**Key Functions**:
- `computeStats(prices: number[]): SufficientStats`
- `computeHurstRS(prices: number[]): number`
- `computeAutocorrelation(data: number[], maxLag: number): number[]`
- `computeSpectralDensity(returns: number[], fftSize: number): SpectralDensity`

**Implementation Notes**:
- FFT uses Cooley-Tukey algorithm (no external dependencies)
- Hurst via R/S analysis with multiple window sizes
- Returns computed as log returns for stationarity

### 4.3 gei.ts (GEI Operator)

**Purpose**: Select the theory with minimum epistemic cost

**Key Functions**:
- `gei(stats, prices, currentTheory, transitionHistory, tick, theoryUsage): GEIResult`
- `evaluateTheory(theoryId, stats, prices, currentTheory, theoryUsage): TheoryEvaluation`
- `updateAdaptiveTheta(currentTheta, currentPhi): number`

**Cost Function Weights**:
```typescript
COST_ALPHA = 0.4    // prediction error
COST_BETA = 0.2     // instability
COST_GAMMA = 0.15   // complexity
COST_DELTA = 0.15   // uncertainty
COST_LAMBDA = 0.1   // switching penalty
WEIGHT_EXPLORATION = 0.12  // exploration bonus
```

### 4.4 phi.ts (Φ Operator)

**Purpose**: Compute market decidability

**Key Functions**:
- `computePhi(theoryId, stats, prices): PhiResult`
- `computeBaselineError(prices): number`
- `computePhiVariance(phiHistory, windowSize): number`
- `computeAction(theoryId, phi, theta, stats, prices): -1|0|1`

### 4.5 theories.ts

**Purpose**: Theory predictions and definitions

**Key Functions**:
- `predict(theoryId, stats, prices): number`
- `computePredictionError(theoryId, stats, prices, windowSize): number`
- `getTheoryComplexity(theoryId): number`
- `getTheoryOptimalRegime(theoryId): number`

**Theory Implementations** (10 total):
- Random Walk, Mean Reverting, Trend Following
- Momentum, Volatility Breakout, Regime Switch
- Micro Trend, Weak Mean Reversion, Volatility Cluster, Drift

### 4.6 regime.ts

**Purpose**: Classify market regime

**Key Functions**:
- `detectRegime(stats, thresholds): number` → {0,1,2,3}
- `computeRegimeConfidence(stats, thresholds): {regime, confidence, scores}`

**Default Thresholds**:
```typescript
{
  hurstLow: 0.45,
  hurstHigh: 0.55,
  varianceLow: 5e-10,
  varianceHigh: 1e-9
}
```

### 4.7 entropy.ts

**Purpose**: Compute theory diversity (Invariant I₅)

**Key Functions**:
- `computeTheoryEntropy(theoryHistory, windowSize): EntropyResult`
- `maxEntropy(): number`
- `normalizedEntropy(entropy): number`

### 4.8 distance.ts

**Purpose**: Theory distance and cycle detection

**Key Functions**:
- `theoryDistance(t1, t2, stats, prices): TheoryDistanceResult`
- `computeDistanceMatrix(stats, prices): number[][]`
- `isCycleDetected(from, to, history, tick, stats, prices): CycleDetectionResult`

### 4.9 numeric.ts

**Purpose**: Numeric stability guards

**Key Functions**:
- `safeDiv(a, b, eps?): number`
- `isValidNumber(n): boolean`
- `isPriceWindowDegenerate(prices): boolean`
- `sanitizeCost(cost): number`

---

## 5. Computational Complexity

### 5.1 Per-Tick Analysis

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Γ: computeStats | O(n log n) | FFT dominates |
| R: detectRegime | O(1) | Simple threshold |
| GEI: evaluate N theories | O(N × L) | N=10, L=lookback |
| Φ: computePhi | O(L) | Prediction error |
| Π: computeAction | O(1) | Switch statement |

### 5.2 Window Analysis

For a window of size L:
- **Γ**: O(L log L) - FFT
- **Theories**: O(N × L) - N predictions per step
- **Φ**: O(L) - baseline comparison

### 5.3 Scalability

| Window Size | Ticks/Second (est.) |
|-------------|-------------------|
| 50 | ~10,000 |
| 100 | ~5,000 |
| 200 | ~2,500 |

*Estimates based on single-threaded JavaScript*

---

## 6. Data Flow

### 6.1 Main State Object

```typescript
interface TNState {
  currentTheory: TheoryID;
  stats: SufficientStats;
  phi: number;
  theta: number;           // Adaptive threshold
  signal: -1 | 0 | 1;
  performance: TheoryPerformance[];
  transitions: Transition[];
  tick: number;
  invariants: {
    I1: boolean;  // Var(φ) < 0.1
    I2: boolean;  // Γ deterministic
    I3: boolean;  // 0 ≤ φ ≤ 1
    I4: boolean;  // unique theory
    I5: boolean;  // H(T) > 0.5
  };
}
```

### 6.2 Transition Record

```typescript
interface Transition {
  from: TheoryID;
  to: TheoryID;
  timestamp: Date;
  improvement: number;     // C(new) - C(current)
  distance: number;        // d(from, to)
  regime: number;
}
```

---

## 7. Portability Considerations

### 7.1 No External Dependencies

TN-LAB core is pure TypeScript with:
- No React dependencies
- No browser APIs
- No external math libraries (FFT implemented manually)
- No random number generators (SeededRNG included)

### 7.2 Portable Targets

The engine can be ported to:
- **MQL5** (MT5 trading)
- **Python** (NumPy/SciPy)
- **C++** (performance critical)
- **Rust** (safety critical)

### 7.3 Porting Checklist

When porting:
1. ✓ Implement SeededRNG with same algorithm
2. ✓ Use same FFT implementation (Cooley-Tukey)
3. ✓ Use same regime thresholds
4. ✓ Use same cost function weights
5. ✓ Use same numeric guards

---

## Appendix A: Constants Reference

```typescript
const TN_CONSTANTS = {
  MARGIN_EPISTEMIC: 0.02,
  H_MIN: 0.5,
  PHI_VARIANCE_MAX: 0.1,
  CYCLE_WINDOW: 5,
  CYCLE_DISTANCE_THRESHOLD: 0.2,
  LAMBDA: 0.3,
  MU: 0.2,
  COST_ALPHA: 0.4,
  COST_BETA: 0.2,
  COST_GAMMA: 0.15,
  COST_DELTA: 0.15,
  COST_LAMBDA: 0.1,
  REGIME_BONUS_EXACT: -0.55,
  REGIME_PENALTY_MISMATCH: 0.25,
  WEIGHT_EXPLORATION: 0.12,
  EXPLORATION_RATE: 0.05,
  LOOKBACK_WINDOW: 50,
  MAX_LAG: 20,
  FFT_SIZE: 64,
};
```

---

*End of Computational Architecture*
