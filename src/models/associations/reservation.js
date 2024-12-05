module.exports = (db)=>{

    db.reservation.belongsTo(db.payment, {
        foreignKey: 'paymentId',
        as: 'payment'
    })
    db.reservation.belongsTo(db.currency, {
        foreignKey: 'currencyId',
        as: 'currency'
    })
    db.reservation.hasMany(db.reservationLine, {
        as: 'lines'
    })
}