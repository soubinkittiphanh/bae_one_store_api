const analyticsService = require('./analytics/service');
const attendanceService = require('./attendance/service');
const db = require('../models/index');

async function testAnalytics() {
    console.log('--- Cleaning Group Analytics Test ---');
    
    try {
        // Test 1: Milestones for a user
        // Note: Using a dummy ID or an existing one if available
        const milestones = await analyticsService.getUserMilestones('test_user');
        console.log('User Milestones:', JSON.stringify(milestones, null, 2));

        // Test 2: City-wide impact
        const impact = await analyticsService.getCityWideImpact();
        console.log('City-Wide Impact:', JSON.stringify(impact, null, 2));

        // Test 3: Hotspots
        const hotspots = await analyticsService.getWasteHotspots();
        console.log('Waste Hotspots:', JSON.stringify(hotspots, null, 2));

        console.log('--- Test Completed Successfully ---');
    } catch (error) {
        console.error('Test Failed:', error.message);
    }
}

// This script is intended to be run manually to verify the service logic
// testAnalytics();

module.exports = { testAnalytics };
