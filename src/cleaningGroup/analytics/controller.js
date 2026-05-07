const service = require('./service');

const analyticsController = {
    async getCityWideImpact(req, res) {
        console.log(`[DEBUG] Reached getCityWideImpact controller`);
        try {
            const impact = await service.getCityWideImpact();
            return res.status(200).json(impact);
        } catch (error) {
            return res.status(400).json({ message: error.message });
        }
    },

    async getUserMilestones(req, res) {
        try {
            const userId = req.user ? req.user.id : req.query.userId;
            if (!userId) {
                return res.status(400).json({ message: "userId is required" });
            }
            const milestones = await service.getUserMilestones(userId);
            return res.status(200).json(milestones);
        } catch (error) {
            return res.status(400).json({ message: error.message });
        }
    },

    async getWasteHotspots(req, res) {
        try {
            const hotspots = await service.getWasteHotspots();
            return res.status(200).json(hotspots);
        } catch (error) {
            return res.status(400).json({ message: error.message });
        }
    }
};

module.exports = analyticsController;
