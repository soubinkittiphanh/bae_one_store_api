const { terminal: Terminal, location: Location, company: Company, bankAccount: BankAccount, terminalAudit, user: User } = require('../models');
const logger = require('../api/logger');

async function getAllTerminals(req, res) {
  try {
    const terminals = await Terminal.findAll({
      include: [{
        model: Location,
        as: "location",
        include: [
          {
            model: Company,
            as: "company"
          },
        ]
      }, {
        model: BankAccount,
        as: "bankAccount"
      }]
    });
    res.status(200).json(terminals);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function getTerminalById(req, res) {
  try {
    const terminal = await Terminal.findByPk(req.params.id,{
      include: [{
        model: Location,
        as: "location",
        include: [
          {
            model: Company,
            as: "company"
          },
        ]
      }, {
        model: BankAccount,
        as: "bankAccount"
      }]
    });
    if (!terminal) {
      res.status(404).json({ message: 'Terminal not found' });
    } else {
      res.status(200).json(terminal);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function createTerminal(req, res) {
  try {
    const { code, name, description, saleRate, isActive, locationId, bankAccountId } = req.body;

    // Create the terminal
    const terminal = await Terminal.create({
      code,
      name,
      description,
      saleRate,
      isActive,
      locationId,
      bankAccountId
    }, {
      context: { userId: req.user?.id || 1, reason: 'Terminal created via API' }
    });

    // Refetch with associations
    const fullTerminal = await Terminal.findByPk(terminal.id, {
      include: [{
        model: Location,
        as: "location",
        include: [{
          model: Company,
          as: "company"
        }]
      }]
    });

    res.status(201).json(fullTerminal);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function updateTerminal(req, res) {
  try {
    const terminal = await Terminal.findByPk(req.params.id, {
      include: [{
        model: Location,
        as: "location",
        include: [
          {
            model: Company,
            as: "company"
          },
        ]
      }]
    });

    if (!terminal) {
      res.status(404).json({ message: 'Terminal not found' });
    } else {
      const { code, name, description, saleRate, isActive, locationId, bankAccountId, reason } = req.body;
      await terminal.update({ code, name, description, saleRate, isActive, locationId, bankAccountId }, {
        context: { userId: req.user?.id || 1, reason: reason || 'Terminal updated via API' }
      });
      res.status(200).json(terminal);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
}


async function deleteTerminal(req, res) {
  try {
    const terminal = await Terminal.findByPk(req.params.id);
    if (!terminal) {
      res.status(404).json({ message: 'Terminal not found' });
    } else {
      await terminal.destroy({
        context: { userId: req.user?.id || 1, reason: req.body?.reason || 'Terminal deleted via API' }
      });
      res.status(204).json();
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function getTerminalAudit(req, res) {
  try {
    const { id } = req.params;
    logger.info(`Fetching audit records for terminal ID: ${id}`);

    const auditRecords = await terminalAudit.findAll({
      where: { terminalId: id },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'cus_name', 'cus_email']
        }
      ],
      order: [['auditDate', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: auditRecords
    });
  } catch (error) {
    logger.error('Error fetching terminal audit:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}

module.exports = {
  getAllTerminals,
  getTerminalById,
  createTerminal,
  updateTerminal,
  deleteTerminal,
  getTerminalAudit,
};
