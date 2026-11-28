/**
 * Mobile permissions, step 1: let dc_pos use the same group setup as the web.
 *
 *  - menuLine.mobileKey: the dc_pos screens a menu line opens, comma separated. A group reaches a screen when
 *    one of its menu headers holds a line with that key (GET /api/security/my-permissions -> mobileKeys).
 *    Existing lines get keys by their web path, so a group keeps (about) the access it has on the web.
 *  - sec_function rows for what dc_pos checks before an action (module POS), plus the security module's own
 *    SEC_GRANT (same definition as src/security/grantService.js ensureSecurityFunctions).
 *  - Starting grants that keep today's behaviour: groups with the INVENTORY header may create / edit / delete
 *    products and change stock, every group may give a bill discount, SUPER_ADMIN manages the grant matrix.
 *    Written once, with sec_audit_log rows (source SEED); later changes are made in the grant matrix.
 *
 * Bill cancel stays on userGroup.ticketCancel (enforced in sales/controller.js) until the API checks a grant.
 * Same conventions as the other POS migrations: idempotent, runs at startup and via `node pos_migrate.js`.
 */
const NAME = '20261128_mobile_menu_grants';

// web path -> dc_pos screen keys (lib/helper/app_permission.dart MobileScreen)
const PATH_KEYS = [
  [['/admin/saleDashBoard'], 'dashboard'],
  [['/admin/saleReportDetailByProduct', '/admin/saleReportDetailByUser'], 'reports.sales'],
  [['/admin/pl', '/reports/profit-loss', '/reports/financial/pl'], 'reports.profit_loss'],
  [['/admin/minstock'], 'inventory.low_stock,inventory.forecast'],
  [['/reports/stock-movement'], 'inventory.stock_movement'],
  [['/admin/product/productlist'], 'inventory.products,inventory.raw_materials'],
  [['/admin/category'], 'inventory.categories'],
  [['/admin/unit'], 'inventory.units'],
  [['/admin/location'], 'inventory.warehouses'],
  [['/admin/company'], 'admin.profile'],
  [['/admin/terminal'], 'admin.terminals'],
  [['/admin/spf'], 'admin.spf'],
  [['/admin/currency'], 'admin.currency'],
  [['/admin/payment'], 'admin.payment_types'],
  [['/admin/pos/table'], 'admin.tables'],
  [['/admin/user'], 'admin.users'],
  [['/admin/group'], 'admin.groups'],
  [['/admin/expense', '/admin/accounting/ap/invoice'], 'accounting.ap'],
  [['/admin/income', '/admin/accounting/ar/invoice'], 'accounting.ar'],
  [['/admin/parking/zones', '/admin/parking/pricing', '/admin/parking/vehicle-types'], 'parking.settings'],
  [['/admin/parking/reports'], 'parking.dashboard']
];

const FUNCTIONS = [
  { functionCode: 'SEC_GRANT', moduleCode: 'SEC', name: 'User group access rights', llname: 'ສິດການເຂົ້າເຖິງຂອງກຸ່ມຜູ້ໃຊ້', actions: ['VIEW', 'EDIT'] },
  { functionCode: 'PRODUCT', moduleCode: 'POS', name: 'Products and menu items', llname: 'ສ້າງ / ແກ້ໄຂ / ປິດ ສິນຄ້າ', actions: ['CREATE', 'EDIT', 'DELETE'] },
  { functionCode: 'STOCK', moduleCode: 'POS', name: 'Add or adjust stock', llname: 'ເພີ່ມ / ປັບ ສະຕັອກ', actions: ['EDIT'] },
  { functionCode: 'POS_DISCOUNT', moduleCode: 'POS', name: 'Bill discount', llname: 'ໃຫ້ສ່ວນຫຼຸດໃນບິນ', actions: ['CREATE'] }
];
const POS_FUNCTIONS = FUNCTIONS.filter(f => f.moduleCode === 'POS').map(f => f.functionCode);

const tableExists = async (q, table) =>
  (await q('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table])).length > 0;

const columnExists = async (q, table, col) =>
  (await q('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, col])).length > 0;

const markerExists = async q =>
  (await tableExists(q, 'pos_schema_migrations')) &&
  (await q('SELECT 1 FROM `pos_schema_migrations` WHERE `name` = ?', [NAME])).length > 0;

const ensureMarkerTable = q => q(
  'CREATE TABLE IF NOT EXISTS `pos_schema_migrations` (`name` VARCHAR(100) NOT NULL PRIMARY KEY, ' +
  '`appliedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
);

// The grant matrix shows one column per sec_action row; only the loan SQL seeds them, so a POS-only database
// would show no checkboxes. Same codes and order as 20261029_loan_phase2a_corrections.sql.
const ACTIONS = [['VIEW', 'View', 10], ['CREATE', 'Create', 20], ['EDIT', 'Edit', 30], ['DELETE', 'Delete', 40],
  ['AUTHORIZE', 'Authorize', 50], ['VOID', 'Void', 60], ['CLOSE', 'Close', 70], ['OPEN', 'Open', 80]];
const ensureActions = async q => {
  if (!(await tableExists(q, 'sec_action'))) return;
  for (const [code, name, order] of ACTIONS) {
    await q('INSERT IGNORE INTO `sec_action` (`actionCode`, `name`, `sortOrder`, `isActive`, `createdAt`, `updatedAt`) ' +
      'VALUES (?, ?, ?, 1, NOW(), NOW())', [code, name, order]);
  }
};

// Grant one action and write its audit row, unless the group already has it.
const grant = async (q, group, functionCode, actionCode) => {
  const have = await q('SELECT 1 FROM `sec_group_grant` WHERE `userGroupId` = ? AND `functionCode` = ? AND `actionCode` = ?',
    [group.id, functionCode, actionCode]);
  if (have.length) return 0;
  await q('INSERT INTO `sec_group_grant` (`userGroupId`, `functionCode`, `actionCode`, `grantedBy`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, NULL, NOW(), NOW())',
    [group.id, functionCode, actionCode]);
  await q(
    'INSERT INTO `sec_audit_log` (`entityName`, `actionType`, `userId`, `userGroupId`, `groupCode`, `functionCode`, `actionCode`, ' +
    '`beforeValue`, `afterValue`, `source`, `createdAt`) VALUES (\'sec_group_grant\', \'GRANT\', NULL, ?, ?, ?, ?, ?, ?, \'SEED\', NOW())',
    [group.id, group.code, functionCode, actionCode, JSON.stringify({ granted: false }), JSON.stringify({ granted: true })]
  );
  return 1;
};

const grantFunction = async (q, group, def) => {
  let n = 0;
  for (const action of def.actions) n += await grant(q, group, def.functionCode, action);
  return n;
};

module.exports = {
  name: NAME,
  PATH_KEYS,
  FUNCTIONS,
  // shared with later security migrations
  helpers: { tableExists, columnExists, ensureMarkerTable, grantFunction, ensureActions },

  async isApplied(q) {
    return (await markerExists(q)) && (await columnExists(q, 'menuLine', 'mobileKey'));
  },

  async up(q) {
    const firstRun = !(await markerExists(q));

    if (!(await columnExists(q, 'menuLine', 'mobileKey'))) {
      await q('ALTER TABLE `menuLine` ADD COLUMN `mobileKey` VARCHAR(255) NULL');
    }

    // Keys only where none is set, so keys an admin has changed are kept on a re-run
    for (const [paths, keys] of PATH_KEYS) {
      await q(
        `UPDATE \`menuLine\` SET \`mobileKey\` = ? WHERE \`path\` IN (${paths.map(() => '?').join(', ')}) ` +
        "AND (`mobileKey` IS NULL OR `mobileKey` = '')",
        [keys, ...paths]
      );
    }

    const hasSecurity = (await tableExists(q, 'sec_function')) && (await tableExists(q, 'sec_group_grant')) &&
      (await tableExists(q, 'sec_audit_log'));
    if (hasSecurity) {
      await ensureActions(q);
      for (const f of FUNCTIONS) {
        await q(
          'INSERT INTO `sec_function` (`functionCode`, `moduleCode`, `name`, `llname`, `applicableActions`, `isActive`, `createdAt`, `updatedAt`) ' +
          'VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW()) ON DUPLICATE KEY UPDATE `moduleCode` = VALUES(`moduleCode`), `name` = VALUES(`name`), ' +
          '`llname` = VALUES(`llname`), `applicableActions` = VALUES(`applicableActions`), `isActive` = 1, `updatedAt` = NOW()',
          [f.functionCode, f.moduleCode, f.name, f.llname, f.actions.join(',')]
        );
      }

      // Starting grants only once: after that the grant matrix is the owner of these rows
      if (firstRun) {
        const byCode = Object.fromEntries(FUNCTIONS.map(f => [f.functionCode, f]));
        const groups = await q('SELECT `id`, `code` FROM `userGroup`');
        const inventoryGroups = new Set((await q(
          'SELECT DISTINCT gmh.`userGroupId` AS id FROM `GroupMenuHeader` gmh JOIN `menuHeader` mh ON mh.`id` = gmh.`menuHeaderId` ' +
          "WHERE mh.`code` = 'INVENTORY'"
        )).map(r => Number(r.id)));

        for (const g of groups) {
          const group = { id: Number(g.id), code: g.code };
          const isSuper = String(g.code).toUpperCase() === 'SUPER_ADMIN';
          if (isSuper) await grantFunction(q, group, byCode.SEC_GRANT);
          if (isSuper || inventoryGroups.has(group.id)) {
            await grantFunction(q, group, byCode.PRODUCT);
            await grantFunction(q, group, byCode.STOCK);
          }
          await grantFunction(q, group, byCode.POS_DISCOUNT);
        }
      }
    }

    await ensureMarkerTable(q);
    await q('INSERT IGNORE INTO `pos_schema_migrations` (`name`) VALUES (?)', [NAME]);
  },

  // Removes the column, the POS functions and their grants. SEC_GRANT stays: other modules (loan) use it.
  async down(q) {
    if (await tableExists(q, 'sec_group_grant')) {
      const marks = POS_FUNCTIONS.map(() => '?').join(', ');
      await q(`DELETE FROM \`sec_group_grant\` WHERE \`functionCode\` IN (${marks})`, POS_FUNCTIONS);
      await q(`DELETE FROM \`sec_function\` WHERE \`functionCode\` IN (${marks})`, POS_FUNCTIONS);
    }
    if (await columnExists(q, 'menuLine', 'mobileKey')) await q('ALTER TABLE `menuLine` DROP COLUMN `mobileKey`');
    if (await tableExists(q, 'pos_schema_migrations')) {
      await q('DELETE FROM `pos_schema_migrations` WHERE `name` = ?', [NAME]);
    }
  }
};
