/**
 * Mobile permissions, menu setup on dc_pos: menu headers and lines can now be edited from the mobile app too.
 *
 *  - MENU EDIT (sec_function): create / change / delete menu headers and lines; the routers check it
 *    (menu/router.js, menu/line/router.js). Before, any logged-in user could change every group's menus.
 *    Starting grants keep today's access: SUPER_ADMIN and groups holding the ADMIN menu header (where the web
 *    menu pages are).
 *  - mobileKey 'admin.menus' on the web menu-setup lines, so the same groups see the dc_pos menu-setup screen.
 */
const NAME = '20261201_menu_setup';
const { helpers } = require('./20261128_mobile_menu_grants');
const { tableExists, columnExists, ensureMarkerTable, grantFunction, ensureActions } = helpers;

const MENU = { functionCode: 'MENU', moduleCode: 'POS', name: 'Menu headers and lines', llname: 'ຕັ້ງຄ່າເມນູ', actions: ['EDIT'] };
const PATHS = ['/admin/menuHeader', '/admin/menuLine'];
const KEY = 'admin.menus';

const markerExists = async q =>
  (await tableExists(q, 'pos_schema_migrations')) &&
  (await q('SELECT 1 FROM `pos_schema_migrations` WHERE `name` = ?', [NAME])).length > 0;

module.exports = {
  name: NAME,

  async isApplied(q) {
    return markerExists(q);
  },

  async up(q) {
    if (await columnExists(q, 'menuLine', 'mobileKey')) {
      await q(
        "UPDATE `menuLine` SET `mobileKey` = ? WHERE `path` IN (?, ?) AND (`mobileKey` IS NULL OR `mobileKey` = '')",
        [KEY, ...PATHS]
      );
    }
    const hasSecurity = (await tableExists(q, 'sec_function')) && (await tableExists(q, 'sec_group_grant')) &&
      (await tableExists(q, 'sec_audit_log'));
    if (hasSecurity) {
      await ensureActions(q);
      await q(
        'INSERT INTO `sec_function` (`functionCode`, `moduleCode`, `name`, `llname`, `applicableActions`, `isActive`, `createdAt`, `updatedAt`) ' +
        'VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW()) ON DUPLICATE KEY UPDATE `moduleCode` = VALUES(`moduleCode`), `name` = VALUES(`name`), ' +
        '`llname` = VALUES(`llname`), `applicableActions` = VALUES(`applicableActions`), `isActive` = 1, `updatedAt` = NOW()',
        [MENU.functionCode, MENU.moduleCode, MENU.name, MENU.llname, MENU.actions.join(',')]
      );
      const adminGroups = new Set((await q(
        'SELECT DISTINCT gmh.`userGroupId` AS id FROM `GroupMenuHeader` gmh JOIN `menuHeader` mh ON mh.`id` = gmh.`menuHeaderId` ' +
        "WHERE mh.`code` = 'ADMIN'"
      )).map(r => Number(r.id)));
      for (const g of await q('SELECT `id`, `code` FROM `userGroup`')) {
        if (String(g.code).toUpperCase() === 'SUPER_ADMIN' || adminGroups.has(Number(g.id))) {
          await grantFunction(q, { id: Number(g.id), code: g.code }, MENU);
        }
      }
    }
    await ensureMarkerTable(q);
    await q('INSERT IGNORE INTO `pos_schema_migrations` (`name`) VALUES (?)', [NAME]);
  },

  // Removes MENU and its grants (the routers then allow menu edits again) and the screen key it set.
  async down(q) {
    if (await tableExists(q, 'sec_group_grant')) {
      await q("DELETE FROM `sec_group_grant` WHERE `functionCode` = 'MENU'");
      await q("DELETE FROM `sec_function` WHERE `functionCode` = 'MENU'");
    }
    if (await columnExists(q, 'menuLine', 'mobileKey')) {
      await q('UPDATE `menuLine` SET `mobileKey` = NULL WHERE `path` IN (?, ?) AND `mobileKey` = ?', [...PATHS, KEY]);
    }
    if (await tableExists(q, 'pos_schema_migrations')) {
      await q('DELETE FROM `pos_schema_migrations` WHERE `name` = ?', [NAME]);
    }
  }
};
