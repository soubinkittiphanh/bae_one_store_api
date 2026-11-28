/**
 * Mobile permissions, step 4: the API refuses what a group is not granted (security/middleware.js requirePosGrant).
 *
 * Registers the functions the routers now check, on top of 20261128_mobile_menu_grants (PRODUCT, STOCK, POS_DISCOUNT):
 *  - USER        EDIT  create / change / deactivate / delete user accounts (own profile always allowed)
 *  - USER_GROUP  EDIT  create / change user groups and their menu headers
 *  - POS_TICKET  VOID  cancel a bill or a restaurant ticket; kept equal to userGroup.ticketCancel both ways
 *                      (group/controller.js, security/controller.js setGrant)
 *
 * Starting grants keep today's behaviour: USER and USER_GROUP for SUPER_ADMIN and groups holding the ADMIN menu
 * header, POS_TICKET VOID for groups whose ticketCancel is on. Written once, with sec_audit_log rows (SEED).
 */
const NAME = '20261129_pos_grants_enforced';
const { helpers } = require('./20261128_mobile_menu_grants');
const { tableExists, ensureMarkerTable, grantFunction } = helpers;

const FUNCTIONS = [
  { functionCode: 'USER', moduleCode: 'POS', name: 'User accounts', llname: 'ຈັດການບັນຊີຜູ້ໃຊ້', actions: ['EDIT'] },
  { functionCode: 'USER_GROUP', moduleCode: 'POS', name: 'User groups and their menus', llname: 'ຈັດການກຸ່ມຜູ້ໃຊ້ ແລະ ເມນູ', actions: ['EDIT'] },
  { functionCode: 'POS_TICKET', moduleCode: 'POS', name: 'Cancel bills and tickets', llname: 'ຍົກເລີກບິນ', actions: ['VOID'] }
];
const CODES = FUNCTIONS.map(f => f.functionCode);

const markerExists = async q =>
  (await tableExists(q, 'pos_schema_migrations')) &&
  (await q('SELECT 1 FROM `pos_schema_migrations` WHERE `name` = ?', [NAME])).length > 0;

module.exports = {
  name: NAME,
  FUNCTIONS,

  async isApplied(q) {
    return markerExists(q);
  },

  async up(q) {
    const hasSecurity = (await tableExists(q, 'sec_function')) && (await tableExists(q, 'sec_group_grant')) &&
      (await tableExists(q, 'sec_audit_log'));
    if (hasSecurity) {
      for (const f of FUNCTIONS) {
        await q(
          'INSERT INTO `sec_function` (`functionCode`, `moduleCode`, `name`, `llname`, `applicableActions`, `isActive`, `createdAt`, `updatedAt`) ' +
          'VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW()) ON DUPLICATE KEY UPDATE `moduleCode` = VALUES(`moduleCode`), `name` = VALUES(`name`), ' +
          '`llname` = VALUES(`llname`), `applicableActions` = VALUES(`applicableActions`), `isActive` = 1, `updatedAt` = NOW()',
          [f.functionCode, f.moduleCode, f.name, f.llname, f.actions.join(',')]
        );
      }
      const byCode = Object.fromEntries(FUNCTIONS.map(f => [f.functionCode, f]));
      const groups = await q('SELECT `id`, `code`, `ticketCancel` FROM `userGroup`');
      const adminGroups = new Set((await q(
        'SELECT DISTINCT gmh.`userGroupId` AS id FROM `GroupMenuHeader` gmh JOIN `menuHeader` mh ON mh.`id` = gmh.`menuHeaderId` ' +
        "WHERE mh.`code` = 'ADMIN'"
      )).map(r => Number(r.id)));
      for (const g of groups) {
        const group = { id: Number(g.id), code: g.code };
        if (String(g.code).toUpperCase() === 'SUPER_ADMIN' || adminGroups.has(group.id)) {
          await grantFunction(q, group, byCode.USER);
          await grantFunction(q, group, byCode.USER_GROUP);
        }
        if (g.ticketCancel === 1 || g.ticketCancel === true || g.ticketCancel === '1') {
          await grantFunction(q, group, byCode.POS_TICKET);
        }
      }
    }
    await ensureMarkerTable(q);
    await q('INSERT IGNORE INTO `pos_schema_migrations` (`name`) VALUES (?)', [NAME]);
  },

  // Removes these functions and their grants; the routers then allow everything again (requirePosGrant).
  async down(q) {
    if (await tableExists(q, 'sec_group_grant')) {
      const marks = CODES.map(() => '?').join(', ');
      await q(`DELETE FROM \`sec_group_grant\` WHERE \`functionCode\` IN (${marks})`, CODES);
      await q(`DELETE FROM \`sec_function\` WHERE \`functionCode\` IN (${marks})`, CODES);
    }
    if (await tableExists(q, 'pos_schema_migrations')) {
      await q('DELETE FROM `pos_schema_migrations` WHERE `name` = ?', [NAME]);
    }
  }
};
