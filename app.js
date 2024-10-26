const express = require('express');
const bodyParser = require('body-parser');
const connection = require('./db/config');
require('dotenv').config();

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// แสดงหน้า admin
// แสดงหน้า admin
app.get('/admin', (req, res) => {
  const selectedMajorDepartment = req.query.major_department || 'all';
  const selectedSubDepartment = req.query.sub_department || 'all';

  // Query หลักสำหรับดึงข้อมูลผู้ใช้และไซซ์เสื้อ
  let query = `
    SELECT u.first_name, u.last_name, s.size, s.status, sd.sub_department_name
    FROM shirt_sizes s
    JOIN users u ON s.user_id = u.id
    JOIN sub_departments sd ON u.sub_department_id = sd.id
    JOIN major_departments md ON sd.major_department_id = md.id
  `;

  // Query สำหรับสรุปจำนวนเสื้อแต่ละไซซ์
  let sizeSummaryQuery = `
    SELECT s.size, COUNT(*) AS count
    FROM shirt_sizes s
    JOIN users u ON s.user_id = u.id
    JOIN sub_departments sd ON u.sub_department_id = sd.id
    JOIN major_departments md ON sd.major_department_id = md.id
  `;

  const queryParams = [];

  if (selectedMajorDepartment !== 'all') {
    query += ` WHERE md.id = ?`;
    sizeSummaryQuery += ` WHERE md.id = ?`;
    queryParams.push(selectedMajorDepartment);
  }

  if (selectedSubDepartment !== 'all') {
    query += ` AND sd.id = ?`;
    sizeSummaryQuery += ` AND sd.id = ?`;
    queryParams.push(selectedSubDepartment);
  }

  query += ` ORDER BY u.first_name ASC`;  // จัดเรียงข้อมูลตามชื่อ
  sizeSummaryQuery += ` GROUP BY s.size ORDER BY s.size ASC`;  // สรุปจำนวนตามไซซ์

  // Query หลักสำหรับดึงข้อมูลผู้ใช้
  connection.query(query, queryParams, (err, results) => {
    if (err) throw err;

    // Query สำหรับสรุปจำนวนเสื้อแต่ละไซซ์
    connection.query(sizeSummaryQuery, queryParams, (err, sizeSummaryResults) => {
      if (err) throw err;

      // Query สำหรับดึงรายชื่อหน่วยงานใหญ่ทั้งหมด
      connection.query('SELECT * FROM major_departments', (err, majorDepartments) => {
        if (err) throw err;

        // Query สำหรับดึงรายชื่อหน่วยงานย่อยทั้งหมด
        connection.query('SELECT * FROM sub_departments', (err, subDepartments) => {
          if (err) throw err;

          res.render('admin', {
            sizes: results,  // ข้อมูลผู้ใช้และไซซ์เสื้อ
            sizeSummary: sizeSummaryResults,  // ข้อมูลสรุปจำนวนเสื้อแต่ละไซซ์
            majorDepartments,  // ข้อมูลหน่วยงานใหญ่ทั้งหมด
            subDepartments,  // ข้อมูลหน่วยงานย่อยทั้งหมด
            selectedMajorDepartment,  // หน่วยงานใหญ่ที่เลือกอยู่ในขณะนี้
            selectedSubDepartment  // หน่วยงานย่อยที่เลือกอยู่ในขณะนี้
          });
        });
      });
    });
  });
});



// ดาวน์โหลด CSV
app.get('/download-csv', (req, res) => {
  const subDepartment = req.query.sub_department || 'all';
  const status = req.query.status || 'Confirmed';

  let query = `
    SELECT u.first_name, u.last_name, s.size, d.sub_department_name
    FROM shirt_sizes s
    JOIN users u ON s.user_id = u.id
    JOIN sub_departments d ON u.sub_department_id = d.id
  `;

  let conditions = [];
  if (subDepartment !== 'all') {
    conditions.push(`u.sub_department_id = ${connection.escape(subDepartment)}`);
  }
  if (status !== 'all') {
    conditions.push(`s.status = 'Confirmed'`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }

  connection.query(query, (err, results) => {
    if (err) throw err;

    let csvContent = '\uFEFF' + 'First Name,Last Name,Size,Sub Department\n';
    results.forEach(row => {
      csvContent += `${row.first_name},${row.last_name},${row.size},${row.sub_department_name}\n`;
    });

    const fileName = status === 'all' ? 'size-All-Including-Draft.csv' : `size-${subDepartment}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(csvContent);
  });
});


// แสดงหน้าเลือกแผนก
app.get('/', (req, res) => {
  // Query เพื่อดึงหน่วยงานใหญ่ทั้งหมด
  connection.query('SELECT * FROM major_departments', (err, majorDepartments) => {
      if (err) throw err;

      // Query เพื่อดึงแผนกทั้งหมด
      connection.query('SELECT * FROM departments', (err, departments) => {
          if (err) throw err;

          // ส่งข้อมูลทั้งหน่วยงานใหญ่และแผนกไปที่ EJS
          res.render('select_department', { majorDepartments, departments });
      });
  });
});


// เมื่อเลือกแผนกแล้วไปยังหน้าบันทึกข้อมูล
// เมื่อเลือกหน่วยงานใหญ่และแผนกย่อย
app.post('/start-recording', (req, res) => {
  const subDepartmentId = req.body.department;

  // Query เพื่อดึงรายชื่อผู้ใช้ในแผนกย่อย และข้อมูลไซซ์เสื้อที่เคยบันทึก
  const query = `
    SELECT u.id AS user_id, u.first_name, u.last_name, s.size 
    FROM users u
    LEFT JOIN shirt_sizes s ON u.id = s.user_id
    WHERE u.sub_department_id = ?`;

  connection.query(query, [subDepartmentId], (err, users) => {
      if (err) throw err;

      // ส่งข้อมูลผู้ใช้พร้อมไซซ์เสื้อที่เคยบันทึกไปยังหน้า record_size.ejs
      res.render('record_size', { users, subDepartmentId });
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

// API เพื่อดึงแผนกย่อยตามหน่วยงานใหญ่
app.get('/api/sub-departments', (req, res) => {
  const majorDepartmentId = req.query.majorDepartmentId;

  if (!majorDepartmentId) {
    return res.status(400).json({ error: 'Missing majorDepartmentId' });
  }

  const query = 'SELECT * FROM sub_departments WHERE major_department_id = ?';
  connection.query(query, [majorDepartmentId], (err, results) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ subDepartments: results });
  });
});


// เริ่ม server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
