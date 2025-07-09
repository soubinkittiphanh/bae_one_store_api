module.exports = (sequelize, DataTypes) => {
    const Company = sequelize.define('company', {
        mnemonic: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        tel: {
            type: DataTypes.STRING,
        },
        email: {
            type: DataTypes.STRING,
        },
        address: {
            type: DataTypes.STRING,
        },
        province: {
            type: DataTypes.STRING,
        },
        district: {
            type: DataTypes.STRING,
        },
        bank: {
            type: DataTypes.STRING,
        },
        accountName: {
            type: DataTypes.STRING,
        },
        accounts: {
            type: DataTypes.STRING,
        },
        village: {
            type: DataTypes.STRING,
        },
        profile_image_path: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        remark: {
            type: DataTypes.STRING,
            defaultValue: 0
            // allowNull: false,
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    }, {
        sequelize,
        // don't forget to enable timestamps!
        timestamps: true,
        // I don't want createdAt
        createdAt: true,
        // I want updatedAt to actually be called updateTimestamp
        updatedAt: 'updateTimestamp',
        // disable the modification of tablenames; By default, sequelize will automatically
        // transform all passed model names (first parameter of define) into plural.
        // if you don't want that, set the following
        freezeTableName: true,
    })
    return Company;
};