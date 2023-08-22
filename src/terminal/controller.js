
const  Terminal  = require('../models').terminal;

async function getAllTerminals(req, res) {
  try {
    const terminals = await Terminal.findAll();
    res.status(200).json(terminals);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function getTerminalById(req, res) {
  try {
    const terminal = await Terminal.findByPk(req.params.id);
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
    const { code, name, description, saleRate, isActive,locationId } = req.body;
    const terminal = await Terminal.create({ code, name, description, saleRate, isActive,locationId });
    res.status(201).json(terminal);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function updateTerminal(req, res) {
  try {
    const terminal = await Terminal.findByPk(req.params.id);
    if (!terminal) {
      res.status(404).json({ message: 'Terminal not found' });
    } else {
      const { code, name, description, saleRate, isActive,locationId } = req.body;
      await terminal.update({ code, name, description, saleRate, isActive,locationId });
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
      await terminal.destroy();
      res.status(204).json();
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = {
  getAllTerminals,
  getTerminalById,
  createTerminal,
  updateTerminal,
  deleteTerminal,
};
