
const Reservation = require('../models').reservation;
const logger = require('../api/logger');
const { Op } = require('sequelize');
const headerService = require('./service')
const lineService = require('./line/service');
const { sequelize } = require('../models');

// Get all reservations
const getAllReservations = async (req, res) => {
  try {
    const reservations = await Reservation.findAll();
    res.json(reservations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
// Get all reservations by date
const findAllByDate = async (req, res) => {
  const date = JSON.parse(req.query.date);
  Reservation.findAll({
    where: {
      checkin_date: {
        [Op.between]: [date.startDate, date.endDate]
      },
    }
  })
    .then(data => {
      res.send(data);
    })
    .catch(err => {
      logger.error(`Cannot find orders by date with error ${err}`)
      res.status(500).send({
        message:
          err.message || "Some error occurred while retrieving orders."
      });
    });
};
// Get a reservation by ID
const getReservationById = async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await Reservation.findByPk(id, { include: ['lines'] });
    if (reservation) {
      res.json(reservation);
    } else {
      res.status(404).json({ error: 'Reservation not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Create a new reservation
const createReservation = async (req, res) => {
  const {
    checkin_date,
    checkout_date,
    discount,
    total,
    customer_name,
    customer_telephone,
    customer_address,
    remark,
    status,
    isActive,
    paymentId,
    lines,
    exchangeRate,
    currencyId
  } = req.body;
  try {
    const result = await sequelize.transaction(async (t) => {
      const newReservation = await Reservation.create({
        checkin_date,
        checkout_date,
        discount,
        total,
        customer_name,
        customer_telephone,
        customer_address,
        remark,
        status,
        isActive,
        paymentId,
        exchangeRate,
        currencyId
      });
      const lineToCreate = headerService.assignLineHeaderId(newReservation.id, lines)
      const createdLine = await lineService.createBulk(lineToCreate, t)
      return { newReservation, createdLine }
    })


    res.status(201).json(result);
  } catch (error) {
    console.error(`Cannot create reservation with error ${error}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Update a reservation by ID
const updateReservationById = async (req, res) => {
  const { id } = req.params;
  const {
    checkin_date,
    checkout_date,
    discount,
    total,
    customer_name,
    customer_telephone,
    customer_address,
    remark,
    status,
    isActive,
    paymentId,
    exchangeRate,
    currencyId,
    lines
  } = req.body;

  try {
    const result = await sequelize.transaction(async (t) => {
      const dbHeader = await Reservation.findByPk(id)
      if (!dbHeader) {
        throw new Error('Reservation not found');
      }
      const updatedHeader = await dbHeader.update({
        checkin_date,
        checkout_date,
        discount,
        total,
        customer_name,
        customer_telephone,
        customer_address,
        remark,
        status,
        isActive,
        paymentId,
        exchangeRate,
        currencyId
      }, { transaction: t });

      const newLines = lines.filter(el => el.id == null)
      let newLineWithHeader = []
      if (newLines) {
        // Assign line header
        newLineWithHeader = headerService.assignLineHeaderId(id, newLines)
        // const newLineCreated =  await PoLine.bulkCreate(newLineWithHeader, { transaction: t });
      }
      let oldLines = lines.filter(el => el.id != null)
      const bothLines = oldLines.concat(newLineWithHeader)
      await lineService.simpleUpdateBulk(bothLines, t)
      return updatedHeader

    })
    logger.info(`Update reservation completed \n ${JSON.stringify(result)}`)
    return res.status(200).json(result)
  } catch (error) {
    console.error(`Cannot update reservation with error ${createBulk}`);
    res.status(500).json({ error: `Internal Server Error ${error}` });
  }
};

// Delete a reservation by ID
const deleteReservationById = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedCount = await Reservation.destroy({
      where: { id },
    });

    if (deletedCount === 0) {
      res.status(404).json({ error: 'Reservation not found' });
    } else {
      res.status(204).send();
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = {
  getAllReservations,
  getReservationById,
  createReservation,
  updateReservationById,
  deleteReservationById,
  findAllByDate
};
