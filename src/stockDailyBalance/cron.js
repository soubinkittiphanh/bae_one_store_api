const cron = require('node-cron');
const { captureDailyBalance } = require('./service');

// Initialize cron jobs
const initCronJobs = () => {
    // Run at 00:00 every day
    // This job captures the balance for the day that just ended
    cron.schedule('0 0 * * *', async () => {
        console.log('--- Cron Job Started: Daily Stock Balance Capture ---');
        try {
            // Get yesterday's date
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            
            await captureDailyBalance(yesterday);
        } catch (error) {
            console.error('Error in daily stock balance cron job:', error);
        }
        console.log('--- Cron Job Finished: Daily Stock Balance Capture ---');
    }, {
        scheduled: true,
        timezone: "Asia/Vientiane"
    });

    console.log('Stock Daily Balance cron job initialized (runs at 00:00 daily).');
};

module.exports = {
    initCronJobs
};
