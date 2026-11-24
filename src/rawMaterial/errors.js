// Errors the raw-material / recipe API turns into HTTP responses.

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Same response shape as the sales flow (`stockErrors`), which the Flutter app already parses
// (lib/service/stock_shortage_exception.dart).
class StockShortageError extends ApiError {
  constructor(shortages) {
    super(409, 'STOCK_SHORTAGE', 'Not enough stock', shortages);
    this.shortages = shortages;
  }
}

const sendError = (res, error, logger = console) => {
  if (error instanceof StockShortageError) {
    return res.status(409).json({ success: false, code: error.code, message: error.message, stockErrors: error.shortages });
  }
  if (error instanceof ApiError) {
    return res.status(error.status).json({ success: false, code: error.code, message: error.message, details: error.details });
  }
  logger.error(`[raw-material] ${error.stack || error.message}`);
  return res.status(500).json({ success: false, code: 'INTERNAL', message: 'Internal server error' });
};

module.exports = { ApiError, StockShortageError, sendError };
