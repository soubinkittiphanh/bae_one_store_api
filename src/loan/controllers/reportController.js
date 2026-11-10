const multer = require('multer');
const reportService = require('../services/reportService');
const documentService = require('../services/documentService');
const branchBank = require('../services/branchBank');
const { handle, respond, LoanError } = require('../errors');
const { ctxOf } = require('./paramController');

// Phase 5 Part B1: read-only views for the loan screens, and account documents (D10)
const reportController = {
  accounts: handle(req => reportService.accounts(req.query, req.branchScope)),
  summary: handle(req => reportService.accountSummary(req.params.id)),
  schedule: handle(req => reportService.schedule(req.params.id)),
  history: handle(req => reportService.history(req.params.id)),
  statement: handle(req => reportService.statement(req.params.id, req.query)),
  pending: handle(req => reportService.pendingTransactions(req.query, req.branchScope)),
  eodLogs: handle(req => reportService.eodLogs(req.query)),
  overdue: handle(req => reportService.overdue(req.query, req.branchScope)),
  // Phase 6: groupBy=branch groups the portfolio by the accounts' branch (location.id)
  portfolio: handle(req => reportService.portfolio(req.query, req.query.groupBy === 'branch' ? 'branch' : 'product', req.branchScope)),
  aging: handle(req => reportService.portfolio(req.query, 'aging', req.branchScope)),
  npl: handle(req => reportService.portfolio(req.query, 'npl', req.branchScope)),
  provisions: handle(req => reportService.provisions(req.query, req.branchScope)),
  glTieout: handle(req => reportService.glTieout(req.branchScope)),
  printTemplate: handle(req => reportService.printTemplate(req.params.code)),
  // Phase 6: bank/cash accounts mapped to the account's branch (the transaction dialog's list)
  bankAccounts: handle(req => branchBank.listForAccount(req.params.id)),

  documents: handle(req => documentService.list(req.params.id)),
  uploadDocument: handle(async req => respond(await documentService.upload(req.params.id, req.file, req.body, ctxOf(req)), 'Document stored', 201)),
  // Streams the file only after the LN_DOCUMENT VIEW check in the router; never a public URL
  async documentFile(req, res) {
    try {
      const f = await documentService.file(req.params.docId);
      res.set('Cache-Control', 'private, no-store');
      res.set('X-Content-Type-Options', 'nosniff');
      return res.download(f.path, f.downloadName, { headers: { 'Content-Type': f.mimeType } });
    } catch (err) {
      const status = err instanceof LoanError ? err.status : 500;
      return res.status(status).json({ success: false, status: false, message: err instanceof LoanError ? err.message : 'Internal error; see server log' });
    }
  }
};

// One file in memory (hard cap; the SPF limit is checked in the service), then the service checks type and signature
const uploadOne = (req, res, next) => multer({ storage: multer.memoryStorage(), limits: { fileSize: documentService.HARD_MAX_BYTES, files: 1 } }).single('file')(req, res, (err) => {
  if (!err) return next();
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  return res.status(status).json({ success: false, status: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'The file is too large' : 'Upload one file in the form field "file"' });
});

module.exports = { reportController, uploadOne };
