/**
 * Phase 6 Stage 2, R1: which branch a loan application belongs to, and the re-checks at submit, approve
 * and book. A branch is a POS location (location.id). There is no default branch anywhere: a branch that
 * cannot be determined is an error.
 *
 *  - With a vehicle sale: the sale's locationId. Any branchId in the request is ignored. The sale must be
 *    at one of the maker's branches unless the maker holds LN_ALL_BRANCHES (403), and a sale without a
 *    location is refused (409).
 *  - Without a sale: the maker's single branch (a branchId in the request is ignored). A maker with
 *    several branches, or with LN_ALL_BRANCHES, must pick one (branchId) within their scope. A maker with
 *    no branch (no active terminal) is refused (403).
 *  - Re-check (submit, approve, book): the sale is still at the application's branch, and the maker still
 *    works at that branch (or holds LN_ALL_BRANCHES). The acting user is checked by the router (scoped).
 */
const db = require('../../models');
const { LoanError } = require('../errors');
const { scopeOf, inScope } = require('./branchScope');

const saleBranch = async (saleId, transaction) => {
  const sale = await db.saleHeader.findByPk(saleId, { attributes: ['id', 'locationId'], transaction });
  if (!sale) throw new LoanError(400, `Sale ${saleId} not found`);
  if (sale.locationId === null || sale.locationId === undefined) throw new LoanError(409, `Sale ${saleId} has no location, so its branch is unknown; set the sale's location in the POS first`);
  return Number(sale.locationId);
};

const resolveApplicationBranch = async ({ makerId, saleId, chosen, transaction }) => {
  const scope = await scopeOf(makerId);
  if (saleId !== undefined && saleId !== null && saleId !== '') {
    const branch = await saleBranch(saleId, transaction);
    if (!inScope(scope, branch)) throw new LoanError(403, `Forbidden: sale ${saleId} belongs to a branch outside yours`);
    return branch;
  }
  if (!scope.all && scope.branches.length === 0) throw new LoanError(403, 'Forbidden: you are not linked to any branch (no active POS terminal), so you cannot make a loan application');
  if (!scope.all && scope.branches.length === 1) return scope.branches[0];
  if (chosen === undefined || chosen === null || chosen === '') {
    throw new LoanError(400, scope.all ? 'branchId is required: you work at every branch, so pick the application\'s branch' : `branchId is required: you work at branches ${scope.branches.join(', ')}, so pick one`);
  }
  const id = Number(chosen);
  if (!Number.isInteger(id) || id <= 0) throw new LoanError(400, 'branchId must be a location id');
  if (scope.all) {
    if (!(await db.location.findByPk(id, { attributes: ['id'], transaction }))) throw new LoanError(400, `Location ${id} not found`);
    return id;
  }
  if (!scope.branches.includes(id)) throw new LoanError(403, `Forbidden: branch ${id} is not one of yours (${scope.branches.join(', ')})`);
  return id;
};

const assertApplicationBranch = async (app, step, transaction) => {
  if (app.branchId === null || app.branchId === undefined) throw new LoanError(409, `Application ${app.appNo || app.id} has no branch; it cannot be ${step}`);
  const branch = Number(app.branchId);
  if (app.vehicleSaleHeaderId) {
    const now = await saleBranch(app.vehicleSaleHeaderId, transaction);
    if (now !== branch) throw new LoanError(409, `The sale of application ${app.appNo || app.id} is now at location ${now}, not at the application's branch ${branch}; it cannot be ${step}`);
  }
  if (!inScope(await scopeOf(app.makerId), branch)) {
    throw new LoanError(403, `Forbidden: the maker (user ${app.makerId}) no longer works at branch ${branch}; application ${app.appNo || app.id} cannot be ${step}`);
  }
  return branch;
};

module.exports = { resolveApplicationBranch, assertApplicationBranch };
