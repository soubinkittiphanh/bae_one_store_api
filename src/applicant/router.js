// ===============================================================
// APPLICANT ROUTES
// ===============================================================
const express = require('express');
const router = express.Router();
const ApplicantController = require('./controller');

// Middleware (uncomment and adjust based on your auth setup)
// const auth = require('../middleware/auth');
// const validateRequest = require('../middleware/validateRequest');

// VALIDATION SCHEMAS (optional - for request validation)
const { body, param, query } = require('express-validator');

const createApplicantValidation = [
  body('firstName')
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2-50 characters'),
  
  body('lastName')
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2-50 characters'),
  
  body('gender')
    .isIn(['male', 'female'])
    .withMessage('Gender must be either male or female'),
  
  body('dateOfBirth')
    .isDate()
    .withMessage('Valid date of birth is required'),
  
  body('phone')
    .notEmpty()
    .withMessage('Phone number is required')
    .isMobilePhone()
    .withMessage('Valid phone number is required'),
  
  body('email')
    .optional()
    .isEmail()
    .withMessage('Valid email is required'),
  
  body('hasPassport')
    .isBoolean()
    .withMessage('Passport status must be true or false'),
  
  body('healthStatus')
    .optional()
    .isIn(['good', 'fair', 'poor'])
    .withMessage('Health status must be good, fair, or poor'),
  
  body('eyesightGood')
    .isBoolean()
    .withMessage('Eyesight status must be true or false'),
  
  body('chineseLanguageLevel')
    .optional()
    .isIn(['none', 'basic', 'intermediate', 'advanced'])
    .withMessage('Chinese language level must be none, basic, intermediate, or advanced'),
  
  body('hasVisibleTattoos')
    .isBoolean()
    .withMessage('Tattoo status must be true or false')
];

const updateApplicantValidation = [
  body('firstName')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2-50 characters'),
  
  body('lastName')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2-50 characters'),
  
  body('gender')
    .optional()
    .isIn(['male', 'female'])
    .withMessage('Gender must be either male or female'),
  
  body('dateOfBirth')
    .optional()
    .isDate()
    .withMessage('Valid date of birth is required'),
  
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Valid phone number is required'),
  
  body('email')
    .optional()
    .isEmail()
    .withMessage('Valid email is required')
];

const statusUpdateValidation = [
  body('status')
    .isIn(['pending', 'approved', 'rejected'])
    .withMessage('Status must be pending, approved, or rejected'),
  
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

const idParamValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid applicant ID is required')
];

// ===============================================================
// ROUTES
// ===============================================================

// GET /api/applicants/statistics - Get applicant statistics
router.get('/statistics', ApplicantController.getStatistics);

// GET /api/applicants/search - Search applicants
router.get('/search', [
  query('q')
    .isLength({ min: 2 })
    .withMessage('Search query must be at least 2 characters')
], ApplicantController.search);

// GET /api/applicants - Get all applicants with filters and pagination
router.get('/', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('gender')
    .optional()
    .isIn(['male', 'female'])
    .withMessage('Gender must be male or female'),
  
  query('status')
    .optional()
    .isIn(['pending', 'approved', 'rejected'])
    .withMessage('Status must be pending, approved, or rejected'),
  
  query('minAge')
    .optional()
    .isInt({ min: 18, max: 32 })
    .withMessage('Minimum age must be between 18 and 32'),
  
  query('maxAge')
    .optional()
    .isInt({ min: 18, max: 32 })
    .withMessage('Maximum age must be between 18 and 32'),
  
  query('sortBy')
    .optional()
    .isIn(['firstName', 'lastName', 'applicationDate', 'dateOfBirth', 'status'])
    .withMessage('Invalid sort field'),
  
  query('sortOrder')
    .optional()
    .isIn(['ASC', 'DESC', 'asc', 'desc'])
    .withMessage('Sort order must be ASC or DESC')
], ApplicantController.findAll);

// GET /api/applicants/:id - Get single applicant by ID
router.get('/:id', idParamValidation, ApplicantController.findById);

// POST /api/applicants - Create new applicant
router.post('/', createApplicantValidation, ApplicantController.create);

// PUT /api/applicants/:id - Update applicant
router.put('/:id', [...idParamValidation, ...updateApplicantValidation], ApplicantController.update);

// PATCH /api/applicants/:id/status - Update applicant status only
router.patch('/:id/status', [...idParamValidation, ...statusUpdateValidation], ApplicantController.updateStatus);

// DELETE /api/applicants/:id - Delete applicant
router.delete('/:id', idParamValidation, ApplicantController.delete);

// ===============================================================
// ERROR HANDLING MIDDLEWARE
// ===============================================================
const { validationResult } = require('express-validator');

// Validation error handler middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Apply validation error handler to all routes
router.use(handleValidationErrors);

module.exports = router;

// ===============================================================
// USAGE IN MAIN APP
// ===============================================================
/*
// In your main app.js or server.js file:

const express = require('express');
const applicantRoutes = require('./routes/applicantRoutes');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/applicants', applicantRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

module.exports = app;
*/

// ===============================================================
// EXAMPLE API CALLS
// ===============================================================
/*

1. GET ALL APPLICANTS WITH FILTERS:
GET /api/applicants?page=1&limit=25&gender=female&status=pending&minAge=20&maxAge=30

2. SEARCH APPLICANTS:
GET /api/applicants/search?q=john

3. GET STATISTICS:
GET /api/applicants/statistics

4. GET SINGLE APPLICANT:
GET /api/applicants/123

5. CREATE NEW APPLICANT:
POST /api/applicants
{
  "firstName": "John",
  "lastName": "Doe",
  "gender": "male",
  "dateOfBirth": "1995-06-15",
  "phone": "+8562012345678",
  "email": "john.doe@email.com",
  "address": "Vientiane, Laos",
  "hasPassport": true,
  "healthStatus": "good",
  "eyesightGood": true,
  "chineseLanguageLevel": "intermediate",
  "hasVisibleTattoos": false,
  "notes": "Interested in manufacturing work"
}

6. UPDATE APPLICANT:
PUT /api/applicants/123
{
  "firstName": "John",
  "lastName": "Smith",
  "phone": "+8562087654321"
}

7. UPDATE STATUS ONLY:
PATCH /api/applicants/123/status
{
  "status": "approved",
  "notes": "Meets all requirements"
}

8. DELETE APPLICANT:
DELETE /api/applicants/123

*/