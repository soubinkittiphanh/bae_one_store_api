/**
 * Generic maker-checker service for loan parameter tables.
 *
 * - create: new row PENDING (makerId = user)
 * - edit: PENDING/REJECTED row -> maker edits in place; AUTHORIZED row -> pending ln_param_change
 *   (products instead get a new PENDING version with copied children)
 * - delete: own PENDING row -> removed; AUTHORIZED row -> pending DELETE change (applied as CLOSED)
 * - authorize/reject: checker must differ from maker unless SPF LOAN_ALLOW_SELF_AUTHORIZE = 'true';
 *   every self-authorization is written to ln_audit_log as SELF_AUTH
 * Every mutation is audited. Client input is validated with express-validator against the registry.
 */
const { checkSchema, validationResult } = require('express-validator');
const db = require('../../models');
const logger = require('../../api/logger');
const { LoanError } = require('../errors');
const { SYSTEM_FIELDS, getEntity, entityForModel } = require('./paramRegistry');
const { checkProductRow } = require('./accountingService');

const MONEY_RE = /^\d{1,16}(\.\d{1,4})?$/;
const RATE_RE = /^(0(\.\d{1,6})?|1(\.0{1,6})?)$/;
const DECIMAL96_RE = /^\d{1,3}(\.\d{1,6})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Phase 5: exchange rates, DECIMAL(20,8)
const FXRATE_RE = /^\d{1,12}(\.\d{1,8})?$/;
const INACTIVE_STATUSES = ['REJECTED', 'CLOSED'];

const authorizedHooks = [];

const resolveEntity = (name) => {
  const def = getEntity(name);
  if (!def) throw new LoanError(404, `Unknown parameter entity "${name}"`);
  return def;
};
const modelOf = (def) => db[def.model];
const hasColumn = (model, col) => Boolean(model.rawAttributes[col]);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Vientiane' });
const plain = (row) => (row && row.toJSON ? row.toJSON() : row);

// ----------------------------------------------------------------------------- field specs

const fieldSpec = (def, model, field) => {
  const attr = model.rawAttributes[field];
  const override = def.fields[field] || {};
  const t = attr.type;
  let type = override.type;
  if (!type) {
    if (override.enum) type = 'enum';
    else if (t.key === 'DECIMAL') type = t._precision === 9 && t._scale === 6 ? 'rate' : 'money';
    else if (t.key === 'INTEGER') type = 'int';
    else if (t.key === 'BOOLEAN') type = 'bool';
    else if (t.key === 'DATEONLY') type = 'date';
    else if (t.key === 'ENUM') type = 'enum';
    else if (t.key === 'TEXT') type = 'text';
    else type = 'string';
  }
  return {
    field,
    type,
    enum: override.enum || (t.key === 'ENUM' ? t.values : undefined),
    maxLength: t.options && t.options.length,
    allowNull: attr.allowNull !== false,
    required: attr.allowNull === false && attr.defaultValue === undefined && !attr.autoIncrement,
    ref: override.ref
  };
};

const editableFields = (def, model) => Object.keys(model.rawAttributes).filter((f) => {
  const attr = model.rawAttributes[f];
  if (SYSTEM_FIELDS.includes(f) || def.readOnly.includes(f)) return false;
  if (attr.autoIncrement) return false;
  return true;
});

const checkValue = (spec, v) => {
  if (v === null) {
    if (!spec.allowNull) throw new Error('must not be null');
    return true;
  }
  const s = String(v);
  switch (spec.type) {
    case 'money': if (!MONEY_RE.test(s)) throw new Error('must be a non-negative decimal with up to 4 decimals'); break;
    case 'rate': if (!RATE_RE.test(s)) throw new Error('must be a rate between 0 and 1 with up to 6 decimals'); break;
    case 'fxrate': if (!FXRATE_RE.test(s) || Number(s) <= 0) throw new Error('must be a positive exchange rate with up to 8 decimals'); break;
    case 'decimal96': if (!DECIMAL96_RE.test(s)) throw new Error('must be a decimal with up to 6 decimals'); break;
    case 'int': if (!/^\d+$/.test(s)) throw new Error('must be a non-negative integer'); break;
    case 'bool': if (![true, false, 'true', 'false', 0, 1, '0', '1'].includes(v)) throw new Error('must be true or false'); break;
    case 'date': if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) throw new Error('must be a date YYYY-MM-DD'); break;
    case 'enum': if (!spec.enum.includes(s)) throw new Error(`must be one of ${spec.enum.join(', ')}`); break;
    case 'string': if (spec.maxLength && s.length > spec.maxLength) throw new Error(`must be at most ${spec.maxLength} characters`); break;
    default: break;
  }
  return true;
};

const coerce = (spec, v) => {
  if (v === null || v === undefined) return v;
  if (spec.type === 'int') return parseInt(v, 10);
  if (spec.type === 'bool') return v === true || v === 'true' || v === 1 || v === '1';
  if (['money', 'rate', 'decimal96'].includes(spec.type)) return String(v);
  return v;
};

// Validates a client payload; returns the coerced, whitelisted values.
const validatePayload = async (def, body, mode) => {
  const model = modelOf(def);
  const fields = editableFields(def, model);
  const input = body && typeof body === 'object' ? body : {};
  const unknown = Object.keys(input).filter(k => !fields.includes(k));
  if (unknown.length) throw new LoanError(400, `Unknown or read-only field(s): ${unknown.join(', ')}`);

  const specs = fields.map(f => fieldSpec(def, model, f));
  const schema = {};
  for (const spec of specs) {
    schema[spec.field] = {
      in: ['body'],
      ...(mode === 'create' && spec.required
        ? { exists: { errorMessage: 'is required' } }
        : { optional: { options: { values: 'undefined' } } }),
      custom: { options: (v) => checkValue(spec, v) }
    };
  }
  const fakeReq = { body: input };
  await checkSchema(schema).run(fakeReq);
  const result = validationResult(fakeReq);
  if (!result.isEmpty()) {
    const errors = result.array().map(e => `${e.path}: ${e.msg}`);
    throw new LoanError(400, `Validation failed: ${errors.join('; ')}`, errors);
  }
  const values = {};
  for (const spec of specs) if (input[spec.field] !== undefined) values[spec.field] = coerce(spec, input[spec.field]);
  return { values, specs };
};

// References must exist; loan references must not be REJECTED/CLOSED, and must be AUTHORIZED
// before the referencing row is authorized. POS references must exist and be active.
const checkRefs = async (def, row, { forAuthorize = false, transaction } = {}) => {
  const model = modelOf(def);
  for (const field of Object.keys(def.fields)) {
    const r = def.fields[field].ref;
    if (!r || row[field] === null || row[field] === undefined || !model.rawAttributes[field]) continue;
    const target = db[r.model];
    const found = await target.findOne({ where: { [r.key]: row[field] }, transaction });
    if (!found) throw new LoanError(400, `${field}: ${row[field]} does not exist`);
    if (target.rawAttributes.authStatus) {
      if (INACTIVE_STATUSES.includes(found.authStatus)) throw new LoanError(400, `${field}: ${row[field]} is ${found.authStatus}`);
      if (forAuthorize && found.authStatus !== 'AUTHORIZED') {
        throw new LoanError(409, `${field}: ${row[field]} must be authorized first`);
      }
    } else if (target.rawAttributes.isActive && found.isActive === false) {
      throw new LoanError(400, `${field}: ${row[field]} is inactive`);
    }
  }
};

const runRules = (def, row) => {
  const errors = def.rules.map(rule => rule(row)).filter(Boolean);
  if (errors.length) throw new LoanError(400, `Validation failed: ${errors.join('; ')}`, errors);
};

// ----------------------------------------------------------------------------- audit & self-auth

const audit = async ({ entityName, key, actionType, oldValues, newValues, userId, ip }, transaction) => {
  const numeric = /^\d+$/.test(String(key));
  await db.lnAuditLog.create({
    entityName,
    entityId: numeric ? Number(key) : null,
    entityKey: key === undefined || key === null ? null : String(key),
    actionType,
    oldValuesJson: oldValues ? JSON.stringify(oldValues) : null,
    newValuesJson: newValues ? JSON.stringify(newValues) : null,
    userId: userId || 0,
    ipAddress: ip || null,
    timestamp: new Date()
  }, { transaction });
};

const selfAuthorizeAllowed = async (transaction) => {
  const param = await db.spf.findOne({ where: { code: 'LOAN_ALLOW_SELF_AUTHORIZE' }, transaction });
  return Boolean(param && param.isActive !== false && String(param.value).trim().toLowerCase() === 'true');
};

// Throws unless the checker may authorize; returns true when this is a self-authorization.
const assertChecker = async (makerId, checkerId, transaction) => {
  if (makerId === null || makerId === undefined || Number(makerId) !== Number(checkerId)) return false;
  if (await selfAuthorizeAllowed(transaction)) return true;
  throw new LoanError(403, 'Maker cannot authorize their own change (LOAN_ALLOW_SELF_AUTHORIZE is off)');
};

// ----------------------------------------------------------------------------- reads

const list = async (entityName, query = {}) => {
  const def = resolveEntity(entityName);
  const model = modelOf(def);
  const where = {};
  if (query.authStatus) where.authStatus = String(query.authStatus).split(',');
  for (const [k, v] of Object.entries(query)) {
    if (['authStatus', 'page', 'limit'].includes(k) || !model.rawAttributes[k]) continue;
    where[k] = v;
  }
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 100, 1), 500);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const { rows, count } = await model.findAndCountAll({ where, limit, offset: (page - 1) * limit, order: [[def.key, 'ASC']] });
  return { items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) };
};

const findRow = async (def, key, transaction) => {
  const row = await modelOf(def).findOne({ where: { [def.key]: key }, transaction });
  if (!row) throw new LoanError(404, `${def.name} ${key} not found`);
  return row;
};

const get = async (entityName, key) => findRow(resolveEntity(entityName), key);

const pendingChangeFor = (def, key, transaction) => db.lnParamChange.findOne({
  where: { entityName: def.name, entityKey: String(key), status: 'PENDING' }, transaction
});

// ----------------------------------------------------------------------------- mutations

const create = async (entityName, body, ctx) => {
  const def = resolveEntity(entityName);
  const model = modelOf(def);
  const { values } = await validatePayload(def, body, 'create');
  runRules(def, values);
  return db.sequelize.transaction(async (transaction) => {
    await checkRefs(def, values, { transaction });
    const row = await model.create({ ...values, authStatus: 'PENDING', makerId: ctx.userId, checkerId: null, authorizedAt: null }, { transaction });
    await audit({ entityName: def.name, key: row[def.key], actionType: 'CREATE', newValues: plain(row), userId: ctx.userId, ip: ctx.ip }, transaction);
    return row;
  });
};

// Copies a product row and its children into a new PENDING version.
const createProductVersion = async (def, current, values, ctx, transaction) => {
  const model = modelOf(def);
  const newer = await model.findOne({ where: { productCode: current.productCode, authStatus: 'PENDING' }, transaction });
  if (newer) throw new LoanError(409, `A pending version (${newer.version}) of ${current.productCode} already exists`);
  const maxVersion = await model.max('version', { where: { productCode: current.productCode }, transaction });

  const base = plain(current);
  ['id', 'createdAt', 'updatedAt', ...SYSTEM_FIELDS].forEach(f => delete base[f]);
  const row = await model.create({
    ...base, ...values, version: maxVersion + 1, authStatus: 'PENDING', makerId: ctx.userId, checkerId: null, authorizedAt: null
  }, { transaction });
  await copyProductChildren(def, current.id, row.id, ctx, transaction);
  return row;
};

const copyProductChildren = async (def, fromProductId, toProductId, ctx, transaction) => {
  const componentIdMap = {};
  for (const childModel of def.children) {
    const rows = await db[childModel].findAll({ where: { productId: fromProductId }, transaction });
    for (const child of rows) {
      const data = plain(child);
      const oldId = data.id;
      ['id', 'createdAt', 'updatedAt', ...SYSTEM_FIELDS].forEach(f => delete data[f]);
      const copy = await db[childModel].create({ ...data, productId: toProductId, authStatus: 'PENDING', makerId: ctx.userId }, { transaction });
      if (childModel === 'lnProductComponent') componentIdMap[oldId] = copy.id;
    }
  }
  const oldComponentIds = Object.keys(componentIdMap);
  if (oldComponentIds.length) {
    const tiers = await db.lnRateTier.findAll({ where: { productComponentId: oldComponentIds }, transaction });
    for (const tier of tiers) {
      const data = plain(tier);
      ['id', 'createdAt', 'updatedAt', ...SYSTEM_FIELDS].forEach(f => delete data[f]);
      await db.lnRateTier.create({ ...data, productComponentId: componentIdMap[tier.productComponentId], authStatus: 'PENDING', makerId: ctx.userId }, { transaction });
    }
  }
};

const update = async (entityName, key, body, ctx) => {
  const def = resolveEntity(entityName);
  const model = modelOf(def);
  const { values } = await validatePayload(def, body, 'update');
  if (!Object.keys(values).length) throw new LoanError(400, 'No changes supplied');

  return db.sequelize.transaction(async (transaction) => {
    const row = await findRow(def, key, transaction);
    const merged = { ...plain(row), ...values };
    runRules(def, merged);
    await checkRefs(def, merged, { transaction });

    if (['PENDING', 'REJECTED'].includes(row.authStatus)) {
      if (Number(row.makerId) !== Number(ctx.userId) && row.makerId !== null) {
        throw new LoanError(403, 'Only the maker can edit an unauthorized record');
      }
      const before = plain(row);
      await row.update({ ...values, authStatus: 'PENDING', makerId: ctx.userId, checkerId: null, authorizedAt: null }, { transaction });
      await audit({ entityName: def.name, key, actionType: 'UPDATE', oldValues: before, newValues: plain(row), userId: ctx.userId, ip: ctx.ip }, transaction);
      return respondRow(row, 'Unauthorized record updated');
    }
    if (row.authStatus !== 'AUTHORIZED') throw new LoanError(409, `Cannot edit a ${row.authStatus} record`);

    if (def.versioned) {
      const version = await createProductVersion(def, row, values, ctx, transaction);
      await audit({ entityName: def.name, key: version.id, actionType: 'CREATE_VERSION', oldValues: plain(row), newValues: plain(version), userId: ctx.userId, ip: ctx.ip }, transaction);
      return respondRow(version, `New version ${version.version} created; pending authorization`);
    }

    if (await pendingChangeFor(def, key, transaction)) throw new LoanError(409, 'A pending change already exists for this record');
    const change = await db.lnParamChange.create({
      entityName: def.name,
      entityKey: String(key),
      action: 'UPDATE',
      payloadJson: JSON.stringify({ values, baseUpdatedAt: row.updatedAt }),
      baseOptLock: hasColumn(model, 'optLockVersion') ? row.optLockVersion : null,
      status: 'PENDING',
      makerId: ctx.userId
    }, { transaction });
    await audit({ entityName: def.name, key, actionType: 'CHANGE_REQUEST', oldValues: plain(row), newValues: values, userId: ctx.userId, ip: ctx.ip }, transaction);
    return respondRow(change, 'Change submitted; pending authorization');
  });
};

const respondRow = (data, message) => ({ __response: true, data, message });

const remove = async (entityName, key, ctx) => {
  const def = resolveEntity(entityName);
  return db.sequelize.transaction(async (transaction) => {
    const row = await findRow(def, key, transaction);
    if (['PENDING', 'REJECTED'].includes(row.authStatus)) {
      if (Number(row.makerId) !== Number(ctx.userId) && row.makerId !== null) {
        throw new LoanError(403, 'Only the maker can delete an unauthorized record');
      }
      if (def.versioned) {
        for (const childModel of def.children) await db[childModel].destroy({ where: { productId: row.id, authStatus: ['PENDING', 'REJECTED'] }, transaction });
      }
      const before = plain(row);
      await row.destroy({ transaction });
      await audit({ entityName: def.name, key, actionType: 'DELETE', oldValues: before, userId: ctx.userId, ip: ctx.ip }, transaction);
      return respondRow(null, 'Unauthorized record deleted');
    }
    if (row.authStatus !== 'AUTHORIZED') throw new LoanError(409, `Cannot delete a ${row.authStatus} record`);
    if (await pendingChangeFor(def, key, transaction)) throw new LoanError(409, 'A pending change already exists for this record');
    const change = await db.lnParamChange.create({
      entityName: def.name, entityKey: String(key), action: 'DELETE', status: 'PENDING', makerId: ctx.userId,
      payloadJson: JSON.stringify({ baseUpdatedAt: row.updatedAt }),
      baseOptLock: hasColumn(modelOf(def), 'optLockVersion') ? row.optLockVersion : null
    }, { transaction });
    await audit({ entityName: def.name, key, actionType: 'CHANGE_REQUEST', oldValues: plain(row), newValues: { action: 'DELETE' }, userId: ctx.userId, ip: ctx.ip }, transaction);
    return respondRow(change, 'Delete submitted; pending authorization');
  });
};

const markAuthorized = (ctx) => ({ authStatus: 'AUTHORIZED', checkerId: ctx.userId, authorizedAt: new Date() });

// A product can only be authorized when every entry rule it needs is AUTHORIZED (Phase 2B).
// The failing legs are returned in the error details so the UI can list them.
const assertProductAccounting = async (row, transaction) => {
  const check = await checkProductRow(row, { transaction });
  if (!check.ok) {
    throw new LoanError(409, `${row.productCode} v${row.version} cannot be authorized: ${check.errors.length} accounting entry rule problem(s); authorize the entry rules first`, check.errors);
  }
};

// Authorizes one PENDING row inside the caller's transaction; returns { row, self }
const authorizeRow = async (def, key, ctx, transaction) => {
  const row = await findRow(def, key, transaction);
  if (row.authStatus !== 'PENDING') throw new LoanError(409, `${def.name} ${key}: only PENDING records can be authorized (this one is ${row.authStatus})`);
  const self = await assertChecker(row.makerId, ctx.userId, transaction);
  await checkRefs(def, plain(row), { forAuthorize: true, transaction });
  if (def.name === 'product') await assertProductAccounting(row, transaction);

  await row.update(markAuthorized(ctx), { transaction });
  if (def.versioned) {
    // A product version is authorized together with its copied children
    for (const childModel of def.children) {
      await db[childModel].update(markAuthorized(ctx), { where: { productId: row.id, authStatus: 'PENDING' }, transaction });
    }
    const componentIds = (await db.lnProductComponent.findAll({ where: { productId: row.id }, attributes: ['id'], transaction })).map(c => c.id);
    if (componentIds.length) await db.lnRateTier.update(markAuthorized(ctx), { where: { productComponentId: componentIds, authStatus: 'PENDING' }, transaction });
    await modelOf(def).update({ status: 'SUPERSEDED' }, {
      where: { productCode: row.productCode, authStatus: 'AUTHORIZED', id: { [db.Sequelize.Op.ne]: row.id }, status: { [db.Sequelize.Op.ne]: 'SUPERSEDED' } },
      transaction
    });
  }
  await audit({ entityName: def.name, key, actionType: self ? 'SELF_AUTH' : 'AUTH', newValues: plain(row), userId: ctx.userId, ip: ctx.ip }, transaction);
  return { row, self };
};

const authorize = async (entityName, key, ctx) => {
  const def = resolveEntity(entityName);
  const { row } = await db.sequelize.transaction(transaction => authorizeRow(def, key, ctx, transaction));
  await runAuthorizedHooks(def.name, row);
  return respondRow(row, 'Authorized');
};

// Review-and-authorize a selected group: all rows or none (one transaction). Each row is
// checked and audited exactly like a single authorization, including the maker-checker rule.
const BULK_LIMIT = 500;
const bulkAuthorize = async (entityName, keys, ctx) => {
  const def = resolveEntity(entityName);
  if (!Array.isArray(keys) || !keys.length) throw new LoanError(400, 'keys must be a non-empty array');
  if (keys.length > BULK_LIMIT) throw new LoanError(400, `At most ${BULK_LIMIT} records per bulk authorization`);
  const unique = [...new Set(keys.map(String))];
  const results = await db.sequelize.transaction(async (transaction) => {
    const out = [];
    for (const key of unique) out.push(await authorizeRow(def, key, ctx, transaction));
    return out;
  });
  for (const { row } of results) await runAuthorizedHooks(def.name, row);
  const selfCount = results.filter(r => r.self).length;
  return respondRow(
    { authorized: results.length, selfAuthorized: selfCount, keys: unique },
    `${results.length} ${def.name} record(s) authorized${selfCount ? ` (${selfCount} self-authorized, audited)` : ''}`
  );
};

const reject = async (entityName, key, ctx, remarks) => {
  const def = resolveEntity(entityName);
  return db.sequelize.transaction(async (transaction) => {
    const row = await findRow(def, key, transaction);
    if (row.authStatus !== 'PENDING') throw new LoanError(409, `Only PENDING records can be rejected (this one is ${row.authStatus})`);
    await assertChecker(row.makerId, ctx.userId, transaction);
    await row.update({ authStatus: 'REJECTED', checkerId: ctx.userId }, { transaction });
    await audit({ entityName: def.name, key, actionType: 'REJECT', newValues: { remarks: remarks || null }, userId: ctx.userId, ip: ctx.ip }, transaction);
    return respondRow(row, 'Rejected');
  });
};

// ----------------------------------------------------------------------------- pending changes

// Unauthorized records (PENDING / REJECTED) across every entity the user may view
const listPendingRecords = async (userId) => {
  const { hasPermission } = require('../../security/middleware');
  const { ENTITIES } = require('./paramRegistry');
  const out = [];
  for (const name of Object.keys(ENTITIES)) {
    const def = getEntity(name);
    if (!(await hasPermission(userId, def.functionCode, 'VIEW'))) continue;
    const rows = await modelOf(def).findAll({ where: { authStatus: ['PENDING', 'REJECTED'] }, order: [[def.key, 'ASC']], limit: 200 });
    if (rows.length) out.push({ entity: name, functionCode: def.functionCode, key: def.key, rows });
  }
  return out;
};

const listChanges = async (query = {}) => {
  const where = { status: query.status ? String(query.status).split(',') : 'PENDING' };
  if (query.entityName) where.entityName = query.entityName;
  return db.lnParamChange.findAll({ where, order: [['id', 'ASC']], limit: 500 });
};

const findChange = async (id, transaction) => {
  const change = await db.lnParamChange.findByPk(id, { transaction });
  if (!change) throw new LoanError(404, `Change ${id} not found`);
  if (change.status !== 'PENDING') throw new LoanError(409, `Change ${id} is ${change.status}`);
  return change;
};

const changeFunctionCode = async (id) => {
  const change = await db.lnParamChange.findByPk(id);
  const def = change && getEntity(change.entityName);
  return def ? def.functionCode : null;
};

const authorizeChange = async (id, ctx) => {
  let def;
  const result = await db.sequelize.transaction(async (transaction) => {
    const change = await findChange(id, transaction);
    def = resolveEntity(change.entityName);
    const model = modelOf(def);
    const self = await assertChecker(change.makerId, ctx.userId, transaction);
    const row = await findRow(def, change.entityKey, transaction);
    if (row.authStatus !== 'AUTHORIZED') throw new LoanError(409, `Target record is ${row.authStatus}`);

    const payload = change.payloadJson ? JSON.parse(change.payloadJson) : {};
    const stale = hasColumn(model, 'optLockVersion')
      ? Number(row.optLockVersion) !== Number(change.baseOptLock)
      : new Date(row.updatedAt).getTime() !== new Date(payload.baseUpdatedAt).getTime();
    if (stale) throw new LoanError(409, 'Record changed since this change was submitted; reject it and resubmit');

    const before = plain(row);
    if (change.action === 'UPDATE') {
      const merged = { ...before, ...payload.values };
      runRules(def, merged);
      await checkRefs(def, merged, { forAuthorize: true, transaction });
      const updates = { ...payload.values, checkerId: ctx.userId, authorizedAt: new Date() };
      if (hasColumn(model, 'optLockVersion')) updates.optLockVersion = row.optLockVersion + 1;
      await row.update(updates, { transaction });
    } else if (change.action === 'DELETE') {
      const updates = { authStatus: 'CLOSED', checkerId: ctx.userId, authorizedAt: new Date() };
      if (hasColumn(model, 'effectiveTo')) updates.effectiveTo = today();
      if (hasColumn(model, 'expiryDate')) updates.expiryDate = today();
      if (hasColumn(model, 'optLockVersion')) updates.optLockVersion = row.optLockVersion + 1;
      await row.update(updates, { transaction });
    }
    await change.update({ status: 'AUTHORIZED', checkerId: ctx.userId, authorizedAt: new Date() }, { transaction });
    await audit({ entityName: def.name, key: change.entityKey, actionType: self ? 'SELF_AUTH' : 'AUTH', oldValues: before, newValues: plain(row), userId: ctx.userId, ip: ctx.ip }, transaction);
    return row;
  });
  await runAuthorizedHooks(def.name, result);
  return respondRow(result, 'Change authorized');
};

const rejectChange = async (id, ctx, remarks) => db.sequelize.transaction(async (transaction) => {
  const change = await findChange(id, transaction);
  await assertChecker(change.makerId, ctx.userId, transaction);
  await change.update({ status: 'REJECTED', checkerId: ctx.userId, remarks: remarks || null }, { transaction });
  await audit({ entityName: change.entityName, key: change.entityKey, actionType: 'REJECT', newValues: { changeId: change.id, remarks: remarks || null }, userId: ctx.userId, ip: ctx.ip }, transaction);
  return respondRow(change, 'Change rejected');
});

// ----------------------------------------------------------------------------- products

const cloneProduct = async (sourceId, body, ctx) => {
  const def = resolveEntity('product');
  const productCode = body && body.productCode ? String(body.productCode).trim().toUpperCase() : null;
  if (!productCode) throw new LoanError(400, 'productCode is required');
  const { values } = await validatePayload(def, { productCode, ...(body.name ? { name: body.name } : {}) }, 'update');
  return db.sequelize.transaction(async (transaction) => {
    const source = await findRow(def, sourceId, transaction);
    const base = plain(source);
    ['id', 'createdAt', 'updatedAt', ...SYSTEM_FIELDS].forEach(f => delete base[f]);
    const row = await modelOf(def).create({
      ...base, ...values, name: values.name || `${source.name} (Copy)`, version: 1, status: 'ACTIVE',
      authStatus: 'PENDING', makerId: ctx.userId, checkerId: null, authorizedAt: null
    }, { transaction });
    await copyProductChildren(def, source.id, row.id, ctx, transaction);
    await audit({ entityName: def.name, key: row.id, actionType: 'CREATE', oldValues: { clonedFrom: source.id }, newValues: plain(row), userId: ctx.userId, ip: ctx.ip }, transaction);
    return row;
  });
};

// ----------------------------------------------------------------------------- hooks

// Listeners run after a successful authorization: fn(entityName, row)
const onAuthorized = (fn) => authorizedHooks.push(fn);
// The authorization is already committed; a failing listener is logged, not reported as a failed request
const runAuthorizedHooks = async (entityName, row) => {
  for (const fn of authorizedHooks) {
    try {
      await fn(entityName, row);
    } catch (err) {
      logger.error(`[loan] post-authorization hook failed for ${entityName}: ${err.message}`);
    }
  }
};

module.exports = {
  resolveEntity,
  validatePayload,
  list,
  get,
  create,
  update,
  remove,
  authorize,
  bulkAuthorize,
  reject,
  listChanges,
  listPendingRecords,
  authorizeChange,
  rejectChange,
  changeFunctionCode,
  cloneProduct,
  onAuthorized,
  entityForModel
};
