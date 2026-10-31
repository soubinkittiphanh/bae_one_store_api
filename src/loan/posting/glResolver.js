/**
 * Accounting role -> chart_of_account id (Phase 4). Nothing posts to a guessed account:
 *   MAPPING_TABLE  AUTHORIZED ln_role_gl_mapping effective on the date, most specific match wins
 *                  (status qualifier, product, category, branch, currency); ties or no match refuse
 *   SYSTEM_PARAM   SPF parameter via AccountingPostingService.getMappedAccountId
 *   BANK_ACCOUNT   the transaction's bankAccountId -> the chart account with the same number (no fuzzy fallback)
 * Off-balance roles must map to Off-Balance accounts and on-balance roles to on-balance accounts.
 */
const db = require('../../models');
const AccountingPostingService = require('../../GL/accountingPostingService');
const { LoanError } = require('../errors');

const SYSTEM_PARAMS = { SALE_RECEIVABLE: 'GL_MAP_AR_ACC', TAX_PAYABLE: 'GL_MAP_VAT_OUTPUT_ACC' };

const effective = (rows, date) => rows.filter(r => String(r.effectiveFrom) <= date && (!r.effectiveTo || String(r.effectiveTo) >= date));

const makeResolver = async ({ date, transaction }) => {
  const [roles, mappings] = await Promise.all([
    db.lnAccountingRole.findAll({ transaction }),
    db.lnRoleGlMapping.findAll({ where: { authStatus: 'AUTHORIZED' }, transaction })
  ]);
  const roleOf = Object.fromEntries(roles.map(r => [r.roleCode, r]));
  const live = effective(mappings.map(m => m.get({ plain: true })), date);
  const accountCache = {};
  const chart = async (id) => {
    if (!accountCache[id]) accountCache[id] = await db.chartAccount.findByPk(id, { transaction });
    return accountCache[id];
  };

  const fromMapping = (roleCode, ctx) => {
    const match = (field, value) => r => r[field] == null || Number(r[field]) === Number(value);
    const candidates = live.filter(r => r.roleCode === roleCode
      && (r.statusQualifier == null || r.statusQualifier === ctx.qualifier)
      && match('productId', ctx.productId)(r) && match('categoryId', ctx.categoryId)(r)
      && match('branchId', ctx.branchId)(r) && match('currencyId', ctx.currencyId)(r));
    if (ctx.qualifier && !candidates.some(r => r.statusQualifier === ctx.qualifier)) {
      throw new LoanError(409, `No authorized GL mapping for ${roleCode} with status qualifier ${ctx.qualifier}`);
    }
    const score = r => (r.statusQualifier ? 16 : 0) + (r.productId ? 8 : 0) + (r.categoryId ? 4 : 0) + (r.branchId ? 2 : 0) + (r.currencyId ? 1 : 0);
    const ranked = candidates.map(r => [score(r), r]).sort((a, b) => b[0] - a[0]);
    if (!ranked.length) throw new LoanError(409, `No authorized GL mapping for accounting role ${roleCode}`);
    if (ranked.length > 1 && ranked[0][0] === ranked[1][0]) throw new LoanError(409, `Ambiguous GL mappings for ${roleCode}: ${ranked.filter(x => x[0] === ranked[0][0]).length} rows match equally`);
    return ranked[0][1].chartAccountId;
  };

  const fromSystemParam = async (roleCode) => {
    const code = SYSTEM_PARAMS[roleCode];
    if (!code) throw new LoanError(409, `No system parameter defined for role ${roleCode}`);
    try {
      return await AccountingPostingService.getMappedAccountId(code);
    } catch (err) {
      throw new LoanError(409, `${roleCode}: ${err.message}`);
    }
  };

  const fromBankAccount = async (ctx) => {
    if (!ctx.bankAccountId) throw new LoanError(400, 'bankAccountId is required for a cash or bank movement');
    const bank = await db.bankAccount.findByPk(ctx.bankAccountId, { transaction });
    if (!bank || bank.isActive === false) throw new LoanError(400, `Bank account ${ctx.bankAccountId} not found or inactive`);
    const account = await db.chartAccount.findOne({ where: { accountNumber: bank.accountNumber, isActive: true }, transaction });
    if (!account) throw new LoanError(409, `Bank account ${bank.accountName} (number ${bank.accountNumber}) has no active chart_of_account with the same number`);
    return account.id;
  };

  // line: { roleCode, qualifier }; ctx: { productId, categoryId, branchId, currencyId, bankAccountId }
  return async (line, ctx) => {
    const role = roleOf[line.roleCode];
    if (!role) throw new LoanError(409, `Unknown accounting role ${line.roleCode}`);
    if (role.authStatus && role.authStatus !== 'AUTHORIZED') throw new LoanError(409, `Accounting role ${line.roleCode} is ${role.authStatus}; a checker must authorize it before anything posts to it`);
    let id;
    if (role.resolverType === 'MAPPING_TABLE') id = fromMapping(line.roleCode, { ...ctx, qualifier: line.qualifier || null });
    else if (role.resolverType === 'SYSTEM_PARAM') id = await fromSystemParam(line.roleCode);
    else if (role.resolverType === 'BANK_ACCOUNT') id = await fromBankAccount(ctx);
    else throw new LoanError(409, `Unsupported resolver ${role.resolverType} for ${line.roleCode}`);
    const account = await chart(id);
    if (!account || account.isActive === false) throw new LoanError(409, `${line.roleCode} maps to chart account ${id}, which is missing or inactive`);
    const offRole = role.expectedType === 'Off-Balance';
    if (offRole !== (account.accountType === 'Off-Balance')) {
      throw new LoanError(409, `${line.roleCode} (${role.expectedType}) maps to ${account.accountNumber} of type ${account.accountType}`);
    }
    return { chartAccountId: account.id, accountType: account.accountType, roleType: role.expectedType };
  };
};

module.exports = { makeResolver, SYSTEM_PARAMS };
