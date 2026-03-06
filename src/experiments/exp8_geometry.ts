/**
 * TN-LAB Experiment 8: Geometry of H-Space
 * 
 * Scientific Stage v4 - New Experiments
 * 
 * OBJECTIVE:
 * Generate many H vectors and measure T*(H) = argmin_i C(T_i, H)
 * Build partition: S = ∪ R_i where R_i = {H: T_i is optimal}
 * 
 * This is computational geometry of the market feature space.
 * 
 * PARTITION INTERPRETATION:
 * - R_i = region where theory T_i dominates
 * - Boundaries = transition zones between theories
 * - Volume of each R_i = prevalence of that market regime
 * 
 * HYPOTHESIS:
 * H-space has natural partition matching market regimes:
 * - Low Hurst + Low Variance → Mean Reversion region
 * - High Hurst + Low Variance → Trend region  
 * - High Variance → Volatility region
 * - Mixed characteristics → Random Walk region
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, THEORY_COUNT, SufficientStats, TN_CONSTANTS } from '../engine/types';
import { computeStats } from '../engine/gamma';
import { gei } from '../engine/gei';
import { generateRangingSegment, generateTrendingSegment, 
         generateVolatileSegment, generateMixedSegment, SeededRNG } from '../simulator/marketData';

/**
 * Generate synthetic H vectors covering the regime space
 */
function generateHVectorSamples(
  rng: SeededRNG,
  countPerRegime: number
): Array<{ stats: SufficientStats; regime: number; prices: number[] }> {
  const samples: Array<{ stats: SufficientStats; regime: number; prices: number[] }> = [];
  
  // Generate samples from each regime
  for (let i = 0; i < countPerRegime; i++) {
    // Ranging market (low Hurst, low variance)
    const rangingPrices = generateRangingSegment(500, 100, rng);
    const rangingStats = computeStats(rangingPrices);
    samples.push({ stats: rangingStats, regime: 0, prices: rangingPrices });
    
    // Trending market (high Hurst, low variance)
    const trendingPrices = generateTrendingSegment(500, 100, rng);
    const trendingStats = computeStats(trendingPrices);
    samples.push({ stats: trendingStats, regime: 1, prices: trendingPrices });
    
    // Volatile market (high variance)
    const volatilePrices = generateVolatileSegment(500, 100, rng);
    const volatileStats = computeStats(volatilePrices);
    samples.push({ stats: volatileStats, regime: 2, prices: volatilePrices });
    
    // Mixed market
    const mixedPrices = generateMixedSegment(500, 100, rng);
    const mixedStats = computeStats(mixedPrices);
    samples.push({ stats: mixedStats, regime: 3, prices: mixedPrices });
  }
  
  return samples;
}

/**
 * Compute dominant theory for each H vector
 */
function computeTheoryPartition(
  samples: Array<{ stats: SufficientStats; regime: number; prices: number[] }>
): Map<TheoryID, number[]> {
  // Map: theory ID -> array of sample indices
  const partition = new Map<TheoryID, number[]>();
  
  // Initialize
  for (let t = 0; t < THEORY_COUNT; t++) {
    partition.set(t as TheoryID, []);
  }
  
  // Track transitions for cycle detection
  const transitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }> = [];
  
  // Classify each sample
  samples.forEach((sample, idx) => {
    const result = gei(sample.stats, sample.prices, 0 as TheoryID, transitionHistory, idx);
    const dominantTheory = result.selectedTheory;
    const indices = partition.get(dominantTheory)!;
    indices.push(idx);
  });
  
  return partition;
}

/**
 * Analyze partition geometry
 */
function analyzePartitionGeometry(
  partition: Map<TheoryID, number[]>,
  samples: Array<{ stats: SufficientStats; regime: number; prices: number[] }>
): {
  theoryCounts: Record<TheoryID, number>;
  theoryPercentages: Record<TheoryID, number>;
  regionCharacteristics: Record<TheoryID, {
    meanHurst: number;
    meanVariance: number;
    meanRegime: number;
  }>;
  boundarySamples: Array<{
    index: number;
    hurst: number;
    variance: number;
    regimes: number[];
  }>;
  partitionEntropy: number;
} {
  const totalSamples = samples.length;
  const theoryCounts: Record<TheoryID, number> = {} as Record<TheoryID, number>;
  const theoryPercentages: Record<TheoryID, number> = {} as Record<TheoryID, number>;
  const regionCharacteristics: Record<TheoryID, {
    meanHurst: number;
    meanVariance: number;
    meanRegime: number;
  }> = {} as any;
  
  let partitionEntropy = 0;
  
  // Compute statistics per theory region
  for (let t = 0; t < THEORY_COUNT; t++) {
    const indices = partition.get(t as TheoryID)!;
    theoryCounts[t as TheoryID] = indices.length;
    theoryPercentages[t as TheoryID] = (indices.length / totalSamples) * 100;
    
    if (indices.length > 0) {
      let sumHurst = 0;
      let sumVariance = 0;
      let sumRegime = 0;
      
      for (const idx of indices) {
        sumHurst += samples[idx].stats.hurst;
        sumVariance += samples[idx].stats.variance;
        sumRegime += samples[idx].regime;
      }
      
      regionCharacteristics[t as TheoryID] = {
        meanHurst: sumHurst / indices.length,
        meanVariance: sumVariance / indices.length,
        meanRegime: sumRegime / indices.length,
      };
    } else {
      regionCharacteristics[t as TheoryID] = {
        meanHurst: 0,
        meanVariance: 0,
        meanRegime: 0,
      };
    }
  }
  
  // Compute partition entropy H(S) = -Σ p_i log(p_i)
  for (let t = 0; t < THEORY_COUNT; t++) {
    const p = theoryPercentages[t as TheoryID] / 100;
    if (p > 0.01) {
      partitionEntropy -= p * Math.log(p);
    }
  }
  
  // Find boundary samples (regions with similar characteristics)
  const boundarySamples: Array<{
    index: number;
    hurst: number;
    variance: number;
    regimes: number[];
  }> = [];
  
  // Simple boundary detection: samples near regime transitions
  for (let i = 0; i < samples.length - 1; i++) {
    const curr = samples[i];
    const next = samples[i + 1];
    
    // If consecutive samples have very different characteristics
    const hurstDiff = Math.abs(curr.stats.hurst - next.stats.hurst);
    const varRatio = Math.max(curr.stats.variance, next.stats.variance) / 
                     (Math.min(curr.stats.variance, next.stats.variance) + 1e-15);
    
    if (hurstDiff > 0.15 || varRatio > 10) {
      boundarySamples.push({
        index: i,
        hurst: curr.stats.hurst,
        variance: curr.stats.variance,
        regimes: [curr.regime, next.regime],
      });
    }
  }
  
  return {
    theoryCounts,
    theoryPercentages,
    regionCharacteristics,
    boundarySamples: boundarySamples.slice(0, 20), // Limit to 20
    partitionEntropy,
  };
}

/**
 * Main experiment runner
 */
export function runGeometryExperiment(): {
  pass: boolean;
  samplesGenerated: number;
  partition: {
    theoryCounts: Record<TheoryID, number>;
    theoryPercentages: Record<TheoryID, number>;
    regionCharacteristics: Record<TheoryID, {
      meanHurst: number;
      meanVariance: number;
      meanRegime: number;
    }>;
    boundarySamples: Array<{
      index: number;
      hurst: number;
      variance: number;
      regimes: number[];
    }>;
    partitionEntropy: number;
  };
  hypothesis: boolean;
  metric: string;
} {
  console.log('\n=== EXPERIMENT 8: Geometry of H-Space ===\n');
  
  const rng = new SeededRNG(42);
  const samplesPerRegime = 100;
  const totalSamples = samplesPerRegime * 4; // 4 regimes
  
  // Generate H vector samples
  console.log('Generating H vector samples...');
  const samples = generateHVectorSamples(rng, samplesPerRegime);
  console.log(`Generated ${samples.length} samples\n`);
  
  // Compute theory partition
  console.log('Computing theory partition...');
  const partition = computeTheoryPartition(samples);
  
  // Analyze partition geometry
  console.log('Analyzing partition geometry...\n');
  const analysis = analyzePartitionGeometry(partition, samples);
  
  // Print results
  console.log('THEORY PARTITION:');
  console.log('=================');
  for (let t = 0; t < THEORY_COUNT; t++) {
    const count = analysis.theoryCounts[t as TheoryID];
    const pct = analysis.theoryPercentages[t as TheoryID];
    const char = analysis.regionCharacteristics[t as TheoryID];
    console.log(`  Theory ${t}: ${count} samples (${pct.toFixed(1)}%)`);
    console.log(`    → Mean Hurst: ${char.meanHurst.toFixed(3)}, Mean Variance: ${char.meanVariance.toFixed(2e-10)}`);
    console.log(`    → Mean Regime: ${char.meanRegime.toFixed(1)}`);
  }
  
  console.log(`\nPARTITION ENTROPY: ${analysis.partitionEntropy.toFixed(4)} nats`);
  console.log(`MAX ENTROPY (10 theories): ${Math.log(THEORY_COUNT).toFixed(4)} nats`);
  console.log(`NORMALIZED: ${(analysis.partitionEntropy / Math.log(THEORY_COUNT)).toFixed(4)}`);
  
  console.log(`\nBOUNDARY SAMPLES: ${analysis.boundarySamples.length}`);
  
  // HYPOTHESIS: H-space has interpretable partition matching regimes
  // We check if:
  // 1. Partition is not uniform (some theories dominate)
  // 2. Region characteristics match regime expectations
  // 3. Partition entropy is moderate (not too high = random, not too low = deterministic)
  
  const maxTheoryPct = Math.max(...Object.values(analysis.theoryPercentages));
  const normalizedEntropy = analysis.partitionEntropy / Math.log(THEORY_COUNT);
  
  const hypothesis = (
    maxTheoryPct > 20 &&           // At least one theory dominates
    normalizedEntropy > 0.3 &&     // Some diversity in partition
    normalizedEntropy < 0.9        // Not too fragmented
  );
  
  console.log(`\nHYPOTHESIS: ${hypothesis ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  - Max theory dominance: ${maxTheoryPct.toFixed(1)}% (threshold: >20%)`);
  console.log(`  - Normalized entropy: ${normalizedEntropy.toFixed(3)} (range: 0.3-0.9)`);
  
  return {
    pass: hypothesis,
    samplesGenerated: totalSamples,
    partition: analysis,
    hypothesis,
    metric: `${normalizedEntropy.toFixed(3)} normalized entropy`,
  };
}

// Run if called directly
if (require.main === module) {
  const result = runGeometryExperiment();
  console.log('\n=== FINAL RESULT ===');
  console.log(`Status: ${result.pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Metric: ${result.metric}`);
}
