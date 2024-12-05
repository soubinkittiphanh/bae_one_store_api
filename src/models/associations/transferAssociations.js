module.exports = (db) => {
  db.transferHeader.belongsTo(db.location, { foreignKey: 'srcLocationId', as: 'srcLocation' });
  db.transferHeader.belongsTo(db.location, { foreignKey: 'desLocationId', as: 'desLocation' });
  db.transferHeader.hasMany(db.transferLine, { as: 'lines' });
  db.transferLine.belongsTo(db.transferHeader, { foreignKey: 'headerId', as: 'header' });
  db.transferLine.belongsTo(db.product, { foreignKey: 'productId', as: 'product' });
};
