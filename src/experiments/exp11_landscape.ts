/**
 * TN-LAB Experiment 11: Theory Landscape Geometry
 * 
 * Scientific Stage v5 - New Experiments
 * 
 * OBJECTIVE:
 * Map the global geometry of H-space and determine which theories 
 * dominate different regions.
 * 
 * DEFINITION:
 * T*(H) = argmin_i C(T_i, H)
 * 
 * This induces a partition:
 * S = ∪_{i=1}^{|T|} R_i
 * where R_i = {H: T_i is optimal}
 * 
 * HYPOTHESIS:
 * If TN-LAB captures real structure:
 * - Some theories dominate large regions
 * - Other regions are small
 * - Boundaries correspond to regime transitions
 * 
 * MEASUREMENTS:
 * 1. Region sizes |R_i|
 * 2. Partition entropy H_partition = -Σ p_i log(p_i)
 * 3. Boundary density
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, THEORY_COUNT, SufficientStats } from '../engine/types';
import { computeStats } from '../engine/gamma';
import { gei } from '../engine/gei';
import { computePhi } from '../engine/phi';
import { generateMultiRegimeSeries, generateRangingSegment, 
         generateTrendingSegment, generateVolatileSegment, 
         SeededRNG } from '../simulator/marketData';

/**
 * Generate realistic H vectors by sampling from market data
 * with variations in key parameters
 */
function generateHVectorSamples(
  rng: SeededRNG,
  count: number
): Array<{ stats: SufficientStats; prices: number[] }> {
  const samples: Array<{ stats: SufficientStats; prices: number[] }> = [];
  
  // Generate multi-regime series and extract windows
  for (let i = 0; i < count; i++) {
    // Generate different regime combinations
    const regimeSeed = Math.floor(rng.next() * 4);
    let prices: number[];
    
    switch (regimeSeed) {
      case 0: {
        // Ranging - generate longer series for more samples
        const startPrice = 100 + (rng.next() - 0.5) * 20;
        prices = generateRangingSegment(500, startPrice, rng);
        break;
      }
      case 1: {
        // Trending
        const startPrice = 100 + (rng.next() - 0.5) * 20;
        prices = generateTrendingSegment(500, startPrice, rng);
        break;
      }
      case 2: {
        // Volatile
        const startPrice = 100 + (rng.next() - 0.5) * 20;
        prices = generateVolatileSegment(500, startPrice, rng);
        break;
      }
      default: {
        // Mixed - use the built-in generator
        const market = generateMultiRegimeSeries(Math.floor(rng.next() * 10000), 250);
        prices = market.prices;
      }
    }
    
    // Extract H vector from prices
    const stats = computeStats(prices);
    samples.push({ stats, prices });
  }
  
  return samples;
}

/**
 * Compute theory landscape partition
 */
function computeLandscapePartition(
  samples: Array<{ stats: SufficientStats; prices: number[] }>
): {
  regionSizes: Record<TheoryID, number>;
  regionPercentages: Record<TheoryID, number>;
  theoryCosts: Record<TheoryID, number[]>;
  theoryPhis: Record<TheoryID, number[]>;
  partitionEntropy: number;
  dominantTheory: TheoryID;
  transitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }>;
} {
  const regionSizes: Record<TheoryID, number> = {} as Record<TheoryID, number>;
  const regionPercentages: Record<TheoryID, number> = {} as Record<TheoryID, number>;
  const theoryCosts: Record<TheoryID, number[]> = {} as any;
  const theoryPhis: Record<TheoryID, number[]> = {} as any;
  const transitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }> = [];
  
  // Initialize
  for (let t = 0; t < THEORY_COUNT; t++) {
    regionSizes[t as TheoryID] = 0;
    theoryCosts[t as TheoryID] = [];
    theoryPhis[t as TheoryID] = [];
  }
  
  // Classify each sample
  let currentTheory: TheoryID = 0 as TheoryID;
  
  samples.forEach((sample, idx) => {
    const geiResult = gei(sample.stats, sample.prices, currentTheory, transitionHistory, idx);
    const dominantTheory = geiResult.selectedTheory;
    
    regionSizes[dominantTheory]++;
    theoryCosts[dominantTheory].push(geiResult.evaluations[dominantTheory]?.cost || 0);
    
    // Compute phi for this sample
    const phiResult = computePhi(dominantTheory, sample.stats, sample.prices);
    theoryPhis[dominantTheory].push(phiResult.phi);
    
    currentTheory = dominantTheory;
  });
  
  // Compute percentages
  const total = samples.length;
  for (let t = 0; t < THEORY_COUNT; t++) {
    regionPercentages[t as TheoryID] = (regionSizes[t as TheoryID] / total) * 100;
  }
  
  // Compute partition entropy
  let partitionEntropy = 0;
  for (let t = 0; t < THEORY_COUNT; t++) {
    const p = regionPercentages[t as TheoryID] / 100;
    if (p > 0.001) {
      partitionEntropy -= p * Math.log(p);
    }
  }
  
  // Find dominant theory
  let maxSize = 0;
  let dominantTheory: TheoryID = 0 as TheoryID;
  for (let t = 0; t < THEORY_COUNT; t++) {
    if (regionSizes[t as TheoryID] > maxSize) {
      maxSize = regionSizes[t as TheoryID];
      dominantTheory = t as TheoryID;
    }
  }
  
  return {
    regionSizes,
    regionPercentages,
    theoryCosts,
    theoryPhis,
    partitionEntropy,
    dominantTheory,
    transitionHistory,
  };
}

/**
 * Compute boundary density - how many points are near theory transitions
 */
function computeBoundaryDensity(
  samples: Array<{ stats: SufficientStats; prices: number[] }>,
  threshold: number = 0.1
): number {
  let boundaries = 0;
  
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1].stats;
    const curr = samples[i].stats;
    
    // Compute feature distance
    const hurstDiff = Math.abs(prev.hurst - curr.hurst);
    const varRatio = Math.max(prev.variance, curr.variance) / 
                    (Math.min(prev.variance, curr.variance) + 1e-15);
    
    if (hurstDiff > threshold || varRatio > 5) {
      boundaries++;
    }
  }
  
  return boundaries / (samples.length - 1);
}

/**
 * Main experiment runner
 */
export function runLandscapeExperiment(): {
  pass: boolean;
  samplesAnalyzed: number;
  landscape: {
    regionSizes: Record<TheoryID, number>;
    regionPercentages: Record<TheoryID, number>;
    partitionEntropy: number;
    normalizedEntropy: number;
    dominantTheory: TheoryID;
    boundaryDensity: number;
    theoryStats: Record<TheoryID, {
      meanCost: number;
      stdCost: number;
      meanPhi: number;
      stdPhi: number;
    }>;
  };
  hypothesis: boolean;
  metric: string;
} {
  console.log('\n=== EXPERIMENT 11: Theory Landscape Geometry ===\n');
  
  const rng = new SeededRNG(42);
  const sampleCount = 1000;
  
  console.log(`Generating ${sampleCount} H vectors...`);
  const samples = generateHVectorSamples(rng, sampleCount);
  console.log(`Generated ${samples.length} samples\n`);
  
  console.log('Computing theory landscape partition...');
  const landscape = computeLandscapePartition(samples);
  
  console.log('Computing boundary density...');
  const boundaryDensity = computeBoundaryDensity(samples);
  
  // Print results
  console.log('\nTHEORY LANDSCAPE:');
  console.log('==================');
  console.log('Region sizes:');
  for (let t = 0; t < THEORY_COUNT; t++) {
    const size = landscape.regionSizes[t as TheoryID];
    const pct = landscape.regionPercentages[t as TheoryID];
    console.log(`  Theory ${t}: ${size} (${pct.toFixed(1)}%)`);
  }
  
  console.log(`\nPARTITION ENTROPY: ${landscape.partitionEntropy.toFixed(4)} nats`);
  const maxEntropy = Math.log(THEORY_COUNT);
  const normalizedEntropy = landscape.partitionEntropy / maxEntropy;
  console.log(`NORMALIZED ENTROPY: ${normalizedEntropy.toFixed(4)}`);
  console.log(`BOUNDARY DENSITY: ${(boundaryDensity * 100).toFixed(2)}%`);
  
  // Compute theory statistics
  const theoryStats: Record<TheoryID, {
    meanCost: number;
    stdCost: number;
    meanPhi: number;
    stdPhi: number;
  }> = {} as any;
  
  for (let t = 0; t < THEORY_COUNT; t++) {
    const costs = landscape.theoryCosts[t as TheoryID];
    const phis = landscape.theoryPhis[t as TheoryID];
    
    if (costs.length > 0) {
      const meanCost = costs.reduce((a, b) => a + b, 0) / costs.length;
      const stdCost = Math.sqrt(costs.reduce((a, b) => a + (b - meanCost) ** 2, 0) / costs.length);
      const meanPhi = phis.reduce((a, b) => a + b, 0) / phis.length;
      const stdPhi = Math.sqrt(phis.reduce((a, b) => a + (b - meanPhi) ** 2, 0) / phis.length);
      
      theoryStats[t as TheoryID] = { meanCost, stdCost, meanPhi, stdPhi };
    }
  }
  
  console.log('\nTHEORY STATISTICS:');
  console.log('==================');
  for (let t = 0; t < THEORY_COUNT; t++) {
    const stats = theoryStats[t as TheoryID];
    if (stats) {
      console.log(`  Theory ${t}: cost=${stats.meanCost.toFixed(3)}±${stats.stdCost.toFixed(3)}, φ=${stats.meanPhi.toFixed(3)}±${stats.stdPhi.toFixed(3)}`);
    }
  }
  
  // HYPOTHESIS: TN-LAB captures real structure
  // - Some theories dominate regions (max > 20%)
  // - Partition entropy is moderate
  // - Not uniform distribution
  
  const maxPercentage = Math.max(...Object.values(landscape.regionPercentages));
  const minPercentage = Math.min(...Object.values(landscape.regionPercentages).filter(p => p > 0));
  
  const hypothesis = (
    maxPercentage > 15 &&
    normalizedEntropy > 0.3 &&
    normalizedEntropy < 0.95 &&
    minPercentage > 0.1
  );
  
  console.log(`\nHYPOTHESIS: ${hypothesis ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  - Max region: ${maxPercentage.toFixed(1)}% (threshold: >15%)`);
  console.log(`  - Min region: ${minPercentage.toFixed(1)}%`);
  console.log(`  - Normalized entropy: ${normalizedEntropy.toFixed(3)} (range: 0.3-0.95)`);
  
  return {
    pass: hypothesis,
    samplesAnalyzed: sampleCount,
    landscape: {
      regionSizes: landscape.regionSizes,
      regionPercentages: landscape.regionPercentages,
      partitionEntropy: landscape.partitionEntropy,
      normalizedEntropy,
      dominantTheory: landscape.dominantTheory,
      boundaryDensity,
      theoryStats,
    },
    hypothesis,
    metric: `${normalizedEntropy.toFixed(3)} normalized entropy`,
  };
}

// Run if called directly
if (require.main === module) {
  const result = runLandscapeExperiment();
  console.log('\n=== FINAL RESULT ===');
  console.log(`Status: ${result.pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Metric: ${result.metric}`);
}
