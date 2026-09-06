// Value-taking global options per CLI, used only by rulebook v2 command-path parsing.
// Flags that take no value need no entry: an unrecognized token starting with `-` is
// skipped without consuming a value.
const AWS_GLOBAL_OPTIONS_WITH_VALUES = new Set([
  '--ca-bundle',
  '--cli-binary-format',
  '--cli-connect-timeout',
  '--cli-error-format',
  '--cli-read-timeout',
  '--color',
  '--endpoint-url',
  '--output',
  '--profile',
  '--query',
  '--region',
]);

const GCLOUD_GLOBAL_OPTIONS_WITH_VALUES = new Set([
  '--access-token-file',
  '--account',
  '--billing-project',
  '--configuration',
  '--flags-file',
  '--flatten',
  '--format',
  '--impersonate-service-account',
  '--project',
  '--trace-token',
  '--verbosity',
]);

// The remaining documented az global arguments (--debug, --help, --only-show-errors,
// --verbose) take no value.
const AZ_GLOBAL_OPTIONS_WITH_VALUES = new Set(['-o', '--output', '--query', '--subscription']);

const EMPTY_GLOBAL_OPTIONS_WITH_VALUES = new Set<string>();

// Terraform has no entry on purpose: its only global option, `-chdir=DIR`, is `=`-joined
// by definition and is skipped with its own token.
export function getMatchGlobalOptionsWithValues(command: string): ReadonlySet<string> {
  if (command === 'aws') return AWS_GLOBAL_OPTIONS_WITH_VALUES;
  if (command === 'gcloud') return GCLOUD_GLOBAL_OPTIONS_WITH_VALUES;
  if (command === 'az') return AZ_GLOBAL_OPTIONS_WITH_VALUES;
  return EMPTY_GLOBAL_OPTIONS_WITH_VALUES;
}
