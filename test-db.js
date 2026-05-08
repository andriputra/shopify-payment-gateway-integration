// test-db.js
//import mysql from 'mysql2/promise'; // or: 
const mysql = require('mysql2/promise');

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'root_dynapp',
      password: 'P@ssw0rd.2026',
      database: 'fqeabibmqn_shopify_multi_payment_gateway',
    });

    const [rows] = await conn.query('SELECT NOW() AS now');
    console.log(rows);
    await conn.end();
  } catch (err) {
    console.error('DB ERROR:', err);
  }
})();
