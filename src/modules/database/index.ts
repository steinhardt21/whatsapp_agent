/**
 * Database module exports
 */

// Client and configuration
export { 
  getDatabasePool, 
  executeQuery, 
  executeQuerySingle, 
  closeDatabasePool, 
  testDatabaseConnection,
  getDatabaseConfig 
} from './client.js';

// Types
export type { 
  UserData, 
  CandidateData,
  UserAppointment, 
  AppointmentData,
  ChatHistoryData,
  JobData,
  JobOfferData,
  UserComplete, 
  UserWithAppointments,
  UserWithChatHistory,
  UserWithJobs
} from './types.js';

export type { DatabaseConfig } from './client.js';

// Chat utilities
export { 
  extractConversationMessages,
  buildLLMConversationContext,
  formatConversationForLLM,
  getConversationSummary,
  extractUserMessages,
  extractConversationWithIntent
} from './chat-utils.js';

export type { 
  ConversationMessage,
  LLMConversationContext 
} from './chat-utils.js';

// User service functions
export { 
  getUserData,
  getUserWithAppointments,
  getUserComplete,
  getCandidateAppointments,
  getCandidateAppointmentsByStatus,
  getCandidatePlannedAppointments,
  getCandidateChatHistory,
  getCandidateJobs,
  getJobOffersByType,
  getInternalJobByStatus,
  createInternalJob,
  updateInternalJob,
  createOrUpdateUser,
  createCandidate,
  updateCandidate,
  updateLastContact,
  updateCandidateLastContact,
  saveChatMessage,
  resetUserData
} from './user-service.js';
