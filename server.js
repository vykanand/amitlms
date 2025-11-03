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

// Database connection pool
const db = mysql.createPool({
  host: "junction.proxy.rlwy.net",
  user: "root",
  password: "cyIgFzjjbzRiVbiHkemiUCKftdfPqBOn",
  database: "amit",
  port: 14359,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection on startup
db.getConnection((err, connection) => {
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
      \`tests\` text,
      \`purchaseblob\` BLOB,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf16`;
    db.query(createUsersTableQuery, (err) => {
      if (err) {
        console.error('Error creating users table:', err);
      } else {
        console.log('Table users created or already exists');

      }
    });

    // Ensure tests table exists with verification logging
    const verifyTestsTable = () => {
      db.query("SHOW TABLES LIKE 'tests'", (checkErr, rows) => {
        if (checkErr) {
          console.error('Error checking tests table existence:', checkErr);
          return;
        }
        if (Array.isArray(rows) && rows.length > 0) {
          console.log('Verified: tests table exists');
          return;
        }
        // Not found, attempt to create
        const createTestsTableQuery = `CREATE TABLE IF NOT EXISTS \`tests\` (
          \`id\` int NOT NULL AUTO_INCREMENT,
          \`title\` text,
          \`description\` text,
          \`price\` DECIMAL(10,2) DEFAULT 0,
          \`image\` TEXT,
          \`questions\` TEXT,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf16`;
        db.query(createTestsTableQuery, (createErr) => {
          if (createErr) {
            console.error('Error creating tests table:', createErr);
            return;
          }
          // Re-check after creation
          db.query("SHOW TABLES LIKE 'tests'", (recheckErr, recheckRows) => {
            if (recheckErr) {
              console.error('Error verifying tests table after creation:', recheckErr);
            } else if (Array.isArray(recheckRows) && recheckRows.length > 0) {
              console.log('Success: tests table created');
            } else {
              console.warn('Verification failed: tests table not found after creation. Check DB user privileges and active database name.');
            }
          });
        });
      });
    };
    verifyTestsTable();


    // Add testsession column to users table (check if exists first)
    const checkTestSessionColumnQuery = `SHOW COLUMNS FROM users LIKE 'testsession'`;
    db.query(checkTestSessionColumnQuery, (checkErr, columns) => {
      if (checkErr) {
        console.error('Error checking testsession column:', checkErr);
        return;
      }
      if (columns.length === 0) {
        // Column doesn't exist, add it as LONGTEXT for JSON data
        const addColumnQuery = `ALTER TABLE users ADD COLUMN testsession LONGTEXT`;
        db.query(addColumnQuery, (addErr) => {
          if (addErr) {
            console.error('Error adding testsession column:', addErr);
          } else {
            console.log('testsession column added to users table');
            // Set default value for existing rows
            const setDefaultQuery = `UPDATE users SET testsession = '{}' WHERE testsession IS NULL`;
            db.query(setDefaultQuery, (defaultErr) => {
              if (defaultErr) {
                console.error('Error setting default testsession:', defaultErr);
              } else {
                console.log('Default testsession set for existing users');
              }
            });
          }
        });
      } else {
        console.log('testsession column already exists');
      }
    });

    // Add tests column to users table (check if exists first)
    const checkTestsColumnQuery = `SHOW COLUMNS FROM users LIKE 'tests'`;
    db.query(checkTestsColumnQuery, (checkErr, columns) => {
      if (checkErr) {
        console.error('Error checking tests column:', checkErr);
        return;
      }

      if (columns.length === 0) {
        // Column doesn't exist, add it as TEXT for JSON array
        const addTestsColumnQuery = `ALTER TABLE users ADD COLUMN tests TEXT`;
        db.query(addTestsColumnQuery, (addErr) => {
          if (addErr) {
            console.error('Error adding tests column:', addErr);
          } else {
            console.log('tests column added to users table');
            // Set default value for existing rows
            const setDefaultQuery = `UPDATE users SET tests = '[]' WHERE tests IS NULL`;
            db.query(setDefaultQuery, (defaultErr) => {
              if (defaultErr) {
                console.error('Error setting default tests:', defaultErr);
              } else {
                console.log('Default tests set for existing users');
              }
            });
          }
        });
      } else {
        console.log('tests column already exists');
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

// Middleware to parse JSON and handle large payloads
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

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
  
  db.query(pingQuery, (err) => {
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

// Helper to safely parse tests.questions JSON
function parseQuestions(qstr) {
  try {
    return JSON.parse(qstr || '[]');
  } catch (e) {
    console.warn('Error parsing questions JSON:', e.message);
    if (typeof qstr === 'string' && qstr.trim().startsWith('[')) return [];
    return [];
  }
}

// Tests API endpoints
// GET all test series
app.get('/api/tests', (req, res) => {
  console.log('[API]/api/tests GET enter');
  const sql = 'SELECT id, title, description, price, image, questions FROM tests ORDER BY id DESC';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('[API]/api/tests GET error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    const parsed = (results || []).map(r => ({ ...r, questions: parseQuestions(r.questions) }));
    console.log('[API]/api/tests GET ok count:', parsed.length);
    res.json(parsed);
  });
});

// GET single test series by id
app.get('/api/tests/:id', (req, res) => {
  const { id } = req.params;
  console.log('[API]/api/tests/:id GET enter', { id });
  const sql = 'SELECT id, title, description, price, image, questions FROM tests WHERE id = ?';
  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error('[API]/api/tests/:id GET error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!results || results.length === 0) return res.status(404).json({ error: 'Test not found' });
    const t = results[0];
    res.json({ ...t, questions: parseQuestions(t.questions) });
  });
});

// CREATE test series
app.post('/api/tests', (req, res) => {
  const { title, description, price, questions, imageUrl } = req.body || {};
  console.log('[API]/api/tests POST enter', { title, price, qCount: Array.isArray(questions) ? questions.length : 0 });
  const sql = 'INSERT INTO tests (title, description, price, image, questions) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [title, description, price || 0, imageUrl || null, JSON.stringify(questions || [])], (err, result) => {
    if (err) {
      console.error('[API]/api/tests POST error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ id: result.insertId, title, description, price: price || 0, image: imageUrl || null, questions: questions || [] });
  });
});

// UPDATE test series
app.put('/api/tests/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, price, questions, imageUrl } = req.body || {};
  console.log('[API]/api/tests/:id PUT enter', { id, title, price, qCount: Array.isArray(questions) ? questions.length : 0 });
  const sql = 'UPDATE tests SET title = ?, description = ?, price = ?, image = ?, questions = ? WHERE id = ?';
  db.query(sql, [title, description, price || 0, imageUrl || null, JSON.stringify(questions || []), id], (err) => {
    if (err) {
      console.error('[API]/api/tests/:id PUT error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ id, title, description, price: price || 0, image: imageUrl || null, questions: questions || [] });
  });
});

// DELETE test series
app.delete('/api/tests/:id', (req, res) => {
  const { id } = req.params;
  console.log('[API]/api/tests/:id DELETE enter', { id });
  const sql = 'DELETE FROM tests WHERE id = ?';
  db.query(sql, [id], (err) => {
    if (err) {
      console.error('[API]/api/tests/:id DELETE error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Test deleted' });
  });
});

// API endpoint to get user's test session
app.get('/api/user/testsession', (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: 'Phone required' });
  }
  const query = 'SELECT testsession FROM users WHERE phone = ?';
  db.query(query, [phone], (err, results) => {
    if (err) {
      console.error('Error fetching user testsession:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    let session = {};
    try {
      session = JSON.parse(results[0].testsession || '{}');
    } catch (parseError) {
      console.warn('Error parsing testsession JSON:', parseError.message);
      session = {};
    }
    res.json(session);
  });
});

// API endpoint to save user's test session
app.post('/api/user/testsession', (req, res) => {
  const { phone, testsession } = req.body;
  if (!phone || !testsession) {
    return res.status(400).json({ error: 'Phone and testsession required' });
  }

  // Get current user testsession to merge with existing data
  const getQuery = 'SELECT testsession FROM users WHERE phone = ?';
  db.query(getQuery, [phone], (err, results) => {
    if (err) {
      console.error('Error fetching user testsession:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    let currentSession = {};
    try {
      currentSession = JSON.parse(results[0].testsession || '{}');
    } catch (parseError) {
      console.warn('Error parsing current testsession JSON:', parseError.message);
      currentSession = {};
    }

    // Merge the new session data with existing data
    const updatedSession = { ...currentSession, ...testsession };

    // Update the database
    const updateQuery = 'UPDATE users SET testsession = ? WHERE phone = ?';
    db.query(updateQuery, [JSON.stringify(updatedSession), phone], (updateErr) => {
      if (updateErr) {
        console.error('Error updating testsession:', updateErr);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Test session saved successfully' });
    });
  });
});

// API endpoint to grade descriptive questions
app.post('/api/user/grade-descriptive', (req, res) => {
  const { phone, testId, questionIndex, score } = req.body;
  if (!phone || !testId || questionIndex === undefined || score === undefined) {
    return res.status(400).json({ error: 'Phone, testId, questionIndex, and score required' });
  }

  // Get current user testsession
  const getQuery = 'SELECT testsession FROM users WHERE phone = ?';
  db.query(getQuery, [phone], (err, results) => {
    if (err) {
      console.error('Error fetching user testsession:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    let session = {};
    try {
      session = JSON.parse(results[0].testsession || '{}');
    } catch (parseError) {
      console.warn('Error parsing testsession JSON:', parseError.message);
      session = {};
    }

    // Initialize descriptive scores if not exists
    if (!session[testId]) {
      session[testId] = { answers: {}, currentIndex: 0, descriptiveScores: {} };
    }
    if (!session[testId].descriptiveScores) {
      session[testId].descriptiveScores = {};
    }

    // Save the score
    session[testId].descriptiveScores[questionIndex] = parseFloat(score);

    // Update the database
    const updateQuery = 'UPDATE users SET testsession = ? WHERE phone = ?';
    db.query(updateQuery, [JSON.stringify(session), phone], (updateErr) => {
      if (updateErr) {
        console.error('Error updating descriptive scores:', updateErr);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Descriptive question graded successfully', score: parseFloat(score) });
    });
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
  db.query(query, [coursename, coursepic, coursedesc, duration, JSON.stringify(coursevids), price, id], (err) => {
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
  db.query(query, [id], (err) => {
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
  const query = 'SELECT id, phone as name, phone as email, \'student\' as role, purchaseblob FROM users';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching users:', err);
      res.status(500).json({ error: 'Database error' });
    } else {
      // Convert BLOB to base64 for image display
      const usersWithImages = results.map(user => ({
        ...user,
        purchaseblob: user.purchaseblob ? `data:image/png;base64,${user.purchaseblob.toString('base64')}` : null
      }));
      res.json(usersWithImages);
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
  db.query(query, [email, id], (err) => {
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
  db.query(query, [id], (err) => {
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
  const query = 'SELECT phone, password, paid, course, tests FROM users WHERE phone = ? AND password = ?';
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
      // Parse tests JSON
      let tests = [];
      try {
        tests = JSON.parse(user.tests || '[]');
      } catch (parseError) {
        console.warn('Error parsing tests JSON:', parseError.message);
        tests = [];
      }
      res.json({
        phone: user.phone,
        paid: user.paid,
        courses: courses,
        tests: tests
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
  const insertQuery = 'INSERT INTO users (phone, password, paid, course, tests) VALUES (?, ?, ?, ?, ?)';
  db.query(insertQuery, [phone, password, 'no', '[]', '[]'], (err) => {
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

// API endpoint to get user's tests
app.get('/api/user/tests', (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: 'Phone required' });
  }
  const query = 'SELECT tests FROM users WHERE phone = ?';
  db.query(query, [phone], (err, results) => {
    if (err) {
      console.error('Error fetching user tests:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    let testIds = [];
    try {
      testIds = JSON.parse(results[0].tests || '[]');
    } catch (parseError) {
      console.warn('Error parsing test IDs:', parseError.message);
      testIds = [];
    }
    if (testIds.length === 0) {
      return res.json([]);
    }
    // Fetch tests details
    const placeholders = testIds.map(() => '?').join(',');
    const testsQuery = `SELECT id, title, description, price, image, questions FROM tests WHERE id IN (${placeholders})`;
    db.query(testsQuery, testIds, (err, tests) => {
      if (err) {
        console.error('Error fetching tests:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      const parsedTests = tests.map(test => {
        const questions = parseQuestions(test.questions);
        return { ...test, questions };
      });
      res.json(parsedTests);
    });
  });
});

// API endpoint to get user's purchase history
app.get('/api/user/purchases', (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: 'Phone required' });
  }
  const query = 'SELECT purchase_history FROM users WHERE phone = ?';
  db.query(query, [phone], (err, results) => {
    if (err) {
      console.error('Error fetching user purchase history:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    let history = [];
    try {
      history = JSON.parse(results[0].purchase_history || '[]');
    } catch (parseError) {
      console.warn('Error parsing purchase history JSON:', parseError.message);
      history = [];
    }
    res.json(history);
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
    db.query(updateQuery, [JSON.stringify(updatedCourses), phone], (err) => {
      if (err) {
        console.error('Error updating user courses:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Courses added successfully', courses: updatedCourses });
    });
  });
});

// API endpoint to add tests to user
app.post('/api/user/tests', (req, res) => {
  const { phone, tests } = req.body;
  if (!phone || !tests || !Array.isArray(tests)) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  // First, get current tests
  const selectQuery = 'SELECT tests FROM users WHERE phone = ?';
  db.query(selectQuery, [phone], (err, results) => {
    if (err) {
      console.error('Error fetching user:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    let currentTests = [];
    try {
      currentTests = JSON.parse(results[0].tests || '[]');
    } catch (parseError) {
      console.warn('Error parsing current tests:', parseError.message);
      currentTests = [];
    }
    // Add new tests if not already present
    const updatedTests = [...new Set([...currentTests, ...tests])];
    const updateQuery = 'UPDATE users SET tests = ? WHERE phone = ?';
    db.query(updateQuery, [JSON.stringify(updatedTests), phone], (err) => {
      if (err) {
        console.error('Error updating user tests:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Tests added successfully', tests: updatedTests });
    });
  });
});

// API endpoint to submit purchase with screenshot
app.post('/api/submit-purchase', (req, res) => {
  const { phone, amount, orderId, screenshot, cartItems } = req.body;
  if (!phone || !amount || !orderId || !screenshot || !cartItems) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Fetch item details to include names
  const courseIds = cartItems.filter(item => item.type === 'course').map(item => item.id);
  const testIds = cartItems.filter(item => item.type === 'test').map(item => item.id);

  let courseDetails = [];
  let testDetails = [];

  // Fetch course details
  if (courseIds.length > 0) {
    const courseQuery = `SELECT id, coursename as name FROM courses WHERE id IN (${courseIds.map(() => '?').join(',')})`;
    db.query(courseQuery, courseIds, (err, results) => {
      if (err) {
        console.error('Error fetching course details:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      courseDetails = results;
      checkAndCreateRecord();
    });
  } else {
    checkAndCreateRecord();
  }

  function checkAndCreateRecord() {
    // Fetch test details
    if (testIds.length > 0) {
      const testQuery = `SELECT id, title as name FROM tests WHERE id IN (${testIds.map(() => '?').join(',')})`;
      db.query(testQuery, testIds, (err, results) => {
        if (err) {
          console.error('Error fetching test details:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        testDetails = results;
        createRecord();
      });
    } else {
      createRecord();
    }
  }

  function createRecord() {
    // Add names to cartItems
    const itemsWithNames = cartItems.map(item => {
      let name = '';
      if (item.type === 'course') {
        const course = courseDetails.find(c => c.id == item.id);
        name = course ? course.name : 'Unknown Course';
      } else if (item.type === 'test') {
        const test = testDetails.find(t => t.id == item.id);
        name = test ? test.name : 'Unknown Test';
      }
      return { ...item, name };
    });

    // Create purchase record
    const purchaseRecord = {
      orderId,
      amount: parseFloat(amount),
      items: itemsWithNames,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    // Get current user data
    const getUserQuery = 'SELECT purchase_history FROM users WHERE phone = ?';
    db.query(getUserQuery, [phone], (err, results) => {
      if (err) {
        console.error('Error fetching user data:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = results[0];
      let history = [];

      if (user.purchase_history) {
        try {
          history = JSON.parse(user.purchase_history);
        } catch (e) {
          history = [];
        }
      }

      // Add new purchase to history (wait for admin approval)
      history.push(purchaseRecord);

      // Update user data (only purchase_history)
      const updateQuery = 'UPDATE users SET purchase_history = ? WHERE phone = ?';
      db.query(updateQuery, [JSON.stringify(history), phone], (updateErr) => {
        if (updateErr) {
          console.error('Error updating user data:', updateErr);
          return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'Purchase submitted for verification' });
      });
    });
  }
});

// API endpoint to approve/reject purchase
app.post('/api/approve-purchase', (req, res) => {
  const { phone, orderId, approved } = req.body;
  if (!phone || !orderId || approved === undefined) {
    return res.status(400).json({ error: 'Phone, orderId, and approved status required' });
  }

  // Get current user data
  const getUserQuery = 'SELECT course, tests, purchase_history FROM users WHERE phone = ?';
  db.query(getUserQuery, [phone], (err, results) => {
    if (err) {
      console.error('Error fetching user data:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = results[0];

    // Parse existing arrays
    let courses = [];
    let tests = [];
    let history = [];

    if (typeof user.course === 'string') {
      courses = JSON.parse(user.course || '[]');
    } else {
      courses = user.course || [];
    }

    if (typeof user.tests === 'string') {
      tests = JSON.parse(user.tests || '[]');
    } else {
      tests = user.tests || [];
    }

    if (user.purchase_history) {
      try {
        history = JSON.parse(user.purchase_history);
      } catch (e) {
        history = [];
      }
    }

    // Find and update the purchase
    const purchaseIndex = history.findIndex(p => p.orderId === orderId);
    if (purchaseIndex === -1) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    history[purchaseIndex].status = approved ? 'approved' : 'rejected';

    // If approved, add items to user arrays
    if (approved) {
      history[purchaseIndex].items.forEach(item => {
        if (item.type === 'course') {
          courses.push(item.id);
        } else if (item.type === 'test') {
          tests.push(item.id);
        }
      });
    }

    // Update user data
    const updateQuery = 'UPDATE users SET course = ?, tests = ?, purchase_history = ? WHERE phone = ?';
    db.query(updateQuery, [JSON.stringify(courses), JSON.stringify(tests), JSON.stringify(history), phone], (updateErr) => {
      if (updateErr) {
        console.error('Error updating user data:', updateErr);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: `Purchase ${approved ? 'approved' : 'rejected'} successfully` });
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
