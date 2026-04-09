const { initDatabase, query, get, run, all } = require('./src/main/database.ts'); initDatabase(); const result = get('SELECT 1 as test'); console.log('Database test result:', result);
