const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const logger = require('../api/logger');

const controller = {
    /**
     * Export database to a SQL file and stream it to the client
     */
    async exportDatabase(req, res) {
        try {
            const dbConfig = env.db;
            
            const dbName = dbConfig.database.toString().replace(/['"]+/g, '');
            
            const now = new Date();
            const dateStr = now.getFullYear() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0') + '_' +
                String(now.getHours()).padStart(2, '0') +
                String(now.getMinutes()).padStart(2, '0') +
                String(now.getSeconds()).padStart(2, '0');
                
            const filename = `backup_${dbName}_${dateStr}.sql`;

            logger.info(`Starting database export for ${dbName} (Host: ${dbConfig.host})`);

            // Set headers for download
            res.setHeader('Content-Type', 'application/sql');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            const mysqldump = spawn('mysqldump', [
                '-h', dbConfig.host,
                '-u', dbConfig.user,
                '--port', dbConfig.port || 3306,
                dbName
            ], {
                env: { ...process.env, MYSQL_PWD: dbConfig.password }
            });

            mysqldump.stdout.pipe(res);

            mysqldump.stderr.on('data', (data) => {
                logger.error(`mysqldump error: ${data}`);
            });

            mysqldump.on('close', (code) => {
                if (code === 0) {
                    logger.info('Database export completed successfully');
                } else {
                    logger.error(`mysqldump process exited with code ${code}`);
                    if (!res.headersSent) {
                        res.status(500).send('Database export failed');
                    }
                }
            });
        } catch (error) {
            logger.error(`Export error: ${error.message}`);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: error.message });
            }
        }
    },

    /**
     * Import database from an uploaded SQL file
     */
    async importDatabase(req, res) {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const dbConfig = env.db;

        if (!dbConfig || !dbConfig.database) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            logger.error('Database name is not defined in the configuration.');
            return res.status(500).json({ success: false, message: 'Database configuration error: Missing database name.' });
        }

        try {
            const dbName = dbConfig.database.toString().replace(/['"]+/g, '');
            logger.info(`Starting database import for ${dbName} from ${req.file.originalname}`);

            const mysql = spawn('mysql', [
                '-h', dbConfig.host,
                '-u', dbConfig.user,
                '--port', dbConfig.port || 3306,
                dbName
            ], {
                env: { ...process.env, MYSQL_PWD: dbConfig.password }
            });

            const readStream = fs.createReadStream(filePath);
            readStream.pipe(mysql.stdin);

            mysql.stderr.on('data', (data) => {
                logger.error(`mysql import error: ${data}`);
            });

            mysql.on('close', (code) => {
                // Delete temporary file after import
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

                if (code === 0) {
                    logger.info('Database import completed successfully');
                    res.status(200).json({ success: true, message: 'Database restored successfully' });
                } else {
                    logger.error(`mysql process exited with code ${code}`);
                    res.status(500).json({ success: false, message: 'Database restoration failed. Check server logs.' });
                }
            });
        } catch (error) {
            logger.error(`Import error: ${error.message}`);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            res.status(500).json({ success: false, message: error.message });
        }
    }
};

module.exports = controller;
