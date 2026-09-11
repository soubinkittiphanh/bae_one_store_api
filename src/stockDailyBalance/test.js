const { captureDailyBalance } = require('./service');
const db = require('../models');

(async () => {
    try {
        console.log('Connecting to database and testing daily balance capture...');
        
        // Ensure DB is synchronized (optional but good for testing)
        // We just need the connection to be established.
        await db.sequelize.authenticate();
        console.log('Database connected.');

        // Get yesterday's date
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        await captureDailyBalance(yesterday);
        
        console.log('Test completed successfully. Check your database for the stockDailyBalance records.');
        process.exit(0);
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
})();
