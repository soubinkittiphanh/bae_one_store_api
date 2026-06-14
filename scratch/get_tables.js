const db = require('../src/config/dbcon.js');

async function run() {
  db.query('SHOW TABLES', (err, results) => {
    if (err) {
      console.error('Error listing tables:', err);
      process.exit(1);
    }
    console.log('ALL TABLES:');
    const tbls = results.map(r => Object.values(r)[0]);
    console.log(JSON.stringify(tbls));
    process.exit(0);
  });
}

run();
