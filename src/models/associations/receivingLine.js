module.exports = (db)=>{


    db.receivingLine.belongsTo(db.receivingHeader, {
        foreignKey: 'headerId',
        as: 'header',
    })
    db.receivingLine.belongsTo(db.poLine, {
        foreignKey: 'poLineId',
        as: 'poLine',
    })
    db.receivingLine.belongsTo(db.product, {
        foreignKey: 'productId',
        as: 'product',
    })
    db.receivingLine.belongsTo(db.unit, {
        foreignKey: 'unitId',
        as: 'unit',
    })
    db.receivingLine.hasMany(db.card, {
        as: 'cards',
    })
}