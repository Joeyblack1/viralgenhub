// One-off: encrypts the Integration.token / refreshToken values that were
// stored as plaintext before TOKEN_ENCRYPTION_KEY existed (#145).
//
//   TOKEN_ENCRYPTION_KEY=... DATABASE_URL=... \
//     npx ts-node --transpile-only \
//     --compiler-options '{"module":"commonjs","esModuleInterop":true}' \
//     scripts/encrypt-integration-tokens.ts [--dry-run] [--batch=200]
//
// Idempotent: rows already carrying the enc:v1: prefix are skipped, so it is
// safe to re-run after a partial run. Each update only applies if the row still
// holds the value that was read, so a token refreshed meanwhile is not
// overwritten. Prints counts only, never a token value.
import { PrismaClient } from '@prisma/client';
import {
  encryptToken,
  isEncryptedToken,
  isTokenEncryptionEnabled,
} from '../libraries/helpers/src/auth/token.encryption';

const dryRun = process.argv.includes('--dry-run');
const batchSize =
  Number(process.argv.find((a) => a.startsWith('--batch='))?.split('=')[1]) ||
  200;

async function main() {
  if (!isTokenEncryptionEnabled()) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not set, nothing to do');
  }

  const prisma = new PrismaClient();
  const counts = { scanned: 0, encrypted: 0, skipped: 0, changedMeanwhile: 0 };
  let cursor: string | undefined;

  try {
    for (;;) {
      const rows = await prisma.integration.findMany({
        where: {
          OR: [
            { NOT: { token: { startsWith: 'enc:v1:' } } },
            {
              AND: [
                { refreshToken: { not: null } },
                { refreshToken: { not: '' } },
                { NOT: { refreshToken: { startsWith: 'enc:v1:' } } },
              ],
            },
          ],
        },
        select: { id: true, token: true, refreshToken: true },
        orderBy: { id: 'asc' },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (!rows.length) {
        break;
      }
      cursor = rows[rows.length - 1].id;

      for (const row of rows) {
        counts.scanned++;
        const token = isEncryptedToken(row.token)
          ? row.token
          : encryptToken(row.token);
        const refreshToken =
          !row.refreshToken || isEncryptedToken(row.refreshToken)
            ? row.refreshToken
            : encryptToken(row.refreshToken);

        if (token === row.token && refreshToken === row.refreshToken) {
          counts.skipped++;
          continue;
        }
        if (dryRun) {
          counts.encrypted++;
          continue;
        }

        const res = await prisma.integration.updateMany({
          where: {
            id: row.id,
            token: row.token,
            refreshToken: row.refreshToken,
          },
          data: { token, refreshToken },
        });
        if (res.count === 1) {
          counts.encrypted++;
        } else {
          counts.changedMeanwhile++;
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `${dryRun ? 'DRY RUN ' : ''}integration tokens: scanned=${counts.scanned} encrypted=${counts.encrypted} skipped=${counts.skipped} changedMeanwhile=${counts.changedMeanwhile}`
  );
  if (counts.changedMeanwhile) {
    console.log('Re-run the script to pick up the rows that changed meanwhile.');
  }
}

main().catch((err) => {
  console.error('encrypt-integration-tokens failed:', err?.message || err);
  process.exit(1);
});
