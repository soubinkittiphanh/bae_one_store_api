/**
 * Proposed GL accounts for the loan roles (docs/loan/rev5-accounting-addendum.md §5).
 * Every number is a PROPOSAL to be matched against the customer's real chart of accounts.
 * proposeAccounts() is read-only: it never creates accounts or role-to-GL mappings.
 */
const { Op } = require('sequelize');

// feature: null = needed with the defaults; otherwise the option that needs it
const PROPOSALS = [
  { roleCode: 'LOAN_PORTFOLIO', qualifiers: ['NORMAL', 'WATCH'], fiveQualifiers: ['NORMAL'], number: '1211', name: 'Vehicle installment loans - performing', llname: 'ເງິນກູ້ຊື້ລົດຜ່ອນ (ປົກກະຕິ)', type: 'Asset', feature: null },
  { roleCode: 'LOAN_PORTFOLIO', qualifiers: [], fiveQualifiers: ['WATCH'], number: '1212', name: 'Vehicle installment loans - special mention', llname: 'ເງິນກູ້ຊື້ລົດ (ຄວນເອົາໃຈໃສ່)', type: 'Asset', feature: 'FIVE_PORTFOLIO' },
  { roleCode: 'LOAN_PORTFOLIO', qualifiers: ['SUBSTANDARD', 'DOUBTFUL', 'LOSS'], fiveQualifiers: ['SUBSTANDARD'], number: '1213', name: 'Vehicle installment loans - non-performing', llname: 'ເງິນກູ້ຊື້ລົດຜ່ອນ (ໜີ້ບໍ່ເກີດດອກອອກຜົນ)', type: 'Asset', feature: null },
  { roleCode: 'LOAN_PORTFOLIO', qualifiers: [], fiveQualifiers: ['DOUBTFUL'], number: '1214', name: 'Vehicle installment loans - doubtful', llname: 'ເງິນກູ້ຊື້ລົດ (ໜີ້ສົງໄສ)', type: 'Asset', feature: 'FIVE_PORTFOLIO' },
  { roleCode: 'LOAN_PORTFOLIO', qualifiers: [], fiveQualifiers: ['LOSS'], number: '1215', name: 'Vehicle installment loans - loss', llname: 'ເງິນກູ້ຊື້ລົດ (ໜີ້ສູນ)', type: 'Asset', feature: 'FIVE_PORTFOLIO' },
  { roleCode: 'INTEREST_RECEIVABLE', number: '1221', name: 'Loan interest receivable', llname: 'ດອກເບ້ຍເງິນກູ້ຄ້າງຮັບ', type: 'Asset', feature: null },
  { roleCode: 'PENALTY_RECEIVABLE', number: '1222', name: 'Penalty receivable', llname: 'ຄ່າປັບໄໝຄ້າງຮັບ', type: 'Asset', feature: 'BILL_PENALTY' },
  { roleCode: 'FEE_RECEIVABLE', number: '1223', name: 'Loan fees receivable', llname: 'ຄ່າທຳນຽມເງິນກູ້ຄ້າງຮັບ', type: 'Asset', feature: 'BILLED_FEES' },
  { roleCode: 'INSURANCE_RECEIVABLE', number: '1224', name: 'Insurance receivable', llname: 'ຄ່າປະກັນໄພລົດຄ້າງຮັບ', type: 'Asset', feature: 'BILLED_FEES' },
  { roleCode: 'UNAMORTIZED_FEE_CONTRA', number: '1228', name: 'Unamortized loan fees (contra)', llname: 'ຄ່າທຳນຽມລໍຖ້າຕັດຈ່າຍ', type: 'Asset', feature: 'DEFERRED_FEES' },
  { roleCode: 'PROVISION_RESERVE', number: '1229', name: 'Allowance for loan losses (contra)', llname: 'ຄັງສຳຮອງໜີ້ເສຍເງິນກູ້', type: 'Asset', feature: null },
  { roleCode: 'REPOSSESSED_VEHICLE_ASSET', number: '1311', name: 'Repossessed vehicles held for sale', llname: 'ລົດຍຶດລໍຖ້າຂາຍ', type: 'Asset', feature: null },
  { roleCode: 'CUSTOMER_ADVANCE_LIAB', number: '2111', name: 'Customer loan advances', llname: 'ເງິນຈ່າຍລ່ວງໜ້າຂອງລູກຄ້າ', type: 'Liability', feature: null },
  { roleCode: 'INSURANCE_PAYABLE', number: '2121', name: 'Insurance premiums payable', llname: 'ຄ່າປະກັນໄພລົດຄ້າງຈ່າຍ', type: 'Liability', feature: null },
  { roleCode: 'TAX_PAYABLE', number: '2131', name: 'Output VAT payable', llname: 'ອາກອນມູນຄ່າເພີ່ມຄ້າງຈ່າຍ', type: 'Liability', feature: 'VAT', systemParam: 'GL_MAP_VAT_OUTPUT_ACC' },
  { roleCode: 'SUSPENDED_INTEREST', number: '2141', name: 'Suspended interest (NPL)', llname: 'ດອກເບ້ຍໂຈະຮັບ', type: 'Liability', feature: null },
  { roleCode: 'DEFERRED_FEE', number: '2151', name: 'Deferred loan fees', llname: 'ລາຍຮັບຄ່າທຳນຽມລໍຖ້າຮັບຮູ້', type: 'Liability', feature: 'DEFERRED_FEES' },
  { roleCode: 'INTEREST_INCOME', number: '4201', name: 'Loan interest income', llname: 'ລາຍຮັບດອກເບ້ຍເງິນກູ້', type: 'Revenue', feature: null },
  { roleCode: 'PENALTY_INCOME', number: '4202', name: 'Late penalty income', llname: 'ລາຍຮັບຄ່າປັບໄໝ', type: 'Revenue', feature: null },
  { roleCode: 'FEE_INCOME', number: '4203', name: 'Loan fee income', llname: 'ລາຍຮັບຄ່າທຳນຽມເງິນກູ້', type: 'Revenue', feature: null },
  { roleCode: 'GAIN_ON_REPOSSESSED_ASSET', number: '4301', name: 'Gain on sale of repossessed vehicles', llname: 'ກຳໄລຈາກການຂາຍລົດຍຶດ', type: 'Revenue', feature: null },
  { roleCode: 'BAD_DEBT_RECOVERY', number: '4302', name: 'Bad debt recovered', llname: 'ລາຍຮັບຈາກການທວງໜີ້ສູນຄືນ', type: 'Revenue', feature: null },
  { roleCode: 'PROVISION_EXPENSE', number: '5701', name: 'Loan loss provision expense', llname: 'ລາຍຈ່າຍສຳຮອງໜີ້ເສຍ', type: 'Expense', feature: null },
  { roleCode: 'LOAN_LOSS_SHORTFALL', number: '5702', name: 'Unprovisioned loan losses', llname: 'ລາຍຈ່າຍໜີ້ສູນສ່ວນເກີນຄັງສຳຮອງ', type: 'Expense', feature: null },
  { roleCode: 'PENALTY_WAIVER_EXPENSE', number: '5711', name: 'Penalties waived', llname: 'ລາຍຈ່າຍຍົກເວັ້ນຄ່າປັບໄໝ', type: 'Expense', feature: 'BILL_PENALTY' },
  { roleCode: 'FEE_WAIVER_EXPENSE', number: '5712', name: 'Fees waived', llname: 'ລາຍຈ່າຍຍົກເວັ້ນຄ່າທຳນຽມ', type: 'Expense', feature: 'BILLED_FEES' },
  { roleCode: 'INTEREST_WAIVER_EXPENSE', number: '5713', name: 'Interest waived', llname: 'ລາຍຈ່າຍຍົກເວັ້ນດອກເບ້ຍ', type: 'Expense', feature: null },
  { roleCode: 'PENALTY_WRITEOFF_EXPENSE', number: '5721', name: 'Penalties written off', llname: 'ລາຍຈ່າຍຕັດໜີ້ສູນຄ່າປັບໄໝ', type: 'Expense', feature: 'BILL_PENALTY' },
  { roleCode: 'FEE_WRITEOFF_EXPENSE', number: '5722', name: 'Fees written off', llname: 'ລາຍຈ່າຍຕັດໜີ້ສູນຄ່າທຳນຽມ', type: 'Expense', feature: 'BILLED_FEES' },
  { roleCode: 'LOSS_ON_REPOSSESSED_ASSET', number: '5731', name: 'Loss on sale of repossessed vehicles', llname: 'ຂາດທຶນຈາກການຂາຍລົດຍຶດ', type: 'Expense', feature: null },
  { roleCode: 'ROUNDING_DIFF', number: '5901', name: 'Currency rounding differences', llname: 'ຜົນຕ່າງການປັດເສດ', type: 'Expense', feature: 'FX' },
  { roleCode: 'WRITTEN_OFF_MEMO_DR', number: '9001', name: 'Written-off loans - memo', llname: 'ໜີ້ສູນຕິດຕາມນອກງົບ', type: 'Off-Balance', feature: null },
  { roleCode: 'WRITTEN_OFF_MEMO_CR', number: '9002', name: 'Written-off loans - memo contra', llname: 'ໜີ້ສູນຕິດຕາມນອກງົບ (ກົງກັນຂ້າມ)', type: 'Off-Balance', feature: null }
];

// Existing accounts are resolved through system parameters, never by number
const EXISTING_PARAMS = [
  { roleCode: 'SALE_RECEIVABLE', param: 'GL_MAP_AR_ACC' },
  { roleCode: 'CASH_BANK', param: 'GL_MAP_CASH_ACC', note: 'fallback; normally from the payment method or bank account' },
  { roleCode: 'CASH_BANK', param: 'GL_MAP_BANK_ACC', note: 'fallback; normally from the payment method or bank account' },
  { roleCode: 'TAX_PAYABLE', param: 'GL_MAP_VAT_OUTPUT_ACC', note: 'open decision; empty until the accountant names the account', feature: 'VAT' }
];

const FEATURES = ['VAT', 'BILL_PENALTY', 'BILLED_FEES', 'FX', 'DEFERRED_FEES', 'FIVE_PORTFOLIO'];

const normalizeName = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * options.features: subset of FEATURES (FIVE_PORTFOLIO switches to the five-account portfolio variant)
 * Returns { accounts: [...], params: [...], summary }. Read-only.
 */
const proposeAccounts = async (db, { features = [] } = {}) => {
  const unknown = features.filter(f => !FEATURES.includes(f));
  if (unknown.length) throw new Error(`Unknown feature(s): ${unknown.join(', ')}. Use: ${FEATURES.join(', ')}`);
  const five = features.includes('FIVE_PORTFOLIO');
  const chosen = PROPOSALS.filter(p => p.feature === null || features.includes(p.feature))
    .map(p => ({ ...p, qualifiers: p.qualifiers ? (five ? p.fiveQualifiers : p.qualifiers) : undefined }));

  const existing = await db.chartAccount.findAll({
    where: { accountNumber: { [Op.in]: chosen.map(p => p.number) } },
    attributes: ['id', 'accountNumber', 'accountName', 'accountType', 'isActive']
  });
  const byNumber = Object.fromEntries(existing.map(a => [String(a.accountNumber), a]));

  const accounts = chosen.map(p => {
    const hit = byNumber[p.number];
    let status = 'CREATE';
    let detail = null;
    if (hit) {
      const sameType = hit.accountType === p.type;
      const sameName = normalizeName(hit.accountName) === normalizeName(p.name);
      status = sameType && sameName ? 'REUSE' : 'COLLISION';
      detail = `existing #${hit.id} "${hit.accountName}" (${hit.accountType}${hit.isActive ? '' : ', inactive'})`;
    }
    const row = { roleCode: p.roleCode, number: p.number, name: p.name, llname: p.llname, type: p.type, status, detail };
    if (p.qualifiers) row.qualifiers = p.qualifiers;
    if (p.feature) row.feature = p.feature;
    return row;
  });

  const params = [];
  for (const e of EXISTING_PARAMS.filter(x => !x.feature || features.includes(x.feature))) {
    const spf = await db.spf.findOne({ where: { code: e.param } });
    const value = spf && spf.value != null ? String(spf.value).trim() : '';
    let status = 'OK';
    let detail = null;
    if (!spf) { status = 'MISSING_PARAM'; detail = 'parameter not found in SPF'; }
    else if (!value) { status = 'NOT_SET'; detail = 'parameter is empty'; }
    else {
      const acc = await db.chartAccount.findOne({ where: { accountNumber: value } });
      if (!acc) { status = 'ACCOUNT_NOT_FOUND'; detail = `no chart_of_account row with number ${value}`; }
      else detail = `#${acc.id} ${acc.accountNumber} "${acc.accountName}" (${acc.accountType})`;
    }
    params.push({ roleCode: e.roleCode, param: e.param, value, status, detail, note: e.note || null });
  }

  const count = s => accounts.filter(a => a.status === s).length;
  return {
    features,
    accounts,
    params,
    summary: { toCreate: count('CREATE'), reusable: count('REUSE'), collisions: count('COLLISION'), paramProblems: params.filter(p => p.status !== 'OK').length }
  };
};

module.exports = { PROPOSALS, EXISTING_PARAMS, FEATURES, proposeAccounts };
