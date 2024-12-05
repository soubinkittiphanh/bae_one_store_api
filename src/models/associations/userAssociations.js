module.exports = (db) => {
  db.user.belongsTo(db.group, { foreignKey: 'groupId', as: 'userGroup' });
  db.user.belongsToMany(db.terminal, { through: 'UserTerminals' });
  db.terminal.belongsToMany(db.user, { through: 'UserTerminals' });
  db.group.belongsToMany(db.authority, { through: 'GroupAuthorities' });
  db.authority.belongsToMany(db.group, { through: 'GroupAuthorities' });
};
