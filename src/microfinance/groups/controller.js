const db = require('../../models');

async function create(req, res) {
  try {
    const { type, name, parentId, meetingDay, meetingFrequency, loanOfficerId } = req.body;
    const group = await db.microfinanceGroup.create({
      type,
      name,
      parentId,
      meetingDay,
      meetingFrequency,
      loanOfficerId
    });
    return res.status(201).json({ success: true, data: group });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const group = await db.microfinanceGroup.findByPk(id);
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group/Center not found' });
    }
    await group.update(req.body);
    return res.status(200).json({ success: true, data: group });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function findAll(req, res) {
  try {
    const groups = await db.microfinanceGroup.findAll({
      include: [
        { model: db.microfinanceGroup, as: 'parentCenter' },
        { model: db.microfinanceGroup, as: 'subGroups' },
        { model: db.cifCustomer, as: 'members' },
        { model: db.user, as: 'loanOfficer', attributes: ['id', 'username', 'email'] }
      ]
    });
    return res.status(200).json({ success: true, data: groups });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function findOne(req, res) {
  try {
    const { id } = req.params;
    const group = await db.microfinanceGroup.findByPk(id, {
      include: [
        { model: db.microfinanceGroup, as: 'parentCenter' },
        { model: db.microfinanceGroup, as: 'subGroups' },
        { model: db.cifCustomer, as: 'members' },
        { model: db.user, as: 'loanOfficer', attributes: ['id', 'username', 'email'] }
      ]
    });
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group/Center not found' });
    }
    return res.status(200).json({ success: true, data: group });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  create,
  update,
  findAll,
  findOne
};
