const logger = require('../api/logger');
const Location = require('../models').location;
const Company = require('../models').company;

// Create and Save a new Location
exports.create = (req, res) => {
  // Validate request
  if (!req.body.name) {
    res.status(400).send({ message: 'Name can not be empty!' });
    return;
  }

  // a Location
  const location = {
    name: req.body.name,
    description: req.body.description,
    companyId: req.body.companyId,
    isActive: req.body.isActive ? req.body.isActive : true
  };

  // Save Location in the database
  Location.create(location)
    .then(data => {
      // Return the created location with company details
      return Location.findByPk(data.id, {
        include: [{
          model: Company,
          as: "company"
        }]
      });
    })
    .then(locationWithCompany => {
      res.status(201).send(locationWithCompany);
    })
    .catch(err => {
      res.status(500).send({
        message: err.message || 'Some error occurred while creating the Location.',
      });
    });
};

// Retrieve all Locations from the database.
exports.findAll = (req, res) => {
  Location.findAll({
    include: [{  // Fixed: was "inlude"
      model: Company,
      as: "company"
    }]
  })
    .then(data => {
      res.status(200).send(data);
    })
    .catch(err => {
      res.status(500).send({
        message: err.message || 'Some error occurred while retrieving locations.',
      });
    });
};

// Find a single Location with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  
  Location.findByPk(id, { 
    include: [{  // Fixed: was "inlude"
      model: Company,
      as: "company"
    }]
  })
    .then(data => {
      if (data) {
        res.status(200).send(data);
      } else {
        res.status(404).send({
          message: `Cannot find Location with id=${id}.`
        });
      }
    })
    .catch(err => {
      res.status(500).send({
        message: 'Error retrieving Location with id=' + id,
      });
    });
};

exports.generate = (req, res) => {
  const location = {
    name: 'Main inventory',
    description: 'ທີ່ຢູ່ ຂອງສາງ',
    isActive: true,
    companyId: req.body.companyId || 1 // Make sure to provide companyId
  };

  Location.create(location)
    .then(data => {
      // Return the created location with company details
      return Location.findByPk(data.id, {
        include: [{
          model: Company,
          as: "company"
        }]
      });
    })
    .then(locationWithCompany => {
      res.status(200).send(locationWithCompany);
    })
    .catch(err => {
      res.status(500).send({
        message: 'Error generate Location with error ' + err,
      });
    });
};

// Update a Location by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;
  
  Location.update(req.body, {
    where: { id: id },
  })
    .then(num => {
      if (num == 1) {
        // Return the updated location with company details
        return Location.findByPk(id, {
          include: [{
            model: Company,
            as: "company"
          }]
        });
      } else {
        res.status(404).send({
          message: `Cannot update Location with id=${id}. Maybe Location was not found or req.body is empty!`,
        });
        return null;
      }
    })
    .then(updatedLocation => {
      if (updatedLocation) {
        res.status(200).send({
          message: 'Location was updated successfully.',
          data: updatedLocation
        });
      }
    })
    .catch(err => {
      res.status(500).send({
        message: 'Error updating Location with id=' + id,
      });
    });
};

// Delete a Location with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;
  
  Location.destroy({
    where: { id: id },
  })
    .then(num => {
      if (num == 1) {
        res.status(200).send({
          message: 'Location was deleted successfully!'
        });
      } else {
        res.status(404).send({
          message: `Cannot delete Location with id = ${id}. Maybe Location was not found!`
        });
      }
    })
    .catch(err => {
      res.status(500).send({
        message: 'Could not delete Location with id=' + id,
      });
    });
};