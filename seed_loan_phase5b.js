/**
 * Phase 5 Part B Seed Script, per-currency amounts and operational screens (run after the Phase 5 seed).
 * Strictly idempotent; existing rows and values are never overwritten.
 * - Base currency only: offered-currency rows without limits get the product's minAmount/maxAmount, and fixed
 *   amounts (FIXED_CONTRACT_FEE components, AMOUNT UDEs) are copied to ln_product_amount, with the product
 *   child's own authorization state. These values were already base-currency amounts; other currencies stay
 *   unset, so a product offering them cannot be authorized until someone enters them.
 * - Security: LN_COLLECTION (VIEW), LN_REPORT (VIEW), LN_DOCUMENT (VIEW, CREATE), granted to SUPER_ADMIN only.
 * - SPF LOAN_DOC_MAX_MB = 5 (largest account document accepted).
 */
process.env.NO_SYNC = 'true';
require('./src/loan/dbGuard').assertLocalDb('seed_loan_phase5b');
const db = require('./src/models');
const { registerFunctions, grantToGroupCodes } = require('./src/security/grantService');

const BACKFILL = [
  `UPDATE ln_product_currency pc
     JOIN ln_product p ON p.id = pc.productId
     JOIN currency c ON c.id = pc.currencyId AND c.isLocalCCY = 1
      SET pc.minAmount = p.minAmount, pc.maxAmount = p.maxAmount
    WHERE pc.minAmount IS NULL AND pc.maxAmount IS NULL`,
  `INSERT IGNORE INTO ln_product_amount (productId, currencyId, itemType, itemCode, defaultValue, \`minValue\`, \`maxValue\`, authStatus, makerId, checkerId, authorizedAt, createdAt, updatedAt)
   SELECT pcm.productId, pc.currencyId, 'COMPONENT', cm.componentCode, pcm.defaultValue, pcm.\`minValue\`, pcm.\`maxValue\`, pcm.authStatus, pcm.makerId, pcm.checkerId, pcm.authorizedAt, NOW(), NOW()
     FROM ln_product_component pcm
     JOIN ln_component cm ON cm.id = pcm.componentId
     JOIN ln_product_currency pc ON pc.productId = pcm.productId
     JOIN currency c ON c.id = pc.currencyId AND c.isLocalCCY = 1
    WHERE pcm.formulaCode = 'FIXED_CONTRACT_FEE'`,
  `INSERT IGNORE INTO ln_product_amount (productId, currencyId, itemType, itemCode, defaultValue, \`minValue\`, \`maxValue\`, authStatus, makerId, checkerId, authorizedAt, createdAt, updatedAt)
   SELECT pu.productId, pc.currencyId, 'UDE', pu.udeCode, pu.defaultValue, pu.\`minValue\`, pu.\`maxValue\`, pu.authStatus, pu.makerId, pu.checkerId, pu.authorizedAt, NOW(), NOW()
     FROM ln_product_ude pu
     JOIN ln_ude u ON u.udeCode = pu.udeCode AND u.dataType = 'AMOUNT'
     JOIN ln_product_currency pc ON pc.productId = pu.productId
     JOIN currency c ON c.id = pc.currencyId AND c.isLocalCCY = 1`
];

async function seedPhase5b() {
  console.log('--- Starting Phase 5 Part B Seeding ---');
  try {
    let changed = 0;
    for (const sql of BACKFILL) {
      const [, meta] = await db.sequelize.query(sql);
      changed += Number((meta && (meta.affectedRows !== undefined ? meta.affectedRows : meta)) || 0);
    }
    await db.spf.findOrCreate({ where: { code: 'LOAN_DOC_MAX_MB' }, defaults: { code: 'LOAN_DOC_MAX_MB', value: '5', remark: 'Loan module: largest account document accepted (MB); PDF, JPG and PNG only.', isActive: true } });
    await registerFunctions(db, 'LN', [
      { functionCode: 'LN_COLLECTION', name: 'Loan collection list', llname: 'ລາຍການຕິດຕາມໜີ້', actions: ['VIEW'] },
      { functionCode: 'LN_REPORT', name: 'Loan reports', llname: 'ລາຍງານສິນເຊື່ອ', actions: ['VIEW'] },
      { functionCode: 'LN_DOCUMENT', name: 'Loan account documents', llname: 'ເອກະສານບັນຊີສິນເຊື່ອ', actions: ['VIEW', 'CREATE'] }
    ]);
    const grants = await grantToGroupCodes(db, ['SUPER_ADMIN'], ['LN_COLLECTION', 'LN_REPORT', 'LN_DOCUMENT']);
    console.log(`Phase 5B base-currency amounts filled: ${changed} row(s); grants: ${grants.join(', ') || 'none'}`);
    console.log('--- Phase 5 Part B Seeding Completed ---');
    process.exit(0);
  } catch (err) {
    console.error('Phase 5 Part B Seeding Failed:', err);
    process.exit(1);
  }
}

seedPhase5b();
