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
        bank_qr_image_path: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        remark: {
            type: DataTypes.STRING,
            defaultValue: 0
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        // Theme configuration fields
        theme_primary_color: {
            type: DataTypes.STRING(7),
            allowNull: true,
            defaultValue: '#01532B',
            validate: {
                is: /^#[0-9A-F]{6}$/i  // Validates hex color format
            }
        },
        theme_secondary_color: {
            type: DataTypes.STRING(7),
            allowNull: true,
            defaultValue: '#337555',
            validate: {
                is: /^#[0-9A-F]{6}$/i
            }
        },
        theme_lightprimary_color: {
            type: DataTypes.STRING(7),
            allowNull: true,
            defaultValue: '#80a995',
            validate: {
                is: /^#[0-9A-F]{6}$/i
            }
        },
        theme_danger_color: {
            type: DataTypes.STRING(7),
            allowNull: true,
            defaultValue: '#D00505',
            validate: {
                is: /^#[0-9A-F]{6}$/i
            }
        },
        theme_dark_primary: {
            type: DataTypes.STRING(7),
            allowNull: true,
            validate: {
                is: /^#[0-9A-F]{6}$/i
            }
        },
        theme_dark_secondary: {
            type: DataTypes.STRING(7),
            allowNull: true,
            validate: {
                is: /^#[0-9A-F]{6}$/i
            }
        },
        theme_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: 'Enable custom theme colors for this company'
        },
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
    })
    return Company;
};