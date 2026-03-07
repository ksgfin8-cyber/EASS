# TN-LAB: Complete Structural & Functional Audit Report

**Date:** 2026-03-07  
**Version:** TN-LAB v5.7 (CANONICAL)  
**Purpose:** Full topological map for archival and restructuring decisions  

---

## PHASE 1: COMPLETE REPOSITORY TREE

```
TN-LAB/
├── .gitignore
├── AGENTS.md                          # Agent rules & recipes
├── bun.lock
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── TN-LAB-AUDIT-REPORT.md            # Previous audit
├── TN-LAB-Computational-Architecture.md
├── TN-LAB-Mathematical-Specification.md
├── TN-LAB-REPORT.md                  # Main technical report
├── TN-LAB-Scientific-Results.md
├── TN-LAB-Technical-System-Map.md
├── tsconfig.json
├── .kilocode/                        # Memory bank & rules
│   └── rules/
│       └── memory-bank/
│           ├── architecture.md
│           ├── brief.md
│           ├── context.md            # Current scientific state
│           ├── product.md
│           └── tech.md
├── src/
│   ├── app/                          # Next.js web interface
│   │   ├── favicon.ico
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                 # EMPTY - minimal starter
│   ├── engine/                      # CORE TN-LAB ENGINE
│   │   ├── types.ts                 # Type definitions & constants
│   │   ├── gamma.ts                # Γ operator: ℝᵗ → H
│   │   ├── gei.ts                  # GEI: (T,H) → T
│   │   ├── phi.ts                  # Φ: decidability operator
│   │   ├── entropy.ts              # Entropy (Invariant I₅)
│   │   ├── theories.ts             # 10 theory families
│   │   ├── regime.ts              # Regime detection R: H → {0,1,2,3}
│   │   ├── distance.ts            # Theory distance & cycle detection
│   │   └── numeric.ts             # Numerical stability utilities
│   ├── experiments/                 # SCIENTIFIC EXPERIMENTS
│   │   ├── exp1_regime.ts         # Regime detection validation
│   │   ├── exp2_gei.ts           # GEI coherence validation
│   │   ├── exp3_phi.ts           # Φ stability validation
│   │   ├── exp4_trajectory.ts    # Theory trajectory analysis
│   │   ├── exp5_invariants.ts     # All invariants validation
│   │   ├── exp6_noise.ts         # Noise robustness
│   │   ├── exp7_activation.ts    # Theory activation validation
│   │   ├── exp8_geometry.ts      # H-space geometry
│   │   ├── exp9_stability.ts     # Structural stability
│   │   ├── exp10_fractal.ts      # Fractal dimension
│   │   ├── exp10_intrinsic_dimension.ts
│   │   ├── exp11_landscape.ts    # Theory landscape
│   │   ├── exp12_theory_dynamics.ts
│   │   ├── exp13_phi_predictability.ts
│   │   ├── exp14_generator_complexity.ts
│   │   ├── exp15_phi_entropy.ts
│   │   ├── exp16_noise_dilution.ts
│   │   ├── exp17_regimes.ts
│   │   ├── exp18_falsification.ts
│   │   ├── exp19_geometry.ts
│   │   ├── exp20_mutual_information.ts
│   │   ├── exp21_generalization.ts  # Out-of-sample validation
│   │   ├── exp22_persistence_diagnostics.ts
│   │   └── runAll.ts             # Experiment suite runner
│   └── simulator/                   # SIMULATION INFRASTRUCTURE
│       ├── backtest.ts           # Historical backtesting
│       ├── dataIngestion.ts      # Yahoo Finance integration
│       ├── marketData.ts         # Synthetic data generators
│       ├── metrics.ts            # H-space metrics & analysis
│       ├── runRealSimulation.ts  # Real market simulation
│       └── scientificSimulation.ts # Scientific simulation engine
```

---

## PHASE 2: FILE CLASSIFICATION

| File Path | Purpose | Category | Dependencies | Status |
|-----------|---------|----------|--------------|--------|
| `src/engine/types.ts` | Core type definitions, constants, TheoryID enum | CORE_ENGINE | None (foundational) | **ACTIVE CORE** |
| `src/engine/gamma.ts` | Γ: ℝᵗ → H compression (mean, variance, hurst, autocorr, spectrum, regime) | CORE_ENGINE | types, regime, numeric | **ACTIVE CORE** |
| `src/engine/gei.ts` | GEI: (T,H) → T epistemic selector with cost function | CORE_ENGINE | types, theories, distance, numeric | **ACTIVE CORE** |
| `src/engine/phi.ts` | Φ: decidability operator φ = 1 - E_pred/E_baseline | CORE_ENGINE | types, theories | **ACTIVE CORE** |
| `src/engine/entropy.ts` | Entropy H(T) for Invariant I₅ | CORE_ENGINE | types | **ACTIVE CORE** |
| `src/engine/theories.ts` | 10 theory families (T₀-T₉) with prediction functions | THEORY_DEFINITION | types, numeric | **ACTIVE CORE** |
| `src/engine/regime.ts` | Regime detection R: H → {0,1,2,3} | CORE_ENGINE | types | **ACTIVE CORE** |
| `src/engine/distance.ts` | Theory distance metric & cycle detection | CORE_ENGINE | types | **ACTIVE CORE** |
| `src/engine/numeric.ts` | Numerical stability guards (NaN, epsilon protection) | UTILITY | None | **ACTIVE CORE** |
| `src/simulator/scientificSimulation.ts` | Main simulation engine for TN-LAB | SIMULATION_ENGINE | engine/*, dataIngestion | **ACTIVE INFRA** |
| `src/simulator/dataIngestion.ts` | Yahoo Finance API client, asset presets | DATA_PIPELINE | None | **ACTIVE INFRA** |
| `src/simulator/marketData.ts` | Synthetic data generators (ranging, trending, volatile, mixed) | DATA_PIPELINE | None | **ACTIVE INFRA** |
| `src/simulator/metrics.ts` | H-space metrics (PCA, intrinsic dimension, clustering) | STATISTICAL_MODEL | None | **ACTIVE INFRA** |
| `src/simulator/backtest.ts` | Historical backtesting pipeline | SIMULATION_ENGINE | None | **ACTIVE INFRA** |
| `src/simulator/runRealSimulation.ts` | Real market simulation runner | SIMULATION_ENGINE | None | **ACTIVE INFRA** |
| `src/experiments/exp1_regime.ts` | Regime detection accuracy (92.5%) | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp2_gei.ts` | GEI coherence (75%) | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp3_phi.ts` | Φ stability (100% I₁) | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp4_trajectory.ts` | Theory trajectory analysis | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp5_invariants.ts` | All invariants (87.5% I₅) | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp6_noise.ts` | Noise robustness (φ→0) | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp7_activation.ts` | Theory activation (VolCluster 95.8%) | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp8_geometry.ts` | H-space geometry analysis | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp9_stability.ts` | Structural stability | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp10_*.ts` | Fractal & intrinsic dimension | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp11_landscape.ts` | Theory landscape | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp12_theory_dynamics.ts` | Markov chain dynamics | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp13_phi_predictability.ts` | Φ predictability correlation | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp14_generator_complexity.ts` | Generator complexity detection | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp15_phi_entropy.ts` | Φ vs entropy independence | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp16_noise_dilution.ts` | Noise dilution (SNR = 42.59x) | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp17_regimes.ts` | Market regimes analysis | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp18_falsification.ts` | Falsification test | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp19_geometry.ts` | H-space geometry | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp20_mutual_information.ts` | Mutual information (Φ≠predictive) | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp21_generalization.ts` | Out-of-sample generalization | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/exp22_persistence_diagnostics.ts` | Persistence root cause analysis | EXPERIMENT | engine/*, simulator/* | **VALIDATED** |
| `src/experiments/runAll.ts` | Experiment suite runner | EXPERIMENT | All experiments | **VALIDATED** |
| `src/app/page.tsx` | Empty Next.js page | WEB_INTERFACE | Next.js | **STUB** |
| `src/app/layout.tsx` | Next.js root layout | WEB_INTERFACE | Next.js | **STUB** |
| `TN-LAB-REPORT.md` | Main technical documentation | DOCUMENTATION | - | **ARCHIVE** |
| `TN-LAB-Scientific-Results.md` | Scientific findings | DOCUMENTATION | - | **ARCHIVE** |
| `TN-LAB-Mathematical-Specification.md` | Math specification | DOCUMENTATION | - | **ARCHIVE** |
| `TN-LAB-Computational-Architecture.md` | Architecture docs | DOCUMENTATION | - | **ARCHIVE** |
| `TN-LAB-Technical-System-Map.md` | System map | DOCUMENTATION | - | **ARCHIVE** |
| `TN-LAB-AUDIT-REPORT.md` | Previous audit | DOCUMENTATION | - | **ARCHIVE** |
| `package.json` | Dependencies (Next.js, React) | CONFIGURATION | - | **ACTIVE** |
| `tsconfig.json` | TypeScript config | CONFIGURATION | - | **ACTIVE** |
| `eslint.config.mjs` | ESLint config | CONFIGURATION | - | **ACTIVE** |
| `.kilocode/rules/memory-bank/context.md` | Current scientific context | DOCUMENTATION | - | **ACTIVE** |

---

## PHASE 3: CORE SYSTEM IDENTIFICATION

### 3.1 Γ State Computation

| File | Function | Description |
|------|----------|-------------|
| [`src/engine/gamma.ts`](src/engine/gamma.ts:35) | `computeStats(prices: number[])` | Main Γ operator |
| [`src/engine/gamma.ts`](src/engine/gamma.ts:100) | `computeReturns()` | Log returns |
| [`src/engine/gamma.ts`](src/engine/gamma.ts:163) | `computeHurstRS()` | Hurst exponent via R/S |
| [`src/engine/gamma.ts`](src/engine/gamma.ts:270) | `computeAutocorrelation()` | ACF lags 1-20 |
| [`src/engine/gamma.ts`](src/engine/gamma.ts:307) | `computeSpectralDensity()` | FFT spectral analysis |
| [`src/engine/gamma.ts`](src/engine/gamma.ts:352) | `fft()` | Cooley-Tukey FFT |

**Output:** `SufficientStats` (H ⊂ ℝ^58 × {0,1,2,3})

### 3.2 GEI Theory Selection

| File | Function | Description |
|------|----------|-------------|
| [`src/engine/gei.ts`](src/engine/gei.ts:66) | `gei(stats, prices, currentTheory, ...)` | Main GEI operator |
| [`src/engine/gei.ts`](src/engine/gei.ts:160) | `evaluateTheory()` | Cost function C(T_i, H) |
| [`src/engine/gei.ts`](src/engine/gei.ts:293) | `computeBaselineErrorForGEI()` | Random walk baseline |
| [`src/engine/gei.ts`](src/engine/gei.ts:317) | `computeInstability()` | V_inst component |
| [`src/engine/gei.ts`](src/engine/gei.ts:364) | `computeExplorationBonus()` | X(T) exploration incentive |
| [`src/engine/gei.ts`](src/engine/gei.ts:407) | `updateAdaptiveTheta()` | Adaptive threshold |

**Cost Function:** `C = α·E_pred + β·V_inst + γ·K + δ·U + λ·S - λ_X·X(T)`

### 3.3 Theory Definitions

| File | Theory IDs | Description |
|------|-----------|-------------|
| [`src/engine/theories.ts`](src/engine/theories.ts:22) | `THEORY_FAMILIES` | Array of 10 theory descriptors |
| [`src/engine/theories.ts`](src/engine/theories.ts:106) | `predictRandomWalk()` | T₀: Random Walk |
| [`src/engine/theories.ts`](src/engine/theories.ts:125) | `predictMeanReverting()` | T₁: Mean Reverting |
| [`src/engine/theories.ts`](src/engine/theories.ts:141) | `predictTrendFollowing()` | T₂: Trend Following |
| [`src/engine/theories.ts`](src/engine/theories.ts:156) | `predictMomentum()` | T₃: Momentum |
| [`src/engine/theories.ts`](src/engine/theories.ts:178) | `predictVolBreakout()` | T₄: Volatility Breakout |
| [`src/engine/theories.ts`](src/engine/theories.ts:199) | `predictRegimeSwitch()` | T₅: Regime Switch |
| [`src/engine/theories.ts`](src/engine/theories.ts:220) | `predictMicroTrend()` | T₆: Micro Trend |
| [`src/engine/theories.ts`](src/engine/theories.ts:241) | `predictWeakMeanReversion()` | T₇: Weak Mean Reversion |
| [`src/engine/theories.ts`](src/engine/theories.ts:267) | `predictVolatilityCluster()` | T₈: Volatility Cluster |
| [`src/engine/theories.ts`](src/engine/theories.ts:299) | `predictDrift()` | T₉: Drift |

### 3.4 Market Data Ingestion

| File | Function | Description |
|------|----------|-------------|
| [`src/simulator/dataIngestion.ts`](src/simulator/dataIngestion.ts:285) | `ingestAsset()` | Fetch from Yahoo Finance |
| [`src/simulator/dataIngestion.ts`](src/simulator/dataIngestion.ts:365) | `ingestMultipleAssets()` | Batch ingestion |
| [`src/simulator/dataIngestion.ts`](src/simulator/dataIngestion.ts:411) | `ingestPreset()` | Preset asset lists |
| [`src/simulator/dataIngestion.ts`](src/simulator/dataIngestion.ts:435) | `validateAndCleanData()` | Data validation |

**Asset Presets:** US_EQUITIES, CRYPTO, FOREX, INDICES, COMMODITIES, DIVERSIFIED, TECH

### 3.5 Simulation Engines

| File | Function | Description |
|------|----------|-------------|
| [`src/simulator/scientificSimulation.ts`](src/simulator/scientificSimulation.ts:252) | `runScientificSimulation()` | Main simulation runner |
| [`src/simulator/marketData.ts`](src/simulator/marketData.ts) | Synthetic generators | ranging, trending, volatile, mixed |
| [`src/simulator/metrics.ts`](src/simulator/metrics.ts) | H-space analysis | PCA, intrinsic dimension |

### 3.6 Experiment Framework

| File | Purpose |
|------|---------|
| [`src/experiments/runAll.ts`](src/experiments/runAll.ts) | Execute all experiments |
| [`src/experiments/exp1_regime.ts`](src/experiments/exp1_regime.ts) → [`exp22_persistence_diagnostics.ts`](src/experiments/exp22_persistence_diagnostics.ts) | Individual experiment runners |

---

## PHASE 4: EXPERIMENTAL LAB ANALYSIS

| Experiment | Purpose | Status | Recommendation |
|------------|---------|--------|-----------------|
| Exp1: Regime Detection | Validate R: H → {0,1,2,3} | ✅ VALIDATED (92.5%) | **KEEP** |
| Exp2: GEI Coherence | GEI selects regime-appropriate theories | ✅ VALIDATED (75%) | **KEEP** |
| Exp3: Φ Stability | Invariant I₁: Var(φ) < 0.1 | ✅ VALIDATED (100%) | **KEEP** |
| Exp4: Trajectory | Theory transition analysis | ✅ VALIDATED | **KEEP** |
| Exp5: Invariants | All I₁-I₅ verification | ✅ VALIDATED (87.5%) | **KEEP** |
| Exp6: Noise | φ → 0 in pure noise | ✅ VALIDATED | **KEEP** |
| Exp7: Activation | Theory activation rates | ✅ VALIDATED | **KEEP** |
| Exp8: Geometry | H-space partition geometry | ✅ VALIDATED | **KEEP** |
| Exp9: Stability | Structural stability curve | ✅ VALIDATED | **KEEP** |
| Exp10: Fractal/Intrinsic | Fractal dimension | ✅ VALIDATED | **KEEP** |
| Exp11: Landscape | Theory landscape regions | ✅ VALIDATED | **KEEP** |
| Exp12: Theory Dynamics | Markov chain analysis | ✅ VALIDATED | **KEEP** |
| Exp13: Φ Predictability | Correlation analysis | ✅ VALIDATED | **KEEP** |
| Exp14: Generator Complexity | Random < Trend detection | ✅ VALIDATED | **KEEP** |
| Exp15: Φ vs Entropy | Independence validation | ✅ VALIDATED | **KEEP** |
| Exp16: Noise Dilution | SNR detection (42.59×) | ✅ VALIDATED | **KEEP** |
| Exp17: Market Regimes | Real regime analysis | ✅ VALIDATED | **KEEP** |
| Exp18: Falsification | Structure verification | ✅ VALIDATED | **KEEP** |
| Exp19: H-Space Geometry | PCA & intrinsic dim | ✅ VALIDATED | **KEEP** |
| Exp20: Mutual Information | Φ ≠ predictive proof | ✅ VALIDATED | **KEEP** |
| Exp21: Generalization | Out-of-sample validation | ✅ VALIDATED | **KEEP** |
| Exp22: Persistence Diagnostics | Root cause analysis (99.8% persistence) | ✅ COMPLETADO | **KEEP** |

**Summary:** All 22 experiments are validated and recommended to **KEEP**.

---

## PHASE 5: WEB / DASHBOARD CAPABILITY

### Current State: **MINIMAL STUB**

| File | Status | Description |
|------|--------|-------------|
| [`src/app/page.tsx`](src/app/page.tsx) | **EMPTY** | Returns `<main className="min-h-screen bg-neutral-900" />` |
| [`src/app/layout.tsx`](src/app/layout.tsx) | **STANDARD** | Next.js 16 default layout with Geist fonts |
| [`src/app/globals.css`](src/app/globals.css) | **TAILWIND** | Tailwind CSS 4 imports |

### Analysis:

**No web interface exists.** The Next.js app is a minimal starter template with:
- Empty home page
- Tailwind CSS 4 configured
- No TN-LAB components
- No API routes for simulation
- No dashboard for results visualization

### Integration Point Recommendation:

The best integration point in current architecture is **src/app/page.tsx**:

1. **Dashboard Home** (`src/app/page.tsx`): Overview metrics, recent experiments
2. **API Routes** (`src/app/api/`): Endpoints for running simulations
3. **Results Visualization**: Charts for Φ, theory transitions, regime detection
4. **Live Simulation**: WebSocket or polling for real-time simulation updates

**Recommended Architecture:**
```
src/app/
├── page.tsx              # Dashboard home
├── globals.css           # Tailwind + custom styles
├── layout.tsx           # Root layout
├── api/
│   ├── run-sim/         # POST: Run simulation
│   ├── experiments/     # GET: List/run experiments
│   └── results/         # GET: Fetch results
├── components/
│   ├── Dashboard.tsx   # Main dashboard
│   ├── PhiChart.tsx     # Φ time series
│   ├── TheoryMatrix.tsx # Theory transition matrix
│   └── RegimeMap.tsx    # H-space visualization
└── lib/
    └── tnlab-client.ts  # Client for API calls
```

---

## PHASE 6: DOCUMENTATION EXTRACTION

### Files with Conceptual/Theoretical Content:

| File | Content Type | Archival Value |
|------|-------------|----------------|
| `TN-LAB-REPORT.md` | Main technical report, system architecture | **HIGH** - Complete system description |
| `TN-LAB-Scientific-Results.md` | Experimental results summary | **HIGH** - Scientific findings |
| `TN-LAB-Mathematical-Specification.md` | Math formalization | **HIGH** - Theory foundation |
| `TN-LAB-Computational-Architecture.md` | Architecture decisions | **MEDIUM** - Implementation details |
| `TN-LAB-Technical-System-Map.md` | System topology | **MEDIUM** - Structure overview |
| `TN-LAB-AUDIT-REPORT.md` | Previous audit | **LOW** - Superseded by this audit |
| `.kilocode/rules/memory-bank/context.md` | Current scientific state | **HIGH** - Active context |

### Recommendation:

Archive to `docs/` directory:
- `docs/papers/` - Mathematical specifications, scientific results
- `docs/reports/` - Technical reports, audits
- `docs/api/` - Engine API documentation

---

## PHASE 7: FINAL TOPOLOGICAL REPORT

### 7.1 Repository Topology

```
TN-LAB/
├── CORE ENGINE (8 files)
│   ├── types.ts         - Type definitions, constants
│   ├── gamma.ts         - Memory compression
│   ├── gei.ts           - Theory selection
│   ├── phi.ts           - Decidability
│   ├── entropy.ts       - Invariant I₅
│   ├── theories.ts      - 10 theory families
│   ├── regime.ts        - Regime detection
│   └── distance.ts      - Cycle detection
│
├── SIMULATOR (6 files)
│   ├── scientificSimulation.ts - Main engine
│   ├── dataIngestion.ts       - Yahoo Finance
│   ├── marketData.ts          - Synthetic data
│   ├── metrics.ts             - H-space analysis
│   ├── backtest.ts            - Historical testing
│   └── runRealSimulation.ts   - Real market runner
│
├── EXPERIMENTS (23 files)
│   ├── exp1-7     - Core validation
│   ├── exp8-13    - Advanced analysis
│   ├── exp14-20   - Validation experiments
│   └── exp21-22   - Generalization & diagnostics
│
├── WEB (minimal stub)
│   └── src/app/   - Empty Next.js starter
│
└── DOCUMENTATION (7 files)
    └── TN-LAB-*.md, context.md
```

### 7.2 System Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    EXPERIMENT LAYER                      │
│         (22 experiments - validation & analysis)        │
├─────────────────────────────────────────────────────────┤
│                   SIMULATION LAYER                       │
│    (Scientific simulation, data ingestion, metrics)     │
├─────────────────────────────────────────────────────────┤
│                     CORE ENGINE                          │
│   Γ (gamma) → GEI (gei) → Φ (phi) → Entropy (entropy)  │
│                                                         │
│   Theories: T₀-T₉ (10 families)                        │
│   Regime: R: H → {0,1,2,3}                             │
├─────────────────────────────────────────────────────────┤
│                   FOUNDATIONAL LAYER                     │
│          (types, numeric stability, constants)          │
└─────────────────────────────────────────────────────────┘
```

### 7.3 Core Engine Components

| Component | File | Key Functions |
|-----------|------|---------------|
| **Γ Operator** | `gamma.ts` | `computeStats()`, `computeHurstRS()`, `computeSpectralDensity()`, `fft()` |
| **GEI Operator** | `gei.ts` | `gei()`, `evaluateTheory()`, `computeExplorationBonus()` |
| **Φ Operator** | `phi.ts` | `computePhi()`, `computeAction()` |
| **Entropy** | `entropy.ts` | `computeTheoryEntropy()` |
| **Theories** | `theories.ts` | 10 prediction functions |
| **Regime** | `regime.ts` | `detectRegime()` |
| **Distance** | `distance.ts` | `theoryDistance()`, `isCycleDetected()` |

### 7.4 Experimental Lab Components

- **22 validated experiments** covering core validation, advanced analysis, and diagnostics
- **Monte Carlo framework** (N ≥ 500 simulations)
- **Real market integration** (Yahoo Finance)
- **Synthetic data generators** (4 regime types)

### 7.5 Documentation Assets

| Document | Pages | Purpose |
|----------|-------|---------|
| TN-LAB-REPORT.md | ~450 | Complete system documentation |
| TN-LAB-Scientific-Results.md | ~200 | Experimental findings |
| TN-LAB-Mathematical-Specification.md | ~150 | Math formalization |
| Memory Bank Context | ~100 | Current scientific state |

### 7.6 Web Interface Status

**Status:** **ABSENT**  
**Infrastructure:** Next.js 16 + React 19 + Tailwind CSS 4 (configured but unused)  
**Integration Point:** `src/app/page.tsx` (empty)

### 7.7 Archiving Candidates

| Candidate | Reason | Action |
|-----------|--------|--------|
| `TN-LAB-AUDIT-REPORT.md` | Superseded by this audit | Archive to `docs/` |
| Documentation files (TN-LAB-*.md) | Could be archived | Move to `docs/` |
| `src/app/page.tsx` | Empty stub | Keep for future dashboard |
| Old experiment files | All validated | **KEEP** - all active |

---

## SUMMARY

| Category | Count | Status |
|----------|-------|--------|
| Core Engine Files | 8 | ✅ ACTIVE |
| Simulator Files | 6 | ✅ ACTIVE |
| Experiment Files | 23 | ✅ VALIDATED |
| Documentation | 7 | 📦 ARCHIVE CANDIDATES |
| Web Interface | 0 | ❌ ABSENT |
| Configuration | 5 | ✅ ACTIVE |

**Recommendation:** Archive documentation to `docs/` directory, implement web dashboard in `src/app/`, keep all engine and experiment files.
