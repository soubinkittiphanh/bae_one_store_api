module.exports = (db) => {
  db.image.belongsTo(db.product, { foreignKey: 'productId', as: 'product' });
  db.priceList.belongsTo(db.product, { foreignKey: 'productId', as: 'product' });
  db.priceList.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });
  db.category.hasMany(db.product, { as: 'products' });
};
