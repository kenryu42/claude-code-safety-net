export function envTruthy(name: string): boolean {
  const value = process.env[name];
  return value === '1' || value?.toLowerCase() === 'true';
}

export function envAssignmentTruthy(assignments: Map<string, string>, name: string): boolean {
  const value = assignments.get(name);
  return value === '1' || value?.toLowerCase() === 'true';
}
