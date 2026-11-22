// Restaurant table reservation (booking a table for a date/time).
// Not the same as src/reservation, which is the outfit-rental booking (check-in / check-out with priced lines).
module.exports = (sequelize, DataTypes) => {
    const TableReservation = sequelize.define('tableReservation', {
        customerName: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        phone: {
            type: DataTypes.STRING(30),
            allowNull: true,
        },
        partySize: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 2,
            validate: { min: 1, max: 200 },
        },
        reservedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            comment: 'Date and time the guests are expected',
        },
        durationMinutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 90,
            validate: { min: 15, max: 720 },
            comment: 'How long the table is blocked for this booking',
        },
        tableId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'Assigned table; can be left empty and assigned later',
        },
        status: {
            type: DataTypes.ENUM('booked', 'confirmed', 'seated', 'cancelled', 'no_show'),
            allowNull: false,
            defaultValue: 'booked',
        },
        tableHeld: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: 'True while this booking has put its table in status reserved',
        },
        depositAmount: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0,
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        cancelReason: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        seatedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        createUserId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        updateUserId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
        indexes: [
            { fields: ['reservedAt'] },
            { fields: ['tableId', 'reservedAt'] },
            { fields: ['status'] },
        ],
    });

    TableReservation.associate = (models) => {
        TableReservation.belongsTo(models.table, { foreignKey: 'tableId', as: 'table' });
    };

    return TableReservation;
};
