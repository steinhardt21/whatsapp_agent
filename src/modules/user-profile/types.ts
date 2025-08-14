/**
 * User Profile System Types
 * 
 * Persistent user data stored in Redis for maintaining user information
 * across conversations and sessions.
 */

export interface UserProfile {
  // Core identification
  phoneNumber: string;
  whatsappId?: string;
  
  // Personal information
  name?: string;        // Full name
  email?: string;
  
  // Business relationship
  interestLevel: InterestLevel;
  serviceInterests: string[]; // e.g., ["digital marketing", "web development", "AI consulting"]
  
  // Meeting information
  currentAppointment?: AppointmentInfo;
  appointmentHistory: AppointmentInfo[];
  
  // Conversation history (max 49 messages)
  conversationHistory: ConversationMessage[];
  lastMessageAt: Date;
  
  // System metadata
  createdAt: Date;
  updatedAt: Date;
  lastContactAt: Date;
  totalConversations: number;
  expiresAt: Date; // TTL for 1 week
  
  // Profile completion status
  isComplete: boolean;
  completionPercentage: number;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  messageId?: string; // WhatsApp message ID if applicable
}

export interface AppointmentInfo {
  // Google Calendar integration
  eventId?: string;           // Calendar event ID from MCP server
  googleCalendarId?: string;  // Google Calendar event ID for direct API access
  calendarEventUrl?: string;  // Google Calendar event URL
  
  title: string;
  description?: string;
  scheduledFor: Date;
  duration: number; // minutes
  status: AppointmentStatus;
  
  // Meeting details and preparation
  meetingNotes?: string;      // What the user wants to discuss
  userQuestions?: string[];   // Specific questions they have
  preparationNotes?: string;  // Internal notes for meeting preparation
  
  // Contact details at time of booking
  contactName?: string;       // Full name when booked
  contactEmail?: string;      // Email when booked
  
  createdAt: Date;
  updatedAt?: Date;
  cancelledAt?: Date;
  rescheduleHistory?: RescheduleInfo[];
}

export interface RescheduleInfo {
  fromDate: Date;
  toDate: Date;
  reason?: string;
  timestamp: Date;
}

export enum InterestLevel {
  UNKNOWN = 'unknown',           // No clear interest expressed yet
  CURIOUS = 'curious',           // Asked basic questions
  INTERESTED = 'interested',     // Expressed clear interest
  ENGAGED = 'engaged',           // Actively discussing services
  COMMITTED = 'committed'        // Ready to schedule/scheduled
}

export enum AppointmentStatus {
  SCHEDULED = 'scheduled',       // Active appointment
  COMPLETED = 'completed',       // Meeting happened
  CANCELLED = 'cancelled',       // User cancelled
  NO_SHOW = 'no_show',          // User didn't attend
  RESCHEDULED = 'rescheduled'    // Moved to new time
}

/**
 * Configuration for user profile management
 */
export interface UserProfileConfig {
  redisKeyPrefix: string;
  defaultExpirationDays: number; // 7 days (1 week)
  maxAppointmentHistory: number;
  maxConversationHistory: number; // 49 messages
  autoCompleteThreshold: number; // Percentage for considering profile "complete"
}

/**
 * Profile update operations
 */
export interface ProfileUpdateData {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  interestLevel?: InterestLevel;
  serviceInterests?: string[];
  appointment?: Partial<AppointmentInfo>;
  meetingNotes?: string;
  userQuestions?: string[];
}

/**
 * Profile extraction from conversation
 */
export interface ProfileExtractionResult {
  extractedData: Partial<UserProfile>;
  confidence: number; // 0-1 score
  extractedFields: string[];
}
