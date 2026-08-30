module.exports = (sequelize, DataTypes) => {
    const SchoolInvoice = sequelize.define('schoolInvoice', {
        invoiceNumber: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            comment: 'Unique invoice code'
        },
        totalAmount: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0.00
        },
        paidAmount: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0.00
        },
        balanceAmount: {
            type: DataTypes.DOUBLE,
            allowNull: false,
            defaultValue: 0.00
        },
        status: {
            type: DataTypes.ENUM('UNPAID', 'PARTIAL', 'PAID', 'OVERDUE'),
            allowNull: false,
            defaultValue: 'UNPAID'
        },
        billingMonth: {
            type: DataTypes.STRING(7),
            allowNull: true,
            comment: 'Format YYYY-MM'
        },
        dueDate: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true
    });

    SchoolInvoice.associate = models => {
        SchoolInvoice.belongsTo(models.student, {
            foreignKey: 'studentId',
            as: 'student'
        });
        SchoolInvoice.belongsTo(models.academicYear, {
            foreignKey: 'academicYearId',
            as: 'academicYear'
        });
        SchoolInvoice.hasMany(models.schoolInvoiceLine, {
            foreignKey: 'schoolInvoiceId',
            as: 'lines'
        });
        SchoolInvoice.hasMany(models.schoolPayment, {
            foreignKey: 'schoolInvoiceId',
            as: 'payments'
        });
    };

    return SchoolInvoice;
};
