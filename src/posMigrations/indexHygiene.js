/**
 * Stops and repairs the duplicate UNIQUE index pile-up caused by sequelize.sync({ alter }).
 *
 * On an alter sync Sequelize 6 calls queryInterface.changeColumn() for every existing column. For a column
 * declared `unique: true` that becomes `CHANGE COLUMN ... UNIQUE`, and MariaDB adds another index each time
 * (code, code_2, code_3, ...). At 64 indexes per table the alter fails ("Too many keys") and later model
 * changes stop being applied.
 *
 *  guardAlterUnique(sequelize)    changeColumn during an alter sync no longer carries `unique`, so an existing
 *      column keeps the index it has. Models are not touched: CREATE TABLE / addColumn still create the
 *      unique index once, and uniqueKeys / upsert / error messages behave as before.
 *  dedupeUniqueIndexes(q, keep)   drops exact duplicate UNIQUE indexes (same columns, prefix lengths, type),
 *      keeping one per group: a name the model declares, else the bare column name, else the shortest.
 *
 * Both run at every server start before sequelize.sync (src/models/index.js); both are idempotent.
 */

const tableNameOf = model => {
  const t = model.getTableName();
  return typeof t === 'string' ? t : t.tableName;
};

const guardAlterUnique = (sequelize) => {
  const qi = sequelize.getQueryInterface();
  if (qi.__alterUniqueGuarded) return;
  const original = qi.changeColumn.bind(qi);
  qi.changeColumn = (tableName, attributeName, dataTypeOrOptions, options) => {
    if (options && options.alter && dataTypeOrOptions && typeof dataTypeOrOptions === 'object' && dataTypeOrOptions.unique) {
      const { unique, ...withoutUnique } = dataTypeOrOptions;
      return original(tableName, attributeName, withoutUnique, options);
    }
    return original(tableName, attributeName, dataTypeOrOptions, options);
  };
  qi.__alterUniqueGuarded = true;
};

/** Map<tableName, Set<index name>> of the unique indexes the models declare (Sequelize names them). */
const declaredUniqueIndexes = (sequelize) => {
  const declared = new Map();
  for (const model of Object.values(sequelize.models)) {
    const names = declared.get(tableNameOf(model)) || new Set();
    for (const idx of model._indexes || []) if (idx.unique && idx.name) names.add(idx.name);
    if (names.size) declared.set(tableNameOf(model), names);
  }
  return declared;
};

const pickKeeper = (names, cols, declaredNames) => {
  const declaredHit = names.find(n => declaredNames && declaredNames.has(n));
  if (declaredHit) return declaredHit;
  if (cols.length === 1 && names.includes(cols[0])) return cols[0];
  const unsuffixed = names.filter(n => !/_\d+$/.test(n));
  const pool = unsuffixed.length ? unsuffixed : names;
  return [...pool].sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
};

/**
 * @param q        (sql, params) => rows (src/posMigrations/index.js runners)
 * @param declared Map<table, Set<name>> from declaredUniqueIndexes (optional)
 * @returns number of indexes dropped
 */
const dedupeUniqueIndexes = async (q, declared = new Map(), logger = console) => {
  const rows = await q(
    `SELECT TABLE_NAME AS t, INDEX_NAME AS i, INDEX_TYPE AS type, COLUMN_NAME AS c, SEQ_IN_INDEX AS seq, SUB_PART AS sub
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`
  );

  // table -> index -> { type, cols[] }
  const tables = new Map();
  for (const r of rows) {
    if (!tables.has(r.t)) tables.set(r.t, new Map());
    const idx = tables.get(r.t);
    if (!idx.has(r.i)) idx.set(r.i, { type: r.type, cols: [] });
    idx.get(r.i).cols.push(r.sub === null || r.sub === undefined ? r.c : `${r.c}(${r.sub})`);
  }

  let dropped = 0;
  for (const [table, indexes] of tables) {
    const bySignature = new Map();
    for (const [name, info] of indexes) {
      const sig = `${info.type}|${info.cols.join(',')}`;
      if (!bySignature.has(sig)) bySignature.set(sig, { cols: info.cols, names: [] });
      bySignature.get(sig).names.push(name);
    }

    const toDrop = [];
    for (const { cols, names } of bySignature.values()) {
      if (names.length < 2) continue;
      const keep = pickKeeper(names, cols, declared.get(table));
      toDrop.push(...names.filter(n => n !== keep));
    }
    if (!toDrop.length) continue;

    let tableDropped = 0;
    try {
      await q(`ALTER TABLE \`${table}\` ${toDrop.map(n => `DROP INDEX \`${n}\``).join(', ')}`);
      tableDropped = toDrop.length;
    } catch (err) {
      // One index the server refuses to drop must not block the others
      for (const n of toDrop) {
        try {
          await q(`ALTER TABLE \`${table}\` DROP INDEX \`${n}\``);
          tableDropped++;
        } catch (e) {
          logger.warn(`Index cleanup: kept ${table}.${n}: ${e.message}`);
        }
      }
    }
    dropped += tableDropped;
    logger.info(`Index cleanup: ${table}: dropped ${tableDropped} duplicate unique index(es)`);
  }
  return dropped;
};

module.exports = { guardAlterUnique, declaredUniqueIndexes, dedupeUniqueIndexes, pickKeeper };
