const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: '203.159.94.36',
  user: 'root',
  password: 'DB@badeesorn',
  port: 23306,
  database: '65y_surwaysys'
});

connection.connect((err) => {
  if (err) throw err;
  console.log('Connected to the MySQL database.');
});

module.exports = connection;
