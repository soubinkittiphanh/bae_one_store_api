
const UnitModel = require('../models').unit;
const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');


exports.createUnitModel = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.error(`Validate data = false`)
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Create a new UnitModel with the data from the request body
    const newUnitModel = await UnitModel.create(req.body);
    res.status(201).json(newUnitModel);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

exports.getUnitModels = async (req, res) => {
  try {
    // Find all UnitModels in the database
    const unitModels = await UnitModel.findAll();
    res.status(200).json(unitModels);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
exports.getUnitActiveModels = async (req, res) => {
  try {
    // Find all UnitModels in the database
    const unitModels = await UnitModel.findAll({where:{isActive:true}});
    res.status(200).json(unitModels);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getUnitModelById = async (req, res) => {
  const { id } = req.params;
  try {
    // Find the UnitModel with the specified id
    const unitModel = await UnitModel.findByPk(id);
    if (unitModel) {
      res.status(200).json(unitModel);
    } else {
      res.status(404).json({ message: 'Unit model not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.updateUnitModel = async (req, res) => {
  const { id } = req.params;
  const { name, unitRate, isActive } = req.body;
  try {
    const unit = await UnitModel.findByPk(id);
    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }
    unit.name = name;
    unit.unitRate = unitRate;
    unit.isActive = isActive;
    await unit.save();
    res.json(unit);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ message: 'Something went wrong' });
  }
};
// exports.updateUnitModel = async (req, res) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     return res.status(400).json({ errors: errors.array() });
//   }

//   const { id } = req.params;
//   try {
//     // Find the UnitModel with the specified id and update its data
//     const [rowsAffected, [updatedUnitModel]] = await UnitModel.update(req.body, {
//       where: { id },
//       returning: true
//     });
//     if (rowsAffected === 1) {
//       res.status(200).json(updatedUnitModel);
//     } else {
//       res.status(404).json({ message: 'Unit model not found' });
//     }
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// };

exports.deleteUnitModel = async (req, res) => {
  const { id } = req.params;
  try {
    // Delete the UnitModel with the specified id
    const rowsAffected = await UnitModel.destroy({ where: { id } });
    if (rowsAffected === 1) {
      res.status(204).end();
    } else {
      res.status(404).json({ message: 'Unit model not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
