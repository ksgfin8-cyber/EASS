/**
 * TN-LAB Engine — Numeric Stability Utilities
 * Sistema TN (Tortuga Ninja) v3.0
 *
 * Global numeric stability helpers to prevent NaN/Infinity propagation.
 * Used throughout the engine to ensure numerical robustness.
 *
 * NO React, NO browser APIs. Pure TypeScript math.
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Epsilon values for different precision requirements.
 * Use smaller epsilon for more aggressive handling of near-zero values.
 */
export const EPSILON = {
  /** Default epsilon for division: 1e-9 */
  DEFAULT: 1e-9,
  /** Larger epsilon for variance/standard deviation: 1e-8 */
  VARIANCE: 1e-8,
  /** Epsilon for probability calculations: 1e-12 */
  PROBABILITY: 1e-12,
  /** Epsilon for correlation: 1e-6 */
  CORRELATION: 1e-6,
} as const;

// =============================================================================
// SAFE DIVISION
// =============================================================================

/**
 * Safe division with configurable epsilon.
 * Returns 0 if denominator is near zero.
 *
 * @param a - Numerator
 * @param b - Denominator
 * @param eps - Epsilon threshold (default: 1e-9)
 * @returns a / b if |b| > eps, else 0
 */
export function safeDiv(a: number, b: number, eps: number = EPSILON.DEFAULT): number {
  if (!isFinite(a) || !isFinite(b)) return 0;
  if (Math.abs(b) < eps) return 0;
  return a / b;
}

/**
 * Safe division that returns a default value if denominator is near zero.
 *
 * @param a - Numerator
 * @param b - Denominator
 * @param defaultValue - Value to return if division is unsafe
 * @param eps - Epsilon threshold (default: 1e-9)
 * @returns a / b if |b| > eps, else defaultValue
 */
export function safeDivWithDefault(
  a: number,
  b: number,
  defaultValue: number,
  eps: number = EPSILON.DEFAULT
): number {
  if (!isFinite(a) || !isFinite(b)) return defaultValue;
  if (Math.abs(b) < eps) return defaultValue;
  return a / b;
}

// =============================================================================
// SAFE ARITHMETIC
// =============================================================================

/**
 * Safely add multiple numbers, filtering out NaN/Infinity.
 *
 * @param numbers - Array of numbers to sum
 * @returns Sum of valid numbers, or 0 if none valid
 */
export function safeSum(numbers: number[]): number {
  let sum = 0;
  for (const n of numbers) {
    if (isFinite(n)) sum += n;
  }
  return sum;
}

/**
 * Safely compute mean of an array.
 *
 * @param values - Array of numbers
 * @returns Mean of valid numbers, or 0 if insufficient data
 */
export function safeMean(values: number[]): number {
  const valid = values.filter(isFinite);
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * Safely compute variance of an array.
 *
 * @param values - Array of numbers
 * @param mean - Pre-computed mean (optional)
 * @returns Variance, or 0 if insufficient data
 */
export function safeVariance(values: number[], mean?: number): number {
  const valid = values.filter(isFinite);
  if (valid.length < 2) return 0;

  const m = mean !== undefined ? mean : safeMean(valid);
  const squaredDiffs = valid.map(v => (v - m) ** 2);
  return safeMean(squaredDiffs);
}

/**
 * Safely compute standard deviation.
 *
 * @param values - Array of numbers
 * @param mean - Pre-computed mean (optional)
 * @returns Standard deviation, or 0 if insufficient data
 */
export function safeStd(values: number[], mean?: number): number {
  return Math.sqrt(safeVariance(values, mean));
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Check if a number is valid (finite and not NaN).
 */
export function isValidNumber(n: number): boolean {
  return isFinite(n) && !isNaN(n);
}

/**
 * Check if an array has sufficient valid data.
 *
 * @param values - Array to check
 * @param minLength - Minimum required length
 * @returns true if array has enough valid values
 */
export function hasSufficientData(values: number[], minLength: number = 2): boolean {
  const validCount = values.filter(v => isValidNumber(v)).length;
  return validCount >= minLength;
}

/**
 * Check if price window is degenerate (flat or near-zero variance).
 * This prevents division by zero in various calculations.
 *
 * @param prices - Array of prices
 * @param eps - Variance threshold (default: 1e-8)
 * @returns true if price window is degenerate
 */
export function isPriceWindowDegenerate(prices: number[], eps: number = EPSILON.VARIANCE): boolean {
  if (!prices || prices.length < 2) return true;
  
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (isValidNumber(prices[i]) && isValidNumber(prices[i - 1])) {
      returns.push(Math.abs(prices[i] - prices[i - 1]));
    }
  }
  
  if (returns.length < 2) return true;
  
  const variance = safeVariance(returns);
  return variance < eps;
}

// =============================================================================
// NAN/INFINITY SANITIZATION
// =============================================================================

/**
 * Sanitize a value, replacing NaN/Infinity with a default.
 *
 * @param value - Value to sanitize
 * @param defaultValue - Default value (default: 0)
 * @returns Sanitized value
 */
export function sanitize(value: number, defaultValue: number = 0): number {
  return isFinite(value) ? value : defaultValue;
}

/**
 * Sanitize an array, replacing invalid values with defaults.
 *
 * @param values - Array to sanitize
 * @param defaultValue - Default value (default: 0)
 * @returns New array with invalid values replaced
 */
export function sanitizeArray(values: number[], defaultValue: number = 0): number[] {
  return values.map(v => sanitize(v, defaultValue));
}

/**
 * Clamp a value to a range.
 *
 * @param value - Value to clamp
 * @param min - Minimum bound
 * @param max - Maximum bound
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  if (!isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalize a value to [0, 1] range using sigmoid-like function.
 * Handles NaN/Infinity gracefully.
 *
 * @param value - Value to normalize
 * @returns Normalized value in [0, 1]
 */
export function normalize(value: number): number {
  if (!isFinite(value)) return 0;
  return value / (1 + Math.abs(value));
}

// =============================================================================
// PREDICTION GUARDS
// =============================================================================

/**
 * Guard for prediction functions - ensures valid output.
 * If prediction is invalid, returns last known good price.
 *
 * @param prediction - Computed prediction
 * @param lastPrice - Last known good price
 * @returns Safe prediction
 */
export function guardPrediction(prediction: number, lastPrice: number): number {
  return isFinite(prediction) ? prediction : lastPrice;
}

/**
 * Guard for theory predictions requiring minimum history.
 * Returns last price if insufficient history.
 *
 * @param prices - Price array
 * @param minRequired - Minimum required length
 * @returns true if sufficient data available
 */
export function checkMinHistory(prices: number[], minRequired: number): boolean {
  return hasSufficientData(prices, minRequired);
}

// =============================================================================
// COST SANITIZATION
// =============================================================================

/**
 * Sanitize a cost value, replacing NaN/Infinity with maximum cost.
 * This ensures invalid theories are not selected.
 *
 * @param cost - Computed cost
 * @param maxCost - Maximum cost for invalid theories (default: 100)
 * @returns Sanitized cost
 */
export function sanitizeCost(cost: number, maxCost: number = 100): number {
  if (!isFinite(cost) || cost < 0) return maxCost;
  return Math.min(cost, maxCost);
}

/**
 * Check if a cost value indicates an invalid evaluation.
 */
export function isInvalidCost(cost: number): boolean {
  return !isFinite(cost) || cost >= 100;
}
