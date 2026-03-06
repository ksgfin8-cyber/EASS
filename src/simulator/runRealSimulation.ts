/**
 * TN-LAB Simulator — First Real Data Simulation
 * Phase 2: Scientific Market Simulation
 *
 * This script demonstrates the full pipeline:
 * 1. Ingest real market data from Yahoo Finance
 * 2. Run scientific simulation
 * 3. Analyze results
 * 4. Generate reports
 *
 * Usage:
 *   bun run src/simulator/runRealSimulation.ts
 *
 * NO React, NO browser APIs. Pure TypeScript.
 */

import {
  ingestAsset,
  ASSET_PRESETS,
  extractPriceArray,
} from './dataIngestion';
import {
  runScientificSimulation,
  generateExperimentReport,
  SimulationResult,
} from './scientificSimulation';
import {
  analyzeSimulation,
  generateAnalysisReport,
} from './metrics';

// =============================================================================
// SIMULATION CONFIGURATION
// =============================================================================

interface SimulationConfig {
  symbol: string;
  timeframe: '1d' | '1h' | '5m';
  startDate: Date;
  endDate: Date;
  warmupPeriod: number;
  lookbackWindow: number;
}

const CONFIGS: SimulationConfig[] = [
  // Tech stock: high liquidity, clear trends
  {
    symbol: 'AAPL',
    timeframe: '1d',
    startDate: new Date('2023-01-01'),
    endDate: new Date('2024-12-31'),
    warmupPeriod: 50,
    lookbackWindow: 50,
  },
  // Crypto: high volatility, 24/7
  {
    symbol: 'BTC-USD',
    timeframe: '1d',
    startDate: new Date('2023-01-01'),
    endDate: new Date('2024-12-31'),
    warmupPeriod: 50,
    lookbackWindow: 50,
  },
  // Index: broad market, lower volatility
  {
    symbol: '^GSPC',
    timeframe: '1d',
    startDate: new Date('2023-01-01'),
    endDate: new Date('2024-12-31'),
    warmupPeriod: 50,
    lookbackWindow: 50,
  },
];

// =============================================================================
// MAIN EXECUTION
// =============================================================================

/**
 * Run a single simulation and print results.
 */
async function runSingleSimulation(config: SimulationConfig): Promise<SimulationResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔬 TN-LAB Scientific Simulation: ${config.symbol}`);
  console.log('='.repeat(60));

  // Step 1: Ingest data
  console.log(`\n📥 Fetching ${config.symbol} data from Yahoo Finance...`);
  console.log(`   Timeframe: ${config.timeframe}`);
  console.log(`   Period: ${config.startDate.toISOString().split('T')[0]} to ${config.endDate.toISOString().split('T')[0]}`);

  try {
    const assetData = await ingestAsset({
      symbol: config.symbol,
      timeframe: config.timeframe,
      startDate: config.startDate,
      endDate: config.endDate,
      adjustPrices: true,
    });

    console.log(`   ✅ Retrieved ${assetData.metadata.dataPoints} data points`);
    console.log(`   Price range: $${assetData.prices[0].close.toFixed(2)} - $${assetData.prices[assetData.prices.length - 1].close.toFixed(2)}`);

    // Step 2: Run simulation
    console.log(`\n⚙️  Running TN-LAB simulation...`);
    console.log(`   Warmup period: ${config.warmupPeriod}`);
    console.log(`   Lookback window: ${config.lookbackWindow}`);

    const result = runScientificSimulation(
      assetData,
      {
        warmupPeriod: config.warmupPeriod,
        lookbackWindow: config.lookbackWindow,
        recordFullHistory: true,
      },
      {
        name: `Real Data Simulation: ${config.symbol}`,
        description: `TN-LAB simulation on ${config.symbol} real market data`,
        tags: ['scientific', 'real_data', config.symbol],
      }
    );

    console.log(`   ✅ Simulation complete`);
    console.log(`   Experiment ID: ${result.metadata.experimentId}`);

    // Step 3: Analyze results
    console.log(`\n📊 Computing analysis metrics...`);

    const analysis = analyzeSimulation(result);

    console.log(`   ✅ Analysis complete`);

    // Step 4: Print summary
    console.log(`\n📋 SIMULATION SUMMARY`);
    console.log(`─`.repeat(40));
    console.log(`   Active Ticks: ${result.summary.activeTicks}`);
    console.log(`   Avg Φ: ${result.summary.avgPhi.toFixed(4)}`);
    console.log(`   Std Φ: ${result.summary.stdPhi.toFixed(4)}`);
    console.log(`   Theory Transitions: ${result.summary.transitionCount}`);
    console.log(`   Dominant Theory: ${result.summary.dominantTheory}`);
    console.log(`   Avg Entropy: ${result.summary.avgEntropy.toFixed(4)}`);

    // Invariant rates
    console.log(`\n🔒 INVARIANT SATISFACTION`);
    console.log(`─`.repeat(40));
    console.log(`   I1 (Var(Φ) < 0.1): ${(result.invariantRates.I1 * 100).toFixed(1)}%`);
    console.log(`   I2 (Γ deterministic): ${(result.invariantRates.I2 * 100).toFixed(1)}%`);
    console.log(`   I3 (0 ≤ Φ ≤ 1): ${(result.invariantRates.I3 * 100).toFixed(1)}%`);
    console.log(`   I4 (Unique theory): ${(result.invariantRates.I4 * 100).toFixed(1)}%`);
    console.log(`   I5 (H(T) > 0.5): ${(result.invariantRates.I5 * 100).toFixed(1)}%`);

    // Phi stability
    console.log(`\n📈 Φ STABILITY`);
    console.log(`─`.repeat(40));
    console.log(`   Stability Score: ${analysis.phiStability.stabilityScore.toFixed(4)}`);
    console.log(`   CV: ${analysis.phiStability.coefficientOfVariation.toFixed(4)}`);
    console.log(`   Trend: ${analysis.phiStability.trend.toFixed(6)}`);
    console.log(`   Autocorrelation: ${analysis.phiStability.autocorrelation.toFixed(4)}`);

    // Theory dynamics
    console.log(`\n🎯 THEORY DYNAMICS`);
    console.log(`─`.repeat(40));
    console.log(`   Theory Entropy: ${analysis.theoryDynamics.entropy.toFixed(4)}`);
    console.log(`   Persistence: ${analysis.theoryDynamics.persistence.toFixed(2)} ticks`);
    console.log(`   Switch Rate: ${(analysis.theoryDynamics.switchRate * 100).toFixed(2)}%`);

    // Correlations
    console.log(`\n🔗 CORRELATIONS`);
    console.log(`─`.repeat(40));
    console.log(`   Φ ↔ Regime: ${analysis.correlation.phiRegimeCorrelation.toFixed(4)}`);
    console.log(`   Φ ↔ Returns: ${analysis.correlation.phiReturnCorrelation.toFixed(4)}`);
    console.log(`   Signal ↔ Returns: ${analysis.correlation.signalReturnCorrelation.toFixed(4)}`);

    // Step 5: Generate reports
    console.log(`\n📄 Generating reports...`);

    const experimentReport = generateExperimentReport(result);
    const analysisReport = generateAnalysisReport(result, analysis);

    console.log(`   ✅ Experiment report generated`);
    console.log(`   ✅ Analysis report generated`);

    // Save reports to console (in production, save to files)
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 EXPERIMENT REPORT`);
    console.log('='.repeat(60));
    console.log(experimentReport);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📈 ANALYSIS REPORT`);
    console.log('='.repeat(60));
    console.log(analysisReport);

    return result;
  } catch (error) {
    console.error(`   ❌ Error: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Main execution function.
 */
async function main(): Promise<void> {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           TN-LAB Scientific Simulation Runner               ║
║                    Phase 2: Real Data                        ║
╠══════════════════════════════════════════════════════════════╣
║  This is a SCIENTIFIC RESEARCH tool, NOT for trading.       ║
║  Purpose: Study TN-LAB behavior with real market data.      ║
╚══════════════════════════════════════════════════════════════╝
  `);

  const results: Array<{ symbol: string; result: SimulationResult }> = [];

  for (const config of CONFIGS) {
    try {
      const result = await runSingleSimulation(config);
      results.push({ symbol: config.symbol, result });
    } catch (error) {
      console.error(`\n❌ Simulation failed for ${config.symbol}: ${(error as Error).message}`);
      // Continue with other simulations
    }
  }

  // Cross-asset comparison
  if (results.length > 1) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 CROSS-ASSET COMPARISON`);
    console.log('='.repeat(60));

    console.log(`\n| Asset | Avg Φ | Std Φ | Transitions | Dominant Theory |`);
    console.log(`|-------|-------|-------|-------------|-----------------|`);

    for (const { symbol, result } of results) {
      console.log(`| ${symbol.padEnd(5)} | ${result.summary.avgPhi.toFixed(4)} | ${result.summary.stdPhi.toFixed(4)} | ${result.summary.transitionCount.toString().padEnd(11)} | ${result.summary.dominantTheory.toString().padEnd(15)} |`);
    }
  }

  console.log(`\n✅ All simulations complete!`);
  console.log(`\n🎯 Next Steps:`);
  console.log(`   1. Analyze the reports above`);
  console.log(`   2. Run sensitivity analysis with parameter variations`);
  console.log(`   3. Compare results across different asset classes`);
  console.log(`   4. Study theory-regime relationships`);
}

// Run if executed directly
main().catch(console.error);
