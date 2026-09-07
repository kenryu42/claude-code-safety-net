import { describe, expect, test } from 'bun:test';
import { DEFAULT_GUI_POLICY } from '@/core/policy/store';
import { renderPages, sliceBlock } from '../helpers/gui-page';

/**
 * The project draft the page edits: a sparse proposal built from the fields the user marked, the
 * entry snapshot that decides whether anything is unsaved, and the overlay that shows the marked
 * fields on top of the user policy. The block is sliced out of the served page and run
 * over a policy of its own.
 */

// Token-shaped, assembled here rather than written out, and fixed so the slice is deterministic.
const TOKEN = Buffer.from('cc-safety-net gui draft fixture').toString('base64url');

const RULE_ID = 'destructive.git-push-force';
const MARKED_RULE = `destructive_command_protection.overrides.${RULE_ID}`;

type Policy = typeof DEFAULT_GUI_POLICY;
type Proposal = Record<string, unknown>;

type DraftBlock = {
  clonePolicy: (policy: Policy) => Policy;
  collectProjectProposal: (marked: Set<string>, policy: Policy) => Proposal;
  projectMarkedFields: (projection: Proposal) => string[];
  overlayProjectProposal: (baseline: Policy, proposal: Proposal) => Policy;
  seedProjectDraft: (data: {
    baseline: Policy | null;
    projection?: Proposal;
    userPolicyDiagnostics: string[];
  }) => { baseline: Policy; marked: Set<string>; policy: Policy; snapshot: string } | null;
};

const pages = renderPages(TOKEN);
const block = (page: string) => sliceBlock(page, 'var clonePolicy = ', 'var collectFormPolicy = ');
const draft = new Function(
  `${block(pages.ported)}\nreturn { clonePolicy, collectProjectProposal, projectMarkedFields, overlayProjectProposal, seedProjectDraft };`,
)() as DraftBlock;

/** A user policy the project draft can weaken: strict, with one destructive rule switched off. */
const baseline = (): Policy => ({
  ...(JSON.parse(JSON.stringify(DEFAULT_GUI_POLICY)) as Policy),
  safety: { level: 'strict', overrides: {} },
  destructive_command_protection: {
    enabled: true,
    overrides: { [RULE_ID]: 'off' },
    allow_paths: [],
  },
});

describe('the project draft block on the served page', () => {
  test('proposes the marked fields and nothing else', () => {
    const policy = baseline();

    expect(draft.collectProjectProposal(new Set(['safety.level']), policy)).toStrictEqual({
      version: 1,
      safety: { level: 'strict' },
    });
    expect(draft.collectProjectProposal(new Set([MARKED_RULE]), policy)).toStrictEqual({
      version: 1,
      destructive_command_protection: { overrides: { [RULE_ID]: 'off' } },
    });
    // Nothing marked is an empty proposal, and the audit section the policy carries is user scope
    // only, so no marking can put it in a project file.
    expect(draft.collectProjectProposal(new Set(), policy)).toStrictEqual({ version: 1 });
    expect(
      draft.collectProjectProposal(
        new Set(['safety.level', MARKED_RULE, 'audit.retention_days']),
        policy,
      ),
    ).toStrictEqual({
      version: 1,
      safety: { level: 'strict' },
      destructive_command_protection: { overrides: { [RULE_ID]: 'off' } },
    });
  });

  test('reads dirtiness off field presence, not off the effective values', () => {
    const seeded = draft.seedProjectDraft({
      baseline: baseline(),
      projection: { safety: { level: 'strict' } },
      userPolicyDiagnostics: [],
    });
    if (!seeded) throw new Error('the draft refused a policy it should have entered');
    const dirty = (marked: Set<string>) =>
      JSON.stringify(draft.collectProjectProposal(marked, seeded.policy)) !== seeded.snapshot;

    expect([...seeded.marked]).toStrictEqual(['safety.level']);
    expect(dirty(seeded.marked)).toBeFalse();
    // The project file would stop setting the level, so the draft is unsaved even though the
    // level the user sees does not move.
    expect(seeded.policy.safety.level).toBe('strict');
    expect(dirty(new Set())).toBeTrue();
    expect(dirty(new Set(['safety.level', MARKED_RULE]))).toBeTrue();
  });

  test('rebuilds exactly what it entered with when a draft is discarded', () => {
    const entered = baseline();
    const seeded = draft.seedProjectDraft({
      baseline: entered,
      projection: {
        safety: { level: 'standard' },
        destructive_command_protection: { overrides: { [RULE_ID]: 'off' } },
      },
      userPolicyDiagnostics: [],
    });
    if (!seeded) throw new Error('the draft refused a policy it should have entered');
    const snapshot = JSON.parse(seeded.snapshot) as Proposal;
    const restored = draft.overlayProjectProposal(seeded.baseline, snapshot);

    expect(
      JSON.stringify(
        draft.collectProjectProposal(new Set(draft.projectMarkedFields(snapshot)), restored),
      ),
    ).toBe(seeded.snapshot);
    // The overlay shows the project's weakening on top of the user policy without touching it.
    expect(restored.safety.level).toBe('standard');
    expect(entered.safety.level).toBe('strict');
  });

  test('refuses to enter a draft while the user policy cannot be read', () => {
    expect(
      draft.seedProjectDraft({ baseline: baseline(), userPolicyDiagnostics: ['unreadable'] }),
    ).toBeNull();
    expect(draft.seedProjectDraft({ baseline: null, userPolicyDiagnostics: [] })).toBeNull();
  });
});
