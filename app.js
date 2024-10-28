const express = require('express');
const bodyParser = require('body-parser');
const connection = require('./db/config');
require('dotenv').config();

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(express.json());

// แสดงหน้า admin
app.get('/admin', (req, res) => {
  const selectedMajorDepartment = req.query.major_department || 'all';
  const selectedSubDepartment = req.query.sub_department || 'all';
  const showAllUsers = req.query.showAllUsers === 'true';
  const searchName = req.query.search || '';
  const page = Math.max(parseInt(req.query.page) || 1, 1); // Ensure page is at least 1
  const pageSize = 30; // จำนวนรายการต่อหน้า
  const offset = (page - 1) * pageSize; // Offset calculation

  // Query หลักสำหรับดึงข้อมูลผู้ใช้และไซซ์เสื้อ
  let query = `
    SELECT u.first_name, u.last_name, u.position, s.size, sd.sub_department_name, md.major_department_name
    FROM users u
    LEFT JOIN shirt_sizes s ON u.id = s.user_id
    JOIN sub_departments sd ON u.sub_department_id = sd.id
    JOIN major_departments md ON sd.major_department_id = md.id
  `;

  const queryParams = [];

  if (selectedMajorDepartment !== 'all') {
    query += ` WHERE md.id = ?`;
    queryParams.push(selectedMajorDepartment);
  }

  if (selectedSubDepartment !== 'all') {
    query += queryParams.length > 0 ? ` AND` : ` WHERE`;
    query += ` sd.id = ?`;
    queryParams.push(selectedSubDepartment);
  }

  if (!showAllUsers) {
    query += queryParams.length > 0 ? ` AND` : ` WHERE`;
    query += ` s.size IS NOT NULL`;
  }

  if (searchName) {
    query += queryParams.length > 0 ? ` AND` : ` WHERE`;
    query += ` (u.first_name LIKE ? OR u.last_name LIKE ?)`;
    queryParams.push(`%${searchName}%`, `%${searchName}%`);
  }

  // นับจำนวนทั้งหมดก่อนเพื่อนำไปคำนวณจำนวนหน้า
  let countQuery = `SELECT COUNT(*) as total FROM (${query}) as totalUsers`;
  connection.query(countQuery, queryParams, (err, countResult) => {
    if (err) throw err;

    const totalUsers = countResult[0].total;
    const totalPages = Math.ceil(totalUsers / pageSize);

    // เพิ่ม LIMIT สำหรับ pagination
    query += ` ORDER BY u.first_name ASC LIMIT ?, ?`;
    queryParams.push(offset, pageSize);

    // Query หลักสำหรับดึงข้อมูลผู้ใช้
    connection.query(query, queryParams, (err, results) => {
      if (err) throw err;

      // Query สำหรับสรุปจำนวนเสื้อแต่ละไซซ์
      let sizeSummaryQuery = `
        SELECT s.size, COUNT(*) AS count
        FROM shirt_sizes s
        JOIN users u ON s.user_id = u.id
        JOIN sub_departments sd ON u.sub_department_id = sd.id
        JOIN major_departments md ON sd.major_department_id = md.id
      `;

      if (selectedMajorDepartment !== 'all') {
        sizeSummaryQuery += ` WHERE md.id = ?`;
      }

      if (selectedSubDepartment !== 'all') {
        sizeSummaryQuery += selectedMajorDepartment !== 'all' ? ` AND` : ` WHERE`;
        sizeSummaryQuery += ` sd.id = ?`;
      }

      sizeSummaryQuery += ` GROUP BY s.size ORDER BY s.size ASC`;

      connection.query(sizeSummaryQuery, queryParams.slice(0, queryParams.length - 2), (err, sizeSummaryResults) => {
        if (err) throw err;

        connection.query('SELECT * FROM major_departments', (err, majorDepartments) => {
          if (err) throw err;

          connection.query('SELECT * FROM sub_departments', (err, subDepartments) => {
            if (err) throw err;

            res.render('admin', {
              sizes: results,
              sizeSummary: sizeSummaryResults,
              majorDepartments,
              subDepartments,
              selectedMajorDepartment,
              selectedSubDepartment,
              showAllUsers,
              searchName,
              page,
              totalPages,
            });
          });
        });
      });
    });
  });
});

// ดาวน์โหลด CSV
app.get('/download-csv', (req, res) => {
  const subDepartment = req.query.sub_department || 'all';
  const includeAllUsers = req.query.includeAllUsers === 'true';

  let query = `
    SELECT u.first_name, u.last_name, u.position, s.size, md.major_department_name, d.sub_department_name
    FROM users u
    LEFT JOIN shirt_sizes s ON u.id = s.user_id
    JOIN sub_departments d ON u.sub_department_id = d.id
    JOIN major_departments md ON d.major_department_id = md.id
  `;

  const conditions = [];
  const queryParams = [];

  if (subDepartment !== 'all') {
    conditions.push(`u.sub_department_id = ?`);
    queryParams.push(subDepartment);
  }

  if (!includeAllUsers) {
    conditions.push(`s.size IS NOT NULL`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }

  connection.query(query, queryParams, (err, results) => {
    if (err) throw err;

    let csvContent = '﻿' + 'First Name,Last Name,Position,Size,Major Department,Sub Department\n';
    results.forEach(row => {
      csvContent += `${row.first_name},${row.last_name},${row.position || ''},${row.size || ''},${row.major_department_name},${row.sub_department_name}\n`;
    });

    const fileName = includeAllUsers
      ? `size-All-Including-Unrecorded-${subDepartment}.csv`
      : `size-${subDepartment}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(csvContent);
  });
});

// ดาวน์โหลด CSV สรุปจำนวนไซซ์เสื้อ
app.get('/download-size-summary-csv', (req, res) => {
  let query = `
    SELECT 
      sd.sub_department_name,
      s.size,
      COUNT(*) AS count
    FROM shirt_sizes s
    JOIN users u ON s.user_id = u.id
    JOIN sub_departments sd ON u.sub_department_id = sd.id
    JOIN major_departments md ON sd.major_department_id = md.id
    GROUP BY sd.sub_department_name, s.size
    ORDER BY sd.sub_department_name, s.size;
  `;

  connection.query(query, (err, results) => {
    if (err) throw err;

    let csvContent = '﻿' + 'Sub Department,Size,Count\n';
    results.forEach(row => {
      csvContent += `${row.sub_department_name},${row.size},${row.count}\n`;
    });

    const fileName = 'size-summary.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(csvContent);
  });
});

// หน้าแรก แสดงตัวเลือกหน่วยงาน
app.get('/', (req, res) => {
  connection.query('SELECT * FROM major_departments', (err, majorDepartments) => {
    if (err) throw err;

    connection.query('SELECT * FROM departments', (err, departments) => {
      if (err) throw err;

      res.render('select_department', { majorDepartments, departments });
    });
  });
});

// ไปยังหน้าบันทึกไซซ์เสื้อ
app.post('/start-recording', (req, res) => {
  const subDepartmentId = req.body.department;

  if (!subDepartmentId) {
    return res.status(400).json({ success: false, message: 'Missing subDepartmentId' });
  }

  const query = `
    SELECT u.id AS user_id, u.first_name, u.last_name, s.size, sd.sub_department_name
    FROM users u
    LEFT JOIN shirt_sizes s ON u.id = s.user_id
    JOIN sub_departments sd ON u.sub_department_id = sd.id
    WHERE u.sub_department_id = ?`;

  connection.query(query, [subDepartmentId], (err, users) => {
    if (err) throw err;

    const hasPreviousData = users.some(user => user.size !== null);

    const departmentQuery = `SELECT sub_department_name FROM sub_departments WHERE id = ?`;
    connection.query(departmentQuery, [subDepartmentId], (err, result) => {
      if (err) {
        console.error('Error fetching department name:', err);
        return res.status(500).json({ success: false, message: 'Internal server error' });
      }

      const subDepartmentName = result.length > 0 ? result[0].sub_department_name : "Unknown";

      res.render('record_size', { users, subDepartmentId, subDepartmentName, hasPreviousData });
    });
  });
});

// บันทึกข้อมูลไซซ์เสื้อ
app.post('/save-sizes', (req, res) => {
  const { userIds, sizes } = req.body;

  const queries = [];

  userIds.forEach((userId, index) => {
    const size = sizes[index];
    if (parseInt(userId, 10) > 0 && size !== "") {
      queries.push(
        new Promise((resolve, reject) => {
          const query = `
            INSERT INTO shirt_sizes (user_id, size)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE size = ?`;
          connection.query(query, [userId, size, size], (err) => {
            if (err) reject(err);
            else resolve();
          });
        })
      );
    }
  });

  Promise.all(queries)
    .then(() => res.redirect('/?saved=true'))
    .catch(err => res.status(500).send(err));
});

// API เพื่อดึงหน่วยงานยตามสำนัก
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

// เพิ่มผู้ใช้ด้วยตนเอง
app.post('/add-user', (req, res) => {
  const { first_name, last_name, sub_department_id, position } = req.body;

  if (!first_name || !last_name || !sub_department_id || !position) {
    return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
  }

  const query = `
    INSERT INTO users (first_name, last_name, sub_department_id, position, isUserAdded)
    VALUES (?, ?, ?, ?, TRUE)
  `;

  connection.query(query, [first_name, last_name, sub_department_id, position], (err) => {
    if (err) {
      console.error('Error inserting user:', err);
      return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
    res.json({ success: true, message: 'เพิ่มผู้ใช้สำเร็จ' });
  });
});

// ค้นหาหน่วยงานย่อย
app.get('/api/search-sub-departments', (req, res) => {
  const query = req.query.query;

  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter' });
  }

  const searchQuery = `
    SELECT md.major_department_name, sd.sub_department_name
    FROM sub_departments sd
    JOIN major_departments md ON sd.major_department_id = md.id
    WHERE sd.sub_department_name LIKE ? OR md.major_department_name LIKE ?
    LIMIT 10
  `;

  const queryParams = [`%${query}%`, `%${query}%`];

  connection.query(searchQuery, queryParams, (err, results) => {
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