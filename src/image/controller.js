
const ImagePath = require('../models').image;
// const { body, validationResult } = require('express-validator');
const logger = require('../api/logger');
const service = require('./service')// imagePath.controller.js
// const db = require('../path/to/your/database/index'); // Adjust the path to your Sequelize index file
// const ImagePath = db.image_path; // Ensure this matches how you've exported/imported your models

// Create and Save a new ImagePath
exports.create = async (req, res) => {
    // Validate request
    if (!req.body.img_name || !req.body.img_path) {
        res.status(400).send({
            message: "Content can not be empty!"
        });
        return;
    }

    // Create an ImagePath
    const imagePath = {
        pro_id: req.body.pro_id,
        img_name: req.body.img_name,
        img_path: req.body.img_path,
        isActive: req.body.isActive ?? true,
    };

    // Save ImagePath in the database
    try {
        const data = await ImagePath.create(imagePath);
        res.send(data);
    } catch (err) {
        res.status(500).send({
            message: err.message || "Some error occurred while creating the ImagePath."
        });
    }
};

// Retrieve all ImagePaths from the database.
exports.findAll = async (req, res) => {
    try {
        const data = await ImagePath.findAll();
        res.send(data);
    } catch (err) {
        res.status(500).send({
            message: err.message || "Some error occurred while retrieving image paths."
        });
    }
};

// Find a single ImagePath with an id
exports.findOne = async (req, res) => {
    const id = req.params.id;

    try {
        const data = await ImagePath.findByPk(id);
        if (data) {
            res.send(data);
        } else {
            res.status(404).send({
                message: `Cannot find ImagePath with id=${id}.`
            });
        }
    } catch (err) {
        res.status(500).send({
            message: "Error retrieving ImagePath with id=" + id
        });
    }
};

// Update an ImagePath by the id in the request
exports.update = async (req, res) => {
    const id = req.params.id;

    try {
        const num = await ImagePath.update(req.body, {
            where: { id: id }
        });

        if (num == 1) {
            res.send({
                message: "ImagePath was updated successfully."
            });
        } else {
            res.send({
                message: `Cannot update ImagePath with id=${id}. Maybe ImagePath was not found or req.body is empty!`
            });
        }
    } catch (err) {
        res.status(500).send({
            message: "Error updating ImagePath with id=" + id
        });
    }
};

// Delete an ImagePath with the specified id in the request
exports.delete = async (req, res) => {
    const id = req.params.id;

    try {
        const num = await ImagePath.destroy({
            where: { id: id }
        });
        if (num == 1) {
            res.send({
                message: "ImagePath was deleted successfully!"
            });
        } else {
            res.send({
                message: `Cannot delete ImagePath with id=${id}. Maybe ImagePath was not found!`
            });
        }
    } catch (err) {
        res.status(500).send({
            message: "Could not delete ImagePath with id=" + id
        });
    }
};

// You can also add other functionalities as needed, such as filtering active/inactive image paths, etc.
