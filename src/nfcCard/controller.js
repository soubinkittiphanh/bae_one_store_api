const { nfcCard, student, sequelize } = require("../models");
const logger = require("../api/logger");


module.exports = {
    // Fetch cards by UID or Student ID
    async find(req, res) {
        try {
            const { uid, studentId } = req.query;
            let condition = {};
            if (uid) condition.cardUid = uid;
            if (studentId) condition.studentId = studentId;

            const cards = await nfcCard.findAll({ where: condition });
            return res.status(200).json({ data: cards });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    },

    // Register a new card to a student
    async registerCard(req, res) {
        try {
            const { cardUid, studentId } = req.body;

            // 1. Check if card UID is already in use
            const existingCard = await nfcCard.findOne({ where: { cardUid } });
            if (existingCard) {
                return res.status(400).json({ message: "This card is already registered to another user." });
            }

            // 2. Deactivate any old cards for this student (if they lost one)
            await nfcCard.update(
                { isActive: false, cardStatus: 'INACTIVE' },
                { where: { studentId, isActive: true } }
            );

            // 3. Create the new active card
            const newCard = await nfcCard.create({
                cardUid,
                studentId,
                cardStatus: 'ACTIVE',
                isActive: true
            });

            logger.info(`New NFC Card ${cardUid} linked to Student ${studentId}`);
            return res.status(201).json(newCard);
        } catch (error) {
            logger.error("Failed to register NFC card:", error);
            return res.status(500).json({ message: "Internal Server Error" });
        }
    },

    // Deactivate a card (e.g., if a student reports it lost)
    async reportLost(req, res) {
        try {
            const { cardUid } = req.body;
            await nfcCard.update(
                { isActive: false, cardStatus: 'LOST' },
                { where: { cardUid } }
            );
            return res.status(200).json({ message: "Card has been deactivated." });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
};