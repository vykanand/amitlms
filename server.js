const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();
const port = 3002;

// Define the base public directory
const publicDir = path.join(__dirname, "public");

// Function to recursively list all files and folders
function listFiles(dir, prefix = '') {
  try {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      console.log(prefix + item);
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

// Catch-all route for undefined paths
app.get("*", (req, res) => {
  // res.status(404).send("Website not found!");
  res.redirect("/lander");
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
