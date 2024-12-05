
module.exports = (db) => {
// Example relationships

db.image.belongsTo(db.product, {
    foreignKey: 'productId',
    as: 'product'
})



db.rider.hasMany(db.order, {
    as: 'shippingOrders'
})

db.orderTable.hasMany(db.saleHeader, {
    as: 'saleHeader'
})
db.saleHeader.belongsTo(db.orderTable, {
    foreignKey: 'orderTableId',
    as: 'orderTable'
})
db.menuHeader.belongsToMany(db.menuLine, { through: 'MenuHeaderLines' })
db.menuLine.belongsToMany(db.menuHeader, { through: 'MenuHeaderLines' })

db.orderHIS.belongsTo(db.location, {
    foreignKey: 'locationId',
    as: 'location'
})
db.orderHIS.belongsTo(db.location, {
    foreignKey: 'endLocationId',
    as: 'endLocation'
})
db.orderHIS.belongsTo(db.client, {
    foreignKey: 'senderId',
    as: 'sender'
})
db.orderHIS.belongsTo(db.client, {
    foreignKey: 'clientId',
    as: 'client'
})
db.orderHIS.belongsTo(db.user, {
    foreignKey: 'userId',
    as: 'user'
})

db.orderHIS.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})

db.orderHIS.belongsTo(db.currency, {
    foreignKey: 'shippingFeeCurrencyId',
    as: 'shippingFeeCurrency'
})

db.orderHIS.belongsTo(db.vendor, {
    foreignKey: 'vendorId',
    as: 'vendor'
})
db.orderHIS.belongsTo(db.payment, {
    foreignKey: 'paymentId',
    as: 'payment',
})
db.orderHIS.belongsTo(db.order, {
    foreignKey: 'originalId',
    as: 'original'
})
db.orderHIS.belongsTo(db.rider, {
    foreignKey: 'riderId',
    as: 'rider'
})
db.orderHIS.belongsTo(db.shipping, {
    foreignKey: 'shippingId',
    as: 'shipping'
})

db.order.hasMany(db.orderHIS, {
    as: 'histories'
})
db.order.belongsTo(db.location, {
    foreignKey: 'locationId',
    as: 'location'
})
db.order.belongsTo(db.location, {
    foreignKey: 'endLocationId',
    as: 'endLocation'
})
db.order.belongsTo(db.client, {
    foreignKey: 'senderId',
    as: 'sender'
})
db.order.belongsTo(db.client, {
    foreignKey: 'clientId',
    as: 'client'
})
db.order.belongsTo(db.user, {
    foreignKey: 'userId',
    as: 'user'
})

db.order.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})

db.order.belongsTo(db.currency, {
    foreignKey: 'shippingFeeCurrencyId',
    as: 'shippingFeeCurrency'
})

db.order.belongsTo(db.vendor, {
    foreignKey: 'vendorId',
    as: 'vendor'
})
db.order.belongsTo(db.payment, {
    foreignKey: 'paymentId',
    as: 'payment',
})
db.order.belongsTo(db.rider, {
    foreignKey: 'riderId',
    as: 'rider'
})
db.order.belongsTo(db.shipping, {
    foreignKey: 'shippingId',
    as: 'shipping'
})

db.user.belongsTo(db.group, {
    foreignKey: 'groupId',
    as: 'userGroup'
})
db.priceList.belongsTo(db.product, {
    foreignKey: 'productId',
    as: 'product'
})
db.priceList.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})
//***************Map order to delivery customer**************/
db.customer.belongsTo(db.saleHeader, {
    foreignKey: 'saleHeaderId',
    as: 'saleHeader'
})
db.saleHeader.hasOne(db.customer)


db.card.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})
db.card.belongsTo(db.receivingLine, {
    foreignKey: 'receivingLineId',
    as: 'receivingLine'
})
db.user.belongsToMany(db.terminal, { through: 'UserTerminals' })
db.terminal.belongsToMany(db.user, { through: 'UserTerminals' })
db.authority.belongsToMany(db.group, { through: 'GroupAuthorities' })
db.group.belongsToMany(db.authority, { through: 'GroupAuthorities' })

db.menuHeader.belongsToMany(db.group, { through: 'GroupMenuHeader' })
db.group.belongsToMany(db.menuHeader, { through: 'GroupMenuHeader' })


db.terminal.belongsTo(db.location, {
    foreignKey: 'locationId',
    as: 'location'
})


db.transferHeader.belongsTo(db.location, {
    foreignKey: 'srcLocationId',
    as: 'srcLocation'
})
db.transferHeader.belongsTo(db.location, {
    foreignKey: 'desLocationId',
    as: 'desLocation'
})
db.transferHeader.hasMany(db.transferLine, {
    as: 'lines'
})
db.transferHeader.belongsTo(db.user, {
    foreignKey: 'userId',
    as: 'user'
})

db.transferLine.belongsTo(db.transferHeader, {
    foreignKey: 'headerId',
    as: 'header'
})
db.transferLine.belongsTo(db.product, {
    foreignKey: 'productId',
    as: 'product'
})
db.transferLine.belongsTo(db.unit, {
    foreignKey: 'unitId',
    as: 'unit'
})
db.transferLine.hasMany(db.card, {
    as: 'cards'
})
db.card.belongsTo(db.transferLine, {
    foreignKey: 'transferLineId',
    as: 'transferLine'

})
// ********** END TRANSFER MAPPING ***********//

db.card.belongsTo(db.location, {
    foreignKey: 'locationId',
    as: 'location'
})

//Campaign relation
db.campaign.hasMany(db.campaignEntry, {
    as: 'entries'
})
db.campaignEntry.belongsTo(db.campaign, {
    foreignKey: 'campaign_id',
    as: 'campaign'
})
db.chartAccount.hasMany(db.gl, {
    as: 'gls'
})
db.gl.belongsTo(db.chartAccount, {
    foreignKey: 'drAccountId',
    as: 'drAccount'
})
db.gl.belongsTo(db.chartAccount, {
    foreignKey: 'crAccountId',
    as: 'crAccount'
})
db.gl.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})

//********************************** */
// ***** NEW RELATION ************** */
//********************************** */
db.category.hasMany(db.product, {
    as: 'products'
})


db.poHeader.hasMany(db.poHeaderHIS, {
    as: 'history'
})
db.poHeaderHIS.belongsTo(db.poHeader, {
    foreignKey: 'ORGheaderId',
    as: 'ORGheader'
})
db.poHeaderHIS.belongsTo(db.vendor, {
    foreignKey: 'vendorId',
    as: 'vendor'
})
db.poHeaderHIS.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})


db.poHeader.hasMany(db.poLine, {
    as: 'lines'
})
db.poLine.belongsTo(db.poHeader, {
    foreignKey: 'headerId',
    as: 'header'
})
db.poHeader.belongsTo(db.vendor, {
    foreignKey: 'vendorId',
    as: 'vendor'
})
db.poHeader.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})

// db.poLine.hasOne(db.product)
db.poLine.belongsTo(db.product, {
    foreignKey: 'productId',
    as: 'product'
})
db.poLine.belongsTo(db.unit, {
    foreignKey: 'unitId',
    as: 'unit'
})

db.rider.hasMany(db.customer, {
    as: 'orders'
})
db.customer.belongsTo(db.rider, {
    foreignKey: 'riderId',
    as: 'rider'
})
db.customer.belongsTo(db.geography, {
    foreignKey: 'geoId',
    as: 'geography'
})
db.customer.belongsTo(db.shipping, {
    foreignKey: 'shippingId',
    as: 'shipping'
})
// Sale mapping //
db.saleHeader.belongsTo(db.payment, {
    foreignKey: 'paymentId',
    as: 'payment'
})
db.saleHeader.belongsTo(db.client, {
    foreignKey: 'clientId',
    as: 'client'
})
db.saleHeader.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})
db.saleHeader.hasMany(db.saleLine, {
    as: 'lines'
})
db.saleHeader.belongsTo(db.user, {
    foreignKey: 'userId',
    as: 'user'
})
db.saleHeader.belongsTo(db.location, {
    foreignKey: 'locationId',
    as: 'location'
})
// ,{
//     foreignKey:'locationId',
//     as:'location',
// }

db.saleLine.belongsTo(db.saleHeader, {
    foreignKey: 'headerId',
    as: 'header'
})
db.saleLine.belongsTo(db.product, {
    foreignKey: 'productId',
    as: 'product'
})
db.saleLine.belongsTo(db.unit, {
    foreignKey: 'unitId',
    as: 'unit'
})
db.saleLine.hasMany(db.card, {
    as: 'cards'
})
db.card.belongsTo(db.saleLine, {
    foreignKey: 'saleLineId',
    as: 'saleLine'

})

// Quotation mapping //
db.quotationHeader.belongsTo(db.payment, {
    foreignKey: 'paymentId',
    as: 'payment'
})
db.quotationHeader.belongsTo(db.client, {
    foreignKey: 'clientId',
    as: 'client'
})
db.quotationHeader.belongsTo(db.currency, {
    foreignKey: 'currencyId',
    as: 'currency'
})
db.quotationHeader.hasMany(db.quotationLine, {
    as: 'lines'
})
db.quotationHeader.belongsTo(db.user, {
    foreignKey: 'userId',
    as: 'user'
})

db.quotationLine.belongsTo(db.quotationHeader, {
    foreignKey: 'headerId',
    as: 'header'
})
db.quotationLine.belongsTo(db.product, {
    foreignKey: 'productId',
    as: 'product'
})
db.quotationLine.belongsTo(db.unit, {
    foreignKey: 'unitId',
    as: 'unit'
})
// Quotation mapping //

db.card.belongsTo(db.product, {
    foreignKey: 'productId',
    as: 'product'

})

db.saleHeader.belongsTo(db.customer, {
    foreignKey: 'customerId',
    as: 'customer'
})

};
// Add the rest of the associations
