/**
 * Phase 5 B1 (decision D10): documents attached to a loan account.
 * - Viewing (list, download) needs LN_DOCUMENT VIEW; uploading needs LN_DOCUMENT CREATE (router).
 * - Types: PDF, JPEG, PNG only, checked by extension, declared type AND file signature.
 * - Size: at most SPF LOAN_DOC_MAX_MB (default 5) MB.
 * - Stored name: random hex + extension; the original file name (which often carries the customer's
 *   name or ID number) is never stored or used.
 * - Storage: a private folder (LOAN_DOCUMENT_DIR, default ./private/loan-documents under the API working
 *   directory), NOT the POS uploads/ folder, which is served publicly without login.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../../models');
const { LoanError } = require('../errors');
const fxRates = require('./fxRateService');

const TYPES = {
  pdf: { mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  jpg: { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  jpeg: { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  png: { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] }
};
const DOC_TYPES = ['CONTRACT', 'ID_CARD', 'VEHICLE_REG', 'INSURANCE', 'RECEIPT', 'OTHER'];
const HARD_MAX_MB = 20;

const storageDir = () => path.resolve(process.env.LOAN_DOCUMENT_DIR || path.join('private', 'loan-documents'));

const maxBytes = async () => {
  const mb = Number(await fxRates.spfValue('LOAN_DOC_MAX_MB', '5'));
  return Math.round(Math.min(Number.isFinite(mb) && mb > 0 ? mb : 5, HARD_MAX_MB) * 1024 * 1024);
};

const view = d => ({ id: d.id, loanAccountId: d.loanAccountId, docType: d.docType, fileExt: d.fileExt, mimeType: d.mimeType, sizeBytes: d.sizeBytes, sha256: d.sha256, remarks: d.remarks, uploadedBy: d.uploadedBy, createdAt: d.createdAt });

const documentService = {
  DOC_TYPES,
  HARD_MAX_BYTES: HARD_MAX_MB * 1024 * 1024,
  maxBytes,

  async list(accountId) {
    const account = await db.lnAccount.findByPk(accountId, { attributes: ['id'] });
    if (!account) throw new LoanError(404, `Account ${accountId} not found`);
    return (await db.lnAccountDocument.findAll({ where: { loanAccountId: account.id, isActive: true }, order: [['id', 'DESC']] })).map(view);
  },

  // file: { originalname, mimetype, size, buffer } from multer memory storage
  async upload(accountId, file, body, ctxUser) {
    const account = await db.lnAccount.findByPk(accountId, { attributes: ['id'] });
    if (!account) throw new LoanError(404, `Account ${accountId} not found`);
    if (!file || !file.buffer) throw new LoanError(400, 'A file is required (form field "file")');
    const docType = String((body && body.docType) || '').toUpperCase();
    if (!DOC_TYPES.includes(docType)) throw new LoanError(400, `docType must be one of ${DOC_TYPES.join(', ')}`);
    const ext = path.extname(String(file.originalname || '')).slice(1).toLowerCase();
    const type = TYPES[ext];
    if (!type) throw new LoanError(400, 'Only PDF, JPG and PNG files are accepted');
    if (file.mimetype !== type.mime) throw new LoanError(400, `The file type (${file.mimetype}) does not match its extension .${ext}`);
    if (!type.magic.every((b, i) => file.buffer[i] === b)) throw new LoanError(400, `The file content is not a valid .${ext} file`);
    const limit = await maxBytes();
    if (file.buffer.length > limit) throw new LoanError(413, `The file is larger than ${Math.round(limit / 1024 / 1024)} MB (LOAN_DOC_MAX_MB)`);
    const remarks = body && body.remarks ? String(body.remarks).slice(0, 255) : null;
    const storedName = `${crypto.randomBytes(16).toString('hex')}.${ext === 'jpeg' ? 'jpg' : ext}`;
    const dir = storageDir();
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, storedName);
    fs.writeFileSync(target, file.buffer, { flag: 'wx' });
    try {
      const row = await db.sequelize.transaction(async (transaction) => {
        const doc = await db.lnAccountDocument.create({
          loanAccountId: account.id, docType, storedName, fileExt: ext === 'jpeg' ? 'jpg' : ext, mimeType: type.mime, sizeBytes: file.buffer.length,
          sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'), remarks, uploadedBy: ctxUser.userId
        }, { transaction });
        await db.lnAuditLog.create({ entityName: 'account-document', entityId: doc.id, entityKey: String(account.id), actionType: 'CREATE', newValuesJson: JSON.stringify(view(doc)), userId: ctxUser.userId, ipAddress: ctxUser.ip || null, timestamp: new Date() }, { transaction });
        return doc;
      });
      return view(row);
    } catch (err) {
      fs.rmSync(target, { force: true });
      throw err;
    }
  },

  async file(documentId) {
    const doc = await db.lnAccountDocument.findByPk(documentId);
    if (!doc || !doc.isActive) throw new LoanError(404, `Document ${documentId} not found`);
    if (!/^[0-9a-f]{32}\.(pdf|jpg|png)$/.test(doc.storedName)) throw new LoanError(409, 'Invalid stored document name');
    const full = path.join(storageDir(), doc.storedName);
    if (!fs.existsSync(full)) throw new LoanError(410, `The file of document ${documentId} is missing from storage`);
    return { path: full, mimeType: doc.mimeType, downloadName: `loan-${doc.loanAccountId}-${doc.docType.toLowerCase()}-${doc.id}.${doc.fileExt}` };
  }
};

module.exports = documentService;
