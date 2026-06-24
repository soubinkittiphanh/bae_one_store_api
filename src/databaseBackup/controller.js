const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const logger = require('../api/logger');

/**
 * Resolves the path to the database utility (mysqldump or mysql) on Windows/Linux/macOS.
 * On Windows, it checks the system PATH and standard installation paths (XAMPP, Laragon, Program Files, etc.).
 * It also supports custom configuration via the MYSQL_BIN_PATH environment variable.
 */
const getDatabaseToolPath = (toolName) => {
    // 1. Check custom environment variable first (works for all platforms)
    if (process.env.MYSQL_BIN_PATH) {
        const binPath = process.env.MYSQL_BIN_PATH;
        const exeName = process.platform === 'win32' ? `${toolName}.exe` : toolName;
        // Check if MYSQL_BIN_PATH points directly to the executable or the directory containing it
        if (fs.existsSync(binPath) && fs.statSync(binPath).isFile() && binPath.endsWith(exeName)) {
            return binPath;
        }
        const combinedPath = path.join(binPath, exeName);
        if (fs.existsSync(combinedPath)) {
            return combinedPath;
        }
    }

    if (process.platform !== 'win32') {
        return toolName; // On Linux/macOS, assume it's in the PATH
    }

    // 2. On Windows, check if the tool is accessible in the PATH
    try {
        const { execSync } = require('child_process');
        execSync(`where ${toolName}`, { stdio: 'ignore' });
        return toolName; // Found in PATH
    } catch (e) {
        // Not found in PATH, search common Windows installation paths
    }

    // 3. Common installation directories for MySQL / MariaDB on Windows
    const commonPaths = [];

    // XAMPP
    commonPaths.push('C:\\xampp\\mysql\\bin');

    // Laragon
    const laragonMysqlDir = 'C:\\laragon\\bin\\mysql';
    if (fs.existsSync(laragonMysqlDir)) {
        try {
            const dirs = fs.readdirSync(laragonMysqlDir);
            for (const dir of dirs) {
                commonPaths.push(path.join(laragonMysqlDir, dir, 'bin'));
            }
        } catch (e) {}
    }
    const laragonMariadbDir = 'C:\\laragon\\bin\\mariadb';
    if (fs.existsSync(laragonMariadbDir)) {
        try {
            const dirs = fs.readdirSync(laragonMariadbDir);
            for (const dir of dirs) {
                commonPaths.push(path.join(laragonMariadbDir, dir, 'bin'));
            }
        } catch (e) {}
    }

    // Program Files (MySQL and MariaDB)
    const programFiles = ['C:\\Program Files', 'C:\\Program Files (x86)'];
    for (const pf of programFiles) {
        // MySQL Server
        const mysqlDir = path.join(pf, 'MySQL');
        if (fs.existsSync(mysqlDir)) {
            try {
                const subdirs = fs.readdirSync(mysqlDir);
                for (const subdir of subdirs) {
                    commonPaths.push(path.join(mysqlDir, subdir, 'bin'));
                }
            } catch (e) {}
        }
        // MariaDB
        const mariadbDir = path.join(pf, 'MariaDB');
        if (fs.existsSync(mariadbDir)) {
            try {
                const subdirs = fs.readdirSync(mariadbDir);
                for (const subdir of subdirs) {
                    commonPaths.push(path.join(mariadbDir, subdir, 'bin'));
                }
            } catch (e) {}
        }
    }

    // Check each path for the executable
    for (const dir of commonPaths) {
        const fullPath = path.join(dir, `${toolName}.exe`);
        if (fs.existsSync(fullPath)) {
            logger.info(`Found ${toolName} at Windows path: ${fullPath}`);
            return fullPath;
        }
    }

    // Fallback to the toolName and let spawn try its default behavior
    return toolName;
};

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

            const mysqldumpPath = getDatabaseToolPath('mysqldump');
            const mysqldump = spawn(mysqldumpPath, [
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

            mysqldump.on('error', (err) => {
                logger.error(`Failed to start mysqldump process: ${err.message}`);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, message: `Database backup failed to start: ${err.message}. Please verify if MySQL/MariaDB database tools are installed and in the system path, or configure the MYSQL_BIN_PATH environment variable.` });
                }
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

            const mysqlPath = getDatabaseToolPath('mysql');
            const mysql = spawn(mysqlPath, [
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

            mysql.on('error', (err) => {
                logger.error(`Failed to start mysql process: ${err.message}`);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, message: `Database restoration failed to start: ${err.message}. Please verify if MySQL/MariaDB database tools are installed and in the system path, or configure the MYSQL_BIN_PATH environment variable.` });
                }
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
