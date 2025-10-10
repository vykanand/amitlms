const express = require("express");
const path = require("path");
const fs = require("fs");
const mysql = require("mysql2");
const app = express();
const port = 3002;

// Database connection
const db = mysql.createConnection({
  host: "junction.proxy.rlwy.net",
  user: "root",
  password: "cyIgFzjjbzRiVbiHkemiUCKftdfPqBOn",
  database: "amit",
  port: 14359
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Connected to database');
    // Create courses table if not exists
    const createTableQuery = `CREATE TABLE IF NOT EXISTS \`courses\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`coursename\` text,
      \`coursepic\` text,
      \`coursedesc\` text,
      \`duration\` mediumtext,
      \`coursevids\` TEXT,
      \`price\` DECIMAL(10,2) DEFAULT 0,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf16`;
    db.query(createTableQuery, (err) => {
      if (err) {
        console.error('Error creating table:', err);
      } else {
        console.log('Table courses created or already exists');
      }
    });
    // Create users table if not exists
    const createUsersTableQuery = `CREATE TABLE IF NOT EXISTS \`users\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`name\` text,
      \`email\` text,
      \`role\` text,
      \`phone\` text,
      \`password\` text,
      \`paid\` text,
      \`course\` text,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf16`;
    db.query(createUsersTableQuery, (err) => {
      if (err) {
        console.error('Error creating users table:', err);
      } else {
        console.log('Table users created or already exists');

      }
    });
  }
});

// Define the base public directory
const publicDir = path.join(__dirname, "public");

// Function to recursively list all files and folders
function listFiles(dir, prefix = '') {
  try {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      // console.log(prefix + item);
      if (stat.isDirectory()) {
        listFiles(fullPath, prefix + '  ');
      }
    });
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err.message);
  }
}

// Serve the entire public directory recursively
app.use(express.static('public'));

// List all files and folders in public
console.log('Files and folders in public directory:');
listFiles(publicDir);

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Middleware to parse JSON
app.use(express.json());

// API endpoint to get courses
app.get('/api/courses', (req, res) => {
  const query = 'SELECT id, coursename, coursepic, coursedesc, duration, coursevids, price FROM courses';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching courses:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      const parsedResults = results.map(course => {
        let coursevids;
        try {
          coursevids = JSON.parse(course.coursevids || '[]');
        } catch (e) {
          // If not JSON, assume comma-separated string
          if (typeof course.coursevids === 'string') {
            coursevids = course.coursevids.split(',').map(v => v.trim());
          } else {
            coursevids = [];
          }
        }
        return { ...course, coursevids };
      });
      res.json(parsedResults);
    }
  });
});

// API endpoint to get a single course
app.get('/api/courses/:id', (req, res) => {
  const { id } = req.params;
  const query = 'SELECT id, coursename, coursepic, coursedesc, duration, coursevids, price FROM courses WHERE id = ?';
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error fetching course:', err);
      res.status(500).json({ error: 'Database error' });
    } else if (results.length === 0) {
      res.status(404).json({ error: 'Course not found' });
    } else {
      // console.log('Raw results:', results);
      const course = results[0];
      // console.log('coursevids from db:', course.coursevids);
      let coursevids;
      try {
        coursevids = JSON.parse(course.coursevids || '[]');
      } catch (e) {
        if (typeof course.coursevids === 'string') {
          coursevids = course.coursevids.split(',').map(v => v.trim());
        } else {
          coursevids = [];
        }
      }
      res.json({
        ...course,
        coursevids
      });
    }
  });
});

// API endpoint to add a course
app.post('/api/courses', (req, res) => {
  const { coursename, coursepic, coursedesc, duration, coursevids, price } = req.body;
  const query = 'INSERT INTO courses (coursename, coursepic, coursedesc, duration, coursevids, price) VALUES (?, ?, ?, ?, ?, ?)';
  db.query(query, [coursename, coursepic, coursedesc, duration, JSON.stringify(coursevids), price], (err, result) => {
    if (err) {
      console.error('Error adding course:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json({ id: result.insertId, coursename, coursepic, coursedesc, duration, coursevids, price });
    }
  });
});

// API endpoint to update a course
app.put('/api/courses/:id', (req, res) => {
  const { id } = req.params;
  const { coursename, coursepic, coursedesc, duration, coursevids, price } = req.body;
  const query = 'UPDATE courses SET coursename = ?, coursepic = ?, coursedesc = ?, duration = ?, coursevids = ?, price = ? WHERE id = ?';
  db.query(query, [coursename, coursepic, coursedesc, duration, JSON.stringify(coursevids), price, id], (err, result) => {
    if (err) {
      console.error('Error updating course:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json({ id, coursename, coursepic, coursedesc, duration, coursevids, price });
    }
  });
});

// API endpoint to delete a course
app.delete('/api/courses/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM courses WHERE id = ?';
  db.query(query, [id], (err, result) => {
    if (err) {
      console.error('Error deleting course:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json({ message: 'Course deleted' });
    }
  });
});

// API endpoint to get users
app.get('/api/users', (req, res) => {
  const query = 'SELECT id, phone as name, phone as email, \'student\' as role FROM users';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching users:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json(results);
    }
  });
});

// API endpoint to get a single user
app.get('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const query = 'SELECT id, phone as name, phone as email, \'student\' as role FROM users WHERE id = ?';
  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error fetching user:', err);
      res.status(500).json({ error: 'Database error' });
    } else if (results.length === 0) {
      res.status(404).json({ error: 'User not found' });
    } else {
      res.json(results[0]);
    }
  });
});

// API endpoint to add a user
app.post('/api/users', (req, res) => {
  const { name, email, role } = req.body;
  const query = 'INSERT INTO users (phone, password, paid, course) VALUES (?, \'\', \'no\', \'[]\')';
  db.query(query, [email], (err, result) => {
    if (err) {
      console.error('Error adding user:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json({ id: result.insertId, name: email, email, role: 'student' });
    }
  });
});

// API endpoint to update a user
app.put('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, role } = req.body;
  const query = 'UPDATE users SET phone = ? WHERE id = ?';
  db.query(query, [email, id], (err, result) => {
    if (err) {
      console.error('Error updating user:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json({ id, name: email, email, role: 'student' });
    }
  });
});

// API endpoint to delete a user
app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM users WHERE id = ?';
  db.query(query, [id], (err, result) => {
    if (err) {
      console.error('Error deleting user:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json({ message: 'User deleted' });
    }
  });
});

// API endpoint for user login
app.post('/api/login', (req, res) => {
  const { phone, password } = req.body;
  const query = 'SELECT phone, password, paid, course FROM users WHERE phone = ? AND password = ?';
  db.query(query, [phone, password], (err, results) => {
    if (err) {
      console.error('Error during login:', err);
      res.status(500).json({ error: 'Database error' });
    } else if (results.length === 0) {
      res.status(401).json({ error: 'Invalid phone or password' });
    } else {
      const user = results[0];
      // Parse course JSON
      let courses = [];
      try {
        courses = JSON.parse(user.course || '[]');
      } catch (e) {
        courses = [];
      }
      res.json({
        phone: user.phone,
        paid: user.paid,
        courses: courses
      });
    }
  });
});

// API endpoint for user signup
app.post('/api/signup', (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  // Check if user already exists
  const checkQuery = 'SELECT phone FROM users WHERE phone = ?';
  db.query(checkQuery, [phone], (err, results) => {
    if (err) {
      console.error('Error checking user:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }
    // Insert new user
    const insertQuery = 'INSERT INTO users (phone, password, paid, course) VALUES (?, ?, ?, ?)';
    db.query(insertQuery, [phone, password, 'no', '[]'], (err, result) => {
      if (err) {
        console.error('Error inserting user:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Signup successful' });
    });
  });
});

// API endpoint to get user's courses
app.get('/api/user/courses', (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: 'Phone required' });
  }
  const query = 'SELECT course FROM users WHERE phone = ?';
  db.query(query, [phone], (err, results) => {
    if (err) {
      console.error('Error fetching user courses:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    let courseIds = [];
    try {
      courseIds = JSON.parse(results[0].course || '[]');
    } catch (e) {
      courseIds = [];
    }
    if (courseIds.length === 0) {
      return res.json([]);
    }
    // Fetch courses details
    const placeholders = courseIds.map(() => '?').join(',');
    const coursesQuery = `SELECT id, coursename, coursepic, coursedesc, duration, coursevids, price FROM courses WHERE id IN (${placeholders})`;
    db.query(coursesQuery, courseIds, (err, courses) => {
      if (err) {
        console.error('Error fetching courses:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      const parsedCourses = courses.map(course => {
        let coursevids;
        try {
          coursevids = JSON.parse(course.coursevids || '[]');
        } catch (e) {
          if (typeof course.coursevids === 'string') {
            coursevids = course.coursevids.split(',').map(v => v.trim());
          } else {
            coursevids = [];
          }
        }
        return { ...course, coursevids };
      });
      res.json(parsedCourses);
    });
  });
});

// API endpoint to add courses to user
app.post('/api/user/courses', (req, res) => {
  const { phone, courses } = req.body;
  if (!phone || !courses || !Array.isArray(courses)) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  // First, get current courses
  const selectQuery = 'SELECT course FROM users WHERE phone = ?';
  db.query(selectQuery, [phone], (err, results) => {
    if (err) {
      console.error('Error fetching user:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    let currentCourses = [];
    try {
      currentCourses = JSON.parse(results[0].course || '[]');
    } catch (e) {
      currentCourses = [];
    }
    // Add new courses if not already present
    const updatedCourses = [...new Set([...currentCourses, ...courses])];
    const updateQuery = 'UPDATE users SET course = ? WHERE phone = ?';
    db.query(updateQuery, [JSON.stringify(updatedCourses), phone], (err, result) => {
      if (err) {
        console.error('Error updating user courses:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Courses added successfully', courses: updatedCourses });
    });
  });
});

// Temporary endpoint to get tables
app.get('/api/tables', (req, res) => {
  const query = 'SHOW TABLES';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching tables:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json(results);
    }
  });
});

// Catch-all route for undefined paths
app.get("*", (req, res) => {
  res.status(404).send("Website not found!");
});

// if (require.main === module) {
//   app.listen(port, () => {
//     console.log(`Server is running at http://localhost:${port}`);
//   });
// }

module.exports = app;
