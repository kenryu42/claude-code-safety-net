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
import { homedir, tmpdir } from "node:os";
import { normalize, resolve } from "node:path";
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
  if (normalized.startsWith(`${systemTmpdir}/`) || normalized === systemTmpdir) {
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
  return process.env.HOME ?? homedir();
}
function isCwdHomeForRmPolicy(cwd, homeDir) {
  try {
    const normalizedCwd = normalize(cwd);
    const normalizedHome = normalize(homeDir);
    return normalizedCwd === normalizedHome;
  } catch {
    return false;
  }
}
function isCwdSelfTarget(target, cwd) {
  if (target === "." || target === "./") {
    return true;
  }
  try {
    const resolved = resolve(cwd, target);
    const realCwd = realpathSync(cwd);
    const realResolved = realpathSync(resolved);
    return realResolved === realCwd;
  } catch {
    try {
      const resolved = resolve(cwd, target);
      const normalizedCwd = normalize(cwd);
      return resolved === normalizedCwd;
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
  if (target.startsWith("/")) {
    try {
      const normalizedTarget = normalize(target);
      const normalizedCwd = `${normalize(originalCwd)}/`;
      return normalizedTarget.startsWith(normalizedCwd);
    } catch {
      return false;
    }
  }
  if (target.startsWith("./") || !target.includes("/")) {
    try {
      const resolved = resolve(resolveCwd, target);
      const normalizedOriginalCwd = normalize(originalCwd);
      return resolved.startsWith(`${normalizedOriginalCwd}/`) || resolved === normalizedOriginalCwd;
    } catch {
      return false;
    }
  }
  if (target.startsWith("../")) {
    return false;
  }
  try {
    const resolved = resolve(resolveCwd, target);
    const normalizedCwd = normalize(originalCwd);
    return resolved.startsWith(`${normalizedCwd}/`) || resolved === normalizedCwd;
  } catch {
    return false;
  }
}
function isHomeDirectory(cwd) {
  const home = process.env.HOME ?? homedir();
  try {
    const normalizedCwd = normalize(cwd);
    const normalizedHome = normalize(home);
    return normalizedCwd === normalizedHome;
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

// src/core/config.ts
import { existsSync, readFileSync } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join, resolve as resolve2 } from "node:path";
var DEFAULT_CONFIG = {
  version: 1,
  rules: []
};
function loadConfig(cwd, options) {
  const safeCwd = typeof cwd === "string" ? cwd : process.cwd();
  const userConfigDir = options?.userConfigDir ?? join(homedir2(), ".cc-safety-net");
  const userConfigPath = join(userConfigDir, "config.json");
  const projectConfigPath = join(safeCwd, ".safety-net.json");
  const userConfig = loadSingleConfig(userConfigPath);
  const projectConfig = loadSingleConfig(projectConfigPath);
  return mergeConfigs(userConfig, projectConfig);
}
function loadSingleConfig(path) {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const content = readFileSync(path, "utf-8");
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
  if (!existsSync(path)) {
    errors.push(`File not found: ${path}`);
    return { errors, ruleNames };
  }
  try {
    const content = readFileSync(path, "utf-8");
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
  return join(homedir2(), ".cc-safety-net", "config.json");
}
function getProjectConfigPath(cwd) {
  return resolve2(cwd ?? process.cwd(), ".safety-net.json");
}

// src/core/analyze.ts
function analyzeCommand(command, options = {}) {
  const config = options.config ?? loadConfig(options.cwd);
  return analyzeCommandInternal(command, 0, { ...options, config });
}

// src/core/env.ts
function envTruthy(name) {
  const value = process.env[name];
  return value === "1" || value?.toLowerCase() === "true";
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

// src/features/builtin-commands/templates/set-custom-rules.ts
var SET_CUSTOM_RULES_TEMPLATE = `You are helping the user configure custom blocking rules for claude-code-safety-net.

## Context

### Schema Documentation

!\`npx -y cc-safety-net --custom-rules-doc\`

## Your Task

Follow this flow exactly:

### Step 1: Ask for Scope

Ask: **Which scope would you like to configure?**
- **User** (\`~/.cc-safety-net/config.json\`) - applies to all your projects
- **Project** (\`.safety-net.json\`) - applies only to this project

### Step 2: Show Examples and Ask for Rules

Show examples in natural language:
- "Block \`git add -A\` and \`git add .\` to prevent blanket staging"
- "Block \`npm install -g\` to prevent global package installs"
- "Block \`docker system prune\` to prevent accidental cleanup"

Ask the user to describe rules in natural language. They can list multiple.

### Step 3: Generate JSON Config

Parse user input and generate valid schema JSON using the schema documentation above.

### Step 4: Show Config and Confirm

Display the generated JSON and ask:
- "Does this look correct?"
- "Would you like to modify anything?"

### Step 5: Check and Handle Existing Config

1. Check existing User Config with \`cat ~/.cc-safety-net/config.json 2>/dev/null || echo "No user config found"\`
2. Check existing Project Config with \`cat .safety-net.json 2>/dev/null || echo "No project config found"\`

If the chosen scope already has a config:
Show the existing config to the user.
Ask: **Merge** (add new rules, duplicates use new version) or **Replace**?

### Step 6: Write and Validate

Write the config to the chosen scope, then validate with \`npx -y cc-safety-net --verify-config\`.

If validation errors:
- Show specific errors
- Offer to fix with your best suggestion
- Confirm before proceeding

### Step 7: Confirm Success

Tell the user:
1. Config saved to [path]
2. **Changes take effect immediately** - no restart needed
3. Summary of rules added

## Important Notes

- Custom rules can only ADD restrictions, not bypass built-in protections
- Rule names must be unique (case-insensitive)
- Invalid config → entire config ignored, only built-in rules apply`;

// src/features/builtin-commands/templates/verify-custom-rules.ts
var VERIFY_CUSTOM_RULES_TEMPLATE = `You are helping the user verify the custom rules config file.

## Your Task

Run \`npx -y cc-safety-net --verify-config\` to check current validation status

If the config has validation errors:
1. Show the specific validation errors
2. Run \`npx -y cc-safety-net --custom-rules-doc\` to read the schema documentation
3. Offer to fix them with your best suggestion
4. Ask for confirmation before proceeding
5. After fixing, run \`npx -y cc-safety-net --verify-config\` to verify again`;

// src/features/builtin-commands/commands.ts
var BUILTIN_COMMAND_DEFINITIONS = {
  "set-custom-rules": {
    description: "Set custom rules for Safety Net",
    template: SET_CUSTOM_RULES_TEMPLATE
  },
  "verify-custom-rules": {
    description: "Verify custom rules for Safety Net",
    template: VERIFY_CUSTOM_RULES_TEMPLATE
  }
};
function loadBuiltinCommands(disabledCommands) {
  const disabled = new Set(disabledCommands ?? []);
  const commands = {};
  for (const [name, definition] of Object.entries(BUILTIN_COMMAND_DEFINITIONS)) {
    if (!disabled.has(name)) {
      commands[name] = definition;
    }
  }
  return commands;
}
// src/index.ts
var SafetyNetPlugin = async ({ directory }) => {
  const safetyNetConfig = loadConfig(directory);
  const strict = envTruthy("SAFETY_NET_STRICT");
  const paranoidAll = envTruthy("SAFETY_NET_PARANOID");
  const paranoidRm = paranoidAll || envTruthy("SAFETY_NET_PARANOID_RM");
  const paranoidInterpreters = paranoidAll || envTruthy("SAFETY_NET_PARANOID_INTERPRETERS");
  return {
    config: async (opencodeConfig) => {
      const builtinCommands = loadBuiltinCommands();
      const existingCommands = opencodeConfig.command ?? {};
      opencodeConfig.command = {
        ...builtinCommands,
        ...existingCommands
      };
    },
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        const command = output.args.command;
        const result = analyzeCommand(command, {
          cwd: directory,
          config: safetyNetConfig,
          strict,
          paranoidRm,
          paranoidInterpreters
        });
        if (result) {
          const message = formatBlockedMessage({
            reason: result.reason,
            command,
            segment: result.segment
          });
          throw new Error(message);
        }
      }
    }
  };
};
export {
  SafetyNetPlugin
};
