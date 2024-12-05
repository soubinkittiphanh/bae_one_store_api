module.exports = (db) => {
  db.order.hasMany(db.orderHIS, { as: 'histories' });
  db.order.belongsTo(db.location, { foreignKey: 'locationId', as: 'location' });
  db.order.belongsTo(db.location, { foreignKey: 'endLocationId', as: 'endLocation' });
  db.order.belongsTo(db.client, { foreignKey: 'senderId', as: 'sender' });
  db.order.belongsTo(db.client, { foreignKey: 'clientId', as: 'client' });
  db.order.belongsTo(db.user, { foreignKey: 'userId', as: 'user' });
  db.order.belongsTo(db.currency, { foreignKey: 'currencyId', as: 'currency' });
  db.order.belongsTo(db.currency, { foreignKey: 'shippingFeeCurrencyId', as: 'shippingFeeCurrency' });
  db.order.belongsTo(db.vendor, { foreignKey: 'vendorId', as: 'vendor' });
  db.order.belongsTo(db.payment, { foreignKey: 'paymentId', as: 'payment' });
  db.order.belongsTo(db.rider, { foreignKey: 'riderId', as: 'rider' });
  db.order.belongsTo(db.shipping, { foreignKey: 'shippingId', as: 'shipping' });
};
