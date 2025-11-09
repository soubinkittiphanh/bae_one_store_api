// models/MenuHeaderLines.js
module.exports = (sequelize, DataTypes) => {
    const MenuHeaderLines = sequelize.define('MenuHeaderLines', {
        menuHeaderId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'menuHeader',
                key: 'id'
            }
        },
        menuLineId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'menuLine',
                key: 'id'
            }
        },
        order: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true
    });
    
    return MenuHeaderLines;
};