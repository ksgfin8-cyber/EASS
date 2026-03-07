/**
 * TN-LAB Experiment 19: Geometry of Market State Space
 * 
 * Phase 3: Scientific Validation Framework
 * 
 * OBJECTIVE:
 * Analyze the geometric structure of H-space (market state space)
 * using synthetic data from different generators.
 * 
 * METHODOLOGY:
 * 1. Generate H-vectors from different generator types
 * 2. Apply PCA to find effective dimensionality
 * 3. Compute intrinsic dimension estimate
 * 4. Analyze cluster structure
 * 
 * HYPOTHESIS:
 * H0: H-space is uniformly distributed (no structure)
 * H1: H-space has low-dimensional manifold structure
 * H1: Different generators form distinct clusters
 * 
 * NO React, NO browser APIs. Pure TypeScript math.
 */

import { SufficientStats, PhiResult } from '../engine/types';
import { computePhi } from '../engine/phi';
import { TheoryID } from '../engine/types';
import { analyzeHSpaceGeometry, HSpaceGeometry } from '../simulator/metrics';

// =============================================================================
// SEEDED RNG
// =============================================================================

class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  gaussian(): number {
    const u1 = this.next() + 1e-10;
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// =============================================================================
// GENERATORS
// =============================================================================

interface GeneratorConfig {
  name: string;
  trendStrength: number;
  volatility: number;
  meanReversion: number;
}

const GENERATORS: GeneratorConfig[] = [
  { name: 'Random Walk', trendStrength: 0, volatility: 1.0, meanReversion: 0 },
  { name: 'Trend', trendStrength: 0.005, volatility: 1.0, meanReversion: 0 },
  { name: 'Mean Reversion', trendStrength: 0, volatility: 1.0, meanReversion: 0.1 },
  { name: 'Regime Switch', trendStrength: 0.002, volatility: 1.5, meanReversion: 0 },
];

function generateSeries(config: GeneratorConfig, length: number, seed: number): number[] {
  const rng = new SeededRNG(seed);
  const prices: number[] = [100];
  let regime = 1;
  
  for (let i = 1; i < length; i++) {
    if (config.name === 'Regime Switch' && rng.next() < 0.05) {
      regime = -regime;
    }
    const trend = regime * config.trendStrength * prices[i - 1];
    const reversion = config.meanReversion * (100 - prices[i - 1]);
    const noise = rng.gaussian() * config.volatility * prices[i - 1] * 0.1;
    prices.push(prices[i - 1] + trend + reversion + noise);
  }
  
  return prices;
}

function extractHVector(prices: number[]): number[] {
  const windowSize = 50;
  if (prices.length < windowSize + 1) return [];
  
  const window = prices.slice(-windowSize);
  const mean = window.reduce((s, x) => s + x, 0) / window.length;
  const variance = window.reduce((s, x) => s + (x - mean) ** 2, 0) / window.length;
  
  const returns: number[] = [];
  for (let i = 1; i < window.length; i++) {
    returns.push((window[i] - window[i - 1]) / window[i - 1]);
  }
  
  const volatility = Math.sqrt(returns.reduce((s, x) => s + x * x, 0) / returns.length);
  
  let autocorr = 0;
  if (returns.length > 1) {
    const meanRet = returns.reduce((s, x) => s + x, 0) / returns.length;
    let num = 0, den = 0;
    for (let i = 1; i < returns.length; i++) {
      num += (returns[i] - meanRet) * (returns[i - 1] - meanRet);
      den += (returns[i] - meanRet) ** 2;
    }
    autocorr = den > 0 ? num / den : 0;
  }
  
  return [
    mean,
    variance,
    volatility,
    autocorr,
    Math.log(Math.max(...window.slice(-20)) / Math.min(...window.slice(-20))),
  ];
}

// =============================================================================
// MAIN EXPERIMENT
// =============================================================================

export interface Exp19Result {
  geometry: HSpaceGeometry;
  nGenerators: number;
  samplesPerGenerator: number;
  totalSamples: number;
}

export async function runExp19(
  samplesPerGenerator: number = 200
): Promise<Exp19Result> {
  console.log('\\n🔬 EXPERIMENT 19: Geometry of Market State Space');
  console.log('===================================================');
  console.log(`Samples per generator: ${samplesPerGenerator}`);
  
  const hVectors: number[][] = [];
  const labels: string[] = [];
  
  for (const gen of GENERATORS) {
    console.log(`Generating: ${gen.name}`);
    
    for (let i = 0; i < samplesPerGenerator; i++) {
      const seed = GENERATORS.indexOf(gen) * 10000 + i;
      const prices = generateSeries(gen, 200, seed);
      const hVec = extractHVector(prices);
      
      if (hVec.length > 0) {
        hVectors.push(hVec);
        labels.push(gen.name);
      }
    }
  }
  
  console.log(`Total H-vectors: ${hVectors.length}`);
  
  const geometry = analyzeHSpaceGeometry(hVectors);
  
  return {
    geometry,
    nGenerators: GENERATORS.length,
    samplesPerGenerator,
    totalSamples: hVectors.length,
  };
}

export function formatExp19Report(result: Exp19Result): string {
  const { geometry } = result;
  
  let report = `# TN-LAB Experiment 19: Geometry of Market State Space

## Configuration
- **Generators**: ${GENERATORS.map(g => g.name).join(', ')}
- **Samples per generator**: ${result.samplesPerGenerator}
- **Total samples**: ${result.totalSamples}

## H-Space Geometry Analysis

### Dimensionality
- **Original Dimension**: ${geometry.originalDim}
- **Intrinsic Dimension**: ${geometry.intrinsicDim.dimension} (${geometry.intrinsicDim.method})
- **Quality**: ${geometry.intrinsicDim.quality.toFixed(4)}

### PCA Results
- **Components for 95% Variance**: ${geometry.pca.componentsFor95Variance}
- **Kaiser Dimension**: ${geometry.pca.kaiserDimension}

### Top Eigenvalues
| Component | Eigenvalue | Variance % |
|-----------|------------|------------|
`;

  for (let i = 0; i < Math.min(5, geometry.eigenvalues.length); i++) {
    report += `| ${i + 1} | ${geometry.eigenvalues[i].toFixed(4)} | ${(geometry.pca.explainedVarianceRatio[i] * 100).toFixed(2)}% |\n`;
  }

  report += `
## Interpretation

The H-space has intrinsic dimension **${geometry.intrinsicDim.dimension}** out of ${geometry.originalDim} dimensions.
${geometry.intrinsicDim.dimension < geometry.originalDim / 2 
  ? '✓ The H-space shows low-dimensional structure (manifold hypothesis supported)' 
  : '✗ The H-space does not show strong low-dimensional structure'}

---
*Generated by TN-LAB Exp19 v5.5*
`;

  return report;
}

// =============================================================================
// MAIN
// =============================================================================

if (require.main === module) {
  runExp19(200).then(result => {
    console.log('\\n' + formatExp19Report(result));
  }).catch(error => {
    console.error('Experiment failed:', error);
    process.exit(1);
  });
}
