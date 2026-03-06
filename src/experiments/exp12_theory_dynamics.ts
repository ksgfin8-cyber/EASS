/**
 * TN-LAB Experiment 12: Theory Dynamics (Markov Structure)
 * 
 * Scientific Stage v5 - New Experiments
 * 
 * OBJECTIVE:
 * Determine if the sequence of selected theories forms structured dynamics.
 * 
 * DEFINITION:
 * Sequence: T_1, T_2, ..., T_t
 * Transition probabilities: P(T_j | T_i)
 * 
 * HYPOTHESIS:
 * Theory transitions should reflect market dynamics.
 * Example expected: MeanReversion → TrendFollowing → VolatilityBreakout
 * 
 * MEASUREMENTS:
 * 1. Entropy of transition matrix
 * 2. Stationary distribution
 * 3. Cycle detection
 * 4. Dominant paths
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { TheoryID, THEORY_COUNT, SufficientStats } from '../engine/types';
import { computeStats } from '../engine/gamma';
import { gei } from '../engine/gei';
import { generateMultiRegimeSeries, generateTrendingSegment, 
         generateVolatileSegment, SeededRNG } from '../simulator/marketData';

/**
 * Build transition matrix from theory sequence
 */
function buildTransitionMatrix(
  theorySequence: TheoryID[]
): number[][] {
  // Initialize matrix
  const P: number[][] = Array(THEORY_COUNT).fill(null)
    .map(() => Array(THEORY_COUNT).fill(0));
  
  // Count transitions
  const counts: number[][] = Array(THEORY_COUNT).fill(null)
    .map(() => Array(THEORY_COUNT).fill(0));
  
  for (let i = 1; i < theorySequence.length; i++) {
    const from = theorySequence[i - 1];
    const to = theorySequence[i];
    counts[from][to]++;
  }
  
  // Normalize to get probabilities
  for (let i = 0; i < THEORY_COUNT; i++) {
    const rowSum = counts[i].reduce((a, b) => a + b, 0);
    if (rowSum > 0) {
      for (let j = 0; j < THEORY_COUNT; j++) {
        P[i][j] = counts[i][j] / rowSum;
      }
    }
  }
  
  return P;
}

/**
 * Compute entropy of transition matrix
 */
function computeTransitionEntropy(P: number[][]): number {
  let entropy = 0;
  
  for (let i = 0; i < THEORY_COUNT; i++) {
    for (let j = 0; j < THEORY_COUNT; j++) {
      if (P[i][j] > 0.001) {
        entropy -= P[i][j] * Math.log(P[i][j]);
      }
    }
  }
  
  return entropy / THEORY_COUNT;
}

/**
 * Compute stationary distribution via power method
 */
function computeStationaryDistribution(P: number[][]): number[] {
  // Start with uniform distribution
  let dist = Array(THEORY_COUNT).fill(1 / THEORY_COUNT);
  
  // Power iteration
  for (let iter = 0; iter < 100; iter++) {
    const newDist = Array(THEORY_COUNT).fill(0);
    
    for (let i = 0; i < THEORY_COUNT; i++) {
      for (let j = 0; j < THEORY_COUNT; j++) {
        newDist[j] += dist[i] * P[i][j];
      }
    }
    
    // Normalize
    const sum = newDist.reduce((a, b) => a + b, 0);
    dist = newDist.map(d => d / sum);
  }
  
  return dist;
}

/**
 * Detect cycles in theory sequence
 */
function detectCycles(
  theorySequence: TheoryID[]
): Array<{ cycle: TheoryID[]; length: number; frequency: number }> {
  const cycles: Map<string, number> = new Map();
  
  // Look for cycles of length 2-5
  for (let len = 2; len <= 5; len++) {
    for (let i = 0; i < theorySequence.length - len; i++) {
      const cycle = theorySequence.slice(i, i + len);
      const key = cycle.join('->');
      
      // Check if it forms a cycle (starts and ends same)
      if (cycle[0] === cycle[len - 1]) {
        cycles.set(key, (cycles.get(key) || 0) + 1);
      }
    }
  }
  
  // Convert to array and sort by frequency
  const result: Array<{ cycle: TheoryID[]; length: number; frequency: number }> = [];
  
  cycles.forEach((freq, key) => {
    const cycle = key.split('->').map(Number) as TheoryID[];
    result.push({ cycle, length: cycle.length, frequency: freq });
  });
  
  return result.sort((a, b) => b.frequency - a.frequency).slice(0, 10);
}

/**
 * Find dominant transition paths
 */
function findDominantPaths(
  P: number[][],
  topN: number = 5
): Array<{ from: TheoryID; to: TheoryID; probability: number }> {
  const paths: Array<{ from: TheoryID; to: TheoryID; probability: number }> = [];
  
  for (let i = 0; i < THEORY_COUNT; i++) {
    for (let j = 0; j < THEORY_COUNT; j++) {
      if (P[i][j] > 0.01) {
        paths.push({ 
          from: i as TheoryID, 
          to: j as TheoryID, 
          probability: P[i][j] 
        });
      }
    }
  }
  
  return paths.sort((a, b) => b.probability - a.probability).slice(0, topN);
}

/**
 * Generate theory sequence from market simulation
 */
function generateTheorySequence(
  seed: number,
  length: number,
  regimeType: 'multi' | 'trending' | 'volatile'
): TheoryID[] {
  const sequence: TheoryID[] = [];
  let prices: number[];
  
  switch (regimeType) {
    case 'trending': {
      const rng = new SeededRNG(seed);
      prices = generateTrendingSegment(length, 100, rng);
      break;
    }
    case 'volatile': {
      const rng = new SeededRNG(seed);
      prices = generateVolatileSegment(length, 100, rng);
      break;
    }
    default: {
      const market = generateMultiRegimeSeries(seed, length / 4);
      prices = market.prices;
    }
  }
  
  // Extract windows and compute theory at each step
  const windowSize = 100;
  const transitionHistory: Array<{ from: TheoryID; to: TheoryID; tick: number; distance: number }> = [];
  let currentTheory: TheoryID = 0 as TheoryID;
  
  for (let i = windowSize; i < prices.length; i += 50) {
    const window = prices.slice(i - windowSize, i);
    const stats = computeStats(window);
    
    const result = gei(stats, window, currentTheory, transitionHistory, sequence.length);
    sequence.push(result.selectedTheory);
    currentTheory = result.selectedTheory;
  }
  
  return sequence;
}

/**
 * Main experiment runner
 */
export function runDynamicsExperiment(): {
  pass: boolean;
  results: {
    multiRegime: {
      sequenceLength: number;
      transitions: number;
      transitionEntropy: number;
      stationaryDistribution: number[];
      dominantPaths: Array<{ from: TheoryID; to: TheoryID; probability: number }>;
      cycles: Array<{ cycle: TheoryID[]; length: number; frequency: number }>;
    };
    trending: {
      sequenceLength: number;
      transitions: number;
      transitionEntropy: number;
      stationaryDistribution: number[];
    };
    volatile: {
      sequenceLength: number;
      transitions: number;
      transitionEntropy: number;
      stationaryDistribution: number[];
    };
  };
  hypothesis: boolean;
  metric: string;
} {
  console.log('\n=== EXPERIMENT 12: Theory Dynamics (Markov Structure) ===\n');
  
  const simLength = 5000;
  
  // Generate sequences for different regime types
  console.log('Generating theory sequences...');
  
  console.log('  - Multi-regime simulation...');
  const multiSequence = generateTheorySequence(42, simLength, 'multi');
  
  console.log('  - Trending simulation...');
  const trendingSequence = generateTheorySequence(43, simLength, 'trending');
  
  console.log('  - Volatile simulation...');
  const volatileSequence = generateTheorySequence(44, simLength, 'volatile');
  
  // Build transition matrices
  console.log('Building transition matrices...');
  
  const multiP = buildTransitionMatrix(multiSequence);
  const trendingP = buildTransitionMatrix(trendingSequence);
  const volatileP = buildTransitionMatrix(volatileSequence);
  
  // Compute metrics
  console.log('Computing metrics...\n');
  
  const multiEntropy = computeTransitionEntropy(multiP);
  const trendingEntropy = computeTransitionEntropy(trendingP);
  const volatileEntropy = computeTransitionEntropy(volatileP);
  
  const multiStationary = computeStationaryDistribution(multiP);
  const trendingStationary = computeStationaryDistribution(trendingP);
  const volatileStationary = computeStationaryDistribution(volatileP);
  
  const multiDominantPaths = findDominantPaths(multiP);
  const multiCycles = detectCycles(multiSequence);
  
  // Print results
  console.log('MULTI-REGIME DYNAMICS:');
  console.log('======================');
  console.log(`Sequence length: ${multiSequence.length}`);
  console.log(`Transitions: ${multiSequence.length - 1}`);
  console.log(`Transition entropy: ${multiEntropy.toFixed(4)}`);
  
  console.log('\nStationary distribution:');
  for (let t = 0; t < THEORY_COUNT; t++) {
    console.log(`  Theory ${t}: ${(multiStationary[t] * 100).toFixed(1)}%`);
  }
  
  console.log('\nDominant transitions:');
  for (const path of multiDominantPaths) {
    console.log(`  ${path.from} → ${path.to}: ${(path.probability * 100).toFixed(1)}%`);
  }
  
  console.log('\nDetected cycles:');
  for (const cycle of multiCycles.slice(0, 5)) {
    console.log(`  ${cycle.cycle.join(' -> ')}: ${cycle.frequency} times`);
  }
  
  console.log('\nTRENDING MARKET:');
  console.log('================');
  console.log(`Transition entropy: ${trendingEntropy.toFixed(4)}`);
  
  console.log('\nVOLATILE MARKET:');
  console.log('================');
  console.log(`Transition entropy: ${volatileEntropy.toFixed(4)}`);
  
  // HYPOTHESIS: Theory transitions are structured (not random)
  const maxEntropy = Math.log(THEORY_COUNT);
  const normalizedEntropy = multiEntropy / maxEntropy;
  
  const hasDominantPaths = multiDominantPaths.length > 0 && multiDominantPaths[0].probability > 0.3;
  const hasStructure = normalizedEntropy < 0.9;
  const hasCycles = multiCycles.length > 0;
  
  const hypothesis = hasDominantPaths && hasStructure;
  
  console.log(`\nHYPOTHESIS: ${hypothesis ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`  - Has dominant paths: ${hasDominantPaths ? 'yes' : 'no'}`);
  console.log(`  - Has structure: ${hasStructure ? 'yes' : 'no'} (entropy: ${normalizedEntropy.toFixed(3)})`);
  console.log(`  - Has cycles: ${hasCycles ? 'yes' : 'no'}`);
  
  return {
    pass: hypothesis,
    results: {
      multiRegime: {
        sequenceLength: multiSequence.length,
        transitions: multiSequence.length - 1,
        transitionEntropy: multiEntropy,
        stationaryDistribution: multiStationary,
        dominantPaths: multiDominantPaths,
        cycles: multiCycles,
      },
      trending: {
        sequenceLength: trendingSequence.length,
        transitions: trendingSequence.length - 1,
        transitionEntropy: trendingEntropy,
        stationaryDistribution: trendingStationary,
      },
      volatile: {
        sequenceLength: volatileSequence.length,
        transitions: volatileSequence.length - 1,
        transitionEntropy: volatileEntropy,
        stationaryDistribution: volatileStationary,
      },
    },
    hypothesis,
    metric: `${normalizedEntropy.toFixed(3)} normalized transition entropy`,
  };
}

// Run if called directly
if (require.main === module) {
  const result = runDynamicsExperiment();
  console.log('\n=== FINAL RESULT ===');
  console.log(`Status: ${result.pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Metric: ${result.metric}`);
}
