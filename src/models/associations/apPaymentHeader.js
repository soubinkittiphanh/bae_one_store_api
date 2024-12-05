module.exports = (db)=>{
    db.apPaymentHeader.belongsTo(db.currency, {
        foreignKey: 'currencyId',
        as: 'currency'
    })
    db.apPaymentHeader.belongsTo(db.receivingHeader, {
        foreignKey: 'receivingId',
        as: 'recevingHeader'
    })
    db.apPaymentHeader.belongsTo(db.chartAccount, {
        foreignKey: 'drAccountId',
        as: 'drAccount'
    })
    db.apPaymentHeader.belongsTo(db.chartAccount, {
        foreignKey: 'crAccountId',
        as: 'crAccount'
    })
    db.apPaymentHeader.belongsTo(db.payment, {
        foreignKey: 'paymentId',
        as: 'payment'
    })
}