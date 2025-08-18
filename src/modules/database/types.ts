/**
 * Database Types for Existing Schema
 */

export interface CandidateData {
  id: string; // UUID
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  birth_date?: Date;
  street_name?: string;
  street_number?: string;
  city_cap_id?: number;
  created_at: Date;
  updated_at: Date;
  cap?: string;
  wa_id?: string; // WhatsApp ID
  connected?: boolean;
}

export interface AppointmentData {
  id: string; // UUID
  created_at: Date;
  candidate_id?: string;
  status?: string;
  start_time?: Date;
  end_time?: Date;
  google_event_id?: string;
  timezone?: string;
}

export interface ChatHistoryData {
  id: number;
  session_id: string;
  message: any; // JSONB field
}

export interface JobData {
  id: number;
  created_at: Date;
  candidate_id?: string;
  type?: string;
  status?: string;
  step?: number;
  job_offer_interested?: string;
  job_offer_category?: string;
}

export interface JobOfferData {
  id: number;
  created_at: Date;
  summary?: string;
  link?: string;
  title?: string;
  type?: string;
}

// Convenience type aliases for consistency with existing code
export interface UserData extends CandidateData {
  // Computed fields for compatibility
  name?: string; // Computed from first_name + last_name
  full_name?: string; // Same as name
}

export interface UserAppointment extends AppointmentData {
  // Additional computed fields if needed
  duration_minutes?: number; // Computed from start_time/end_time
}

/**
 * Query result types
 */
export interface UserWithAppointments extends UserData {
  appointments: UserAppointment[];
}

export interface UserWithChatHistory extends UserData {
  chat_history: ChatHistoryData[];
}

export interface UserWithJobs extends UserData {
  jobs: JobData[];
}

export interface UserComplete extends UserData {
  appointments: UserAppointment[];
  chat_history: ChatHistoryData[];
  jobs: JobData[];
}
