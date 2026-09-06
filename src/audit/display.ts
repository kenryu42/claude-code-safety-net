/** Browser-safe formatting helpers shared by audit log views. */
export const formatRelativeTime = (value: string | Date): string => {
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff)) return '';
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
};

/** Reduce a command to the stable key used by audit activity summaries. */
export const commandSignature = (source: string | undefined): string | null => {
  const tokens = (source ?? '')
    .trim()
    .split(/\s+/)
    .filter((token) => token && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token));
  const binary = tokens[0]?.split('/').pop();
  if (!binary) return null;
  const next = tokens[1];
  return next && /^[a-z][a-z0-9-]*$/.test(next) ? `${binary} ${next}` : binary;
};
