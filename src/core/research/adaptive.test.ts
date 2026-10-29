import { expect, it } from 'vitest';
import { EvidenceScheduler } from './adaptive';
import { auditAdequacy } from './adequacy';
import { compileTest } from '../testHelpers';
import { branchMutation } from './diagnose';

it('prioritizes supplied inputs, explores unseen generators and counts marginal evidence only', () => {
    const s = new EvidenceScheduler();
    expect(s.choose([{ origin: 'random' }, { origin: 'provided' }])).toBe(1);
    s.observe('0', 'targeted', 1, 1, 20);
    expect(s.choose([{ origin: 'targeted' }, { origin: 'random' }])).toBe(1);
    s.observe('1', 'random', 1, 1, 30);
    expect(s.history[1].reward).toBe(0);
    expect(s.history[0].reward).toBe(3);
    expect(s.choose([{ origin: 'random' }, { origin: 'targeted' }])).toBe(1);
});
it('honors budgets, records every execution step and still exposes the hidden branch fault', () => {
    const { program, ir } = compileTest('int main(){int n;cin>>n;if(n==137)return 7;return 2;}');
    const audit = auditAdequacy(program, ir, branchMutation(ir), ['300'], [], 20000, { adaptive: true, executionBudget: 156 });
    expect(audit.executions).toBeLessThanOrEqual(156);
    expect(audit.scheduling!.decisions.reduce((n, d) => n + d.steps, 0)).toBe(audit.planningSteps);
    expect(audit.probes.some(p => p.status === 'subject-mismatch')).toBe(true);
    const zero = auditAdequacy(program, ir, ir, ['300'], [], 20000, { adaptive: true, executionBudget: 0 });
    expect(zero.executions).toBe(0);
    expect(zero.scheduling!.remainingInputs).toBeGreaterThan(0);
});
