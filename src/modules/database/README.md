# Database Module

This module provides PostgreSQL database integration for the WhatsApp Agent, working with your existing database schema including `candidates`, `appointments`, `n8n_chat_histories`, and `job` tables.

## Setup

### 1. Environment Variables

Add these PostgreSQL configuration variables to your `.env` file:

```bash
# PostgreSQL Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/your_database_name
# OR use individual parameters:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=postgres
DB_PASSWORD=your_password
```

### 2. Existing Database Schema

This module works with your existing tables:
- `candidates` - User/candidate information
- `appointments` - Appointment scheduling
- `n8n_chat_histories` - Chat message history
- `job` - Job/task tracking

## Usage

### Basic Candidate Data Retrieval

```typescript
import { getUserData } from '../database/index.js';

// Get candidate data by WhatsApp ID
const candidateData = await getUserData('1234567890');

if (candidateData) {
  console.log(`Candidate: ${candidateData.name} (${candidateData.email})`);
  console.log(`Phone: ${candidateData.phone}`);
  console.log(`Connected: ${candidateData.connected}`);
} else {
  console.log('Candidate not found');
}
```

### Complete Candidate Data with Appointments, Chat History, and Jobs

```typescript
import { getUserComplete } from '../database/index.js';

// Get candidate with appointments, chat history, and jobs
const completeCandidate = await getUserComplete('1234567890', 9);

if (completeCandidate) {
  console.log(`Candidate: ${completeCandidate.name}`);
  console.log(`Appointments: ${completeCandidate.appointments.length}`);
  console.log(`Chat messages: ${completeCandidate.chat_history.length}`);
  console.log(`Jobs: ${completeCandidate.jobs.length}`);
}
```

### Create or Update Candidate

```typescript
import { createOrUpdateUser } from '../database/index.js';

const candidateData = await createOrUpdateUser('1234567890', {
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  phone: '+1234567890',
  connected: true
});
```

### Save Chat Messages

```typescript
import { saveChatMessage } from '../database/index.js';

// Save incoming message to chat history
await saveChatMessage(
  'candidate_uuid',       // session_id (candidate ID)
  {
    role: 'user',
    content: 'Hello, I need help',
    timestamp: new Date().toISOString(),
    wa_message_id: 'msg_123'
  }
);
```

## Your Existing Database Schema

### Candidates Table

- `id` - UUID primary key
- `first_name` - Candidate's first name
- `last_name` - Candidate's last name  
- `phone` - Phone number
- `email` - Email address
- `birth_date` - Date of birth
- `street_name`, `street_number` - Address components
- `city_cap_id` - City/postal code reference
- `cap` - Postal code
- `wa_id` - WhatsApp ID (phone number) - **Key field for lookups**
- `connected` - Boolean flag indicating WhatsApp connection status
- `created_at`, `updated_at` - Timestamps

### Appointments Table

- `id` - UUID primary key
- `candidate_id` - Reference to candidate (text, not foreign key)
- `status` - Appointment status
- `start_time`, `end_time` - Appointment scheduling
- `google_event_id` - Google Calendar integration
- `created_at` - Creation timestamp

### N8N Chat Histories Table

- `id` - Serial primary key
- `session_id` - Session identifier (typically candidate ID)
- `message` - JSONB field containing message data

### Job Table

- `id` - BigInt primary key
- `candidate_id` - Reference to candidate
- `type` - Job type
- `status` - Job status
- `step` - Current step in job process
- `created_at` - Creation timestamp

## Error Handling

The database functions include comprehensive error handling:

- Connection failures are logged and thrown
- Query errors include the actual query and parameters
- Missing users return `null` instead of throwing errors
- Non-critical operations (like updating `last_contact_at`) don't throw errors

## Performance Features

- Connection pooling with configurable pool size
- Indexed queries for fast lookups
- JSONB fields for flexible metadata storage
- Denormalized `wa_id` in related tables for efficient queries
- Automatic timestamp updates
