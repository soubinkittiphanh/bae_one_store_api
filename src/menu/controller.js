
const { Op } = require('sequelize');
const logger = require('../api/logger');
const MenuHeader = require('../models').menuHeader; // Adjust the path based on your project structure
const MenuLine = require('../models').menuLine; // Adjust the path based on your project structure

const getMenuHeaders = async (req, res) => {
  try {
    const menuHeaders = await MenuHeader.findAll({
      include: [{
        model: MenuLine,
        through: { attributes: [] }
      }]
    });
    res.status(200).json(menuHeaders);
  } catch (error) {
    logger.error('Error fetching menu headers:', error);
    res.status(500).send('Internal Server Error');
  }
};

const getMenuHeaderById = async (req, res) => {
  const { id } = req.params;

  try {
    const menuHeader = await MenuHeader.findByPk(id, {
      include: [{
        model: MenuLine,
        through: { attributes: [] }
      }]
    });

    if (!menuHeader) {
      res.status(404).json({ error: 'Menu header not found' });
      return;
    }

    res.status(200).json(menuHeader);
  } catch (error) {
    logger.error('Error fetching menu header by ID:', error);
    res.status(500).send('Internal Server Error');
  }
};

const createMenuHeader = async (req, res) => {
  const { code, name, llname, remark, icon, isActive, menuLines } = req.body;

  try {
    const newMenuHeader = await MenuHeader.create({
      code,
      name,
      llname,
      icon,
      remark,
      isActive,
    });
    await setmenuLine(newMenuHeader['id'], menuLines, res)
    // res.status(201).json(newMenuHeader);
  } catch (error) {
    logger.error('Error creating menu header:', error);
    res.status(500).send('Internal Server Error');
  }
};
const generateMenuHeader = async (req, res) => {

  const menuHeaderList = [
    {
      "code": "REPORT", // Replace with your desired code
      "icon": "mdi mdi-chart-arc", // Replace with your desired icon
      "name": "REPORT",
      "llname": "ລາຍງານ", // llname stands for localized name, replace with actual localized name
      "remark": "Some remarks about the menu",
      "isActive": true // Set to false if the menu is not active by default
    },
    {
      "code": "SHIPPING", // Replace with your desired code
      "icon": "mdi mdi-shopping", // Replace with your desired icon
      "name": "SHIPPING",
      "llname": "ຂົນສົ່ງ", // llname stands for localized name, replace with actual localized name
      "remark": "Some remarks about the menu",
      "isActive": true // Set to false if the menu is not active by default
    },
    {
      "code": "POS", // Replace with your desired code
      "icon": "mdi mdi-printer", // Replace with your desired icon
      "name": "POS",
      "llname": "ການຂາຍ", // llname stands for localized name, replace with actual localized name
      "remark": "Some remarks about the menu",
      "isActive": true // Set to false if the menu is not active by default
    },
    {
      "code": "PRODUCT", // Replace with your desired code
      "icon": "mdi mdi-bottle-wine", // Replace with your desired icon
      "name": "PRODUCT",
      "llname": "ສິນຄ້າ", // llname stands for localized name, replace with actual localized name
      "remark": "Some remarks about the menu",
      "isActive": true // Set to false if the menu is not active by default
    },
    {
      "code": "BRANCH", // Replace with your desired code
      "icon": "mdi mdi-source-branch", // Replace with your desired icon
      "name": "BRANCH",
      "llname": "ຮ້ານຄ້າ", // llname stands for localized name, replace with actual localized name
      "remark": "Some remarks about the menu",
      "isActive": true // Set to false if the menu is not active by default
    },
    {
      "code": "ACCOUNT", // Replace with your desired code
      "icon": "mdi mdi-calculator-variant", // Replace with your desired icon
      "name": "ACCOUNT",
      "llname": "ບັນຊີ", // llname stands for localized name, replace with actual localized name
      "remark": "Some remarks about the menu",
      "isActive": true // Set to false if the menu is not active by default
    },
    {
      "code": "HELP", // Replace with your desired code
      "icon": "mdi mdi-book-open-page-variant-outline", // Replace with your desired icon
      "name": "HELP",
      "llname": "ຮຽນຮູ້", // llname stands for localized name, replace with actual localized name
      "remark": "Some remarks about the menu",
      "isActive": true // Set to false if the menu is not active by default
    },
    {
      "code": "MODULES", // Replace with your desired code
      "icon": "mdi mdi-database-arrow-up", // Replace with your desired icon
      "name": "Modules",
      "llname": "ຮຽນຮູ້", // llname stands for localized name, replace with actual localized name
      "remark": "Some remarks about the menu",
      "isActive": true // Set to false if the menu is not active by default
    },
    {
      "code": "SETTING", // Replace with your desired code
      "icon": "mdi mdi-cog", // Replace with your desired icon
      "name": "SETTING",
      "llname": "ຕັ້ງຄ່າ", // llname stands for localized name, replace with actual localized name
      "remark": "Some remarks about the menu",
      "isActive": true // Set to false if the menu is not active by default
    },
  ]
  try {
    const newMenuHeader = await MenuHeader.bulkCreate(menuHeaderList);
    res.status(201).json(newMenuHeader);
  } catch (error) {
    logger.error('Error creating menu header:', error);
    res.status(500).send('Internal Server Error');
  }
};

const updateMenuHeader = async (req, res) => {
  const { id } = req.params;
  const { code, name, llname, icon, remark, isActive, menuLines } = req.body;

  try {
    const menuHeader = await MenuHeader.findByPk(id);

    if (!menuHeader) {
      res.status(404).json({ error: 'Menu header not found' });
      return;
    }
    await menuHeader.update({
      code,
      name, icon,
      llname,
      remark,
      isActive,
    });
    await setmenuLine(id, menuLines, res)
  } catch (error) {
    logger.error('Error updating menu header:', error);
    res.status(500).send('Internal Server Error');
  }
};

const deleteMenuHeader = async (req, res) => {
  const { id } = req.params;

  try {
    const menuHeader = await MenuHeader.findByPk(id);

    if (!menuHeader) {
      res.status(404).json({ error: 'Menu header not found' });
      return;
    }

    await menuHeader.destroy();
    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting menu header:', error);
    res.status(500).send('Internal Server Error');
  }
};

const setmenuLine = async (headerId, line, res) => {
  logger.info(`Header ${headerId} | line ${line.length}`)
  try {
    const header = await MenuHeader.findByPk(headerId, {
      include: [{
        model: MenuLine,
        through: { attributes: [] }
      }]
    });
    if (!header) {
      return res.status(404).json({ message: 'Menu header not found' });
    }
    logger.info(`Group found ${header.name}`)
    for (const iterator of line) {
      logger.warn(`Group loop ${iterator['name']}`)
    }

    const menuLine = await MenuLine.findAll({
      where: {
        id: {
          [Op.in]: line.map(el => el.id)
        }
      }
    });
    await header.setMenuLines(menuLine);
    res.status(200).json(header);
  } catch (error) {
    logger.error(`ERROR update terminal list ${error}`)
    res.status(500).json({ message: error });
  }
}

module.exports = {
  getMenuHeaders,
  getMenuHeaderById,
  createMenuHeader,
  updateMenuHeader,
  deleteMenuHeader,
  generateMenuHeader
};
