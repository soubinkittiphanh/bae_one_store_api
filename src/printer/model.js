module.exports = (sequelize, DataTypes) => {
    const Printer = sequelize.define('printerModel', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        // The type helps your code decide WHICH printer to use (Counter vs Kitchen vs Bar)
        type: {
            type: DataTypes.ENUM('ticket', 'kitchen', 'barcode', 'bar'),
            allowNull: false,
            defaultValue: 'ticket'
        },
        // This MUST match the name in Windows/Mac printer settings (or IP/MAC for network/Bluetooth)
        printerName: {
            type: DataTypes.STRING(100),
            allowNull: false,
            field: 'printer_name'
        },
        connectionType: {
            type: DataTypes.ENUM('bluetooth', 'wifi', 'usb'),
            allowNull: false,
            defaultValue: 'bluetooth',
            field: 'connection_type'
        },
        ipAddress: {
            type: DataTypes.STRING(100),
            allowNull: true,
            field: 'ip_address'
        },
        macAddress: {
            type: DataTypes.STRING(100),
            allowNull: true,
            field: 'mac_address'
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