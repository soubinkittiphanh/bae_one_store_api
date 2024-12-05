module.exports = (db)=>{


    db.product.hasMany(db.image, {
        as: 'images'
    })
    
    db.product.hasMany(db.priceList, {
        as: 'priceLists'
    })
    db.product.hasMany(db.card, {
        as: 'cards'
    })
    
    db.product.belongsTo(db.currency, {
        foreignKey: 'costCurrencyId',
        as: 'costCurrency'
    })
    db.product.belongsTo(db.currency, {
        foreignKey: 'saleCurrencyId',
        as: 'saleCurrency'
    })
    
    db.product.belongsTo(db.unit, {
        foreignKey: 'stockUnitId',
        as: 'stockUnit'
    })
    db.product.belongsTo(db.unit, {
        foreignKey: 'receiveUnitId',
        as: 'receiveUnit'
    })
    db.product.belongsTo(db.category, {
        foreignKey: 'pro_category',
        as: 'category'
    })
    
    // db.outlet.hasMany(db.product, {
    //     as: 'products'
    // })
    db.product.belongsTo(db.company, {
        foreignKey: 'companyId',
        as: 'company'
    })
}