const { Project, ProjectInvoice, WithdrawalApplication } = require("../../models");

exports.getAll = async (req, res) => {
    try {
        const { projectId, status } = req.query;
        const where = {};
        if (projectId) where.projectId = projectId;
        if (status) where.status = status;
        const WAs = await WithdrawalApplication.findAll({
            where,
            include: [{ model: Project, as: 'project' }],
            order: [['createdAt', 'DESC']]
        });
        return res.json({ success: true, data: WAs });
    } catch (error) {
        console.error("Error fetching WAs:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.getById = async (req, res) => {
    try {
        const wa = await WithdrawalApplication.findByPk(req.params.id, {
            include: [
                { model: Project, as: 'project' },
                { model: ProjectInvoice, as: 'invoices' }
            ]
        });
        if (!wa) {
            return res.status(404).json({ success: false, message: "Withdrawal Application not found" });
        }
        return res.json({ success: true, data: wa });
    } catch (error) {
        console.error("Error fetching WA:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.create = async (req, res) => {
    const transaction = await WithdrawalApplication.sequelize.transaction();
    try {
        const { projectId, waNumber, waDate, amount, invoiceIds } = req.body;

        const wa = await WithdrawalApplication.create({
            projectId,
            waNumber,
            waDate,
            amount: parseFloat(amount) || 0,
            status: 'DRAFT'
        }, { transaction });

        if (invoiceIds && Array.isArray(invoiceIds)) {
            for (const id of invoiceIds) {
                const invoice = await ProjectInvoice.findByPk(id, { transaction });
                if (invoice) {
                    await invoice.update({ withdrawalApplicationId: wa.id }, { transaction });
                }
            }
        }

        await transaction.commit();

        const createdWa = await WithdrawalApplication.findByPk(wa.id, {
            include: [{ model: ProjectInvoice, as: 'invoices' }]
        });

        return res.status(201).json({ success: true, data: createdWa });
    } catch (error) {
        await transaction.rollback();
        console.error("Error creating WA:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateStatus = async (req, res) => {
    const transaction = await WithdrawalApplication.sequelize.transaction();
    try {
        const { id } = req.params;
        const { status } = req.body; 

        const wa = await WithdrawalApplication.findByPk(id, { transaction });
        if (!wa) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: "WA not found" });
        }

        await wa.update({ status }, { transaction });

        if (status === 'DISBURSED') {
            await ProjectInvoice.update(
                { status: 'PAID' },
                { where: { withdrawalApplicationId: wa.id }, transaction }
            );
        }

        await transaction.commit();
        return res.json({ success: true, message: `WA status updated to ${status} successfully.` });
    } catch (error) {
        await transaction.rollback();
        console.error("Error updating WA status:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
