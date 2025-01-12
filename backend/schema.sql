-- Create sequences
CREATE SEQUENCE users_id_seq;
CREATE SEQUENCE posts_id_seq;
CREATE SEQUENCE comments_id_seq;
CREATE SEQUENCE notifications_id_seq;
CREATE SEQUENCE messages_id_seq;
CREATE SEQUENCE location_data_id_seq;

-- Create sequence for activities
CREATE SEQUENCE IF NOT EXISTS activities_id_seq;

-- Create users table
CREATE TABLE users (
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

-- Create posts table
CREATE TABLE posts (
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

-- Create comments table
CREATE TABLE comments (
    id INTEGER PRIMARY KEY DEFAULT nextval('comments_id_seq'),
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    author_username VARCHAR(50) REFERENCES users(username),
    content TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create notifications table
CREATE TABLE notifications (
    id INTEGER PRIMARY KEY DEFAULT nextval('notifications_id_seq'),
    recipient_username VARCHAR(255) NOT NULL REFERENCES users(username),
    sender_username VARCHAR(255) NOT NULL REFERENCES users(username),
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    action_type VARCHAR(50) NOT NULL
);

-- Create messages table
CREATE TABLE messages (
    id INTEGER PRIMARY KEY DEFAULT nextval('messages_id_seq'),
    sender_username VARCHAR(50) NOT NULL REFERENCES users(username),
    recipient_username VARCHAR(50) NOT NULL REFERENCES users(username),
    message_text TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create location_data table
CREATE TABLE location_data (
    id INTEGER PRIMARY KEY DEFAULT nextval('location_data_id_seq'),
    username VARCHAR(255) REFERENCES users(username),
    latitude NUMERIC(10,8),
    longitude NUMERIC(11,8),
    accuracy NUMERIC(10,2),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_latitude CHECK (latitude >= -90 AND latitude <= 90),
    CONSTRAINT valid_longitude CHECK (longitude >= -180 AND longitude <= 180)
);

-- Create location_settings table
CREATE TABLE location_settings (
    username VARCHAR(255) PRIMARY KEY REFERENCES users(username),
    is_enabled BOOLEAN DEFAULT false,
    sharing_mode VARCHAR(20) DEFAULT 'off',
    sharing_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create location_sharing_permissions table
CREATE TABLE location_sharing_permissions (
    requester_username VARCHAR(255) REFERENCES users(username),
    target_username VARCHAR(255) REFERENCES users(username),
    is_approved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (requester_username, target_username)
);

-- Create post_likes table
CREATE TABLE post_likes (
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    username VARCHAR(50) REFERENCES users(username),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, username)
);

-- Create activities table
CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY DEFAULT nextval('activities_id_seq'),
    username VARCHAR(255) REFERENCES users(username),
    activity_type VARCHAR(50) NOT NULL,
    carbon_reduced NUMERIC(10,2) DEFAULT 0,
    points INTEGER DEFAULT 0,
    description TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified BOOLEAN DEFAULT false
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_activities_username ON activities(username);

-- Create view for leaderboard calculations
CREATE OR REPLACE VIEW leaderboard_stats AS
SELECT 
    u.username,
    u.profile_pic as avatar,
    COALESCE(SUM(a.carbon_reduced), 0) as carbon_reduced,
    COALESCE(SUM(a.points), 0) as score
FROM users u
LEFT JOIN activities a ON u.username = a.username
GROUP BY u.username, u.profile_pic;

-- Insert some sample activity types (optional)
INSERT INTO activities (username, activity_type, carbon_reduced, points, description)
VALUES 
    ('testuser', 'public_transport', 2.5, 25, 'Used public transport instead of driving'),
    ('testuser', 'recycling', 1.0, 10, 'Recycled household waste'),
    ('testuser', 'energy_saving', 3.0, 30, 'Used energy-efficient appliances')
ON CONFLICT DO NOTHING; 