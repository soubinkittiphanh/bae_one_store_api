// models/promotion.js
module.exports = (sequelize, DataTypes) => {
  const Promotion = sequelize.define('promotion', {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Display name for the promotion'
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: 'Unique code for the promotion'
    },
    type: {
      type: DataTypes.ENUM('percentage', 'fixed_amount', 'buy_x_get_y', 'combo_deal'),
      allowNull: false,
      comment: 'Type of promotion'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Detailed description of the promotion'
    },
    start_date: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'When the promotion starts'
    },
    end_date: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'When the promotion ends'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Whether the promotion is currently active'
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Priority when multiple promotions apply (higher = more priority)'
    },
    max_uses: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Maximum number of times this promotion can be used (null = unlimited)'
    },
    current_uses: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Current number of times this promotion has been used'
    },
    conditions: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'JSON object containing promotion rules and conditions'
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'User ID who created this promotion'
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    freezeTableName: true,
    indexes: [
      {
        fields: ['is_active', 'start_date', 'end_date']
      },
      {
        fields: ['type']
      },
      {
        fields: ['code'],
        unique: true
      }
    ]
  });

  // Define associations
  Promotion.associate = function(models) {
    // A promotion can be used in multiple ticket lines
    Promotion.hasMany(models.ticketLine, {
      foreignKey: 'promotion_id',
      as: 'ticketLines'
    });
  };

  return Promotion;
};