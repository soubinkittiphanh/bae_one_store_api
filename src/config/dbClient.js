try {
    require('dotenv').config();
} catch (e) {
    // Ignore if dotenv is not available
}

// Local overrides: DCOMMERCE_DB_<HOST|USER|PASSWORD|NAME|PORT>; the old DB_<...> names are still read as a fallback
const dbEnv = (name) => {
    return process.env[`DCOMMERCE_DB_${name}`] !== undefined
        ? process.env[`DCOMMERCE_DB_${name}`]
        : process.env[`DB_${name}`];
};

const makeConfig = (defaultDbName = 'dcommerce_dev') => ({
    get host() {
        return this._host !== undefined
            ? this._host
            : (dbEnv('HOST') || process.env.DB_HOST || 'localhost');
    },
    set host(val) {
        this._host = val;
    },
    get user() {
        return this._user !== undefined
            ? this._user
            : (dbEnv('USER') || process.env.DB_USER || 'root');
    },
    set user(val) {
        this._user = val;
    },
    get password() {
        return this._password !== undefined
            ? this._password
            : (dbEnv('PASSWORD') !== undefined
                ? dbEnv('PASSWORD')
                : (process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : ''));
    },
    set password(val) {
        this._password = val;
    },
    get database() {
        return this._database !== undefined
            ? this._database
            : (dbEnv('NAME') || process.env.DB_NAME || defaultDbName);
    },
    set database(val) {
        this._database = val;
    },
    get port() {
        return this._port !== undefined
            ? this._port
            : Number(dbEnv('PORT') || process.env.DB_PORT || 3306);
    },
    set port(val) {
        this._port = val;
    },
});

const defaultConnection = makeConfig('dcommerce_dev');

// Direct connection properties on clientDB so it functions cleanly whether
// accessed as an object of tenant databases (clientDB.dev) or directly as a db config (clientDB.host, clientDB.password)
const rawClientDB = {
    get host() { return defaultConnection.host; },
    set host(val) { defaultConnection.host = val; },
    get user() { return defaultConnection.user; },
    set user(val) { defaultConnection.user = val; },
    get password() { return defaultConnection.password; },
    set password(val) { defaultConnection.password = val; },
    get database() { return defaultConnection.database; },
    set database(val) { defaultConnection.database = val; },
    get port() { return defaultConnection.port; },
    set port(val) { defaultConnection.port = val; },
};

const clientDatabases = {
    chithanh: 'dcommerce_pro_chithanh',
    bbs: 'dcommerce_pro_bbs',
    peeair4_2024: 'dcommerce_pro_peeair4_2024',
    temp: 'temp',
    dev: 'dcommerce_dev',
    payment_1: 'dcommerce_pro_payment',
    offline: 'dcommerce_dev',
    dev_online: 'dcommerce_demo',
    ksouk: 'dcommerce_pro_ksouk',
    demo1: 'dcommerce_dem_1',
    demo: 'dcommerce_demo',
    standard: 'dcommerce_standard_model',
    auto: 'dcommerce_pro_auto_55244451',
    the_corners: 'dcommerce_pro_the_corners',
    phaivanh: 'dcommerce_pro_phayvanh',
    bmart: 'dcommerce_pro_bmart',
    onphet: 'dcommerce_pro_onphet',
    carcare_sokpaluang: 'dcommerce_pro_carcare_sokpaluang',
    mpwt: 'dcommerce_mpwt',
    taiphuan: 'dcommerce_pro_auto_02023838999',
    pm: 'dcommerce_pro_pheuanmit',
    best_coff: 'dcommerce_pro_best_coffee',
    dcommerce: 'dcommerce_pro_dc',
    autofood: 'dcommerce_pro_autofood',
    env_auto: 'dcommerce_demo',
    pro_sho: 'dcommerce_pro_sho',
    poukaofai: 'dcommerce_pro_phoukaofai',
    thipphachan: 'dcommerce_pro_thipphachan',
    pt67: 'dcommerce_pro_pt67',
    '24h1': 'dcommerce_pro_24h_min',
    swat_beerlao: 'dcommerce_pro_swai_beerlao',
    parking1: 'dcommerce_pro_park1',
};

for (const [key, defaultDbName] of Object.entries(clientDatabases)) {
    rawClientDB[key] = makeConfig(defaultDbName);
}

const RESERVED_PROPS = new Set([
    'host', 'user', 'password', 'database', 'port',
    '_host', '_user', '_password', '_database', '_port',
    'then', 'toJSON', 'toString', 'valueOf', 'constructor', 'prototype', 'inspect'
]);

const clientDB = new Proxy(rawClientDB, {
    get(target, prop) {
        if (typeof prop === 'string') {
            if (prop in target) {
                return target[prop];
            }
            if (RESERVED_PROPS.has(prop) || prop.startsWith('_') || prop.startsWith('$')) {
                return undefined;
            }
            return makeConfig(prop);
        }
        return target[prop];
    },
});

module.exports = {
    clientDB,
};
