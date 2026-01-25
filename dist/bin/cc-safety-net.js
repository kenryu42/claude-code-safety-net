#!/usr/bin/env node
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// node_modules/shell-quote/quote.js
var require_quote = __commonJS((exports, module) => {
  module.exports = function quote(xs) {
    return xs.map(function(s) {
      if (s === "") {
        return "''";
      }
      if (s && typeof s === "object") {
        return s.op.replace(/(.)/g, "\\$1");
      }
      if (/["\s\\]/.test(s) && !/'/.test(s)) {
        return "'" + s.replace(/(['])/g, "\\$1") + "'";
      }
      if (/["'\s]/.test(s)) {
        return '"' + s.replace(/(["\\$`!])/g, "\\$1") + '"';
      }
      return String(s).replace(/([A-Za-z]:)?([#!"$&'()*,:;<=>?@[\\\]^`{|}])/g, "$1\\$2");
    }).join(" ");
  };
});

// node_modules/shell-quote/parse.js
var require_parse = __commonJS((exports, module) => {
  var CONTROL = "(?:" + [
    "\\|\\|",
    "\\&\\&",
    ";;",
    "\\|\\&",
    "\\<\\(",
    "\\<\\<\\<",
    ">>",
    ">\\&",
    "<\\&",
    "[&;()|<>]"
  ].join("|") + ")";
  var controlRE = new RegExp("^" + CONTROL + "$");
  var META = "|&;()<> \\t";
  var SINGLE_QUOTE = '"((\\\\"|[^"])*?)"';
  var DOUBLE_QUOTE = "'((\\\\'|[^'])*?)'";
  var hash = /^#$/;
  var SQ = "'";
  var DQ = '"';
  var DS = "$";
  var TOKEN = "";
  var mult = 4294967296;
  for (i = 0;i < 4; i++) {
    TOKEN += (mult * Math.random()).toString(16);
  }
  var i;
  var startsWithToken = new RegExp("^" + TOKEN);
  function matchAll(s, r) {
    var origIndex = r.lastIndex;
    var matches = [];
    var matchObj;
    while (matchObj = r.exec(s)) {
      matches.push(matchObj);
      if (r.lastIndex === matchObj.index) {
        r.lastIndex += 1;
      }
    }
    r.lastIndex = origIndex;
    return matches;
  }
  function getVar(env, pre, key) {
    var r = typeof env === "function" ? env(key) : env[key];
    if (typeof r === "undefined" && key != "") {
      r = "";
    } else if (typeof r === "undefined") {
      r = "$";
    }
    if (typeof r === "object") {
      return pre + TOKEN + JSON.stringify(r) + TOKEN;
    }
    return pre + r;
  }
  function parseInternal(string, env, opts) {
    if (!opts) {
      opts = {};
    }
    var BS = opts.escape || "\\";
    var BAREWORD = "(\\" + BS + `['"` + META + `]|[^\\s'"` + META + "])+";
    var chunker = new RegExp([
      "(" + CONTROL + ")",
      "(" + BAREWORD + "|" + SINGLE_QUOTE + "|" + DOUBLE_QUOTE + ")+"
    ].join("|"), "g");
    var matches = matchAll(string, chunker);
    if (matches.length === 0) {
      return [];
    }
    if (!env) {
      env = {};
    }
    var commented = false;
    return matches.map(function(match) {
      var s = match[0];
      if (!s || commented) {
        return;
      }
      if (controlRE.test(s)) {
        return { op: s };
      }
      var quote = false;
      var esc = false;
      var out = "";
      var isGlob = false;
      var i2;
      function parseEnvVar() {
        i2 += 1;
        var varend;
        var varname;
        var char = s.charAt(i2);
        if (char === "{") {
          i2 += 1;
          if (s.charAt(i2) === "}") {
            throw new Error("Bad substitution: " + s.slice(i2 - 2, i2 + 1));
          }
          varend = s.indexOf("}", i2);
          if (varend < 0) {
            throw new Error("Bad substitution: " + s.slice(i2));
          }
          varname = s.slice(i2, varend);
          i2 = varend;
        } else if (/[*@#?$!_-]/.test(char)) {
          varname = char;
          i2 += 1;
        } else {
          var slicedFromI = s.slice(i2);
          varend = slicedFromI.match(/[^\w\d_]/);
          if (!varend) {
            varname = slicedFromI;
            i2 = s.length;
          } else {
            varname = slicedFromI.slice(0, varend.index);
            i2 += varend.index - 1;
          }
        }
        return getVar(env, "", varname);
      }
      for (i2 = 0;i2 < s.length; i2++) {
        var c = s.charAt(i2);
        isGlob = isGlob || !quote && (c === "*" || c === "?");
        if (esc) {
          out += c;
          esc = false;
        } else if (quote) {
          if (c === quote) {
            quote = false;
          } else if (quote == SQ) {
            out += c;
          } else {
            if (c === BS) {
              i2 += 1;
              c = s.charAt(i2);
              if (c === DQ || c === BS || c === DS) {
                out += c;
              } else {
                out += BS + c;
              }
            } else if (c === DS) {
              out += parseEnvVar();
            } else {
              out += c;
            }
          }
        } else if (c === DQ || c === SQ) {
          quote = c;
        } else if (controlRE.test(c)) {
          return { op: s };
        } else if (hash.test(c)) {
          commented = true;
          var commentObj = { comment: string.slice(match.index + i2 + 1) };
          if (out.length) {
            return [out, commentObj];
          }
          return [commentObj];
        } else if (c === BS) {
          esc = true;
        } else if (c === DS) {
          out += parseEnvVar();
        } else {
          out += c;
        }
      }
      if (isGlob) {
        return { op: "glob", pattern: out };
      }
      return out;
    }).reduce(function(prev, arg) {
      return typeof arg === "undefined" ? prev : prev.concat(arg);
    }, []);
  }
  module.exports = function parse(s, env, opts) {
    var mapped = parseInternal(s, env, opts);
    if (typeof env !== "function") {
      return mapped;
    }
    return mapped.reduce(function(acc, s2) {
      if (typeof s2 === "object") {
        return acc.concat(s2);
      }
      var xs = s2.split(RegExp("(" + TOKEN + ".*?" + TOKEN + ")", "g"));
      if (xs.length === 1) {
        return acc.concat(xs[0]);
      }
      return acc.concat(xs.filter(Boolean).map(function(x) {
        if (startsWithToken.test(x)) {
          return JSON.parse(x.split(TOKEN)[1]);
        }
        return x;
      }));
    }, []);
  };
});

// src/bin/commands/claude-code.ts
var claudeCodeCommand = {
  name: "claude-code",
  aliases: ["-cc", "--claude-code"],
  description: "Run as Claude Code PreToolUse hook (reads JSON from stdin)",
  usage: "-cc, --claude-code",
  options: [
    {
      flags: "-h, --help",
      description: "Show this help"
    }
  ],
  examples: ["cc-safety-net -cc", "cc-safety-net --claude-code"]
};

// src/bin/commands/copilot-cli.ts
var copilotCliCommand = {
  name: "copilot-cli",
  aliases: ["-cp", "--copilot-cli"],
  description: "Run as Copilot CLI PreToolUse hook (reads JSON from stdin)",
  usage: "-cp, --copilot-cli",
  options: [
    {
      flags: "-h, --help",
      description: "Show this help"
    }
  ],
  examples: ["cc-safety-net -cp", "cc-safety-net --copilot-cli"]
};

// src/bin/commands/custom-rules-doc.ts
var customRulesDocCommand = {
  name: "custom-rules-doc",
  aliases: ["--custom-rules-doc"],
  description: "Print custom rules documentation",
  usage: "--custom-rules-doc",
  options: [
    {
      flags: "-h, --help",
      description: "Show this help"
    }
  ],
  examples: ["cc-safety-net --custom-rules-doc"]
};

// src/bin/commands/doctor.ts
var doctorCommand = {
  name: "doctor",
  aliases: ["--doctor"],
  description: "Run diagnostic checks to verify installation and configuration",
  usage: "doctor [options]",
  options: [
    {
      flags: "--json",
      description: "Output diagnostics as JSON"
    },
    {
      flags: "--skip-update-check",
      description: "Skip npm registry version check"
    },
    {
      flags: "-h, --help",
      description: "Show this help"
    }
  ],
  examples: [
    "cc-safety-net doctor",
    "cc-safety-net doctor --json",
    "cc-safety-net doctor --skip-update-check"
  ]
};

// src/bin/commands/explain.ts
var explainCommand = {
  name: "explain",
  description: "Show step-by-step analysis trace of how a command would be analyzed",
  usage: "explain [options] <command>",
  argument: "<command>",
  options: [
    {
      flags: "--json",
      description: "Output analysis as JSON"
    },
    {
      flags: "--cwd",
      argument: "<path>",
      description: "Use custom working directory"
    },
    {
      flags: "-h, --help",
      description: "Show this help"
    }
  ],
  examples: [
    'cc-safety-net explain "git reset --hard"',
    'cc-safety-net explain --json "rm -rf /"',
    'cc-safety-net explain --cwd /tmp "git status"'
  ]
};

// src/bin/commands/gemini-cli.ts
var geminiCliCommand = {
  name: "gemini-cli",
  aliases: ["-gc", "--gemini-cli"],
  description: "Run as Gemini CLI BeforeTool hook (reads JSON from stdin)",
  usage: "-gc, --gemini-cli",
  options: [
    {
      flags: "-h, --help",
      description: "Show this help"
    }
  ],
  examples: ["cc-safety-net -gc", "cc-safety-net --gemini-cli"]
};

// src/bin/commands/statusline.ts
var statuslineCommand = {
  name: "statusline",
  aliases: ["--statusline"],
  description: "Print status line with mode indicators for shell integration",
  usage: "--statusline",
  options: [
    {
      flags: "-h, --help",
      description: "Show this help"
    }
  ],
  examples: ["cc-safety-net --statusline"]
};

// src/bin/commands/verify-config.ts
var verifyConfigCommand = {
  name: "verify-config",
  aliases: ["-vc", "--verify-config"],
  description: "Validate custom rules configuration files",
  usage: "-vc, --verify-config",
  options: [
    {
      flags: "-h, --help",
      description: "Show this help"
    }
  ],
  examples: ["cc-safety-net -vc", "cc-safety-net --verify-config"]
};

// src/bin/commands/index.ts
var commands = [
  doctorCommand,
  explainCommand,
  claudeCodeCommand,
  copilotCliCommand,
  geminiCliCommand,
  verifyConfigCommand,
  customRulesDocCommand,
  statuslineCommand
];
function findCommand(nameOrAlias) {
  const normalized = nameOrAlias.toLowerCase();
  return commands.find((cmd) => cmd.name.toLowerCase() === normalized || cmd.aliases?.some((alias) => alias.toLowerCase() === normalized));
}
function getVisibleCommands() {
  return commands.filter((cmd) => !cmd.hidden);
}

// src/bin/custom-rules-doc.ts
var CUSTOM_RULES_DOC = `# Custom Rules Reference

Agent reference for generating \`.safety-net.json\` config files.

## Config Locations

| Scope | Path | Priority |
|-------|------|----------|
| User | \`~/.cc-safety-net/config.json\` | Lower |
| Project | \`.safety-net.json\` (cwd) | Higher (overrides user) |

Duplicate rule names (case-insensitive) → project wins.

## Schema

\`\`\`json
{
  "$schema": "https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json",
  "version": 1,
  "rules": [...]
}
\`\`\`

- \`$schema\`: Optional. Enables IDE autocomplete and inline validation.
- \`version\`: Required. Must be \`1\`.
- \`rules\`: Optional. Defaults to \`[]\`.

**Always include \`$schema\`** when generating config files for IDE support.

## Rule Fields

| Field | Required | Constraints |
|-------|----------|-------------|
| \`name\` | Yes | \`^[a-zA-Z][a-zA-Z0-9_-]{0,63}$\` — unique (case-insensitive) |
| \`command\` | Yes | \`^[a-zA-Z][a-zA-Z0-9_-]*$\` — basename only, not path |
| \`subcommand\` | No | Same pattern as command. Omit to match any. |
| \`block_args\` | Yes | Non-empty array of non-empty strings |
| \`reason\` | Yes | Non-empty string, max 256 chars |

## Guidelines:

- \`name\`: kebab-case, descriptive (e.g., \`block-git-add-all\`)
- \`command\`: binary name only, lowercase
- \`subcommand\`: omit if rule applies to any subcommand
- \`block_args\`: include all variants (e.g., both \`-g\` and \`--global\`)
- \`reason\`: explain why blocked AND suggest alternative

## Matching Behavior

- **Command**: Normalized to basename (\`/usr/bin/git\` → \`git\`)
- **Subcommand**: First non-option argument after command
- **Arguments**: Matched literally. Command blocked if **any** \`block_args\` item present.
- **Short options**: Expanded (\`-Ap\` matches \`-A\`)
- **Long options**: Exact match (\`--all-files\` does NOT match \`--all\`)
- **Execution order**: Built-in rules first, then custom rules (additive only)

## Examples

### Block \`git add -A\`

\`\`\`json
{
  "$schema": "https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json",
  "version": 1,
  "rules": [
    {
      "name": "block-git-add-all",
      "command": "git",
      "subcommand": "add",
      "block_args": ["-A", "--all", "."],
      "reason": "Use 'git add <specific-files>' instead."
    }
  ]
}
\`\`\`

### Block global npm install

\`\`\`json
{
  "$schema": "https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json",
  "version": 1,
  "rules": [
    {
      "name": "block-npm-global",
      "command": "npm",
      "subcommand": "install",
      "block_args": ["-g", "--global"],
      "reason": "Use npx or local install."
    }
  ]
}
\`\`\`

### Block docker system prune

\`\`\`json
{
  "$schema": "https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json",
  "version": 1,
  "rules": [
    {
      "name": "block-docker-prune",
      "command": "docker",
      "subcommand": "system",
      "block_args": ["prune"],
      "reason": "Use targeted cleanup instead."
    }
  ]
}
\`\`\`

## Error Handling

Invalid config → silent fallback to built-in rules only. No custom rules applied.
`;

// src/bin/doctor/activity.ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function formatRelativeTime(date) {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0)
    return `${days}d ago`;
  if (hours > 0)
    return `${hours}h ago`;
  if (minutes > 0)
    return `${minutes}m ago`;
  return "just now";
}
function getActivitySummary(days = 7, logsDir = join(homedir(), ".cc-safety-net", "logs")) {
  if (!existsSync(logsDir)) {
    return { totalBlocked: 0, sessionCount: 0, recentEntries: [] };
  }
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const entries = [];
  let sessionCount = 0;
  let files;
  try {
    files = readdirSync(logsDir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return { totalBlocked: 0, sessionCount: 0, recentEntries: [] };
  }
  for (const file of files) {
    try {
      const content = readFileSync(join(logsDir, file), "utf-8");
      const lines = content.trim().split(`
`).filter(Boolean);
      let hasRecentEntry = false;
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const ts = new Date(entry.ts).getTime();
          if (ts >= cutoff) {
            entries.push(entry);
            hasRecentEntry = true;
          }
        } catch {}
      }
      if (hasRecentEntry) {
        sessionCount++;
      }
    } catch {}
  }
  entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const recentEntries = entries.slice(0, 3).map((e) => ({
    timestamp: e.ts,
    command: e.command,
    reason: e.reason,
    relativeTime: formatRelativeTime(new Date(e.ts))
  }));
  return {
    totalBlocked: entries.length,
    sessionCount,
    recentEntries,
    oldestEntry: entries.at(-1)?.ts,
    newestEntry: entries.at(0)?.ts
  };
}

// src/bin/doctor/config.ts
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "node:fs";

// src/core/config.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join2, resolve } from "node:path";

// src/types.ts
var MAX_RECURSION_DEPTH = 10;
var MAX_STRIP_ITERATIONS = 20;
var NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
var COMMAND_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
var MAX_REASON_LENGTH = 256;
var SHELL_OPERATORS = new Set(["&&", "||", "|&", "|", "&", ";", `
`]);
var SHELL_WRAPPERS = new Set(["bash", "sh", "zsh", "ksh", "dash", "fish", "csh", "tcsh"]);
var INTERPRETERS = new Set(["python", "python3", "python2", "node", "ruby", "perl"]);
var DANGEROUS_PATTERNS = [
  /\brm\s+.*-[rR].*-f\b/,
  /\brm\s+.*-f.*-[rR]\b/,
  /\brm\s+-rf\b/,
  /\brm\s+-fr\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+checkout\s+--\b/,
  /\bgit\s+clean\s+-f\b/,
  /\bfind\b.*\s-delete\b/
];
var PARANOID_INTERPRETERS_SUFFIX = `

(Paranoid mode: interpreter one-liners are blocked.)`;

// src/core/config.ts
var DEFAULT_CONFIG = {
  version: 1,
  rules: []
};
function loadConfig(cwd, options) {
  const safeCwd = typeof cwd === "string" ? cwd : process.cwd();
  const userConfigDir = options?.userConfigDir ?? join2(homedir2(), ".cc-safety-net");
  const userConfigPath = join2(userConfigDir, "config.json");
  const projectConfigPath = join2(safeCwd, ".safety-net.json");
  const userConfig = loadSingleConfig(userConfigPath);
  const projectConfig = loadSingleConfig(projectConfigPath);
  return mergeConfigs(userConfig, projectConfig);
}
function loadSingleConfig(path) {
  if (!existsSync2(path)) {
    return null;
  }
  try {
    const content = readFileSync2(path, "utf-8");
    if (!content.trim()) {
      return null;
    }
    const parsed = JSON.parse(content);
    const result = validateConfig(parsed);
    if (result.errors.length > 0) {
      return null;
    }
    const cfg = parsed;
    return {
      version: cfg.version,
      rules: cfg.rules ?? []
    };
  } catch {
    return null;
  }
}
function mergeConfigs(userConfig, projectConfig) {
  if (!userConfig && !projectConfig) {
    return DEFAULT_CONFIG;
  }
  if (!userConfig) {
    return projectConfig ?? DEFAULT_CONFIG;
  }
  if (!projectConfig) {
    return userConfig;
  }
  const projectRuleNames = new Set(projectConfig.rules.map((r) => r.name.toLowerCase()));
  const mergedRules = [
    ...userConfig.rules.filter((r) => !projectRuleNames.has(r.name.toLowerCase())),
    ...projectConfig.rules
  ];
  return {
    version: 1,
    rules: mergedRules
  };
}
function validateConfig(config) {
  const errors = [];
  const ruleNames = new Set;
  if (!config || typeof config !== "object") {
    errors.push("Config must be an object");
    return { errors, ruleNames };
  }
  const cfg = config;
  if (cfg.version !== 1) {
    errors.push("version must be 1");
  }
  if (cfg.rules !== undefined) {
    if (!Array.isArray(cfg.rules)) {
      errors.push("rules must be an array");
    } else {
      for (let i = 0;i < cfg.rules.length; i++) {
        const rule = cfg.rules[i];
        const ruleErrors = validateRule(rule, i, ruleNames);
        errors.push(...ruleErrors);
      }
    }
  }
  return { errors, ruleNames };
}
function validateRule(rule, index, ruleNames) {
  const errors = [];
  const prefix = `rules[${index}]`;
  if (!rule || typeof rule !== "object") {
    errors.push(`${prefix}: must be an object`);
    return errors;
  }
  const r = rule;
  if (typeof r.name !== "string") {
    errors.push(`${prefix}.name: required string`);
  } else {
    if (!NAME_PATTERN.test(r.name)) {
      errors.push(`${prefix}.name: must match pattern (letters, numbers, hyphens, underscores; max 64 chars)`);
    }
    const lowerName = r.name.toLowerCase();
    if (ruleNames.has(lowerName)) {
      errors.push(`${prefix}.name: duplicate rule name "${r.name}"`);
    } else {
      ruleNames.add(lowerName);
    }
  }
  if (typeof r.command !== "string") {
    errors.push(`${prefix}.command: required string`);
  } else if (!COMMAND_PATTERN.test(r.command)) {
    errors.push(`${prefix}.command: must match pattern (letters, numbers, hyphens, underscores)`);
  }
  if (r.subcommand !== undefined) {
    if (typeof r.subcommand !== "string") {
      errors.push(`${prefix}.subcommand: must be a string if provided`);
    } else if (!COMMAND_PATTERN.test(r.subcommand)) {
      errors.push(`${prefix}.subcommand: must match pattern (letters, numbers, hyphens, underscores)`);
    }
  }
  if (!Array.isArray(r.block_args)) {
    errors.push(`${prefix}.block_args: required array`);
  } else {
    if (r.block_args.length === 0) {
      errors.push(`${prefix}.block_args: must have at least one element`);
    }
    for (let i = 0;i < r.block_args.length; i++) {
      const arg = r.block_args[i];
      if (typeof arg !== "string") {
        errors.push(`${prefix}.block_args[${i}]: must be a string`);
      } else if (arg === "") {
        errors.push(`${prefix}.block_args[${i}]: must not be empty`);
      }
    }
  }
  if (typeof r.reason !== "string") {
    errors.push(`${prefix}.reason: required string`);
  } else if (r.reason === "") {
    errors.push(`${prefix}.reason: must not be empty`);
  } else if (r.reason.length > MAX_REASON_LENGTH) {
    errors.push(`${prefix}.reason: must be at most ${MAX_REASON_LENGTH} characters`);
  }
  return errors;
}
function validateConfigFile(path) {
  const errors = [];
  const ruleNames = new Set;
  if (!existsSync2(path)) {
    errors.push(`File not found: ${path}`);
    return { errors, ruleNames };
  }
  try {
    const content = readFileSync2(path, "utf-8");
    if (!content.trim()) {
      errors.push("Config file is empty");
      return { errors, ruleNames };
    }
    const parsed = JSON.parse(content);
    return validateConfig(parsed);
  } catch (e) {
    errors.push(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    return { errors, ruleNames };
  }
}
function getUserConfigPath() {
  return join2(homedir2(), ".cc-safety-net", "config.json");
}
function getProjectConfigPath(cwd) {
  return resolve(cwd ?? process.cwd(), ".safety-net.json");
}

// src/bin/doctor/config.ts
function getConfigSourceInfo(path) {
  if (!existsSync3(path)) {
    return { path, exists: false, valid: false, ruleCount: 0 };
  }
  const validation = validateConfigFile(path);
  if (validation.errors.length > 0) {
    return {
      path,
      exists: true,
      valid: false,
      ruleCount: 0,
      errors: validation.errors
    };
  }
  return {
    path,
    exists: true,
    valid: true,
    ruleCount: validation.ruleNames.size
  };
}
function isValidRule(rule) {
  if (typeof rule !== "object" || rule === null)
    return false;
  const r = rule;
  return typeof r.name === "string" && typeof r.command === "string" && Array.isArray(r.block_args) && typeof r.reason === "string";
}
function loadSingleConfigRules(path) {
  if (!existsSync3(path))
    return [];
  try {
    const content = readFileSync3(path, "utf-8");
    if (!content.trim())
      return [];
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.rules))
      return [];
    return parsed.rules.filter(isValidRule);
  } catch {
    return [];
  }
}
function mergeRulesWithTracking(userRules, projectRules) {
  const projectRuleNames = new Set(projectRules.map((r) => r.name.toLowerCase()));
  const shadowedRules = [];
  const effectiveRules = [];
  for (const rule of userRules) {
    if (projectRuleNames.has(rule.name.toLowerCase())) {
      shadowedRules.push({ name: rule.name, shadowedBy: "project" });
    } else {
      effectiveRules.push({
        source: "user",
        name: rule.name,
        command: rule.command,
        subcommand: rule.subcommand,
        blockArgs: rule.block_args,
        reason: rule.reason
      });
    }
  }
  for (const rule of projectRules) {
    effectiveRules.push({
      source: "project",
      name: rule.name,
      command: rule.command,
      subcommand: rule.subcommand,
      blockArgs: rule.block_args,
      reason: rule.reason
    });
  }
  return { effectiveRules, shadowedRules };
}
function getConfigInfo(cwd, options) {
  const userPath = options?.userConfigPath ?? getUserConfigPath();
  const projectPath = options?.projectConfigPath ?? getProjectConfigPath(cwd);
  const userConfig = getConfigSourceInfo(userPath);
  const projectConfig = getConfigSourceInfo(projectPath);
  const userRules = userConfig.valid ? loadSingleConfigRules(userPath) : [];
  const projectRules = projectConfig.valid ? loadSingleConfigRules(projectPath) : [];
  const { effectiveRules, shadowedRules } = mergeRulesWithTracking(userRules, projectRules);
  return {
    userConfig,
    projectConfig,
    effectiveRules,
    shadowedRules
  };
}

// src/bin/doctor/environment.ts
var ENV_VARS = [
  {
    name: "SAFETY_NET_STRICT",
    description: "Fail-closed on unparseable commands",
    defaultBehavior: "permissive"
  },
  {
    name: "SAFETY_NET_PARANOID",
    description: "Enable all paranoid checks",
    defaultBehavior: "off"
  },
  {
    name: "SAFETY_NET_PARANOID_RM",
    description: "Block rm -rf even within cwd",
    defaultBehavior: "off"
  },
  {
    name: "SAFETY_NET_PARANOID_INTERPRETERS",
    description: "Block interpreter one-liners",
    defaultBehavior: "off"
  }
];
function getEnvironmentInfo() {
  return ENV_VARS.map((v) => ({
    ...v,
    value: process.env[v.name],
    isSet: v.name in process.env
  }));
}

// src/bin/utils/colors.ts
function shouldUseColor() {
  return Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
}
var green = (s) => shouldUseColor() ? `\x1B[32m${s}\x1B[0m` : s;
var yellow = (s) => shouldUseColor() ? `\x1B[33m${s}\x1B[0m` : s;
var blue = (s) => shouldUseColor() ? `\x1B[34m${s}\x1B[0m` : s;
var magenta = (s) => shouldUseColor() ? `\x1B[35m${s}\x1B[0m` : s;
var cyan = (s) => shouldUseColor() ? `\x1B[36m${s}\x1B[0m` : s;
var red = (s) => shouldUseColor() ? `\x1B[31m${s}\x1B[0m` : s;
var dim = (s) => shouldUseColor() ? `\x1B[2m${s}\x1B[0m` : s;
var bold = (s) => shouldUseColor() ? `\x1B[1m${s}\x1B[0m` : s;
var colors = {
  green,
  yellow,
  blue,
  magenta,
  cyan,
  red,
  dim,
  bold
};
var ANSI_RESET = "\x1B[0m";
var DISTINCT_COLORS = [
  39,
  82,
  198,
  226,
  208,
  51,
  196,
  46,
  201,
  214,
  93,
  154,
  220,
  27,
  49,
  190,
  200,
  33,
  129,
  227,
  45,
  160,
  63,
  118,
  123,
  202
];
function createRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
function getShuffledPalette(seed) {
  const palette = [...DISTINCT_COLORS];
  const random = createRandom(seed);
  for (let i = palette.length - 1;i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = palette[i];
    palette[i] = palette[j];
    palette[j] = temp;
  }
  return palette;
}
function generateDistinctColor(index, seed = 0) {
  if (!shouldUseColor())
    return "";
  const palette = getShuffledPalette(seed);
  const colorCode = palette[index % palette.length];
  return `\x1B[38;5;${colorCode}m`;
}
function colorizeToken(token, index, seed = 0) {
  if (!shouldUseColor())
    return `"${token}"`;
  const colorCode = generateDistinctColor(index, seed);
  return `${colorCode}"${token}"${ANSI_RESET}`;
}

// src/bin/doctor/format.ts
var PLATFORM_NAMES = {
  "claude-code": "Claude Code",
  opencode: "OpenCode",
  "gemini-cli": "Gemini CLI"
};
function formatHooksSection(hooks) {
  const lines = [];
  lines.push("Hook Integration");
  lines.push(formatHooksTable(hooks));
  const failures = [];
  const warnings = [];
  const errors = [];
  for (const hook of hooks) {
    const platformName = PLATFORM_NAMES[hook.platform] ?? hook.platform;
    if (hook.selfTest) {
      for (const result of hook.selfTest.results) {
        if (!result.passed) {
          failures.push({ platform: platformName, result });
        }
      }
    }
    if (hook.errors && hook.errors.length > 0) {
      for (const err of hook.errors) {
        if (hook.status === "configured") {
          warnings.push({ platform: platformName, message: err });
        } else {
          errors.push({ platform: platformName, message: err });
        }
      }
    }
  }
  if (failures.length > 0) {
    lines.push("");
    lines.push(colors.red("   Failures:"));
    for (const f of failures) {
      lines.push(colors.red(`   • ${f.platform}: ${f.result.description}`));
      lines.push(colors.red(`     expected ${f.result.expected}, got ${f.result.actual}`));
    }
  }
  for (const w of warnings) {
    lines.push(`   Warning (${w.platform}): ${w.message}`);
  }
  for (const e of errors) {
    lines.push(`   Error (${e.platform}): ${e.message}`);
  }
  return lines.join(`
`);
}
function formatHooksTable(hooks) {
  const headers = ["Platform", "Status", "Tests"];
  const getStatusDisplay = (h) => {
    switch (h.status) {
      case "configured":
        return { text: "Configured", colored: colors.green("Configured") };
      case "disabled":
        return { text: "Disabled", colored: colors.yellow("Disabled") };
      case "n/a":
        return { text: "N/A", colored: colors.dim("N/A") };
    }
  };
  const rowData = hooks.map((h) => {
    const platformName = PLATFORM_NAMES[h.platform] ?? h.platform;
    const statusDisplay = getStatusDisplay(h);
    let testsText = "-";
    if (h.status === "configured" && h.selfTest) {
      const label = h.selfTest.failed > 0 ? "FAIL" : "OK";
      testsText = `${h.selfTest.passed}/${h.selfTest.total} ${label}`;
    }
    return {
      colored: [platformName, statusDisplay.colored, testsText],
      raw: [platformName, statusDisplay.text, testsText]
    };
  });
  const rows = rowData.map((r) => r.colored);
  const rawRows = rowData.map((r) => r.raw);
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rawRows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });
  const pad = (s, w, raw) => s + " ".repeat(Math.max(0, w - raw.length));
  const line = (char, corners) => corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];
  const formatRow = (cells, rawCells) => `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0, rawCells[i] ?? "")).join(" │ ")} │`;
  const tableLines = [
    `   ${line("─", ["┌", "┬", "┐"])}`,
    `   ${formatRow(headers, headers)}`,
    `   ${line("─", ["├", "┼", "┤"])}`,
    ...rows.map((r, i) => `   ${formatRow(r, rawRows[i] ?? [])}`),
    `   ${line("─", ["└", "┴", "┘"])}`
  ];
  return tableLines.join(`
`);
}
function formatRulesTable(rules) {
  if (rules.length === 0) {
    return "   (no custom rules)";
  }
  const headers = ["Source", "Name", "Command", "Block Args"];
  const rows = rules.map((r) => [
    r.source,
    r.name,
    r.subcommand ? `${r.command} ${r.subcommand}` : r.command,
    r.blockArgs.join(", ")
  ]);
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });
  const pad = (s, w) => s.padEnd(w);
  const line = (char, corners) => corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];
  const formatRow = (cells) => `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0)).join(" │ ")} │`;
  const tableLines = [
    `   ${line("─", ["┌", "┬", "┐"])}`,
    `   ${formatRow(headers)}`,
    `   ${line("─", ["├", "┼", "┤"])}`,
    ...rows.map((r) => `   ${formatRow(r)}`),
    `   ${line("─", ["└", "┴", "┘"])}`
  ];
  return tableLines.join(`
`);
}
function formatConfigSection(report) {
  const lines = [];
  lines.push("Configuration");
  lines.push(formatConfigTable(report.userConfig, report.projectConfig));
  lines.push("");
  if (report.effectiveRules.length > 0) {
    lines.push(`   Effective rules (${report.effectiveRules.length} total):`);
    lines.push(formatRulesTable(report.effectiveRules));
  } else {
    lines.push("   Effective rules: (none - using built-in rules only)");
  }
  for (const shadow of report.shadowedRules) {
    lines.push("");
    lines.push(`   Note: Project rule "${shadow.name}" shadows user rule with same name`);
  }
  return lines.join(`
`);
}
function formatConfigTable(userConfig, projectConfig) {
  const headers = ["Scope", "Status"];
  const getStatusDisplay = (config) => {
    if (!config.exists) {
      return { text: "N/A", colored: colors.dim("N/A") };
    }
    if (!config.valid) {
      const errMsg = config.errors?.[0] ?? "unknown error";
      const text = `Invalid (${errMsg})`;
      return { text, colored: colors.red(text) };
    }
    return { text: "Configured", colored: colors.green("Configured") };
  };
  const userStatus = getStatusDisplay(userConfig);
  const projectStatus = getStatusDisplay(projectConfig);
  const rows = [
    ["User", userStatus.colored],
    ["Project", projectStatus.colored]
  ];
  const rawRows = [
    ["User", userStatus.text],
    ["Project", projectStatus.text]
  ];
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rawRows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });
  const pad = (s, w, raw) => s + " ".repeat(Math.max(0, w - raw.length));
  const line = (char, corners) => corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];
  const formatRow = (cells, rawCells) => `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0, rawCells[i] ?? "")).join(" │ ")} │`;
  const tableLines = [
    `   ${line("─", ["┌", "┬", "┐"])}`,
    `   ${formatRow(headers, headers)}`,
    `   ${line("─", ["├", "┼", "┤"])}`,
    ...rows.map((r, i) => `   ${formatRow(r, rawRows[i] ?? [])}`),
    `   ${line("─", ["└", "┴", "┘"])}`
  ];
  return tableLines.join(`
`);
}
function formatEnvironmentSection(envVars) {
  const lines = [];
  lines.push("Environment");
  lines.push(formatEnvironmentTable(envVars));
  return lines.join(`
`);
}
function formatEnvironmentTable(envVars) {
  const headers = ["Variable", "Status"];
  const rows = envVars.map((v) => {
    const statusIcon = v.isSet ? colors.green("✓") : colors.dim("✗");
    return [v.name, statusIcon];
  });
  const rawRows = envVars.map((v) => [v.name, v.isSet ? "✓" : "✗"]);
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rawRows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });
  const pad = (s, w, raw) => s + " ".repeat(Math.max(0, w - raw.length));
  const line = (char, corners) => corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];
  const formatRow = (cells, rawCells) => `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0, rawCells[i] ?? "")).join(" │ ")} │`;
  const tableLines = [
    `   ${line("─", ["┌", "┬", "┐"])}`,
    `   ${formatRow(headers, headers)}`,
    `   ${line("─", ["├", "┼", "┤"])}`,
    ...rows.map((r, i) => `   ${formatRow(r, rawRows[i] ?? [])}`),
    `   ${line("─", ["└", "┴", "┘"])}`
  ];
  return tableLines.join(`
`);
}
function formatActivitySection(activity) {
  const lines = [];
  if (activity.totalBlocked === 0) {
    lines.push("Recent Activity");
    lines.push("   No blocked commands in the last 7 days");
    lines.push("   Tip: This is normal for new installations");
  } else {
    lines.push(`Recent Activity (${activity.totalBlocked} blocked / ${activity.sessionCount} sessions)`);
    lines.push(formatActivityTable(activity.recentEntries));
  }
  return lines.join(`
`);
}
function formatActivityTable(entries) {
  const headers = ["Time", "Command"];
  const rows = entries.map((e) => {
    const cmd = e.command.length > 40 ? `${e.command.slice(0, 37)}...` : e.command;
    return [e.relativeTime, cmd];
  });
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });
  const pad = (s, w) => s.padEnd(w);
  const line = (char, corners) => corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];
  const formatRow = (cells) => `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0)).join(" │ ")} │`;
  const tableLines = [
    `   ${line("─", ["┌", "┬", "┐"])}`,
    `   ${formatRow(headers)}`,
    `   ${line("─", ["├", "┼", "┤"])}`,
    ...rows.map((r) => `   ${formatRow(r)}`),
    `   ${line("─", ["└", "┴", "┘"])}`
  ];
  return tableLines.join(`
`);
}
function formatUpdateSection(update) {
  const lines = [];
  lines.push("Update Check");
  const rowData = [];
  if (update.latestVersion === null && !update.error) {
    rowData.push({
      label: "Status",
      value: colors.dim("Skipped"),
      rawValue: "Skipped"
    });
    rowData.push({
      label: "Installed",
      value: update.currentVersion,
      rawValue: update.currentVersion
    });
    lines.push(formatUpdateTable(rowData));
    return lines.join(`
`);
  }
  if (update.error) {
    rowData.push({
      label: "Status",
      value: `${colors.yellow("⚠")} Error`,
      rawValue: "⚠ Error"
    });
    rowData.push({
      label: "Installed",
      value: update.currentVersion,
      rawValue: update.currentVersion
    });
    rowData.push({
      label: "Error",
      value: colors.dim(update.error),
      rawValue: update.error
    });
    lines.push(formatUpdateTable(rowData));
    return lines.join(`
`);
  }
  if (update.updateAvailable) {
    rowData.push({
      label: "Status",
      value: `${colors.yellow("⚠")} Update Available`,
      rawValue: "⚠ Update Available"
    });
    rowData.push({
      label: "Current",
      value: update.currentVersion,
      rawValue: update.currentVersion
    });
    rowData.push({
      label: "Latest",
      value: colors.green(update.latestVersion ?? ""),
      rawValue: update.latestVersion ?? ""
    });
    lines.push(formatUpdateTable(rowData));
    lines.push("");
    lines.push("   Run: bunx cc-safety-net@latest doctor");
    lines.push("   Or:  npx cc-safety-net@latest doctor");
    return lines.join(`
`);
  }
  rowData.push({
    label: "Status",
    value: `${colors.green("✓")} Up to date`,
    rawValue: "✓ Up to date"
  });
  rowData.push({
    label: "Version",
    value: update.currentVersion,
    rawValue: update.currentVersion
  });
  lines.push(formatUpdateTable(rowData));
  return lines.join(`
`);
}
function formatUpdateTable(rowData) {
  const rows = rowData.map((r) => [r.label, r.value]);
  const rawRows = rowData.map((r) => [r.label, r.rawValue]);
  const colWidths = [0, 1].map((i) => {
    return Math.max(...rawRows.map((r) => r[i]?.length ?? 0));
  });
  const pad = (s, w, raw) => s + " ".repeat(Math.max(0, w - raw.length));
  const line = (char, corners) => corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];
  const formatRow = (cells, rawCells) => `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0, rawCells[i] ?? "")).join(" │ ")} │`;
  const tableLines = [
    `   ${line("─", ["┌", "┬", "┐"])}`,
    ...rows.map((r, i) => `   ${formatRow(r, rawRows[i] ?? [])}`),
    `   ${line("─", ["└", "┴", "┘"])}`
  ];
  return tableLines.join(`
`);
}
function formatSystemInfoSection(system) {
  const lines = [];
  lines.push("System Info");
  lines.push(formatSystemInfoTable(system));
  return lines.join(`
`);
}
function formatSystemInfoTable(system) {
  const headers = ["Component", "Version"];
  const formatValue = (value) => {
    if (value === null)
      return colors.dim("not found");
    return value;
  };
  const rawValue = (value) => {
    return value ?? "not found";
  };
  const rowData = [
    { label: "cc-safety-net", value: system.version },
    { label: "Claude Code", value: system.claudeCodeVersion },
    { label: "OpenCode", value: system.openCodeVersion },
    { label: "Gemini CLI", value: system.geminiCliVersion },
    { label: "Node.js", value: system.nodeVersion },
    { label: "npm", value: system.npmVersion },
    { label: "Bun", value: system.bunVersion },
    { label: "Platform", value: system.platform }
  ];
  const rows = rowData.map((r) => [r.label, formatValue(r.value)]);
  const rawRows = rowData.map((r) => [r.label, rawValue(r.value)]);
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rawRows.map((r) => r[i]?.length ?? 0));
    return Math.max(h.length, maxDataWidth);
  });
  const pad = (s, w, raw) => s + " ".repeat(Math.max(0, w - raw.length));
  const line = (char, corners) => corners[0] + colWidths.map((w) => char.repeat(w + 2)).join(corners[1]) + corners[2];
  const formatRow = (cells, rawCells) => `│ ${cells.map((c, i) => pad(c, colWidths[i] ?? 0, rawCells[i] ?? "")).join(" │ ")} │`;
  const tableLines = [
    `   ${line("─", ["┌", "┬", "┐"])}`,
    `   ${formatRow(headers, headers)}`,
    `   ${line("─", ["├", "┼", "┤"])}`,
    ...rows.map((r, i) => `   ${formatRow(r, rawRows[i] ?? [])}`),
    `   ${line("─", ["└", "┴", "┘"])}`
  ];
  return tableLines.join(`
`);
}
function formatSummary(report) {
  const hooksFailed = report.hooks.every((h) => h.status !== "configured");
  const selfTestFailed = report.hooks.some((h) => h.selfTest && h.selfTest.failed > 0);
  const configFailed = (report.userConfig.errors?.length ?? 0) > 0 || (report.projectConfig.errors?.length ?? 0) > 0;
  const failures = [hooksFailed, selfTestFailed, configFailed].filter(Boolean).length;
  let warnings = 0;
  if (report.update.updateAvailable)
    warnings++;
  if (report.activity.totalBlocked === 0)
    warnings++;
  warnings += report.shadowedRules.length;
  if (failures > 0) {
    return colors.red(`
${failures} check(s) failed.`);
  }
  if (warnings > 0) {
    return colors.yellow(`
All checks passed with ${warnings} warning(s).`);
  }
  return colors.green(`
All checks passed.`);
}

// src/bin/doctor/hooks.ts
import { existsSync as existsSync4, readFileSync as readFileSync4 } from "node:fs";
import { homedir as homedir4, tmpdir as tmpdir3 } from "node:os";
import { join as join3 } from "node:path";

// src/core/analyze/dangerous-text.ts
function dangerousInText(text) {
  const t = text.toLowerCase();
  const stripped = t.trimStart();
  const isEchoOrRg = stripped.startsWith("echo ") || stripped.startsWith("rg ");
  const patterns = [
    {
      regex: /\brm\s+(-[^\s]*r[^\s]*\s+-[^\s]*f|-[^\s]*f[^\s]*\s+-[^\s]*r|-[^\s]*rf|-[^\s]*fr)\b/,
      reason: "rm -rf"
    },
    {
      regex: /\bgit\s+reset\s+--hard\b/,
      reason: "git reset --hard"
    },
    {
      regex: /\bgit\s+reset\s+--merge\b/,
      reason: "git reset --merge"
    },
    {
      regex: /\bgit\s+clean\s+(-[^\s]*f|-f)\b/,
      reason: "git clean -f"
    },
    {
      regex: /\bgit\s+push\s+[^|;]*(-f\b|--force\b)(?!-with-lease)/,
      reason: "git push --force (use --force-with-lease instead)"
    },
    {
      regex: /\bgit\s+branch\s+-D\b/,
      reason: "git branch -D",
      caseSensitive: true
    },
    {
      regex: /\bgit\s+stash\s+(drop|clear)\b/,
      reason: "git stash drop/clear"
    },
    {
      regex: /\bgit\s+checkout\s+--\s/,
      reason: "git checkout --"
    },
    {
      regex: /\bgit\s+restore\b(?!.*--(staged|help))/,
      reason: "git restore (without --staged)"
    },
    {
      regex: /\bfind\b[^\n;|&]*\s-delete\b/,
      reason: "find -delete",
      skipForEchoRg: true
    }
  ];
  for (const { regex, reason, skipForEchoRg, caseSensitive } of patterns) {
    if (skipForEchoRg && isEchoOrRg)
      continue;
    const target = caseSensitive ? text : t;
    if (regex.test(target)) {
      return reason;
    }
  }
  return null;
}

// src/core/analyze/constants.ts
var DISPLAY_COMMANDS = new Set([
  "echo",
  "printf",
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "grep",
  "rg",
  "ag",
  "ack",
  "sed",
  "awk",
  "cut",
  "tr",
  "sort",
  "uniq",
  "wc",
  "tee",
  "man",
  "help",
  "info",
  "type",
  "which",
  "whereis",
  "whatis",
  "apropos",
  "file",
  "stat",
  "ls",
  "ll",
  "dir",
  "tree",
  "pwd",
  "date",
  "cal",
  "uptime",
  "whoami",
  "id",
  "groups",
  "hostname",
  "uname",
  "env",
  "printenv",
  "set",
  "export",
  "alias",
  "history",
  "jobs",
  "fg",
  "bg",
  "test",
  "true",
  "false",
  "read",
  "return",
  "exit",
  "break",
  "continue",
  "shift",
  "wait",
  "trap",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "md5sum",
  "sha256sum",
  "base64",
  "xxd",
  "od",
  "hexdump",
  "strings",
  "diff",
  "cmp",
  "comm",
  "join",
  "paste",
  "column",
  "fmt",
  "fold",
  "nl",
  "pr",
  "expand",
  "unexpand",
  "rev",
  "tac",
  "shuf",
  "seq",
  "yes",
  "timeout",
  "time",
  "sleep",
  "watch",
  "logger",
  "write",
  "wall",
  "mesg",
  "notify-send"
]);

// src/core/analyze/rm-flags.ts
function hasRecursiveForceFlags(tokens) {
  let hasRecursive = false;
  let hasForce = false;
  for (const token of tokens) {
    if (token === "--")
      break;
    if (token === "-r" || token === "-R" || token === "--recursive") {
      hasRecursive = true;
    } else if (token === "-f" || token === "--force") {
      hasForce = true;
    } else if (token.startsWith("-") && !token.startsWith("--")) {
      if (token.includes("r") || token.includes("R"))
        hasRecursive = true;
      if (token.includes("f"))
        hasForce = true;
    }
  }
  return hasRecursive && hasForce;
}

// node_modules/shell-quote/index.js
var $quote = require_quote();
var $parse = require_parse();

// src/core/shell.ts
var ENV_PROXY = new Proxy({}, {
  get: (_, name) => `$${String(name)}`
});
function splitShellCommands(command) {
  if (hasUnclosedQuotes(command)) {
    return [[command]];
  }
  const normalizedCommand = command.replace(/\n/g, " ; ");
  const tokens = $parse(normalizedCommand, ENV_PROXY);
  const segments = [];
  let current = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined) {
      i++;
      continue;
    }
    if (isOperator(token)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      i++;
      continue;
    }
    if (typeof token !== "string") {
      i++;
      continue;
    }
    const nextToken = tokens[i + 1];
    if (token === "$" && nextToken && isParenOpen(nextToken)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      const { innerSegments, endIndex } = extractCommandSubstitution(tokens, i + 2);
      for (const seg of innerSegments) {
        segments.push(seg);
      }
      i = endIndex + 1;
      continue;
    }
    const backtickSegments = extractBacktickSubstitutions(token);
    if (backtickSegments.length > 0) {
      for (const seg of backtickSegments) {
        segments.push(seg);
      }
    }
    current.push(token);
    i++;
  }
  if (current.length > 0) {
    segments.push(current);
  }
  return segments;
}
function extractBacktickSubstitutions(token) {
  const segments = [];
  let i = 0;
  while (i < token.length) {
    const backtickStart = token.indexOf("`", i);
    if (backtickStart === -1)
      break;
    const backtickEnd = token.indexOf("`", backtickStart + 1);
    if (backtickEnd === -1)
      break;
    const innerCommand = token.slice(backtickStart + 1, backtickEnd);
    if (innerCommand.trim()) {
      const innerSegments = splitShellCommands(innerCommand);
      for (const seg of innerSegments) {
        segments.push(seg);
      }
    }
    i = backtickEnd + 1;
  }
  return segments;
}
function isParenOpen(token) {
  return typeof token === "object" && token !== null && "op" in token && token.op === "(";
}
function isParenClose(token) {
  return typeof token === "object" && token !== null && "op" in token && token.op === ")";
}
function extractCommandSubstitution(tokens, startIndex) {
  const innerSegments = [];
  let currentSegment = [];
  let depth = 1;
  let i = startIndex;
  while (i < tokens.length && depth > 0) {
    const token = tokens[i];
    if (isParenOpen(token)) {
      depth++;
      i++;
      continue;
    }
    if (isParenClose(token)) {
      depth--;
      if (depth === 0)
        break;
      i++;
      continue;
    }
    if (depth === 1 && token && isOperator(token)) {
      if (currentSegment.length > 0) {
        innerSegments.push(currentSegment);
        currentSegment = [];
      }
      i++;
      continue;
    }
    if (typeof token === "string") {
      currentSegment.push(token);
    }
    i++;
  }
  if (currentSegment.length > 0) {
    innerSegments.push(currentSegment);
  }
  return { innerSegments, endIndex: i };
}
function hasUnclosedQuotes(command) {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (const char of command) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    }
  }
  return inSingle || inDouble;
}
var ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
function parseEnvAssignment(token) {
  if (!ENV_ASSIGNMENT_RE.test(token)) {
    return null;
  }
  const eqIdx = token.indexOf("=");
  if (eqIdx < 0) {
    return null;
  }
  return { name: token.slice(0, eqIdx), value: token.slice(eqIdx + 1) };
}
function stripEnvAssignmentsWithInfo(tokens) {
  const envAssignments = new Map;
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      break;
    }
    const assignment = parseEnvAssignment(token);
    if (!assignment) {
      break;
    }
    envAssignments.set(assignment.name, assignment.value);
    i++;
  }
  return { tokens: tokens.slice(i), envAssignments };
}
function stripWrappers(tokens) {
  return stripWrappersWithInfo(tokens).tokens;
}
function stripWrappersWithInfo(tokens) {
  let result = [...tokens];
  const allEnvAssignments = new Map;
  for (let iteration = 0;iteration < MAX_STRIP_ITERATIONS; iteration++) {
    const before = result.join(" ");
    const { tokens: strippedTokens, envAssignments } = stripEnvAssignmentsWithInfo(result);
    for (const [k, v] of envAssignments) {
      allEnvAssignments.set(k, v);
    }
    result = strippedTokens;
    if (result.length === 0)
      break;
    while (result.length > 0 && result[0]?.includes("=") && !ENV_ASSIGNMENT_RE.test(result[0] ?? "")) {
      result = result.slice(1);
    }
    if (result.length === 0)
      break;
    const head = result[0]?.toLowerCase();
    if (head !== "sudo" && head !== "env" && head !== "command") {
      break;
    }
    if (head === "sudo") {
      result = stripSudo(result);
    }
    if (head === "env") {
      const envResult = stripEnvWithInfo(result);
      result = envResult.tokens;
      for (const [k, v] of envResult.envAssignments) {
        allEnvAssignments.set(k, v);
      }
    }
    if (head === "command") {
      result = stripCommand(result);
    }
    if (result.join(" ") === before)
      break;
  }
  const { tokens: finalTokens, envAssignments: finalAssignments } = stripEnvAssignmentsWithInfo(result);
  for (const [k, v] of finalAssignments) {
    allEnvAssignments.set(k, v);
  }
  return { tokens: finalTokens, envAssignments: allEnvAssignments };
}
var SUDO_OPTS_WITH_VALUE = new Set(["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-T", "-U"]);
function stripSudo(tokens) {
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token)
      break;
    if (token === "--") {
      return tokens.slice(i + 1);
    }
    if (!token.startsWith("-")) {
      break;
    }
    if (SUDO_OPTS_WITH_VALUE.has(token)) {
      i += 2;
      continue;
    }
    i++;
  }
  return tokens.slice(i);
}
var ENV_OPTS_NO_VALUE = new Set(["-i", "-0", "--null"]);
var ENV_OPTS_WITH_VALUE = new Set([
  "-u",
  "--unset",
  "-C",
  "--chdir",
  "-S",
  "--split-string",
  "-P"
]);
function stripEnvWithInfo(tokens) {
  const envAssignments = new Map;
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token)
      break;
    if (token === "--") {
      return { tokens: tokens.slice(i + 1), envAssignments };
    }
    if (ENV_OPTS_NO_VALUE.has(token)) {
      i++;
      continue;
    }
    if (ENV_OPTS_WITH_VALUE.has(token)) {
      i += 2;
      continue;
    }
    if (token.startsWith("-u=") || token.startsWith("--unset=")) {
      i++;
      continue;
    }
    if (token.startsWith("-C=") || token.startsWith("--chdir=")) {
      i++;
      continue;
    }
    if (token.startsWith("-P")) {
      i++;
      continue;
    }
    if (token.startsWith("-")) {
      i++;
      continue;
    }
    const assignment = parseEnvAssignment(token);
    if (!assignment) {
      break;
    }
    envAssignments.set(assignment.name, assignment.value);
    i++;
  }
  return { tokens: tokens.slice(i), envAssignments };
}
function stripCommand(tokens) {
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token)
      break;
    if (token === "-p" || token === "-v" || token === "-V") {
      i++;
      continue;
    }
    if (token === "--") {
      return tokens.slice(i + 1);
    }
    if (token.startsWith("-") && !token.startsWith("--") && token.length > 1) {
      const chars = token.slice(1);
      if (!/^[pvV]+$/.test(chars)) {
        break;
      }
      i++;
      continue;
    }
    break;
  }
  return tokens.slice(i);
}
function extractShortOpts(tokens) {
  const opts = new Set;
  let pastDoubleDash = false;
  for (const token of tokens) {
    if (token === "--") {
      pastDoubleDash = true;
      continue;
    }
    if (pastDoubleDash)
      continue;
    if (token.startsWith("-") && !token.startsWith("--") && token.length > 1) {
      for (let i = 1;i < token.length; i++) {
        const char = token[i];
        if (!char || !/[a-zA-Z]/.test(char)) {
          break;
        }
        opts.add(`-${char}`);
      }
    }
  }
  return opts;
}
function normalizeCommandToken(token) {
  return getBasename(token).toLowerCase();
}
function getBasename(token) {
  return token.includes("/") ? token.split("/").pop() ?? token : token;
}
function isOperator(token) {
  return typeof token === "object" && token !== null && "op" in token && SHELL_OPERATORS.has(token.op);
}

// src/core/analyze/find.ts
var REASON_FIND_DELETE = "find -delete permanently removes files. Use -print first to preview.";
function analyzeFind(tokens) {
  if (findHasDelete(tokens.slice(1))) {
    return REASON_FIND_DELETE;
  }
  for (let i = 0;i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "-exec" || token === "-execdir") {
      const execTokens = tokens.slice(i + 1);
      const semicolonIdx = execTokens.indexOf(";");
      const plusIdx = execTokens.indexOf("+");
      const endIdx = semicolonIdx !== -1 && plusIdx !== -1 ? Math.min(semicolonIdx, plusIdx) : semicolonIdx !== -1 ? semicolonIdx : plusIdx !== -1 ? plusIdx : execTokens.length;
      let execCommand = execTokens.slice(0, endIdx);
      execCommand = stripWrappers(execCommand);
      if (execCommand.length > 0) {
        let head = getBasename(execCommand[0] ?? "");
        if (head === "busybox" && execCommand.length > 1) {
          execCommand = execCommand.slice(1);
          head = getBasename(execCommand[0] ?? "");
        }
        if (head === "rm" && hasRecursiveForceFlags(execCommand)) {
          return "find -exec rm -rf is dangerous. Use explicit file list instead.";
        }
      }
    }
  }
  return null;
}
function findHasDelete(tokens) {
  let i = 0;
  let insideExec = false;
  let execDepth = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      i++;
      continue;
    }
    if (token === "-exec" || token === "-execdir") {
      insideExec = true;
      execDepth++;
      i++;
      continue;
    }
    if (insideExec && (token === ";" || token === "+")) {
      execDepth--;
      if (execDepth === 0) {
        insideExec = false;
      }
      i++;
      continue;
    }
    if (insideExec) {
      i++;
      continue;
    }
    if (token === "-name" || token === "-iname" || token === "-path" || token === "-ipath" || token === "-regex" || token === "-iregex" || token === "-type" || token === "-user" || token === "-group" || token === "-perm" || token === "-size" || token === "-mtime" || token === "-ctime" || token === "-atime" || token === "-newer" || token === "-printf" || token === "-fprint" || token === "-fprintf") {
      i += 2;
      continue;
    }
    if (token === "-delete") {
      return true;
    }
    i++;
  }
  return false;
}

// src/core/analyze/interpreters.ts
function extractInterpreterCodeArg(tokens) {
  for (let i = 1;i < tokens.length; i++) {
    const token = tokens[i];
    if (!token)
      continue;
    if ((token === "-c" || token === "-e") && tokens[i + 1]) {
      return tokens[i + 1] ?? null;
    }
  }
  return null;
}
function containsDangerousCode(code) {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      return true;
    }
  }
  return false;
}

// src/core/analyze/shell-wrappers.ts
function extractDashCArg(tokens) {
  for (let i = 1;i < tokens.length; i++) {
    const token = tokens[i];
    if (!token)
      continue;
    if (token === "-c" && tokens[i + 1]) {
      return tokens[i + 1] ?? null;
    }
    if (token.startsWith("-") && token.includes("c") && !token.startsWith("--")) {
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith("-")) {
        return nextToken;
      }
    }
  }
  return null;
}

// src/core/rules-git.ts
var REASON_CHECKOUT_DOUBLE_DASH = "git checkout -- discards uncommitted changes permanently. Use 'git stash' first.";
var REASON_CHECKOUT_REF_PATH = "git checkout <ref> -- <path> overwrites working tree with ref version. Use 'git stash' first.";
var REASON_CHECKOUT_PATHSPEC_FROM_FILE = "git checkout --pathspec-from-file can overwrite multiple files. Use 'git stash' first.";
var REASON_CHECKOUT_AMBIGUOUS = "git checkout with multiple positional args may overwrite files. Use 'git switch' for branches or 'git restore' for files.";
var REASON_RESTORE = "git restore discards uncommitted changes. Use 'git stash' first, or use --staged to only unstage.";
var REASON_RESTORE_WORKTREE = "git restore --worktree explicitly discards working tree changes. Use 'git stash' first.";
var REASON_RESET_HARD = "git reset --hard destroys all uncommitted changes permanently. Use 'git stash' first.";
var REASON_RESET_MERGE = "git reset --merge can lose uncommitted changes. Use 'git stash' first.";
var REASON_CLEAN = "git clean -f removes untracked files permanently. Use 'git clean -n' to preview first.";
var REASON_PUSH_FORCE = "git push --force destroys remote history. Use --force-with-lease for safer force push.";
var REASON_BRANCH_DELETE = "git branch -D force-deletes without merge check. Use -d for safe delete.";
var REASON_STASH_DROP = "git stash drop permanently deletes stashed changes. Consider 'git stash list' first.";
var REASON_STASH_CLEAR = "git stash clear deletes ALL stashed changes permanently.";
var REASON_WORKTREE_REMOVE_FORCE = "git worktree remove --force can delete uncommitted changes. Remove --force flag.";
var GIT_GLOBAL_OPTS_WITH_VALUE = new Set([
  "-c",
  "-C",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--super-prefix",
  "--config-env"
]);
var CHECKOUT_OPTS_WITH_VALUE = new Set([
  "-b",
  "-B",
  "--orphan",
  "--conflict",
  "--pathspec-from-file",
  "--unified"
]);
var CHECKOUT_OPTS_WITH_OPTIONAL_VALUE = new Set(["--recurse-submodules", "--track", "-t"]);
var CHECKOUT_KNOWN_OPTS_NO_VALUE = new Set([
  "-q",
  "--quiet",
  "-f",
  "--force",
  "-d",
  "--detach",
  "-m",
  "--merge",
  "-p",
  "--patch",
  "--ours",
  "--theirs",
  "--no-track",
  "--overwrite-ignore",
  "--no-overwrite-ignore",
  "--ignore-other-worktrees",
  "--progress",
  "--no-progress"
]);
function splitAtDoubleDash(tokens) {
  const index = tokens.indexOf("--");
  if (index === -1) {
    return { index: -1, before: tokens, after: [] };
  }
  return {
    index,
    before: tokens.slice(0, index),
    after: tokens.slice(index + 1)
  };
}
function analyzeGit(tokens) {
  const { subcommand, rest } = extractGitSubcommandAndRest(tokens);
  if (!subcommand) {
    return null;
  }
  switch (subcommand.toLowerCase()) {
    case "checkout":
      return analyzeGitCheckout(rest);
    case "restore":
      return analyzeGitRestore(rest);
    case "reset":
      return analyzeGitReset(rest);
    case "clean":
      return analyzeGitClean(rest);
    case "push":
      return analyzeGitPush(rest);
    case "branch":
      return analyzeGitBranch(rest);
    case "stash":
      return analyzeGitStash(rest);
    case "worktree":
      return analyzeGitWorktree(rest);
    default:
      return null;
  }
}
function extractGitSubcommandAndRest(tokens) {
  if (tokens.length === 0) {
    return { subcommand: null, rest: [] };
  }
  const firstToken = tokens[0];
  const command = firstToken ? getBasename(firstToken).toLowerCase() : null;
  if (command !== "git") {
    return { subcommand: null, rest: [] };
  }
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token)
      break;
    if (token === "--") {
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith("-")) {
        return { subcommand: nextToken, rest: tokens.slice(i + 2) };
      }
      return { subcommand: null, rest: tokens.slice(i + 1) };
    }
    if (token.startsWith("-")) {
      if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
        i += 2;
      } else if (token.startsWith("-c") && token.length > 2) {
        i++;
      } else if (token.startsWith("-C") && token.length > 2) {
        i++;
      } else {
        i++;
      }
    } else {
      return { subcommand: token, rest: tokens.slice(i + 1) };
    }
  }
  return { subcommand: null, rest: [] };
}
function analyzeGitCheckout(tokens) {
  const { index: doubleDashIdx, before: beforeDash } = splitAtDoubleDash(tokens);
  for (const token of tokens) {
    if (token === "-b" || token === "-B" || token === "--orphan") {
      return null;
    }
    if (token === "--pathspec-from-file") {
      return REASON_CHECKOUT_PATHSPEC_FROM_FILE;
    }
    if (token.startsWith("--pathspec-from-file=")) {
      return REASON_CHECKOUT_PATHSPEC_FROM_FILE;
    }
  }
  if (doubleDashIdx !== -1) {
    const hasRefBeforeDash = beforeDash.some((t) => !t.startsWith("-"));
    if (hasRefBeforeDash) {
      return REASON_CHECKOUT_REF_PATH;
    }
    return REASON_CHECKOUT_DOUBLE_DASH;
  }
  const positionalArgs = getCheckoutPositionalArgs(tokens);
  if (positionalArgs.length >= 2) {
    return REASON_CHECKOUT_AMBIGUOUS;
  }
  return null;
}
function getCheckoutPositionalArgs(tokens) {
  const positional = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token)
      break;
    if (token === "--") {
      break;
    }
    if (token.startsWith("-")) {
      if (CHECKOUT_OPTS_WITH_VALUE.has(token)) {
        i += 2;
      } else if (token.startsWith("--") && token.includes("=")) {
        i++;
      } else if (CHECKOUT_OPTS_WITH_OPTIONAL_VALUE.has(token)) {
        const nextToken = tokens[i + 1];
        if (nextToken && !nextToken.startsWith("-") && (token === "--recurse-submodules" || token === "--track" || token === "-t")) {
          const validModes = token === "--recurse-submodules" ? ["checkout", "on-demand"] : ["direct", "inherit"];
          if (validModes.includes(nextToken)) {
            i += 2;
          } else {
            i++;
          }
        } else {
          i++;
        }
      } else if (token.startsWith("--") && !CHECKOUT_KNOWN_OPTS_NO_VALUE.has(token) && !CHECKOUT_OPTS_WITH_VALUE.has(token) && !CHECKOUT_OPTS_WITH_OPTIONAL_VALUE.has(token)) {
        const nextToken = tokens[i + 1];
        if (nextToken && !nextToken.startsWith("-")) {
          i += 2;
        } else {
          i++;
        }
      } else {
        i++;
      }
    } else {
      positional.push(token);
      i++;
    }
  }
  return positional;
}
function analyzeGitRestore(tokens) {
  let hasStaged = false;
  for (const token of tokens) {
    if (token === "--help" || token === "--version") {
      return null;
    }
    if (token === "--worktree" || token === "-W") {
      return REASON_RESTORE_WORKTREE;
    }
    if (token === "--staged" || token === "-S") {
      hasStaged = true;
    }
  }
  return hasStaged ? null : REASON_RESTORE;
}
function analyzeGitReset(tokens) {
  for (const token of tokens) {
    if (token === "--hard") {
      return REASON_RESET_HARD;
    }
    if (token === "--merge") {
      return REASON_RESET_MERGE;
    }
  }
  return null;
}
function analyzeGitClean(tokens) {
  for (const token of tokens) {
    if (token === "-n" || token === "--dry-run") {
      return null;
    }
  }
  const shortOpts = extractShortOpts(tokens.filter((t) => t !== "--"));
  if (tokens.includes("--force") || shortOpts.has("-f")) {
    return REASON_CLEAN;
  }
  return null;
}
function analyzeGitPush(tokens) {
  let hasForceWithLease = false;
  const shortOpts = extractShortOpts(tokens.filter((t) => t !== "--"));
  const hasForce = tokens.includes("--force") || shortOpts.has("-f");
  for (const token of tokens) {
    if (token === "--force-with-lease" || token.startsWith("--force-with-lease=")) {
      hasForceWithLease = true;
    }
  }
  if (hasForce && !hasForceWithLease) {
    return REASON_PUSH_FORCE;
  }
  return null;
}
function analyzeGitBranch(tokens) {
  const shortOpts = extractShortOpts(tokens.filter((t) => t !== "--"));
  if (shortOpts.has("-D")) {
    return REASON_BRANCH_DELETE;
  }
  return null;
}
function analyzeGitStash(tokens) {
  for (const token of tokens) {
    if (token === "drop") {
      return REASON_STASH_DROP;
    }
    if (token === "clear") {
      return REASON_STASH_CLEAR;
    }
  }
  return null;
}
function analyzeGitWorktree(tokens) {
  const hasRemove = tokens.includes("remove");
  if (!hasRemove)
    return null;
  const { before } = splitAtDoubleDash(tokens);
  for (const token of before) {
    if (token === "--force" || token === "-f") {
      return REASON_WORKTREE_REMOVE_FORCE;
    }
  }
  return null;
}

// src/core/rules-rm.ts
import { realpathSync } from "node:fs";
import { homedir as homedir3, tmpdir } from "node:os";
import { normalize, resolve as resolve2, sep } from "node:path";
var IS_WINDOWS = process.platform === "win32";
function normalizePathForComparison(p) {
  let normalized = normalize(p);
  if (IS_WINDOWS) {
    normalized = normalized.replace(/\//g, "\\");
    normalized = normalized.toLowerCase();
    if (normalized.length > 3 && normalized.endsWith("\\")) {
      normalized = normalized.slice(0, -1);
    }
  } else {
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
  }
  return normalized;
}
var REASON_RM_RF = "rm -rf outside cwd is blocked. Use explicit paths within the current directory, or delete manually.";
var REASON_RM_RF_ROOT_HOME = "rm -rf targeting root or home directory is extremely dangerous and always blocked.";
function analyzeRm(tokens, options = {}) {
  const {
    cwd,
    originalCwd,
    paranoid = false,
    allowTmpdirVar = true,
    tmpdirOverridden = false
  } = options;
  const anchoredCwd = originalCwd ?? cwd ?? null;
  const resolvedCwd = cwd ?? null;
  const trustTmpdirVar = allowTmpdirVar && !tmpdirOverridden;
  const ctx = {
    anchoredCwd,
    resolvedCwd,
    paranoid,
    trustTmpdirVar,
    homeDir: getHomeDirForRmPolicy()
  };
  if (!hasRecursiveForceFlags(tokens)) {
    return null;
  }
  const targets = extractTargets(tokens);
  for (const target of targets) {
    const classification = classifyTarget(target, ctx);
    const reason = reasonForClassification(classification, ctx);
    if (reason) {
      return reason;
    }
  }
  return null;
}
function extractTargets(tokens) {
  const targets = [];
  let pastDoubleDash = false;
  for (let i = 1;i < tokens.length; i++) {
    const token = tokens[i];
    if (!token)
      continue;
    if (token === "--") {
      pastDoubleDash = true;
      continue;
    }
    if (pastDoubleDash) {
      targets.push(token);
      continue;
    }
    if (!token.startsWith("-")) {
      targets.push(token);
    }
  }
  return targets;
}
function classifyTarget(target, ctx) {
  if (isDangerousRootOrHomeTarget(target)) {
    return { kind: "root_or_home_target" };
  }
  const anchoredCwd = ctx.anchoredCwd;
  if (anchoredCwd) {
    if (isCwdSelfTarget(target, anchoredCwd)) {
      return { kind: "cwd_self_target" };
    }
  }
  if (isTempTarget(target, ctx.trustTmpdirVar)) {
    return { kind: "temp_target" };
  }
  if (anchoredCwd) {
    if (isCwdHomeForRmPolicy(anchoredCwd, ctx.homeDir)) {
      return { kind: "root_or_home_target" };
    }
    if (isTargetWithinCwd(target, anchoredCwd, ctx.resolvedCwd ?? anchoredCwd)) {
      return { kind: "within_anchored_cwd" };
    }
  }
  return { kind: "outside_anchored_cwd" };
}
function reasonForClassification(classification, ctx) {
  switch (classification.kind) {
    case "root_or_home_target":
      return REASON_RM_RF_ROOT_HOME;
    case "cwd_self_target":
      return REASON_RM_RF;
    case "temp_target":
      return null;
    case "within_anchored_cwd":
      if (ctx.paranoid) {
        return `${REASON_RM_RF} (SAFETY_NET_PARANOID_RM enabled)`;
      }
      return null;
    case "outside_anchored_cwd":
      return REASON_RM_RF;
  }
}
function isDangerousRootOrHomeTarget(path) {
  const normalized = path.trim();
  if (normalized === "/" || normalized === "/*") {
    return true;
  }
  if (normalized === "~" || normalized === "~/" || normalized.startsWith("~/")) {
    if (normalized === "~" || normalized === "~/" || normalized === "~/*") {
      return true;
    }
  }
  if (normalized === "$HOME" || normalized === "$HOME/" || normalized === "$HOME/*") {
    return true;
  }
  if (normalized === "${HOME}" || normalized === "${HOME}/" || normalized === "${HOME}/*") {
    return true;
  }
  return false;
}
function isTempTarget(path, allowTmpdirVar) {
  const normalized = path.trim();
  if (normalized.includes("..")) {
    return false;
  }
  if (normalized === "/tmp" || normalized.startsWith("/tmp/")) {
    return true;
  }
  if (normalized === "/var/tmp" || normalized.startsWith("/var/tmp/")) {
    return true;
  }
  const systemTmpdir = tmpdir();
  const normalizedTmpdir = normalizePathForComparison(systemTmpdir);
  const pathToCompare = normalizePathForComparison(normalized);
  if (pathToCompare.startsWith(`${normalizedTmpdir}${sep}`) || pathToCompare === normalizedTmpdir) {
    return true;
  }
  if (allowTmpdirVar) {
    if (normalized === "$TMPDIR" || normalized.startsWith("$TMPDIR/")) {
      return true;
    }
    if (normalized === "${TMPDIR}" || normalized.startsWith("${TMPDIR}/")) {
      return true;
    }
  }
  return false;
}
function getHomeDirForRmPolicy() {
  return process.env.HOME ?? homedir3();
}
function isCwdHomeForRmPolicy(cwd, homeDir) {
  try {
    return normalizePathForComparison(cwd) === normalizePathForComparison(homeDir);
  } catch {
    return false;
  }
}
function isCwdSelfTarget(target, cwd) {
  if (target === "." || target === "./" || target === ".\\") {
    return true;
  }
  try {
    const resolved = resolve2(cwd, target);
    const realCwd = realpathSync(cwd);
    const realResolved = realpathSync(resolved);
    return normalizePathForComparison(realResolved) === normalizePathForComparison(realCwd);
  } catch {
    try {
      const resolved = resolve2(cwd, target);
      return normalizePathForComparison(resolved) === normalizePathForComparison(cwd);
    } catch {
      return false;
    }
  }
}
function isTargetWithinCwd(target, originalCwd, effectiveCwd) {
  const resolveCwd = effectiveCwd ?? originalCwd;
  if (target.startsWith("~") || target.startsWith("$HOME") || target.startsWith("${HOME}")) {
    return false;
  }
  if (target.includes("$") || target.includes("`")) {
    return false;
  }
  if (target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target)) {
    try {
      const normalizedTarget = normalizePathForComparison(target);
      const normalizedCwd = `${normalizePathForComparison(originalCwd)}${sep}`;
      return normalizedTarget.startsWith(normalizedCwd);
    } catch {
      return false;
    }
  }
  if (target.startsWith("./") || target.startsWith(".\\") || !target.includes("/") && !target.includes("\\")) {
    try {
      const resolved = resolve2(resolveCwd, target);
      const normalizedResolved = normalizePathForComparison(resolved);
      const normalizedOriginalCwd = normalizePathForComparison(originalCwd);
      return normalizedResolved.startsWith(`${normalizedOriginalCwd}${sep}`) || normalizedResolved === normalizedOriginalCwd;
    } catch {
      return false;
    }
  }
  if (target.startsWith("../")) {
    return false;
  }
  try {
    const resolved = resolve2(resolveCwd, target);
    const normalizedResolved = normalizePathForComparison(resolved);
    const normalizedCwd = normalizePathForComparison(originalCwd);
    return normalizedResolved.startsWith(`${normalizedCwd}${sep}`) || normalizedResolved === normalizedCwd;
  } catch {
    return false;
  }
}
function isHomeDirectory(cwd) {
  const home = process.env.HOME ?? homedir3();
  try {
    return normalizePathForComparison(cwd) === normalizePathForComparison(home);
  } catch {
    return false;
  }
}

// src/core/analyze/parallel.ts
var REASON_PARALLEL_RM = "parallel rm -rf with dynamic input is dangerous. Use explicit file list instead.";
var REASON_PARALLEL_SHELL = "parallel with shell -c can execute arbitrary commands from dynamic input.";
function analyzeParallel(tokens, context) {
  const parseResult = parseParallelCommand(tokens);
  if (!parseResult) {
    return null;
  }
  const { template, args, hasPlaceholder } = parseResult;
  if (template.length === 0) {
    for (const arg of args) {
      const reason = context.analyzeNested(arg);
      if (reason) {
        return reason;
      }
    }
    return null;
  }
  let childTokens = stripWrappers([...template]);
  let head = getBasename(childTokens[0] ?? "").toLowerCase();
  if (head === "busybox" && childTokens.length > 1) {
    childTokens = childTokens.slice(1);
    head = getBasename(childTokens[0] ?? "").toLowerCase();
  }
  if (SHELL_WRAPPERS.has(head)) {
    const dashCArg = extractDashCArg(childTokens);
    if (dashCArg) {
      if (dashCArg === "{}" || dashCArg === "{1}") {
        return REASON_PARALLEL_SHELL;
      }
      if (dashCArg.includes("{}")) {
        if (args.length > 0) {
          for (const arg of args) {
            const expandedScript = dashCArg.replace(/{}/g, arg);
            const reason3 = context.analyzeNested(expandedScript);
            if (reason3) {
              return reason3;
            }
          }
          return null;
        }
        const reason2 = context.analyzeNested(dashCArg);
        if (reason2) {
          return reason2;
        }
        return null;
      }
      const reason = context.analyzeNested(dashCArg);
      if (reason) {
        return reason;
      }
      if (hasPlaceholder) {
        return REASON_PARALLEL_SHELL;
      }
      return null;
    }
    if (args.length > 0) {
      return REASON_PARALLEL_SHELL;
    }
    if (hasPlaceholder) {
      return REASON_PARALLEL_SHELL;
    }
    return null;
  }
  if (head === "rm" && hasRecursiveForceFlags(childTokens)) {
    if (hasPlaceholder && args.length > 0) {
      for (const arg of args) {
        const expandedTokens = childTokens.map((t) => t.replace(/{}/g, arg));
        const rmResult = analyzeRm(expandedTokens, {
          cwd: context.cwd,
          originalCwd: context.originalCwd,
          paranoid: context.paranoidRm,
          allowTmpdirVar: context.allowTmpdirVar
        });
        if (rmResult) {
          return rmResult;
        }
      }
      return null;
    }
    if (args.length > 0) {
      const expandedTokens = [...childTokens, args[0] ?? ""];
      const rmResult = analyzeRm(expandedTokens, {
        cwd: context.cwd,
        originalCwd: context.originalCwd,
        paranoid: context.paranoidRm,
        allowTmpdirVar: context.allowTmpdirVar
      });
      if (rmResult) {
        return rmResult;
      }
      return null;
    }
    return REASON_PARALLEL_RM;
  }
  if (head === "find") {
    const findResult = analyzeFind(childTokens);
    if (findResult) {
      return findResult;
    }
  }
  if (head === "git") {
    const gitResult = analyzeGit(childTokens);
    if (gitResult) {
      return gitResult;
    }
  }
  return null;
}
function parseParallelCommand(tokens) {
  const parallelOptsWithValue = new Set([
    "-S",
    "--sshlogin",
    "--slf",
    "--sshloginfile",
    "-a",
    "--arg-file",
    "--colsep",
    "-I",
    "--replace",
    "--results",
    "--result",
    "--res"
  ]);
  let i = 1;
  const templateTokens = [];
  let markerIndex = -1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token)
      break;
    if (token === ":::") {
      markerIndex = i;
      break;
    }
    if (token === "--") {
      i++;
      while (i < tokens.length) {
        const token2 = tokens[i];
        if (token2 === undefined || token2 === ":::")
          break;
        templateTokens.push(token2);
        i++;
      }
      if (i < tokens.length && tokens[i] === ":::") {
        markerIndex = i;
      }
      break;
    }
    if (token.startsWith("-")) {
      if (token.startsWith("-j") && token.length > 2 && /^\d+$/.test(token.slice(2))) {
        i++;
        continue;
      }
      if (token.startsWith("--") && token.includes("=")) {
        i++;
        continue;
      }
      if (parallelOptsWithValue.has(token)) {
        i += 2;
        continue;
      }
      if (token === "-j" || token === "--jobs") {
        i += 2;
        continue;
      }
      i++;
    } else {
      while (i < tokens.length) {
        const token2 = tokens[i];
        if (token2 === undefined || token2 === ":::")
          break;
        templateTokens.push(token2);
        i++;
      }
      if (i < tokens.length && tokens[i] === ":::") {
        markerIndex = i;
      }
      break;
    }
  }
  const args = [];
  if (markerIndex !== -1) {
    for (let j = markerIndex + 1;j < tokens.length; j++) {
      const token = tokens[j];
      if (token && token !== ":::") {
        args.push(token);
      }
    }
  }
  const hasPlaceholder = templateTokens.some((t) => t.includes("{}") || t.includes("{1}") || t.includes("{.}"));
  if (templateTokens.length === 0 && markerIndex === -1) {
    return null;
  }
  return { template: templateTokens, args, hasPlaceholder };
}

// src/core/analyze/tmpdir.ts
import { tmpdir as tmpdir2 } from "node:os";
function isTmpdirOverriddenToNonTemp(envAssignments) {
  if (!envAssignments.has("TMPDIR")) {
    return false;
  }
  const tmpdirValue = envAssignments.get("TMPDIR") ?? "";
  if (tmpdirValue === "") {
    return true;
  }
  const sysTmpdir = tmpdir2();
  if (isPathOrSubpath(tmpdirValue, "/tmp") || isPathOrSubpath(tmpdirValue, "/var/tmp") || isPathOrSubpath(tmpdirValue, sysTmpdir)) {
    return false;
  }
  return true;
}
function isPathOrSubpath(path, basePath) {
  if (path === basePath) {
    return true;
  }
  const baseWithSlash = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return path.startsWith(baseWithSlash);
}

// src/core/analyze/xargs.ts
var REASON_XARGS_RM = "xargs rm -rf with dynamic input is dangerous. Use explicit file list instead.";
var REASON_XARGS_SHELL = "xargs with shell -c can execute arbitrary commands from dynamic input.";
function analyzeXargs(tokens, context) {
  const { childTokens: rawChildTokens } = extractXargsChildCommandWithInfo(tokens);
  let childTokens = stripWrappers(rawChildTokens);
  if (childTokens.length === 0) {
    return null;
  }
  let head = getBasename(childTokens[0] ?? "").toLowerCase();
  if (head === "busybox" && childTokens.length > 1) {
    childTokens = childTokens.slice(1);
    head = getBasename(childTokens[0] ?? "").toLowerCase();
  }
  if (SHELL_WRAPPERS.has(head)) {
    return REASON_XARGS_SHELL;
  }
  if (head === "rm" && hasRecursiveForceFlags(childTokens)) {
    const rmResult = analyzeRm(childTokens, {
      cwd: context.cwd,
      originalCwd: context.originalCwd,
      paranoid: context.paranoidRm,
      allowTmpdirVar: context.allowTmpdirVar
    });
    if (rmResult) {
      return rmResult;
    }
    return REASON_XARGS_RM;
  }
  if (head === "find") {
    const findResult = analyzeFind(childTokens);
    if (findResult) {
      return findResult;
    }
  }
  if (head === "git") {
    const gitResult = analyzeGit(childTokens);
    if (gitResult) {
      return gitResult;
    }
  }
  return null;
}
function extractXargsChildCommandWithInfo(tokens) {
  const xargsOptsWithValue = new Set([
    "-L",
    "-n",
    "-P",
    "-s",
    "-a",
    "-E",
    "-e",
    "-d",
    "-J",
    "--max-args",
    "--max-procs",
    "--max-chars",
    "--arg-file",
    "--eof",
    "--delimiter",
    "--max-lines"
  ]);
  let replacementToken = null;
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token)
      break;
    if (token === "--") {
      return { childTokens: [...tokens.slice(i + 1)], replacementToken };
    }
    if (token.startsWith("-")) {
      if (token === "-I") {
        replacementToken = tokens[i + 1] ?? "{}";
        i += 2;
        continue;
      }
      if (token.startsWith("-I") && token.length > 2) {
        replacementToken = token.slice(2);
        i++;
        continue;
      }
      if (token === "--replace") {
        replacementToken = "{}";
        i++;
        continue;
      }
      if (token.startsWith("--replace=")) {
        const value = token.slice("--replace=".length);
        replacementToken = value === "" ? "{}" : value;
        i++;
        continue;
      }
      if (token === "-J") {
        i += 2;
        continue;
      }
      if (xargsOptsWithValue.has(token)) {
        i += 2;
      } else if (token.startsWith("--") && token.includes("=")) {
        i++;
      } else if (token.startsWith("-L") || token.startsWith("-n") || token.startsWith("-P") || token.startsWith("-s")) {
        i++;
      } else {
        i++;
      }
    } else {
      return { childTokens: [...tokens.slice(i)], replacementToken };
    }
  }
  return { childTokens: [], replacementToken };
}

// src/core/rules-custom.ts
function checkCustomRules(tokens, rules) {
  if (tokens.length === 0 || rules.length === 0) {
    return null;
  }
  const command = getBasename(tokens[0] ?? "");
  const subcommand = extractSubcommand(tokens);
  const shortOpts = extractShortOpts(tokens);
  for (const rule of rules) {
    if (!matchesCommand(command, rule.command)) {
      continue;
    }
    if (rule.subcommand && subcommand !== rule.subcommand) {
      continue;
    }
    if (matchesBlockArgs(tokens, rule.block_args, shortOpts)) {
      return `[${rule.name}] ${rule.reason}`;
    }
  }
  return null;
}
function matchesCommand(command, ruleCommand) {
  return command === ruleCommand;
}
var OPTIONS_WITH_VALUES = new Set([
  "-c",
  "-C",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env"
]);
function extractSubcommand(tokens) {
  let skipNext = false;
  for (let i = 1;i < tokens.length; i++) {
    const token = tokens[i];
    if (!token)
      continue;
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (token === "--") {
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith("-")) {
        return nextToken;
      }
      return null;
    }
    if (OPTIONS_WITH_VALUES.has(token)) {
      skipNext = true;
      continue;
    }
    if (token.startsWith("-")) {
      for (const opt of OPTIONS_WITH_VALUES) {
        if (token.startsWith(`${opt}=`)) {
          break;
        }
      }
      continue;
    }
    return token;
  }
  return null;
}
function matchesBlockArgs(tokens, blockArgs, shortOpts) {
  const blockArgsSet = new Set(blockArgs);
  for (const token of tokens) {
    if (blockArgsSet.has(token)) {
      return true;
    }
  }
  for (const opt of shortOpts) {
    if (blockArgsSet.has(opt)) {
      return true;
    }
  }
  return false;
}

// src/core/analyze/segment.ts
var REASON_INTERPRETER_DANGEROUS = "Detected potentially dangerous command in interpreter code.";
var REASON_INTERPRETER_BLOCKED = "Interpreter one-liners are blocked in paranoid mode.";
var REASON_RM_HOME_CWD = "rm -rf in home directory is dangerous. Change to a project directory first.";
function deriveCwdContext(options) {
  const cwdUnknown = options.effectiveCwd === null;
  const cwdForRm = cwdUnknown ? undefined : options.effectiveCwd ?? options.cwd;
  const originalCwd = cwdUnknown ? undefined : options.cwd;
  return { cwdUnknown, cwdForRm, originalCwd };
}
function analyzeSegment(tokens, depth, options) {
  if (tokens.length === 0) {
    return null;
  }
  const { tokens: strippedEnv, envAssignments: leadingEnvAssignments } = stripEnvAssignmentsWithInfo(tokens);
  const { tokens: stripped, envAssignments: wrapperEnvAssignments } = stripWrappersWithInfo(strippedEnv);
  const envAssignments = new Map(leadingEnvAssignments);
  for (const [k, v] of wrapperEnvAssignments) {
    envAssignments.set(k, v);
  }
  if (stripped.length === 0) {
    return null;
  }
  const head = stripped[0];
  if (!head) {
    return null;
  }
  const normalizedHead = normalizeCommandToken(head);
  const basename = getBasename(head);
  const { cwdForRm, originalCwd } = deriveCwdContext(options);
  const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);
  if (SHELL_WRAPPERS.has(normalizedHead)) {
    const dashCArg = extractDashCArg(stripped);
    if (dashCArg) {
      return options.analyzeNested(dashCArg);
    }
  }
  if (INTERPRETERS.has(normalizedHead)) {
    const codeArg = extractInterpreterCodeArg(stripped);
    if (codeArg) {
      if (options.paranoidInterpreters) {
        return REASON_INTERPRETER_BLOCKED + PARANOID_INTERPRETERS_SUFFIX;
      }
      const innerReason = options.analyzeNested(codeArg);
      if (innerReason) {
        return innerReason;
      }
      if (containsDangerousCode(codeArg)) {
        return REASON_INTERPRETER_DANGEROUS;
      }
    }
  }
  if (normalizedHead === "busybox" && stripped.length > 1) {
    return analyzeSegment(stripped.slice(1), depth, options);
  }
  const isGit = basename.toLowerCase() === "git";
  const isRm = basename === "rm";
  const isFind = basename === "find";
  const isXargs = basename === "xargs";
  const isParallel = basename === "parallel";
  if (isGit) {
    const gitResult = analyzeGit(stripped);
    if (gitResult) {
      return gitResult;
    }
  }
  if (isRm) {
    if (cwdForRm && isHomeDirectory(cwdForRm)) {
      if (hasRecursiveForceFlags(stripped)) {
        return REASON_RM_HOME_CWD;
      }
    }
    const rmResult = analyzeRm(stripped, {
      cwd: cwdForRm,
      originalCwd,
      paranoid: options.paranoidRm,
      allowTmpdirVar
    });
    if (rmResult) {
      return rmResult;
    }
  }
  if (isFind) {
    const findResult = analyzeFind(stripped);
    if (findResult) {
      return findResult;
    }
  }
  if (isXargs) {
    const xargsResult = analyzeXargs(stripped, {
      cwd: cwdForRm,
      originalCwd,
      paranoidRm: options.paranoidRm,
      allowTmpdirVar
    });
    if (xargsResult) {
      return xargsResult;
    }
  }
  if (isParallel) {
    const parallelResult = analyzeParallel(stripped, {
      cwd: cwdForRm,
      originalCwd,
      paranoidRm: options.paranoidRm,
      allowTmpdirVar,
      analyzeNested: options.analyzeNested
    });
    if (parallelResult) {
      return parallelResult;
    }
  }
  const matchedKnown = isGit || isRm || isFind || isXargs || isParallel;
  if (!matchedKnown) {
    if (!DISPLAY_COMMANDS.has(normalizedHead)) {
      for (let i = 1;i < stripped.length; i++) {
        const token = stripped[i];
        if (!token)
          continue;
        const cmd = normalizeCommandToken(token);
        if (cmd === "rm") {
          const rmTokens = ["rm", ...stripped.slice(i + 1)];
          const reason = analyzeRm(rmTokens, {
            cwd: cwdForRm,
            originalCwd,
            paranoid: options.paranoidRm,
            allowTmpdirVar
          });
          if (reason) {
            return reason;
          }
        }
        if (cmd === "git") {
          const gitTokens = ["git", ...stripped.slice(i + 1)];
          const reason = analyzeGit(gitTokens);
          if (reason) {
            return reason;
          }
        }
        if (cmd === "find") {
          const findTokens = ["find", ...stripped.slice(i + 1)];
          const reason = analyzeFind(findTokens);
          if (reason) {
            return reason;
          }
        }
      }
    }
  }
  const customRulesTopLevelOnly = isGit || isRm || isFind || isXargs || isParallel;
  if (depth === 0 || !customRulesTopLevelOnly) {
    const customResult = checkCustomRules(stripped, options.config.rules);
    if (customResult) {
      return customResult;
    }
  }
  return null;
}
var CWD_CHANGE_REGEX = /^\s*(?:\$\(\s*)?[({]*\s*(?:command\s+|builtin\s+)?(?:cd|pushd|popd)(?:\s|$)/;
function segmentChangesCwd(segment) {
  const stripped = stripLeadingGrouping(segment);
  const unwrapped = stripWrappers([...stripped]);
  if (unwrapped.length === 0) {
    return false;
  }
  let head = unwrapped[0] ?? "";
  if (head === "builtin" && unwrapped.length > 1) {
    head = unwrapped[1] ?? "";
  }
  if (head === "cd" || head === "pushd" || head === "popd") {
    return true;
  }
  const joined = segment.join(" ");
  return CWD_CHANGE_REGEX.test(joined);
}
function stripLeadingGrouping(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === "{" || token === "(" || token === "$(") {
      i++;
    } else {
      break;
    }
  }
  return tokens.slice(i);
}

// src/core/analyze/analyze-command.ts
var REASON_STRICT_UNPARSEABLE = "Command could not be safely analyzed (strict mode). Verify manually.";
var REASON_RECURSION_LIMIT = "Command exceeds maximum recursion depth and cannot be safely analyzed.";
function analyzeCommandInternal(command, depth, options) {
  if (depth >= MAX_RECURSION_DEPTH) {
    return { reason: REASON_RECURSION_LIMIT, segment: command };
  }
  const segments = splitShellCommands(command);
  if (options.strict && segments.length === 1 && segments[0]?.length === 1 && segments[0][0] === command && command.includes(" ")) {
    return { reason: REASON_STRICT_UNPARSEABLE, segment: command };
  }
  const originalCwd = options.cwd;
  let effectiveCwd = options.effectiveCwd !== undefined ? options.effectiveCwd : options.cwd;
  for (const segment of segments) {
    const segmentStr = segment.join(" ");
    if (segment.length === 1 && segment[0]?.includes(" ")) {
      const textReason = dangerousInText(segment[0]);
      if (textReason) {
        return { reason: textReason, segment: segmentStr };
      }
      if (segmentChangesCwd(segment)) {
        effectiveCwd = null;
      }
      continue;
    }
    const reason = analyzeSegment(segment, depth, {
      ...options,
      cwd: originalCwd,
      effectiveCwd,
      analyzeNested: (nestedCommand) => {
        return analyzeCommandInternal(nestedCommand, depth + 1, { ...options, effectiveCwd })?.reason ?? null;
      }
    });
    if (reason) {
      return { reason, segment: segmentStr };
    }
    if (segmentChangesCwd(segment)) {
      effectiveCwd = null;
    }
  }
  return null;
}

// src/core/analyze.ts
function analyzeCommand(command, options = {}) {
  const config = options.config ?? loadConfig(options.cwd);
  return analyzeCommandInternal(command, 0, { ...options, config });
}

// src/bin/doctor/hooks.ts
var SELF_TEST_CASES = [
  { command: "git reset --hard", description: "git reset --hard", expectBlocked: true },
  { command: "rm -rf /", description: "rm -rf /", expectBlocked: true },
  { command: "rm -rf ./node_modules", description: "rm in cwd (safe)", expectBlocked: false }
];
var SELF_TEST_CONFIG = { version: 1, rules: [] };
function runSelfTest() {
  const selfTestCwd = join3(tmpdir3(), "cc-safety-net-self-test");
  const results = SELF_TEST_CASES.map((tc) => {
    const result = analyzeCommand(tc.command, {
      cwd: selfTestCwd,
      config: SELF_TEST_CONFIG,
      strict: false,
      paranoidRm: false,
      paranoidInterpreters: false
    });
    const wasBlocked = result !== null;
    const expected = tc.expectBlocked ? "blocked" : "allowed";
    const actual = wasBlocked ? "blocked" : "allowed";
    return {
      command: tc.command,
      description: tc.description,
      expected,
      actual,
      passed: expected === actual,
      reason: result?.reason
    };
  });
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  return { passed, failed, total: results.length, results };
}
function stripJsonComments(content) {
  let result = "";
  let i = 0;
  let inString = false;
  let isEscaped = false;
  let lastCommaIndex = -1;
  while (i < content.length) {
    const char = content[i];
    const next = content[i + 1];
    if (isEscaped) {
      result += char;
      isEscaped = false;
      i++;
      continue;
    }
    if (char === '"' && !inString) {
      inString = true;
      lastCommaIndex = -1;
      result += char;
      i++;
      continue;
    }
    if (char === '"' && inString) {
      inString = false;
      result += char;
      i++;
      continue;
    }
    if (char === "\\" && inString) {
      isEscaped = true;
      result += char;
      i++;
      continue;
    }
    if (inString) {
      result += char;
      i++;
      continue;
    }
    if (char === "/" && next === "/") {
      while (i < content.length && content[i] !== `
`) {
        i++;
      }
      continue;
    }
    if (char === "/" && next === "*") {
      i += 2;
      while (i < content.length - 1) {
        if (content[i] === "*" && content[i + 1] === "/") {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }
    if (char === ",") {
      lastCommaIndex = result.length;
      result += char;
      i++;
      continue;
    }
    if (char === "}" || char === "]") {
      if (lastCommaIndex !== -1) {
        const between = result.slice(lastCommaIndex + 1);
        if (/^\s*$/.test(between)) {
          result = result.slice(0, lastCommaIndex) + between;
        }
      }
      lastCommaIndex = -1;
      result += char;
      i++;
      continue;
    }
    if (!/\s/.test(char)) {
      lastCommaIndex = -1;
    }
    result += char;
    i++;
  }
  return result;
}
function detectClaudeCode(homeDir) {
  const errors = [];
  const settingsPath = join3(homeDir, ".claude", "settings.json");
  const pluginKey = "safety-net@cc-marketplace";
  if (existsSync4(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync4(settingsPath, "utf-8"));
      const pluginValue = settings.enabledPlugins?.[pluginKey];
      if (pluginValue === true) {
        return {
          platform: "claude-code",
          status: "configured",
          method: "marketplace plugin",
          configPath: settingsPath,
          selfTest: runSelfTest()
        };
      }
      if (pluginValue === false) {
        return {
          platform: "claude-code",
          status: "disabled",
          method: "marketplace plugin",
          configPath: settingsPath
        };
      }
    } catch (e) {
      errors.push(`Failed to parse settings.json: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return {
    platform: "claude-code",
    status: "n/a",
    errors: errors.length > 0 ? errors : undefined
  };
}
function detectOpenCode(homeDir) {
  const errors = [];
  const configDir = join3(homeDir, ".config", "opencode");
  const candidates = ["opencode.json", "opencode.jsonc"];
  for (const filename of candidates) {
    const configPath = join3(configDir, filename);
    if (existsSync4(configPath)) {
      try {
        const content = readFileSync4(configPath, "utf-8");
        const json = stripJsonComments(content);
        const config = JSON.parse(json);
        const plugins = config.plugin ?? [];
        const hasSafetyNet = plugins.some((p) => p.includes("cc-safety-net"));
        if (hasSafetyNet) {
          return {
            platform: "opencode",
            status: "configured",
            method: "plugin array",
            configPath,
            selfTest: runSelfTest(),
            errors: errors.length > 0 ? errors : undefined
          };
        }
      } catch (e) {
        errors.push(`Failed to parse ${filename}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return {
    platform: "opencode",
    status: "n/a",
    errors: errors.length > 0 ? errors : undefined
  };
}
function checkGeminiHooksEnabled(homeDir, cwd, errors) {
  const candidates = [
    join3(homeDir, ".gemini", "settings.json"),
    join3(cwd, ".gemini", "settings.json")
  ];
  for (const settingsPath of candidates) {
    if (existsSync4(settingsPath)) {
      try {
        const settings = JSON.parse(readFileSync4(settingsPath, "utf-8"));
        if (settings.tools?.enableHooks === true) {
          return { enabled: true, configPath: settingsPath };
        }
      } catch (e) {
        errors.push(`Failed to parse ${settingsPath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return { enabled: false };
}
function detectGeminiCLI(homeDir, cwd) {
  const errors = [];
  const extensionPath = join3(homeDir, ".gemini", "extensions", "extension-enablement.json");
  if (!existsSync4(extensionPath)) {
    return { platform: "gemini-cli", status: "n/a" };
  }
  let isInstalled = false;
  let isEnabled = false;
  try {
    const extensionConfig = JSON.parse(readFileSync4(extensionPath, "utf-8"));
    const pluginConfig = extensionConfig["gemini-safety-net"];
    if (pluginConfig) {
      isInstalled = true;
      const overrides = pluginConfig.overrides ?? [];
      isEnabled = overrides.some((o) => !o.startsWith("!"));
    }
  } catch (e) {
    errors.push(`Failed to parse extension-enablement.json: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!isInstalled) {
    return {
      platform: "gemini-cli",
      status: "n/a",
      errors: errors.length > 0 ? errors : undefined
    };
  }
  if (!isEnabled) {
    errors.push("Plugin is installed but disabled (no enabled workspace overrides)");
    return {
      platform: "gemini-cli",
      status: "disabled",
      method: "extension plugin",
      configPath: extensionPath,
      errors
    };
  }
  const hooksCheck = checkGeminiHooksEnabled(homeDir, cwd, errors);
  if (hooksCheck.enabled) {
    return {
      platform: "gemini-cli",
      status: "configured",
      method: "extension plugin",
      configPath: extensionPath,
      selfTest: runSelfTest(),
      errors: errors.length > 0 ? errors : undefined
    };
  }
  errors.push("Hooks are not enabled (set tools.enableHooks: true in settings.json)");
  return {
    platform: "gemini-cli",
    status: "n/a",
    method: "extension plugin",
    configPath: extensionPath,
    errors
  };
}
function detectAllHooks(cwd, options) {
  const homeDir = options?.homeDir ?? homedir4();
  return [detectClaudeCode(homeDir), detectOpenCode(homeDir), detectGeminiCLI(homeDir, cwd)];
}

// src/bin/doctor/system-info.ts
import { spawn } from "node:child_process";
var CURRENT_VERSION = "0.7.0";
function getPackageVersion() {
  return CURRENT_VERSION;
}
var defaultVersionFetcher = async (args) => {
  const [cmd, ...rest] = args;
  if (!cmd)
    return null;
  return new Promise((resolve3) => {
    try {
      const proc = spawn(cmd, rest, {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let output = "";
      proc.stdout.on("data", (data) => {
        output += data.toString();
      });
      proc.on("close", (code) => {
        resolve3(code === 0 ? output.trim() || null : null);
      });
      proc.on("error", () => {
        resolve3(null);
      });
    } catch {
      resolve3(null);
    }
  });
};
function parseVersion(output) {
  if (!output)
    return null;
  const claudeMatch = /Claude Code\s+(\d+\.\d+\.\d+)/i.exec(output);
  if (claudeMatch)
    return claudeMatch[1] ?? null;
  const versionMatch = /v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/i.exec(output);
  if (versionMatch)
    return versionMatch[1] ?? null;
  const firstLine = output.split(`
`)[0]?.trim();
  return firstLine || null;
}
async function getSystemInfo(fetcher = defaultVersionFetcher) {
  const [claudeRaw, openCodeRaw, geminiRaw, nodeRaw, npmRaw, bunRaw] = await Promise.all([
    fetcher(["claude", "--version"]),
    fetcher(["opencode", "--version"]),
    fetcher(["gemini", "--version"]),
    fetcher(["node", "--version"]),
    fetcher(["npm", "--version"]),
    fetcher(["bun", "--version"])
  ]);
  return {
    version: CURRENT_VERSION,
    claudeCodeVersion: parseVersion(claudeRaw),
    openCodeVersion: parseVersion(openCodeRaw),
    geminiCliVersion: parseVersion(geminiRaw),
    nodeVersion: parseVersion(nodeRaw),
    npmVersion: parseVersion(npmRaw),
    bunVersion: parseVersion(bunRaw),
    platform: `${process.platform} ${process.arch}`
  };
}

// src/bin/doctor/updates.ts
function isNewerVersion(latest, current) {
  if (current === "dev")
    return false;
  const latestParts = latest.split(".").map(Number);
  const currentParts = current.split(".").map(Number);
  const [latestMajor = 0, latestMinor = 0, latestPatch = 0] = latestParts;
  const [currentMajor = 0, currentMinor = 0, currentPatch = 0] = currentParts;
  if (latestMajor !== currentMajor)
    return latestMajor > currentMajor;
  if (latestMinor !== currentMinor)
    return latestMinor > currentMinor;
  return latestPatch > currentPatch;
}
async function checkForUpdates() {
  const currentVersion = getPackageVersion();
  const controller = new AbortController;
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch("https://registry.npmjs.org/cc-safety-net/latest", {
      signal: controller.signal
    });
    if (!res.ok) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        error: `npm registry returned ${res.status}`
      };
    }
    const data = await res.json();
    const updateAvailable = isNewerVersion(data.version, currentVersion);
    return {
      currentVersion,
      latestVersion: data.version,
      updateAvailable
    };
  } catch (e) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      error: e instanceof Error ? e.message : "Network error"
    };
  } finally {
    clearTimeout(timeout);
  }
}

// src/bin/doctor/flags.ts
function parseDoctorFlags(args) {
  return {
    json: args.includes("--json"),
    skipUpdateCheck: args.includes("--skip-update-check")
  };
}

// src/bin/doctor/index.ts
async function runDoctor(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const hooks = detectAllHooks(cwd);
  const configInfo = getConfigInfo(cwd);
  const environment = getEnvironmentInfo();
  const activity = getActivitySummary(7);
  const update = options.skipUpdateCheck ? {
    currentVersion: getPackageVersion(),
    latestVersion: null,
    updateAvailable: false
  } : await checkForUpdates();
  const system = await getSystemInfo();
  const report = {
    hooks,
    userConfig: configInfo.userConfig,
    projectConfig: configInfo.projectConfig,
    effectiveRules: configInfo.effectiveRules,
    shadowedRules: configInfo.shadowedRules,
    environment,
    activity,
    update,
    system
  };
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  const hasFailure = hooks.every((h) => h.status !== "configured") || hooks.some((h) => h.selfTest && h.selfTest.failed > 0) || configInfo.userConfig.exists && !configInfo.userConfig.valid || configInfo.projectConfig.exists && !configInfo.projectConfig.valid;
  return hasFailure ? 1 : 0;
}
function printReport(report) {
  console.log();
  console.log(formatHooksSection(report.hooks));
  console.log();
  console.log(formatConfigSection(report));
  console.log();
  console.log(formatEnvironmentSection(report.environment));
  console.log();
  console.log(formatActivitySection(report.activity));
  console.log();
  console.log(formatSystemInfoSection(report.system));
  console.log();
  console.log(formatUpdateSection(report.update));
  console.log(formatSummary(report));
}

// src/bin/explain/config.ts
import { existsSync as existsSync5 } from "node:fs";
import { resolve as resolve3 } from "node:path";

// src/core/env.ts
function envTruthy(name) {
  const value = process.env[name];
  return value === "1" || value?.toLowerCase() === "true";
}

// src/bin/explain/config.ts
function getConfigSource(options) {
  const projectPath = getProjectConfigPath(options?.cwd);
  let invalidProjectPath = null;
  if (existsSync5(projectPath)) {
    const validation = validateConfigFile(projectPath);
    if (validation.errors.length === 0) {
      return { configSource: projectPath, configValid: true };
    }
    invalidProjectPath = projectPath;
  }
  const userPath = options?.userConfigPath ?? getUserConfigPath();
  if (existsSync5(userPath)) {
    const validation = validateConfigFile(userPath);
    return { configSource: userPath, configValid: validation.errors.length === 0 };
  }
  if (invalidProjectPath) {
    return { configSource: invalidProjectPath, configValid: false };
  }
  return { configSource: null, configValid: true };
}
function buildAnalyzeOptions(explainOptions) {
  const cwd = resolve3(explainOptions?.cwd ?? process.cwd());
  const paranoidAll = envTruthy("SAFETY_NET_PARANOID");
  return {
    cwd,
    effectiveCwd: cwd,
    config: explainOptions?.config ?? loadConfig(cwd),
    strict: explainOptions?.strict ?? envTruthy("SAFETY_NET_STRICT"),
    paranoidRm: paranoidAll || envTruthy("SAFETY_NET_PARANOID_RM"),
    paranoidInterpreters: paranoidAll || envTruthy("SAFETY_NET_PARANOID_INTERPRETERS")
  };
}

// src/bin/explain/redact.ts
var ENV_ASSIGNMENT_RE2 = /^[A-Za-z_][A-Za-z0-9_]*=/;
function redactEnvVars(envMap) {
  const result = {};
  for (const key of envMap.keys()) {
    result[key] = "<redacted>";
  }
  return result;
}
function redactEnvAssignmentsInString(str) {
  return str.replace(/\b([A-Za-z_][A-Za-z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)/g, "$1=<redacted>");
}
function redactEnvAssignmentTokens(tokens) {
  return tokens.map((token) => {
    if (ENV_ASSIGNMENT_RE2.test(token)) {
      const eqIdx = token.indexOf("=");
      return `${token.slice(0, eqIdx)}=<redacted>`;
    }
    return token;
  });
}

// src/bin/explain/segment.ts
var REASON_STRICT_UNPARSEABLE2 = "Command could not be safely analyzed (strict mode). Verify manually.";
function isUnparseableCommand(command, segments) {
  return segments.length === 1 && segments[0]?.length === 1 && segments[0][0] === command && command.includes(" ");
}
function explainInnerSegments(innerCmd, depth, options, steps) {
  if (depth + 1 >= MAX_RECURSION_DEPTH) {
    steps.push({
      type: "error",
      message: REASON_RECURSION_LIMIT
    });
    return { reason: REASON_RECURSION_LIMIT };
  }
  const innerSegments = splitShellCommands(innerCmd);
  if (options.strict && isUnparseableCommand(innerCmd, innerSegments)) {
    steps.push({
      type: "strict-unparseable",
      rawCommand: redactEnvAssignmentsInString(innerCmd),
      reason: REASON_STRICT_UNPARSEABLE2
    });
    return { reason: REASON_STRICT_UNPARSEABLE2 };
  }
  let effectiveCwd = options.effectiveCwd === undefined ? options.cwd : options.effectiveCwd;
  for (const segment of innerSegments) {
    if (segment.length === 1 && segment[0]?.includes(" ")) {
      const textReason = dangerousInText(segment[0]);
      if (textReason) {
        steps.push({
          type: "dangerous-text",
          token: redactEnvAssignmentsInString(segment[0]),
          matched: true,
          reason: textReason
        });
        return { reason: textReason };
      }
      steps.push({
        type: "dangerous-text",
        token: redactEnvAssignmentsInString(segment[0]),
        matched: false
      });
      if (segmentChangesCwd(segment)) {
        steps.push({
          type: "cwd-change",
          segment: redactEnvAssignmentsInString(segment.join(" ")),
          effectiveCwdNowUnknown: true
        });
        effectiveCwd = null;
      }
      continue;
    }
    const result = explainSegment(segment, depth + 1, { ...options, effectiveCwd }, steps);
    if (result)
      return result;
    if (segmentChangesCwd(segment)) {
      steps.push({
        type: "cwd-change",
        segment: redactEnvAssignmentsInString(segment.join(" ")),
        effectiveCwdNowUnknown: true
      });
      effectiveCwd = null;
    }
  }
  return null;
}
function explainSegment(tokens, depth, options, steps) {
  if (depth >= MAX_RECURSION_DEPTH) {
    steps.push({
      type: "error",
      message: REASON_RECURSION_LIMIT
    });
    return { reason: REASON_RECURSION_LIMIT };
  }
  const envResult = stripEnvAssignmentsWithInfo(tokens);
  if (envResult.envAssignments.size > 0) {
    steps.push({
      type: "env-strip",
      input: redactEnvAssignmentTokens(tokens),
      envVars: redactEnvVars(envResult.envAssignments),
      output: envResult.tokens
    });
  }
  const wrapperResult = stripWrappersWithInfo(envResult.tokens);
  const removed = envResult.tokens.slice(0, envResult.tokens.length - wrapperResult.tokens.length);
  if (removed.length > 0) {
    steps.push({
      type: "leading-tokens-stripped",
      input: redactEnvAssignmentTokens(envResult.tokens),
      removed: redactEnvAssignmentTokens(removed),
      output: wrapperResult.tokens
    });
  }
  const strippedTokens = wrapperResult.tokens;
  if (strippedTokens.length === 0) {
    return null;
  }
  const head = strippedTokens[0];
  if (!head)
    return null;
  const baseName = head.split("/").pop() ?? head;
  const baseNameLower = baseName.toLowerCase();
  if (SHELL_WRAPPERS.has(baseNameLower)) {
    const innerCmd = extractDashCArg(strippedTokens);
    if (innerCmd) {
      const redactedInnerCmd = redactEnvAssignmentsInString(innerCmd);
      steps.push({
        type: "shell-wrapper",
        wrapper: baseNameLower,
        innerCommand: redactedInnerCmd
      });
      steps.push({
        type: "recurse",
        reason: "shell-wrapper",
        innerCommand: redactedInnerCmd,
        depth: depth + 1
      });
      return explainInnerSegments(innerCmd, depth, options, steps);
    }
  }
  if (INTERPRETERS.has(baseNameLower)) {
    const codeArg = extractInterpreterCodeArg(strippedTokens);
    if (codeArg) {
      const paranoidBlocked = !!options.paranoidInterpreters;
      const redactedCodeArg = redactEnvAssignmentsInString(codeArg);
      steps.push({
        type: "interpreter",
        interpreter: baseNameLower,
        codeArg: redactedCodeArg,
        paranoidBlocked
      });
      if (paranoidBlocked) {
        return { reason: REASON_INTERPRETER_BLOCKED + PARANOID_INTERPRETERS_SUFFIX };
      }
      steps.push({
        type: "recurse",
        reason: "interpreter",
        innerCommand: redactedCodeArg,
        depth: depth + 1
      });
      const nestedResult = explainInnerSegments(codeArg, depth, options, steps);
      if (nestedResult)
        return nestedResult;
      if (containsDangerousCode(codeArg)) {
        steps.push({
          type: "dangerous-text",
          token: redactedCodeArg,
          matched: true,
          reason: REASON_INTERPRETER_DANGEROUS
        });
        return { reason: REASON_INTERPRETER_DANGEROUS };
      }
      return null;
    }
  }
  if (baseNameLower === "busybox" && strippedTokens.length > 1) {
    const subcommand = strippedTokens[1] ?? "unknown";
    steps.push({
      type: "busybox",
      subcommand
    });
    const busyboxInnerCmd = strippedTokens.slice(1).join(" ");
    steps.push({
      type: "recurse",
      reason: "busybox",
      innerCommand: redactEnvAssignmentsInString(busyboxInnerCmd),
      depth: depth + 1
    });
    return explainSegment(strippedTokens.slice(1), depth + 1, options, steps);
  }
  const envAssignments = new Map(envResult.envAssignments);
  for (const [k, v] of wrapperResult.envAssignments) {
    envAssignments.set(k, v);
  }
  const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);
  const tmpdirValue = envAssignments.get("TMPDIR") ?? process.env.TMPDIR ?? null;
  const effectiveCwd = options.effectiveCwd === undefined ? options.cwd : options.effectiveCwd;
  const cwdUnknown = effectiveCwd === null;
  const cwdForRm = cwdUnknown ? undefined : effectiveCwd ?? options.cwd;
  const originalCwd = cwdUnknown ? undefined : options.cwd;
  const isGit = baseNameLower === "git";
  const isRm = baseName === "rm";
  const isFind = baseName === "find";
  const isXargs = baseName === "xargs";
  const isParallel = baseName === "parallel";
  if (isRm || isXargs || isParallel) {
    steps.push({
      type: "tmpdir-check",
      tmpdirValue,
      isOverriddenToNonTemp: !allowTmpdirVar,
      allowTmpdirVar
    });
  }
  if (isGit) {
    const reason = analyzeGit(strippedTokens);
    steps.push({
      type: "rule-check",
      ruleModule: "rules-git.ts",
      ruleFunction: "analyzeGit",
      matched: !!reason,
      reason: reason ?? undefined
    });
    if (reason)
      return { reason };
  }
  if (isRm) {
    if (effectiveCwd && isHomeDirectory(effectiveCwd) && hasRecursiveForceFlags(strippedTokens)) {
      const reason2 = "rm -rf in home directory is dangerous. Change to a project directory first.";
      steps.push({
        type: "rule-check",
        ruleModule: "rules-rm.ts",
        ruleFunction: "isHomeDirectory",
        matched: true,
        reason: reason2
      });
      return { reason: reason2 };
    }
    const reason = analyzeRm(strippedTokens, {
      cwd: effectiveCwd ?? undefined,
      paranoid: options.paranoidRm,
      allowTmpdirVar
    });
    steps.push({
      type: "rule-check",
      ruleModule: "rules-rm.ts",
      ruleFunction: "analyzeRm",
      matched: !!reason,
      reason: reason ?? undefined
    });
    if (reason)
      return { reason };
  }
  if (isFind) {
    const reason = analyzeFind(strippedTokens);
    steps.push({
      type: "rule-check",
      ruleModule: "analyze/find.ts",
      ruleFunction: "analyzeFind",
      matched: !!reason,
      reason: reason ?? undefined
    });
    if (reason)
      return { reason };
  }
  if (isXargs) {
    const reason = analyzeXargs(strippedTokens, {
      cwd: cwdForRm,
      originalCwd,
      paranoidRm: options.paranoidRm,
      allowTmpdirVar
    });
    steps.push({
      type: "rule-check",
      ruleModule: "analyze/xargs.ts",
      ruleFunction: "analyzeXargs",
      matched: !!reason,
      reason: reason ?? undefined
    });
    if (reason)
      return { reason };
  }
  if (isParallel) {
    const analyzeNested = (cmd) => {
      const result = explainInnerSegments(cmd, depth, options, steps);
      return result?.reason ?? null;
    };
    const reason = analyzeParallel(strippedTokens, {
      cwd: cwdForRm,
      originalCwd,
      paranoidRm: options.paranoidRm,
      allowTmpdirVar,
      analyzeNested
    });
    steps.push({
      type: "rule-check",
      ruleModule: "analyze/parallel.ts",
      ruleFunction: "analyzeParallel",
      matched: !!reason,
      reason: reason ?? undefined
    });
    if (reason)
      return { reason };
  }
  const matchedKnown = isGit || isRm || isFind || isXargs || isParallel;
  const tokensScanned = [];
  let fallbackReason = null;
  let embeddedCommandFound;
  if (!matchedKnown && !DISPLAY_COMMANDS.has(normalizeCommandToken(head))) {
    for (let i = 1;i < strippedTokens.length && !fallbackReason; i++) {
      const token = strippedTokens[i];
      if (!token)
        continue;
      tokensScanned.push(token);
      const cmd = normalizeCommandToken(token);
      if (cmd === "rm") {
        embeddedCommandFound = "rm";
        const rmTokens = ["rm", ...strippedTokens.slice(i + 1)];
        fallbackReason = analyzeRm(rmTokens, {
          cwd: cwdForRm,
          originalCwd,
          paranoid: options.paranoidRm,
          allowTmpdirVar
        });
      }
      if (!fallbackReason && cmd === "git") {
        embeddedCommandFound = "git";
        const gitTokens = ["git", ...strippedTokens.slice(i + 1)];
        fallbackReason = analyzeGit(gitTokens);
      }
      if (!fallbackReason && cmd === "find") {
        embeddedCommandFound = "find";
        const findTokens = ["find", ...strippedTokens.slice(i + 1)];
        fallbackReason = analyzeFind(findTokens);
      }
    }
  }
  steps.push({
    type: "fallback-scan",
    tokensScanned,
    embeddedCommandFound
  });
  if (fallbackReason)
    return { reason: fallbackReason };
  const shouldCheckCustomRules = depth === 0 || !matchedKnown;
  const hasRules = options.config?.rules && options.config.rules.length > 0;
  if (shouldCheckCustomRules && hasRules && options.config) {
    const customResult = checkCustomRules(strippedTokens, options.config.rules);
    steps.push({
      type: "custom-rules-check",
      rulesChecked: true,
      matched: !!customResult,
      reason: customResult ?? undefined
    });
    if (customResult)
      return { reason: customResult };
  } else {
    steps.push({
      type: "custom-rules-check",
      rulesChecked: false,
      matched: false
    });
  }
  return null;
}

// src/bin/explain/analyze.ts
function explainCommand2(command, options) {
  const trace = { steps: [], segments: [] };
  const analyzeOpts = buildAnalyzeOptions(options);
  const { configSource, configValid } = getConfigSource({ cwd: options?.cwd });
  if (!command || !command.trim()) {
    trace.steps.push({ type: "error", message: "No command provided" });
    return {
      trace,
      result: "allowed",
      configSource,
      configValid
    };
  }
  const segments = splitShellCommands(command);
  const redactedInput = command.replace(/\b([A-Za-z_][A-Za-z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)/g, "$1=<redacted>");
  const redactedSegments = segments.map((seg) => redactEnvAssignmentTokens(seg));
  trace.steps.push({
    type: "parse",
    input: redactedInput,
    segments: redactedSegments
  });
  if (analyzeOpts.strict && isUnparseableCommand(command, segments)) {
    trace.steps.push({
      type: "strict-unparseable",
      rawCommand: redactedInput,
      reason: REASON_STRICT_UNPARSEABLE2
    });
    return {
      trace,
      result: "blocked",
      reason: REASON_STRICT_UNPARSEABLE2,
      segment: redactEnvAssignmentsInString(command),
      configSource,
      configValid
    };
  }
  let blocked = false;
  let blockReason;
  let blockSegment;
  let effectiveCwd = analyzeOpts.effectiveCwd;
  for (let i = 0;i < segments.length; i++) {
    const segment = segments[i];
    if (!segment)
      continue;
    const segmentSteps = [];
    if (blocked) {
      segmentSteps.push({
        type: "segment-skipped",
        index: i,
        reason: "prior-segment-blocked"
      });
      trace.segments.push({ index: i, steps: segmentSteps });
      continue;
    }
    if (segment.length === 1 && segment[0]?.includes(" ")) {
      const textReason = dangerousInText(segment[0]);
      if (textReason) {
        segmentSteps.push({
          type: "dangerous-text",
          token: redactEnvAssignmentsInString(segment[0]),
          matched: true,
          reason: textReason
        });
        trace.segments.push({ index: i, steps: segmentSteps });
        blocked = true;
        blockReason = textReason;
        blockSegment = redactEnvAssignmentsInString(segment.join(" "));
        continue;
      }
      segmentSteps.push({
        type: "dangerous-text",
        token: redactEnvAssignmentsInString(segment[0]),
        matched: false
      });
      if (segmentChangesCwd(segment)) {
        segmentSteps.push({
          type: "cwd-change",
          segment: redactEnvAssignmentsInString(segment.join(" ")),
          effectiveCwdNowUnknown: true
        });
        effectiveCwd = null;
      }
      trace.segments.push({ index: i, steps: segmentSteps });
      continue;
    }
    const result = explainSegment(segment, 0, { ...analyzeOpts, effectiveCwd }, segmentSteps);
    if (result) {
      blocked = true;
      blockReason = result.reason;
      blockSegment = redactEnvAssignmentsInString(segment.join(" "));
    }
    if (segmentChangesCwd(segment)) {
      segmentSteps.push({
        type: "cwd-change",
        segment: redactEnvAssignmentsInString(segment.join(" ")),
        effectiveCwdNowUnknown: true
      });
      effectiveCwd = null;
    }
    trace.segments.push({ index: i, steps: segmentSteps });
  }
  return {
    trace,
    result: blocked ? "blocked" : "allowed",
    reason: blockReason,
    segment: blockSegment,
    configSource,
    configValid
  };
}
// src/bin/explain/flags.ts
function parseExplainFlags(args) {
  let json = false;
  let cwd;
  const remaining = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      i++;
      continue;
    }
    if (arg === "--") {
      remaining.push(...args.slice(i + 1));
      break;
    }
    if (!arg?.startsWith("--")) {
      remaining.push(...args.slice(i));
      break;
    }
    if (arg === "--json") {
      json = true;
      i++;
    } else if (arg === "--cwd") {
      i++;
      if (i >= args.length || args[i]?.startsWith("--")) {
        console.error("Error: --cwd requires a path");
        return null;
      }
      cwd = args[i];
      i++;
    } else {
      remaining.push(...args.slice(i));
      break;
    }
  }
  const command = remaining.length === 1 ? remaining[0] : $quote(remaining);
  if (!command) {
    console.error("Error: No command provided");
    console.error("Usage: cc-safety-net explain [--json] [--cwd <path>] <command>");
    return null;
  }
  return { json, cwd, command };
}
// src/bin/explain/format-helpers.ts
function getBoxChars(asciiOnly) {
  if (asciiOnly) {
    return {
      dh: "=",
      dv: "|",
      dtl: "+",
      dtr: "+",
      dbl: "+",
      dbr: "+",
      h: "-",
      v: "|",
      tl: "+",
      tr: "+",
      bl: "+",
      br: "+",
      sh: "="
    };
  }
  return {
    dh: "═",
    dv: "║",
    dtl: "╔",
    dtr: "╗",
    dbl: "╚",
    dbr: "╝",
    h: "─",
    v: "│",
    tl: "┌",
    tr: "┐",
    bl: "└",
    br: "┘",
    sh: "━"
  };
}
function formatHeader(box, width) {
  const title = "  Command Analysis";
  const padding = width - title.length;
  return [
    `${box.dtl}${box.dh.repeat(width)}${box.dtr}`,
    `${box.dv}${title}${" ".repeat(padding)}${box.dv}`,
    `${box.dbl}${box.dh.repeat(width)}${box.dbr}`
  ];
}
function formatTokenArray(tokens) {
  return JSON.stringify(tokens);
}
function formatColoredTokenArray(tokens, seed = 0) {
  const coloredTokens = tokens.map((token, index) => colorizeToken(token, index, seed));
  return `[${coloredTokens.join(",")}]`;
}
function wrapReason(reason, indent, maxWidth = 70) {
  const words = reason.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current)
    lines.push(current);
  return lines.map((line, i) => i === 0 ? line : `${indent}${line}`);
}
function formatStepStyleD(step, stepNum, box) {
  const lines = [];
  switch (step.type) {
    case "parse":
      return null;
    case "env-strip": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Strip environment variables`);
      const envKeys = Object.keys(step.envVars);
      lines.push(`  Removed: ${envKeys.map((k) => `${k}=<redacted>`).join(", ")}`);
      lines.push(`  Tokens:  ${formatTokenArray(step.output)}`);
      return { lines, incrementStep: true };
    }
    case "leading-tokens-stripped": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Strip wrappers`);
      lines.push(`  Removed: ${step.removed.join(", ")}`);
      lines.push(`  Tokens:  ${formatTokenArray(step.output)}`);
      return { lines, incrementStep: true };
    }
    case "shell-wrapper": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Detect shell wrapper`);
      lines.push(`  Wrapper: ${step.wrapper} -c`);
      lines.push(`  Inner:   ${step.innerCommand}`);
      return { lines, incrementStep: true };
    }
    case "interpreter": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Detect interpreter`);
      lines.push(`  Interpreter: ${step.interpreter}`);
      lines.push(`  Code:        ${step.codeArg}`);
      if (step.paranoidBlocked) {
        lines.push(`  Result:      ✗ BLOCKED (paranoid mode)`);
      }
      return { lines, incrementStep: true };
    }
    case "busybox": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Busybox wrapper`);
      lines.push(`  Subcommand: ${step.subcommand}`);
      return { lines, incrementStep: true };
    }
    case "recurse":
      return { lines: [], incrementStep: false };
    case "rule-check": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Match rules`);
      const ruleRef = `${step.ruleModule}:${step.ruleFunction}()`;
      lines.push(`  Rule:   ${ruleRef}`);
      if (step.matched) {
        lines.push(`  Result: MATCHED`);
      } else {
        lines.push(`  Result: No match`);
      }
      return { lines, incrementStep: true };
    }
    case "tmpdir-check":
      return null;
    case "fallback-scan": {
      if (step.embeddedCommandFound) {
        lines.push("");
        lines.push(`STEP ${stepNum} ${box.h} Fallback scan`);
        lines.push(`  Found: ${step.embeddedCommandFound}`);
        return { lines, incrementStep: true };
      }
      return null;
    }
    case "custom-rules-check": {
      if (step.rulesChecked) {
        lines.push("");
        lines.push(`STEP ${stepNum} ${box.h} Custom rules`);
        if (step.matched) {
          lines.push(`  Result: MATCHED`);
        } else {
          lines.push(`  Result: No match`);
        }
        return { lines, incrementStep: true };
      }
      return null;
    }
    case "cwd-change":
      return null;
    case "dangerous-text": {
      if (step.matched) {
        lines.push("");
        lines.push(`STEP ${stepNum} ${box.h} Dangerous text check`);
        lines.push(`  Token:  ${step.token}`);
        lines.push(`  Result: MATCHED`);
        return { lines, incrementStep: true };
      }
      return null;
    }
    case "strict-unparseable": {
      lines.push("");
      lines.push(`STEP ${stepNum} ${box.h} Strict mode check`);
      lines.push(`  Command: ${step.rawCommand}`);
      lines.push(`  Result:  ✗ UNPARSEABLE`);
      return { lines, incrementStep: true };
    }
    case "segment-skipped":
      return null;
    case "error": {
      lines.push("");
      lines.push(`ERROR: ${step.message}`);
      return { lines, incrementStep: false };
    }
    default:
      return null;
  }
}

// src/bin/explain/format.ts
function formatTraceHuman(result, options) {
  const box = getBoxChars(options?.asciiOnly ?? false);
  const width = 58;
  const lines = [];
  let stepNum = 1;
  lines.push(...formatHeader(box, width));
  lines.push("");
  const errorStep = result.trace.steps.find((s) => s.type === "error");
  if (errorStep && errorStep.type === "error") {
    lines.push("ERROR");
    lines.push(`  ${errorStep.message}`);
    lines.push("");
    lines.push("RESULT");
    lines.push(`  Status: ${result.result === "blocked" ? colors.red("BLOCKED") : colors.green("ALLOWED")}`);
    lines.push("");
    lines.push("CONFIG");
    const configPath2 = result.configSource ?? "none";
    lines.push(`  Path: ${configPath2}`);
    return lines.join(`
`);
  }
  const parseStep = result.trace.steps.find((s) => s.type === "parse");
  if (parseStep && parseStep.type === "parse") {
    lines.push("INPUT");
    lines.push(`  ${parseStep.input}`);
    lines.push("");
    lines.push(`STEP ${stepNum} ${box.h} Split shell commands`);
    stepNum++;
    for (let i = 0;i < parseStep.segments.length; i++) {
      const seg = parseStep.segments[i];
      if (seg) {
        const seed = Math.random();
        lines.push(`  Segment ${i + 1}: ${formatColoredTokenArray(seg, seed)}`);
      }
    }
  }
  const segments = result.trace.segments;
  const hasMultipleSegments = segments.length > 1;
  for (const seg of segments) {
    if (hasMultipleSegments) {
      lines.push("");
      let segCommand = "";
      if (parseStep && parseStep.type === "parse") {
        const tokens = parseStep.segments[seg.index];
        if (tokens) {
          segCommand = tokens.join(" ");
        }
      }
      const maxLabelLen = width - 4;
      let displayCommand = segCommand;
      const baseLabel = ` Segment ${seg.index + 1}: `;
      const suffix = " ";
      if (segCommand) {
        const totalLen = baseLabel.length + segCommand.length + suffix.length;
        if (totalLen > maxLabelLen) {
          const availableForCmd = maxLabelLen - baseLabel.length - suffix.length;
          displayCommand = `${segCommand.substring(0, availableForCmd - 1)}…`;
        }
      }
      const labelContent = segCommand ? `${baseLabel}${displayCommand}${suffix}` : ` Segment ${seg.index + 1} `;
      const coloredContent = segCommand ? `${baseLabel}${colors.cyan(displayCommand)}${suffix}` : labelContent;
      const segLineLen = width - labelContent.length;
      const leftLen = Math.floor(segLineLen / 2);
      const rightLen = segLineLen - leftLen;
      lines.push(`${box.sh.repeat(leftLen)}${coloredContent}${box.sh.repeat(rightLen)}`);
    }
    const skippedStep = seg.steps.find((s) => s.type === "segment-skipped");
    if (skippedStep) {
      lines.push("");
      lines.push("  (skipped — prior segment blocked)");
      continue;
    }
    let inRecursion = false;
    let hasVisibleSteps = false;
    for (const step of seg.steps) {
      const formattedStep = formatStepStyleD(step, stepNum, box);
      if (formattedStep) {
        hasVisibleSteps = true;
        if (step.type === "recurse") {
          lines.push("");
          const recurseLabel = " RECURSING ";
          const recurseLineLen = width - recurseLabel.length - 4;
          lines.push(`  ${box.tl}${box.h}${recurseLabel}${box.h.repeat(recurseLineLen)}`);
          lines.push(`  ${box.v}`);
          inRecursion = true;
          continue;
        }
        for (const line of formattedStep.lines) {
          if (inRecursion) {
            lines.push(`  ${box.v} ${line}`);
          } else {
            lines.push(line);
          }
        }
        if (formattedStep.incrementStep) {
          stepNum++;
        }
      }
    }
    if (inRecursion) {
      lines.push(`  ${box.v}`);
      lines.push(`  ${box.bl}${box.h.repeat(width - 2)}`);
      inRecursion = false;
    }
    if (!hasVisibleSteps) {
      lines.push("");
      lines.push(`  ${colors.green("✓")} Allowed (no matching rules)`);
    }
  }
  lines.push("");
  lines.push("RESULT");
  if (result.result === "blocked") {
    lines.push(`  Status: ${colors.red("BLOCKED")}`);
    if (result.reason) {
      const reasonLines = wrapReason(result.reason, "          ");
      lines.push(`  Reason: ${reasonLines[0]}`);
      for (let i = 1;i < reasonLines.length; i++) {
        lines.push(reasonLines[i] ?? "");
      }
    }
  } else {
    lines.push(`  Status: ${colors.green("ALLOWED")}`);
  }
  lines.push("");
  lines.push("CONFIG");
  const configPath = result.configSource ?? "none";
  const configStatus = result.configValid ? "" : " (invalid)";
  lines.push(`  Path: ${configPath}${configStatus}`);
  return lines.join(`
`);
}
function formatTraceJson(result) {
  return JSON.stringify(result, null, 2);
}
// src/bin/help.ts
var version = "0.7.0";
var INDENT = "  ";
var PROGRAM_NAME = "cc-safety-net";
function formatOptionFlags(option) {
  return option.argument ? `${option.flags} ${option.argument}` : option.flags;
}
function getOptionsColumnWidth(options) {
  return Math.max(...options.map((opt) => formatOptionFlags(opt).length));
}
function formatCommandSummary(cmd, maxUsageWidth) {
  const usage = `${PROGRAM_NAME} ${cmd.usage}`;
  return `${INDENT}${usage.padEnd(maxUsageWidth + PROGRAM_NAME.length + 3)}${cmd.description}`;
}
function printCommandHelp(command) {
  const lines = [];
  lines.push(`${PROGRAM_NAME} ${command.name}`);
  lines.push("");
  lines.push(`${INDENT}${command.description}`);
  lines.push("");
  lines.push("USAGE:");
  lines.push(`${INDENT}${PROGRAM_NAME} ${command.usage}`);
  lines.push("");
  if (command.options.length > 0) {
    lines.push("OPTIONS:");
    const optWidth = getOptionsColumnWidth(command.options);
    for (const opt of command.options) {
      const flags = formatOptionFlags(opt);
      lines.push(`${INDENT}${flags.padEnd(optWidth + 2)}${opt.description}`);
    }
    lines.push("");
  }
  if (command.examples && command.examples.length > 0) {
    lines.push("EXAMPLES:");
    for (const example of command.examples) {
      lines.push(`${INDENT}${example}`);
    }
  }
  console.log(lines.join(`
`));
}
function printHelp() {
  const visibleCommands = getVisibleCommands();
  const maxUsageWidth = Math.max(...visibleCommands.map((cmd) => cmd.usage.length));
  const lines = [];
  lines.push(`${PROGRAM_NAME} v${version}`);
  lines.push("");
  lines.push("Blocks destructive git and filesystem commands before execution.");
  lines.push("");
  lines.push("COMMANDS:");
  for (const cmd of visibleCommands) {
    lines.push(formatCommandSummary(cmd, maxUsageWidth));
  }
  lines.push("");
  lines.push("GLOBAL OPTIONS:");
  lines.push(`${INDENT}-h, --help       Show help (use with command for command-specific help)`);
  lines.push(`${INDENT}-V, --version    Show version`);
  lines.push("");
  lines.push("HELP:");
  lines.push(`${INDENT}${PROGRAM_NAME} help <command>     Show help for a specific command`);
  lines.push(`${INDENT}${PROGRAM_NAME} <command> --help   Show help for a specific command`);
  lines.push("");
  lines.push("ENVIRONMENT VARIABLES:");
  lines.push(`${INDENT}SAFETY_NET_STRICT=1               Fail-closed on unparseable commands`);
  lines.push(`${INDENT}SAFETY_NET_PARANOID=1             Enable all paranoid checks`);
  lines.push(`${INDENT}SAFETY_NET_PARANOID_RM=1          Block non-temp rm -rf within cwd`);
  lines.push(`${INDENT}SAFETY_NET_PARANOID_INTERPRETERS=1  Block interpreter one-liners`);
  lines.push("");
  lines.push("CONFIG FILES:");
  lines.push(`${INDENT}~/.cc-safety-net/config.json      User-scope config`);
  lines.push(`${INDENT}.safety-net.json                  Project-scope config`);
  console.log(lines.join(`
`));
}
function printVersion() {
  console.log(version);
}
function showCommandHelp(commandName) {
  const command = findCommand(commandName);
  if (!command) {
    return false;
  }
  printCommandHelp(command);
  return true;
}

// src/core/audit.ts
import { appendFileSync, existsSync as existsSync6, mkdirSync } from "node:fs";
import { homedir as homedir5 } from "node:os";
import { join as join4 } from "node:path";
function sanitizeSessionIdForFilename(sessionId) {
  const raw = sessionId.trim();
  if (!raw) {
    return null;
  }
  let safe = raw.replace(/[^A-Za-z0-9_.-]+/g, "_");
  safe = safe.replace(/^[._-]+|[._-]+$/g, "").slice(0, 128);
  if (!safe || safe === "." || safe === "..") {
    return null;
  }
  return safe;
}
function writeAuditLog(sessionId, command, segment, reason, cwd, options = {}) {
  const safeSessionId = sanitizeSessionIdForFilename(sessionId);
  if (!safeSessionId) {
    return;
  }
  const home = options.homeDir ?? homedir5();
  const logsDir = join4(home, ".cc-safety-net", "logs");
  try {
    if (!existsSync6(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    const logFile = join4(logsDir, `${safeSessionId}.jsonl`);
    const entry = {
      ts: new Date().toISOString(),
      command: redactSecrets(command).slice(0, 300),
      segment: redactSecrets(segment).slice(0, 300),
      reason,
      cwd
    };
    appendFileSync(logFile, `${JSON.stringify(entry)}
`, "utf-8");
  } catch {}
}
function redactSecrets(text) {
  let result = text;
  result = result.replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|KEY|CREDENTIALS)[A-Z0-9_]*)=([^\s]+)/gi, "$1=<redacted>");
  result = result.replace(/(['"]?\s*authorization\s*:\s*)([^'"]+)(['"]?)/gi, "$1<redacted>$3");
  result = result.replace(/(authorization\s*:\s*)([^\s"']+)(\s+[^\s"']+)?/gi, "$1<redacted>");
  result = result.replace(/(https?:\/\/)([^\s/:@]+):([^\s@]+)@/gi, "$1<redacted>:<redacted>@");
  result = result.replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "<redacted>");
  return result;
}

// src/core/format.ts
function formatBlockedMessage(input) {
  const { reason, command, segment } = input;
  const maxLen = input.maxLen ?? 200;
  const redact = input.redact ?? ((t) => t);
  let message = `BLOCKED by Safety Net

Reason: ${reason}`;
  if (command) {
    const safeCommand = redact(command);
    message += `

Command: ${excerpt(safeCommand, maxLen)}`;
  }
  if (segment && segment !== command) {
    const safeSegment = redact(segment);
    message += `

Segment: ${excerpt(safeSegment, maxLen)}`;
  }
  message += `

If this operation is truly needed, ask the user for explicit permission and have them run the command manually.`;
  return message;
}
function excerpt(text, maxLen) {
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

// src/bin/hooks/claude-code.ts
function outputDeny(reason, command, segment) {
  const message = formatBlockedMessage({
    reason,
    command,
    segment,
    redact: redactSecrets
  });
  const output = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: message
    }
  };
  console.log(JSON.stringify(output));
}
async function runClaudeCodeHook() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const inputText = Buffer.concat(chunks).toString("utf-8").trim();
  if (!inputText) {
    return;
  }
  let input;
  try {
    input = JSON.parse(inputText);
  } catch {
    if (envTruthy("SAFETY_NET_STRICT")) {
      outputDeny("Failed to parse hook input JSON (strict mode)");
    }
    return;
  }
  if (input.tool_name !== "Bash") {
    return;
  }
  const command = input.tool_input?.command;
  if (!command) {
    return;
  }
  const cwd = input.cwd ?? process.cwd();
  const strict = envTruthy("SAFETY_NET_STRICT");
  const paranoidAll = envTruthy("SAFETY_NET_PARANOID");
  const paranoidRm = paranoidAll || envTruthy("SAFETY_NET_PARANOID_RM");
  const paranoidInterpreters = paranoidAll || envTruthy("SAFETY_NET_PARANOID_INTERPRETERS");
  const config = loadConfig(cwd);
  const result = analyzeCommand(command, {
    cwd,
    config,
    strict,
    paranoidRm,
    paranoidInterpreters
  });
  if (result) {
    const sessionId = input.session_id;
    if (sessionId) {
      writeAuditLog(sessionId, command, result.segment, result.reason, cwd);
    }
    outputDeny(result.reason, command, result.segment);
  }
}

// src/bin/hooks/copilot-cli.ts
function outputCopilotDeny(reason, command, segment) {
  const message = formatBlockedMessage({
    reason,
    command,
    segment,
    redact: redactSecrets
  });
  const output = {
    permissionDecision: "deny",
    permissionDecisionReason: message
  };
  console.log(JSON.stringify(output));
}
async function runCopilotCliHook() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const inputText = Buffer.concat(chunks).toString("utf-8").trim();
  if (!inputText) {
    return;
  }
  let input;
  try {
    input = JSON.parse(inputText);
  } catch {
    if (envTruthy("SAFETY_NET_STRICT")) {
      outputCopilotDeny("Failed to parse hook input JSON (strict mode)");
    }
    return;
  }
  if (input.toolName !== "bash") {
    return;
  }
  let toolArgs;
  try {
    toolArgs = JSON.parse(input.toolArgs);
  } catch {
    if (envTruthy("SAFETY_NET_STRICT")) {
      outputCopilotDeny("Failed to parse toolArgs JSON (strict mode)");
    }
    return;
  }
  const command = toolArgs.command;
  if (!command) {
    return;
  }
  const cwd = input.cwd ?? process.cwd();
  const strict = envTruthy("SAFETY_NET_STRICT");
  const paranoidAll = envTruthy("SAFETY_NET_PARANOID");
  const paranoidRm = paranoidAll || envTruthy("SAFETY_NET_PARANOID_RM");
  const paranoidInterpreters = paranoidAll || envTruthy("SAFETY_NET_PARANOID_INTERPRETERS");
  const config = loadConfig(cwd);
  const result = analyzeCommand(command, {
    cwd,
    config,
    strict,
    paranoidRm,
    paranoidInterpreters
  });
  if (result) {
    const sessionId = `copilot-${input.timestamp ?? Date.now()}`;
    writeAuditLog(sessionId, command, result.segment, result.reason, cwd);
    outputCopilotDeny(result.reason, command, result.segment);
  }
}

// src/bin/hooks/gemini-cli.ts
function outputGeminiDeny(reason, command, segment) {
  const message = formatBlockedMessage({
    reason,
    command,
    segment,
    redact: redactSecrets
  });
  const output = {
    decision: "deny",
    reason: message,
    systemMessage: message
  };
  console.log(JSON.stringify(output));
}
async function runGeminiCLIHook() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const inputText = Buffer.concat(chunks).toString("utf-8").trim();
  if (!inputText) {
    return;
  }
  let input;
  try {
    input = JSON.parse(inputText);
  } catch {
    if (envTruthy("SAFETY_NET_STRICT")) {
      outputGeminiDeny("Failed to parse hook input JSON (strict mode)");
    }
    return;
  }
  if (input.hook_event_name !== "BeforeTool") {
    return;
  }
  if (input.tool_name !== "run_shell_command") {
    return;
  }
  const command = input.tool_input?.command;
  if (!command) {
    return;
  }
  const cwd = input.cwd ?? process.cwd();
  const strict = envTruthy("SAFETY_NET_STRICT");
  const paranoidAll = envTruthy("SAFETY_NET_PARANOID");
  const paranoidRm = paranoidAll || envTruthy("SAFETY_NET_PARANOID_RM");
  const paranoidInterpreters = paranoidAll || envTruthy("SAFETY_NET_PARANOID_INTERPRETERS");
  const config = loadConfig(cwd);
  const result = analyzeCommand(command, {
    cwd,
    config,
    strict,
    paranoidRm,
    paranoidInterpreters
  });
  if (result) {
    const sessionId = input.session_id;
    if (sessionId) {
      writeAuditLog(sessionId, command, result.segment, result.reason, cwd);
    }
    outputGeminiDeny(result.reason, command, result.segment);
  }
}

// src/bin/statusline.ts
import { existsSync as existsSync7, readFileSync as readFileSync5 } from "node:fs";
import { homedir as homedir6 } from "node:os";
import { join as join5 } from "node:path";
async function readStdinAsync() {
  if (process.stdin.isTTY) {
    return null;
  }
  return new Promise((resolve4) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      const trimmed = data.trim();
      resolve4(trimmed || null);
    });
    process.stdin.on("error", () => {
      resolve4(null);
    });
  });
}
function getSettingsPath() {
  if (process.env.CLAUDE_SETTINGS_PATH) {
    return process.env.CLAUDE_SETTINGS_PATH;
  }
  return join5(homedir6(), ".claude", "settings.json");
}
function isPluginEnabled() {
  const settingsPath = getSettingsPath();
  if (!existsSync7(settingsPath)) {
    return false;
  }
  try {
    const content = readFileSync5(settingsPath, "utf-8");
    const settings = JSON.parse(content);
    if (!settings.enabledPlugins) {
      return false;
    }
    const pluginKey = "safety-net@cc-marketplace";
    if (!(pluginKey in settings.enabledPlugins)) {
      return false;
    }
    return settings.enabledPlugins[pluginKey] === true;
  } catch {
    return false;
  }
}
async function printStatusline() {
  const enabled = isPluginEnabled();
  let status;
  if (!enabled) {
    status = "\uD83D\uDEE1️ Safety Net ❌";
  } else {
    const strict = envTruthy("SAFETY_NET_STRICT");
    const paranoidAll = envTruthy("SAFETY_NET_PARANOID");
    const paranoidRm = paranoidAll || envTruthy("SAFETY_NET_PARANOID_RM");
    const paranoidInterpreters = paranoidAll || envTruthy("SAFETY_NET_PARANOID_INTERPRETERS");
    let modeEmojis = "";
    if (strict) {
      modeEmojis += "\uD83D\uDD12";
    }
    if (paranoidAll || paranoidRm && paranoidInterpreters) {
      modeEmojis += "\uD83D\uDC41️";
    } else if (paranoidRm) {
      modeEmojis += "\uD83D\uDDD1️";
    } else if (paranoidInterpreters) {
      modeEmojis += "\uD83D\uDC1A";
    }
    const statusEmoji = modeEmojis || "✅";
    status = `\uD83D\uDEE1️ Safety Net ${statusEmoji}`;
  }
  const stdinInput = await readStdinAsync();
  if (stdinInput && !stdinInput.startsWith("{")) {
    console.log(`${stdinInput} | ${status}`);
  } else {
    console.log(status);
  }
}

// src/bin/verify-config.ts
import { existsSync as existsSync8, readFileSync as readFileSync6, writeFileSync } from "node:fs";
import { resolve as resolve4 } from "node:path";
var HEADER = "Safety Net Config";
var SEPARATOR = "═".repeat(HEADER.length);
var SCHEMA_URL = "https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json";
function printHeader() {
  console.log(HEADER);
  console.log(SEPARATOR);
}
function printValidConfig(scope, path, result) {
  console.log(`
✓ ${scope} config: ${path}`);
  if (result.ruleNames.size > 0) {
    console.log("  Rules:");
    let i = 1;
    for (const name of result.ruleNames) {
      console.log(`    ${i}. ${name}`);
      i++;
    }
  } else {
    console.log("  Rules: (none)");
  }
}
function printInvalidConfig(scope, path, errors) {
  console.error(`
✗ ${scope} config: ${path}`);
  console.error("  Errors:");
  let errorNum = 1;
  for (const error of errors) {
    for (const part of error.split("; ")) {
      console.error(`    ${errorNum}. ${part}`);
      errorNum++;
    }
  }
}
function addSchemaIfMissing(path) {
  try {
    const content = readFileSync6(path, "utf-8");
    const parsed = JSON.parse(content);
    if (parsed.$schema) {
      return false;
    }
    const updated = { $schema: SCHEMA_URL, ...parsed };
    writeFileSync(path, JSON.stringify(updated, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}
function verifyConfig(options = {}) {
  const userConfig = options.userConfigPath ?? getUserConfigPath();
  const projectConfig = options.projectConfigPath ?? getProjectConfigPath();
  let hasErrors = false;
  const configsChecked = [];
  printHeader();
  if (existsSync8(userConfig)) {
    const result = validateConfigFile(userConfig);
    configsChecked.push({ scope: "User", path: userConfig, result });
    if (result.errors.length > 0) {
      hasErrors = true;
    }
  }
  if (existsSync8(projectConfig)) {
    const result = validateConfigFile(projectConfig);
    configsChecked.push({
      scope: "Project",
      path: resolve4(projectConfig),
      result
    });
    if (result.errors.length > 0) {
      hasErrors = true;
    }
  }
  if (configsChecked.length === 0) {
    console.log(`
No config files found. Using built-in rules only.`);
    return 0;
  }
  for (const { scope, path, result } of configsChecked) {
    if (result.errors.length > 0) {
      printInvalidConfig(scope, path, result.errors);
    } else {
      if (addSchemaIfMissing(path)) {
        console.log(`
Added $schema to ${scope.toLowerCase()} config.`);
      }
      printValidConfig(scope, path, result);
    }
  }
  if (hasErrors) {
    console.error(`
Config validation failed.`);
    return 1;
  }
  console.log(`
All configs valid.`);
  return 0;
}

// src/bin/cc-safety-net.ts
function printCustomRulesDoc() {
  console.log(CUSTOM_RULES_DOC);
}
function hasHelpFlag(args) {
  return args.includes("--help") || args.includes("-h");
}
function handleHelpCommand(args) {
  if (args[0] !== "help") {
    return false;
  }
  const commandName = args[1];
  if (!commandName) {
    printHelp();
    process.exit(0);
  }
  if (showCommandHelp(commandName)) {
    process.exit(0);
  }
  console.error(`Unknown command: ${commandName}`);
  console.error("Run 'cc-safety-net --help' for available commands.");
  process.exit(1);
}
function handleCommandHelp(args) {
  if (!hasHelpFlag(args)) {
    return false;
  }
  const commandName = args[0];
  if (!commandName || commandName.startsWith("-")) {
    return false;
  }
  const command = findCommand(commandName);
  if (command) {
    showCommandHelp(commandName);
    process.exit(0);
  }
  return false;
}
function handleCliFlags() {
  const args = process.argv.slice(2);
  if (handleHelpCommand(args)) {
    return null;
  }
  if (handleCommandHelp(args)) {
    return null;
  }
  if (args[0] === "explain") {
    return "explain";
  }
  if (args.length === 0 || hasHelpFlag(args)) {
    printHelp();
    process.exit(0);
  }
  if (args.includes("--version") || args.includes("-V")) {
    printVersion();
    process.exit(0);
  }
  if (args.includes("--verify-config") || args.includes("-vc")) {
    process.exit(verifyConfig());
  }
  if (args.includes("--custom-rules-doc")) {
    printCustomRulesDoc();
    process.exit(0);
  }
  if (args.includes("doctor") || args.includes("--doctor")) {
    return "doctor";
  }
  if (args.includes("--statusline")) {
    return "statusline";
  }
  if (args.includes("--claude-code") || args.includes("-cc")) {
    return "claude-code";
  }
  if (args.includes("--copilot-cli") || args.includes("-cp")) {
    return "copilot-cli";
  }
  if (args.includes("--gemini-cli") || args.includes("-gc")) {
    return "gemini-cli";
  }
  console.error(`Unknown option: ${args[0]}`);
  console.error("Run 'cc-safety-net --help' for usage.");
  process.exit(1);
}
async function main() {
  const mode = handleCliFlags();
  if (mode === "claude-code") {
    await runClaudeCodeHook();
  } else if (mode === "copilot-cli") {
    await runCopilotCliHook();
  } else if (mode === "gemini-cli") {
    await runGeminiCLIHook();
  } else if (mode === "statusline") {
    await printStatusline();
  } else if (mode === "doctor") {
    const flags = parseDoctorFlags(process.argv.slice(2));
    const exitCode = await runDoctor({
      json: flags.json,
      skipUpdateCheck: flags.skipUpdateCheck
    });
    process.exit(exitCode);
  } else if (mode === "explain") {
    const args = process.argv.slice(3);
    if (hasHelpFlag(args) || args.length === 0) {
      showCommandHelp("explain");
      process.exit(0);
    }
    const flags = parseExplainFlags(args);
    if (!flags) {
      process.exit(1);
    }
    const result = explainCommand2(flags.command, { cwd: flags.cwd });
    const asciiOnly = !!process.env.NO_COLOR || !process.stdout.isTTY;
    if (flags.json) {
      console.log(formatTraceJson(result));
    } else {
      console.log(formatTraceHuman(result, { asciiOnly }));
    }
    process.exit(0);
  }
}
main().catch((error) => {
  console.error("Safety Net error:", error);
  process.exit(1);
});
