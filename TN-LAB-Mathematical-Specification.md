# TN-LAB Mathematical Specification

**Version:** 5.3 (Audited)  
**Date:** 2026-03-06  
**Status:** Formalized

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Domain Definition](#2-domain-definition)
3. [Market State Space](#3-market-state-space)
4. [The Γ Operator (Memory Compression)](#4-the-γ-operator-memory-compression)
5. [Theory Space](#5-theory-space)
6. [The GEI Operator (Epistemic Selection)](#6-the-gei-operator-epistemic-selection)
7. [The Φ Operator (Decidability)](#7-the-φ-operator-decidability)
8. [Action Policy](#8-action-policy)
9. [Invariants](#9-invariants)
10. [Mathematical Summary](#10-mathematical-summary)

---

## 1. Introduction

TN-LAB (Tortuga Ninja Laboratory) is a computational framework for studying market structure through the lens of algorithmic theory selection. The system treats markets as dynamical systems that can be explained by different theoretical models ("theories"), and it uses information-theoretic measures to quantify how well a theory explains market behavior.

The mathematical foundation rests on three pillars:

1. **Market Representation**: Compress raw price data into sufficient statistics
2. **Theory Evaluation**: Score how well each theory explains the current market state
3. **Decidability Measure (Φ)**: Quantify the structural predictability of the market

---

## 2. Domain Definition

### 2.1 Market as Mathematical Object

A market is formally defined as a tuple:

```
Market = (S, T)
```

Where:

- **S = {H_t}**: The space of feature windows (sufficient statistics)
- **T = {τ}**: The space of admissible transformations

### 2.2 Admissible Transformations

The transformations τ: H → H' represent the symmetries and invariants of the market domain:

| Transformation | Description |
|----------------|-------------|
| Time shift | τ(H, δ) = H_{t+δ} |
| Resampling | τ(H, r) = H with new sampling rate r |
| Normalization | τ(H) = (H - μ) / σ |
| Statistical noise | τ(H, ε) = H + ε, where ε ~ N(0, ε²) |

---

## 3. Market State Space

### 3.1 Feature Vector H_t

The market state is captured in a feature vector:

```
H_t = (mean, variance, skew, kurtosis, hurst, autocorr[1:20], spectrum, regime)
```

**Formal Space Definition:**

```
H ⊂ ℝ^58 × {0,1,2,3}
dim(H) = 58 + 1 = 59 dimensions total
```

The dimension breakdown is:
- ℝ^58: continuous features (mean, variance, skew, kurtosis, hurst, autocorr[1:20], spectrum[1:33])
- {0,1,2,3}: categorical regime variable

| Component | Type | Description | Dimension |
|-----------|------|-------------|----------|
| mean | ℝ | Mean of log returns | 1 |
| variance | ℝ₊ | Variance of log returns | 1 |
| skew | ℝ | Skewness of returns distribution | 1 |
| kurtosis | ℝ | Excess kurtosis | 1 |
| hurst | [0,1] | Hurst exponent (R/S analysis) | 1 |
| autocorr | ℝ²⁰ | Autocorrelation at lags 1-20 | 20 |
| spectrum | ℝ³³ | Spectral density (FFT, 33 bins) | 33 |
| regime | {0,1,2,3} | Market regime classification | 1 (categorical) |

### 3.2 Regime Classification

The regime function R: H → {0,1,2,3} classifies markets:

```
R(H) =
  0 (ranging)  if hurst < 0.45 AND variance < 5×10⁻¹⁰
  1 (trending) if hurst > 0.55 AND variance < 1×10⁻⁹
  2 (volatile) if variance > 1×10⁻⁹
  3 (mixed)    otherwise
```

---

## 4. The Γ Operator (Memory Compression)

### 4.1 Definition

The Γ operator compresses raw price history into sufficient statistics:

```
Γ: ℝ^t → H
H_t = Γ(X_0:t)
```

**Formal Domain and Codomain:**

```
Γ: ℝ^t → ℝ^k

where:
k = dim(H) = 1 + 1 + 1 + 1 + 1 + 20 + 33 + 1 = 58

H_t ∈ ℝ^k × {0,1,2,3}
```

The dimension breakdown is:
- 1: mean
- 1: variance
- 1: skew
- 1: kurtosis
- 1: hurst
- 20: autocorr[1:20]
- 33: spectrum[1:33]
- 1: regime (categorical, encoded as integer)

### 4.2 Implementation

The operator computes:

1. **Returns**: r_t = log(X_t / X_{t-1})
2. **Classical Statistics**: mean, variance, skew, kurtosis
3. **Hurst Exponent**: Via R/S analysis
4. **Autocorrelation**: ACF at lags 1-20
5. **Spectral Density**: Via FFT (Cooley-Tukey algorithm)
6. **Regime**: Classification via R(H)

### 4.3 Determinism (Invariant I₂)

Γ is **deterministic**: same input always produces same output.

```
∀X, ∀t: Γ(X_0:t) = H_t  (deterministic function)
```

---

## 5. Theory Space

### 5.1 Theory Definition

A theory T_i is a function that generates predictions:

```
T_i: H × X_{t-L:t} → ℝ
```

**Output Semantics:** The output represents the **predicted price change**:

```
ŷ = T_i(H, X_{t-L:t}) = ΔX_{t+1}
```

Where ΔX_{t+1} = X_{t+1} - X_t is the expected price movement.

**Alternative Output Forms (for reference):**
- r_{t+1}: log return prediction
- P(sign): probability of positive/negative move
- signal ∈ {-1, 0, 1}: discrete trading signal

The current implementation uses ΔX_{t+1} as the canonical output.

### 5.2 Theory Ensemble

TN-LAB implements 10 theories:

| ID | Theory | Functional Form | Complexity K(T_i) | Optimal Regime |
|----|--------|-----------------|-------------------|----------------|
| 0 | Random Walk | f(H,X) = X[-1] + ε | 1.0 | 3 (mixed) |
| 1 | Mean Reverting | f(H,X) = μ + α(μ - X[-1]) | 2.0 | 0 (ranging) |
| 2 | Trend Following | f(H,X) = X[-1] + β∇_trend | 2.5 | 1 (trending) |
| 3 | Momentum | f(H,X) = sign(momentum)·|X| | 3.0 | 1 (trending) |
| 4 | Volatility Breakout | f(H,X) = X[-1] + γ·ATR | 3.5 | 2 (volatile) |
| 5 | Regime Switch | f(H,X) = switch(regime) {...} | 5.0 | 3 (mixed) |
| 6 | Micro Trend | f(H,X) = X[-1] + δ∇_micro | 2.2 | 1 (trending) |
| 7 | Weak Mean Reversion | f(H,X) = μ + α_w(μ - X[-1]) | 2.3 | 0 (ranging) |
| 8 | Volatility Cluster | f(H,X) = X[-1] + σ·vol_factor | 3.8 | 2 (volatile) |
| 9 | Drift | f(H,X) = X[-1] + d·decay^m | 3.2 | 1 (trending) |

### 5.3 Theory Distance Metric

The distance between theories is:

```
d(T_i, T_j) = |E_i - E_j| + λ·|K_i - K_j| + μ·(1 - δ(regime_i, regime_j))
```

Where:
- E_i = prediction error of theory i
- K_i = Kolmogorov complexity of theory i
- λ = 0.3 (complexity weight)
- μ = 0.2 (regime weight)

### 5.4 Three Distinct Concepts

It is critical to distinguish between three concepts that are often conflated:

#### 5.4.1 Predictor (Theory as Function)

```
T_i: H × X_{t-L:t} → ŷ
```

The theory as a **predictor** generates forecasts. This is the functional form of the theory.

#### 5.4.2 Evaluation (Cost Function)

```
C(T_i, H): Theory × State → ℝ
```

The theory as an **evaluation** measures how well the theory explains the market state. This is a cost (lower is better).

#### 5.4.3 Selection (GEI Operator)

```
GEI: (T, H) → T*
GEI(T, H) = argmin_{T_i ∈ T} C(T_i, H)
```

The theory as **selection** chooses the optimal theory from the ensemble.

**Summary:**
| Concept | Symbol | Type | Purpose |
|---------|--------|------|---------|
| Predictor | T_i(H, X) | Function → ℝ | Generate prediction ŷ |
| Evaluation | C(T_i, H) | Function → ℝ | Score theory quality |
| Selection | GEI(T, H) | Operator → T* | Choose best theory |

---

## 6. The GEI Operator (Epistemic Selection)

### 6.1 Definition

GEI (Generalized Epistemic Index) selects the theory with minimum epistemic cost:

```
GEI: (T, H) → T
GEI(T, H) = argmin_{T_i ∈ T} C(T_i, H)
```

### 6.2 Cost Function

The cost function combines multiple components:

```
C(T_i, H) = α·E_pred + β·V_inst + γ·K + δ·U + λ·S - λ_X·X(T)
```

| Component | Weight | Description |
|-----------|--------|-------------|
| E_pred | α = 0.4 | Prediction error (relative to baseline) |
| V_inst | β = 0.2 | Instability (variance of recent errors) |
| K | γ = 0.15 | Kolmogorov complexity |
| U | δ = 0.15 | Uncertainty (variance/mean ratio) |
| S | λ = 0.1 | Switching penalty |
| X(T) | λ_X = 0.12 | Exploration bonus |

### 6.3 Regime Alignment

The cost function includes regime alignment bonuses/penalties:

```
if optimalRegime(T_i) == currentRegime(H):
    C(T_i, H) += REGIME_BONUS_EXACT  // -0.55
else if T_i == RandomWalk AND currentRegime != mixed:
    C(T_i, H) += REGIME_PENALTY_MISMATCH  // +0.25
```

### 6.4 Δ Operator (Theory Change Threshold)

Theory changes only occur when the improvement exceeds the epistemic margin:

**Informal Definition:**

```
Δ: change theory iff C(new) < C(current) - η
where η = MARGIN_EPISTEMIC = 0.02
```

**Formal Definition:**

```
Δ: T × T × ℝ → {0, 1}
Δ(T_current, T_candidate, η) =
    1 if C(T_candidate, H) < C(T_current, H) - η
    0 otherwise
```

Where:
- T_current ∈ T: Currently active theory
- T_candidate ∈ T: Candidate theory for switching
- η = 0.02: Epistemic margin (MARGIN_EPISTEMIC)
- Output 1: Switch theories
- Output 0: Maintain current theory

---

## 7. The Φ Operator (Decidability)

### 7.1 Formal Dependency

**Critical Note:** Φ is not a function of H alone. It depends on:

```
Φ = Φ(H, T)
```

Where:
- H ∈ H: Market state (sufficient statistics)
- T = {T_0, ..., T_9}: Theory ensemble

The dependence on T is often implicit because T is fixed for a given system, but formally Φ varies with the theory ensemble.

### 7.2 Three Equivalent Definitions

Φ can be computed in three equivalent ways:

#### Definition 1: Minimum Cost

```
Φ_min(H) = -min_i C(T_i, H)
```

Higher (less negative) minimum cost = higher Φ.

#### Definition 2: Information Gain

```
Φ_info(H) = 1 - E_pred / E_baseline
```

**Formal Definition of Baseline:**

The baseline model is the **Random Walk** (T_0):

```
E_baseline = E[|X_t - X_{t-1}|] = mean(|r_t|)
```

Where:
- **Baseline model**: T_0 (Random Walk) - predicts next price = current price
- **Error metric**: Mean Absolute Error (MAE)
- **Alternative metrics** (not used): MSE, RMSE, MAPE

**Explicit Form:**

```
E_pred = mean(|ΔX_actual - ΔX_predicted|)
E_baseline = mean(|ΔX_actual - 0|)  // Random Walk predicts ΔX = 0
```

#### Definition 3: Theory Distribution Entropy

```
Φ_entropy(H) = H(T) / H_max
```

Where H(T) is the Shannon entropy of theory selection probabilities.

### 7.2 Empirical Definition

In practice, Φ is computed as:

```
φ = 1 - E_pred / E_baseline
```

Properties:
- φ ∈ [0, 1]
- φ ≈ 1 → high predictability (structured market)
- φ ≈ 0 → low predictability (random walk)
- φ < 0 → theory performs worse than baseline (clamped to 0)

### 7.3 Interpretation

Φ measures **structural decidability**: how well the market's internal structure can be predicted using a formal theory.

```
Φ ∝ Signal-to-Noise Ratio

As demonstrated in Exp 16:
- Correlation corr(λ, Φ) = -0.8259 (strong negative)
- Φ at pure signal (λ=0) = 0.3003
- Φ at pure noise (λ=1) = 0.0061
```

---

## 8. Action Policy

### 8.1 Important Note: Outside Epistemological Core

**The policy Π does NOT belong to the mathematical core of TN-LAB.**

The **epistemological core** consists of:
- **Γ**: Memory compression operator
- **GEI**: Theory selection operator
- **Φ**: Decidability measure

These three operators define the *epistemological* framework: how markets are represented, theories are evaluated, and structural predictability is quantified.

The **policy Π** belongs to the **decision layer** (or trading layer), which is application-specific:
- It maps theoretical constructs to practical actions
- It can be replaced without affecting Γ, GEI, or Φ
- It is the interface between analysis and execution

### 8.2 Definition

The action policy Π maps theory + decidability to trading signals:

```
Π: (T_t, φ_t, θ_t) → A_t ∈ {-1, 0, 1}
```

### 8.2 Threshold Rule

```
if φ_t < θ_t:
    A_t = 0  // No action: insufficient confidence
else:
    A_t = signal_from(T_t)  // Follow theory direction
```

### 8.3 Adaptive Threshold

The threshold θ evolves over time:

```
θ_{t+1} = θ_t + α·(φ_t - θ_t)
```

where α = 0.1 (learning rate), θ ∈ [0.1, 0.9]

---

## 9. Invariants

TN-LAB maintains five invariants that ensure structural integrity:

| Invariant | Description | Formal Definition |
|-----------|-------------|------------------|
| I₁ | Φ stability | Var(φ_t \| H_t) < 0.1 |
| I₂ | Γ determinism | Γ is a deterministic function |
| I₃ | Φ range | 0 ≤ φ_t ≤ 1, ∀t |
| I₄ | Unique theory | Exactly one theory active at any time |
| I₅ | Theory diversity | H(T) > h_min, where h_min = 0.5 |

### 9.1 Invariant I₅: Entropy

The system must maintain theoretical diversity:

```
H(T) = -Σ p_i log(p_i) > h_min = 0.5
```

**Formal Definition of p_i:**

The probability distribution p_i over theories is derived from the **softmax** of the negative cost values:

```
p_i = softmax(-C(T_i, H))_i = exp(-C(T_i, H)) / Σ_j exp(-C(T_j, H))
```

This formulation ensures:
- p_i ∈ (0, 1)
- Σ_i p_i = 1
- Lower cost theories have higher probability

**Alternative derivations (for reference):**
- **Empirical frequency**: p_i = frequency of T_i activation in historical window
- **Bayesian**: p_i = P(T_i | H) using prior P(T_i)
- **Historical frequency**: p_i = count(T_i selected) / total selections

The current implementation uses **softmax of costs** as the canonical derivation.

---

## 10. Mathematical Summary

### 10.1 Core Equations

**Epistemological Core (Γ, GEI, Φ):**

| Equation | Description |
|----------|-------------|
| H_t = Γ(X_{0:t}) | Memory compression |
| R(H) ∈ {0,1,2,3} | Regime detection |
| C(T_i, H) | Theory cost function |
| T* = GEI(T, H) | Theory selection |
| φ = 1 - E_pred/E_baseline | Decidability |
| H(T) = -Σ p_i log(p_i) | Theory entropy |

**Decision Layer (Π - Outside Core):**

| Equation | Description |
|----------|-------------|
| A_t = Π(T_t, φ_t, θ_t) | Action policy (application-specific) |

### 10.2 Constants

| Constant | Value | Description |
|----------|-------|-------------|
| MARGIN_EPISTEMIC | 0.02 | Theory change threshold |
| H_MIN | 0.5 | Minimum entropy |
| PHI_VARIANCE_MAX | 0.1 | Maximum Φ variance |
| CYCLE_WINDOW | 5 | Cycle detection window |
| CYCLE_DISTANCE_THRESHOLD | 0.2 | Cycle distance threshold |
| LAMBDA | 0.3 | Complexity weight |
| MU | 0.2 | Regime weight |
| COST_ALPHA | 0.4 | Prediction error weight |
| COST_BETA | 0.2 | Instability weight |
| COST_GAMMA | 0.15 | Complexity weight |
| COST_DELTA | 0.15 | Uncertainty weight |
| COST_LAMBDA | 0.1 | Switching penalty |

### 10.3 System Properties

The TN-LAB system has been validated to possess the following properties:

1. **Determinism**: Γ is a deterministic function (I₂)
2. **Boundedness**: φ ∈ [0, 1] (I₃)
3. **Stability**: Var(φ) < 0.1 in >90% of windows (I₁)
4. **Regime Coherence**: GEI selects regime-appropriate theories (>75%)
5. **Structure Sensitivity**: Φ ∝ Signal-to-Noise Ratio (Exp 16)
6. **Predictive Correlation**: Φ correlates with prediction quality (Exp 13)
7. **Noise Robustness**: Φ → 0 in pure noise (Exp 6)

---

## Appendix A: References

- **Exp 1**: Regime Detection Validation
- **Exp 2**: GEI Coherence
- **Exp 3**: Φ Stability (I₁)
- **Exp 4**: Trajectory Analysis
- **Exp 5**: Invariants Validation
- **Exp 6**: Noise Robustness
- **Exp 7**: Theory Activation
- **Exp 8**: Geometry of H-Space
- **Exp 9**: Structural Stability
- **Exp 10**: Fractal Dimension
- **Exp 11**: Theory Landscape Geometry
- **Exp 12**: Theory Dynamics (Markov)
- **Exp 13**: Φ vs Predictive Power
- **Exp 14**: Φ vs Generator Complexity
- **Exp 15**: Φ vs Theory Ensemble Entropy
- **Exp 16**: Φ vs Noise Level (Noise Dilution Test)

---

*End of Mathematical Specification*
