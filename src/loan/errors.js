/**
 * Loan module errors and the shared controller wrapper.
 * LoanError carries an HTTP status; anything else becomes a generic 500 so SQL or
 * stack details never reach the client (they go to the log only).
 */
const logger = require('../api/logger');

class LoanError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const toLoanError = (err) => {
  if (err instanceof LoanError) return err;
  if (err && err.name === 'SequelizeUniqueConstraintError') {
    const fields = Object.keys(err.fields || {}).join(', ');
    return new LoanError(409, `Duplicate record${fields ? ` (${fields})` : ''}`);
  }
  if (err && err.name === 'SequelizeOptimisticLockError') {
    return new LoanError(409, 'Record was changed by another user; reload and try again');
  }
  return null;
};

// Wraps an async controller: (req) => data | { status, data, message }
const handle = (fn, successStatus = 200) => async (req, res) => {
  try {
    const result = await fn(req);
    const body = result && result.__response ? result : { data: result };
    return res.status(body.httpStatus || successStatus).json({ success: true, status: true, message: body.message, data: body.data });
  } catch (err) {
    const known = toLoanError(err);
    if (known) {
      return res.status(known.status).json({ success: false, status: false, message: known.message, errors: known.details });
    }
    logger.error(`[loan] ${req.method} ${req.originalUrl} failed: ${err && err.stack ? err.stack : err}`);
    return res.status(500).json({ success: false, status: false, message: 'Internal error; see server log' });
  }
};

const respond = (data, message, httpStatus) => ({ __response: true, data, message, httpStatus });

module.exports = { LoanError, handle, respond };
