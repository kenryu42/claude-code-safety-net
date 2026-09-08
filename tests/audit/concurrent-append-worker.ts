import { writeAuditLog } from '@/audit/writer';
import { createTestEnvironment } from '@/core/environment';

/**
 * One process of the concurrent-append case: fifty records into the same session file.
 * Invoked as `bun <this file> <audit home> <session id> <worker id>`.
 */
const [home = '', sessionId = '', worker = ''] = process.argv.slice(2);
const environment = createTestEnvironment({ home });

Array.from({ length: 50 }, (_, index) =>
  writeAuditLog(
    environment,
    sessionId,
    `worker ${worker} command ${index}`,
    `worker ${worker} segment ${index}`,
    'Blocked: concurrent append fixture',
    '/work/concurrent',
    {
      now: () => new Date('2026-05-17T12:34:56.789Z'),
      createId: () => `${worker}-${index}`,
    },
  ),
);
