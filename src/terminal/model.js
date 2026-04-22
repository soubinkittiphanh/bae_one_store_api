

module.exports = (sequelize, DataTypes) => {
    const Terminal = sequelize.define('terminal', {
        code: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        description: {
            type: DataTypes.STRING,
        },
        saleRate: {
            type: DataTypes.DOUBLE,
            default: 0

        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        bankAccountId: {
            type: DataTypes.INTEGER,
            allowNull: true,
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
        hooks: {
            // After create, save the new record to audit table
            afterCreate: async (terminal, options) => {
                try {
                    const AuditModel = sequelize.models.TerminalAudit;
                    if (!AuditModel || typeof AuditModel.createAuditRecord !== 'function') return;

                    const userId = terminal.makerId || options.context?.userId || 1;
                    const reason = options.context?.reason || 'Terminal created';

                    await AuditModel.createAuditRecord(
                        terminal.toJSON(),
                        userId,
                        'CREATE',
                        reason,
                        options.transaction
                    );
                } catch (error) {
                    console.error('Failed to create audit record after terminal create:', error);
                }
            },

            // Before update, save current state to audit table
            beforeUpdate: async (terminal, options) => {
                try {
                    const AuditModel = sequelize.models.TerminalAudit;
                    if (!AuditModel || typeof AuditModel.createAuditRecord !== 'function') return;

                    // Fetch current state before update
                    const currentRecord = await sequelize.models.terminal.findByPk(terminal.id, {
                        transaction: options.transaction
                    });

                    if (currentRecord) {
                        const userId = options.context?.userId || 1;
                        const reason = options.context?.reason || 'Terminal updated';

                        await AuditModel.createAuditRecord(
                            currentRecord.toJSON(),
                            userId,
                            'UPDATE',
                            reason,
                            options.transaction
                        );
                    }
                } catch (error) {
                    console.error('Failed to create audit record before terminal update:', error);
                }
            },

            // Before delete, save the record being deleted
            beforeDestroy: async (terminal, options) => {
                try {
                    const AuditModel = sequelize.models.TerminalAudit;
                    if (!AuditModel || typeof AuditModel.createAuditRecord !== 'function') return;

                    const userId = options.context?.userId || 1;
                    const reason = options.context?.reason || 'Terminal deleted';

                    await AuditModel.createAuditRecord(
                        terminal.toJSON(),
                        userId,
                        'DELETE',
                        reason,
                        options.transaction
                    );
                } catch (error) {
                    console.error('Failed to create audit record before terminal delete:', error);
                }
            }
        }
    })

    Terminal.associate = models => {
        // Audit Trail association
        Terminal.hasMany(models.terminalAudit, {
            foreignKey: 'terminalId',
            as: 'auditTrail',
        });
    };

    return Terminal;
};

// 1. STRING: A variable length string.
// 2. CHAR: A fixed length string.
// 3. TEXT: A long string.
// 4. INTEGER: A 32-bit integer.
// 5. BIGINT: A 64-bit integer.
// 6. FLOAT: A floating point number.
// 7. DOUBLE: A double floating point number.
// 8. DECIMAL: A fixed-point decimal number.
// 9. BOOLEAN: A boolean value.
// 10. DATE: A date object.
// 11. DATEONLY: A date object without time.
// 12. TIME: A time object.
// 13. UUID: A universally unique identifier.
// 14. ENUM: A value from a predefined list of values.
// 15. ARRAY: An array of values.
// 16. JSON: A JSON object.
// 17. JSONB: A JSON object stored as a binary format.