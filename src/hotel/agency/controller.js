
const logger = require('../../api/logger');
const  Agent  = require('../../models').agent; // Adjust the path as needed

const getAllAgents = async (req, res) => {
  try {
    const agents = await Agent.findAll();
    return res.status(200).json(agents);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const getAgentById = async (req, res) => {
  const { agentId } = req.params;

  try {
    const agent = await Agent.findByPk(agentId);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    return res.status(200).json(agent);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const createAgent = async (req, res) => {
  const { name, lname, telephone, email, isActive } = req.body;

  try {
    const newAgent = await Agent.create({ name, lname, telephone, email, isActive });
    return res.status(201).json(newAgent);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateAgent = async (req, res) => {
  const { agentId } = req.params;
  const { name, lname, telephone, email, isActive } = req.body;

  try {
    const agent = await Agent.findByPk(agentId);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    await agent.update({ name, lname, telephone, email, isActive });
    return res.status(200).json(agent);
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const deleteAgent = async (req, res) => {
  const { agentId } = req.params;

  try {
    const agent = await Agent.findByPk(agentId);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    await agent.destroy();
    return res.status(204).send();
  } catch (error) {
    logger.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getAllAgents,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
};

