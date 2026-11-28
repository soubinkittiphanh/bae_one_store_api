/**
 * Mobile permissions, step 5: one permission system instead of three.
 *
 *  - The "User role define" screen (/admin/settings/userRole, tables role + user.roleId) is retired: nothing
 *    checks roles, so its menu line is switched off. The role table and /api/role stay, unused, so nothing is
 *    lost; dc_web shows a notice on the old page.
 *  - The grant matrix (/admin/security/grants, sec_group_grant) gets a menu line under the ADMIN header: that is
 *    where the actions roles were meant for are set now (product, stock, discount, users, groups, bill cancel).
 *    The page needs SEC_GRANT VIEW; dc_web hides the line from groups without it.
 *
 * Also fills sec_action (the grant matrix columns) where only the loan SQL would have.
 *
 * down(): switches the role line back on and removes the grant-matrix line this migration added.
 */
const NAME = '20261130_retire_user_roles';
const ROLE_PATH = '/admin/settings/userRole';
const GRANTS_PATH = '/admin/security/grants';
const MARK = `pos:${NAME}`; // menuLine.remark of the line this migration adds

const tableExists = async (q, table) =>
  (await q('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table])).length > 0;

const markerExists = async q =>
  (await tableExists(q, 'pos_schema_migrations')) &&
  (await q('SELECT 1 FROM `pos_schema_migrations` WHERE `name` = ?', [NAME])).length > 0;

module.exports = {
  name: NAME,

  async isApplied(q) {
    return markerExists(q);
  },

  async up(q) {
    // Databases migrated before 20261128 filled sec_action need its columns for the grant matrix
    await require('./20261128_mobile_menu_grants').helpers.ensureActions(q);
    if (await tableExists(q, 'menuLine')) {
      await q('UPDATE `menuLine` SET `isActive` = 0, `updateTimestamp` = NOW() WHERE `path` = ?', [ROLE_PATH]);

      let line = (await q('SELECT `id` FROM `menuLine` WHERE `path` = ? ORDER BY `id` LIMIT 1', [GRANTS_PATH]))[0];
      if (!line) {
        await q(
          'INSERT INTO `menuLine` (`name`, `llname`, `icon`, `path`, `remark`, `target_systems`, `isActive`, `createdAt`, `updateTimestamp`) ' +
          "VALUES (?, ?, 'mdi-shield-key-outline', ?, ?, 'WEB', 1, NOW(), NOW())",
          ['ສິດການກະທຳຂອງກຸ່ມ', 'Access rights (grants)', GRANTS_PATH, MARK]
        );
        line = (await q('SELECT `id` FROM `menuLine` WHERE `path` = ? ORDER BY `id` LIMIT 1', [GRANTS_PATH]))[0];
      }

      const admin = (await q("SELECT `id` FROM `menuHeader` WHERE `code` = 'ADMIN' ORDER BY `id` LIMIT 1"))[0];
      if (admin && line && (await tableExists(q, 'MenuHeaderLines'))) {
        const linked = await q('SELECT 1 FROM `MenuHeaderLines` WHERE `menuHeaderId` = ? AND `menuLineId` = ?', [admin.id, line.id]);
        if (!linked.length) {
          // Where the role screen was, else at the end
          const role = (await q(
            'SELECT mhl.`order` AS ord FROM `MenuHeaderLines` mhl JOIN `menuLine` ml ON ml.`id` = mhl.`menuLineId` ' +
            'WHERE mhl.`menuHeaderId` = ? AND ml.`path` = ? LIMIT 1', [admin.id, ROLE_PATH]
          ))[0];
          const last = (await q('SELECT COALESCE(MAX(`order`), 0) AS ord FROM `MenuHeaderLines` WHERE `menuHeaderId` = ?', [admin.id]))[0];
          const order = role ? Number(role.ord) : Number(last.ord) + 1;
          await q(
            'INSERT INTO `MenuHeaderLines` (`menuHeaderId`, `menuLineId`, `order`, `createdAt`, `updateTimestamp`) VALUES (?, ?, ?, NOW(), NOW())',
            [admin.id, line.id, order]
          );
        }
      }
    }
    await q(
      'CREATE TABLE IF NOT EXISTS `pos_schema_migrations` (`name` VARCHAR(100) NOT NULL PRIMARY KEY, ' +
      '`appliedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    await q('INSERT IGNORE INTO `pos_schema_migrations` (`name`) VALUES (?)', [NAME]);
  },

  async down(q) {
    if (await tableExists(q, 'menuLine')) {
      await q('UPDATE `menuLine` SET `isActive` = 1, `updateTimestamp` = NOW() WHERE `path` = ?', [ROLE_PATH]);
      const added = await q('SELECT `id` FROM `menuLine` WHERE `path` = ? AND `remark` = ?', [GRANTS_PATH, MARK]);
      for (const l of added) {
        if (await tableExists(q, 'MenuHeaderLines')) await q('DELETE FROM `MenuHeaderLines` WHERE `menuLineId` = ?', [l.id]);
        await q('DELETE FROM `menuLine` WHERE `id` = ?', [l.id]);
      }
    }
    if (await tableExists(q, 'pos_schema_migrations')) {
      await q('DELETE FROM `pos_schema_migrations` WHERE `name` = ?', [NAME]);
    }
  }
};
