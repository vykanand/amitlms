# LMS (Learning Management System)

A simple Learning Management System built with Node.js that hosts multiple websites under the `/public` directory and serves them dynamically.

## Features

- Course management with video support
- YouTube video metadata extraction and preview
- Google Drive video integration
- Admin dashboard for managing courses and users

## Video Metadata Format

Videos can be stored in two formats for backward compatibility:

### String Format (Legacy)

```json
"coursevids": [
  "https://www.youtube.com/watch?v=VIDEO_ID",
  "https://drive.google.com/file/d/FILE_ID/view?usp=sharing"
]
```

### Object Format (New)

```json
"coursevids": [
  {
    "url": "https://www.youtube.com/embed/VIDEO_ID",
    "title": "Video Title",
    "author": "Channel Name",
    "thumbnail": "https://img.youtube.com/vi/VIDEO_ID/0.jpg",
    "duration": "N/A"
  }
]
```

The system automatically fetches YouTube metadata using the oEmbed API when adding videos in the admin dashboard.

## Installation

1. Clone the repository
2. Run `npm install`
3. Start the server with `npm start`

## Usage

- Access the admin dashboard at `/dashboard.html`
- View courses at `/course.html?id=COURSE_ID`
