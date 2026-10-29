/**
 * Loan module DB guard.
 * Loan seeds and migrations must run against a local database unless the operator
 * explicitly opts in with ALLOW_REMOTE=1 and CONFIRM_DB=<database name>.
 * Reads the connection config directly so it can run before src/models connects.
 */
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];

const resolveTarget = () => {
  const cfg = require('../config/dbClient').clientDB.env_auto;
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

module.exports = { assertLocalDb, resolveTarget };
