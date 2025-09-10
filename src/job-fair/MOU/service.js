// Optional: Create a statistics helper service
// services/StatisticsService.js

const { MOU, JobBatch, Applicant, sequelize } = require('../../models');

class StatisticsService {
  
  static async getMOUStatistics() {
    try {
      // Use Promise.all for parallel execution to improve performance
      const [
        totalMOUs,
        statusBreakdown,
        jobBatchStats,
        applicantStats
      ] = await Promise.all([
        // Total MOUs
        MOU.count({ where: { isActive: true } }),
        
        // MOU status breakdown
        MOU.findAll({
          where: { isActive: true },
          attributes: [
            'jobStatus',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count']
          ],
          group: ['jobStatus'],
          raw: true
        }),
        
        // JobBatch statistics
        JobBatch.findAll({
          where: { isActive: true },
          attributes: [
            [sequelize.fn('COUNT', sequelize.col('id')), 'totalJobBatches'],
            [
              sequelize.fn('COUNT', 
                sequelize.literal(`CASE WHEN status = 'active' THEN 1 END`)
              ), 
              'activeJobBatches'
            ],
            [
              sequelize.fn('COUNT', 
                sequelize.literal(`CASE WHEN status = 'completed' THEN 1 END`)
              ), 
              'completedJobBatches'
            ],
            [
              sequelize.fn('COUNT', 
                sequelize.literal(`CASE WHEN status = 'draft' THEN 1 END`)
              ), 
              'draftJobBatches'
            ]
          ],
          raw: true
        }),
        
        // Applicant statistics
        Applicant.findAll({
          where: { isActive: true },
          attributes: [
            [sequelize.fn('COUNT', sequelize.col('id')), 'totalApplicants'],
            [
              sequelize.fn('COUNT', 
                sequelize.literal(`CASE WHEN status = 'INTERVIEW' THEN 1 END`)
              ), 
              'interviewApplicants'
            ],
            [
              sequelize.fn('COUNT', 
                sequelize.literal(`CASE WHEN status = 'REGISTER' THEN 1 END`)
              ), 
              'registerApplicants'
            ],
            [
              sequelize.fn('COUNT', 
                sequelize.literal(`CASE WHEN status = 'CONFIRM' THEN 1 END`)
              ), 
              'confirmApplicants'
            ]
          ],
          raw: true
        })
      ]);

      // Process status breakdown
      const statusCounts = {
        draft: 0,
        open: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0
      };

      statusBreakdown.forEach(item => {
        if (statusCounts.hasOwnProperty(item.jobStatus)) {
          statusCounts[item.jobStatus] = parseInt(item.count);
        }
      });

      const batchData = jobBatchStats[0] || {};
      const applicantData = applicantStats[0] || {};

      return {
        totalMOUs,
        totalJobBatches: parseInt(batchData.totalJobBatches) || 0,
        activeJobBatches: parseInt(batchData.activeJobBatches) || 0,
        completedJobBatches: parseInt(batchData.completedJobBatches) || 0,
        draftJobBatches: parseInt(batchData.draftJobBatches) || 0,
        totalApplicants: parseInt(applicantData.totalApplicants) || 0,
        totalInterviewApplicants: parseInt(applicantData.interviewApplicants) || 0,
        totalRegisterApplicants: parseInt(applicantData.registerApplicants) || 0,
        totalConfirmedApplicants: parseInt(applicantData.confirmApplicants) || 0,
        statusBreakdown: statusCounts
      };

    } catch (error) {
      throw new Error(`Failed to calculate statistics: ${error.message}`);
    }
  }

  static async getMOUStatisticsByDateRange(startDate, endDate) {
    // Add date range filtering for statistics
    const whereClause = {
      isActive: true,
      createdAt: {
        [sequelize.Op.between]: [startDate, endDate]
      }
    };

    // Similar implementation but with date filtering
    // ... implementation details
  }
}

module.exports = StatisticsService;

// Then use it in your controller:
// const StatisticsService = require('../services/StatisticsService');
//
// static async getStatistics(req, res) {
//   try {
//     const statistics = await StatisticsService.getMOUStatistics();
//     res.json({
//       success: true,
//       message: 'Statistics retrieved successfully',
//       data: statistics
//     });
//   } catch (error) {
//     logger.error('Error fetching MOU statistics:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Internal server error'
//     });
//   }
// }