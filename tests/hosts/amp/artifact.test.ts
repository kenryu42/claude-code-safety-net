import { describe, expect, test } from 'bun:test';
import {
  AMP_MANAGED_HEADER,
  AMP_PLUGIN_DIRECTORY,
  AMP_PLUGIN_ENTRY,
  buildAmpArtifactHeader,
} from '@/hosts/amp/artifact';

/**
 * The ownership marker the build stamps into the published plugin and the installer reads back out
 * of the user's hosted repository. A changed byte here makes every previously installed artifact
 * look unmanaged, so install would refuse to overwrite what it wrote itself.
 */

describe('the Amp artifact markers', () => {
  test('name the same header, directory and entry the shipped build stamps', () => {
    const markers = {
      header: AMP_MANAGED_HEADER,
      directory: AMP_PLUGIN_DIRECTORY,
      entry: AMP_PLUGIN_ENTRY,
    };

    expect(markers).toMatchSnapshot();
    expect(AMP_MANAGED_HEADER).toBe(
      '// cc-safety-net managed Amp plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --amp',
    );
    expect(AMP_PLUGIN_ENTRY).toBe('cc-safety-net/index.ts');
  });

  test('stamp a version line under the marker', () => {
    expect(buildAmpArtifactHeader('1.2.3')).toBe(`${AMP_MANAGED_HEADER}\n// version: 1.2.3\n`);
  });
});
