/**
 * TN-LAB Experiment 10: Fractal Dimension
 * 
 * Scientific Stage v4 - New Experiments
 * 
 * OBJECTIVE:
 * Compute fractal dimension of market trajectories in H-space.
 * 
 * METHOD: Correlation Dimension D₂
 * - Compute pairwise distances between H_t vectors
 * - Count pairs within radius ε
 * - D₂ = lim_{ε→0} log C(ε) / log(ε)
 *   where C(ε) = correlation integral
 * 
 * HYPOTHESIS:
 * - Low D₂ (near 1) → low-dimensional structure (trending)
 * - High D₂ (near full dimension) → high complexity (volatile/random)
 * 
 * CONNECTION TO Φ:
 * If Φ relates to fractal dimension:
 * - Higher Φ (more predictable) → Lower D₂ (simpler structure)
 * - Lower Φ (less predictable) → Higher D₂ (more complex)
 * 
 * This connects market dynamics to chaotic systems theory.
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, SufficientStats } from '../engine/types';
import { computeStats } from '../engine/gamma';
import { computePhi } from '../engine/phi';
import { generateTrendingSegment, generateVolatileSegment, 
         generateRangingSegment, generateMixedSegment, SeededRNG } from '../simulator/marketData';

/**
 * Compute Euclidean distance between two SufficientStats
 * Using normalized features for fair comparison
 */
function hDistance(a: SufficientStats, b: SufficientStats): number {
  // Feature vector: [mean, variance, skew, kurtosis, hurst, regime]
  // Normalize variance and other scales
  const scale = 1e10; // Scale for variance
  
  const diff = [
    (a.mean - b.mean) / (Math.abs(a.mean) + 1),
    (a.variance * scale - b.variance * scale) / (Math.abs(a.variance * scale) + 1),
    a.skew - b.skew,
    a.kurtosis - b.kurtosis,
    a.hurst - b.hurst,
    a.regime - b.regime,
  ];
  
  return Math.sqrt(diff.reduce((sum, d) => sum + d * d, 0));
}

/**
 * Compute correlation integral C(ε)
 * C(ε) = (2 / N(N-1)) * Σ I(||x_i - x_j|| < ε)
 * 
 * @param points - Array of H vectors
 * @param epsilon - radius
 * @returns correlation integral value
 */
function computeCorrelationIntegral(points: SufficientStats[], epsilon: number): number {
  const n = points.length;
  if (n < 2) return 0;
  
  let count = 0;
  const nPairs = n * (n - 1) / 2;
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (hDistance(points[i], points[j]) < epsilon) {
        count++;
      }
    }
  }
  
  return count / nPairs;
}

/**
 * Compute correlation dimension D₂
 * D₂ = d log C(ε) / d log(ε)
 * 
 * We estimate by linear regression on log-log plot
 */
function computeCorrelationDimension(points: SufficientStats[]): {
  dimension: number;
  correlationExponents: Array<{ logEpsilon: number; logC: number }>;
  rSquared: number;
} {
  if (points.length < 10) {
    return { dimension: 0, correlationExponents: [], rSquared: 0 };
  }
  
  // Compute C(ε) for multiple epsilon values
  const epsilonMin = 0.01;
  const epsilonMax = 2.0;
  const steps = 20;
  
  const exponents: Array<{ logEpsilon: number; logC: number }> = [];
  
  for (let i = 0; i < steps; i++) {
    const epsilon = epsilonMin * Math.pow(epsilonMax / epsilonMin, i / (steps - 1));
    const c = computeCorrelationIntegral(points, epsilon);
    
    if (c > 0) {
      exponents.push({
        logEpsilon: Math.log(epsilon),
        logC: Math.log(c),
      });
    }
  }
  
  if (exponents.length < 2) {
    return { dimension: 0, correlationExponents: exponents, rSquared: 0 };
  }
  
  // Linear regression: log C = D₂ * log ε + const
  const n = exponents.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  
  for (const p of exponents) {
    sumX += p.logEpsilon;
    sumY += p.logC;
    sumXY += p.logEpsilon * p.logC;
    sumX2 += p.logEpsilon * p.logEpsilon;
    sumY2 += p.logC * p.logC;
  }
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // R-squared
  const meanY = sumY / n;
  let ssRes = 0, ssTot = 0;
  
  for (const p of exponents) {
    const predicted = slope * p.logEpsilon + intercept;
    ssRes += (p.logC - predicted) ** 2;
    ssTot += (p.logC - meanY) ** 2;
  }
  
  const rSquared = 1 - ssRes / ssTot;
  
  return {
    dimension: Math.max(0, Math.min(6, slope)), // Clamp to realistic range
    correlationExponents: exponents,
    rSquared,
  };
}

/**
 * Generate trajectory of H vectors over time
 */
function generateHTrajectory(
  prices: number[],
  windowSize: number,
  stepSize: number
): SufficientStats[] {
  const trajectory: SufficientStats[] = [];
  
  // Extract windows
  for (let i = 0; i + windowSize < prices.length; i += stepSize) {
    const window = prices.slice(i, i + windowSize);
    const stats = computeStats(window);
    trajectory.push(stats);
  }
  
  return trajectory;
}

/**
 * Compute Φ for trajectory (average)
 */
function computeAveragePhi(trajectory: SufficientStats[], prices: number[]): number {
  let totalPhi = 0;
  let count = 0;
  
  const windowSize = 500;
  for (let i = windowSize; i < prices.length; i += 50) {
    const window = prices.slice(i - windowSize, i);
    if (window.length >= windowSize) {
      const idx = Math.floor((i - windowSize) / 50);
      if (idx < trajectory.length) {
        const phi = computePhi(0 as TheoryID, trajectory[idx], window);
        totalPhi += phi.phi;
        count++;
      }
    }
  }
  
  return count > 0 ? totalPhi / count : 0;
}

/**
 * Main experiment runner
 */
export function runFractalExperiment(): {
  pass: boolean;
  results: {
    trending: {
      dimension: number;
      rSquared: number;
      phi: number;
    };
    volatile: {
      dimension: number;
      rSquared: number;
      phi: number;
    };
    ranging: {
      dimension: number;
      rSquared: number;
      phi: number;
    };
    mixed: {
      dimension: number;
      rSquared: number;
      phi: number;
    };
  };
  hypothesis: boolean;
  metric: string;
  phiDimensionCorrelation: number;
} {
  console.log('\n=== EXPERIMENT 10: Fractal Dimension ===\n');
  
  const rng = new SeededRNG(42);
  const windowSize = 200;
  const stepSize = 10;
  
  // Generate trajectories for each regime
  console.log('Generating market trajectories...');
  
  const trendingPrices = generateTrendingSegment(2000, 100, rng);
  const volatilePrices = generateVolatileSegment(2000, 100, rng);
  const rangingPrices = generateRangingSegment(2000, 100, rng);
  const mixedPrices = generateMixedSegment(2000, 100, rng);
  
  const trendingTraj = generateHTrajectory(trendingPrices, windowSize, stepSize);
  const volatileTraj = generateHTrajectory(volatilePrices, windowSize, stepSize);
  const rangingTraj = generateHTrajectory(rangingPrices, windowSize, stepSize);
  const mixedTraj = generateHTrajectory(mixedPrices, windowSize, stepSize);
  
  console.log(`Trajectory lengths: trending=${trendingTraj.length}, volatile=${volatileTraj.length}, ranging=${rangingTraj.length}, mixed=${mixedTraj.length}\n`);
  
  // Compute correlation dimensions
  console.log('Computing correlation dimensions...');
  const trendingD2 = computeCorrelationDimension(trendingTraj);
  const volatileD2 = computeCorrelationDimension(volatileTraj);
  const rangingD2 = computeCorrelationDimension(rangingTraj);
  const mixedD2 = computeCorrelationDimension(mixedTraj);
  
  // Compute average Φ for each regime
  const trendingPhi = computeAveragePhi(trendingTraj, trendingPrices);
  const volatilePhi = computeAveragePhi(volatileTraj, volatilePrices);
  const rangingPhi = computeAveragePhi(rangingTraj, rangingPrices);
  const mixedPhi = computeAveragePhi(mixedTraj, mixedPrices);
  
  // Print results
  console.log('\nCORRELATION DIMENSION RESULTS:');
  console.log('=============================');
  console.log('Regime     | D₂     | R²     | Φ');
  console.log('-----------|--------|--------|------');
  console.log(`Trending   | ${trendingD2.dimension.toFixed(3)} | ${trendingD2.rSquared.toFixed(3)} | ${trendingPhi.toFixed(3)}`);
  console.log(`Volatile   | ${volatileD2.dimension.toFixed(3)} | ${volatileD2.rSquared.toFixed(3)} | ${volatilePhi.toFixed(3)}`);
  console.log(`Ranging   | ${rangingD2.dimension.toFixed(3)} | ${rangingD2.rSquared.toFixed(3)} | ${rangingPhi.toFixed(3)}`);
  console.log(`Mixed     | ${mixedD2.dimension.toFixed(3)} | ${mixedD2.rSquared.toFixed(3)} | ${mixedPhi.toFixed(3)}`);
  
  // Hypothesis: Higher Φ → Lower D₂ (more predictable = simpler structure)
  // Compute correlation between Φ and D₂
  const phiValues = [trendingPhi, volatilePhi, rangingPhi, mixedPhi];
  const dimValues = [trendingD2.dimension, volatileD2.dimension, rangingD2.dimension, mixedD2.dimension];
  
  const n = 4;
  let sumPhi = 0, sumD = 0, sumPhiD = 0, sumPhi2 = 0, sumD2 = 0;
  for (let i = 0; i < n; i++) {
    sumPhi += phiValues[i];
    sumD += dimValues[i];
    sumPhiD += phiValues[i] * dimValues[i];
    sumPhi2 += phiValues[i] ** 2;
    sumD2 += dimValues[i] ** 2;
  }
  
  const correlation = (n * sumPhiD - sumPhi * sumD) / 
                      Math.sqrt((n * sumPhi2 - sumPhi ** 2) * (n * sumD2 - sumD ** 2));
  
  console.log(`\nΦ-D₂ CORRELATION: ${correlation.toFixed(3)}`);
  
  // Hypothesis checks:
  // 1. Dimensions are in reasonable range (0-6)
  // 2. Different regimes have different dimensions
  // 3. Φ-D₂ correlation is negative (higher predictability = lower complexity)
  
  const dimensionsValid = trendingD2.dimension > 0 && volatileD2.dimension > 0;
  const regimesDifferent = Math.abs(trendingD2.dimension - volatileD2.dimension) > 0.1;
  const correlationValid = correlation < -0.3; // Negative correlation expected
  
  const hypothesis = dimensionsValid && regimesDifferent && correlationValid;
  
  console.log(`\nHYPOTHESIS: ${hypothesis ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  - Dimensions valid: ${dimensionsValid ? 'yes' : 'no'}`);
  console.log(`  - Regimes different: ${regimesDifferent ? 'yes' : 'no'}`);
  console.log(`  - Φ-D₂ correlation negative: ${correlationValid ? 'yes' : 'no'}`);
  
  return {
    pass: hypothesis,
    results: {
      trending: { dimension: trendingD2.dimension, rSquared: trendingD2.rSquared, phi: trendingPhi },
      volatile: { dimension: volatileD2.dimension, rSquared: volatileD2.rSquared, phi: volatilePhi },
      ranging: { dimension: rangingD2.dimension, rSquared: rangingD2.rSquared, phi: rangingPhi },
      mixed: { dimension: mixedD2.dimension, rSquared: mixedD2.rSquared, phi: mixedPhi },
    },
    hypothesis,
    metric: `${correlation.toFixed(3)} Φ-D₂ correlation`,
    phiDimensionCorrelation: correlation,
  };
}

// Run if called directly
if (require.main === module) {
  const result = runFractalExperiment();
  console.log('\n=== FINAL RESULT ===');
  console.log(`Status: ${result.pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Metric: ${result.metric}`);
}
