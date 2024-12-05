module.exports = (db)=>{
    db.webProductGroup.belongsToMany(db.product, { through: 'WebGroupProduct' })
    db.product.belongsToMany(db.webProductGroup, { through: 'WebGroupProduct' })
    
    db.webProductGroup.hasMany(db.product, {
        as: 'lines'
    })
}