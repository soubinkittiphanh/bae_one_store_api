/**
 * POS schema migration runner (see src/posMigrations/index.js).
 *
 *   node pos_migrate.js status
 *   node pos_migrate.js up
 *   node pos_migrate.js down --yes          # roll back the latest applied migration
 *
 * The server also applies pending migrations at startup; this is for running or undoing them by hand.
 * Refuses non-local databases unless ALLOW_REMOTE=1 and CONFIRM_DB=<database> (same guard as loan_migrate.js).
 * Select the database with DCOMMERCE_DB_NAME (and DCOMMERCE_DB_HOST / _USER / _PASSWORD / _PORT),
 * or DCOMMERCE_DB_SOCKET=<socket path> for a local socket login.
 */
const mariadb = require('mariadb');
const { assertLocalDb, resolveConfig } = require('./src/loan/dbGuard');
const { MIGRATIONS, connectionRunner } = require('./src/posMigrations');

const main = async () => {
  const [command = 'status', ...flags] = process.argv.slice(2);
  if (!['status', 'up', 'down'].includes(command)) {
    throw new Error('Usage: node pos_migrate.js status | up | down --yes');
  }

  assertLocalDb('pos_migrate');
  const cfg = resolveConfig();
  // DCOMMERCE_DB_SOCKET=<path>: local socket login (OS user, no password), e.g. a Homebrew MariaDB
  const socketPath = process.env.DCOMMERCE_DB_SOCKET;
  const conn = await mariadb.createConnection({
    ...(socketPath
      ? { socketPath, user: process.env.DCOMMERCE_DB_USER || require('os').userInfo().username }
      : { host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password }),
    database: cfg.database,
    connectTimeout: 10000
  });
  const q = connectionRunner(conn);

  try {
    const state = [];
    for (const m of MIGRATIONS) state.push({ m, applied: await m.isApplied(q) });

    if (command === 'status') {
      for (const { m, applied } of state) console.log(`  [${applied ? 'x' : ' '}] ${m.name}  ${m.description || ''}`);
      return;
    }

    if (command === 'up') {
      const todo = state.filter(s => !s.applied);
      if (!todo.length) console.log('  nothing to apply');
      for (const { m } of todo) {
        console.log(`  applying ${m.name}`);
        await m.up(q);
      }
      return;
    }

    // down: latest applied only
    if (!flags.includes('--yes')) throw new Error('down needs --yes');
    const latest = [...state].reverse().find(s => s.applied);
    if (!latest) {
      console.log('  nothing to roll back');
      return;
    }
    console.log(`  rolling back ${latest.m.name}`);
    await latest.m.down(q);
  } finally {
    await conn.end();
  }
};

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
