const logger = require('../api/logger');
const WashJob = require('../models').washjob
const WashJobHistory = require('../models').washjobHis

exports.createVersion = async () => {
    const washJob = await WashJob.findByPk(id);

    // Save current version to history
    await WashJobHistory.create({
        washJobId: washJob.id,
        version: washJob.version,
        data: washJob.toJSON(),
        modifiedBy: req.user?.username ?? 'system', // optional
    });

    // Now update and increment version
    await washJob.update({
        ...req.body,
        version: washJob.version + 1
    });
}

// Get history
exports.getWashJobHistory = async (req, res) => {
    try {
        const history = await WashJobHistory.findAll({
            where: { washJobId: req.params.id },
            order: [['version', 'DESC']],
        });

        res.status(200).json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


