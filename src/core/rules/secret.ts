interface SecretProtectionRuleMetadata {
  id: string;
  category: string;
  label: string;
  description: string;
}

type SecretProtectionCodingCliRule = Omit<SecretProtectionRuleMetadata, 'description'> & {
  paths: readonly string[];
};

type SecretProtectionMatcherRule = SecretProtectionRuleMetadata & {
  basename?: string;
  extension?: string;
  pattern?: RegExp;
  prefix?: string;
  suffix?: string;
  suffixParts?: readonly string[];
};

export const SECRET_BASENAME_RULES = [
  {
    id: 'secret.basename.env',
    category: 'Basename',
    label: '.env',
    description: 'Blocks exact .env files.',
    basename: '.env',
  },
  {
    id: 'secret.basename.npmrc',
    category: 'Basename',
    label: '.npmrc',
    description: 'Blocks npm credential config files.',
    basename: '.npmrc',
  },
  {
    id: 'secret.basename.pypirc',
    category: 'Basename',
    label: '.pypirc',
    description: 'Blocks Python package index credential files.',
    basename: '.pypirc',
  },
  {
    id: 'secret.basename.netrc',
    category: 'Basename',
    label: '.netrc',
    description: 'Blocks machine login credential files.',
    basename: '.netrc',
  },
  {
    id: 'secret.basename.git-credentials',
    category: 'Basename',
    label: '.git-credentials',
    description: 'Blocks Git credential storage files.',
    basename: '.git-credentials',
  },
  {
    id: 'secret.basename.id-rsa',
    category: 'Basename',
    label: 'id_rsa',
    description: 'Blocks RSA private key basenames.',
    basename: 'id_rsa',
  },
  {
    id: 'secret.basename.id-ed25519',
    category: 'Basename',
    label: 'id_ed25519',
    description: 'Blocks Ed25519 private key basenames.',
    basename: 'id_ed25519',
  },
  {
    id: 'secret.basename.id-ecdsa',
    category: 'Basename',
    label: 'id_ecdsa',
    description: 'Blocks ECDSA private key basenames.',
    basename: 'id_ecdsa',
  },
  {
    id: 'secret.basename.credentials',
    category: 'Basename',
    label: 'credentials',
    description: 'Blocks generic credentials file basenames.',
    basename: 'credentials',
  },
] as const satisfies readonly SecretProtectionMatcherRule[];

export const SECRET_ENV_VARIANT_RULE = {
  id: 'secret.pattern.env-variant',
  category: 'Pattern',
  label: '.env.*',
  description: 'Blocks environment-specific .env variants.',
} as const satisfies SecretProtectionRuleMetadata;

const SECRET_HOME_PATH_CONFIG_VARIANT_SUFFIXES = [
  '.bak',
  '.backup',
  '.copy',
  '.disabled',
  '.old',
  '.orig',
  '.save',
  '.tmp',
] as const;

const SECRET_HOME_PATH_CONFIG_VARIANT_BASES = [
  {
    idSlug: 'kube-config',
    label: '~/.kube/config',
    directoryParts: ['.kube'],
    basename: 'config',
  },
  {
    idSlug: 'docker-config',
    label: '~/.docker/config.json',
    directoryParts: ['.docker'],
    basename: 'config.json',
  },
] as const;

export const SECRET_HOME_PATH_RULES = [
  {
    id: 'secret.home.ssh',
    category: 'Home path',
    label: '~/.ssh',
    description: 'Blocks home SSH configuration and key paths.',
    suffixParts: ['.ssh'],
  },
  {
    id: 'secret.home.aws',
    category: 'Home path',
    label: '~/.aws',
    description: 'Blocks home AWS credential and config paths.',
    suffixParts: ['.aws'],
  },
  {
    id: 'secret.home.gcp',
    category: 'Home path',
    label: '~/.gcp',
    description: 'Blocks home GCP credential paths.',
    suffixParts: ['.gcp'],
  },
  {
    id: 'secret.home.gcloud-config',
    category: 'Home path',
    label: '~/.config/gcloud',
    description: 'Blocks home Google Cloud SDK credential paths.',
    suffixParts: ['.config', 'gcloud'],
  },
  {
    id: 'secret.home.kube-config',
    category: 'Home path',
    label: '~/.kube/config',
    description: 'Blocks home Kubernetes config files.',
    suffixParts: ['.kube', 'config'],
  },
  {
    id: 'secret.home.docker-config',
    category: 'Home path',
    label: '~/.docker/config.json',
    description: 'Blocks home Docker credential config files.',
    suffixParts: ['.docker', 'config.json'],
  },
  ...SECRET_HOME_PATH_CONFIG_VARIANT_BASES.flatMap((rule) =>
    SECRET_HOME_PATH_CONFIG_VARIANT_SUFFIXES.map((suffix) => ({
      id: ['secret.home', rule.idSlug, suffix.slice(1)].join('.'),
      category: 'Home path',
      label: [rule.label, suffix].join(''),
      description: ['Blocks home ', rule.label, suffix, ' credential backup files.'].join(''),
      suffixParts: [...rule.directoryParts, [rule.basename, suffix].join('')],
    })),
  ),
  {
    id: 'secret.home.gh-hosts',
    category: 'Home path',
    label: '~/.config/gh/hosts.yml',
    description: 'Blocks GitHub CLI host credential files.',
    suffixParts: ['.config', 'gh', 'hosts.yml'],
  },
] as const satisfies readonly SecretProtectionMatcherRule[];

const SECRET_CODING_CLI_CONFIG_CATEGORY = 'Coding CLI config';

export const SECRET_CODING_CLI_RULES = [
  {
    id: 'secret.cli.claude-code',
    category: 'Coding CLI credential',
    label: 'Claude Code credentials',
    paths: ['~/.claude/.credentials.json'],
  },
  {
    id: 'secret.cli.claude-code.config',
    category: 'Coding CLI config',
    label: 'Claude Code config',
    paths: [
      '~/.claude/settings.json',
      '~/.claude/settings.local.json',
      '~/.claude.json',
      '<project>/.claude/settings.local.json',
      '<project>/.mcp.json',
    ],
  },
  {
    id: 'secret.cli.antigravity',
    category: 'Coding CLI config',
    label: 'Antigravity CLI hook config',
    paths: ['~/.gemini/config/hooks.json', '~/.gemini/config/mcp_config.json'],
  },
  {
    id: 'secret.cli.codex',
    category: 'Coding CLI credential',
    label: 'Codex credentials',
    paths: [
      '~/.codex/auth.json',
      '~/.codex/.credentials.json',
      '~/.codex/secrets',
      '~/.codex/.sandbox-secrets',
    ],
  },
  {
    id: 'secret.cli.codex.config',
    category: 'Coding CLI config',
    label: 'Codex config',
    paths: ['~/.codex/config.toml', '~/.codex/<name>.config.toml'],
  },
  {
    id: 'secret.cli.gemini',
    category: 'Coding CLI credential',
    label: 'Gemini CLI credentials',
    paths: [
      '~/.gemini/oauth_creds.json',
      '~/.gemini/mcp-oauth-tokens.json',
      '~/.gemini/a2a-oauth-tokens.json',
      '~/.gemini/gemini-credentials.json',
    ],
  },
  {
    id: 'secret.cli.gemini.config',
    category: 'Coding CLI config',
    label: 'Gemini CLI config',
    paths: [
      '~/.gemini/settings.json',
      '~/.gemini/google_accounts.json',
      '<project>/.gemini/settings.json',
      '/Library/Application Support/GeminiCli/settings.json',
      '/etc/gemini-cli/settings.json',
    ],
  },
  {
    id: 'secret.cli.copilot-cli',
    category: 'Coding CLI credential',
    label: 'GitHub Copilot CLI credentials',
    paths: ['~/.copilot/config.json', '~/.copilot/mcp-oauth-config', '~/.copilot/mcp-secrets'],
  },
  {
    id: 'secret.cli.copilot-cli.config',
    category: 'Coding CLI config',
    label: 'GitHub Copilot CLI config',
    paths: ['~/.copilot/mcp-config.json'],
  },
  {
    id: 'secret.cli.kimi-code',
    category: 'Coding CLI credential',
    label: 'Kimi Code credentials',
    paths: [
      '~/.kimi-code/server.token',
      '~/.kimi-code/credentials',
      '~/.kimi/credentials',
      '~/.kimi/mcp-oauth',
    ],
  },
  {
    id: 'secret.cli.kimi-code.config',
    category: 'Coding CLI config',
    label: 'Kimi Code config',
    paths: [
      '~/.kimi-code/config.toml',
      '~/.kimi-code/mcp.json',
      '~/.kimi/config.toml',
      '~/.kimi/config.json',
      '~/.kimi/config.json.bak',
      '~/.kimi/mcp.json',
      '<project>/.kimi-code/mcp.json',
    ],
  },
  {
    id: 'secret.cli.opencode',
    category: 'Coding CLI credential',
    label: 'OpenCode credentials',
    paths: [
      '~/.local/share/opencode/auth.json',
      '~/.local/share/opencode/mcp-auth.json',
      '~/.local/share/opencode/opencode.db',
    ],
  },
  {
    id: 'secret.cli.opencode.config',
    category: 'Coding CLI config',
    label: 'OpenCode config',
    paths: [
      '~/.config/opencode/opencode.json',
      '~/.config/opencode/opencode.jsonc',
      '/Library/Application Support/opencode/opencode.json',
      '/etc/opencode/opencode.json',
      '<project>/opencode.json',
      '<project>/opencode.jsonc',
    ],
  },
  {
    id: 'secret.cli.pi',
    category: 'Coding CLI credential',
    label: 'Pi credentials',
    paths: ['~/.pi/agent/auth.json'],
  },
  {
    id: 'secret.cli.pi.config',
    category: 'Coding CLI config',
    label: 'Pi config',
    paths: ['~/.pi/agent/models.json'],
  },
  {
    id: 'secret.cli.amp',
    category: 'Coding CLI credential',
    label: 'Amp Code credentials',
    paths: ['~/.local/share/amp/secrets.json', '~/.amp/oauth'],
  },
  {
    id: 'secret.cli.amp.config',
    category: 'Coding CLI config',
    label: 'Amp Code config',
    paths: [
      '~/.config/amp/settings.json',
      '~/.config/amp/settings.jsonc',
      '<project>/.amp/settings.json',
      '<project>/.amp/settings.jsonc',
    ],
  },
  {
    id: 'secret.cli.cursor',
    category: 'Coding CLI credential',
    label: 'Cursor CLI credentials',
    paths: [
      '~/.cursor/auth.json',
      '~/.config/cursor/auth.json',
      '~/.cursor/projects/<name>/mcp-auth.json',
    ],
  },
  {
    id: 'secret.cli.cursor.config',
    category: 'Coding CLI config',
    label: 'Cursor CLI config',
    paths: ['~/.cursor/mcp.json', '<project>/.cursor/mcp.json'],
  },
  {
    id: 'secret.cli.grok-build',
    category: 'Coding CLI credential',
    label: 'Grok Build credentials',
    paths: ['~/.grok/auth.json', '~/.grok/mcp_credentials.json'],
  },
  {
    id: 'secret.cli.grok-build.config',
    category: 'Coding CLI config',
    label: 'Grok Build config',
    paths: [
      '~/.grok/config.toml',
      '~/.grok/managed_config.toml',
      '~/.grok/requirements.toml',
      '<project>/.grok/config.toml',
      '/etc/grok/managed_config.toml',
      '/etc/grok/requirements.toml',
    ],
  },
] as const satisfies readonly SecretProtectionCodingCliRule[];

const SECRET_VARIANT_PREFIXES = [
  { prefix: 'id_rsa', slug: 'id-rsa', label: 'id_rsa' },
  { prefix: 'id_dsa', slug: 'id-dsa', label: 'id_dsa' },
  { prefix: 'id_ed25519', slug: 'id-ed25519', label: 'id_ed25519' },
  { prefix: 'id_ecdsa', slug: 'id-ecdsa', label: 'id_ecdsa' },
  { prefix: 'credentials', slug: 'credentials', label: 'credentials' },
] as const;

const SECRET_DOT_VARIANT_SUFFIXES = [
  '.bak',
  '.backup',
  '.copy',
  '.disabled',
  '.key',
  '.old',
  '.orig',
  '.pem',
  '.save',
  '.tmp',
] as const;

export const SECRET_VARIANT_SEPARATOR_RULES = SECRET_VARIANT_PREFIXES.map((rule) => ({
  id: `secret.variant.${rule.slug}.separator`,
  category: 'Variant',
  label: `${rule.label}-* / ${rule.label}_*`,
  description: `Blocks ${rule.label} variants with dash or underscore suffixes.`,
  prefix: rule.prefix,
})) satisfies readonly SecretProtectionMatcherRule[];

export const SECRET_VARIANT_DOT_SUFFIX_RULES = SECRET_VARIANT_PREFIXES.flatMap((rule) =>
  SECRET_DOT_VARIANT_SUFFIXES.map((suffix) => ({
    id: `secret.variant.${rule.slug}.${suffix.slice(1)}`,
    category: 'Variant',
    label: `${rule.label}${suffix}`,
    description: `Blocks ${rule.label}${suffix} private credential variants.`,
    prefix: rule.prefix,
    suffix,
  })),
) satisfies readonly SecretProtectionMatcherRule[];

export const SECRET_BROAD_SSH_KEY_BASENAME_RULE = {
  id: 'secret.pattern.ssh-key-basename',
  category: 'Pattern',
  label: '*_(rsa|dsa|ed25519|ecdsa)',
  description: 'Blocks extensionless SSH private key-like basenames.',
  pattern: /^.*_(rsa|dsa|ed25519|ecdsa)$/,
} as const satisfies SecretProtectionMatcherRule;

export const SECRET_EXTENSION_RULES = [
  'agilekeychain',
  'asc',
  'bek',
  'cscfg',
  'fve',
  'gnucash',
  'jks',
  'keychain',
  'kwallet',
  'mdf',
  'ovpn',
  'p12',
  'pcap',
  'pem',
  'pfx',
  'pkcs12',
  'psafe3',
  'rdp',
  'sdf',
  'tblk',
  'tpm',
].map((extension) => ({
  id: `secret.ext.${extension}`,
  category: 'Extension',
  label: `.${extension}`,
  description: `Blocks files with the .${extension} extension.`,
  extension,
})) satisfies readonly SecretProtectionMatcherRule[];

export const SECRET_EXTENSION_PATTERN_RULES = [
  {
    id: 'secret.ext-pattern.key',
    category: 'Extension pattern',
    label: '.key / .keypair',
    description: 'Blocks key and keypair extension patterns.',
    pattern: /^key(pair)?$/,
  },
  {
    id: 'secret.ext-pattern.keystore',
    category: 'Extension pattern',
    label: '.keystore / .keyring',
    description: 'Blocks keystore and keyring extension patterns.',
    pattern: /^key(store|ring)$/,
  },
  {
    id: 'secret.ext-pattern.kdbx',
    category: 'Extension pattern',
    label: '.kdb / .kdbx',
    description: 'Blocks KeePass database extension patterns.',
    pattern: /^kdbx?$/,
  },
] as const satisfies readonly SecretProtectionMatcherRule[];

export const SECRET_PROTECTION_RULE_METADATA = [
  ...SECRET_BASENAME_RULES,
  SECRET_ENV_VARIANT_RULE,
  ...SECRET_HOME_PATH_RULES,
  ...SECRET_VARIANT_SEPARATOR_RULES,
  ...SECRET_VARIANT_DOT_SUFFIX_RULES,
  SECRET_BROAD_SSH_KEY_BASENAME_RULE,
  ...SECRET_EXTENSION_RULES,
  ...SECRET_EXTENSION_PATTERN_RULES,
  ...SECRET_CODING_CLI_RULES,
].map((rule) => ({
  id: rule.id,
  category: rule.category,
  label: rule.label,
  ...(rule.category === SECRET_CODING_CLI_CONFIG_CATEGORY ? { defaultOff: true } : {}),
  ...('paths' in rule ? { paths: rule.paths } : { description: rule.description }),
}));

// Mixed settings and MCP config files carry credentials inline, but agents edit them as
// routine work, so this tier ships off and the user opts in.
export const SECRET_DEFAULT_OFF_RULE_ID_SET = new Set<string>(
  SECRET_CODING_CLI_RULES.flatMap((rule) =>
    rule.category === SECRET_CODING_CLI_CONFIG_CATEGORY ? [rule.id] : [],
  ),
);

/** @internal */
export const SECRET_PROTECTION_RULE_IDS = SECRET_PROTECTION_RULE_METADATA.map((rule) => rule.id);
export const SECRET_PROTECTION_RULE_ID_SET = new Set<string>(SECRET_PROTECTION_RULE_IDS);
