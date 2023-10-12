const logger = require('../api/logger');
const Authority = require('../models').authority;


// GET all authorities
exports.getAllAuthorities = async (req, res) => {
  try {
    const authorities = await Authority.findAll();
    res.status(200).json(authorities);
  } catch (error) {
    logger.error(error);
    res.status(503).send(error)
  }
};
exports.getAllActiveAuthorities = async (req, res) => {
  try {
    const authorities = await Authority.findAll({where:{isActive:true}});
    res.status(200).json(authorities);
  } catch (error) {
    logger.error(error);
    res.status(503).send(error)
  }
};

// GET a single authority by ID
exports.getAuthorityById = async (req, res) => {
  const { id } = req.params;
  try {
    const authority = await Authority.findByPk(id);
    if (!authority) {
      return res.status(404).json({ message: 'Authority not found' });
    }
    res.status(200).json(authority);
  } catch (error) {
    logger.error(error);
    res.status(503).send(error)
  }
};

// POST a new authority
exports.createAuthority = async (req, res) => {
  const { code, name, isActive } = req.body;
  try {
    const authority = await Authority.create({
      code,
      name,
      isActive,
    });
    res.status(201).json(authority);
  } catch (error) {
    logger.error(error);
    res.status(503).send(error)
  }
};

// PUT (update) an existing authority
exports.updateAuthority = async (req, res) => {
  const { id } = req.params;
  const { code, name, isActive } = req.body;
  try {
    const authority = await Authority.findByPk(id);
    if (!authority) {
      return res.status(404).json({ message: 'Authority not found' });
    }
    authority.code = code;
    authority.name = name;
    authority.isActive = isActive;
    await authority.save();
    res.status(200).json(authority);
  } catch (error) {
    logger.error(error);
    res.status(503).send(error)
  }
};

// DELETE an authority
exports.deleteAuthority = async (req, res) => {
  const { id } = req.params;
  try {
    const authority = await Authority.findByPk(id);
    if (!authority) {
      return res.status(404).json({ message: 'Authority not found' });
    }
    await authority.destroy();
    res.status(204).send(`operation done`);
  } catch (error) {
    logger.error(error);
    res.status(503).send(error)
  }
};
