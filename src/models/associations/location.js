module.exports = (db)=>{
    db.location.belongsTo(db.company, {
        foreignKey: 'companyId',
        as: 'company'
    })
}