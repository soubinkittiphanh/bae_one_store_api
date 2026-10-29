/**
 * Loan module DB guard.
 * Loan seeds and migrations must run against a local database unless the operator
 * explicitly opts in with ALLOW_REMOTE=1 and CONFIRM_DB=<database name>.
 * Resolves the same config src/models uses (src/config/env.js -> db) without
 * connecting, so it can run before src/models opens a connection.
 */
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];

const resolveConfig = () => require('../config/env').db;

const resolveTarget = () => {
  const cfg = resolveConfig();
  return { host: String(cfg.host), port: cfg.port, database: String(cfg.database) };
};

const assertLocalDb = (scriptName = 'loan script') => {
  const target = resolveTarget();
  const isLocal = LOCAL_HOSTS.includes(target.host);
  const remoteConfirmed = process.env.ALLOW_REMOTE === '1' && process.env.CONFIRM_DB === target.database;

  console.log(`[${scriptName}] target DB: ${target.host}:${target.port}/${target.database}`);

  if (!isLocal && !remoteConfirmed) {
    throw new Error(
      `[${scriptName}] Refusing to run against non-local host ${target.host}. ` +
      'Set DB_HOST to a local server, or set ALLOW_REMOTE=1 and CONFIRM_DB=<database> to override.'
    );
  }
  if (!isLocal) {
    console.warn(`[${scriptName}] WARNING: running against REMOTE database ${target.database} (explicitly confirmed).`);
  }
  return target;
};

module.exports = { assertLocalDb, resolveTarget, resolveConfig };
