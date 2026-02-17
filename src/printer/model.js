module.exports = (sequelize, DataTypes) => {
    const Printer = sequelize.define('printerModel', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        // The type helps your code decide WHICH printer to use (Counter vs Kitchen)
        type: {
            type: DataTypes.ENUM('ticket', 'kitchen'),
            allowNull: false,
            defaultValue: 'ticket'
        },
        // This MUST match the name in Windows/Mac printer settings
        printerName: {
            type: DataTypes.STRING(100),
            allowNull: false,
            field: 'printer_name'
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
            field: 'is_active'
        }
    }, {
        sequelize,
        timestamps: true,
        freezeTableName: true,
        tableName: 'printerModel'
    });

    return Printer;
};