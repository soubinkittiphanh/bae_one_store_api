module.exports = (db)=>{

    db.receivingHeader.hasMany(db.receivingLine, {
        as: 'lines'
    })
    db.receivingHeader.belongsTo(db.location, {
        foreignKey: 'locationId',
        as: 'location',
    })
    db.receivingHeader.belongsTo(db.poHeader, {
        foreignKey: 'poHeaderId',
        as: 'poHeader',
    })
    db.receivingHeader.belongsTo(db.currency, {
        foreignKey: 'currencyId',
        as: 'currency',
    })
    db.receivingHeader.belongsTo(db.vendor, {
        foreignKey: 'vendorId',
        as: 'vendor',
    })
}