const logger = require('../../api/logger');
const MenuLine = require('../../models').menuLine;
const {menuList} = require('./lines')
const getMenuLines = async (req, res) => {
  try {
    const menuLines = await MenuLine.findAll();
    res.status(200).json(menuLines);
  } catch (error) {
    logger.error('Error fetching menu lines:', error);
    res.status(500).send('Internal Server Error');
  }
};

const getMenuLineById = async (req, res) => {
  const { id } = req.params;

  try {
    const menuLine = await MenuLine.findByPk(id);

    if (!menuLine) {
      res.status(404).json({ error: 'Menu line not found' });
      return;
    }

    res.status(200).json(menuLine);
  } catch (error) {
    logger.error('Error fetching menu line by ID:', error);
    res.status(500).send('Internal Server Error');
  }
};

// 'a, b ,,c' -> 'a,b,c'; empty -> null. Accepts an array too.
const normalizeMobileKey = value => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const keys = (Array.isArray(value) ? value : String(value).split(','))
    .map(k => String(k).trim())
    .filter(Boolean);
  return keys.length ? [...new Set(keys)].join(',') : null;
};

const createMenuLine = async (req, res) => {
  const { name, llname, path, remark, icon, isActive, mobileKey } = req.body;

  try {
    const newMenuLine = await MenuLine.create({
      name,
      icon,
      llname,
      path,
      remark,
      isActive,
      mobileKey: normalizeMobileKey(mobileKey) ?? null,
    });

    res.status(201).json(newMenuLine);
  } catch (error) {
    logger.error('Error creating menu line:', error);
    res.status(500).send('Internal Server Error');
  }
};

const generateMenuLine = async (req, res) => {

  try {
    const newMenuLine = await MenuLine.bulkCreate(menuList);
    res.status(201).json(newMenuLine);
  } catch (error) {
    logger.error('Error creating menu line:', error);
    res.status(500).send('Internal Server Error');
  }
};

const updateMenuLine = async (req, res) => {
  const { id } = req.params;
  const { name, llname, path, remark, icon, isActive, mobileKey } = req.body;

  try {
    const menuLine = await MenuLine.findByPk(id);

    if (!menuLine) {
      res.status(404).json({ error: 'Menu line not found' });
      return;
    }

    await menuLine.update({
      name,
      llname,
      path,
      icon,
      remark,
      isActive,
      // Only when sent: older web builds don't know the field and must not clear it
      ...(mobileKey !== undefined ? { mobileKey: normalizeMobileKey(mobileKey) } : {}),
    });

    res.status(200).json(menuLine);
  } catch (error) {
    logger.error('Error updating menu line:', error);
    res.status(500).send('Internal Server Error');
  }
};

const deleteMenuLine = async (req, res) => {
  const { id } = req.params;

  try {
    const menuLine = await MenuLine.findByPk(id);

    if (!menuLine) {
      res.status(404).json({ error: 'Menu line not found' });
      return;
    }

    await menuLine.destroy();
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting menu line:', error);
    res.status(500).send('Internal Server Error');
  }
};

module.exports = {
  getMenuLines,
  getMenuLineById,
  createMenuLine,
  updateMenuLine,
  deleteMenuLine,
  generateMenuLine
};
