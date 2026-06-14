const db = require('../src/models/index.js');

console.log('Required index.js. Waiting 10 seconds for the automatic synchronization to complete...');
setTimeout(() => {
  console.log('Done waiting. Exiting.');
  process.exit(0);
}, 10000);
