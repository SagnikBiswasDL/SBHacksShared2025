const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const session = require('express-session');
const multer = require('multer');
const sharp = require('sharp');
const { isPointWithinRadius } = require('geolib');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend')));


// Session middleware setup
app.use(
  session({
    secret: 'your-secret-key', // Replace with a strong secret
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false}, // Set to true if using HTTPS
  })
);

// Multer setup for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize OpenAI with your API key
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY // Store this in an environment variable
});

// Add this initialization code
const initializeDatabase = async () => {
  try {
    // Create sequences one by one with error handling
    const createSequence = async (sequenceName) => {
      try {
        await pool.query(`CREATE SEQUENCE IF NOT EXISTS ${sequenceName}`);
      } catch (err) {
        console.log(`Sequence ${sequenceName} might already exist:`, err.message);
      }
    };

    // Create all sequences
    await createSequence('users_id_seq');
    await createSequence('notifications_id_seq');
    await createSequence('posts_id_seq');
    await createSequence('comments_id_seq');
    await createSequence('messages_id_seq');
    await createSequence('location_data_id_seq');

    // Then create the users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY DEFAULT nextval('users_id_seq'),
        email VARCHAR(255) NOT NULL UNIQUE,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        profile_pic BYTEA,
        intro TEXT DEFAULT 'Hi! I''m using Hestia',
        connections INTEGER DEFAULT 0,
        posts INTEGER DEFAULT 0,
        connections_list TEXT[],
        name VARCHAR(255)
      );
    `);

    // Create notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY DEFAULT nextval('notifications_id_seq'),
        recipient_username VARCHAR(255) NOT NULL REFERENCES users(username),
        sender_username VARCHAR(255) NOT NULL REFERENCES users(username),
        message TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        action_type VARCHAR(50) NOT NULL
      );
    `);

    // Create posts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY DEFAULT nextval('posts_id_seq'),
        author_username VARCHAR(50) REFERENCES users(username),
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        media_url TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        likes_count INTEGER DEFAULT 0,
        edited_at TIMESTAMP,
        media BYTEA
      );
    `);

    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY DEFAULT nextval('messages_id_seq'),
        sender_username VARCHAR(50) NOT NULL REFERENCES users(username),
        recipient_username VARCHAR(50) NOT NULL REFERENCES users(username),
        message_text TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create location_data table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS location_data (
        id INTEGER PRIMARY KEY DEFAULT nextval('location_data_id_seq'),
        username VARCHAR(255) REFERENCES users(username),
        latitude NUMERIC(10,8),
        longitude NUMERIC(11,8),
        accuracy NUMERIC(10,2),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_latitude CHECK (latitude >= -90 AND latitude <= 90),
        CONSTRAINT valid_longitude CHECK (longitude >= -180 AND longitude <= 180)
      );
    `);

    // Create location_settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS location_settings (
        username VARCHAR(255) PRIMARY KEY REFERENCES users(username),
        is_enabled BOOLEAN DEFAULT false,
        sharing_mode VARCHAR(20) DEFAULT 'off',
        sharing_until TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add post_likes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS post_likes (
        post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
        username VARCHAR(50) REFERENCES users(username),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (post_id, username)
      );
    `);

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

// Call the initialization function when the server starts
initializeDatabase();

// Register endpoint
app.post('/register', async (req, res) => {
  const { email, username, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).send('Passwords do not match');
  }

  try {
    await pool.query(
      `INSERT INTO users (email, username, password, profile_pic, intro, connections, posts, connections_list) 
      VALUES ($1, $2, $3, NULL, $4, $5, $6, $7::text[])`,
      [email, username, password, 'Hi! I’m using Hestia', 0, 0, []]
    );
    res.status(201).send('User registered successfully');
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Error registering user');
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND password = $2',
      [username, password]
    );

    if (result.rows.length > 0) {
      req.session.username = username; // Save username in session
      res.status(200).json({ message: 'Login successful', username });
    } else {
      res.status(401).send('Invalid Username or Password');
    }
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Error logging in');
  }
});

// Fetch Profile Data
app.get('/api/get-profile', async (req, res) => {
  const username = req.query.username || req.session.username;
  
  if (!username) {
    return res.json({ success: false, message: 'Username is required' });
  }

  try {
    const result = await pool.query(
      'SELECT username, name, connections, posts, intro FROM users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length > 0) {
      const user = result.rows[0];
      res.json({
        success: true,
        username: user.username,
        name: user.name || '',
        connections: user.connections,
        posts: user.posts,
        intro: user.intro,
      });
    } else {
      res.json({ success: false, message: 'User not found' });
    }
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// Fetch Profile Picture
app.get('/api/profile-pic/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const result = await pool.query(
      'SELECT profile_pic FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0 || !result.rows[0].profile_pic) {
      return res.status(404).send('Profile picture not found.');
    }

    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(result.rows[0].profile_pic);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Error fetching profile picture.');
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Error logging out.');
    }
    res.status(200).send('Logged out successfully.');
  });
});

// Save Changes to Profile (Profile Picture Upload)
app.post('/api/edit-profile', upload.single('profile_pic'), async (req, res) => {
  if (!req.session.username) {
    return res.status(401).send('Unauthorized. Please log in.');
  }

  const username = req.session.username;
  const { name, intro } = req.body;
  let profilePicBuffer = null;

  try {
    if (req.file) {
      profilePicBuffer = await sharp(req.file.buffer)
        .resize(200, 200)
        .png()
        .toBuffer();
    }

    // Update user profile
    await pool.query(
      `UPDATE users SET name = $1, intro = $2${req.file ? ', profile_pic = $3' : ''} WHERE username = $4`,
      req.file ? [name, intro, profilePicBuffer, username] : [name, intro, username]
    );

    // Notify connections about the profile update
    const connectionsResult = await pool.query(
      'SELECT connections_list FROM users WHERE username = $1',
      [username]
    );
    const connections = connectionsResult.rows[0]?.connections_list || [];

    // Create notifications for all connections
    for (const connection of connections) {
      await pool.query(
        `INSERT INTO notifications (recipient_username, sender_username, message, action_type) 
         VALUES ($1, $2, $3, $4)`,
        [connection, username, `${username} has updated their profile`, 'profile_update']
      );
    }

    // Create notification for the user themselves
    await pool.query(
      `INSERT INTO notifications (recipient_username, sender_username, message, action_type) 
       VALUES ($1, $2, $3, $4)`,
      [username, username, 'You updated your profile', 'profile_update']
    );

    res.status(200).send('Profile updated successfully.');
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Error updating profile.');
  }
});

// Fetch Profile Picture (Serve as Circular Image)
app.get('/api/profile-pic/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const result = await pool.query(
      'SELECT profile_pic FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0 || !result.rows[0].profile_pic) {
      return res.status(404).send('Profile picture not found.');
    }

    const buffer = result.rows[0].profile_pic;

    // Return as circular image
    const circularImage = await sharp(buffer)
      .resize(200, 200)
      .png()
      .toBuffer();

    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(circularImage);
  } catch (err) {
    console.error('Error fetching profile picture:', err);
    res.status(500).send('Error fetching profile picture.');
  }
});

//Search features
app.get('/api/search-user', async (req, res) => {
    const username = req.query.username;
    try {
        const result = await pool.query(
            'SELECT username FROM users WHERE username ILIKE $1',
            [`%${username}%`]
        );
        if (result.rows.length > 0) {
            res.json({ success: true, username: result.rows[0].username });
        } else {
            res.json({ success: false, message: 'User not found' });
        }
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ success: false, error: 'Internal server error.' });
    }
});

// Create a notification (simplified without profile_pic)
app.post('/api/notifications', async (req, res) => {
  const { recipient, sender, message, actionType } = req.body;

  try {
    await pool.query(
      `INSERT INTO notifications (recipient_username, sender_username, message, action_type) 
       VALUES ($1, $2, $3, $4)`,
      [recipient, sender, message, actionType]
    );
    res.status(201).send('Notification created successfully');
  } catch (err) {
    console.error('Error creating notification:', err);
    res.status(500).send('Error creating notification');
  }
});

// Fetch notifications for a user (updated with JOIN)
app.get('/api/notifications/:username', async (req, res) => {
    const { username } = req.params;

    try {
        // Fetch notifications with sender's profile picture from users table
        const result = await pool.query(
            `SELECT n.id, n.sender_username, n.message, n.timestamp, n.action_type,
                    u.profile_pic as sender_profile_pic
             FROM notifications n
             LEFT JOIN users u ON n.sender_username = u.username
             WHERE n.recipient_username = $1 
             ORDER BY n.timestamp DESC`,
            [username]
        );
        
        // Transform the results
        const notifications = result.rows.map(notification => ({
            id: notification.id,
            sender_username: notification.sender_username,
            message: notification.message,
            timestamp: notification.timestamp,
            action_type: notification.action_type,
            profile_pic: notification.sender_profile_pic ? notification.sender_profile_pic.toString('base64') : null
        }));
        
        res.json(notifications);
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ error: 'Error fetching notifications' });
    }
});

// Handle connection requests (updated)
app.post('/api/connect', async (req, res) => {
  const { targetUsername } = req.body;
  const requesterUsername = req.session.username;

  if (!requesterUsername) {
    return res.status(401).send('Unauthorized. Please log in.');
  }

  try {
    // Create notification for the target user
    await pool.query(
      `INSERT INTO notifications (recipient_username, sender_username, message, action_type) 
       VALUES ($1, $2, $3, $4)`,
      [
        targetUsername,
        requesterUsername,
        `${requesterUsername} has requested to connect with you`,
        'connection_request'
      ]
    );

    res.status(200).json({ success: true, message: 'Connection request sent successfully' });
  } catch (err) {
    console.error('Error sending connection request:', err);
    res.status(500).json({ success: false, error: 'Error sending connection request' });
  }
});

// Handle connection request responses (Accept/Reject)
app.post('/api/connect/respond', async (req, res) => {
  const { requesterId, accepted } = req.body;
  const responderUsername = req.session.username;

  if (!responderUsername) {
    return res.status(401).send('Unauthorized. Please log in.');
  }

  try {
    // Start a transaction
    await pool.query('BEGIN');

    // Delete the original connection request notification
    await pool.query(
      `DELETE FROM notifications 
       WHERE sender_username = $1 
       AND recipient_username = $2 
       AND action_type = 'connection_request'`,
      [requesterId, responderUsername]
    );

    if (accepted) {
      // Update both users' connections_list
      await pool.query(
        `UPDATE users 
         SET connections_list = array_append(connections_list, $1),
             connections = connections + 1
         WHERE username = $2`,
        [requesterId, responderUsername]
      );

      await pool.query(
        `UPDATE users 
         SET connections_list = array_append(connections_list, $1),
             connections = connections + 1
         WHERE username = $2`,
        [responderUsername, requesterId]
      );
    }

    // Create response notification for both users
    const responderMessage = accepted 
      ? `You accepted ${requesterId}'s connection request`
      : `You declined ${requesterId}'s connection request`;
    
    const requesterMessage = accepted
      ? `${responderUsername} accepted your connection request`
      : `${responderUsername} declined your connection request`;

    // Add notification for responder
    await pool.query(
      `INSERT INTO notifications (recipient_username, sender_username, message, action_type) 
       VALUES ($1, $2, $3, $4)`,
      [
        responderUsername,
        responderUsername,
        responderMessage,
        accepted ? 'connection_accepted' : 'connection_declined'
      ]
    );

    // Add notification for requester
    await pool.query(
      `INSERT INTO notifications (recipient_username, sender_username, message, action_type) 
       VALUES ($1, $2, $3, $4)`,
      [
        requesterId,
        responderUsername,
        requesterMessage,
        accepted ? 'connection_accepted' : 'connection_declined'
      ]
    );

    await pool.query('COMMIT');

    res.status(200).json({ 
      success: true, 
      message: `Connection request ${accepted ? 'accepted' : 'declined'} successfully` 
    });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error responding to connection request:', err);
    res.status(500).json({ success: false, error: 'Error processing connection response' });
  }
});

// Add new endpoint to check connection status
app.get('/api/connection-status/:targetUsername', async (req, res) => {
    const requesterUsername = req.session.username;
    const { targetUsername } = req.params;  // Get targetUsername from URL parameters
    
    if (!requesterUsername) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Check if users are connected
        const connectedResult = await pool.query(
            `SELECT 1 FROM users 
             WHERE username = $1 
             AND $2 = ANY(connections_list)`,
            [requesterUsername, targetUsername]
        );
        
        if (connectedResult.rows.length > 0) {
            return res.json({ status: 'connected' });
        }

        // Check for pending requests
        const pendingResult = await pool.query(
            `SELECT 1 FROM notifications 
             WHERE sender_username = $1 
             AND recipient_username = $2 
             AND action_type = 'connection_request'`,
            [requesterUsername, targetUsername]
        );

        if (pendingResult.rows.length > 0) {
            return res.json({ status: 'requested' });
        }

        res.json({ status: 'none' });
    } catch (err) {
        console.error('Error checking connection status:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Fetch all chats for the current user
app.get('/api/chats', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        // Get unique users that the current user has exchanged messages with
        const result = await pool.query(
            `SELECT DISTINCT 
                CASE 
                    WHEN sender_username = $1 THEN recipient_username 
                    ELSE sender_username 
                END as username,
                MAX(timestamp) as last_message_time
            FROM messages 
            WHERE sender_username = $1 OR recipient_username = $1
            GROUP BY 
                CASE 
                    WHEN sender_username = $1 THEN recipient_username 
                    ELSE sender_username 
                END
            ORDER BY last_message_time DESC`,
            [req.session.username]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching chats:', err);
        res.status(500).json({ error: 'Error fetching chats' });
    }
});

// Fetch messages between current user and specified user
app.get('/api/messages/:username', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const otherUser = req.params.username;
    const currentUser = req.session.username;

    try {
        // First verify these users are connected
        const connectionCheck = await pool.query(
            `SELECT 1 FROM users 
             WHERE username = $1 
             AND $2 = ANY(connections_list)`,
            [currentUser, otherUser]
        );

        if (connectionCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Users are not connected' });
        }

        // Fetch messages between the two users
        const messages = await pool.query(
            `SELECT 
                id,
                sender_username,
                message_text,
                timestamp,
                sender_username = $1 as is_sender
            FROM messages 
            WHERE (sender_username = $1 AND recipient_username = $2)
               OR (sender_username = $2 AND recipient_username = $1)
            ORDER BY timestamp ASC`,
            [currentUser, otherUser]
        );

        res.json(messages.rows);
    } catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ error: 'Error fetching messages' });
    }
});

// Send a new message
app.post('/api/messages', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { recipient, message } = req.body;
    const sender = req.session.username;

    try {
        // Verify users are connected
        const connectionCheck = await pool.query(
            `SELECT 1 FROM users 
             WHERE username = $1 
             AND $2 = ANY(connections_list)`,
            [sender, recipient]
        );

        if (connectionCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Users are not connected' });
        }

        // Insert the new message
        await pool.query(
            `INSERT INTO messages (sender_username, recipient_username, message_text)
             VALUES ($1, $2, $3)`,
            [sender, recipient, message]
        );

        // Create a notification for the recipient
        await pool.query(
            `INSERT INTO notifications (recipient_username, sender_username, message, action_type)
             VALUES ($1, $2, $3, $4)`,
            [recipient, sender, `New message from ${sender}`, 'new_message']
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ error: 'Error sending message' });
    }
});

// Create a new post
app.post('/api/posts', upload.single('media'), async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { title, content } = req.body;
    let mediaBuffer = null;

    try {
        if (req.file) {
            mediaBuffer = await sharp(req.file.buffer)
                .resize(800) // Resize to max width of 800px
                .jpeg({ quality: 80 }) // Convert to JPEG and compress
                .toBuffer();
        }

        const result = await pool.query(
            `INSERT INTO posts (author_username, title, content, media, timestamp)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             RETURNING *`,
            [req.session.username, title, content, mediaBuffer]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating post:', err);
        res.status(500).json({ error: 'Error creating post' });
    }
});

// Get posts feed
app.get('/api/posts', async (req, res) => {
    const page = parseInt(req.query.page) || 0;
    const limit = 10;
    const offset = page * limit;

    try {
        const result = await pool.query(
            `SELECT p.*, 
                    CASE WHEN pl.username IS NOT NULL THEN true ELSE false END as user_liked,
                    encode(p.media, 'base64') as media
             FROM posts p
             LEFT JOIN post_likes pl ON p.id = pl.post_id AND pl.username = $1
             ORDER BY p.timestamp DESC
             LIMIT $2 OFFSET $3`,
            [req.session.username, limit, offset]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching posts:', err);
        res.status(500).json({ error: 'Error fetching posts' });
    }
});

// Update a post
app.put('/api/posts/:id', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;
    const { title, content } = req.body;

    try {
        // First check if the user owns the post
        const checkOwnership = await pool.query(
            'SELECT author_username FROM posts WHERE id = $1',
            [id]
        );

        if (checkOwnership.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }

        if (checkOwnership.rows[0].author_username !== req.session.username) {
            return res.status(403).json({ error: 'Not authorized to edit this post' });
        }

        // Update the post
        const result = await pool.query(
            `UPDATE posts 
             SET title = $1, 
                 content = $2,
                 edited_at = CURRENT_TIMESTAMP
             WHERE id = $3 
             RETURNING id, title, content, author_username, timestamp, edited_at, media`,
            [title, content, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }

        const updatedPost = result.rows[0];
        console.log('Updated post:', updatedPost); // Debug log

        res.json({ 
            success: true, 
            post: {
                ...updatedPost,
                timestamp: updatedPost.timestamp.toISOString(),
                edited_at: updatedPost.edited_at.toISOString()
            }
        });
    } catch (err) {
        console.error('Error updating post:', err);
        res.status(500).json({ error: 'Error updating post' });
    }
});

// Delete a post
app.delete('/api/posts/:id', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;

    try {
        // First check if the user owns the post
        const checkOwnership = await pool.query(
            'SELECT author_username FROM posts WHERE id = $1',
            [id]
        );

        if (checkOwnership.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }

        if (checkOwnership.rows[0].author_username !== req.session.username) {
            return res.status(403).json({ error: 'Not authorized to delete this post' });
        }

        // Delete the post
        await pool.query(
            'DELETE FROM posts WHERE id = $1 AND author_username = $2',
            [id, req.session.username]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting post:', err);
        res.status(500).json({ error: 'Error deleting post' });
    }
});

// Like/Unlike a post
app.post('/api/posts/:id/like', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;

    try {
        // Check if already liked
        const likeCheck = await pool.query(
            'SELECT 1 FROM post_likes WHERE post_id = $1 AND username = $2',
            [id, req.session.username]
        );

        if (likeCheck.rows.length > 0) {
            // Unlike
            await pool.query(
                'DELETE FROM post_likes WHERE post_id = $1 AND username = $2',
                [id, req.session.username]
            );
            await pool.query(
                'UPDATE posts SET likes_count = likes_count - 1 WHERE id = $1',
                [id]
            );
        } else {
            // Like
            await pool.query(
                'INSERT INTO post_likes (post_id, username) VALUES ($1, $2)',
                [id, req.session.username]
            );
            await pool.query(
                'UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1',
                [id]
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error toggling like:', err);
        res.status(500).json({ error: 'Error toggling like' });
    }
});

// Add a comment
app.post('/api/posts/:id/comments', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { id } = req.params;
    const { content } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO comments (post_id, author_username, content)
             VALUES ($1, $2, $3)
             RETURNING id, timestamp`,
            [id, req.session.username, content]
        );

        res.status(201).json({
            success: true,
            comment: result.rows[0]
        });
    } catch (err) {
        console.error('Error adding comment:', err);
        res.status(500).json({ error: 'Error adding comment' });
    }
});

// Get comments for a post
app.get('/api/posts/:id/comments', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `SELECT c.*, u.profile_pic
             FROM comments c
             JOIN users u ON c.author_username = u.username
             WHERE c.post_id = $1
             ORDER BY c.timestamp ASC`,
            [id]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching comments:', err);
        res.status(500).json({ error: 'Error fetching comments' });
    }
});

// Check if user can view posts
app.get('/api/can-view-posts/:username', async (req, res) => {
    if (!req.session.username) {
        return res.json({ canView: false });
    }

    const targetUsername = req.params.username;
    const currentUsername = req.session.username;

    try {
        // Allow if it's the user's own profile
        if (targetUsername === currentUsername) {
            return res.json({ canView: true });
        }

        // Check if users are connected
        const result = await pool.query(
            `SELECT 1 FROM users 
             WHERE username = $1 
             AND $2 = ANY(connections_list)`,
            [currentUsername, targetUsername]
        );

        res.json({ canView: result.rows.length > 0 });
    } catch (err) {
        console.error('Error checking post visibility:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user's posts
app.get('/api/user-posts/:username', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const targetUsername = req.params.username;
    const sortBy = req.query.sort || 'recent';
    
    try {
        // First check if user can view posts
        const canView = await checkViewPermission(req.session.username, targetUsername);
        if (!canView) {
            return res.status(403).json({ error: 'Not authorized to view posts' });
        }

        let orderClause;
        switch (sortBy) {
            case 'likes':
                orderClause = 'likes_count DESC';
                break;
            case 'comments':
                orderClause = 'comments_count DESC';
                break;
            case 'oldest':
                orderClause = 'timestamp ASC';
                break;
            default: // 'recent'
                orderClause = 'timestamp DESC';
        }

        const result = await pool.query(
            `SELECT p.*, 
                    (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count
             FROM posts p
             WHERE p.author_username = $1
             ORDER BY ${orderClause}`,
            [targetUsername]
        );

        res.json({ posts: result.rows });
    } catch (err) {
        console.error('Error fetching user posts:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Helper function to check view permission
async function checkViewPermission(currentUsername, targetUsername) {
    if (currentUsername === targetUsername) {
        return true;
    }

    const result = await pool.query(
        `SELECT 1 FROM users 
         WHERE username = $1 
         AND $2 = ANY(connections_list)`,
        [currentUsername, targetUsername]
    );

    return result.rows.length > 0;
}

// Update location settings
app.post('/api/location-settings', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { isEnabled, sharingMode } = req.body;
    const username = req.session.username;

    try {
        await pool.query(
            `INSERT INTO location_settings (username, is_enabled, sharing_mode, updated_at)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
             ON CONFLICT (username)
             DO UPDATE SET 
                is_enabled = $2,
                sharing_mode = $3,
                updated_at = CURRENT_TIMESTAMP`,
            [username, isEnabled, sharingMode]
        );

        // If disabling location sharing, clear existing location data
        if (!isEnabled) {
            await pool.query(
                'DELETE FROM location_data WHERE username = $1',
                [username]
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating location settings:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update user's location
app.post('/api/location', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const username = req.session.username;
    const { latitude, longitude, accuracy } = req.body;

    // Input validation
    if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: 'Missing location coordinates' });
    }

    // Validate coordinate ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: 'Invalid coordinates' });
    }

    try {
        await pool.query('BEGIN');

        // Delete old location data for this user
        await pool.query(
            'DELETE FROM location_data WHERE username = $1',
            [username]
        );

        // Insert new location
        await pool.query(
            `INSERT INTO location_data 
                (username, latitude, longitude, accuracy, timestamp)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
            [username, latitude, longitude, accuracy || null]
        );

        // Verify location settings exist and are enabled
        const settingsResult = await pool.query(
            `SELECT is_enabled, sharing_mode 
             FROM location_settings 
             WHERE username = $1`,
            [username]
        );

        // If no settings exist or sharing is disabled, create/update settings
        if (settingsResult.rows.length === 0) {
            await pool.query(
                `INSERT INTO location_settings 
                    (username, is_enabled, sharing_mode, updated_at)
                 VALUES ($1, true, 'always', CURRENT_TIMESTAMP)`,
                [username]
            );
        } else if (!settingsResult.rows[0].is_enabled) {
            await pool.query(
                `UPDATE location_settings 
                 SET is_enabled = true,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE username = $1`,
                [username]
            );
        }

        // Ensure self-permission exists
        await pool.query(
            `INSERT INTO location_sharing_permissions 
                (requester_username, target_username, is_approved)
             VALUES ($1, $1, true)
             ON CONFLICT (requester_username, target_username) 
             DO NOTHING`,
            [username]
        );

        await pool.query('COMMIT');

        res.json({ 
            success: true, 
            message: 'Location updated successfully'
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error updating location:', err);

        // Handle specific error cases
        if (err.constraint === 'valid_latitude') {
            return res.status(400).json({ error: 'Invalid latitude value' });
        }
        if (err.constraint === 'valid_longitude') {
            return res.status(400).json({ error: 'Invalid longitude value' });
        }

        res.status(500).json({ error: 'Server error while updating location' });
    }
});

// Get connected users' locations
app.get('/api/connected-users-locations', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const username = req.session.username;

    try {
        const result = await pool.query(
            `WITH latest_locations AS (
                SELECT DISTINCT ON (username) 
                    username, 
                    latitude, 
                    longitude, 
                    accuracy,
                    timestamp
                FROM location_data
                ORDER BY username, timestamp DESC
            )
            SELECT 
                l.*,
                u.profile_pic,
                ls.sharing_mode
            FROM latest_locations l
            JOIN users u ON l.username = u.username
            JOIN location_settings ls ON l.username = ls.username
            JOIN location_sharing_permissions lsp ON (
                lsp.requester_username = l.username AND 
                lsp.target_username = $1
            )
            WHERE (
                l.username = $1  -- Include user's own location
                OR (
                    ls.is_enabled = true
                    AND lsp.is_approved = true
                    AND (
                        ls.sharing_mode = 'always'
                        OR (ls.sharing_mode = 'timed' AND ls.sharing_until > CURRENT_TIMESTAMP)
                    )
                )
            )`,
            [username]
        );

        const locations = result.rows.map(row => ({
            ...row,
            profile_pic: row.profile_pic ? row.profile_pic.toString('base64') : null
        }));

        res.json(locations);
    } catch (err) {
        console.error('Error fetching locations:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get current user's location settings
app.get('/api/location-settings/current', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const result = await pool.query(
            'SELECT is_enabled, sharing_mode FROM location_settings WHERE username = $1',
            [req.session.username]
        );

        if (result.rows.length > 0) {
            res.json({
                success: true,
                isEnabled: result.rows[0].is_enabled,
                sharingMode: result.rows[0].sharing_mode
            });
        } else {
            // Default settings if none exist
            res.json({
                success: true,
                isEnabled: false,
                sharingMode: 'off'
            });
        }
    } catch (err) {
        console.error('Error fetching location settings:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get current user's profile picture
app.get('/api/current-user-profile', async (req, res) => {
    if (!req.session.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const result = await pool.query(
            'SELECT profile_pic FROM users WHERE username = $1',
            [req.session.username]
        );

        if (result.rows.length > 0 && result.rows[0].profile_pic) {
            res.json({
                success: true,
                profile_pic: result.rows[0].profile_pic.toString('base64')
            });
        } else {
            res.json({
                success: false,
                error: 'No profile picture found'
            });
        }
    } catch (err) {
        console.error('Error fetching user profile:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove connection or cancel request
app.post('/api/disconnect', async (req, res) => {
  const { targetUsername } = req.body;
  const requesterUsername = req.session.username;

  if (!requesterUsername) {
    return res.status(401).send('Unauthorized. Please log in.');
  }

  try {
    await pool.query('BEGIN');

    // Remove connection if exists
    await pool.query(
      `UPDATE users 
       SET connections_list = array_remove(connections_list, $1),
           connections = GREATEST(0, connections - 1)
       WHERE username = $2`,
      [targetUsername, requesterUsername]
    );

    await pool.query(
      `UPDATE users 
       SET connections_list = array_remove(connections_list, $1),
           connections = GREATEST(0, connections - 1)
       WHERE username = $2`,
      [requesterUsername, targetUsername]
    );

    // Remove any pending connection requests
    await pool.query(
      `DELETE FROM notifications 
       WHERE (sender_username = $1 AND recipient_username = $2 
              OR sender_username = $2 AND recipient_username = $1)
       AND action_type = 'connection_request'`,
      [requesterUsername, targetUsername]
    );

    await pool.query('COMMIT');
    res.status(200).json({ success: true, message: 'Connection removed successfully' });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error removing connection:', err);
    res.status(500).json({ success: false, error: 'Error removing connection' });
  }
});

// Get current user
app.get('/api/current-user', (req, res) => {
    if (req.session.username) {
        res.json({ username: req.session.username });
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

// Update this section in your server.js
app.post('/api/profile/update', async (req, res) => {
    try {
        const { username, name, intro } = req.body;
        const query = `
            UPDATE users 
            SET name = $1, 
                intro = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE username = $3
            RETURNING *`;
        
        const values = [
            name || '', // Ensure we pass empty string if null
            intro || '', // Ensure we pass empty string if null
            username
        ];
        
        const result = await pool.query(query, values);
        
        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        // Get current user's username from session
        const username = req.session.username;
        
        if (!username) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // Modified query to properly handle the array comparison
        const query = `
            SELECT DISTINCT 
                u.username,
                u.profile_pic as avatar
            FROM users u
            WHERE u.username = $1  -- Include current user
               OR $1 = ANY(u.connections_list)  -- Check if current user is in connections_list
            ORDER BY u.username ASC
        `;
        
        const result = await pool.query(query, [username]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add this endpoint to your existing server.js
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        // Fallback responses for sustainability-related queries
        const fallbackResponses = {
            default: "I can help you track your sustainability efforts. What would you like to know?",
            activities: {
                transport: "Great choice! Using public transportation or biking can significantly reduce your carbon footprint. Would you like to log this activity?",
                recycling: "Recycling helps reduce waste and conserve resources. I'll note down your recycling activity.",
                energy: "Reducing energy consumption is crucial. I'll record your energy-saving activity.",
                water: "Water conservation is important for sustainability. I'll log your water-saving effort.",
            }
        };

        // Simple keyword matching for relevant responses
        let reply = fallbackResponses.default;
        const lowercaseMessage = message.toLowerCase();

        if (lowercaseMessage.includes('transport') || lowercaseMessage.includes('car') || lowercaseMessage.includes('bus') || lowercaseMessage.includes('bike')) {
            reply = fallbackResponses.activities.transport;
        } else if (lowercaseMessage.includes('recycl') || lowercaseMessage.includes('waste')) {
            reply = fallbackResponses.activities.recycling;
        } else if (lowercaseMessage.includes('energy') || lowercaseMessage.includes('electricity')) {
            reply = fallbackResponses.activities.energy;
        } else if (lowercaseMessage.includes('water')) {
            reply = fallbackResponses.activities.water;
        }

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));

        res.json({
            success: true,
            reply: reply
        });
    } catch (error) {
        console.error('Error in chat endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));