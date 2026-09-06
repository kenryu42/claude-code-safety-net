import { commandSignature, formatRelativeTime } from '@/audit/display';
import { SAFETY_LEVEL_CAPABILITIES, type SafetyLevelCapability } from '@/core/policy/safety-level';
import { integrationDisplayNames } from '@/hosts/catalog';

type SafetyLevel = 'standard' | 'strict' | 'paranoid';
type Capability = SafetyLevelCapability;
type RuleOverrides = Record<string, 'on' | 'off'>;
type Policy = {
  version: number;
  safety: {
    level: SafetyLevel;
    overrides: Record<SafetyLevelCapability, boolean | undefined>;
  };
  workflow: { worktree_mode: boolean };
  destructive_command_protection: {
    enabled: boolean;
    overrides: RuleOverrides;
    allow_paths: string[];
  };
  secret_protection: {
    enabled: boolean;
    overrides: RuleOverrides;
    deny_paths: string[];
    allow_paths: string[];
  };
  audit: { retention_days: number };
};
type RuleState = {
  enabled: boolean;
  inheritedEnabled: boolean;
  source: string;
  changesInherited: boolean;
};
type Preview = {
  counts: { enabled: number; disabled: number; effectiveCustomizations: number };
  rules: Record<string, RuleState>;
  capabilities: Record<string, { source: string; sources: string[] }>;
};
type DestructiveRule = {
  id: string;
  label: string;
  description: string;
  category: string;
  example: string;
  catastrophic?: boolean;
  activationCapability?: Capability;
};
type SecretRule = {
  id: string;
  label: string;
  description?: string;
  category: string;
  defaultOff?: boolean;
  paths?: string[];
};
type PolicyState = {
  policy: Policy;
  preview: Preview | null;
  destructiveCommandRules: DestructiveRule[];
  secretPatterns: SecretRule[];
  errors: string[];
  raw: string;
  path: string;
  exists: boolean;
  version: string;
  configState?: { state: string; reason: string };
  projectPolicy?: { path: string; weakenings: string[] };
};
type FeedEntry = {
  ts: string;
  decision: string;
  agent?: string;
  ruleId?: string;
  segment?: string;
  command?: string;
  reason?: string;
  failureStage?: string;
  sessionId?: string;
  cwd?: string;
};
type ActivityFeed = {
  days: number;
  entries: FeedEntry[];
  totalInWindow: number;
  truncated: boolean;
  unreadable: number;
  logsDir?: string | null;
  homeDir?: string | null;
  counts: {
    blocked: number;
    allowed: number;
    errors: number;
    rules: Record<string, number>;
    commands: Record<string, number>;
    agents: Record<string, number>;
    blockedByDay: number[];
    analyzedByDay: number[];
  };
};
type IntegrationRow = {
  target: string;
  label: string;
  version: string | null;
  status: 'active' | 'disabled' | 'not-installed' | 'not-inspected';
  note?: { kind: string; text: string };
};
type Integrations = {
  targets: IntegrationRow[];
  system: { version: string; nodeVersion: string | null; platform: string };
};
type CustomRule = {
  name: string;
  command: string;
  subcommand?: string;
  block_args: string[];
  reason: string;
};
type RulesData = {
  projectPath: string;
  canPickDirectory: boolean;
  rulebooks: { name: string; version: string; spec: string; source: string; rules: CustomRule[] }[];
  errors: string[];
  warnings: string[];
};
type StarContext = { starred: boolean | null; starCount: number | null; blockedTotal: number };
type Tier = 'normal' | 'strict' | 'paranoid';
type ThemePref = 'auto' | 'light' | 'dark';
type PathListConfig = {
  field: string;
  getPaths: () => string[];
  setPaths: (paths: string[]) => void;
  isDisabled: () => boolean;
  itemLabel: string;
  validateAdditions?: (paths: string[]) => Promise<unknown>;
};
type ConfirmOptions = {
  title: string;
  body: string;
  detail?: string;
  confirmLabel: string;
  confirmClass?: string;
  rowsHtml?: string;
};
// A project policy carries only the fields it sets - the same presence-aware
// shape the server projects an existing project file into, so one type covers
// both the loaded projection and the proposal the draft collects.
type ProjectProposal = {
  version?: number;
  safety?: { level?: SafetyLevel; overrides?: Record<string, boolean> };
  workflow?: { worktree_mode?: boolean };
  destructive_command_protection?: {
    enabled?: boolean;
    overrides?: RuleOverrides;
    allow_paths?: string[];
  };
  secret_protection?: {
    enabled?: boolean;
    overrides?: RuleOverrides;
    deny_paths?: string[];
    allow_paths?: string[];
  };
};
type ProjectDraftState = {
  dir: string;
  path: string;
  revision: number;
  canPickDirectory: boolean;
  baseline: Policy;
  // The proposal the draft entered with, so "dirty" can compare field presence
  // and not only values.
  snapshot: string;
};

// The one value the server injects per request, carried in a JSON data tag.
// page.html always ships the tag with its payload, so it is read as present —
// the same call the qs() helper below makes for every other element.
const token = (
  JSON.parse((document.getElementById('ccsn-data') as HTMLElement).textContent as string) as {
    token: string;
  }
).token;
const fallbackRepoUrl = 'https://github.com/kenryu42/cc-safety-net';
const safetyLevels: Record<SafetyLevel, [string, string]> = {
  standard: [
    'Standard',
    'Blocks recognizable destructive commands and sensitive content access while allowing metadata-only sensitive-path checks. Recommended for normal coding.',
  ],
  strict: [
    'Strict',
    'Standard, plus blocks dynamic or unparseable commands and metadata-only sensitive-path discovery. Occasional false positives on advanced shell.',
  ],
  paranoid: [
    'Paranoid',
    'Strict, plus blocks rm -rf inside your project and interpreter one-liners. Expect friction; for untrusted agents or high-stakes repos.',
  ],
};
const safetyOverrides: Record<Capability, [string, string]> = {
  fail_closed: ['Fail closed', 'Block commands the parser cannot fully understand.'],
  paranoid_rm: ['Paranoid rm -rf checks', 'Block non-temp rm -rf inside the project.'],
  paranoid_interpreters: ['Paranoid interpreters', 'Block interpreter one-liners.'],
};
const rawCopyIcons = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2"></path></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>',
};
const starIcons = {
  outline:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>',
  filled:
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>',
};
const reportIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><path d="M4 22v-7"></path></svg>';
const pathListIcons = {
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
  remove:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6M14 11v6"></path></svg>',
};
let state: PolicyState | undefined;
let draftPolicy: Policy;
// Project draft mode: null in user mode. `draftPolicy` keeps holding the values
// on screen - the baseline with the marked fields laid over it - and these two
// carry what only the project scope knows: where it writes, and which fields it
// claims.
let projectDraft: ProjectDraftState | null = null;
let markedFields = new Set<string>();
let preview: Preview | null;
let previewRequestId = 0;
let dirty = false;
let searchActive = false;
const OVERVIEW_DAYS = 7;
const DEFAULT_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 365;
let overview: ActivityFeed | null = null;
let activity: ActivityFeed | null = null;
let knownRuleIds = new Set<string>();
const activityFilters = { days: 7, decision: 'all', agent: 'all', query: '', command: '' };
const tierExpanded = new Map([
  ['enforced', false],
  ['normal', false],
  ['strict', false],
  ['paranoid', false],
]);
const searchCollapsedTiers = new Set<string>();
const secretGroupExpanded = new Map<string, boolean>();
const searchCollapsedSecretGroups = new Set<string>();
let rawCopyResetTimer: number | null = null;
let feedCopyResetTimer: number | null = null;
let activityQueryTimer: number | undefined;
let renderedFeedEntries: FeedEntry[] = [];
let suspects = new Set<FeedEntry>();
let activeStarContext: StarContext = { starred: null, starCount: null, blockedTotal: 0 };
let integrations: Integrations | null = null;
let integrationsRequested = false;
const integrationBusy = new Set<string>();
let rulesData: RulesData | null = null;
let rulesRequested = false;
let rulesScope = 'project';
let pendingRuleFocus: string | null = null;
// Set once a dialog that detection said was available failed to open, so a
// later refresh cannot re-lock the field behind a button that does not work.
let directoryPickerFailed = false;
const api = (path: string, init: RequestInit = {}) =>
  fetch(`${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-cc-safety-net-token': token,
      ...(init.headers || {}),
    },
  });
// Both outcomes carry both fields so a caller can read either without proving
// which one it got; `data` is whatever the endpoint returned, unverified until a
// reader's own guard proves its shape.
const requestJson = async (path: string, init?: RequestInit) => {
  try {
    const response = await api(path, init);
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      data: text ? JSON.parse(text) : {},
      error: undefined,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: undefined,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
type RequestResult = Awaited<ReturnType<typeof requestJson>>;
const errorText = (result: RequestResult) =>
  result.error ??
  (Array.isArray(result.data?.errors) && result.data.errors.length
    ? result.data.errors.join('\n')
    : null) ??
  result.data?.error ??
  `Request failed (status ${result.status}).`;
const isWriteSuccess = (result: RequestResult) =>
  result.ok && !(Array.isArray(result.data?.errors) && result.data.errors.length > 0);
// Every id this reads is in page.html, so the element is asserted rather than
// null-checked at each of the call sites.
const qs = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const setDetailStatus = (text: string, kind = '') => {
  qs('status').textContent = text;
  qs('status').className = `status ${kind}`;
};
let appStatusTimer: number | undefined;
const setAppStatus = (text: string, kind = '') => {
  qs('app-status').textContent = text;
  qs('app-status').className = `app-status ${kind}`;
  clearTimeout(appStatusTimer);
  if (kind === 'ok') appStatusTimer = setTimeout(() => setAppStatus(''), 4000);
};
let busy = false;
const updateActions = () => {
  const hasErrors = (state?.errors.length ?? 0) > 0;
  qs<HTMLButtonElement>('save').disabled = busy || !state || hasErrors;
  qs<HTMLButtonElement>('reset').disabled = busy || !state;
  qs<HTMLButtonElement>('repair').disabled = busy || !hasErrors;
};
const runExclusive = async (pendingText: string, fn: () => Promise<void>) => {
  if (busy) return;
  busy = true;
  updateActions();
  setAppStatus(pendingText);
  setDetailStatus('');
  try {
    await fn();
  } finally {
    busy = false;
    updateActions();
  }
};
const checkbox = (checked: boolean) => (checked ? 'checked' : '');
// Retention goes down to 1, so every window label has to survive the singular.
const dayCount = (days: number) => `${days} day${days === 1 ? '' : 's'}`;
const syncMasterBadges = () => {
  document.querySelectorAll<HTMLInputElement>('label.row.master input').forEach((input) => {
    const badge = input.closest('label')?.querySelector('.master-badge');
    if (badge) badge.textContent = input.checked ? 'On' : 'Off';
  });
};
const escapeHtml = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char] ?? char,
  );
const clonePolicy = (policy: Policy): Policy => JSON.parse(JSON.stringify(policy));
const pathLines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
const formatPolicy = (policy: unknown) => `${JSON.stringify(policy, null, 2)}\n`;
// A rule the draft cleared has no value to write, so a marked field with nothing
// behind it collapses to absence rather than an entry the server would reject.
const markedOverrides = (
  marked: Set<string>,
  section: string,
  overrides: Record<string, unknown>,
) =>
  Object.fromEntries(
    Object.entries(overrides).filter(
      ([key, value]) => value !== undefined && marked.has(`${section}.overrides.${key}`),
    ),
  );
const withOverrides = (overrides: Record<string, unknown>) =>
  Object.keys(overrides).length > 0 ? { overrides } : {};
// Only the marked fields reach the project file: an unmarked field inherits from
// each member's user policy at load time, and writing it out would pin one
// member's value - a materialized "standard" level over a stricter user policy -
// on the whole project.
const collectProjectProposal = (marked: Set<string>, policy: Policy) => {
  const sections: Record<string, Record<string, unknown>> = {
    safety: {
      ...(marked.has('safety.level') ? { level: policy.safety.level } : {}),
      ...withOverrides(markedOverrides(marked, 'safety', policy.safety.overrides)),
    },
    workflow: marked.has('workflow.worktree_mode')
      ? { worktree_mode: policy.workflow.worktree_mode }
      : {},
    destructive_command_protection: {
      ...(marked.has('destructive_command_protection.enabled')
        ? { enabled: policy.destructive_command_protection.enabled }
        : {}),
      ...withOverrides(
        markedOverrides(
          marked,
          'destructive_command_protection',
          policy.destructive_command_protection.overrides,
        ),
      ),
      ...(marked.has('destructive_command_protection.allow_paths')
        ? { allow_paths: policy.destructive_command_protection.allow_paths }
        : {}),
    },
    secret_protection: {
      ...(marked.has('secret_protection.enabled')
        ? { enabled: policy.secret_protection.enabled }
        : {}),
      ...withOverrides(
        markedOverrides(marked, 'secret_protection', policy.secret_protection.overrides),
      ),
      ...(marked.has('secret_protection.deny_paths')
        ? { deny_paths: policy.secret_protection.deny_paths }
        : {}),
      ...(marked.has('secret_protection.allow_paths')
        ? { allow_paths: policy.secret_protection.allow_paths }
        : {}),
    },
  };
  return {
    version: 1,
    ...Object.fromEntries(
      Object.entries(sections).filter(([, fields]) => Object.keys(fields).length > 0),
    ),
  };
};
// An existing project file arrives pre-marked, field by field: the draft must
// never silently drop a field the project already sets.
const projectMarkedFields = (projection: ProjectProposal) => {
  const destructive = projection.destructive_command_protection ?? {};
  const secret = projection.secret_protection ?? {};
  return [
    ...(projection.safety?.level === undefined ? [] : ['safety.level']),
    ...Object.keys(projection.safety?.overrides ?? {}).map((key) => `safety.overrides.${key}`),
    ...(projection.workflow?.worktree_mode === undefined ? [] : ['workflow.worktree_mode']),
    ...(destructive.enabled === undefined ? [] : ['destructive_command_protection.enabled']),
    ...Object.keys(destructive.overrides ?? {}).map(
      (id) => `destructive_command_protection.overrides.${id}`,
    ),
    ...(destructive.allow_paths === undefined
      ? []
      : ['destructive_command_protection.allow_paths']),
    ...(secret.enabled === undefined ? [] : ['secret_protection.enabled']),
    ...Object.keys(secret.overrides ?? {}).map((id) => `secret_protection.overrides.${id}`),
    ...(secret.deny_paths === undefined ? [] : ['secret_protection.deny_paths']),
    ...(secret.allow_paths === undefined ? [] : ['secret_protection.allow_paths']),
  ];
};
// The values the controls show in project mode: the inherited baseline with the
// project's own fields laid over it. Path lists replace rather than union - the
// list under a marked field is the project's own, and the loader still unions it
// with each member's paths.
const overlayProjectProposal = (baseline: Policy, proposal: ProjectProposal) => {
  const displayed = clonePolicy(baseline);
  const destructive = proposal.destructive_command_protection ?? {};
  const secret = proposal.secret_protection ?? {};
  if (proposal.safety?.level) displayed.safety.level = proposal.safety.level;
  Object.assign(displayed.safety.overrides, proposal.safety?.overrides ?? {});
  if (proposal.workflow?.worktree_mode !== undefined)
    displayed.workflow.worktree_mode = proposal.workflow.worktree_mode;
  if (destructive.enabled !== undefined)
    displayed.destructive_command_protection.enabled = destructive.enabled;
  Object.assign(displayed.destructive_command_protection.overrides, destructive.overrides ?? {});
  if (destructive.allow_paths)
    displayed.destructive_command_protection.allow_paths = destructive.allow_paths;
  if (secret.enabled !== undefined) displayed.secret_protection.enabled = secret.enabled;
  Object.assign(displayed.secret_protection.overrides, secret.overrides ?? {});
  if (secret.deny_paths) displayed.secret_protection.deny_paths = secret.deny_paths;
  if (secret.allow_paths) displayed.secret_protection.allow_paths = secret.allow_paths;
  return displayed;
};
// The only path from a project-state response to draft state, so the refusal
// below covers entry, the directory-change reseed, and the stale-revision
// refetch alike: a user policy the runtime cannot read degrades to protective
// defaults, and seeding from those would show them as the inherited baseline.
const seedProjectDraft = (data: {
  baseline?: Policy;
  projection?: ProjectProposal;
  userPolicyDiagnostics?: unknown;
}) => {
  if (!data.baseline) return null;
  if (!Array.isArray(data.userPolicyDiagnostics) || data.userPolicyDiagnostics.length > 0)
    return null;
  const marked = new Set(projectMarkedFields(data.projection ?? {}));
  const policy = overlayProjectProposal(data.baseline, data.projection ?? {});
  return {
    baseline: data.baseline,
    marked,
    policy,
    snapshot: JSON.stringify(collectProjectProposal(marked, policy)),
  };
};
const collectFormPolicy = () => ({
  version: 1,
  safety: {
    level: draftPolicy.safety.level,
    overrides: Object.fromEntries(
      Object.entries(draftPolicy.safety.overrides).filter(
        ([, value]) => typeof value === 'boolean',
      ),
    ),
  },
  workflow: draftPolicy.workflow,
  destructive_command_protection: draftPolicy.destructive_command_protection,
  secret_protection: {
    enabled: draftPolicy.secret_protection.enabled,
    overrides: draftPolicy.secret_protection.overrides,
    deny_paths: draftPolicy.secret_protection.deny_paths,
    allow_paths: draftPolicy.secret_protection.allow_paths,
  },
  audit: draftPolicy.audit,
});
// A marked path list displays only the project's own contribution, but the
// runtime unions it with each member's user paths at load - so the policy the
// preview and command tester evaluate has to be that union, or they misreport
// inherited paths as unprotected.
const effectivePreviewPolicy = (
  policy: ReturnType<typeof collectFormPolicy>,
  baseline: Policy | null,
) => {
  if (!baseline) return policy;
  const union = (user: string[], project: string[]) => [...new Set([...user, ...project])];
  return {
    ...policy,
    destructive_command_protection: {
      ...policy.destructive_command_protection,
      allow_paths: union(
        baseline.destructive_command_protection.allow_paths,
        policy.destructive_command_protection.allow_paths,
      ),
    },
    secret_protection: {
      ...policy.secret_protection,
      deny_paths: union(baseline.secret_protection.deny_paths, policy.secret_protection.deny_paths),
      allow_paths: union(
        baseline.secret_protection.allow_paths,
        policy.secret_protection.allow_paths,
      ),
    },
  };
};
const requestPolicyPreview = (policy = collectFormPolicy()) =>
  requestJson('/api/policy/preview', {
    method: 'POST',
    body: JSON.stringify(policy),
  });
const policyScopeMode = () => (projectDraft ? 'project' : 'user');
// Every control in project mode says whose value it is showing: a chip that
// un-marks the field on click, or the muted hint that it still inherits.
const projectFieldChip = (field: string, compact = false) => {
  if (policyScopeMode() !== 'project') return '';
  if (!markedFields.has(field)) return '<span class="project-chip inherited">Inherited</span>';
  return `<button type="button" class="project-chip" data-unmark-field="${escapeHtml(field)}" title="Set by project - click to inherit again" aria-label="Set by project: ${escapeHtml(field)}. Activate to inherit again.">${compact ? 'Project' : 'Set by project'}</button>`;
};
// A field whose control is a group of rows carries its chip on a line of its own.
const projectFieldLine = (field: string) => {
  const chip = projectFieldChip(field);
  return chip ? `<div class="project-field-line">${chip}</div>` : '';
};
// The chips whose controls are built once by render() rather than by a section
// renderer, so they are refreshed in place instead of rebuilt.
const projectChipSlots: [string, string][] = [
  ['destructive-enabled-chip', 'destructive_command_protection.enabled'],
  ['secret-enabled-chip', 'secret_protection.enabled'],
  ['allow-paths-chip', 'destructive_command_protection.allow_paths'],
  ['deny-paths-chip', 'secret_protection.deny_paths'],
  ['secret-allow-paths-chip', 'secret_protection.allow_paths'],
];
const syncProjectChips = () => {
  projectChipSlots.forEach(([id, field]) => {
    qs(id).innerHTML = projectFieldChip(field);
  });
};
// Marking is what puts a field in the file, and the control that marked it does
// not always re-render itself, so the affordances are refreshed here.
const markProjectField = (field: string) => {
  if (!projectDraft || markedFields.has(field)) return;
  markedFields.add(field);
  renderSafety();
  syncProjectChips();
};
// Un-marking drops a field from the file, so its control goes back to showing the
// inherited value: the display is rebuilt from the baseline with the fields the
// draft still claims laid over it. Deleting the value without this rebuild would
// leave the control showing the project's dropped value as if it were inherited.
const rebuildProjectDisplay = () => {
  if (!projectDraft) return;
  draftPolicy = overlayProjectProposal(
    projectDraft.baseline,
    collectProjectProposal(markedFields, draftPolicy),
  );
  renderPolicySections();
  void refreshPolicyPreview();
};
const unmarkProjectField = (field: string) => {
  if (!projectDraft || !markedFields.has(field)) return;
  markedFields.delete(field);
  rebuildProjectDisplay();
};
const viewNames = ['overview', 'activity', 'policy', 'rules', 'integrations', 'settings'] as const;
type ViewName = (typeof viewNames)[number];
const viewTitles: Record<ViewName, string> = {
  overview: 'Overview',
  activity: 'Activity',
  policy: 'Policy',
  rules: 'Rules',
  integrations: 'Integrations',
  settings: 'Settings',
};
const currentView = (): ViewName => {
  const hash = location.hash.replace('#', '') as ViewName;
  return viewNames.includes(hash) ? hash : 'overview';
};
const applyView = () => {
  const view = currentView();
  document.body.dataset.view = view;
  const hasSearch = view === 'activity' || view === 'policy';
  qs('topbar-title').textContent = viewTitles[view];
  // Search takes the bar's space on these views, but the heading is the only
  // thing naming the current view, so it stays in the accessibility tree.
  qs('topbar-title').classList.toggle('sr-only', hasSearch);
  document.querySelectorAll<HTMLElement>('.topbar-search').forEach((el) => {
    el.hidden = el.dataset.searchView !== view;
  });
  qs('topbar').classList.toggle('has-search', hasSearch);
  document.title = `${viewTitles[view]} · CC Safety Net`;
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach((link) => {
    if (link.dataset.nav === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  qs('dirty-chip').hidden = !dirty || view === 'policy';
  if (view === 'activity') applyFeedClamps(qs('activity-feed'));
  if (view === 'integrations' && !integrationsRequested) {
    integrationsRequested = true;
    void loadIntegrations();
  }
  if (view === 'rules' && !rulesRequested) {
    rulesRequested = true;
    void loadRules();
  }
  // The section is unhidden above, so this is the earliest point a jumped-to
  // rule can be scrolled into view.
  if (view === 'rules' && rulesData && pendingRuleFocus) renderRules();
};
const agentLabels: Record<string, string> = integrationDisplayNames;
const tierCountHtml = (segments: [number, string, string?][]) => {
  const parts = segments
    .filter(([count]) => count > 0)
    .map(([count, label, tone]) =>
      tone ? `<span class="count-${tone}">${count} ${label}</span>` : `${count} ${label}`,
    );
  return parts.length > 0 ? parts.join(' · ') : '0 on';
};
const feedItemHtml = (entry: FeedEntry, index: number) => {
  const deny = entry.decision !== 'allow';
  const badgeClass = entry.failureStage ? 'error' : deny ? 'deny' : 'allow';
  const badgeLabel = entry.failureStage ? 'Error' : deny ? 'Blocked' : 'Allowed';
  return `<article class="feed-item">
    <div class="feed-meta">
      <span class="decision-badge ${badgeClass}">${badgeLabel}</span>
      ${entry.agent && entry.agent !== 'unknown' ? `<span class="agent-badge">${escapeHtml(agentLabels[entry.agent] ?? entry.agent)}</span>` : ''}
      ${entry.ruleId ? (knownRuleIds.has(entry.ruleId) ? `<button type="button" class="rule-id" data-jump-rule="${escapeHtml(entry.ruleId)}" title="Show this rule in Policy">${escapeHtml(entry.ruleId)}</button>` : `<code class="rule-id">${escapeHtml(entry.ruleId)}</code>`) : ''}
      <time datetime="${escapeHtml(entry.ts)}" title="${escapeHtml(entry.ts)}">${formatRelativeTime(entry.ts)}</time>
      <button type="button" class="icon-button feed-copy" data-log-copy="${index}" aria-label="Copy log entry as JSON">${rawCopyIcons.copy}</button>
      ${deny ? `<button type="button" class="icon-button feed-report" data-report-fp="${index}" aria-label="Report false positive" title="Report false positive">${reportIcon}</button>` : `<button type="button" class="feed-toggle feed-block" data-block-future="${index}">Block this in future</button>`}
    </div>
    <code class="feed-command">${escapeHtml(entry.segment || entry.command || '(no command recorded)')}</code>
    ${entry.reason && entry.reason !== 'allowed' ? `<p class="feed-reason muted">${escapeHtml(entry.reason)}</p>` : ''}
  </article>`;
};
// Every measurement runs before the first write: interleaving them invalidates
// layout on each entry, which costs ~570ms over a full 500-entry feed.
const applyFeedClamps = (root: HTMLElement) => {
  const overflowing = [...root.querySelectorAll('.feed-command')].filter(
    (command) =>
      !command.classList.contains('clamped') && command.scrollHeight > command.clientHeight + 1,
  );
  overflowing.forEach((command) => {
    command.classList.add('clamped');
    command.insertAdjacentHTML(
      'afterend',
      '<button type="button" class="feed-toggle" data-feed-toggle aria-expanded="false">Show more</button>',
    );
  });
};
const dayLabel = (ts: string) => {
  const date = new Date(ts);
  if (date.toDateString() === new Date().toDateString()) return 'Today';
  if (date.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const renderOverviewActivity = () => {
  if (!overview) return;
  const tile = (value: number, label: string, extra: string) =>
    `<div class="tile"><strong>${escapeHtml(value.toLocaleString('en-US'))}</strong><span>${escapeHtml(label)}</span>${extra}</div>`;
  // Buckets run oldest-first, so the last one is today. Each column carries its
  // own count: the tooltip is a pointer affordance and cannot be the only way
  // to read the series.
  const dayAgoLabel = (daysAgo: number) =>
    daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
  // Each series scales to its own maximum, so bar heights read as shape over
  // time within one tile and never as a comparison between the two.
  const sparkline = (byDay: number[], noun: string) => {
    const max = Math.max(...byDay, 1);
    return `<div class="tile-spark" role="group" aria-label="Commands ${noun} per day, most recent ${dayCount(byDay.length)}">${byDay
      .map((count, index) => {
        const label = `${dayAgoLabel(byDay.length - 1 - index)}: ${count.toLocaleString('en-US')} ${noun}`;
        return `<div class="spark-col" role="img" tabindex="0" data-count="${count.toLocaleString('en-US')}" aria-label="${escapeHtml(label)}"><div class="spark-bar${count === 0 ? ' spark-zero' : ''}" aria-hidden="true" style="height:${count === 0 ? 2 : Math.max(2, Math.round((count / max) * 40))}px"></div></div>`;
      })
      .join('')}</div>`;
  };
  qs('overview-window').textContent = `Last ${dayCount(overview.days)}`;
  qs('overview-tiles').innerHTML = [
    tile(overview.counts.blocked, 'Blocked', sparkline(overview.counts.blockedByDay, 'blocked')),
    tile(overview.totalInWindow, 'Analyzed', sparkline(overview.counts.analyzedByDay, 'analyzed')),
  ].join('');
};
const retentionDays = () => state?.policy?.audit?.retention_days ?? DEFAULT_RETENTION_DAYS;
// A retention set below the Overview's fixed window would make its request a 400.
const overviewDays = () => Math.min(OVERVIEW_DAYS, retentionDays());
const renderRetention = (loaded: PolicyState) => {
  qs<HTMLInputElement>('retention-days').value = String(loaded.policy.audit.retention_days);
  qs('retention-unit').textContent = loaded.policy.audit.retention_days === 1 ? 'day' : 'days';
  qs('retention-note').textContent =
    'Saved on change. Lowering this deletes anything already older than the new window; the Activity tab can only look back as far as it.';
};
// Windows the Activity tab offers. Anything wider than retention would promise
// history the sweep has already deleted, and the retention value itself is
// always offered so the whole log stays reachable.
const activityWindowOptions = () => {
  const retained = retentionDays();
  const windows = [7, 30, 90, 180, 365].filter((days) => days < retained);
  return [...windows, retained];
};
// The snapshot reason already names the failing source, what is not active, that
// the rejected candidate is not active, and the repair.
const configStateNotice = () => {
  const configState = state?.configState;
  if (!configState || configState.state === 'ready') return null;
  return `A fallback configuration is being enforced: ${configState.reason}`;
};
const setProtectionBanner = (notices: (string | null)[]) => {
  const text = notices.filter(Boolean).join(' ');
  qs('protection-banner').textContent = text;
  qs('protection-banner').hidden = text === '';
};
const renderProtectionCard = () => {
  // Saved state only: state.policy/state.preview are server-confirmed; draftPolicy is not,
  // so unsaved toggles do not flip the posture card.
  const configNotice = configStateNotice();
  if (!state?.preview) {
    qs('protection-card').hidden = true;
    setProtectionBanner([configNotice]);
    return;
  }
  const policy = state.policy;
  const customized =
    state.preview.counts.effectiveCustomizations > 0 ||
    Object.entries(policy.safety.overrides).some(
      ([key, value]) =>
        value !== SAFETY_LEVEL_CAPABILITIES[policy.safety.level][key as SafetyLevelCapability],
    );
  const commandsOn = policy.destructive_command_protection.enabled;
  const secretsOn = policy.secret_protection.enabled;
  const off = [
    commandsOn
      ? null
      : 'Destructive command protection is off — configurable destructive command rules are not being enforced (catastrophic and custom rules remain active)',
    secretsOn
      ? null
      : 'Secret protection is off — sensitive paths and deny paths are not being blocked',
  ].filter(Boolean);
  setProtectionBanner([
    off.length > 0
      ? `${off.join('. ')}. Re-enable ${off.length > 1 ? 'them' : 'it'} in Policy.`
      : null,
    configNotice,
  ]);
  qs('protection-card').hidden = false;
  qs('protection-card').classList.toggle('protection-warning', !commandsOn || !secretsOn);
  qs('protection-card').innerHTML =
    `<div class="panel-head"><div class="panel-title"><h2>Protection status</h2></div><a class="panel-head-action view-all-link" href="#policy">Configure</a></div>` +
    `<p>${escapeHtml(safetyLevels[policy.safety.level][0])}${customized ? ' · Customized' : ''}</p>` +
    `<p${commandsOn ? '' : ' class="state-disabled"'}>${commandsOn ? `${state.preview.counts.enabled} rules active` : 'Destructive command protection is OFF'}</p>` +
    `<p${secretsOn ? '' : ' class="state-disabled"'}>${secretsOn ? 'Secret protection on' : 'Secret protection is OFF'}</p>`;
};
// Renders a top-5 ranked list as label + count rows.
const renderTopList = (
  containerId: string,
  counts: Record<string, number>,
  className: string,
  dataAttr: string,
) => {
  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  qs(containerId).innerHTML =
    top.length === 0
      ? '<p class="empty">No blocked commands in this window.</p>'
      : top
          .map(
            ([key, count]) =>
              `<button type="button" class="${className}" ${dataAttr}="${escapeHtml(key)}"><code class="rule-id">${escapeHtml(key)}</code><span class="chip-count">${count.toLocaleString('en-US')}</span></button>`,
          )
          .join('');
};
const renderTopLists = () => {
  if (!overview) return;
  renderTopList('top-commands', overview.counts.commands, 'top-command', 'data-command');
  renderTopList('top-rules', overview.counts.rules, 'top-rule', 'data-rule-id');
};
// Blocks that look like false positives rather than catches: a fail-closed
// denial reports that analysis failed, not that the command was dangerous, and
// a signature one session was blocked on twice is a workload that kept wanting
// the command. Computed from the loaded entries, so it follows the entry cap.
const findSuspects = (entries: FeedEntry[]) => {
  const signatureKey = (entry: FeedEntry) =>
    `${entry.sessionId}\n${commandSignature(entry.segment || entry.command)}`;
  const repeats = entries
    .filter((entry) => entry.decision !== 'allow' && entry.sessionId)
    .reduce((counts, entry) => {
      const key = signatureKey(entry);
      return counts.set(key, (counts.get(key) ?? 0) + 1);
    }, new Map<string, number>());
  return new Set(
    entries.filter(
      (entry) =>
        entry.decision !== 'allow' &&
        (entry.failureStage || (repeats.get(signatureKey(entry)) ?? 0) >= 2),
    ),
  );
};
// Returns true when an exact command filter was actually cleared, so callers
// can skip re-rendering the controls when nothing changed.
const clearCommandFilter = () => {
  if (!activityFilters.command) return false;
  activityFilters.command = '';
  return true;
};
const jumpToActivityRule = (ruleId: string) => {
  activityFilters.command = '';
  activityFilters.query = ruleId.toLowerCase();
  qs<HTMLInputElement>('activity-search').value = ruleId;
  if (activity) {
    renderActivityControls();
    renderActivityFeed();
  }
  location.hash = 'activity';
};
const renderGuardErrors = () => {
  if (!overview) return;
  qs('guard-errors').hidden = overview.counts.errors === 0;
  if (overview.counts.errors === 0) return;
  qs('guard-errors').textContent =
    `${overview.counts.errors.toLocaleString('en-US')} guard error${overview.counts.errors === 1 ? '' : 's'} in the last ${dayCount(overview.days)} — commands blocked because evaluation failed, not by policy. Click to view.`;
};
const renderActivityControls = () => {
  if (!activity) return;
  // Read once: the map callback below is a closure, where the module-level feed
  // is no longer known to be loaded.
  const agentCounts = activity.counts.agents;
  const chipHtml = (kind: 'decision' | 'agent', value: string, label: string, count?: number) =>
    `<button type="button" class="chip" data-activity-chip="${kind}" data-chip-value="${escapeHtml(value)}" aria-pressed="${activityFilters[kind] === value}">${escapeHtml(label)}${count === undefined ? '' : ` <span class="chip-count">${count.toLocaleString('en-US')}</span>`}</button>`;
  qs('activity-decision').innerHTML = [
    chipHtml('decision', 'all', 'All', activity.totalInWindow),
    chipHtml('decision', 'deny', 'Blocked', activity.counts.blocked),
    chipHtml('decision', 'allow', 'Allowed', activity.counts.allowed),
    ...(activity.counts.errors > 0
      ? [chipHtml('decision', 'error', 'Errors', activity.counts.errors)]
      : []),
    ...(suspects.size > 0
      ? [chipHtml('decision', 'suspect', 'Likely false positive', suspects.size)]
      : []),
  ].join('');
  const agentNames = Object.keys(agentCounts)
    .filter((name) => name !== 'unknown')
    .sort();
  qs('activity-agents').innerHTML =
    agentNames.length < 2
      ? ''
      : [
          chipHtml('agent', 'all', 'All agents'),
          ...agentNames.map((name) =>
            chipHtml('agent', name, agentLabels[name] ?? name, agentCounts[name]),
          ),
        ].join('');
  qs('activity-command-filter').innerHTML = activityFilters.command
    ? `<button type="button" class="filter-pill" data-clear-command aria-label="Clear command filter">Command: <code>${escapeHtml(activityFilters.command)}</code><span class="filter-pill-x" aria-hidden="true">✕</span></button>`
    : '';
  qs('activity-days').innerHTML = activityWindowOptions()
    .map((days) => `<option value="${days}">Last ${dayCount(days)}</option>`)
    .join('');
  qs<HTMLSelectElement>('activity-days').value = String(activity.days);
};
const renderActivityFeed = () => {
  if (!activity) return;
  const matchesFilters = (entry: FeedEntry) => {
    if (activityFilters.decision === 'deny' && entry.decision === 'allow') return false;
    if (activityFilters.decision === 'allow' && entry.decision !== 'allow') return false;
    if (activityFilters.decision === 'error' && !entry.failureStage) return false;
    if (activityFilters.decision === 'suspect' && !suspects.has(entry)) return false;
    if (activityFilters.agent !== 'all' && (entry.agent || 'unknown') !== activityFilters.agent)
      return false;
    if (activityFilters.command) {
      if (entry.decision === 'allow') return false;
      return commandSignature(entry.segment || entry.command) === activityFilters.command;
    }
    if (!activityFilters.query) return true;
    return [entry.ruleId, entry.segment || entry.command]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(activityFilters.query);
  };
  const entries = activity.entries.filter(matchesFilters);
  renderedFeedEntries = entries;
  qs('activity-feed').innerHTML =
    entries.length === 0
      ? '<p class="empty">No audit log entries match.</p>'
      : `<div class="feed-list">${entries
          .map((entry, index) => {
            const label = dayLabel(entry.ts);
            const previous = entries[index - 1];
            const separator =
              previous && label === dayLabel(previous.ts)
                ? ''
                : `<div class="feed-day-sep">${escapeHtml(label)}</div>`;
            return separator + feedItemHtml(entry, index);
          })
          .join('')}</div>`;
  applyFeedClamps(qs('activity-feed'));
  qs('activity-count').textContent =
    `Showing ${entries.length.toLocaleString('en-US')} of ${activity.totalInWindow.toLocaleString('en-US')} entries from the last ${dayCount(activity.days)}${activity.truncated ? ' (capped at 500, newest of each decision)' : ''}.${activity.unreadable > 0 ? ` ${activity.unreadable.toLocaleString('en-US')} audit log source${activity.unreadable === 1 ? '' : 's'} could not be read, so this list is incomplete.` : ''}`;
};
const loadOverview = async () => {
  const result = await requestJson(`/api/activity?days=${overviewDays()}`);
  if (!result.ok || !result.data) {
    const message = `<p class="empty">Could not load activity: ${escapeHtml(errorText(result))}</p>`;
    qs('overview-window').textContent = '';
    qs('overview-tiles').innerHTML = '';
    qs('top-rules').innerHTML = message;
    qs('guard-errors').hidden = true;
    return;
  }
  const feed: ActivityFeed = result.data;
  overview = feed;
  qs('logs-path').textContent = overview.logsDir ?? 'Not available';
  renderOverviewActivity();
  renderTopLists();
  renderGuardErrors();
};
const loadActivity = async () => {
  const result = await requestJson(`/api/activity?days=${activityFilters.days}`);
  if (!result.ok || !result.data) {
    const message = `<p class="empty">Could not load activity: ${escapeHtml(errorText(result))}</p>`;
    qs('activity-feed').innerHTML = message;
    qs('activity-count').textContent = '';
    return;
  }
  // `data` is unverified JSON, so it is named at its type once here; every read
  // below is through the narrowed module-level feed.
  const feed: ActivityFeed = result.data;
  activity = feed;
  suspects = findSuspects(activity.entries);
  if (activityFilters.agent !== 'all' && !(activityFilters.agent in activity.counts.agents)) {
    activityFilters.agent = 'all';
  }
  if (activityFilters.decision === 'error' && activity.counts.errors === 0) {
    activityFilters.decision = 'all';
  }
  if (activityFilters.decision === 'suspect' && suspects.size === 0) {
    activityFilters.decision = 'all';
  }
  renderActivityControls();
  renderActivityFeed();
};
const runRefresh = async (buttonId: string, reload: () => Promise<unknown>) => {
  const button = qs<HTMLButtonElement>(buttonId);
  if (button.disabled) return;
  button.disabled = true;
  button.classList.add('spinning');
  // Spin for a minimum duration so a fast local refresh still reads as an action.
  // `finally` (no catch) so a failed reload restores the button instead of
  // leaving it disabled and spinning; the rejection still propagates.
  try {
    await Promise.all([reload(), new Promise((resolve) => setTimeout(resolve, 600))]);
  } finally {
    button.classList.remove('spinning');
    button.disabled = false;
  }
};
const refreshActivity = () =>
  runRefresh('activity-refresh', () => Promise.all([loadOverview(), loadActivity()]));
const renderIntegrations = () => {
  const loaded = integrations;
  if (!loaded) return;
  qs('integrations-list').innerHTML = loaded.targets
    .map((row) => {
      const busy = integrationBusy.has(row.target);
      const version =
        row.version === null
          ? '<span class="muted">not detected</span>'
          : `<span class="agent-badge">v${escapeHtml(row.version)}</span>`;
      const status =
        row.status === 'active'
          ? '<span class="state-active">Installed</span>'
          : row.status === 'disabled'
            ? '<span class="state-disabled">Disabled</span>'
            : row.status === 'not-inspected'
              ? '<span class="muted" title="This runtime\'s state file could not be read, so its status is unknown.">Not inspected</span>'
              : '<span class="muted">Not installed</span>';
      const uninstall = row.status === 'active';
      const busyLabel = uninstall ? 'Uninstalling…' : 'Installing…';
      const action =
        row.version === null
          ? ''
          : `<button type="button" class="${uninstall ? 'danger' : 'primary'}" data-integration-action="${uninstall ? 'uninstall' : 'install'}" data-integration-target="${escapeHtml(row.target)}"${busy ? ' disabled' : ''}>${busy ? busyLabel : uninstall ? 'Uninstall' : row.status === 'disabled' ? 'Enable' : 'Install'}</button>`;
      const note = row.note
        ? `<div class="status ${row.note.kind}">${escapeHtml(row.note.text)}</div>`
        : '';
      return `<div class="integration-row">
        <span class="integration-info"><strong>${escapeHtml(row.label)}</strong> ${version} ${status}</span>
        ${action}
        ${note}
      </div>`;
    })
    .join('');
};
const loadHealth = async () => {
  const result = await requestJson('/api/health');
  if (!result.ok || !Array.isArray(result.data?.hooks)) return;
  const active = result.data.hooks.filter((hook: { configured: boolean }) => hook.configured);
  const inactive = result.data.hooks.filter((hook: { configured: boolean }) => !hook.configured);
  const attention = inactive.length > 0 || active.length === 0;
  const parts: string[] = [];
  const labelHtml = (hook: { label: string }) => `<strong>${escapeHtml(hook.label)}</strong>`;
  if (active.length) parts.push(`Hook active in ${active.map(labelHtml).join(', ')}`);
  if (inactive.length)
    parts.push(`${inactive.map(labelHtml).join(', ')} detected without an active hook`);
  if (!parts.length) parts.push('No agent hooks detected');
  if (result.data.update?.updateAvailable)
    parts.push(`v${escapeHtml(result.data.update.latestVersion)} available`);
  const link = attention
    ? ' <a class="view-all-link" href="#integrations">Fix in Integrations</a>'
    : '';
  const el = qs('health-strip');
  el.className = attention ? 'status health-strip error' : 'status health-strip ok';
  el.innerHTML = parts.join(' · ') + link;
  el.hidden = false;
};
const loadIntegrations = async () => {
  const result = await requestJson('/api/integrations');
  if (!result.ok || !Array.isArray(result.data?.targets)) {
    qs('integrations-list').innerHTML =
      `<p class="empty">Could not load integrations: ${escapeHtml(errorText(result))}</p>`;
    integrationsRequested = false;
    return;
  }
  integrations = result.data;
  renderIntegrations();
  qs('integrations-pkg-version').textContent = result.data.system.version;
  qs('integrations-node-version').textContent = result.data.system.nodeVersion ?? 'unknown';
  qs('integrations-platform').textContent = result.data.system.platform;
  qs('integrations-system').hidden = false;
};
const refreshIntegrations = () =>
  runRefresh('integrations-refresh', () => {
    integrationsRequested = true;
    return loadIntegrations();
  });
const renderRules = () => {
  const loaded = rulesData;
  if (!loaded) return;
  // Prefill only while untouched, so a refresh cannot discard a path already
  // chosen for a project other than the launch directory.
  if (!qs<HTMLInputElement>('rules-project-path').value)
    qs<HTMLInputElement>('rules-project-path').value = loaded.projectPath;
  // Typing an absolute path by hand is the error-prone half of this field, so
  // it stays read-only wherever a real dialog can replace it.
  const canPick = loaded.canPickDirectory && !directoryPickerFailed;
  qs<HTMLInputElement>('rules-project-path').readOnly = canPick;
  qs<HTMLButtonElement>('rules-choose-directory').hidden = !canPick;
  qs('rules-list').innerHTML =
    loaded.rulebooks.length === 0
      ? // A dropped source is the failure users are least likely to notice, so
        // it owns the empty state instead of the first-run copy below it.
        loaded.errors.length > 0
        ? '<p class="empty">Every configured rulebook was dropped, so no custom rule is enforced. See Diagnostics below.</p>'
        : '<p class="empty">No custom rulebooks. Run <code>npx -y cc-safety-net rule init</code> to create one, or see the <a href="https://ccsafetynet.com/docs" target="_blank" rel="noopener">documentation</a>.</p>'
      : loaded.rulebooks
          .map(
            (rulebook) => `<div class="rulebook-card">
    <div class="rulebook-head">
      <strong>${escapeHtml(rulebook.name)}</strong>
      <span class="agent-badge">v${escapeHtml(rulebook.version)}</span>
      ${rulebook.spec === rulebook.name ? '' : `<code>${escapeHtml(rulebook.spec)}</code>`}
      <span>${rulebook.source === 'user' ? 'All projects' : 'This project'}</span>
      <span>${rulebook.rules.length} rule${rulebook.rules.length === 1 ? '' : 's'}</span>
    </div>
    ${rulebook.rules
      .map(
        // block_args is an OR set, not a command line: any one of these tokens
        // anywhere in the command matches, so they cannot be joined onto it.
        (
          rule,
        ) => `<div class="rulebook-rule${pendingRuleFocus === rule.name ? ' rules-focus' : ''}">
      <code class="rule-id">custom.${escapeHtml(rule.name)}</code>
      <code>${escapeHtml([rule.command, rule.subcommand].filter(Boolean).join(' '))}</code>
      <p>Blocked arguments (any one matches): ${rule.block_args.map((arg) => `<code>${escapeHtml(arg)}</code>`).join(' ')}</p>
      <p>${escapeHtml(rule.reason)}</p>
    </div>`,
      )
      .join('')}
  </div>`,
          )
          .join('');
  const diagnostics = [
    ...loaded.errors.map((text: string) => `<div class="status error">${escapeHtml(text)}</div>`),
    ...loaded.warnings.map((text: string) => `<div class="status">${escapeHtml(text)}</div>`),
  ];
  qs('rules-diagnostics').innerHTML = diagnostics.join('');
  qs('rules-diagnostics-panel').hidden = diagnostics.length === 0;
  if (!pendingRuleFocus) return;
  const focused = qs('rules-list').querySelector('.rules-focus');
  if (focused) focused.scrollIntoView({ block: 'center' });
  // Top blocked rules names rules from audit history that a rulebook may no
  // longer contain, and landing on an unchanged tab reads as a dead link.
  if (!focused) setAppStatus(`custom.${pendingRuleFocus} is not in any rulebook`, 'error');
  pendingRuleFocus = null;
};
const loadRules = async () => {
  const result = await requestJson('/api/rules');
  if (!result.ok || !Array.isArray(result.data?.rulebooks)) {
    qs('rules-list').innerHTML =
      `<p class="empty">Could not load rules: ${escapeHtml(errorText(result))}</p>`;
    // Dropping the previous payload keeps a stale rulebook list from being
    // repainted over this message by a later render.
    rulesData = null;
    qs('rules-diagnostics-panel').hidden = true;
    rulesRequested = false;
    return;
  }
  rulesData = result.data;
  renderRules();
};
const refreshRules = () =>
  runRefresh('rules-refresh', () => {
    rulesRequested = true;
    return loadRules();
  });
const jumpToRulesRule = (ruleId: string) => {
  pendingRuleFocus = ruleId.replace(/^custom\./, '');
  location.hash = 'rules';
};
const openRuleComposer = (command: string) => {
  qs<HTMLTextAreaElement>('rules-composer-input').value = command;
  location.hash = 'rules';
};
const setRulesScope = (scope: string) => {
  rulesScope = scope;
  document.querySelectorAll<HTMLElement>('[data-rules-scope]').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset.rulesScope === scope));
  });
  qs('rules-project-path-field').hidden = scope !== 'project';
};
const rulePromptText = () => {
  // Rulebook names are claimed globally across both scopes: a project rulebook
  // reusing a user-scope name is dropped whole and enforces nothing, so the
  // agent has to see every existing name, not just this scope's.
  const names = rulesData?.rulebooks.map((rulebook) => rulebook.name) ?? [];
  return [
    'Use the cc-safety-net skill for this request.',
    'If that skill is not available, run `npx -y cc-safety-net rule doc` first and treat its output as the source of truth for schema, paths, and validation.',
    '',
    rulesScope === 'project'
      ? `Scope: this project - ${qs<HTMLInputElement>('rules-project-path').value.trim()}`
      : 'Scope: all projects (user scope)',
    `Existing rulebooks (names must stay unique across both scopes): ${names.length > 0 ? names.join(', ') : 'none'}`,
    '',
    qs<HTMLTextAreaElement>('rules-composer-input').value.trim(),
  ].join('\n');
};
const chooseProjectDirectory = async () => {
  const button = qs<HTMLButtonElement>('rules-choose-directory');
  if (button.disabled) return;
  button.disabled = true;
  const result = await requestJson('/api/rules/choose-directory', { method: 'POST' });
  button.disabled = false;
  if (result.ok && result.data.path) {
    qs<HTMLInputElement>('rules-project-path').value = result.data.path;
    return;
  }
  if (result.ok && result.data.cancelled) return;
  // Detection cannot prove the dialog will actually open, so a failure has to
  // hand the field back rather than leave a read-only box and a dead button.
  directoryPickerFailed = true;
  qs<HTMLInputElement>('rules-project-path').readOnly = false;
  button.hidden = true;
  setAppStatus(
    `${result.ok ? result.data.error : errorText(result)} - type the project path instead`,
    'error',
  );
};
const copyRulePrompt = async () => {
  if (!rulesData) {
    setAppStatus('Rules have not loaded yet - refresh the Rulebooks panel', 'error');
    return;
  }
  if (!qs<HTMLTextAreaElement>('rules-composer-input').value.trim()) {
    setAppStatus('Describe what you want first', 'error');
    return;
  }
  // An empty path would hand the agent "Scope: this project - " and let it pick
  // a directory itself, which is the guess this field exists to remove.
  if (rulesScope === 'project' && !qs<HTMLInputElement>('rules-project-path').value.trim()) {
    setAppStatus('Enter the project path the rule belongs to', 'error');
    return;
  }
  qs<HTMLButtonElement>('rules-copy-prompt').disabled = true;
  try {
    await navigator.clipboard.writeText(rulePromptText());
    qs<HTMLTextAreaElement>('rules-composer-input').value = '';
    setAppStatus('Prompt copied - paste it into your coding CLI', 'ok');
  } catch {
    setAppStatus('Copy failed', 'error');
  } finally {
    qs<HTMLButtonElement>('rules-copy-prompt').disabled = false;
  }
};
const runIntegrationAction = async (button: HTMLElement) => {
  const target = button.dataset.integrationTarget;
  if (!target || integrationBusy.has(target)) return;
  integrationBusy.add(target);
  const action = button.dataset.integrationAction;
  renderIntegrations();
  const result = await requestJson(`/api/${action}`, {
    method: 'POST',
    body: JSON.stringify({ target }),
  });
  integrationBusy.delete(target);
  const row = integrations?.targets.find((entry) => entry.target === target);
  if (!row) return;
  const ok = result.ok && result.data.ok === true;
  if (ok) row.status = action === 'install' ? 'active' : 'not-installed';
  row.note = {
    kind: ok ? 'ok' : 'error',
    text: ok ? result.data.output : result.data?.output || errorText(result),
  };
  if (!ok) setAppStatus(action === 'install' ? 'Install failed' : 'Uninstall failed', 'error');
  renderIntegrations();
};
const confirmDialog = (() => {
  const dialog = qs<HTMLDialogElement>('confirm-dialog');
  const confirm = qs<HTMLButtonElement>('confirm-dialog-confirm');
  const cancel = qs<HTMLButtonElement>('confirm-dialog-cancel');
  let resolvePending: ((confirmed: boolean) => void) | null = null;
  dialog.addEventListener('close', () => {
    if (!resolvePending) return;
    resolvePending(dialog.returnValue === 'confirm');
    resolvePending = null;
  });
  dialog.addEventListener('cancel', () => {
    dialog.returnValue = 'cancel';
  });
  return (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      if (resolvePending) {
        resolve(false);
        return;
      }
      qs('confirm-dialog-title').textContent = options.title;
      qs('confirm-dialog-body').textContent = options.body;
      qs('confirm-dialog-detail').textContent = options.detail ?? '';
      const detailRow = qs('confirm-dialog-detail').parentElement;
      if (detailRow) detailRow.hidden = !options.detail;
      // Markup rather than text for the one caller that shows a table: the diff
      // rows are built here from server-computed values, each one escaped.
      qs('confirm-dialog-rows').innerHTML = options.rowsHtml ?? '';
      qs('confirm-dialog-rows').hidden = !options.rowsHtml;
      confirm.textContent = options.confirmLabel;
      confirm.className = options.confirmClass ?? 'danger';
      dialog.returnValue = 'cancel';
      resolvePending = resolve;
      dialog.showModal();
      cancel.focus();
    });
})();
const confirmProtectionDisable = (options: { title: string; body: string; detail?: string }) =>
  confirmDialog({
    title: options.title,
    body: options.body,
    detail: options.detail,
    confirmLabel: 'Disable protection',
  });
const togglePanel = (button: Element) => {
  const controls = button.getAttribute('aria-controls');
  if (!controls) return;
  const expanded = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(expanded));
  qs(controls).hidden = !expanded;
};
const syncSearchState = () => {
  const active = qs<HTMLInputElement>('policy-search').value.trim().length > 0;
  if (active === searchActive) return;
  searchActive = active;
  if (active) return;
  searchCollapsedTiers.clear();
  searchCollapsedSecretGroups.clear();
};
const updateRawSource = () => {
  if (projectDraft) {
    qs('raw-source').textContent =
      `Only the fields marked for this project. Writes to ${projectDraft.path}.`;
    return;
  }
  qs('raw-source').textContent = state?.errors.length
    ? 'Read-only original policy JSON. Repair preserves valid settings and writes canonical JSON.'
    : 'Read-only mirror of the controls.';
};
const setRawCopyCopied = (copied: boolean) => {
  qs<HTMLButtonElement>('raw-copy').innerHTML = copied ? rawCopyIcons.check : rawCopyIcons.copy;
  qs<HTMLButtonElement>('raw-copy').classList.toggle('copied', copied);
  qs<HTMLButtonElement>('raw-copy').setAttribute(
    'aria-label',
    copied ? 'Copied raw JSON' : 'Copy raw JSON to clipboard',
  );
};
const resetFeedCopy = () => {
  document.querySelectorAll<HTMLElement>('.feed-copy.copied').forEach((button) => {
    button.classList.remove('copied');
    button.innerHTML = rawCopyIcons.copy;
    button.setAttribute('aria-label', 'Copy log entry as JSON');
  });
};
const reportIssueUrl =
  'https://github.com/kenryu42/cc-safety-net/issues/new?template=false_positive.yml';
// GitHub rejects issue links past roughly 8k characters.
const reportUrlLimit = 8000;
// Audit entries have secrets redacted at write time but not paths, and the issue
// tracker is public. The entry's own cwd goes first so the most specific prefix
// wins when the project sits inside the home directory. A prefix only counts when
// the match ends at a path boundary, so a sibling directory (`<cwd>-backup`) or an
// unrelated path that merely starts with it (`/app` inside `/var/lib/appdata`) is
// left intact instead of being mangled mid-segment.
const endsAtPathBoundary = (following: string) => following === '' || /^[/\\\s'"]/.test(following);
const scrubReportPaths = (text: string, cwd?: string | null, home?: string | null) =>
  [
    [cwd, '<project>'],
    [home, '~'],
  ].reduce(
    (scrubbed, [from, to]) =>
      from
        ? scrubbed
            .split(from)
            .reduce((joined, part) => joined + (endsAtPathBoundary(part) ? to : from) + part)
        : scrubbed,
    text,
  );
const buildReportUrl = (fields: Record<string, string>) => {
  const url = new URL(reportIssueUrl);
  Object.entries(fields)
    .filter(([, value]) => value)
    .forEach(([field, value]) => {
      url.searchParams.set(field, value);
    });
  return url.toString();
};
// GitHub rejects the entire link past the cap, so the largest field is dropped
// until the rest fits. Dropping one is not always enough: `entry` embeds the
// command, so a long command still overflows once the entry is gone.
const buildReportRequest = (
  fields: Record<string, string>,
  dropped: string[] = [],
): { url: string; dropped: string[] } => {
  const url = buildReportUrl(fields);
  if (url.length <= reportUrlLimit) return { url, dropped };
  const largest = Object.entries(fields)
    .filter(([, value]) => value)
    .sort((left, right) => right[1].length - left[1].length)[0];
  if (!largest) return { url, dropped };
  return buildReportRequest({ ...fields, [largest[0]]: '' }, [...dropped, largest[0]]);
};
const openReportDialog = (button: HTMLElement) => {
  const entry = renderedFeedEntries[Number(button.dataset.reportFp)];
  if (!entry) return;
  const scrub = (text: string) => scrubReportPaths(text, entry.cwd, activity?.homeDir);
  qs<HTMLTextAreaElement>('report-command').value = scrub(entry.command || entry.segment || '');
  // Scrub each string value before serialising, not the serialised text: on
  // Windows JSON.stringify doubles every backslash, so a cwd of C:\Users\... would
  // never match its own needle and the entry would ship unscrubbed.
  qs<HTMLTextAreaElement>('report-entry').value = JSON.stringify(
    entry,
    (_key, value) => (typeof value === 'string' ? scrub(value) : value),
    2,
  );
  qs<HTMLDialogElement>('report-dialog').returnValue = 'cancel';
  qs<HTMLDialogElement>('report-dialog').showModal();
};
const openFalsePositiveForm = async () => {
  const fields: Record<string, string> = {
    command: qs<HTMLTextAreaElement>('report-command').value,
    entry: qs<HTMLTextAreaElement>('report-entry').value,
  };
  const request = buildReportRequest(fields);
  // Start the copy before the new tab takes focus, and open in the same task so
  // the click that submitted the dialog still counts as user activation.
  const copying = request.dropped.length
    ? navigator.clipboard.writeText(
        request.dropped.map((field) => `### ${field}\n${fields[field]}`).join('\n\n'),
      )
    : null;
  window.open(request.url, '_blank', 'noopener');
  if (!copying) return;
  const names = request.dropped.join(' and ');
  setAppStatus(
    (await copying.then(() => true).catch(() => false))
      ? `Report too long to prefill — ${names} copied to your clipboard. Paste into the form on GitHub.`
      : `Report too long to prefill — ${names} left out. Copy the entry from the feed and paste it into the form on GitHub.`,
    'error',
  );
};
qs<HTMLDialogElement>('report-dialog').addEventListener('close', () => {
  if (qs<HTMLDialogElement>('report-dialog').returnValue === 'report') void openFalsePositiveForm();
});
const copyFeedEntry = async (button: HTMLElement) => {
  const entry = renderedFeedEntries[Number(button.dataset.logCopy)];
  if (!entry) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
    if (feedCopyResetTimer) clearTimeout(feedCopyResetTimer);
    resetFeedCopy();
    button.classList.add('copied');
    button.innerHTML = rawCopyIcons.check;
    button.setAttribute('aria-label', 'Copied log entry');
    feedCopyResetTimer = setTimeout(resetFeedCopy, 2000);
  } catch {
    setAppStatus('Copy failed', 'error');
  }
};
const copyRawToClipboard = async () => {
  qs<HTMLButtonElement>('raw-copy').disabled = true;
  try {
    await navigator.clipboard.writeText(qs<HTMLTextAreaElement>('raw').value);
    setRawCopyCopied(true);
    if (rawCopyResetTimer) clearTimeout(rawCopyResetTimer);
    rawCopyResetTimer = setTimeout(() => setRawCopyCopied(false), 2000);
  } catch (error) {
    setAppStatus('Copy failed', 'error');
    setDetailStatus(
      `Error: Could not copy Raw JSON: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
  } finally {
    qs<HTMLButtonElement>('raw-copy').disabled = false;
  }
};
const formatStarCount = (count: number | null) => {
  if (typeof count !== 'number') return '';
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(count);
};
const starCountHtml = (count: number | null) => {
  const formatted = formatStarCount(count);
  return formatted ? `<span class="star-count">${escapeHtml(formatted)}</span>` : '';
};
const hideStarCta = () => {
  qs('star-row').hidden = true;
  qs('star-slot').innerHTML = '';
};
const renderStarPitch = (context: StarContext, starred = false) => {
  const evidence =
    context.blockedTotal > 0
      ? `CC Safety Net has blocked <strong>${escapeHtml(context.blockedTotal.toLocaleString('en-US'))}</strong> risky command${context.blockedTotal === 1 ? '' : 's'} on this machine in its retained ${escapeHtml(dayCount(retentionDays()))} history.`
      : '';
  if (starred) {
    qs('star-pitch-text').innerHTML = evidence;
    return;
  }
  qs('star-pitch-text').innerHTML = evidence
    ? `${evidence} If it saved your work, star it on GitHub.`
    : 'If CC Safety Net is useful to you, star it on GitHub.';
};
const renderStarLink = (context: StarContext, href = fallbackRepoUrl) => {
  qs('star-slot').innerHTML =
    `<a class="star-cta" href="${escapeHtml(href)}" target="_blank" rel="noopener" aria-label="Star CC Safety Net on GitHub (opens github.com)">
      <span class="star-icon" aria-hidden="true">${starIcons.outline}</span>
      <span class="star-label">Star on GitHub</span>
      ${starCountHtml(context.starCount)}
    </a>`;
  qs('star-row').hidden = false;
};
const renderStarCta = (context: StarContext) => {
  activeStarContext = context;
  if (context.starred === true) {
    hideStarCta();
    return;
  }
  renderStarPitch(context);
  qs('star-mechanism').hidden = context.starred !== false;
  if (context.starred === null) {
    renderStarLink(context);
    return;
  }
  qs('star-slot').innerHTML =
    `<button type="button" class="star-cta" aria-label="Star CC Safety Net on GitHub. One click via your GitHub CLI.">
      <span class="star-icon" aria-hidden="true">${starIcons.outline}</span>
      <span class="star-label">Star on GitHub</span>
      ${starCountHtml(context.starCount)}
    </button>`;
  qs('star-row').hidden = false;
};
const starRepo = async (button: HTMLButtonElement) => {
  button.disabled = true;
  const result = await requestJson('/api/star', { method: 'POST' });
  if (result.ok && result.data?.ok === true) {
    const icon = button.querySelector('.star-icon');
    const label = button.querySelector('.star-label');
    if (icon) icon.innerHTML = starIcons.filled;
    if (label) label.textContent = 'Starred. Thank you.';
    button.setAttribute('aria-label', 'CC Safety Net starred on GitHub');
    button.classList.add('starred');
    qs('star-mechanism').hidden = true;
    renderStarPitch(activeStarContext, true);
    setAppStatus('Starred on GitHub', 'ok');
    setDetailStatus('');
    return;
  }
  qs('star-mechanism').hidden = true;
  renderStarLink(activeStarContext, result.data?.fallbackUrl ?? fallbackRepoUrl);
};
const loadStarContext = async () => {
  const result = await requestJson('/api/star/context');
  renderStarCta(
    result.ok && result.data ? result.data : { starred: null, starCount: null, blockedTotal: 0 },
  );
};
const syncRawFromForm = () => {
  if (state?.errors.length) return;
  // In project mode the panel previews the sparse proposal itself - the exact
  // JSON the apply writes - rather than the merged policy on screen.
  qs<HTMLTextAreaElement>('raw').value = formatPolicy(
    projectDraft ? collectProjectProposal(markedFields, draftPolicy) : collectFormPolicy(),
  );
  updateRawSource();
};
const updateDirtyStatus = () => {
  if (!state || state.errors.length) return;
  // The saved user policy says nothing about which fields the project sets, so
  // comparing against it would read a pre-marked field as dirty on entry and an
  // un-marked one as clean while it is being dropped from the file. The entry
  // snapshot compares field presence as well as values.
  if (projectDraft) {
    dirty =
      JSON.stringify(collectProjectProposal(markedFields, draftPolicy)) !== projectDraft.snapshot;
    qs('policy-savebar').hidden = !dirty;
    qs('dirty-chip').hidden = !dirty || currentView() === 'policy';
    setDetailStatus('');
    updateActions();
    return;
  }
  const draftJson = JSON.stringify(collectFormPolicy());
  dirty = draftJson !== JSON.stringify(state.policy);
  qs('policy-savebar').hidden = !dirty;
  qs('dirty-chip').hidden = !dirty || currentView() === 'policy';
  if (dirty) sessionStorage.setItem('cc-safety-net-draft', draftJson);
  if (!dirty) sessionStorage.removeItem('cc-safety-net-draft');
  setDetailStatus('');
  updateActions();
};
const createPathList = (prefix: string, config: PathListConfig) => {
  const setHint = (text: string) => {
    qs(`${prefix}-hint`).textContent = text;
    qs(`${prefix}-hint`).hidden = !text;
  };
  const render = () => {
    const paths = config.getPaths();
    const disabled = config.isDisabled();
    qs(`${prefix}-count`).textContent = `${paths.length} path${paths.length === 1 ? '' : 's'}`;
    qs<HTMLInputElement>(`${prefix}-input`).disabled = disabled;
    qs<HTMLButtonElement>(`${prefix}-add-button`).disabled = disabled;
    qs(`${prefix}-list`).innerHTML =
      paths.length === 0
        ? `<li class="empty">No ${config.itemLabel}s configured.</li>`
        : paths
            .map(
              (
                path: string,
                index: number,
              ) => `<li class="path-item ${disabled ? 'row-disabled' : ''}">
          <code>${escapeHtml(path)}</code>
          <button type="button" class="icon-button" data-path-list="${prefix}" data-path-remove="${index}" ${disabled ? 'disabled' : ''} aria-label="Remove ${config.itemLabel} ${escapeHtml(path)}">${pathListIcons.remove}</button>
        </li>`,
            )
            .join('');
  };
  // A path list joins the project draft empty: the entries it was showing are
  // the member's own, and carrying them into the project file would publish one
  // person's exceptions to everyone who loads it. The loader still unions the
  // two lists, so nothing the member had stops applying.
  const claimForProject = () => {
    if (!projectDraft || markedFields.has(config.field)) return;
    markedFields.add(config.field);
    config.setPaths([]);
    syncProjectChips();
  };
  let adding = false;
  const add = async (value: string) => {
    if (adding) return;
    const entries = [...new Set(pathLines(value))];
    if (entries.length === 0) return;
    const scope = projectDraft;
    const claimed = projectDraft !== null && !markedFields.has(config.field);
    const previousPaths = config.getPaths();
    claimForProject();
    const submitted = qs<HTMLInputElement>(`${prefix}-input`).value;
    const additions = entries.filter((entry) => !config.getPaths().includes(entry));
    if (config.validateAdditions && additions.length) {
      adding = true;
      try {
        const error = await config.validateAdditions([...config.getPaths(), ...additions]);
        // The draft this call claimed into was exited or reseeded while the
        // validation was in flight; its state was rebuilt wholesale, so both
        // the commit and the rollback would mutate a different scope.
        if (projectDraft !== scope) return;
        if (error) {
          setHint(`Not added: ${additions.join(', ')} — ${error}`);
          // A rejected addition must leave the draft byte-identical: undo the
          // claim this call made, or the list reads as project-owned and empty.
          if (claimed) {
            markedFields.delete(config.field);
            config.setPaths(previousPaths);
            syncProjectChips();
          }
          return;
        }
      } finally {
        adding = false;
      }
    }
    // Recommit only the initially absent additions against current state, so
    // entries removed during validation stay removed.
    const current = config.getPaths();
    const duplicates = entries.filter((entry) => current.includes(entry));
    config.setPaths([...current, ...additions.filter((entry) => !current.includes(entry))]);
    if (qs<HTMLInputElement>(`${prefix}-input`).value === submitted)
      qs<HTMLInputElement>(`${prefix}-input`).value = '';
    setHint(duplicates.length ? `Already listed: ${duplicates.join(', ')}` : '');
    render();
    syncRawFromForm();
    updateDirtyStatus();
    qs(`${prefix}-input`).focus();
  };
  const remove = (index: number) => {
    claimForProject();
    config.setPaths(config.getPaths().filter((_, position) => position !== index));
    setHint('');
    render();
    syncRawFromForm();
    updateDirtyStatus();
  };
  return { render, add, remove };
};
// Every path list validates the same way: preview the draft policy with the
// candidate paths patched into it, and report the preview's own error text.
const validatePathAdditions = async (
  patch: (candidate: ReturnType<typeof collectFormPolicy>) => void,
) => {
  const candidate = collectFormPolicy();
  patch(candidate);
  const result = await requestPolicyPreview(candidate);
  if (result.ok && result.data?.preview) return null;
  return errorText(result);
};
const pathLists = {
  'deny-paths': createPathList('deny-paths', {
    field: 'secret_protection.deny_paths',
    getPaths: () => draftPolicy.secret_protection.deny_paths,
    setPaths: (paths: string[]) => {
      draftPolicy.secret_protection.deny_paths = paths;
    },
    isDisabled: () => !draftPolicy.secret_protection.enabled,
    itemLabel: 'deny path',
    validateAdditions: (paths: string[]) =>
      validatePathAdditions((candidate) => {
        candidate.secret_protection = { ...candidate.secret_protection, deny_paths: paths };
      }),
  }),
  'secret-allow-paths': createPathList('secret-allow-paths', {
    field: 'secret_protection.allow_paths',
    getPaths: () => draftPolicy.secret_protection.allow_paths,
    setPaths: (paths: string[]) => {
      draftPolicy.secret_protection.allow_paths = paths;
    },
    isDisabled: () => !draftPolicy.secret_protection.enabled,
    itemLabel: 'allow path',
    validateAdditions: (paths: string[]) =>
      validatePathAdditions((candidate) => {
        candidate.secret_protection = { ...candidate.secret_protection, allow_paths: paths };
      }),
  }),
  'allow-paths': createPathList('allow-paths', {
    field: 'destructive_command_protection.allow_paths',
    getPaths: () => draftPolicy.destructive_command_protection.allow_paths,
    setPaths: (paths: string[]) => {
      draftPolicy.destructive_command_protection.allow_paths = paths;
    },
    isDisabled: () => !draftPolicy.destructive_command_protection.enabled,
    itemLabel: 'allow path',
    validateAdditions: (paths) =>
      validatePathAdditions((candidate) => {
        candidate.destructive_command_protection = {
          ...candidate.destructive_command_protection,
          allow_paths: paths,
        };
      }),
  }),
};
// The two lists are addressed by name from a data attribute, so a lookup has to
// prove the attribute names one of them.
const pathListFor = (name: string | undefined) =>
  name === 'deny-paths' || name === 'allow-paths' || name === 'secret-allow-paths'
    ? pathLists[name]
    : null;
// A default-off rule needs an explicit 'on' override to become active, so the switch state
// cannot be read from the presence of an override alone.
const secretRuleIsActive = (rule: SecretRule, overrides: RuleOverrides) =>
  overrides[rule.id] ? overrides[rule.id] === 'on' : !rule.defaultOff;
// A marked rule is one this project sets for everyone. Only the explicit unmark
// affordances drop the mark again, so a value edit never silently removes a rule
// from the proposal.
const markProjectOverride = (section: string, ruleId: string) => {
  if (!projectDraft) return;
  markedFields.add(`${section}.overrides.${ruleId}`);
};
const clearProjectOverrideMarks = (section: string) => {
  markedFields = new Set(
    [...markedFields].filter((field) => !field.startsWith(`${section}.overrides.`)),
  );
};
// A rule that already matches its default keeps no override, so the saved file stays small
// and a later default change still reaches the user. In project mode the same edit is a
// decision to pin the rule for everyone, so it is always written out and marked: dropping
// it would leave each member's own override winning while the control claims otherwise.
const setSecretOverride = (rule: SecretRule, active: boolean) => {
  if (!projectDraft && active === !rule.defaultOff) {
    delete draftPolicy.secret_protection.overrides[rule.id];
    return;
  }
  draftPolicy.secret_protection.overrides[rule.id] = active ? 'on' : 'off';
  markProjectOverride('secret_protection', rule.id);
};
// The destructive counterpart, comparing against the inherited state the preview
// reports rather than a built-in default; same project-mode rule.
const setDestructiveOverride = (ruleId: string, active: boolean, inheritedEnabled?: boolean) => {
  if (!projectDraft && active === inheritedEnabled) {
    delete draftPolicy.destructive_command_protection.overrides[ruleId];
    return;
  }
  draftPolicy.destructive_command_protection.overrides[ruleId] = active ? 'on' : 'off';
  markProjectOverride('destructive_command_protection', ruleId);
};
const groupRules = <T extends { category: string }>(rules: T[]) =>
  rules.reduce(
    (groups, rule) => {
      const group = groups.find((item) => item.category === rule.category);
      if (group) {
        group.rules.push(rule);
        return groups;
      }
      groups.push({ category: rule.category, rules: [rule] });
      return groups;
    },
    [] as { category: string; rules: T[] }[],
  );
const renderSecretPatterns = () => {
  if (!state) return;
  // The group callback below is a closure, where the module-level policy state
  // is no longer known to be loaded.
  const loaded = state;
  const query = qs<HTMLInputElement>('policy-search').value.trim().toLowerCase();
  const rules = state.secretPatterns.filter((rule) =>
    [rule.category, rule.label, rule.id, rule.description, ...(rule.paths ?? [])]
      .join(' ')
      .toLowerCase()
      .includes(query),
  );
  const overrides = draftPolicy.secret_protection.overrides;
  const disabled = !draftPolicy.secret_protection.enabled;
  const disabledCount = state.secretPatterns.filter(
    (rule) => !secretRuleIsActive(rule, overrides),
  ).length;
  qs('secret-summary').textContent = disabled
    ? 'Protection disabled. Saved rule settings and deny paths are preserved.'
    : `${state.secretPatterns.length - disabledCount} active, ${disabledCount} disabled`;
  qs('secret-patterns').innerHTML =
    rules.length === 0
      ? '<p class="empty">No secret protections match the search.</p>'
      : groupRules(rules)
          .map((group) => {
            const expanded =
              secretGroupExpanded.get(group.category) ||
              (searchActive && !searchCollapsedSecretGroups.has(group.category));
            const contentId = `secret-group-${group.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            const allGroupRules = loaded.secretPatterns.filter(
              (rule) => rule.category === group.category,
            );
            const onCount = disabled
              ? 0
              : allGroupRules.filter((rule) => secretRuleIsActive(rule, overrides)).length;
            return `
      <section class="rule-tier">
        <div class="rule-tier-head">
          <button type="button" class="tier-collapse" data-secret-group-toggle="${escapeHtml(group.category)}" aria-expanded="${expanded}" aria-controls="${contentId}">
            <span class="panel-chevron" aria-hidden="true"></span>
            <span class="tier-label"><strong>${escapeHtml(group.category)}</strong></span>
            <span class="tier-counts">${tierCountHtml([
              [onCount, 'on'],
              [allGroupRules.length - onCount, 'off', 'off'],
            ])}</span>
          </button>
          <input type="checkbox" class="tier-switch" data-secret-group-active="${escapeHtml(group.category)}" ${checkbox(allGroupRules.some((rule) => secretRuleIsActive(rule, overrides)))} ${disabled ? 'disabled' : ''} aria-label="${escapeHtml(`All ${group.category} protections`)}">
        </div>
        <div id="${contentId}" class="tier-content" ${expanded ? '' : 'hidden'}>
        <div class="grid">${group.rules
          .map((rule) => {
            const active = secretRuleIsActive(rule, overrides);
            const ruleState =
              active && !disabled
                ? { label: 'Active', className: 'state-active' }
                : { label: 'Disabled', className: 'state-disabled' };
            const control = `<input type="checkbox" data-secret-active="${escapeHtml(rule.id)}" ${checkbox(active)} ${disabled ? 'disabled' : ''}>
            <span>
              <strong>${escapeHtml(rule.label)}</strong>
              <button type="button" class="rule-id" data-rule-activity="${escapeHtml(rule.id)}" title="Show recent blocks in Activity">${escapeHtml(rule.id)}</button>
              <small><span class="${ruleState.className}">${ruleState.label}</span> ${escapeHtml(rule.description ?? '')}</small>
            </span>`;
            const chip = projectFieldChip(`secret_protection.overrides.${rule.id}`, true);
            if (!rule.paths) {
              return `<label class="row ${disabled ? 'row-disabled' : ''}">${control}${chip}</label>`;
            }
            return `<div class="row rule-row ${disabled ? 'row-disabled' : ''}">
            <label class="rule-control">${control}</label>
            <button type="button" class="rule-example-button" data-secret-paths="${escapeHtml(rule.id)}" aria-label="${escapeHtml(`Show protected paths for ${rule.label}`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
            ${chip}
          </div>`;
          })
          .join('')}</div>
        </div>
      </section>
    `;
          })
          .join('');
};
const presetName = () => safetyLevels[draftPolicy.safety.level][0];
const renderPresetStatus = () => {
  if (!preview) return;
  const customized =
    preview.counts.effectiveCustomizations > 0 ||
    Object.entries(draftPolicy.safety.overrides).some(
      ([key, value]) =>
        value !== SAFETY_LEVEL_CAPABILITIES[draftPolicy.safety.level][key as SafetyLevelCapability],
    );
  qs('safety-preset-status').textContent = customized ? `${presetName()} · Customized` : '';
  qs('safety-preset-status').classList.toggle('customized', customized);
};
const renderSafety = () => {
  const environmentSources = preview
    ? [
        ...new Set(
          Object.values(preview.capabilities)
            .filter((capability) => capability.source === 'environment')
            .flatMap((capability) =>
              capability.sources.filter((source) => source.startsWith('env ')),
            ),
        ),
      ]
    : [];
  qs('environment-overrides').hidden = environmentSources.length === 0;
  qs('environment-overrides').textContent = environmentSources.length
    ? `Environment-raised protection: ${environmentSources.join(', ')}`
    : '';
  qs('safety-level').innerHTML =
    projectFieldLine('safety.level') +
    Object.entries(safetyLevels)
      .map(
        ([level, meta]) =>
          `<label class="row preset-${level}"><input type="radio" name="safety-level" value="${level}" ${checkbox(draftPolicy.safety.level === level)}><span><strong>${meta[0]}</strong><small>${meta[1]}</small></span></label>`,
      )
      .join('');
  const inherited = SAFETY_LEVEL_CAPABILITIES[draftPolicy.safety.level];
  qs('safety-overrides').innerHTML = Object.entries(safetyOverrides)
    .map(([key, meta]) => {
      const value = draftPolicy.safety.overrides[key as SafetyLevelCapability];
      const inheritedText = inherited[key as SafetyLevelCapability] ? 'on' : 'off';
      return `<label class="row safety-override-row"><span><strong>${meta[0]}</strong><small>${meta[1]}</small></span><select data-safety-override="${key}">
      <option value="inherit" ${value === undefined ? 'selected' : ''}>Inherit from preset (${inheritedText})</option>
      <option value="true" ${value === true ? 'selected' : ''}>Force on</option>
      <option value="false" ${value === false ? 'selected' : ''}>Force off</option>
    </select>${projectFieldChip(`safety.overrides.${key}`, true)}</label>`;
    })
    .join('');
  qs('workflow').innerHTML =
    `<label class="row"><input type="checkbox" data-workflow-worktree ${checkbox(draftPolicy.workflow.worktree_mode)}><span><strong>Allow discarding local changes in linked git worktrees</strong><small>Only relaxes linked worktree discard checks.</small></span>${projectFieldChip('workflow.worktree_mode')}</label>`;
  renderPresetStatus();
};
const tierForRule = (rule: DestructiveRule): Tier => {
  if (!rule.activationCapability) return 'normal';
  return rule.activationCapability === 'fail_closed' ? 'strict' : 'paranoid';
};
const tierMeta: Record<Tier, [string, string]> = {
  normal: ['Available in every preset', 'No additional capability required'],
  strict: ['Strict tier', 'Inherits from Fail closed'],
  paranoid: ['Paranoid tier', 'Inherits from Paranoid rm or Paranoid interpreters'],
};
const ruleStateText = (
  rule: DestructiveRule,
  effective: RuleState,
  capabilities: Preview['capabilities'],
) => {
  // Only a rule that names an activation capability reaches the two branches
  // below: both sources describe how that capability was decided.
  const capability = rule.activationCapability;
  if (effective.source === 'master_disabled')
    return 'Off — destructive-command protection disabled';
  if (effective.source === 'rule_override')
    return `${effective.enabled ? 'On' : 'Off'} — user rule override`;
  if (effective.source === 'built_in_default') return 'On — available in every preset';
  if (effective.source === 'environment') {
    const sources = capability ? (capabilities[capability]?.sources ?? []) : [];
    const source = [...sources].reverse().find((item) => item.startsWith('env '));
    return `${effective.enabled ? 'On' : 'Off'} — environment${source ? `; ${source.slice(4)}` : ''}`;
  }
  if (effective.source === 'capability_override' && capability) {
    return `${effective.enabled ? 'On' : 'Off'} — capability override; ${safetyOverrides[capability][0]} forced ${effective.enabled ? 'on' : 'off'}`;
  }
  if (effective.enabled) return `On — ${presetName()} preset`;
  return `Off — ${presetName()} preset; requires ${tierForRule(rule) === 'strict' ? 'Strict' : 'Paranoid'}`;
};
const showRulePopover = (button: HTMLElement, label: string, title: string, body: string) => {
  const popover = qs('rule-example-popover');
  qs('rule-example-label').textContent = label;
  qs('rule-example-title').textContent = title;
  qs('rule-example-command').textContent = body;
  if (!popover.matches(':popover-open')) popover.showPopover();
  const buttonRect = button.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const gap = 8;
  const edge = 12;
  const below = buttonRect.bottom + gap;
  const top =
    below + popoverRect.height <= window.innerHeight - edge
      ? below
      : Math.max(edge, buttonRect.top - gap - popoverRect.height);
  const left = Math.min(
    window.innerWidth - popoverRect.width - edge,
    Math.max(edge, buttonRect.right - popoverRect.width),
  );
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
};
const openRuleExample = (button: HTMLElement) => {
  const rule = state?.destructiveCommandRules.find(
    (item) => item.id === button.dataset.ruleExample,
  );
  if (!rule) return;
  showRulePopover(button, 'Blocked command example', rule.label, rule.example);
};
const openSecretPaths = (button: HTMLElement) => {
  const rule = state?.secretPatterns.find((item) => item.id === button.dataset.secretPaths);
  if (!rule?.paths) return;
  showRulePopover(button, 'Protected paths', rule.label, rule.paths.join('\n'));
};
const renderDestructiveCommands = () => {
  if (!state || !preview) return;
  // The tier and rule callbacks below are closures, where the module-level
  // policy and preview are no longer known to be loaded.
  const loaded = state;
  const effectiveState = preview;
  const query = qs<HTMLInputElement>('policy-search').value.trim().toLowerCase();
  const matchingRules = state.destructiveCommandRules.filter((rule) =>
    [rule.category, rule.label, rule.id, rule.description, tierMeta[tierForRule(rule)][0]]
      .join(' ')
      .toLowerCase()
      .includes(query),
  );
  qs('destructive-command-summary').textContent = draftPolicy.destructive_command_protection.enabled
    ? `${preview.counts.enabled} active, ${preview.counts.disabled} disabled`
    : 'Configurable protection disabled. Catastrophic protections remain active; saved rule settings and allow paths are preserved.';
  const enforcedRules = matchingRules.filter((rule) => rule.catastrophic);
  const configurableRules = matchingRules.filter((rule) => !rule.catastrophic);
  const enforcedExpanded =
    tierExpanded.get('enforced') || (searchActive && !searchCollapsedTiers.has('enforced'));
  const enforcedSection =
    enforcedRules.length === 0
      ? ''
      : `<section class="rule-tier rule-tier-enforced">
        <div class="rule-tier-head">
          <button type="button" class="tier-collapse" data-tier-toggle="enforced" aria-expanded="${enforcedExpanded}" aria-controls="destructive-tier-enforced">
            <span class="panel-chevron" aria-hidden="true"></span>
            <span class="tier-label"><strong>Always enforced</strong><small>Cannot be disabled by any preset, rule override, or allow path</small></span>
            <span class="tier-counts">${enforcedRules.length} protection${enforcedRules.length === 1 ? '' : 's'}</span>
          </button>
        </div>
        <div id="destructive-tier-enforced" class="tier-content" ${enforcedExpanded ? '' : 'hidden'}>
          ${groupRules(enforcedRules)
            .map(
              (group) => `<section class="destructive-command-group">
            <h3>${escapeHtml(group.category)}</h3>
            <div class="grid">${group.rules
              .map(
                (rule) => `<div class="row rule-row">
                <span class="rule-control">
                  <span>
                    <strong>${escapeHtml(rule.label)}</strong>
                    <button type="button" class="rule-id" data-rule-activity="${escapeHtml(rule.id)}" title="Show recent blocks in Activity">${escapeHtml(rule.id)}</button>
                    <small><span class="state-active">Always enforced</span> ${escapeHtml(rule.description)}</small>
                  </span>
                </span>
                <button type="button" class="rule-example-button" data-rule-example="${escapeHtml(rule.id)}" aria-label="${escapeHtml(`Show blocked example for ${rule.label}`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
              </div>`,
              )
              .join('')}</div>
          </section>`,
            )
            .join('')}
        </div>
      </section>`;
  qs('destructive-command-rules').innerHTML =
    matchingRules.length === 0
      ? '<p class="empty">No built-in protections match the search.</p>'
      : enforcedSection +
        (Object.keys(tierMeta) as Tier[])
          .map((tier) => {
            const rules = configurableRules.filter((rule) => tierForRule(rule) === tier);
            if (rules.length === 0) return '';
            const allTierRules = loaded.destructiveCommandRules.filter(
              (rule) => !rule.catastrophic && tierForRule(rule) === tier,
            );
            const tierStates = allTierRules.flatMap((rule) => effectiveState.rules[rule.id] ?? []);
            const expanded =
              tierExpanded.get(tier) || (searchActive && !searchCollapsedTiers.has(tier));
            const contentId = `destructive-tier-${tier}`;
            return `<section class="rule-tier rule-tier-${tier}">
        <div class="rule-tier-head">
          <button type="button" class="tier-collapse" data-tier-toggle="${tier}" aria-expanded="${expanded}" aria-controls="${contentId}">
            <span class="panel-chevron" aria-hidden="true"></span>
            <span class="tier-label"><strong>${tierMeta[tier][0]}</strong><small>${tierMeta[tier][1]}</small></span>
            <span class="tier-counts">${tierCountHtml([
              [tierStates.filter((item) => item.enabled).length, 'on'],
              [tierStates.filter((item) => !item.enabled).length, 'off', 'off'],
            ])}</span>
          </button>
          <input type="checkbox" class="tier-switch" data-destructive-tier-active="${tier}" ${checkbox(tierStates.some((item) => item.enabled))} ${!draftPolicy.destructive_command_protection.enabled ? 'disabled' : ''} aria-label="${escapeHtml(`All ${tierMeta[tier][0]} protections`)}">
        </div>
        <div id="${contentId}" class="tier-content" ${expanded ? '' : 'hidden'}>
          ${groupRules(rules)
            .map(
              (group) => `<section class="destructive-command-group">
            <h3>${escapeHtml(group.category)}</h3>
            <div class="grid">${group.rules
              .map((rule) => {
                const effective = effectiveState.rules[rule.id];
                if (!effective) return '';
                const override = draftPolicy.destructive_command_protection.overrides[rule.id];
                const status = ruleStateText(rule, effective, effectiveState.capabilities);
                const disabled = !draftPolicy.destructive_command_protection.enabled;
                return `<div class="row rule-row ${disabled ? 'row-disabled' : ''}">
                <label class="rule-control">
                  <input type="checkbox" data-destructive-command-active="${escapeHtml(rule.id)}" ${checkbox(effective.enabled)} ${disabled ? 'disabled' : ''} aria-label="${escapeHtml(`${rule.label}: ${status}`)}">
                  <span>
                    <strong>${escapeHtml(rule.label)}</strong>
                    <button type="button" class="rule-id" data-rule-activity="${escapeHtml(rule.id)}" title="Show recent blocks in Activity">${escapeHtml(rule.id)}</button>
                    <small><span class="${effective.enabled ? 'state-active' : 'state-disabled'}">${escapeHtml(status)}</span> ${escapeHtml(rule.description)}</small>
                  </span>
                </label>
                <button type="button" class="rule-example-button" data-rule-example="${escapeHtml(rule.id)}" aria-label="${escapeHtml(`Show blocked example for ${rule.label}`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
                ${override && !effective.changesInherited ? `<button type="button" class="inherit-button" data-use-inherited="${escapeHtml(rule.id)}">Use inherited setting</button>` : ''}
                ${projectFieldChip(`destructive_command_protection.overrides.${rule.id}`, true)}
              </div>`;
              })
              .join('')}</div>
          </section>`,
            )
            .join('')}
        </div>
      </section>`;
          })
          .join('');
};
const refreshPolicyPreview = async () => {
  const requestId = ++previewRequestId;
  const result = await requestPolicyPreview(
    effectivePreviewPolicy(collectFormPolicy(), projectDraft?.baseline ?? null),
  );
  if (requestId !== previewRequestId) return false;
  if (!result.ok || !result.data?.preview) {
    setAppStatus('Preview failed', 'error');
    setDetailStatus(`Error: ${errorText(result)}`, 'error');
    return false;
  }
  preview = result.data.preview;
  renderProtectionCard();
  renderSafety();
  renderDestructiveCommands();
  void runCommandTest();
  return true;
};
let testerRequestId = 0;
const runCommandTest = async () => {
  const command = qs<HTMLInputElement>('tester-input').value.trim();
  if (!command) {
    qs('tester-result').hidden = true;
    return;
  }
  const requestId = ++testerRequestId;
  const result = await requestJson('/api/policy/explain', {
    method: 'POST',
    body: JSON.stringify({
      command,
      policy: effectivePreviewPolicy(collectFormPolicy(), projectDraft?.baseline ?? null),
    }),
  });
  if (requestId !== testerRequestId) return;
  const el = qs('tester-result');
  el.hidden = false;
  if (!result.ok) {
    el.className = 'status error';
    el.textContent = `Could not evaluate: ${errorText(result)}`;
    return;
  }
  if (result.data.result === 'allowed') {
    el.className = 'status ok';
    // Carries the command that was actually evaluated: the input is editable
    // after the result renders, so reading it back would prefill a different one.
    el.innerHTML = `Allowed — no rule blocks this command under the current draft policy. <button type="button" class="feed-toggle" data-create-rule="${escapeHtml(command)}">Create a rule for this</button>`;
    return;
  }
  const ruleId = result.data.customRule?.id ?? result.data.ruleId;
  const ruleIdHtml = result.data.customRule
    ? `<button type="button" class="rule-id" data-jump-custom-rule="${escapeHtml(ruleId)}" title="Show this rule in Rules">${escapeHtml(ruleId)}</button>`
    : `<code class="rule-id">${escapeHtml(ruleId)}</code>`;
  const segment =
    result.data.segment && result.data.segment !== command
      ? `<div class="tester-segment">Segment: <code>${escapeHtml(result.data.segment)}</code></div>`
      : '';
  el.className = 'status error';
  el.innerHTML = `Blocked${ruleId ? ` by ${ruleIdHtml}` : ''} — ${escapeHtml(result.data.reason || '')}${segment}`;
};
function render() {
  if (!state) return;
  draftPolicy = clonePolicy(state.policy);
  preview = state.preview;
  knownRuleIds = new Set(
    [...state.destructiveCommandRules, ...state.secretPatterns].map((rule) => rule.id),
  );
  dirty = false;
  qs('policy-savebar').hidden = true;
  qs('dirty-chip').hidden = true;
  qs('policy-path').textContent = state.path + (state.exists ? '' : ' (not created yet)');
  // The project policy is merged on top of the file this editor writes, so it is
  // named here and what it relaxes is stated; neither is editable from the GUI.
  const projectPolicy = state.projectPolicy;
  qs('project-policy-row').hidden = !projectPolicy;
  qs('project-policy-path').textContent = projectPolicy?.path ?? '';
  qs('project-policy-notice').hidden = !projectPolicy || projectPolicy.weakenings.length === 0;
  qs('project-policy-notice').textContent = projectPolicy
    ? ['Merged on top of this file:', ...projectPolicy.weakenings].join('\n')
    : '';
  qs('app-version').textContent = state.version;
  renderSafety();
  qs('destructive-command').innerHTML =
    '<label class="row master"><input type="checkbox" data-destructive-command-enabled ' +
    checkbox(state.policy.destructive_command_protection.enabled) +
    '><span><strong>Destructive command protection</strong><small>Block configurable destructive git, filesystem, and execution patterns. Catastrophic and custom rules remain active when disabled.</small></span><span class="master-badge">' +
    (state.policy.destructive_command_protection.enabled ? 'On' : 'Off') +
    '</span><span class="project-chip-slot" id="destructive-enabled-chip"></span></label>' +
    '<div id="destructive-command-rules"></div>' +
    '<section class="rule-tier">' +
    '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="allow-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="allow-paths-label">Allow paths</strong><small>Recursive deletes targeting these paths are not blocked, like /tmp. The home directory, or any path containing it, is rejected.</small></span><span class="tier-counts" id="allow-paths-count"></span></button>' +
    '<div class="tier-content paths-content" id="allow-paths-content" hidden>' +
    '<p class="muted">Use an absolute path or a ~/ path. Paste multiple lines to add several paths at once.</p>' +
    '<div class="paths-add"><input type="text" id="allow-paths-input" data-path-input="allow-paths" autocomplete="off" spellcheck="false" placeholder="/absolute/path or ~/path" aria-labelledby="allow-paths-label"><button type="button" class="icon-button" id="allow-paths-add-button" data-path-add="allow-paths" aria-label="Add allow path">' +
    pathListIcons.add +
    '</button></div>' +
    '<p class="paths-hint" id="allow-paths-hint" hidden></p>' +
    '<span class="project-chip-slot" id="allow-paths-chip"></span>' +
    '<ul class="paths-list" id="allow-paths-list"></ul>' +
    '</div></section>';
  qs('secret').innerHTML =
    '<label class="row master"><input type="checkbox" id="secret-enabled" ' +
    checkbox(state.policy.secret_protection.enabled) +
    '><span><strong>Secret protection</strong><small>Block default sensitive paths, coding CLI credential locations, and configured deny paths.</small></span><span class="master-badge">' +
    (state.policy.secret_protection.enabled ? 'On' : 'Off') +
    '</span><span class="project-chip-slot" id="secret-enabled-chip"></span></label>' +
    '<div id="secret-patterns"></div>' +
    '<section class="rule-tier">' +
    '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="deny-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="deny-paths-label">Deny paths</strong><small>Configured paths and everything inside them are blocked while Secret protection is on.</small></span><span class="tier-counts" id="deny-paths-count"></span></button>' +
    '<div class="tier-content paths-content" id="deny-paths-content" hidden>' +
    '<p class="muted">Paste multiple lines to add several paths at once.</p>' +
    '<div class="paths-add"><input type="text" id="deny-paths-input" data-path-input="deny-paths" autocomplete="off" spellcheck="false" placeholder="path/to/protect" aria-labelledby="deny-paths-label"><button type="button" class="icon-button" id="deny-paths-add-button" data-path-add="deny-paths" aria-label="Add deny path">' +
    pathListIcons.add +
    '</button></div>' +
    '<p class="paths-hint" id="deny-paths-hint" hidden></p>' +
    '<span class="project-chip-slot" id="deny-paths-chip"></span>' +
    '<ul class="paths-list" id="deny-paths-list"></ul>' +
    '</div></section>' +
    '<section class="rule-tier">' +
    '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="secret-allow-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="secret-allow-paths-label">Allow paths</strong><small>Configured files and subtrees are exempt from the pattern rules. Deny paths and coding CLI protections still apply. Entries covering the home directory are rejected, and glob patterns are not supported.</small></span><span class="tier-counts" id="secret-allow-paths-count"></span></button>' +
    '<div class="tier-content paths-content" id="secret-allow-paths-content" hidden>' +
    '<p class="muted">Paste multiple lines to add several paths at once.</p>' +
    '<div class="paths-add"><input type="text" id="secret-allow-paths-input" data-path-input="secret-allow-paths" autocomplete="off" spellcheck="false" placeholder="~/project/.env.test or ~/project/fixtures" aria-labelledby="secret-allow-paths-label"><button type="button" class="icon-button" id="secret-allow-paths-add-button" data-path-add="secret-allow-paths" aria-label="Add allow path">' +
    pathListIcons.add +
    '</button></div>' +
    '<p class="paths-hint" id="secret-allow-paths-hint" hidden></p>' +
    '<span class="project-chip-slot" id="secret-allow-paths-chip"></span>' +
    '<ul class="paths-list" id="secret-allow-paths-list"></ul>' +
    '</div></section>';
  qs<HTMLTextAreaElement>('raw').value = state.errors.length
    ? state.raw
    : formatPolicy(draftPolicy);
  qs<HTMLInputElement>('policy-search').value = '';
  syncSearchState();
  renderDestructiveCommands();
  renderSecretPatterns();
  pathLists['deny-paths'].render();
  pathLists['secret-allow-paths'].render();
  pathLists['allow-paths'].render();
  syncProjectChips();
  updateRawSource();
  renderRetention(state);
  qs('recovery').hidden = state.errors.length === 0;
  updateActions();
  renderProtectionCard();
  if (state.errors.length) {
    if (currentView() !== 'policy') location.hash = 'policy';
    setAppStatus('Repair required', 'error');
    setDetailStatus(`Error: ${state.errors.join('\n')}`, 'error');
    return;
  }
  setAppStatus('');
  setDetailStatus('');
}
const restoreDraft = () => {
  if (!state || state.errors.length) return;
  const stored = sessionStorage.getItem('cc-safety-net-draft');
  if (!stored) return;
  const parsed = (() => {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  })();
  // The render path below dereferences every field checked here, so a draft
  // saved by an older build - or damaged in storage - must fail validation and
  // be discarded rather than crash rendering after a successful policy load.
  // 'audit' is checked so a draft stored before the field existed is discarded
  // rather than restored and saved back over the configured retention.
  const isRecordField = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const isOptionalPathList = (value: unknown) =>
    value === undefined ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'));
  const isPolicyShape =
    isRecordField(parsed) &&
    isRecordField(parsed.safety) &&
    typeof parsed.safety.level === 'string' &&
    Object.hasOwn(safetyLevels, parsed.safety.level) &&
    isRecordField(parsed.safety.overrides) &&
    isRecordField(parsed.workflow) &&
    isRecordField(parsed.destructive_command_protection) &&
    isRecordField(parsed.destructive_command_protection.overrides) &&
    isOptionalPathList(parsed.destructive_command_protection.allow_paths) &&
    isRecordField(parsed.secret_protection) &&
    isRecordField(parsed.secret_protection.overrides) &&
    isOptionalPathList(parsed.secret_protection.deny_paths) &&
    isOptionalPathList(parsed.secret_protection.allow_paths) &&
    isRecordField(parsed.audit);
  if (!isPolicyShape || stored === JSON.stringify(state.policy)) {
    sessionStorage.removeItem('cc-safety-net-draft');
    return;
  }
  // Validated above: every field the render path reads has its checked shape.
  const draft = parsed as Policy;
  // Path lists added after a draft was stored restore as empty rather than
  // discarding the rest of the draft.
  draft.destructive_command_protection.allow_paths ??= [];
  draft.secret_protection.deny_paths ??= [];
  draft.secret_protection.allow_paths ??= [];
  draftPolicy = draft;
  renderPolicySections();
  void refreshPolicyPreview();
  setAppStatus('Restored unsaved draft', 'ok');
};
// Redraws every control from `draftPolicy` without the full render(), which
// reseeds the draft from the saved policy and would discard it.
function renderPolicySections() {
  // render() builds the two master-toggle checkboxes from state.policy and the
  // sub-renders below do not rebuild them, so sync them from the draft.
  const masterToggle = document.querySelector<HTMLInputElement>(
    '[data-destructive-command-enabled]',
  );
  if (masterToggle) masterToggle.checked = draftPolicy.destructive_command_protection.enabled;
  qs<HTMLInputElement>('secret-enabled').checked = draftPolicy.secret_protection.enabled;
  syncMasterBadges();
  renderSafety();
  renderDestructiveCommands();
  renderSecretPatterns();
  pathLists['deny-paths'].render();
  pathLists['secret-allow-paths'].render();
  pathLists['allow-paths'].render();
  syncProjectChips();
  syncRawFromForm();
  updateDirtyStatus();
}
async function load() {
  const result = await requestJson('/api/policy');
  if (!result.ok || !result.data) {
    setAppStatus('Load failed', 'error');
    setDetailStatus(`Error: Could not load policy: ${errorText(result)}`, 'error');
    return false;
  }
  state = result.data;
  render();
  restoreDraft();
  return true;
}
// The delegated handlers below read the event target, which the DOM types as a
// bare EventTarget; each one narrows it once here to the element kind its
// branches actually use.
const targetInput = (event: Event) =>
  event.target instanceof HTMLInputElement ? event.target : null;
const targetElement = (event: Event) => (event.target instanceof Element ? event.target : null);
document.addEventListener('input', (event) => {
  const input = targetInput(event);
  if (!input) return;
  if (input.id === 'policy-search') {
    syncSearchState();
    renderDestructiveCommands();
    renderSecretPatterns();
    return;
  }
  if (input.id === 'activity-search' && activity) {
    if (clearCommandFilter()) renderActivityControls();
    activityFilters.query = input.value.trim().toLowerCase();
    // Rebuilding a windowed feed costs ~250ms, so coalesce a burst of typing
    // into one render rather than blocking the keystroke that triggered it.
    clearTimeout(activityQueryTimer);
    activityQueryTimer = setTimeout(renderActivityFeed, 120);
  }
});
document.addEventListener('keydown', (event) => {
  const input = targetInput(event);
  if (!input) return;
  if (input.id === 'tester-input' && event.key === 'Enter') {
    event.preventDefault();
    void runCommandTest();
    return;
  }
  const list = pathListFor(input.dataset.pathInput);
  if (!list || event.key !== 'Enter') return;
  event.preventDefault();
  void list.add(input.value);
});
document.addEventListener('paste', (event) => {
  const input = targetInput(event);
  if (!input) return;
  const list = pathListFor(input.dataset.pathInput);
  if (!list) return;
  const text = event.clipboardData?.getData('text') ?? '';
  if (!text.includes('\n')) return;
  event.preventDefault();
  void list.add(`${input.value}\n${text}`);
});
// Posts a policy write and reports a failed one, so every caller shares the one
// success test rather than repeating the error plumbing.
const writePolicy = async (path: string, body: string, failureStatus: string) => {
  const result = await requestJson(path, { method: 'POST', body });
  if (isWriteSuccess(result)) return result;
  setAppStatus(failureStatus, 'error');
  setDetailStatus(`Error: ${errorText(result)}`, 'error');
  return null;
};
// A completed write makes the stored draft stale: discarding it before the
// reload is what keeps restoreDraft from resurrecting the pre-write policy.
const reloadAfterWrite = async () => {
  sessionStorage.removeItem('cc-safety-net-draft');
  if (!(await load())) return false;
  dirty = false;
  setDetailStatus('');
  return true;
};
const setProjectDraftDiagnostics = (messages: string[]) => {
  qs('project-draft-diagnostics').textContent = messages.join('\n');
  qs('project-draft-diagnostics').hidden = messages.length === 0;
};
const renderProjectDraftBar = () => {
  qs('project-draft-enter').hidden = projectDraft !== null;
  qs('project-draft-bar').hidden = projectDraft === null;
  qs('save').textContent = projectDraft ? 'Review & apply' : 'Save';
  if (!projectDraft) return;
  qs('project-draft-path').textContent = projectDraft.path;
  qs('project-draft-change').hidden = !projectDraft.canPickDirectory;
};
const exitProjectDraft = () => {
  projectDraft = null;
  markedFields = new Set();
  setProjectDraftDiagnostics([]);
  // The reload the callers run afterwards is asynchronous and can fail; until
  // it lands the controls must describe the saved user policy, not the project
  // draft - a Save on the lingering values would write them into the user scope.
  if (state) draftPolicy = clonePolicy(state.policy);
  renderProjectDraftBar();
  renderPolicySections();
};
// The one path from a project-state response into draft state, so its refusal
// covers entry, the directory-change reseed, and the stale-revision refetch
// alike. The rendered recovery banner is only a fast-path pre-check: the user
// policy can go unreadable after the page last loaded - while the native picker
// is open, say - and seeding through it would show the protective defaults it
// degrades to as the values this project inherits.
const ingestProjectState = async (okStatus: string) => {
  const result = await requestJson('/api/policy/project');
  if (!result.ok || !result.data) {
    setAppStatus('Project draft unavailable', 'error');
    setDetailStatus(`Error: ${errorText(result)}`, 'error');
    return false;
  }
  const seeded = seedProjectDraft(result.data);
  if (!seeded) {
    exitProjectDraft();
    // Reloads the user policy so the recovery banner describes the file as it
    // is now rather than as it was at the last load.
    await load();
    setAppStatus('Repair required', 'error');
    setDetailStatus(
      [
        'Error: repair your user policy before drafting a project policy.',
        ...(Array.isArray(result.data.userPolicyDiagnostics)
          ? (result.data.userPolicyDiagnostics as string[])
          : []),
      ].join('\n'),
      'error',
    );
    return false;
  }
  projectDraft = {
    dir: result.data.dir,
    path: result.data.path,
    revision: result.data.revision,
    canPickDirectory: result.data.canPickDirectory === true,
    baseline: seeded.baseline,
    snapshot: seeded.snapshot,
  };
  markedFields = seeded.marked;
  draftPolicy = seeded.policy;
  // A project file that could not be read starts the draft empty and says so,
  // rather than pretending the fields it sets loaded.
  setProjectDraftDiagnostics(
    Array.isArray(result.data.projectionDiagnostics) ? result.data.projectionDiagnostics : [],
  );
  renderProjectDraftBar();
  renderPolicySections();
  void refreshPolicyPreview();
  setAppStatus(okStatus, 'ok');
  return true;
};
const enterProjectDraft = async () => {
  if (!state) {
    setAppStatus('Load failed', 'error');
    setDetailStatus('Error: Policy is not loaded yet. Reload the page.', 'error');
    return;
  }
  // The rendered banner is the fast path; ingesting the project state below
  // asks the server, which is the check that cannot be stale.
  if (state.errors.length) {
    setAppStatus('Repair required', 'error');
    setDetailStatus('Error: repair your user policy before drafting a project policy.', 'error');
    return;
  }
  // The draft inherits from the saved user policy, so unsaved edits to it would
  // make every inherited value on screen a value nobody has.
  if (dirty) {
    if (
      !(await confirmDialog({
        title: 'Discard unsaved policy changes?',
        body: 'A project draft starts from your saved user policy. Save your changes first, or discard them here.',
        confirmLabel: 'Discard changes',
        confirmClass: '',
      }))
    )
      return;
    sessionStorage.removeItem('cc-safety-net-draft');
    if (!(await load())) return;
  }
  await ingestProjectState('Drafting a project policy.');
};
const confirmDiscardProjectDraft = async (body: string) =>
  !dirty ||
  (await confirmDialog({
    title: 'Discard this project draft?',
    body,
    confirmLabel: 'Discard draft',
    confirmClass: '',
  }));
const changeProjectDirectory = async () => {
  if (!(await confirmDiscardProjectDraft('Switching projects discards this draft.'))) return;
  const result = await requestJson('/api/policy/project/choose-directory', { method: 'POST' });
  if (!result.ok) {
    setAppStatus('Could not open the folder picker', 'error');
    setDetailStatus(`Error: ${errorText(result)}`, 'error');
    return;
  }
  if (result.data.error) {
    setAppStatus(result.data.error, 'error');
    return;
  }
  // A cancelled pick leaves the session directory, and this draft, alone.
  if (result.data.cancelled) return;
  await ingestProjectState('Drafting a project policy.');
};
const leaveProjectDraft = async () => {
  if (!(await confirmDiscardProjectDraft('The fields you marked are not written anywhere yet.')))
    return;
  exitProjectDraft();
  if (await load()) setAppStatus('Left the project draft.', 'ok');
};
// Restores the proposal the draft entered with - which fields it marks as well
// as their values - instead of the user-mode discard, which reloads saved user
// state and would leave the display describing a different proposal.
const discardProjectDraft = async () => {
  const draft = projectDraft;
  if (!draft) return;
  if (
    !(await confirmDialog({
      title: 'Discard changes to this draft?',
      body: 'The draft returns to the fields this project already sets.',
      confirmLabel: 'Discard changes',
      confirmClass: '',
    }))
  )
    return;
  const snapshot = JSON.parse(draft.snapshot) as ProjectProposal;
  markedFields = new Set(projectMarkedFields(snapshot));
  draftPolicy = overlayProjectProposal(draft.baseline, snapshot);
  renderPolicySections();
  void refreshPolicyPreview();
  setAppStatus('Changes discarded.', 'ok');
};
const handleStaleProjectDraft = async () => {
  if (!(await ingestProjectState('Project draft reloaded.'))) return;
  setAppStatus('Project target changed', 'error');
  setDetailStatus(
    'Error: the project directory changed, so this draft was reloaded for the new target. Review it again before applying.',
    'error',
  );
};
const projectDiffHtml = (data: {
  rows?: { field: string; before?: string; after?: string }[];
  weakenings?: string[];
  existingFileDiagnostics?: string[];
}) => {
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const warnings = [
    // The CLI replaces an unreadable project file after the same confirmation;
    // here the replacement is stated instead of silent.
    ...(data.existingFileDiagnostics?.length
      ? ['The existing project policy file is invalid and will be replaced.']
      : []),
    ...(data.weakenings ?? []),
  ];
  const table =
    rows.length === 0
      ? '<p class="empty">No change to the effective policy.</p>'
      : `<table class="diff-table"><thead><tr><th>Setting</th><th>Now</th><th>After</th></tr></thead><tbody>${rows
          .map(
            (row) =>
              `<tr><td><code>${escapeHtml(row.field)}</code></td><td class="diff-before">${escapeHtml(row.before ?? '(unset)')}</td><td class="diff-after">${escapeHtml(row.after ?? '(unset)')}</td></tr>`,
          )
          .join('')}</tbody></table>`;
  return table + warnings.map((text) => `<p class="diff-warning">${escapeHtml(text)}</p>`).join('');
};
// The rows come from the server on the same code path as CLI `policy check`,
// and the apply revalidates independently: what the dialog shows is display.
const reviewProjectDraft = async () => {
  const draft = projectDraft;
  if (!draft) return;
  const proposal = collectProjectProposal(markedFields, draftPolicy);
  const serialized = JSON.stringify(proposal);
  const body = JSON.stringify({ revision: draft.revision, proposal });
  const diff = await requestJson('/api/policy/project/diff', { method: 'POST', body });
  // The draft was exited or reseeded while the diff was in flight. Checked
  // before the 409 branch: its refetch would otherwise re-enter draft mode the
  // user just left, and an exit does not bump the server revision, so a stale
  // continuation could still open the dialog and apply.
  if (projectDraft !== draft) return;
  if (diff.status === 409) {
    await handleStaleProjectDraft();
    return;
  }
  if (!diff.ok) {
    setAppStatus('Review failed', 'error');
    setDetailStatus(`Error: ${errorText(diff)}`, 'error');
    return;
  }
  // The form stays live while the diff request is in flight; the modal keeps it
  // inert from here on. An edit that landed in that window must force another
  // review - applying `body` would silently discard it.
  if (JSON.stringify(collectProjectProposal(markedFields, draftPolicy)) !== serialized) {
    setAppStatus('Review again', 'error');
    setDetailStatus(
      'Error: the draft changed while the review was loading. Review it again.',
      'error',
    );
    return;
  }
  if (
    !(await confirmDialog({
      title: 'Apply this project policy?',
      body: 'Everyone who works in this project gets these changes on top of their own user policy.',
      detail: draft.path,
      rowsHtml: projectDiffHtml(diff.data),
      confirmLabel: 'Apply project policy',
      confirmClass: 'primary',
    }))
  )
    return;
  await runExclusive('Applying...', async () => {
    const applied = await requestJson('/api/policy/project/apply', { method: 'POST', body });
    if (applied.status === 409) {
      await handleStaleProjectDraft();
      return;
    }
    if (!isWriteSuccess(applied)) {
      setAppStatus('Apply failed', 'error');
      setDetailStatus(`Error: ${errorText(applied)}`, 'error');
      return;
    }
    const path = applied.data.path;
    exitProjectDraft();
    if (await load()) setAppStatus(`Applied ${path}.`, 'ok');
  });
};
// Saves on its own rather than through the policy savebar, which lives in the
// Policy view and cannot be reached from Settings. It writes the saved policy
// with only this field changed, so unsaved Policy edits are not committed by
// touching a Settings control.
const saveRetentionDays = async (days: number) => {
  const saved = state;
  if (!saved) return;
  const current = saved.policy.audit.retention_days;
  if (!Number.isInteger(days) || days < 1 || days > MAX_RETENTION_DAYS) {
    qs<HTMLInputElement>('retention-days').value = String(current);
    setAppStatus('Retention unchanged', 'error');
    setDetailStatus(
      `Error: retention must be a whole number of days from 1 to ${MAX_RETENTION_DAYS}.`,
      'error',
    );
    return;
  }
  if (days === current) return;
  // Audit is user scope only, so this write rewrites the very baseline an active
  // project draft inherits from, and its reload would discard the draft.
  if (projectDraft) {
    qs<HTMLInputElement>('retention-days').value = String(current);
    setAppStatus('Retention unchanged', 'error');
    setDetailStatus('Error: exit or apply your project draft first.', 'error');
    return;
  }
  // Saving reloads the policy, and the reload restores the stored draft — whose
  // retention is the old value, so the next Policy save would undo this one.
  if (dirty) {
    qs<HTMLInputElement>('retention-days').value = String(current);
    setAppStatus('Retention unchanged', 'error');
    setDetailStatus('Error: save or discard your unsaved Policy changes first.', 'error');
    return;
  }
  if (
    days < current &&
    !(await confirmDialog({
      title: `Shorten retention to ${dayCount(days)}?`,
      body: `Audit entries older than ${dayCount(days)} are deleted on the next sweep and cannot be recovered. The Activity tab will only look back ${dayCount(days)}.`,
      detail: overview?.logsDir ?? '',
      confirmLabel: 'Shorten',
      confirmClass: 'danger',
    }))
  ) {
    qs<HTMLInputElement>('retention-days').value = String(current);
    return;
  }
  await runExclusive('Saving...', async () => {
    const policy = clonePolicy(saved.policy);
    policy.audit.retention_days = days;
    if (!(await writePolicy('/api/policy', JSON.stringify(policy), 'Save failed'))) {
      qs<HTMLInputElement>('retention-days').value = String(current);
      return;
    }
    // Reloads through load() rather than reloadAfterWrite(): the write carried
    // none of the Policy edits, so the stored draft is still live and must be
    // restored instead of discarded.
    if (!(await load())) return;
    // A narrower window may no longer offer the selected one.
    activityFilters.days = Math.min(activityFilters.days, days);
    await Promise.all([loadOverview(), loadActivity()]);
    setAppStatus(`Retention set to ${dayCount(days)}.`, 'ok');
    setDetailStatus('');
  });
};
document.addEventListener('change', (event) => {
  const control = event.target;
  if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
  if (control.id === 'activity-days') {
    activityFilters.days = Number(control.value);
    void loadActivity();
    return;
  }
  if (control.id === 'retention-days') {
    void saveRetentionDays(Number(control.value));
    return;
  }
  if (control.name === 'safety-level') {
    draftPolicy.safety.level = control.value as SafetyLevel;
    markProjectField('safety.level');
    renderSafety();
    syncRawFromForm();
    updateDirtyStatus();
    void refreshPolicyPreview();
    return;
  }
  if (control.dataset?.safetyOverride) {
    // Same project-mode rule as the rule overrides: in project scope draftPolicy is the
    // baseline overlaid with the marked fields, so deleting here would strip an inherited
    // user value from the display. Unmarking below rebuilds it from the baseline instead.
    if (control.value === 'inherit' && !projectDraft)
      delete draftPolicy.safety.overrides[control.dataset.safetyOverride as Capability];
    if (control.value === 'true')
      draftPolicy.safety.overrides[control.dataset.safetyOverride as Capability] = true;
    if (control.value === 'false')
      draftPolicy.safety.overrides[control.dataset.safetyOverride as Capability] = false;
    // "Inherit" is the absence of the field, which in project scope is exactly
    // what leaving it unmarked means.
    if (control.value === 'inherit')
      unmarkProjectField(`safety.overrides.${control.dataset.safetyOverride}`);
    if (control.value !== 'inherit')
      markProjectField(`safety.overrides.${control.dataset.safetyOverride}`);
    syncRawFromForm();
    updateDirtyStatus();
    void refreshPolicyPreview();
    return;
  }
  // Every branch below is driven by a checkbox, so the target has to be one.
  const input = control instanceof HTMLInputElement ? control : null;
  if (!input) return;
  if ('workflowWorktree' in input.dataset) {
    draftPolicy.workflow.worktree_mode = input.checked;
    markProjectField('workflow.worktree_mode');
    syncRawFromForm();
    updateDirtyStatus();
    return;
  }
  if ('destructiveCommandEnabled' in input.dataset) {
    void (async () => {
      if (
        !input.checked &&
        !(await confirmProtectionDisable({
          title: 'Disable destructive command protection?',
          body: 'Built-in destructive git, filesystem, and execution protections will stop blocking commands until you turn this back on.',
          detail: 'Custom rules remain active.',
        }))
      ) {
        input.checked = true;
        return;
      }
      draftPolicy.destructive_command_protection.enabled = input.checked;
      markProjectField('destructive_command_protection.enabled');
      syncMasterBadges();
      pathLists['allow-paths'].render();
      syncRawFromForm();
      updateDirtyStatus();
      void refreshPolicyPreview();
    })();
    return;
  }
  if (input.dataset?.destructiveTierActive) {
    // A bulk write over the same per-rule overrides the individual switches
    // use, so a rule that already matches what it inherits keeps no override.
    const effectiveState = preview;
    if (!effectiveState) return;
    state?.destructiveCommandRules
      .filter(
        (rule) => !rule.catastrophic && tierForRule(rule) === input.dataset.destructiveTierActive,
      )
      .forEach((rule) => {
        setDestructiveOverride(
          rule.id,
          input.checked,
          effectiveState.rules[rule.id]?.inheritedEnabled,
        );
      });
    syncRawFromForm();
    updateDirtyStatus();
    void refreshPolicyPreview();
    return;
  }
  if (input.dataset?.destructiveCommandActive) {
    const ruleId = input.dataset.destructiveCommandActive;
    setDestructiveOverride(ruleId, input.checked, preview?.rules[ruleId]?.inheritedEnabled);
    syncRawFromForm();
    updateDirtyStatus();
    void refreshPolicyPreview();
    return;
  }
  if (input.dataset?.secretGroupActive) {
    // A bulk write over the same per-rule overrides the individual switches
    // use, not a stored group setting.
    state?.secretPatterns
      .filter((rule) => rule.category === input.dataset.secretGroupActive)
      .forEach((rule) => {
        setSecretOverride(rule, input.checked);
      });
    renderSecretPatterns();
    syncRawFromForm();
    updateDirtyStatus();
    return;
  }
  if (input.dataset?.secretActive) {
    const rule = state?.secretPatterns.find((item) => item.id === input.dataset.secretActive);
    if (!rule) return;
    setSecretOverride(rule, input.checked);
    renderSecretPatterns();
    syncRawFromForm();
    updateDirtyStatus();
    return;
  }
  if (input.id === 'secret-enabled') {
    void (async () => {
      if (
        !input.checked &&
        !(await confirmProtectionDisable({
          title: 'Disable secret protection?',
          body: 'Default sensitive paths, coding CLI credential locations, and deny paths will stop blocking access until you turn this back on.',
        }))
      ) {
        input.checked = true;
        return;
      }
      draftPolicy.secret_protection.enabled = input.checked;
      markProjectField('secret_protection.enabled');
      syncMasterBadges();
      renderSecretPatterns();
      pathLists['deny-paths'].render();
      pathLists['secret-allow-paths'].render();
      syncRawFromForm();
      updateDirtyStatus();
    })();
  }
});
document.addEventListener('click', (event) => {
  const target = targetElement(event);
  if (!target) return;
  if (target.closest<HTMLElement>('#tester-run')) {
    void runCommandTest();
    return;
  }
  if (target.closest<HTMLElement>('#project-draft-enter')) {
    void enterProjectDraft();
    return;
  }
  if (target.closest<HTMLElement>('#project-draft-change')) {
    void changeProjectDirectory();
    return;
  }
  if (target.closest<HTMLElement>('#project-draft-exit')) {
    void leaveProjectDraft();
    return;
  }
  const unmarkButton = target.closest<HTMLElement>('[data-unmark-field]');
  if (unmarkButton) {
    unmarkProjectField(unmarkButton.dataset.unmarkField ?? '');
    return;
  }
  const createRule = target.closest<HTMLElement>('[data-create-rule]');
  if (createRule) {
    openRuleComposer(createRule.dataset.createRule ?? '');
    return;
  }
  const feedToggle = target.closest<HTMLElement>('[data-feed-toggle]');
  if (feedToggle) {
    const command = feedToggle.previousElementSibling;
    if (!command) return;
    const expanded = command.classList.toggle('expanded');
    feedToggle.setAttribute('aria-expanded', String(expanded));
    feedToggle.textContent = expanded ? 'Show less' : 'Show more';
    return;
  }
  const feedCopy = target.closest<HTMLElement>('[data-log-copy]');
  if (feedCopy) {
    copyFeedEntry(feedCopy);
    return;
  }
  const feedReport = target.closest<HTMLElement>('[data-report-fp]');
  if (feedReport) {
    openReportDialog(feedReport);
    return;
  }
  const blockFuture = target.closest<HTMLElement>('[data-block-future]');
  if (blockFuture) {
    const entry = renderedFeedEntries[Number(blockFuture.dataset.blockFuture)];
    // With no recorded command there is nothing to prefill, and opening anyway
    // would clear whatever the user had already typed into the composer.
    if (entry?.segment || entry?.command) openRuleComposer(entry.segment || entry.command || '');
    return;
  }
  const topRule = target.closest<HTMLElement>('.top-rule');
  if (topRule) {
    const ruleId = topRule.dataset.ruleId ?? '';
    (ruleId.startsWith('custom.') ? jumpToRulesRule : jumpToActivityRule)(ruleId);
    return;
  }
  const ruleActivity = target.closest<HTMLElement>('[data-rule-activity]');
  if (ruleActivity) {
    jumpToActivityRule(ruleActivity.dataset.ruleActivity ?? '');
    return;
  }
  const jumpRule = target.closest<HTMLElement>('[data-jump-rule]');
  if (jumpRule) {
    qs<HTMLInputElement>('policy-search').value = jumpRule.dataset.jumpRule ?? '';
    syncSearchState();
    renderDestructiveCommands();
    renderSecretPatterns();
    location.hash = 'policy';
    return;
  }
  const jumpCustom = target.closest<HTMLElement>('[data-jump-custom-rule]');
  if (jumpCustom) {
    jumpToRulesRule(jumpCustom.dataset.jumpCustomRule ?? '');
    return;
  }
  const topCommand = target.closest<HTMLElement>('.top-command');
  if (topCommand) {
    // Exact, blocked-only match on the signature so the feed count reconciles
    // with the Top blocked commands tally; shown as a removable pill, not search
    // text, since a substring query would over-match.
    activityFilters.command = topCommand.dataset.command ?? '';
    activityFilters.decision = 'deny';
    activityFilters.query = '';
    qs<HTMLInputElement>('activity-search').value = '';
    if (activity) {
      renderActivityControls();
      renderActivityFeed();
    }
    location.hash = 'activity';
    return;
  }
  if (target.closest<HTMLElement>('[data-clear-command]')) {
    clearCommandFilter();
    renderActivityControls();
    renderActivityFeed();
    return;
  }
  if (target.closest<HTMLElement>('#guard-errors')) {
    clearCommandFilter();
    activityFilters.decision = 'error';
    if (activity) {
      renderActivityControls();
      renderActivityFeed();
    }
    location.hash = 'activity';
    return;
  }
  const chip = target.closest<HTMLElement>('[data-activity-chip]');
  if (chip && activity) {
    clearCommandFilter();
    activityFilters[chip.dataset.activityChip as 'decision' | 'agent'] =
      chip.dataset.chipValue ?? '';
    renderActivityControls();
    renderActivityFeed();
    return;
  }
  if (target.closest<HTMLElement>('#activity-refresh')) {
    void refreshActivity();
    return;
  }
  if (target.closest<HTMLElement>('#integrations-refresh')) {
    void refreshIntegrations();
    return;
  }
  if (target.closest<HTMLElement>('#rules-refresh')) {
    void refreshRules();
    return;
  }
  const scopeChip = target.closest<HTMLElement>('[data-rules-scope]');
  if (scopeChip) {
    setRulesScope(scopeChip.dataset.rulesScope ?? '');
    return;
  }
  const exampleChip = target.closest<HTMLElement>('[data-rules-example]');
  if (exampleChip) {
    qs<HTMLTextAreaElement>('rules-composer-input').value = exampleChip.dataset.rulesExample ?? '';
    return;
  }
  if (target.closest<HTMLElement>('#rules-choose-directory')) {
    void chooseProjectDirectory();
    return;
  }
  if (target.closest<HTMLElement>('#rules-copy-prompt')) {
    void copyRulePrompt();
    return;
  }
  const integrationButton = target.closest<HTMLElement>('[data-integration-action]');
  if (integrationButton) {
    void runIntegrationAction(integrationButton);
    return;
  }
  const ruleExampleButton = target.closest<HTMLElement>('[data-rule-example]');
  if (ruleExampleButton) {
    openRuleExample(ruleExampleButton);
    return;
  }
  const secretPathsButton = target.closest<HTMLElement>('[data-secret-paths]');
  if (secretPathsButton) {
    openSecretPaths(secretPathsButton);
    return;
  }
  const tierButton = target.closest<HTMLElement>('[data-tier-toggle]');
  if (tierButton) {
    const tier = tierButton.dataset.tierToggle ?? '';
    const expanded = tierButton.getAttribute('aria-expanded') === 'true';
    tierExpanded.set(tier, !expanded);
    if (searchActive && expanded) searchCollapsedTiers.add(tier);
    if (!expanded) searchCollapsedTiers.delete(tier);
    renderDestructiveCommands();
    return;
  }
  const secretGroupButton = target.closest<HTMLElement>('[data-secret-group-toggle]');
  if (secretGroupButton) {
    const category = secretGroupButton.dataset.secretGroupToggle ?? '';
    const expanded = secretGroupButton.getAttribute('aria-expanded') === 'true';
    secretGroupExpanded.set(category, !expanded);
    if (searchActive && expanded) searchCollapsedSecretGroups.add(category);
    if (!expanded) searchCollapsedSecretGroups.delete(category);
    renderSecretPatterns();
    return;
  }
  // The group switches sit inside .rule-tier-head, which is no longer the
  // collapse control there; togglePanel would read an aria-controls it lacks.
  if (target.closest<HTMLElement>('[data-secret-group-active], [data-destructive-tier-active]'))
    return;
  const button = target.closest<HTMLElement>('.panel-toggle, .rule-tier-head');
  if (button) {
    togglePanel(button);
    return;
  }
  const inheritedButton = target.closest<HTMLElement>('[data-use-inherited]');
  if (inheritedButton) {
    const ruleId = inheritedButton.dataset.useInherited ?? '';
    if (projectDraft) {
      unmarkProjectField(`destructive_command_protection.overrides.${ruleId}`);
      return;
    }
    delete draftPolicy.destructive_command_protection.overrides[ruleId];
    syncRawFromForm();
    updateDirtyStatus();
    void refreshPolicyPreview();
    return;
  }
  if (target.closest<HTMLElement>('#reset-rule-customizations')) {
    if (Object.keys(draftPolicy.destructive_command_protection.overrides).length === 0) {
      setAppStatus('No customizations to reset', 'ok');
      return;
    }
    void (async () => {
      if (
        !(await confirmDialog({
          title: 'Restore defaults?',
          body: 'All built-in destructive-command rules will return to their inherited preset settings.',
          confirmLabel: 'Restore defaults',
        }))
      )
        return;
      clearProjectOverrideMarks('destructive_command_protection');
      if (projectDraft) {
        rebuildProjectDisplay();
        return;
      }
      draftPolicy.destructive_command_protection.overrides = {};
      syncRawFromForm();
      updateDirtyStatus();
      void refreshPolicyPreview();
    })();
    return;
  }
  if (target.closest<HTMLElement>('#reset-secret-customizations')) {
    if (Object.keys(draftPolicy.secret_protection.overrides).length === 0) {
      setAppStatus('No customizations to reset', 'ok');
      return;
    }
    void (async () => {
      if (
        !(await confirmDialog({
          title: 'Restore defaults?',
          body: 'All built-in secret rules will return to their inherited preset settings.',
          confirmLabel: 'Restore defaults',
        }))
      )
        return;
      clearProjectOverrideMarks('secret_protection');
      if (projectDraft) {
        rebuildProjectDisplay();
        return;
      }
      draftPolicy.secret_protection.overrides = {};
      renderSecretPatterns();
      syncRawFromForm();
      updateDirtyStatus();
      void refreshPolicyPreview();
    })();
    return;
  }
  if (target.closest<HTMLElement>('#discard-changes')) {
    if (projectDraft) {
      void discardProjectDraft();
      return;
    }
    void (async () => {
      if (
        !(await confirmDialog({
          title: 'Discard unsaved changes?',
          body: 'All changes since your last save will be reverted.',
          confirmLabel: 'Discard changes',
          confirmClass: '',
        }))
      )
        return;
      void runExclusive('Discarding...', async () => {
        sessionStorage.removeItem('cc-safety-net-draft');
        if (await load()) setAppStatus('Changes discarded.', 'ok');
      });
    })();
    return;
  }
  const addButton = target.closest<HTMLElement>('[data-path-add]');
  if (addButton) {
    const list = pathListFor(addButton.dataset.pathAdd);
    if (list) void list.add(qs<HTMLInputElement>(`${addButton.dataset.pathAdd}-input`).value);
    return;
  }
  const removeButton = target.closest<HTMLElement>('[data-path-remove]');
  if (removeButton)
    pathListFor(removeButton.dataset.pathList)?.remove(Number(removeButton.dataset.pathRemove));
  const starButton = target.closest('.star-cta');
  if (starButton instanceof HTMLButtonElement) {
    void starRepo(starButton);
    return;
  }
});
qs('dirty-chip').onclick = () => {
  location.hash = 'policy';
};
qs('save').onclick = () => {
  if (!state) {
    setAppStatus('Load failed', 'error');
    setDetailStatus('Error: Policy is not loaded yet. Reload the page.', 'error');
    return;
  }
  if (state.errors.length) {
    setAppStatus('Repair required', 'error');
    setDetailStatus('Error: Repair policy before saving changes.', 'error');
    return;
  }
  // In project mode this button reviews the proposal instead of writing the
  // user policy: the write happens only after the diff is confirmed.
  if (projectDraft) {
    void reviewProjectDraft();
    return;
  }
  if (!dirty) {
    setAppStatus('No changes to save', 'ok');
    setDetailStatus('');
    return;
  }
  const policy = collectFormPolicy();
  void runExclusive('Saving...', async () => {
    const result = await writePolicy('/api/policy', JSON.stringify(policy), 'Save failed');
    if (!result) return;
    if (await reloadAfterWrite()) setAppStatus(`Saved ${result.data.path}.`, 'ok');
  });
};
qs('repair').onclick = async () => {
  if (!state) {
    setAppStatus('Load failed', 'error');
    setDetailStatus('Error: Policy is not loaded yet. Reload the page.', 'error');
    return;
  }
  if (state.errors.length === 0) {
    setAppStatus('');
    setDetailStatus('');
    return;
  }
  if (
    !(await confirmDialog({
      title: 'Repair policy?',
      body: 'This will write canonical policy JSON. Valid settings are preserved; invalid fields are discarded. If the JSON cannot be parsed, defaults are restored.',
      detail: state.path,
      confirmLabel: 'Repair',
      confirmClass: 'primary',
    }))
  ) {
    return;
  }
  void runExclusive('Repairing...', async () => {
    const result = await writePolicy('/api/repair', '{}', 'Repair failed');
    if (!result) return;
    if (await reloadAfterWrite()) setAppStatus(`Repaired ${result.data.path}.`, 'ok');
  });
};
qs('reset').onclick = async () => {
  if (!state) {
    setAppStatus('Load failed', 'error');
    setDetailStatus('Error: Policy is not loaded yet. Reload the page.', 'error');
    return;
  }
  // Rewrites the user policy the active draft inherits from, and its reload
  // would discard the draft along with it.
  if (projectDraft) {
    setAppStatus('Reset unavailable', 'error');
    setDetailStatus('Error: exit or apply your project draft first.', 'error');
    return;
  }
  if (
    !(await confirmDialog({
      title: 'Reset policy?',
      body: 'This will restore the default policy JSON at this path.',
      detail: state.path,
      confirmLabel: 'Reset policy',
    }))
  ) {
    return;
  }
  void runExclusive('Resetting...', async () => {
    const result = await writePolicy('/api/reset', '{}', 'Reset failed');
    if (!result) return;
    if (await reloadAfterWrite()) setAppStatus(`Reset ${result.data.path} to defaults.`, 'ok');
  });
};
setRawCopyCopied(false);
qs<HTMLButtonElement>('raw-copy').onclick = () => {
  void copyRawToClipboard();
};
const themeOrder: ThemePref[] = ['auto', 'light', 'dark'];
const themeIcons: Record<ThemePref, string> = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"></rect><path d="M8 20h8M12 16v4"></path></svg>',
  light:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"></path></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>',
};
const themeLabels: Record<ThemePref, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' };
const applyTheme = (pref: ThemePref) => {
  document.documentElement.style.colorScheme = pref === 'auto' ? 'light dark' : pref;
  qs('theme-toggle').innerHTML = `${themeIcons[pref]}<span>${themeLabels[pref]}</span>`;
  qs('theme-toggle').setAttribute(
    'aria-label',
    `Color theme: ${themeLabels[pref]}. Click to change.`,
  );
};
let themePref = themeOrder.includes(localStorage.getItem('cc-safety-net-theme') as ThemePref)
  ? (localStorage.getItem('cc-safety-net-theme') as ThemePref)
  : 'auto';
applyTheme(themePref);
qs('theme-toggle').onclick = () => {
  themePref = themeOrder[(themeOrder.indexOf(themePref) + 1) % themeOrder.length] ?? 'auto';
  if (themePref === 'auto') localStorage.removeItem('cc-safety-net-theme');
  else localStorage.setItem('cc-safety-net-theme', themePref);
  applyTheme(themePref);
};
window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});
window.addEventListener('hashchange', applyView);
applyView();
void loadHealth();
load()
  .then((loaded) => {
    if (loaded) void loadStarContext();
    activityFilters.days = Math.min(activityFilters.days, retentionDays());
    void loadOverview();
    void loadActivity();
  })
  .catch((error) => {
    setAppStatus('Load failed', 'error');
    setDetailStatus(String(error), 'error');
  });
