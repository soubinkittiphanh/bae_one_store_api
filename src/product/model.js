module.exports = (sequelize, DataTypes) => {
    const Product = sequelize.define('product', {
        pro_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true // Define the column as unique
        },
        pro_name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        pro_price: {
            type: DataTypes.DOUBLE,
            defaultValue: 0
        },
        duration_minutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        pro_desc: {
            type: DataTypes.STRING,
        },
        pro_status: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        validateStockOnSale: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        pro_image_path: {
            type: DataTypes.STRING,
        },
        retail_cost_percent: {
            type: DataTypes.DOUBLE,
            defaultValue: 0
        },
        cost_price: {
            type: DataTypes.DOUBLE,
            defaultValue: 0
        },
        stock_count: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        minStock: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        locking_session_id: {
            type: DataTypes.STRING,
            // allowNull: false,
        },
        barCode: {
            type: DataTypes.STRING(40),
            // allowNull: false,
        },
        vendorName: {
            type: DataTypes.STRING(100),
            // allowNull: false,
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        _category: {
            type: DataTypes.ENUM('product', 'service', 'stock'),
            allowNull: false,
            defaultValue: 'product',
        },
        receiveUnitId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        stockUnitId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        baseUnitId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        taxId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        saleCurrencyId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        costCurrencyId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        companyId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        pro_category: {
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
            afterCreate: async (product, options) => {
                try {
                    const AuditModel = sequelize.models.ProductAudit;
                    if (!AuditModel || typeof AuditModel.createAuditRecord !== 'function') return;

                    const userId = options.context?.userId || 1;
                    const reason = options.context?.reason || 'Product created';

                    await AuditModel.createAuditRecord(
                        product.toJSON(),
                        userId,
                        'CREATE',
                        reason,
                        options.transaction
                    );
                } catch (error) {
                    console.error('Failed to create audit record after product create:', error);
                }
            },

            // Before update, save current state to audit table
            beforeUpdate: async (product, options) => {
                try {
                    const AuditModel = sequelize.models.ProductAudit;
                    if (!AuditModel || typeof AuditModel.createAuditRecord !== 'function') return;

                    // Fetch current state before update
                    const currentRecord = await sequelize.models.product.findByPk(product.id, {
                        transaction: options.transaction
                    });

                    if (currentRecord) {
                        const userId = options.context?.userId || 1;
                        const reason = options.context?.reason || 'Product updated';

                        await AuditModel.createAuditRecord(
                            currentRecord.toJSON(),
                            userId,
                            'UPDATE',
                            reason,
                            options.transaction
                        );
                    }
                } catch (error) {
                    console.error('Failed to create audit record before product update:', error);
                }
            },

            // Before delete, save the record being deleted
            beforeDestroy: async (product, options) => {
                try {
                    const AuditModel = sequelize.models.ProductAudit;
                    if (!AuditModel || typeof AuditModel.createAuditRecord !== 'function') return;

                    const userId = options.context?.userId || 1;
                    const reason = options.context?.reason || 'Product deleted';

                    await AuditModel.createAuditRecord(
                        product.toJSON(),
                        userId,
                        'DELETE',
                        reason,
                        options.transaction
                    );
                } catch (error) {
                    console.error('Failed to create audit record before product delete:', error);
                }
            }
        }
    });

    // Product Associations - Using Proper Sequelize Pattern
    Product.associate = function (models) {
        // Audit Trail association
        Product.hasMany(models.productAudit, {
            foreignKey: 'productId',
            as: 'auditTrail',
        });

        // Category associations - handle both possible foreign keys
        Product.belongsTo(models.category, {
            as: 'category',
            foreignKey: 'categoryCategId',
            targetKey: 'categ_id'
        });

        Product.belongsTo(models.category, {
            as: 'productCategory',
            foreignKey: 'pro_category',
            targetKey: 'categ_id'
        });

        // Company association
        Product.belongsTo(models.company, {
            as: 'company',
            foreignKey: 'companyId',
            targetKey: 'id'
        });

        // Unit associations - Each with unique alias to avoid conflicts
        Product.belongsTo(models.unit, {
            as: 'stockUnit',
            foreignKey: 'stockUnitId',
            targetKey: 'id'
        });

        Product.belongsTo(models.unit, {
            as: 'receiveUnit',
            foreignKey: 'receiveUnitId',
            targetKey: 'id'
        });

        Product.belongsTo(models.unit, {
            as: 'baseUnit',
            foreignKey: 'baseUnitId',
            targetKey: 'id'
        });

        // Currency associations
        Product.belongsTo(models.currency, {
            as: 'costCurrency',
            foreignKey: 'costCurrencyId',
            targetKey: 'id'
        });

        Product.belongsTo(models.currency, {
            as: 'saleCurrency',
            foreignKey: 'saleCurrencyId',
            targetKey: 'id'
        });

        // Tax association
        Product.belongsTo(models.tax, {
            as: 'tax',
            foreignKey: 'taxId',
            targetKey: 'id'
        });

        // Web Group association
        Product.belongsTo(models.webProductGroup, {
            as: 'webProductGroup',
            foreignKey: 'webProductGroupId',
            targetKey: 'id'
        });

        // One-to-Many associations
        Product.hasMany(models.image, {
            as: 'images',
            foreignKey: 'productId',
            sourceKey: 'id'
        });

        Product.hasMany(models.priceList, {
            as: 'priceLists',
            foreignKey: 'productId',
            sourceKey: 'id'
        });

        Product.hasMany(models.productSize, {
            as: 'sizeLists',
            foreignKey: 'productId',
            sourceKey: 'id'
        });

        Product.hasMany(models.card, {
            as: 'cards',
            foreignKey: 'productId',
            sourceKey: 'id'
        });

        Product.hasMany(models.ticketLine, {
            as: 'ticketLines',
            foreignKey: 'productId',
            sourceKey: 'id'
        });

        // Stock Transaction association
        Product.hasMany(models.stockTransactionModel, {
            as: 'stockTransactions',
            foreignKey: 'productId',
            sourceKey: 'id'
        });

        // Many-to-Many with WebGroup (if you have a junction table)
        // Uncomment and adjust if you have a many-to-many relationship
        /*
        Product.belongsToMany(models.webGroup, {
            through: 'product_web_groups', // Replace with your actual junction table name
            foreignKey: 'productId',
            otherKey: 'webGroupId',
            as: 'webGroups'
        });
        */
    };

    return Product;
};

// Data Types Reference:
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

/*
🎯 ASSOCIATIONS ADDED:

✅ Category associations (both categoryCategId and pro_category)
✅ Unit associations (stockUnit, receiveUnit, baseUnit) 
✅ Company association
✅ Currency associations (cost and sale)
✅ Tax association
✅ Web Group association
✅ One-to-Many: images, priceLists, sizeLists, cards, ticketLines
✅ Stock Transaction association
✅ Commented Many-to-Many example for webGroups

🔧 KEY FEATURES:
- Uses proper Sequelize associate pattern
- Each association has unique alias to prevent conflicts
- Explicit targetKey/sourceKey specification
- Handles both category foreign keys
- Ready for your stock management frontend

📝 USAGE IN CONTROLLER:
include: [
  { model: Category, as: 'category' },
  { model: Unit, as: 'stockUnit' },
  { model: Unit, as: 'baseUnit' }
]
*/