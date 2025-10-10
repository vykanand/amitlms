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
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf16`;
    db.query(createTableQuery, (err) => {
      if (err) {
        console.error('Error creating table:', err);
      } else {
        console.log('Table courses created or already exists');
        // Alter coursevids to TEXT if not already
        const alterQuery = 'ALTER TABLE courses MODIFY coursevids TEXT;';
        db.query(alterQuery, (err) => {
          if (err) {
            console.log('Alter table (may already be TEXT):', err.message);
          } else {
            console.log('Altered coursevids to TEXT');
          }
        });
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
  const query = 'SELECT id, coursename, coursepic, coursedesc, duration, coursevids FROM courses';
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
  const query = 'SELECT id, coursename, coursepic, coursedesc, duration, coursevids FROM courses WHERE id = ?';
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
  const { coursename, coursepic, coursedesc, duration, coursevids } = req.body;
  const query = 'INSERT INTO courses (coursename, coursepic, coursedesc, duration, coursevids) VALUES (?, ?, ?, ?, ?)';
  db.query(query, [coursename, coursepic, coursedesc, duration, JSON.stringify(coursevids)], (err, result) => {
    if (err) {
      console.error('Error adding course:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json({ id: result.insertId, coursename, coursepic, coursedesc, duration, coursevids });
    }
  });
});

// API endpoint to update a course
app.put('/api/courses/:id', (req, res) => {
  const { id } = req.params;
  const { coursename, coursepic, coursedesc, duration, coursevids } = req.body;
  const query = 'UPDATE courses SET coursename = ?, coursepic = ?, coursedesc = ?, duration = ?, coursevids = ? WHERE id = ?';
  db.query(query, [coursename, coursepic, coursedesc, duration, JSON.stringify(coursevids), id], (err, result) => {
    if (err) {
      console.error('Error updating course:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json({ id, coursename, coursepic, coursedesc, duration, coursevids });
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

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

module.exports = app;
