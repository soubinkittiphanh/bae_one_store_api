const { printerModel } = require('../models'); // Adjust path to your models index

exports.getPrinters = async (req, res) => {
    try {
        const printers = await printerModel.findAll({
            where: { is_active: true }
        });
        return res.status(200).json(printers);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.upsertPrinter = async (req, res) => {
    try {
        const { type, printerName, connectionType, ipAddress, macAddress } = req.body;

        // Find if a printer of this type (ticket/kitchen/bar) already exists
        const existing = await printerModel.findOne({ where: { type } });

        if (existing) {
            // Update the existing printer fields
            await existing.update({ printerName, connectionType, ipAddress, macAddress });
            return res.status(200).json({ message: `${type} printer updated`, data: existing });
        } else {
            // Create a new entry if it doesn't exist
            const newPrinter = await printerModel.create({ type, printerName, connectionType, ipAddress, macAddress });
            return res.status(201).json({ message: `${type} printer created`, data: newPrinter });
        }
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};