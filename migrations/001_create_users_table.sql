-- Create users table for WhatsApp Agent
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    wa_id VARCHAR(50) UNIQUE NOT NULL, -- WhatsApp ID (phone number)
    name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_contact_at TIMESTAMP,
    
    -- User preferences and metadata (stored as JSON)
    preferences JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    
    -- Status and flags
    is_active BOOLEAN DEFAULT true,
    is_blocked BOOLEAN DEFAULT false,
    
    -- Business relationship
    customer_type VARCHAR(20) DEFAULT 'lead' CHECK (customer_type IN ('lead', 'prospect', 'customer', 'vip')),
    tags JSONB DEFAULT '[]'
);

-- Create appointments table
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    wa_id VARCHAR(50) NOT NULL, -- Denormalized for easier queries
    title VARCHAR(255) NOT NULL,
    description TEXT,
    duration_minutes INTEGER DEFAULT 60,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show')),
    location VARCHAR(255),
    meeting_type VARCHAR(20) DEFAULT 'video_call' CHECK (meeting_type IN ('in_person', 'video_call', 'phone_call')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Meeting details
    meeting_url VARCHAR(500),
    calendar_event_id VARCHAR(255),
    reminders_sent INTEGER DEFAULT 0,
    notes TEXT
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    wa_id VARCHAR(50) NOT NULL, -- Denormalized for easier queries
    message_id VARCHAR(255) UNIQUE NOT NULL, -- WhatsApp message ID
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'location')),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    timestamp TIMESTAMP DEFAULT NOW(),
    
    -- Message metadata
    metadata JSONB DEFAULT '{}',
    processed_by_ai BOOLEAN DEFAULT false,
    ai_response_id INTEGER -- Reference to the AI response message
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_wa_id ON users(wa_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_last_contact ON users(last_contact_at);

CREATE INDEX IF NOT EXISTS idx_appointments_wa_id ON appointments(wa_id);
CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(wa_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);

-- Add some sample data for testing
INSERT INTO users (wa_id, name, email, customer_type, is_active) 
VALUES 
    ('1234567890', 'Test User', 'test@example.com', 'lead', true),
    ('0987654321', 'Jane Doe', 'jane@example.com', 'customer', true)
ON CONFLICT (wa_id) DO NOTHING;
