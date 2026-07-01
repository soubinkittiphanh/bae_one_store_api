const { Project, ProjectBudget, currency } = require("../../models");

exports.getAll = async (req, res) => {
    try {
        const { search, status } = req.query;
        const where = {};
        if (status) where.status = status;
        if (search) {
            const { Op } = require("sequelize");
            where[Op.or] = [
                { code: { [Op.like]: `%${search}%` } },
                { nameLo: { [Op.like]: `%${search}%` } },
                { nameEn: { [Op.like]: `%${search}%` } }
            ];
        }
        const projects = await Project.findAll({
            where,
            include: [
                { model: currency, as: 'currency' },
                { model: ProjectBudget, as: 'budgets' }
            ],
            order: [['createdAt', 'DESC']]
        });
        return res.json({ success: true, data: projects });
    } catch (error) {
        console.error("Error fetching projects:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.getById = async (req, res) => {
    try {
        const project = await Project.findByPk(req.params.id, {
            include: [
                { model: currency, as: 'currency' },
                { model: ProjectBudget, as: 'budgets' }
            ]
        });
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        return res.json({ success: true, data: project });
    } catch (error) {
        console.error("Error fetching project by ID:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.create = async (req, res) => {
    const transaction = await Project.sequelize.transaction();
    try {
        const { code, nameLo, nameEn, description, donor, totalBudget, counterpartRatio, currencyId, budgets } = req.body;
        
        // 1. Create project
        const project = await Project.create({
            code,
            nameLo,
            nameEn,
            description,
            donor,
            totalBudget,
            counterpartRatio,
            currencyId,
            status: 'ACTIVE'
        }, { transaction });

        // 2. Initialize budgets
        const defaultCategories = ['Civil Works', 'Consulting Services', 'Equipment', 'Operating Costs'];
        const budgetsToCreate = defaultCategories.map(cat => {
            const inputBud = budgets ? budgets.find(b => b.categoryName === cat) : null;
            return {
                projectId: project.id,
                categoryName: cat,
                allocatedAmount: inputBud ? parseFloat(inputBud.allocatedAmount) || 0 : 0,
                committedAmount: 0,
                spentAmount: 0
            };
        });

        await ProjectBudget.bulkCreate(budgetsToCreate, { transaction });

        await transaction.commit();

        const createdProject = await Project.findByPk(project.id, {
            include: [
                { model: currency, as: 'currency' },
                { model: ProjectBudget, as: 'budgets' }
            ]
        });

        return res.status(201).json({ success: true, data: createdProject });
    } catch (error) {
        await transaction.rollback();
        console.error("Error creating project:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.update = async (req, res) => {
    const transaction = await Project.sequelize.transaction();
    try {
        const { id } = req.params;
        const { nameLo, nameEn, description, donor, totalBudget, counterpartRatio, currencyId, status, budgets } = req.body;
        
        const project = await Project.findByPk(id);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        await project.update({
            nameLo,
            nameEn,
            description,
            donor,
            totalBudget,
            counterpartRatio,
            currencyId,
            status
        }, { transaction });

        if (budgets && Array.isArray(budgets)) {
            for (const bud of budgets) {
                if (bud.id) {
                    const budgetRecord = await ProjectBudget.findByPk(bud.id);
                    if (budgetRecord && budgetRecord.projectId === project.id) {
                        await budgetRecord.update({
                            allocatedAmount: parseFloat(bud.allocatedAmount) || 0
                        }, { transaction });
                    }
                }
            }
        }

        await transaction.commit();

        const updatedProject = await Project.findByPk(id, {
            include: [
                { model: currency, as: 'currency' },
                { model: ProjectBudget, as: 'budgets' }
            ]
        });

        return res.json({ success: true, data: updatedProject });
    } catch (error) {
        await transaction.rollback();
        console.error("Error updating project:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.delete = async (req, res) => {
    try {
        const { id } = req.params;
        const project = await Project.findByPk(id);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }
        await project.destroy();
        return res.json({ success: true, message: "Project deleted successfully" });
    } catch (error) {
        console.error("Error deleting project:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
