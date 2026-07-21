module.exports = (sequelize, DataTypes) => {
  const MicrofinanceGroup = sequelize.define('microfinanceGroup', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('CENTER', 'GROUP'),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'If type is GROUP, this references the parent CENTER'
    },
    meetingDay: {
      type: DataTypes.ENUM('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'),
      allowNull: true
    },
    meetingFrequency: {
      type: DataTypes.ENUM('WEEKLY', 'BI_WEEKLY'),
      defaultValue: 'WEEKLY',
      allowNull: false
    },
    loanOfficerId: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    timestamps: true,
    createdAt: true,
    updatedAt: 'updateTimestamp',
    freezeTableName: true
  });

  MicrofinanceGroup.associate = (models) => {
    // Self-referencing association: Group belongs to parent Center
    MicrofinanceGroup.belongsTo(models.microfinanceGroup, {
      foreignKey: 'parentId',
      as: 'parentCenter'
    });
    // Self-referencing association: Center has many sub-Groups
    MicrofinanceGroup.hasMany(models.microfinanceGroup, {
      foreignKey: 'parentId',
      as: 'subGroups'
    });
    // Group has many CIF members
    MicrofinanceGroup.hasMany(models.cifCustomer, {
      foreignKey: 'groupId',
      as: 'members'
    });
    // Group is managed by a loan officer (System User)
    MicrofinanceGroup.belongsTo(models.user, {
      foreignKey: 'loanOfficerId',
      as: 'loanOfficer'
    });
  };

  return MicrofinanceGroup;
};
