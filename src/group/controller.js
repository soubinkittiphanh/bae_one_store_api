const logger = require('../api/logger');
const Group = require('../models').group;
const MenuHeader = require('../models').menuHeader;
const MenuLine = require('../models').menuLine;
const Authority = require('../models').authority;
const { Op } = require('sequelize');

const controller = {
  async create(req, res) {
    try {
      const { name, code, isActive, menuHeaders } = req.body;
      const group = await Group.create({
        name,
        code,
        isActive,
      });
      try {
        // await group.setAuthorities(authorityList);
        await setMenus(group.id, menuHeaders, res)
      } catch (error) {
        logger.error(`update authority error ${error}`)
      }

      return res.status(201).json(Group);
    } catch (error) {
      logger.error(`Cannot create group ${error}`);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  async findAll(req, res) {
    try {
      const group = await Group.findAll({
        include: [{
          model: MenuHeader,
          through: { attributes: [] },
          include: [
            {
              model: MenuLine,
              attributes: ['name', 'llname', 'icon', 'path'],
            }
          ]
        }]
      });
      return res.status(200).json(group);
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
  async findAllActive(req, res) {
    try {
      const group = await Group.findAll({
        where: {
          isActive: true
        },
        include: [{
          model: MenuHeader,
          through: { attributes: [] },
          include: [
            {
              model: MenuLine,
              attributes: ['name', 'llname', 'icon', 'path'],
            }
          ]
        }]
      });
      return res.status(200).json(group);
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  async findById(req, res) {
    try {
      const { id } = req.params;
      const group = await Group.findByPk(id, {
        include: [{
          model: MenuHeader,
          through: { attributes: [] },
          include: [
            {
              model: MenuLine,
              attributes: ['name', 'llname', 'icon', 'path'],
            }
          ]
        }]
      });
      if (!Group) {
        return res.status(404).json({ message: 'Group not found' });
      }
      return res.status(200).json(group);
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, code, isActive, menuHeaders } = req.body;
      const group = await Group.findByPk(id, {
        include: [{
          model: MenuHeader,
          through: { attributes: [] }
        }]
      });
      if (!group) {
        return res.status(404).json({ message: 'Group not found' });
      }
      group.name = name;
      group.code = code;
      group.isActive = isActive;

      logger.info(`Authories list ${menuHeaders.length}`)
      await group.save();
      await setMenus(group.id, menuHeaders, res)
    } catch (error) {
      logger.error(`something wrong ${error}`);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;
      const group = await Group.findByPk(id);
      if (!group) {
        return res.status(404).json({ message: 'Group not found' });
      }
      await group.destroy();
      return res.status(204).json();
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
}

const setTerminals = async (userId, terminalList, res) => {
  logger.info(`ID GROUP ${userId} | terminal ${terminalList.length}`)
  try {
    const group = await Group.findByPk(userId, {
      include: [{
        model: MenuHeader,
        through: { attributes: [] }
      }]
    });
    if (!group) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    logger.info(`Group found ${group.name}`)
    for (const iterator of terminalList) {
      logger.warn(`Group loop ${iterator['name']}`)
    }
    const terminals = await Authority.findAll({
      where: {
        id: {
          [Op.in]: terminalList.map(el => el.id)
        }
      }
    });
    await group.setAuthorities(terminals);
    res.status(200).json(group);
  } catch (error) {
    logger.error(`ERROR update terminal list ${error}`)
    res.status(500).json({ message: error });
  }
}

const setMenus = async (groupId, menuHeaderList, res) => {
  logger.info(`ID GROUP ${groupId} | terminal ${menuHeaderList.length}`)
  try {
    const group = await Group.findByPk(groupId, {
      include: [{
        model: MenuHeader,
        through: { attributes: [] }
      }]
    });
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }
    logger.info(`Group found ${group.name}`)
    for (const iterator of menuHeaderList) {
      logger.warn(`Group loop ${iterator['name']}`)
    }
    const menuHeader = await MenuHeader.findAll({
      where: {
        id: {
          [Op.in]: menuHeaderList.map(el => el.id)
        }
      }
    });
    await group.setMenuHeaders(menuHeader);
    res.status(200).json(group);
  } catch (error) {
    logger.error(`ERROR update terminal list ${error}`)
    res.status(500).json({ message: error });
  }
}

module.exports = controller

