/**
 * TN-LAB — Run All Experiments
 * Sistema TN (Tortuga Ninja) v3.0
 *
 * Executes all 6 experiments in dependency order and reports results.
 * This is the main validation entry point for TN-LAB.
 *
 * Usage: bun src/experiments/runAll.ts
 */

import { runExperiment1 } from './exp1_regime';
import { runExperiment2 } from './exp2_gei';
import { runExperiment3 } from './exp3_phi';
import { runExperiment4 } from './exp4_trajectory';
import { runExperiment5 } from './exp5_invariants';
import { runExperiment6 } from './exp6_noise';
import { runTheoryActivationExperiment } from './exp7_activation';

const SEED = 42;

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          TN-LAB VALIDATION SUITE v3.0                        ║');
console.log('║          Sistema TN (Tortuga Ninja)                          ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

const results: Array<{ name: string; passed: boolean; time: number }> = [];

function runExperiment(name: string, fn: () => { passed: boolean; details: string[] }) {
  console.log(`\n${'='.repeat(64)}`);
  const start = Date.now();
  try {
    const result = fn();
    const time = Date.now() - start;
    results.push({ name, passed: result.passed, time });

    for (const line of result.details) {
      console.log(line);
    }
    console.log(`\nTime: ${time}ms`);
  } catch (err) {
    const time = Date.now() - start;
    results.push({ name, passed: false, time });
    console.error(`ERROR in ${name}:`, err);
  }
}

// Run experiments in dependency order
runExperiment('Exp 1: Regime Detection', () => runExperiment1(SEED));
runExperiment('Exp 2: GEI Coherence', () => runExperiment2(SEED));
runExperiment('Exp 3: φ Stability', () => runExperiment3(SEED));
runExperiment('Exp 4: Theory Trajectory', () => runExperiment4(SEED));
runExperiment('Exp 5: All Invariants', () => runExperiment5(SEED, 2000)); // Reduced for speed
runExperiment('Exp 6: Noise Robustness', () => runExperiment6(SEED));
runExperiment('Exp 7: Theory Activation', () => runTheoryActivationExperiment(SEED));

// Final report
console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║                    FINAL REPORT                              ║');
console.log('╠══════════════════════════════════════════════════════════════╣');

let allPassed = true;
for (const { name, passed, time } of results) {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`║  ${status}  ${name.padEnd(40)} ${String(time + 'ms').padStart(8)} ║`);
  if (!passed) allPassed = false;
}

console.log('╠══════════════════════════════════════════════════════════════╣');
const passCount = results.filter(r => r.passed).length;
const totalTime = results.reduce((s, r) => s + r.time, 0);
console.log(`║  ${passCount}/${results.length} experiments passed                                    ║`);
console.log(`║  Total time: ${totalTime}ms                                          ║`);
console.log(`║  Overall: ${allPassed ? '✅ ALL PASSED' : '❌ SOME FAILED'}                                    ║`);
console.log('╚══════════════════════════════════════════════════════════════╝');

if (!allPassed) {
  process.exit(1);
}
