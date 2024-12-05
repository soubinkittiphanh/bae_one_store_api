module.exports = (db)=>{

    db.arReceiveHeader.belongsTo(db.currency, {
        foreignKey: 'currencyId',
        as: 'currency'
    })
    db.arReceiveHeader.belongsTo(db.payment, {
        foreignKey: 'paymentId',
        as: 'payment'
    })
    db.arReceiveHeader.belongsTo(db.chartAccount, {
        foreignKey: 'drAccountId',
        as: 'drAccount'
    })
    db.arReceiveHeader.belongsTo(db.chartAccount, {
        foreignKey: 'crAccountId',
        as: 'crAccount'
    })
}