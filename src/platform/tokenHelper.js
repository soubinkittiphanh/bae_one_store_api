const crypto = require('crypto');
const config = require('../config');

// Derive 32-byte key from configuration secret
const SECRET_SEED = process.env.PLATFORM_TOKEN_SECRET || config.actksecret || 'dcommerce_platform_token_key_32_bytes!';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(SECRET_SEED).digest(); // 32 bytes
const IV_LENGTH = 16;

/**
 * Encrypt a plain token string using AES-256-CBC
 * @param {string} text - Raw token
 * @returns {string} iv:encryptedText hex format
 */
function encryptToken(text) {
  if (!text) return null;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('[tokenHelper] Encryption error:', err.message);
    return text; // Fallback if encryption fails
  }
}

/**
 * Decrypt an encrypted token string
 * @param {string} text - iv:encryptedText hex format
 * @returns {string} Plain token
 */
function decryptToken(text) {
  if (!text) return null;
  if (!text.includes(':')) return text; // If unencrypted legacy string
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[tokenHelper] Decryption error:', err.message);
    return text;
  }
}

module.exports = {
  encryptToken,
  decryptToken
};
