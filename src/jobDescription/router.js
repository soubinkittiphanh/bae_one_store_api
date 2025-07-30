// ===============================================================
// JOB ADVERTISE ROUTES
// routes/jobAdvertiseRoutes.js
// ===============================================================

const express = require('express');
const router = express.Router();
const jobAdvertiseController = require('./controller');

// Middleware for authentication (uncomment and modify as needed)
// const authMiddleware = require('../middleware/auth');
// const roleMiddleware = require('../middleware/role');

// ===============================================================
// BASIC CRUD ROUTES
// ===============================================================

// Create new job advertisement
// POST /api/job-advertise
router.post('/', jobAdvertiseController.create);

// Get all job advertisements with pagination and filtering
// GET /api/job-advertise?page=1&limit=10&status=active&country=Thailand&province=Bangkok
router.get('/', jobAdvertiseController.getAll);

// Get job advertisement by ID
// GET /api/job-advertise/:id
router.get('/:id', jobAdvertiseController.getById);

// Update job advertisement
// PUT /api/job-advertise/:id
router.put('/:id', jobAdvertiseController.update);

// Delete job advertisement
// DELETE /api/job-advertise/:id
router.delete('/:id', jobAdvertiseController.delete);

// ===============================================================
// STATISTICS AND REPORTING ROUTES
// ===============================================================

// Get job advertisements statistics
// GET /api/job-advertise/stats/overview
router.get('/stats/overview', jobAdvertiseController.getStats);

// ===============================================================
// FILTERING AND SEARCH ROUTES
// ===============================================================

// Search job advertisements with keyword and filters
// GET /api/job-advertise/search?keyword=developer&country=Thailand&requiresPassport=true
router.get('/search', jobAdvertiseController.search);

// Get active job advertisements
// GET /api/job-advertise/filter/active?page=1&limit=10&country=Thailand
router.get('/filter/active', jobAdvertiseController.getActive);

// Get job advertisements by specific requirements
// GET /api/job-advertise/filter/requirements?requiresPassport=true&requiresLanguage=basic&allowsTattoos=false
router.get('/filter/requirements', jobAdvertiseController.getByRequirements);

// Get job advertisements by date range
// GET /api/job-advertise/filter/date-range?startDate=2024-01-01&endDate=2024-12-31
router.get('/filter/date-range', jobAdvertiseController.getByDateRange);

// Get job advertisements by applicant limit
// GET /api/job-advertise/filter/applicant-limit?maxApplicants=50
router.get('/filter/applicant-limit', jobAdvertiseController.getByApplicantLimit);

// ===============================================================
// LOCATION-BASED ROUTES
// ===============================================================

// Get job advertisements by country
// GET /api/job-advertise/country/:country?page=1&limit=10&status=active&province=Bangkok
router.get('/country/:country', jobAdvertiseController.getByCountry);

// Get job advertisements by province within a country
// GET /api/job-advertise/country/:country/province/:province?page=1&limit=10&status=active
router.get('/country/:country/province/:province', jobAdvertiseController.getByProvince);

// ===============================================================
// ALTERNATIVE ROUTER WITH AUTHENTICATION MIDDLEWARE
// (Uncomment and modify as needed for your authentication system)
// ===============================================================

/*
// Protected routes that require authentication
router.use(authMiddleware);

// Routes that require specific roles
const adminOnly = roleMiddleware(['admin']);
const employerOnly = roleMiddleware(['employer', 'admin']);
const publicAccess = roleMiddleware(['user', 'employer', 'admin']);

// Create job advertisement (employers and admins only)
router.post('/', employerOnly, jobAdvertiseController.create);

// Update job advertisement (employers and admins only)
router.put('/:id', employerOnly, jobAdvertiseController.update);

// Delete job advertisement (employers and admins only)
router.delete('/:id', employerOnly, jobAdvertiseController.delete);

// View statistics (admins only)
router.get('/stats/overview', adminOnly, jobAdvertiseController.getStats);

// Public access routes (all authenticated users)
router.get('/', publicAccess, jobAdvertiseController.getAll);
router.get('/search', publicAccess, jobAdvertiseController.search);
router.get('/filter/active', publicAccess, jobAdvertiseController.getActive);
router.get('/filter/requirements', publicAccess, jobAdvertiseController.getByRequirements);
router.get('/filter/date-range', publicAccess, jobAdvertiseController.getByDateRange);
router.get('/filter/applicant-limit', publicAccess, jobAdvertiseController.getByApplicantLimit);
router.get('/country/:country', publicAccess, jobAdvertiseController.getByCountry);
router.get('/country/:country/province/:province', publicAccess, jobAdvertiseController.getByProvince);
router.get('/:id', publicAccess, jobAdvertiseController.getById);
*/

// ===============================================================
// EXPORT ROUTER
// ===============================================================

module.exports = router;