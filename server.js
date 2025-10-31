const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const mysql = require("mysql2");
const app = express();
const port = 3002;

// Session and activity tracking
let activeSessions = new Set();
let lastActivity = Date.now();
let keepAliveInterval = null;
const ACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes of inactivity before letting DB sleep
const KEEP_ALIVE_INTERVAL = 2 * 60 * 1000; // Keep alive ping every 2 minutes

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

// Helper function to parse coursevids safely
function parseCoursevids(coursevidString) {
  try {
    return JSON.parse(coursevidString || '[]');
  } catch (parseError) {
    console.warn('Error parsing coursevids JSON:', parseError.message);
    if (typeof coursevidString === 'string') {
      return coursevidString.split(',').map(v => v.trim());
    }
    return [];
  }
}

// Session and activity management functions
function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function registerActivity(sessionId) {
  activeSessions.add(sessionId);
  lastActivity = Date.now();
  
  // Start keep-alive mechanism if we have active sessions and it's not already running
  if (activeSessions.size > 0 && !keepAliveInterval) {
    startKeepAlive();
  }
}

function removeSession(sessionId) {
  activeSessions.delete(sessionId);
  
  // If no active sessions, stop keep-alive after timeout
  if (activeSessions.size === 0) {
    setTimeout(() => {
      if (activeSessions.size === 0 && Date.now() - lastActivity > ACTIVITY_TIMEOUT) {
        stopKeepAlive();
      }
    }, ACTIVITY_TIMEOUT);
  }
}

function startKeepAlive() {
  if (keepAliveInterval) return; // Already running
  
  console.log('Starting database keep-alive mechanism');
  keepAliveInterval = setInterval(() => {
    // Check if we should stop keep-alive due to inactivity
    const inactiveTime = Date.now() - lastActivity;
    
    if (activeSessions.size === 0 && inactiveTime > ACTIVITY_TIMEOUT) {
      console.log('No active sessions detected, stopping keep-alive to let database sleep');
      stopKeepAlive();
      return;
    }
    
    // Send keep-alive ping
    if (activeSessions.size > 0) {
      console.log(`Sending keep-alive ping (${activeSessions.size} active sessions)`);
      db.query('SELECT 1 as keepalive', (err) => {
        if (err) {
          console.warn('Keep-alive ping failed:', err.message);
        }
      });
    }
  }, KEEP_ALIVE_INTERVAL);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    console.log('Stopping database keep-alive mechanism - database can sleep now');
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// Function to recursively list all files and folders
function listFiles(dir, prefix = '') {
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        listFiles(fullPath, prefix + '  ');
      }
    }
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

// Middleware to track API activity and refresh sessions
app.use('/api', (req, res, next) => {
  const sessionId = req.headers['x-session-id'] || req.body?.sessionId || req.query?.sessionId;
  
  if (sessionId && activeSessions.has(sessionId)) {
    registerActivity(sessionId);
  }
  
  next();
});

// Database handshake endpoint to wake up serverless database
app.get('/api/handshake', (req, res) => {
  console.log('Database handshake initiated...');
  
  // Generate session ID for this client
  const sessionId = generateSessionId();
  
  // Simple ping query to wake up the database
  const pingQuery = 'SELECT 1 as ping';
  
  db.query(pingQuery, (err, results) => {
    if (err) {
      console.error('Database handshake failed:', err);
      res.status(500).json({ 
        success: false, 
        error: 'Database handshake failed',
        message: 'Unable to connect to database. Please try again.'
      });
    } else {
      console.log('Database handshake successful');
      
      // Register this session as active
      registerActivity(sessionId);
      
      res.json({ 
        success: true, 
        message: 'Database is ready',
        sessionId: sessionId,
        timestamp: new Date().toISOString()
      });
    }
  });
});

// Session heartbeat endpoint to keep session alive
app.post('/api/heartbeat', (req, res) => {
  const { sessionId } = req.body;
  
  if (sessionId && activeSessions.has(sessionId)) {
    registerActivity(sessionId);
    res.json({ success: true, message: 'Session refreshed' });
  } else {
    res.status(400).json({ success: false, message: 'Invalid session' });
  }
});

// Session close endpoint
app.post('/api/session/close', (req, res) => {
  const { sessionId } = req.body;
  
  if (sessionId) {
    removeSession(sessionId);
    console.log(`Session ${sessionId} closed`);
    res.json({ success: true, message: 'Session closed' });
  } else {
    res.status(400).json({ success: false, message: 'No session ID provided' });
  }
});

// Server status endpoint (for monitoring)
app.get('/api/status', (req, res) => {
  res.json({
    activeSessions: activeSessions.size,
    lastActivity: new Date(lastActivity).toISOString(),
    keepAliveActive: !!keepAliveInterval,
    uptime: process.uptime()
  });
});

// API endpoint to get courses
app.get('/api/courses', (req, res) => {
  const query = 'SELECT id, coursename, coursepic, coursedesc, duration, coursevids, price FROM courses';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching courses:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      const parsedResults = results.map(course => {
        const coursevids = parseCoursevids(course.coursevids);
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
      const course = results[0];
      const coursevids = parseCoursevids(course.coursevids);
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
  const { email } = req.body;
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
  const { email } = req.body;
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
      } catch (parseError) {
        console.warn('Error parsing courses JSON:', parseError.message);
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
    } catch (parseError) {
      console.warn('Error parsing course IDs:', parseError.message);
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
        const coursevids = parseCoursevids(course.coursevids);
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
    } catch (parseError) {
      console.warn('Error parsing current courses:', parseError.message);
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

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

module.exports = app;
