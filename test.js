const { Sequelize } = require('sequelize');
const net = require('net');

// Your database configuration
const dbConfig = {
    host: "mariadb-202130-0.cloudclusters.net",
    user: "soubin",
    password: "zaq1@wsx",
    database: "dcommerce_dev",
    port: 10087,
};

// Test 1: Basic network connectivity
function testNetworkConnectivity() {
    return new Promise((resolve, reject) => {
        console.log('🔍 Testing network connectivity...');
        
        const socket = new net.Socket();
        const timeout = 10000; // 10 seconds
        
        socket.setTimeout(timeout);
        
        socket.on('connect', () => {
            console.log('✅ Network connection successful');
            socket.destroy();
            resolve(true);
        });
        
        socket.on('timeout', () => {
            console.log('❌ Network connection timeout');
            socket.destroy();
            reject(new Error('Connection timeout'));
        });
        
        socket.on('error', (err) => {
            console.log('❌ Network connection error:', err.message);
            socket.destroy();
            reject(err);
        });
        
        socket.connect(dbConfig.port, dbConfig.host);
    });
}

// Test 2: Sequelize connection with different configurations
async function testSequelizeConnection(config) {
    const sequelize = new Sequelize(config.database, config.user, config.password, {
        host: config.host,
        dialect: 'mariadb',
        port: config.port,
        logging: console.log, // Enable SQL logging
        pool: {
            max: 5,
            min: 1,
            acquire: 30000,
            idle: 10000
        },
        dialectOptions: {
            connectTimeout: 20000,
            acquireTimeout: 20000,
        }
    });

    try {
        console.log('🔍 Testing Sequelize connection...');
        await sequelize.authenticate();
        console.log('✅ Sequelize connection successful');
        await sequelize.close();
        return true;
    } catch (error) {
        console.log('❌ Sequelize connection failed:', error.message);
        console.log('Error details:', {
            name: error.name,
            code: error.original?.code,
            errno: error.original?.errno,
            sqlState: error.original?.sqlState
        });
        await sequelize.close();
        throw error;
    }
}

// Test 3: Alternative connection string format
async function testConnectionString() {
    const connectionString = `mariadb://${dbConfig.user}:${encodeURIComponent(dbConfig.password)}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`;
    
    const sequelize = new Sequelize(connectionString, {
        logging: console.log,
        pool: {
            max: 5,
            min: 1,
            acquire: 30000,
            idle: 10000
        }
    });

    try {
        console.log('🔍 Testing connection string format...');
        await sequelize.authenticate();
        console.log('✅ Connection string format successful');
        await sequelize.close();
        return true;
    } catch (error) {
        console.log('❌ Connection string format failed:', error.message);
        await sequelize.close();
        throw error;
    }
}

// Main test function
async function runConnectionTests() {
    console.log('🚀 Starting database connection tests...\n');
    console.log('Configuration:');
    console.log('- Host:', dbConfig.host);
    console.log('- Port:', dbConfig.port);
    console.log('- Database:', dbConfig.database);
    console.log('- User:', dbConfig.user);
    console.log('- Password:', '***' + dbConfig.password.slice(-3));
    console.log('\n' + '='.repeat(50) + '\n');

    // Test 1: Network connectivity
    try {
        await testNetworkConnectivity();
    } catch (error) {
        console.log('⚠️  Network test failed. This might indicate:');
        console.log('   - Firewall blocking the connection');
        console.log('   - Database server is down');
        console.log('   - Incorrect host/port configuration');
        console.log('   - Your IP is not whitelisted\n');
        return; // Don't continue if network fails
    }

    console.log('\n' + '-'.repeat(30) + '\n');

    // Test 2: Standard Sequelize connection
    try {
        await testSequelizeConnection(dbConfig);
    } catch (error) {
        console.log('⚠️  Standard connection failed');
    }

    console.log('\n' + '-'.repeat(30) + '\n');

    // Test 3: Connection string format
    try {
        await testConnectionString();
    } catch (error) {
        console.log('⚠️  Connection string format failed');
    }

    console.log('\n' + '='.repeat(50));
    console.log('🔧 Troubleshooting suggestions:');
    console.log('1. Check CloudClusters dashboard for server status');
    console.log('2. Verify your IP is whitelisted in CloudClusters');
    console.log('3. Ensure your CloudClusters account is active');
    console.log('4. Try connecting from a different network');
    console.log('5. Contact CloudClusters support if issues persist');
}

// Environment check
function checkEnvironment() {
    console.log('📋 Environment Information:');
    console.log('- Node.js version:', process.version);
    console.log('- Platform:', process.platform);
    console.log('- Current working directory:', process.cwd());
    
    try {
        const sequelize = require('sequelize');
        console.log('- Sequelize version:', sequelize.version);
    } catch (error) {
        console.log('- Sequelize: Not installed or not accessible');
    }
    
    console.log('\n');
}

// Run the tests
if (require.main === module) {
    checkEnvironment();
    runConnectionTests().catch(error => {
        console.error('Test suite failed:', error.message);
        process.exit(1);
    });
}

module.exports = {
    testNetworkConnectivity,
    testSequelizeConnection,
    runConnectionTests
};