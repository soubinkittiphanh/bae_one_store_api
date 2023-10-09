const logger = require('../api/logger');
const Tutorial = require('../models').tuturial;

const tutorialController = {
  getAllTutorials: async (req, res) => {
    try {
      const tutorials = await Tutorial.findAll();
      res.json(tutorials);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ message: 'Something went wrong' });
    }
  },
  increaseViewCount: async (req, res) => {
    const { id } = req.params;
    try {
      const tutorial = await Tutorial.findByPk(id);
      if (!tutorial) {
        return res.status(404).json({ message: 'Tutorial not found' });
      }
      await tutorial.increment('view');
      res.json({ message: 'View count increased successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Something went wrong' });
    }
  },
  getAllActiveTutorials: async (req, res) => {
    try {
      const tutorials = await Tutorial.findAll({ where: { isActive: true } });
      res.json(tutorials);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ message: 'Something went wrong' });
    }
  },

  getTutorialById: async (req, res) => {
    const { id } = req.params;
    try {
      const tutorial = await Tutorial.findByPk(id);
      if (!tutorial) {
        return res.status(404).json({ message: 'Tutorial not found' });
      }
      res.json(tutorial);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ message: 'Something went wrong' });
    }
  },

  createTutorial: async (req, res) => {
    const { topic, youtubeLink, view, isActive } = req.body;
    logger.info(req.body)
    try {
      const tutorial = await Tutorial.create({ topic, youtubeLink, view, isActive });
      res.json(tutorial);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ message: 'Something went wrong' });
    }
  },

  updateTutorial: async (req, res) => {
    const { id } = req.params;
    const { topic, youtubeLink, view, isActive } = req.body;
    try {
      const tutorial = await Tutorial.findByPk(id);
      if (!tutorial) {
        return res.status(404).json({ message: 'Tutorial not found' });
      }
      tutorial.topic = topic;
      tutorial.youtubeLink = youtubeLink;
      tutorial.view = view;
      tutorial.isActive = isActive;
      await tutorial.save();
      res.json(tutorial);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ message: 'Something went wrong' });
    }
  },

  deleteTutorial: async (req, res) => {
    const { id } = req.params;
    try {
      const tutorial = await Tutorial.findByPk(id);
      if (!tutorial) {
        return res.status(404).json({ message: 'Tutorial not found' });
      }
      await tutorial.destroy();
      res.json({ message: 'Tutorial deleted successfully' });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ message: 'Something went wrong' });
    }
  }
};

module.exports = tutorialController;
