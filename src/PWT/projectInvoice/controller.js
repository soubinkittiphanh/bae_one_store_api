const { Project, ProjectBudget, ProjectContract, ProjectInvoice, currency } = require("../../models");

exports.getAll = async (req, res) => {
    try {
        const { contractId, status } = req.query;
        const where = {};
        if (contractId) where.contractId = contractId;
        if (status) where.status = status;
        const invoices = await ProjectInvoice.findAll({
            where,
            include: [
                {
                    model: ProjectContract,
                    as: 'contract',
                    include: [{ model: Project, as: 'project' }]
                }
            ],
            order: [['createdAt', 'DESC']]
        });
        return res.json({ success: true, data: invoices });
    } catch (error) {
        console.error("Error fetching project invoices:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.getById = async (req, res) => {
    try {
        const invoice = await ProjectInvoice.findByPk(req.params.id, {
            include: [
                {
                    model: ProjectContract,
                    as: 'contract',
                    include: [{ model: Project, as: 'project' }]
                }
            ]
        });
        if (!invoice) {
            return res.status(404).json({ success: false, message: "Invoice not found" });
        }
        return res.json({ success: true, data: invoice });
    } catch (error) {
        console.error("Error fetching invoice:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.create = async (req, res) => {
    const transaction = await ProjectInvoice.sequelize.transaction();
    try {
        const { contractId, invoiceNumber, claimNumber, invoiceDate, grossAmount } = req.body;
        
        const contract = await ProjectContract.findByPk(contractId, {
            include: [{ model: Project, as: 'project' }],
            transaction
        });

        if (!contract) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: "Contract not found" });
        }

        const gross = parseFloat(grossAmount) || 0;
        if (contract.spentValue + gross > contract.totalValue) {
            await transaction.rollback();
            return res.status(400).json({ 
                success: false, 
                message: `Invoice value exceeds contract limit. Limit: ${contract.totalValue}, Current Spent: ${contract.spentValue}, Request: ${gross}` 
            });
        }

        const retentionRate = parseFloat(contract.retentionRate) || 10.00;
        const counterpartRatio = parseFloat(contract.project.counterpartRatio) || 0.00;

        const retentionAmount = gross * (retentionRate / 100);
        const netAmount = gross - retentionAmount;

        const counterpartFundingAmount = gross * (counterpartRatio / 100);
        const adbFundingAmount = gross - counterpartFundingAmount;

        const invoice = await ProjectInvoice.create({
            contractId,
            invoiceNumber,
            claimNumber: parseInt(claimNumber) || 1,
            invoiceDate,
            grossAmount: gross,
            retentionAmount,
            netAmount,
            adbFundingAmount,
            counterpartFundingAmount,
            status: 'DRAFT'
        }, { transaction });

        await transaction.commit();

        return res.status(201).json({ success: true, data: invoice });
    } catch (error) {
        await transaction.rollback();
        console.error("Error creating project invoice:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.approve = async (req, res) => {
    const transaction = await ProjectInvoice.sequelize.transaction();
    try {
        const { id } = req.params;
        const invoice = await ProjectInvoice.findByPk(id, {
            include: [
                {
                    model: ProjectContract,
                    as: 'contract',
                    include: [{ model: Project, as: 'project' }]
                }
            ],
            transaction
        });

        if (!invoice) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: "Invoice not found" });
        }

        if (invoice.status !== 'PENDING' && invoice.status !== 'DRAFT') {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "Invoice is already approved or cancelled." });
        }

        const contract = invoice.contract;
        await contract.update({
            spentValue: parseFloat(contract.spentValue) + parseFloat(invoice.grossAmount)
        }, { transaction });

        const budget = await ProjectBudget.findOne({
            where: { projectId: contract.projectId },
            transaction
        });
        if (budget) {
            await budget.update({
                spentAmount: parseFloat(budget.spentAmount) + parseFloat(invoice.grossAmount)
            }, { transaction });
        }

        await invoice.update({ status: 'APPROVED' }, { transaction });

        await transaction.commit();
        return res.json({ success: true, message: "Invoice approved successfully." });
    } catch (error) {
        await transaction.rollback();
        console.error("Error approving project invoice:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
