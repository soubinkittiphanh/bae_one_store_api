// models/GroupMenuHeader.js
module.exports = (sequelize, DataTypes) => {
    const GroupMenuHeader = sequelize.define('GroupMenuHeader', {
        userGroupId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'group',
                key: 'id'
            }
        },
        menuHeaderId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'menuHeader',
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
    
    return GroupMenuHeader;
};