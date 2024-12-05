module.exports = (db) => {
  db.saleHeader.belongsTo(db.payment, { foreignKey: 'paymentId', as: 'payment' });
  db.saleHeader.belongsTo(db.client, { foreignKey: 'clientId', as: 'client' });
  db.saleHeader.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });
  db.saleHeader.hasMany(db.saleLine, { as: 'lines' });
  db.saleLine.belongsTo(db.saleHeader, { foreignKey: 'headerId', as: 'header' });
  db.saleLine.belongsTo(db.product, { foreignKey: 'productId', as: 'product' });
};
