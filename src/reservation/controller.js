
const Reservation = require('../models').reservation;
const logger = require('../api/logger');
const { Op } = require('sequelize');


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

// Get a reservation by ID
const getReservationById = async (req, res) => {
  const { id } = req.params;
  try {
    const reservation = await Reservation.findByPk(id);
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
  } = req.body;

  try {
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
      lines
    });

    res.status(201).json(newReservation);
  } catch (error) {
    console.error(error);
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
    lines
  } = req.body;

  try {
    const updatedReservation = await Reservation.update(
      {
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
        paymentId
      },
      {
        where: { id },
        returning: true,
      }
    );

    if (updatedReservation[0] === 0) {
      res.status(404).json({ error: 'Reservation not found' });
    } else {
      res.json(updatedReservation[1][0]);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
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
};
