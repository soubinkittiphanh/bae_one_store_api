const { Project, ProjectBudget, ProjectContract, currency } = require("../../models");

exports.getAll = async (req, res) => {
    try {
        const { search, projectId } = req.query;
        const where = {};
        if (projectId) where.projectId = projectId;
        if (search) {
            const { Op } = require("sequelize");
            where[Op.or] = [
                { contractNumber: { [Op.like]: `%${search}%` } },
                { contractorName: { [Op.like]: `%${search}%` } }
            ];
        }
        const contracts = await ProjectContract.findAll({
            where,
            include: [
                { model: Project, as: 'project' },
                { model: currency, as: 'currency' }
            ],
            order: [['createdAt', 'DESC']]
        });
        return res.json({ success: true, data: contracts });
    } catch (error) {
        console.error("Error fetching contracts:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.getById = async (req, res) => {
    try {
        const contract = await ProjectContract.findByPk(req.params.id, {
            include: [
                { model: Project, as: 'project' },
                { model: currency, as: 'currency' }
            ]
        });
        if (!contract) {
            return res.status(404).json({ success: false, message: "Contract not found" });
        }
        return res.json({ success: true, data: contract });
    } catch (error) {
        console.error("Error fetching contract:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.create = async (req, res) => {
    const transaction = await ProjectContract.sequelize.transaction();
    try {
        const { projectId, contractNumber, contractorName, totalValue, currencyId, retentionRate, categoryName } = req.body;
        
        // 1. Find Project Budget for category
        const budget = await ProjectBudget.findOne({
            where: { projectId, categoryName },
            transaction
        });

        if (!budget) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: `Category '${categoryName}' budget not found for this project.` });
        }

        const value = parseFloat(totalValue) || 0;
        const available = parseFloat(budget.allocatedAmount) - parseFloat(budget.committedAmount);
        
        if (value > available) {
            await transaction.rollback();
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient budget for category '${categoryName}'. Available: ${available}, Required: ${value}` 
            });
        }

        // 2. Create Contract
        const contract = await ProjectContract.create({
            projectId,
            contractNumber,
            contractorName,
            totalValue: value,
            committedValue: value,
            spentValue: 0.00,
            currencyId,
            retentionRate: parseFloat(retentionRate) || 10.00,
            status: 'ACTIVE'
        }, { transaction });

        // 3. Update Project Budget commitment
        await budget.update({
            committedAmount: parseFloat(budget.committedAmount) + value
        }, { transaction });

        await transaction.commit();

        const createdContract = await ProjectContract.findByPk(contract.id, {
            include: [
                { model: Project, as: 'project' },
                { model: currency, as: 'currency' }
            ]
        });

        return res.status(201).json({ success: true, data: createdContract });
    } catch (error) {
        await transaction.rollback();
        console.error("Error creating contract:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.update = async (req, res) => {
    const transaction = await ProjectContract.sequelize.transaction();
    try {
        const { id } = req.params;
        const { contractorName, totalValue, status, categoryName } = req.body;

        const contract = await ProjectContract.findByPk(id, { transaction });
        if (!contract) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: "Contract not found" });
        }

        const oldValue = parseFloat(contract.totalValue) || 0;
        const newValue = totalValue !== undefined ? parseFloat(totalValue) : oldValue;
        const diff = newValue - oldValue;

        if (diff !== 0 && categoryName) {
            // Validate commitment variance
            const budget = await ProjectBudget.findOne({
                where: { projectId: contract.projectId, categoryName },
                transaction
            });

            if (!budget) {
                await transaction.rollback();
                return res.status(400).json({ success: false, message: `Category '${categoryName}' budget not found.` });
            }

            const available = parseFloat(budget.allocatedAmount) - parseFloat(budget.committedAmount);
            if (diff > available) {
                await transaction.rollback();
                return res.status(400).json({ 
                    success: false, 
                    message: `Insufficient budget for contract variance. Available: ${available}, Required: ${diff}` 
                });
            }

            // Update budget commitment
            await budget.update({
                committedAmount: parseFloat(budget.committedAmount) + diff
            }, { transaction });
        }

        await contract.update({
            contractorName,
            totalValue: newValue,
            committedValue: status === 'COMPLETED' ? contract.spentValue : contract.committedValue + diff,
            status
        }, { transaction });

        await transaction.commit();

        const updatedContract = await ProjectContract.findByPk(id, {
            include: [
                { model: Project, as: 'project' },
                { model: currency, as: 'currency' }
            ]
        });

        return res.json({ success: true, data: updatedContract });
    } catch (error) {
        await transaction.rollback();
        console.error("Error updating contract:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.delete = async (req, res) => {
    const transaction = await ProjectContract.sequelize.transaction();
    try {
        const { id } = req.params;
        const contract = await ProjectContract.findByPk(id, { transaction });
        if (!contract) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: "Contract not found" });
        }

        if (parseFloat(contract.spentValue) > 0) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "Cannot delete contract with paid invoices." });
        }

        const budgets = await ProjectBudget.findAll({
            where: { projectId: contract.projectId },
            transaction
        });

        for (const budget of budgets) {
            if (parseFloat(budget.committedAmount) >= parseFloat(contract.totalValue)) {
                await budget.update({
                    committedAmount: parseFloat(budget.committedAmount) - parseFloat(contract.totalValue)
                }, { transaction });
                break;
            }
        }

        await contract.destroy({ transaction });
        await transaction.commit();

        return res.json({ success: true, message: "Contract deleted successfully" });
    } catch (error) {
        await transaction.rollback();
        console.error("Error deleting contract:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
