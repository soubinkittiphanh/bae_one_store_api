
module.exports = (db) => {
    db.campaign.hasMany(db.campaignEntry, { as: 'entries' });
    db.campaignEntry.belongsTo(db.campaign, { foreignKey: 'campaign_id', as: 'campaign' });
  };
  