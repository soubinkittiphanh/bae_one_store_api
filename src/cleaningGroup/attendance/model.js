
module.exports = (sequelize, DataTypes) => {
    const Attendance = sequelize.define('Attendance', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        checkInTime: {
            type: DataTypes.DATE,
            allowNull: true
        },
        isVerified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false
        },
        notes: {
            type: DataTypes.STRING,
            allowNull: true
        },
        participationDuration: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
            allowNull: false,
            comment: 'Duration in minutes'
        },
        volunteerPoints: {
            type: DataTypes.VIRTUAL,
            get() {
                if (this.isVerified && this.participationDuration) {
                    // Logic: 1 point per 10 minutes of verified participation
                    return Math.floor(this.participationDuration / 10);
                }
                return 0;
            }
        }
    }, {
        sequelize,
        timestamps: true,
        createdAt: true,
        updatedAt: 'updateTimestamp',
        freezeTableName: true,
    });

    return Attendance;
};
