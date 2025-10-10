# TODO: Implement YouTube Metadata Extraction and Preview in LMS

## Tasks

- [x] Modify public/dashboard.html to support YouTube video previews and metadata extraction
- [x] Update public/course.html to display videos using metadata objects instead of strings
- [x] Document the new video metadata format in README.md
- [x] Implementation complete - testing requires server startup and browser interaction

## Details

- In dashboard.html, add a preview section that appears when pasting YouTube URLs
- Use YouTube oEmbed API to fetch title, author, thumbnail, and other metadata
- Store videos as array of objects: {url, title, author, thumbnail, duration, ...}
- Update course.html to use real metadata for display
- Ensure backward compatibility if existing courses have string arrays
