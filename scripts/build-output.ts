interface BuildOutput {
  path: string;
  size: number;
}

export function getBundledOutputs(outputs: BuildOutput[]) {
  return {
    indexOutput: outputs.find((output) =>
      normalizeBuildPath(output.path).endsWith('dist/index.js'),
    ),
    binOutput: outputs.find((output) => normalizeBuildPath(output.path).endsWith('dist/bin.js')),
    piOutput: outputs.find((output) => normalizeBuildPath(output.path).endsWith('dist/pi.js')),
  };
}

export function isPublicDeclarationOutput(path: string): boolean {
  return ['dist/entries/index.d.ts', 'dist/entries/api.d.ts'].includes(normalizeBuildPath(path));
}

function normalizeBuildPath(path: string): string {
  return path.replaceAll('\\', '/');
}
