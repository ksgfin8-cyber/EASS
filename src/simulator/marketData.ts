/**
 * TN-LAB Simulator — Synthetic Market Data Generator
 * Sistema TN (Tortuga Ninja) v3.0
 *
 * Generates synthetic price series with controlled regimes for experiments.
 *
 * Regime definitions:
 * 0 = ranging:  AR(1) with high mean-reversion (Hurst < 0.4, variance < 0.1)
 * 1 = trending: Random walk with drift (Hurst > 0.6, variance < 0.5)
 * 2 = volatile: GARCH-like with high variance (variance > 0.5)
 * 3 = mixed:    Combination of the above
 *
 * All generators are DETERMINISTIC given a seed.
 * This guarantees reproducibility (Invariant I₂).
 *
 * NO React, NO browser APIs. Pure TypeScript math.
 */

// =============================================================================
// PSEUDO-RANDOM NUMBER GENERATOR (Deterministic)
// =============================================================================

/**
 * Simple LCG (Linear Congruential Generator) for deterministic randomness.
 * Produces values in [0, 1).
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0; // Ensure 32-bit unsigned
  }

  /** Next value in [0, 1) */
  next(): number {
    // LCG parameters from Numerical Recipes
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  /** Normal distribution via Box-Muller transform */
  nextNormal(mean: number = 0, std: number = 1): number {
    const u1 = this.next() + 1e-10;
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
  }

  /** Uniform in [min, max] */
  nextUniform(min: number = 0, max: number = 1): number {
    return min + this.next() * (max - min);
  }
}

// =============================================================================
// REGIME SEGMENT GENERATORS
// =============================================================================

/**
 * Generate a RANGING price series.
 * Ornstein-Uhlenbeck process: X_t = μ + α(μ - X_{t-1}) + ε
 * Strong mean reversion → Hurst < 0.4
 *
 * Target: Hurst < 0.45, variance < 1e-6
 *
 * Key: Use NEGATIVE autocorrelation (α > 0.5) to force anti-persistence.
 * The OU process with high α produces alternating up/down moves → Hurst < 0.5.
 */
export function generateRangingSegment(
  length: number,
  startPrice: number,
  rng: SeededRNG,
  params: {
    mean?: number;
    alpha?: number;  // Mean reversion speed [0,1], higher = faster reversion
    sigma?: number;  // Noise level
  } = {}
): number[] {
  const mu = params.mean ?? startPrice;
  const alpha = params.alpha ?? 0.7; // Strong mean reversion (OU speed)
  const sigma = params.sigma ?? 0.001; // Low noise

  const prices: number[] = [startPrice];

  for (let i = 1; i < length; i++) {
    const prev = prices[i - 1];
    const noise = rng.nextNormal(0, sigma);
    // OU: X_t = X_{t-1} + α(μ - X_{t-1}) + ε
    // This creates strong mean reversion → negative autocorrelation → Hurst < 0.5
    const next = prev + alpha * (mu - prev) + noise;
    prices.push(Math.max(0.001, next)); // Prevent negative prices
  }

  return prices;
}

/**
 * Generate a TRENDING price series.
 * Uses momentum-reinforced random walk to produce high Hurst exponent.
 * X_t = X_{t-1} + momentum_t + ε
 * momentum_t = β * momentum_{t-1} + (1-β) * ε_t
 *
 * This creates persistent moves → Hurst > 0.6
 *
 * Target: Hurst > 0.55, variance < 1e-6
 */
export function generateTrendingSegment(
  length: number,
  startPrice: number,
  rng: SeededRNG,
  params: {
    drift?: number;  // Per-tick drift (positive = uptrend)
    sigma?: number;  // Noise level
    momentum?: number; // Momentum persistence [0,1]
  } = {}
): number[] {
  const drift = params.drift ?? 0.0005; // Small positive drift
  const sigma = params.sigma ?? 0.001;  // Low noise
  const beta = params.momentum ?? 0.8;  // High momentum persistence

  const prices: number[] = [startPrice];
  let momentumVal = drift;

  for (let i = 1; i < length; i++) {
    const prev = prices[i - 1];
    const noise = rng.nextNormal(0, sigma);
    // Momentum-reinforced: current move = β * previous move + noise
    momentumVal = beta * momentumVal + (1 - beta) * noise + drift;
    const next = prev + momentumVal;
    prices.push(Math.max(0.001, next));
  }

  return prices;
}

/**
 * Generate a VOLATILE price series.
 * Uses clustered volatility with moderate scale.
 * Variance alternates between high and low periods.
 *
 * Target: variance > 1e-5 (in log returns), Hurst < 0.5
 */
export function generateVolatileSegment(
  length: number,
  startPrice: number,
  rng: SeededRNG,
  params: {
    sigmaLow?: number;   // Low volatility level
    sigmaHigh?: number;  // High volatility level
    switchProb?: number; // Probability of switching volatility regime
    scale?: number;      // Overall scale multiplier
  } = {}
): number[] {
  const sigmaLow = params.sigmaLow ?? 0.002;
  const sigmaHigh = params.sigmaHigh ?? 0.008;
  const switchProb = params.switchProb ?? 0.05;
  const scale = params.scale ?? 1.0;

  const prices: number[] = [startPrice];
  let currentSigma = sigmaHigh; // Start in high volatility

  for (let i = 1; i < length; i++) {
    const prev = prices[i - 1];

    // Switch volatility regime randomly
    if (rng.next() < switchProb) {
      currentSigma = currentSigma === sigmaLow ? sigmaHigh : sigmaLow;
    }

    const noise = rng.nextNormal(0, currentSigma * scale);
    const next = prev + noise;
    prices.push(Math.max(0.001, next));
  }

  return prices;
}

/**
 * Generate a MIXED price series.
 * Combination of regimes with smooth transitions.
 *
 * Target: Hurst ≈ 0.5, moderate variance
 */
export function generateMixedSegment(
  length: number,
  startPrice: number,
  rng: SeededRNG
): number[] {
  // Alternate between short ranging and trending sub-segments
  const prices: number[] = [startPrice];
  let currentPrice = startPrice;
  let pos = 0;

  while (pos < length - 1) {
    const segmentLength = Math.floor(rng.nextUniform(20, 60));
    const remaining = length - 1 - pos;
    const actualLength = Math.min(segmentLength, remaining) + 1;

    const regimeChoice = rng.next();
    let segment: number[];

    if (regimeChoice < 0.4) {
      segment = generateRangingSegment(actualLength, currentPrice, rng);
    } else if (regimeChoice < 0.7) {
      const drift = rng.nextUniform(-0.002, 0.002);
      segment = generateTrendingSegment(actualLength, currentPrice, rng, { drift });
    } else {
      segment = generateVolatileSegment(actualLength, currentPrice, rng, { scale: 1.5 });
    }

    // Append (skip first element to avoid duplicates)
    for (let i = 1; i < segment.length; i++) {
      prices.push(segment[i]);
    }

    currentPrice = prices[prices.length - 1];
    pos += actualLength - 1;
  }

  return prices.slice(0, length);
}

// =============================================================================
// MULTI-REGIME SERIES (Experiment 1 format)
// =============================================================================

export interface RegimeSegment {
  startTick: number;
  endTick: number;
  regime: number;
  label: string;
}

export interface SyntheticMarket {
  prices: number[];
  regimeLabels: number[];  // Ground truth regime per tick
  segments: RegimeSegment[];
  seed: number;
}

/**
 * Generate a multi-regime price series with temporal segments.
 * Format per Director's Experiment 1 adjustment:
 *
 * 0–500:    ranging
 * 500–1000: trending
 * 1000–1500: volatile
 * 1500–2000: ranging (return)
 *
 * This allows validation of regime TRANSITIONS, not just static classification.
 */
export function generateMultiRegimeSeries(
  seed: number = 42,
  segmentLength: number = 500
): SyntheticMarket {
  const rng = new SeededRNG(seed);
  const startPrice = 100.0;

  const segments: RegimeSegment[] = [
    { startTick: 0, endTick: segmentLength, regime: 0, label: 'ranging' },
    { startTick: segmentLength, endTick: 2 * segmentLength, regime: 1, label: 'trending' },
    { startTick: 2 * segmentLength, endTick: 3 * segmentLength, regime: 2, label: 'volatile' },
    { startTick: 3 * segmentLength, endTick: 4 * segmentLength, regime: 0, label: 'ranging' },
  ];

  const allPrices: number[] = [];
  const regimeLabels: number[] = [];

  let currentPrice = startPrice;

  for (const seg of segments) {
    let segPrices: number[];

    switch (seg.regime) {
      case 0:
        segPrices = generateRangingSegment(segmentLength + 1, currentPrice, rng);
        break;
      case 1:
        segPrices = generateTrendingSegment(segmentLength + 1, currentPrice, rng);
        break;
      case 2:
        segPrices = generateVolatileSegment(segmentLength + 1, currentPrice, rng);
        break;
      default:
        segPrices = generateMixedSegment(segmentLength + 1, currentPrice, rng);
    }

    // Append (skip first element except for first segment)
    const startIdx = allPrices.length === 0 ? 0 : 1;
    for (let i = startIdx; i < segPrices.length; i++) {
      allPrices.push(segPrices[i]);
      regimeLabels.push(seg.regime);
    }

    currentPrice = allPrices[allPrices.length - 1];
  }

  return { prices: allPrices, regimeLabels, segments, seed };
}

/**
 * Generate a pure random walk (Experiment 6: robustness to noise).
 * No structure — φ should be ≈ 0, GEI should not converge strongly.
 */
export function generateRandomWalk(
  length: number,
  startPrice: number = 100.0,
  seed: number = 42,
  sigma: number = 0.005
): SyntheticMarket {
  const rng = new SeededRNG(seed);
  const prices: number[] = [startPrice];
  const regimeLabels: number[] = [3]; // mixed/random

  for (let i = 1; i < length; i++) {
    const prev = prices[i - 1];
    const noise = rng.nextNormal(0, sigma);
    prices.push(Math.max(0.001, prev + noise));
    regimeLabels.push(3);
  }

  return {
    prices,
    regimeLabels,
    segments: [{ startTick: 0, endTick: length, regime: 3, label: 'random_walk' }],
    seed,
  };
}

/**
 * Generate a long mixed series for Experiment 5 (invariants).
 * 5000 ticks with realistic regime changes.
 */
export function generateLongMixedSeries(
  seed: number = 42,
  totalLength: number = 5000
): SyntheticMarket {
  const rng = new SeededRNG(seed);
  const startPrice = 100.0;

  const prices: number[] = [startPrice];
  const regimeLabels: number[] = [3];
  const segments: RegimeSegment[] = [];

  let currentPrice = startPrice;
  let tick = 0;

  while (tick < totalLength - 1) {
    // Random segment length between 100 and 400 ticks
    const segLength = Math.floor(rng.nextUniform(100, 400));
    const actualLength = Math.min(segLength, totalLength - 1 - tick);
    if (actualLength < 10) break;

    // Random regime
    const regimeRoll = rng.next();
    let regime: number;
    if (regimeRoll < 0.3) regime = 0;       // 30% ranging
    else if (regimeRoll < 0.6) regime = 1;  // 30% trending
    else if (regimeRoll < 0.75) regime = 2; // 15% volatile
    else regime = 3;                         // 25% mixed

    segments.push({
      startTick: tick,
      endTick: tick + actualLength,
      regime,
      label: ['ranging', 'trending', 'volatile', 'mixed'][regime],
    });

    let segPrices: number[];
    switch (regime) {
      case 0: segPrices = generateRangingSegment(actualLength + 1, currentPrice, rng); break;
      case 1: segPrices = generateTrendingSegment(actualLength + 1, currentPrice, rng); break;
      case 2: segPrices = generateVolatileSegment(actualLength + 1, currentPrice, rng); break;
      default: segPrices = generateMixedSegment(actualLength + 1, currentPrice, rng);
    }

    for (let i = 1; i < segPrices.length; i++) {
      prices.push(segPrices[i]);
      regimeLabels.push(regime);
    }

    currentPrice = prices[prices.length - 1];
    tick += actualLength;
  }

  return { prices, regimeLabels, segments, seed };
}
