/**
 * TN-LAB Engine — Γ Operator (Memory Compression)
 * Sistema TN (Tortuga Ninja) v3.0
 *
 * Γ: ℝᵗ → H
 * H_t = Γ(X_0:t) — compresses raw price history into sufficient statistics
 *
 * Implements:
 * - Classical statistics (mean, variance, skew, kurtosis)
 * - Hurst exponent via R/S Analysis
 * - Autocorrelation at lags 1..20
 * - Spectral density via FFT (Cooley-Tukey, no external dependencies)
 *
 * INVARIANT I₂: Γ is deterministic — same input always produces same output.
 *
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { SufficientStats, SpectralDensity, TN_CONSTANTS } from './types';
import { detectRegime } from './regime';

// =============================================================================
// MAIN Γ OPERATOR
// =============================================================================

/**
 * Γ: ℝᵗ → H
 * Compresses price history into sufficient statistics.
 * This is the core memory operator of the TN system.
 *
 * @param prices - Raw price series X_0:t
 * @returns SufficientStats H_t
 */
export function computeStats(prices: number[]): SufficientStats {
  if (prices.length < 4) {
    return createEmptyStats();
  }

  // Compute returns for statistical analysis
  const returns = computeReturns(prices);

  const mean = computeMean(returns);
  const variance = computeVariance(returns, mean);
  const skew = computeSkewness(returns, mean, variance);
  const kurtosis = computeKurtosis(returns, mean, variance);
  const hurst = computeHurstRS(prices);
  const autocorr = computeAutocorrelation(returns, TN_CONSTANTS.MAX_LAG);
  const spectrum = computeSpectralDensity(returns, TN_CONSTANTS.FFT_SIZE);

  // Build partial stats for regime detection
  const partialStats: Partial<SufficientStats> = {
    mean,
    variance,
    skew,
    kurtosis,
    hurst,
    autocorr,
    spectrum,
    sampleSize: prices.length,
    lastUpdate: new Date(),
  };

  // Detect regime (requires hurst + variance)
  const regime = detectRegime(partialStats as SufficientStats);

  return {
    mean,
    variance,
    skew,
    kurtosis,
    hurst,
    autocorr,
    spectrum,
    regime,
    sampleSize: prices.length,
    lastUpdate: new Date(),
  };
}

// =============================================================================
// CLASSICAL STATISTICS
// =============================================================================

/**
 * Compute log returns: r_t = log(X_t / X_{t-1})
 * Using log returns for stationarity.
 */
export function computeReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    } else {
      returns.push(prices[i] - prices[i - 1]);
    }
  }
  return returns;
}

export function computeMean(data: number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((sum, x) => sum + x, 0) / data.length;
}

export function computeVariance(data: number[], mean?: number): number {
  if (data.length < 2) return 0;
  const m = mean ?? computeMean(data);
  const sumSq = data.reduce((sum, x) => sum + (x - m) ** 2, 0);
  return sumSq / (data.length - 1); // Bessel's correction
}

export function computeSkewness(data: number[], mean?: number, variance?: number): number {
  if (data.length < 3) return 0;
  const m = mean ?? computeMean(data);
  const v = variance ?? computeVariance(data, m);
  const sigma = Math.sqrt(v);
  if (sigma < 1e-10) return 0;

  const n = data.length;
  const sumCubed = data.reduce((sum, x) => sum + ((x - m) / sigma) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * sumCubed;
}

export function computeKurtosis(data: number[], mean?: number, variance?: number): number {
  if (data.length < 4) return 0;
  const m = mean ?? computeMean(data);
  const v = variance ?? computeVariance(data, m);
  const sigma = Math.sqrt(v);
  if (sigma < 1e-10) return 0;

  const n = data.length;
  const sumFourth = data.reduce((sum, x) => sum + ((x - m) / sigma) ** 4, 0);
  // Excess kurtosis (normal = 0)
  return (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * sumFourth
    - 3 * (n - 1) ** 2 / ((n - 2) * (n - 3));
}

// =============================================================================
// HURST EXPONENT — R/S Analysis
// =============================================================================

/**
 * Compute Hurst exponent using Rescaled Range (R/S) Analysis.
 *
 * H ≈ 0.5 → random walk (no memory)
 * H > 0.5 → persistent (trending)
 * H < 0.5 → anti-persistent (mean-reverting)
 *
 * Method: Compute R/S for multiple sub-series lengths, fit log(R/S) ~ H·log(n)
 */
export function computeHurstRS(prices: number[]): number {
  const n = prices.length;
  if (n < 20) return 0.5; // Default: random walk

  // Use log returns for Hurst computation
  const returns = computeReturns(prices);
  const m = returns.length;

  if (m < 10) return 0.5;

  // Compute R/S for different window sizes
  const minWindow = 8;
  const maxWindow = Math.floor(m / 2);
  const steps = 8;

  const logN: number[] = [];
  const logRS: number[] = [];

  for (let step = 0; step < steps; step++) {
    const windowSize = Math.floor(
      minWindow * Math.pow(maxWindow / minWindow, step / (steps - 1))
    );
    if (windowSize < 4 || windowSize > m) continue;

    const rs = computeRS(returns, windowSize);
    if (rs > 0) {
      logN.push(Math.log(windowSize));
      logRS.push(Math.log(rs));
    }
  }

  if (logN.length < 3) return 0.5;

  // Linear regression: log(R/S) = H * log(n) + c
  const hurst = linearRegressionSlope(logN, logRS);

  // Clamp to reasonable range
  return Math.max(0.1, Math.min(0.9, hurst));
}

/**
 * Compute R/S statistic for a given window size.
 */
function computeRS(returns: number[], windowSize: number): number {
  const numWindows = Math.floor(returns.length / windowSize);
  if (numWindows < 1) return 0;

  let totalRS = 0;
  let count = 0;

  for (let w = 0; w < numWindows; w++) {
    const slice = returns.slice(w * windowSize, (w + 1) * windowSize);
    const mean = computeMean(slice);

    // Cumulative deviation from mean
    const cumDev: number[] = [];
    let cumSum = 0;
    for (const r of slice) {
      cumSum += r - mean;
      cumDev.push(cumSum);
    }

    // Range R = max - min of cumulative deviations
    const R = Math.max(...cumDev) - Math.min(...cumDev);

    // Standard deviation S
    const S = Math.sqrt(computeVariance(slice, mean));

    if (S > 1e-10) {
      totalRS += R / S;
      count++;
    }
  }

  return count > 0 ? totalRS / count : 0;
}

/**
 * Linear regression slope (OLS).
 */
function linearRegressionSlope(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0.5;

  const meanX = computeMean(x);
  const meanY = computeMean(y);

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (x[i] - meanX) * (y[i] - meanY);
    denominator += (x[i] - meanX) ** 2;
  }

  if (Math.abs(denominator) < 1e-10) return 0.5;
  return numerator / denominator;
}

// =============================================================================
// AUTOCORRELATION
// =============================================================================

/**
 * Compute autocorrelation at lags 1..maxLag.
 * ACF(lag) = Cov(r_t, r_{t-lag}) / Var(r_t)
 */
export function computeAutocorrelation(data: number[], maxLag: number): number[] {
  const n = data.length;
  const mean = computeMean(data);
  const variance = computeVariance(data, mean);

  if (variance < 1e-10) return new Array(maxLag).fill(0);

  const acf: number[] = [];

  for (let lag = 1; lag <= maxLag; lag++) {
    if (lag >= n) {
      acf.push(0);
      continue;
    }

    let cov = 0;
    const count = n - lag;
    for (let i = 0; i < count; i++) {
      cov += (data[i] - mean) * (data[i + lag] - mean);
    }
    cov /= count;

    acf.push(cov / variance);
  }

  return acf;
}

// =============================================================================
// SPECTRAL DENSITY — FFT (Cooley-Tukey, no external dependencies)
// =============================================================================

/**
 * Compute spectral density using FFT.
 * Applied to returns (not raw prices) for stationarity.
 * Uses Hanning window to reduce spectral leakage.
 */
export function computeSpectralDensity(
  returns: number[],
  fftSize: number = TN_CONSTANTS.FFT_SIZE
): SpectralDensity {
  // Pad or truncate to fftSize
  const windowed = applyHanningWindow(returns, fftSize);

  // Compute FFT
  const { real, imag } = fft(windowed);

  // Compute power spectrum (one-sided)
  const halfSize = Math.floor(fftSize / 2) + 1;
  const frequencies: number[] = [];
  const powers: number[] = [];

  for (let k = 0; k < halfSize; k++) {
    frequencies.push(k / fftSize); // Normalized frequency [0, 0.5]
    const power = (real[k] ** 2 + imag[k] ** 2) / fftSize;
    powers.push(k === 0 || k === halfSize - 1 ? power : 2 * power); // Double for one-sided
  }

  return { frequencies, powers, count: halfSize };
}

/**
 * Apply Hanning window to reduce spectral leakage.
 * Pads with zeros if data is shorter than fftSize.
 */
function applyHanningWindow(data: number[], fftSize: number): number[] {
  const result = new Array(fftSize).fill(0);
  const n = Math.min(data.length, fftSize);

  for (let i = 0; i < n; i++) {
    const window = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
    result[i] = data[i] * window;
  }

  return result;
}

/**
 * Cooley-Tukey FFT (radix-2, iterative).
 * Works on power-of-2 sizes.
 * Returns real and imaginary parts.
 */
function fft(signal: number[]): { real: number[]; imag: number[] } {
  const n = signal.length;

  // Ensure power of 2
  const size = nextPowerOf2(n);
  const real = new Array(size).fill(0);
  const imag = new Array(size).fill(0);

  for (let i = 0; i < n; i++) {
    real[i] = signal[i];
  }

  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // Cooley-Tukey butterfly
  for (let len = 2; len <= size; len <<= 1) {
    const angle = -2 * Math.PI / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);

    for (let i = 0; i < size; i += len) {
      let curReal = 1;
      let curImag = 0;

      for (let k = 0; k < len / 2; k++) {
        const uReal = real[i + k];
        const uImag = imag[i + k];
        const vReal = real[i + k + len / 2] * curReal - imag[i + k + len / 2] * curImag;
        const vImag = real[i + k + len / 2] * curImag + imag[i + k + len / 2] * curReal;

        real[i + k] = uReal + vReal;
        imag[i + k] = uImag + vImag;
        real[i + k + len / 2] = uReal - vReal;
        imag[i + k + len / 2] = uImag - vImag;

        const newCurReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = newCurReal;
      }
    }
  }

  return { real, imag };
}

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// =============================================================================
// UTILITY
// =============================================================================

function createEmptyStats(): SufficientStats {
  return {
    mean: 0,
    variance: 0,
    skew: 0,
    kurtosis: 0,
    hurst: 0.5,
    autocorr: new Array(TN_CONSTANTS.MAX_LAG).fill(0),
    spectrum: { frequencies: [], powers: [], count: 0 },
    regime: 3, // mixed by default
    sampleSize: 0,
    lastUpdate: new Date(),
  };
}
