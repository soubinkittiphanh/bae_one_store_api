module.exports = (db)=>{

    db.reservationLine.belongsTo(db.reservation, {
        foreignKey: 'reservationHeaderId',
        as: 'reservationHeader'
    })
    db.reservationLine.belongsTo(db.product, {
        foreignKey: 'productId',
        as: 'product'
    })
    db.reservationLine.belongsTo(db.unit, {
        foreignKey: 'unitId',
        as: 'unit'
    })
}