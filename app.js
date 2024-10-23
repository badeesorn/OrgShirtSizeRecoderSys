const express = require('express');
const bodyParser = require('body-parser');
const connection = require('./db/config');
require('dotenv').config();

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// แสดงหน้า admin
app.get('/admin', (req, res) => {
  const selectedDepartment = req.query.department || 'all';

  // Query หลักสำหรับดึงข้อมูลผู้ใช้และไซซ์เสื้อ
  let query = `
    SELECT u.first_name, u.last_name, s.size, s.status, d.department_name
    FROM shirt_sizes s
    JOIN users u ON s.user_id = u.id
    JOIN departments d ON u.department_id = d.id
  `;

  // Query สำหรับสรุปจำนวนเสื้อแต่ละไซซ์
  let sizeSummaryQuery = `
    SELECT s.size, COUNT(*) AS count
    FROM shirt_sizes s
    JOIN users u ON s.user_id = u.id
  `;

  const queryParams = [];

  if (selectedDepartment !== 'all') {
    query += ` WHERE u.department_id = ?`;
    sizeSummaryQuery += ` WHERE u.department_id = ?`;
    queryParams.push(selectedDepartment);
  }

  query += ` ORDER BY u.first_name ASC`;  // จัดเรียงข้อมูลตามชื่อ
  sizeSummaryQuery += ` GROUP BY s.size ORDER BY s.size ASC`;  // สรุปจำนวนตามไซซ์

  // Query หลักสำหรับดึงข้อมูลผู้ใช้
  connection.query(query, queryParams, (err, results) => {
    if (err) throw err;

    // Query สำหรับสรุปจำนวนเสื้อแต่ละไซซ์
    connection.query(sizeSummaryQuery, queryParams, (err, sizeSummaryResults) => {
      if (err) throw err;

      // Query สำหรับดึงรายชื่อแผนกทั้งหมด
      connection.query('SELECT * FROM departments', (err, departments) => {
        if (err) throw err;
        res.render('admin', { 
          sizes: results,  // ข้อมูลผู้ใช้และไซซ์เสื้อ
          sizeSummary: sizeSummaryResults,  // ข้อมูลสรุปจำนวนเสื้อแต่ละไซซ์
          departments,  // ข้อมูลแผนกทั้งหมด
          selectedDepartment  // แผนกที่เลือกอยู่ในขณะนี้
        });
      });
    });
  });
});


// ดาวน์โหลด CSV
app.get('/download-csv', (req, res) => {
    const department = req.query.department || 'all';
    const status = req.query.status || 'Confirmed';

    let query = `
      SELECT u.first_name, u.last_name, s.size, d.department_name
      FROM shirt_sizes s
      JOIN users u ON s.user_id = u.id
      JOIN departments d ON u.department_id = d.id
    `;

    let conditions = [];
    if (department !== 'all') {
      conditions.push(`u.department_id = ${connection.escape(department)}`);
    }
    if (status !== 'all') {
      conditions.push(`s.status = 'Confirmed'`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    connection.query(query, (err, results) => {
      if (err) throw err;

      let csvContent = '\uFEFF' + 'First Name,Last Name,Size,Department\n';
      results.forEach(row => {
        csvContent += `${row.first_name},${row.last_name},${row.size},${row.department_name}\n`;
      });

      const fileName = status === 'all' ? 'size-All-Including-Draft.csv' : `size-${department}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      res.send(csvContent);
    });
});

// แสดงหน้าเลือกแผนก
app.get('/', (req, res) => {
    connection.query('SELECT * FROM departments', (err, departments) => {
        if (err) throw err;
        res.render('select_department', { departments });
    });
});

// เมื่อเลือกแผนกแล้วไปยังหน้าบันทึกข้อมูล
app.post('/start-recording', (req, res) => {
    const departmentId = req.body.department;

    // Query เพื่อดึงรายชื่อผู้ใช้ในแผนก และข้อมูลไซซ์เสื้อที่เคยบันทึก
    const query = `
      SELECT u.id AS user_id, u.first_name, u.last_name, s.size 
      FROM users u
      LEFT JOIN shirt_sizes s ON u.id = s.user_id
      WHERE u.department_id = ?`;

    connection.query(query, [departmentId], (err, users) => {
        if (err) throw err;

        // ส่งข้อมูลผู้ใช้พร้อมไซซ์เสื้อที่เคยบันทึกไปยังหน้า record_size.ejs
        res.render('record_size', { users, departmentId });
    });
});

// บันทึกข้อมูลไซซ์เสื้อ
app.post('/save-sizes', (req, res) => {
  const { userIds, sizes, status } = req.body;

  const queries = [];

  userIds.forEach((userId, index) => {
      const size = sizes[index];
      if (parseInt(userId, 10) > 0 && size !== "") {
          queries.push(
              new Promise((resolve, reject) => {
                  const query = `
                  INSERT INTO shirt_sizes (user_id, size, status)
                  VALUES (?, ?, ?)
                  ON DUPLICATE KEY UPDATE size = ?, status = ?`;
                  connection.query(query, [userId, size, status, size, status], (err, result) => {
                      if (err) reject(err);
                      else resolve();
                  });
              })
          );
      }
  });

  Promise.all(queries)
      .then(() => res.redirect('/?saved=true'))  // ส่งผู้ใช้กลับไปที่หน้า user พร้อม query parameter
      .catch(err => res.status(500).send(err));
});



// เริ่ม server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
