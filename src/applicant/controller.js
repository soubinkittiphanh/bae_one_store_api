// ===============================================================
// APPLICANT CONTROLLER
// ===============================================================
const logger = require("../api/logger");
const { user } = require('../models');
const Applicant = require('../models').applicant;
const { Op } = require('sequelize');

class ApplicantController {
  
  // GET ALL APPLICANTS WITH FILTERS AND PAGINATION
  static async findAll(req, res) {
    try {
      const {
        page = 1,
        limit = 25,
        search = '',
        gender = '',
        status = '',
        hasPassport = '',
        chineseLanguageLevel = '',
        minAge = '',
        maxAge = '',
        sortBy = 'applicationDate',
        sortOrder = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;
      const whereClause = {};

      // Search filter
      if (search) {
        whereClause[Op.or] = [
          { firstName: { [Op.iLike]: `%${search}%` } },
          { lastName: { [Op.iLike]: `%${search}%` } },
          { phone: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } }
        ];
      }

      // Gender filter
      if (gender) {
        whereClause.gender = gender;
      }

      // Status filter
      if (status) {
        whereClause.status = status;
      }

      // Passport filter
      if (hasPassport !== '') {
        whereClause.hasPassport = hasPassport === 'true';
      }

      // Chinese language filter
      if (chineseLanguageLevel) {
        whereClause.chineseLanguageLevel = chineseLanguageLevel;
      }

      // Age range filter (using raw query for virtual field)
      let ageFilter = '';
      if (minAge || maxAge) {
        const minAgeCondition = minAge ? `EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dateOfBirth")) >= ${minAge}` : '';
        const maxAgeCondition = maxAge ? `EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dateOfBirth")) <= ${maxAge}` : '';
        
        if (minAge && maxAge) {
          ageFilter = `${minAgeCondition} AND ${maxAgeCondition}`;
        } else {
          ageFilter = minAgeCondition || maxAgeCondition;
        }
      }

      const { count, rows } = await Applicant.findAndCountAll({
        where: whereClause,
        ...(ageFilter && {
          having: sequelize.literal(ageFilter)
        }),
        include: [
          {
            model: user,
            as: 'maker',
            // attributes: ['id', 'username', 'email']
          },
          {
            model: user,
            as: 'checker',
            // attributes: ['id', 'username', 'email']
          }
        ],
        order: [[sortBy, sortOrder.toUpperCase()]],
        limit: parseInt(limit),
        offset: parseInt(offset),
        distinct: true
      });

      const totalPages = Math.ceil(count / limit);

      res.status(200).json({
        success: true,
        data: {
          applicants: rows,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalItems: count,
            itemsPerPage: parseInt(limit),
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching applicants:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching applicants',
        error: error.message
      });
    }
  }

  // GET APPLICANT BY ID
  static async findById(req, res) {
    try {
      const { id } = req.params;

      const applicant = await Applicant.findByPk(id, {
        include: [
          {
            model: user,
            as: 'maker',
            // attributes: ['id', 'username', 'email']
          },
          {
            model: user,
            as: 'checker',
            // attributes: ['id', 'username', 'email']
          }
        ]
      });

      if (!applicant) {
        return res.status(404).json({
          success: false,
          message: 'Applicant not found'
        });
      }

      res.status(200).json({
        success: true,
        data: applicant
      });

    } catch (error) {
      logger.error('Error fetching applicant:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching applicant',
        error: error.message
      });
    }
  }

  // CREATE NEW APPLICANT
  static async create(req, res) {
    try {
      const {
        firstName,
        lastName,
        gender,
        dateOfBirth,
        phone,
        email,
        address,
        hasPassport,
        healthStatus,
        eyesightGood,
        chineseLanguageLevel,
        hasVisibleTattoos,
        notes
      } = req.body;

      // Validate age requirement (18-32)
      const birthDate = new Date(dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      if (age < 18 || age > 32) {
        return res.status(400).json({
          success: false,
          message: 'Applicant must be between 18-32 years old'
        });
      }

      // Check gender quota (optional validation)
      const genderStats = await ApplicantController.getGenderStats();
      if (gender === 'male' && genderStats.maleCount >= 30) {
        return res.status(400).json({
          success: false,
          message: 'Male quota (30) has been reached'
        });
      }
      if (gender === 'female' && genderStats.femaleCount >= 70) {
        return res.status(400).json({
          success: false,
          message: 'Female quota (70) has been reached'
        });
      }

      const applicant = await Applicant.create({
        firstName,
        lastName,
        gender,
        dateOfBirth,
        phone,
        email,
        address,
        hasPassport,
        healthStatus,
        eyesightGood,
        chineseLanguageLevel,
        hasVisibleTattoos,
        notes,
        makerId: req.user?.id,
        applicationDate: new Date()
      });

      res.status(201).json({
        success: true,
        message: 'Applicant created successfully',
        data: applicant
      });

    } catch (error) {
      logger.error('Error creating applicant:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating applicant',
        error: error.message
      });
    }
  }

  // UPDATE APPLICANT
  static async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const applicant = await Applicant.findByPk(id);
      if (!applicant) {
        return res.status(404).json({
          success: false,
          message: 'Applicant not found'
        });
      }

      // Add update user info
      updateData.updateUserId = req.user?.id;

      await applicant.update(updateData);

      const updatedApplicant = await Applicant.findByPk(id, {
        include: [
          {
            model: user,
            as: 'maker',
            // attributes: ['id', 'username', 'email']
          },
          {
            model: user,
            as: 'updateUser',
            // attributes: ['id', 'username', 'email']
          }
        ]
      });

      res.status(200).json({
        success: true,
        message: 'Applicant updated successfully',
        data: updatedApplicant
      });

    } catch (error) {
      logger.error('Error updating applicant:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating applicant',
        error: error.message
      });
    }
  }

  // DELETE APPLICANT
  static async delete(req, res) {
    try {
      const { id } = req.params;

      const applicant = await Applicant.findByPk(id);
      if (!applicant) {
        return res.status(404).json({
          success: false,
          message: 'Applicant not found'
        });
      }

      await applicant.destroy();

      res.status(200).json({
        success: true,
        message: 'Applicant deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting applicant:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting applicant',
        error: error.message
      });
    }
  }

  // UPDATE APPLICANT STATUS
  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      const applicant = await Applicant.findByPk(id);
      if (!applicant) {
        return res.status(404).json({
          success: false,
          message: 'Applicant not found'
        });
      }

      await applicant.update({
        status,
        notes: notes || applicant.notes,
        checkerId: req.user?.id,
        updateUserId: req.user?.id
      });

      res.status(200).json({
        success: true,
        message: `Applicant status updated to ${status}`,
        data: applicant
      });

    } catch (error) {
      logger.error('Error updating applicant status:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating applicant status',
        error: error.message
      });
    }
  }

  // GET APPLICANT STATISTICS
  static async getStatistics(req, res) {
    try {
      // Total counts
      const totalApplicants = await Applicant.count();
      
      // Status breakdown
      const statusStats = await Applicant.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('status')), 'count']
        ],
        group: ['status'],
        raw: true
      });

      // Gender breakdown
      const genderStats = await Applicant.findAll({
        attributes: [
          'gender',
          [sequelize.fn('COUNT', sequelize.col('gender')), 'count']
        ],
        group: ['gender'],
        raw: true
      });

      // Age distribution
      const ageStats = await Applicant.findAll({
        attributes: [
          [sequelize.literal(`
            CASE 
              WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dateOfBirth")) BETWEEN 18 AND 22 THEN '18-22'
              WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dateOfBirth")) BETWEEN 23 AND 27 THEN '23-27'
              WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dateOfBirth")) BETWEEN 28 AND 32 THEN '28-32'
              ELSE 'Other'
            END
          `), 'ageGroup'],
          [sequelize.fn('COUNT', '*'), 'count']
        ],
        group: [sequelize.literal(`
          CASE 
            WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dateOfBirth")) BETWEEN 18 AND 22 THEN '18-22'
            WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dateOfBirth")) BETWEEN 23 AND 27 THEN '23-27'
            WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, "dateOfBirth")) BETWEEN 28 AND 32 THEN '28-32'
            ELSE 'Other'
          END
        `)],
        raw: true
      });

      // Chinese language stats
      const languageStats = await Applicant.findAll({
        attributes: [
          'chineseLanguageLevel',
          [sequelize.fn('COUNT', sequelize.col('chineseLanguageLevel')), 'count']
        ],
        group: ['chineseLanguageLevel'],
        raw: true
      });

      // Eligibility stats
      const eligibleApplicants = await Applicant.count({
        where: {
          hasPassport: true,
          healthStatus: ['good'],
          eyesightGood: true,
          hasVisibleTattoos: false,
          status: 'pending'
        }
      });

      res.status(200).json({
        success: true,
        data: {
          summary: {
            totalApplicants,
            eligibleApplicants,
            eligibilityRate: totalApplicants > 0 ? ((eligibleApplicants / totalApplicants) * 100).toFixed(2) : 0
          },
          statusBreakdown: statusStats,
          genderBreakdown: genderStats,
          ageDistribution: ageStats,
          languageStats: languageStats
        }
      });

    } catch (error) {
      logger.error('Error fetching statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching statistics',
        error: error.message
      });
    }
  }

  // HELPER: Get gender statistics
  static async getGenderStats() {
    const maleCount = await Applicant.count({ where: { gender: 'male' } });
    const femaleCount = await Applicant.count({ where: { gender: 'female' } });
    return { maleCount, femaleCount };
  }

  // SEARCH APPLICANTS
  static async search(req, res) {
    try {
      const { q } = req.query;

      if (!q || q.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Search query must be at least 2 characters'
        });
      }

      const applicants = await Applicant.findAll({
        where: {
          [Op.or]: [
            { firstName: { [Op.iLike]: `%${q}%` } },
            { lastName: { [Op.iLike]: `%${q}%` } },
            { phone: { [Op.iLike]: `%${q}%` } },
            { email: { [Op.iLike]: `%${q}%` } }
          ]
        },
        limit: 10,
        attributes: ['id', 'firstName', 'lastName', 'phone', 'email', 'status']
      });

      res.status(200).json({
        success: true,
        data: applicants
      });

    } catch (error) {
      logger.error('Error searching applicants:', error);
      res.status(500).json({
        success: false,
        message: 'Error searching applicants',
        error: error.message
      });
    }
  }
}

module.exports = ApplicantController;