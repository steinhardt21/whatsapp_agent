/**
 * Redis-based User Profile Manager
 * 
 * Manages persistent user profiles with automatic extraction,
 * appointment tracking, and one-appointment constraint enforcement.
 */

import { getRedisClient } from '../session/redis-client.js';
import {
  UserProfile,
  AppointmentInfo,
  InterestLevel,
  AppointmentStatus,
  UserProfileConfig,
  ProfileUpdateData,
  ProfileExtractionResult,
  ConversationMessage
} from './types.js';
import { extractEmailsFromText, isValidEmail } from '../../utils/validation.js';

export class UserProfileManager {
  private redisClient: any;
  private config: UserProfileConfig;
  private initialized: boolean = false;

  constructor(config?: Partial<UserProfileConfig>) {
    this.config = {
      redisKeyPrefix: 'user_profile:',
      defaultExpirationDays: 7, // 1 week
      maxAppointmentHistory: 10,
      maxConversationHistory: 49, // 49 messages max
      autoCompleteThreshold: 0.8,
      ...config
    };
    this.initializeRedis();
  }

  private async initializeRedis() {
    try {
      this.redisClient = await getRedisClient();
      this.initialized = true;
      console.log('✅ UserProfileManager Redis client initialized');
    } catch (error) {
      console.error('❌ Failed to initialize UserProfileManager Redis client:', error);
      this.initialized = false;
    }
  }

  private getProfileKey(phoneNumber: string): string {
    return `${this.config.redisKeyPrefix}${phoneNumber}`;
  }

  /**
   * Get user profile from Redis
   */
  async getProfile(phoneNumber: string): Promise<UserProfile | null> {
    if (!this.initialized) return null;

    try {
      const profileData = await this.redisClient.get(this.getProfileKey(phoneNumber));
      
      if (!profileData) {
        return null;
      }

      const profile: UserProfile = JSON.parse(profileData, (key, value) => {
        // Convert date strings back to Date objects
        if (key.includes('At') || key === 'scheduledFor') {
          return new Date(value);
        }
        return value;
      });

      console.log(`📋 Retrieved user profile for ${phoneNumber}:`, {
        name: profile.name,
        email: profile.email,
        interestLevel: profile.interestLevel,
        hasAppointment: !!profile.currentAppointment,
        completionPercentage: profile.completionPercentage
      });

      return profile;
    } catch (error) {
      console.error(`Error getting profile for ${phoneNumber}:`, error);
      return null;
    }
  }

  /**
   * Create or update user profile
   */
  async updateProfile(phoneNumber: string, updates: ProfileUpdateData): Promise<UserProfile> {
    let profile = await this.getProfile(phoneNumber);
    
    // Create new profile if doesn't exist
    if (!profile) {
      profile = this.createEmptyProfile(phoneNumber);
      console.log(`🆕 Creating new user profile for ${phoneNumber}`);
    }

    // Apply updates
    const originalProfile = { ...profile };
    
    // firstName/lastName removed - using only name field
    
    if (updates.name && updates.name !== profile.name) {
      profile.name = updates.name;
      console.log(`👤 Updated full name: ${updates.name}`);
    }
    
    // Name is now the primary field (simplified)
    
    if (updates.email && updates.email !== profile.email) {
      profile.email = updates.email;
      console.log(`📧 Updated email: ${updates.email}`);
    }
    
    if (updates.interestLevel && updates.interestLevel !== profile.interestLevel) {
      profile.interestLevel = updates.interestLevel;
      console.log(`📈 Updated interest level: ${updates.interestLevel}`);
    }
    
    if (updates.serviceInterests) {
      profile.serviceInterests = [...new Set([...profile.serviceInterests, ...updates.serviceInterests])];
      console.log(`🎯 Updated service interests:`, profile.serviceInterests);
    }

    // Update metadata
    profile.updatedAt = new Date();
    profile.lastContactAt = new Date();
    profile.totalConversations += 1;
    
    // Recalculate completion
    profile.completionPercentage = this.calculateCompletionPercentage(profile);
    profile.isComplete = profile.completionPercentage >= this.config.autoCompleteThreshold;

    await this.saveProfile(profile);
    
    console.log(`💾 Profile updated for ${phoneNumber}, completion: ${Math.round(profile.completionPercentage * 100)}%`);
    return profile;
  }

  /**
   * Extract meeting notes from conversation text
   */
  extractMeetingNotes(text: string): string {
    const meetingPatterns = [
      /(?:vorrei parlare di|voglio discutere|mi interessa|ho bisogno di aiuto con)\s+([^.!?]{10,200})/i,
      /(?:argomenti|temi|questioni|problemi)(?:\s*[:=]\s*)([^.!?]{10,200})/i,
      /(?:domande|dubbi|curiosità)(?:\s*[:=]\s*)([^.!?]{10,200})/i
    ];

    let meetingNotes = '';
    for (const pattern of meetingPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        meetingNotes += match[1].trim() + '. ';
      }
    }

    return meetingNotes.trim();
  }

  /**
   * Extract profile data from conversation text
   */
  extractProfileFromText(text: string, existingProfile?: UserProfile): ProfileExtractionResult {
    const extractedData: Partial<UserProfile> = {};
    const extractedFields: string[] = [];
    let confidence = 0;

    // Extract email
    const emails = extractEmailsFromText(text);
    if (emails.length > 0 && (!existingProfile?.email || existingProfile.email !== emails[0])) {
      extractedData.email = emails[0];
      extractedFields.push('email');
      confidence += 0.3;
    }

    // Extract name (enhanced patterns for first name, last name, and full name)
    const namePatterns = [
      // Full name patterns with various Italian phrases
      /(?:mi chiamo|sono|il mio nome è|il mio nome e'|nome è|nome e')\s+([A-Za-z]+)\s+([A-Za-z]+)/i,
      /(?:nome e cognome|nome cognome)(?:\s*[:=]\s*)([A-Za-z]+)\s+([A-Za-z]+)/i,
      
      // Single name patterns with various Italian phrases  
      /(?:mi chiamo|sono|il mio nome è|il mio nome e'|nome è|nome e')\s+([A-Za-z\s]{2,30})/i,
      /(?:name|nome)(?:\s*[:=]\s*)([A-Za-z\s]{2,30})/i,
      
      // Standalone name patterns (like "Alex Enache" without prefix)
      /^([A-Z][a-z]+)\s+([A-Z][a-z]+)$/,  // First Last (capitalized)
      /^([A-Z][a-z]+)$/  // Single name (capitalized)
    ];

    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        if (match[2]) {
          // Full name pattern (firstName lastName)
          const firstName = match[1].trim();
          const lastName = match[2].trim();
          if (firstName.length > 1 && lastName.length > 1) {
            // firstName/lastName removed
            extractedData.name = `${firstName} ${lastName}`;
            extractedFields.push('name');
            confidence += 0.35;
            break;
          }
        } else {
          // Single name pattern - try to split if it contains space
          const fullName = match[1].trim();
          const nameParts = fullName.split(/\s+/);
          if (nameParts.length === 2) {
            // firstName/lastName removed
            extractedData.name = fullName;
            extractedFields.push('name');
            confidence += 0.35;
          } else if (fullName.length > 1 && (!existingProfile?.name || existingProfile.name !== fullName)) {
            extractedData.name = fullName;
            extractedFields.push('name');
            confidence += 0.25;
          }
          break;
        }
      }
    }

    // NOTE: Name extraction above is being phased out in favor of AI-driven extraction

    // Extract meeting notes and questions
    const meetingPatterns = [
      /(?:vorrei parlare di|voglio discutere|mi interessa|ho bisogno di aiuto con)\s+([^.!?]{10,200})/i,
      /(?:argomenti|temi|questioni|problemi)(?:\s*[:=]\s*)([^.!?]{10,200})/i,
      /(?:domande|dubbi|curiosità)(?:\s*[:=]\s*)([^.!?]{10,200})/i
    ];

    let meetingNotes = '';
    for (const pattern of meetingPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        meetingNotes += match[1].trim() + '. ';
      }
    }

    // Note: meetingNotes will be handled separately during appointment creation
    // and stored in the AppointmentInfo, not in the main UserProfile

    // Detect interest level based on conversation content
    const interestKeywords = {
      [InterestLevel.CURIOUS]: ['cosa fate', 'che servizi', 'mi interesserebbe sapere', 'vorrei informazioni'],
      [InterestLevel.INTERESTED]: ['mi interessa', 'vorrei', 'potete aiutarmi', 'ho bisogno'],
      [InterestLevel.ENGAGED]: ['quanto costa', 'come funziona', 'quando possiamo', 'approfondire'],
      [InterestLevel.COMMITTED]: ['fissiamo', 'appuntamento', 'incontriamoci', 'quando puoi']
    };

    for (const [level, keywords] of Object.entries(interestKeywords)) {
      if (keywords.some(keyword => text.toLowerCase().includes(keyword))) {
        const currentLevel = existingProfile?.interestLevel || InterestLevel.UNKNOWN;
        if (this.isHigherInterestLevel(level as InterestLevel, currentLevel)) {
          extractedData.interestLevel = level as InterestLevel;
          extractedFields.push('interestLevel');
          confidence += 0.2;
        }
        break;
      }
    }

    // Extract service interests
    const serviceKeywords = {
      'digital marketing': ['marketing', 'pubblicità', 'social media', 'advertising'],
      'web development': ['sito web', 'website', 'sviluppo web', 'ecommerce'],
      'AI consulting': ['intelligenza artificiale', 'AI', 'automazione', 'chatbot'],
      'branding': ['brand', 'logo', 'identità', 'grafica'],
      'eventi': ['evento', 'manifestazione', 'organizzazione eventi']
    };

    const detectedServices: string[] = [];
    for (const [service, keywords] of Object.entries(serviceKeywords)) {
      if (keywords.some(keyword => text.toLowerCase().includes(keyword))) {
        detectedServices.push(service);
      }
    }

    if (detectedServices.length > 0) {
      extractedData.serviceInterests = detectedServices;
      extractedFields.push('serviceInterests');
      confidence += 0.15 * detectedServices.length;
    }

    // Cap confidence at 1.0
    confidence = Math.min(confidence, 1.0);

    console.log(`🔍 Profile extraction from text completed:`, {
      extractedFields,
      confidence: Math.round(confidence * 100) + '%',
      extractedData
    });

    return {
      extractedData,
      confidence,
      extractedFields
    };
  }

  /**
   * Add or update appointment for user (enforces one-appointment rule)
   */
  async setAppointment(phoneNumber: string, appointmentInfo: Omit<AppointmentInfo, 'createdAt'>): Promise<UserProfile> {
    const profile = await this.getProfile(phoneNumber) || this.createEmptyProfile(phoneNumber);

    // If user has existing appointment, move it to history
    if (profile.currentAppointment) {
      console.log(`⚠️ User ${phoneNumber} already has appointment, moving current to history`);
      
      // Mark old appointment as rescheduled
      const oldAppointment = { ...profile.currentAppointment };
      oldAppointment.status = AppointmentStatus.RESCHEDULED;
      oldAppointment.updatedAt = new Date();
      
      // Add reschedule info
      if (!oldAppointment.rescheduleHistory) {
        oldAppointment.rescheduleHistory = [];
      }
      oldAppointment.rescheduleHistory.push({
        fromDate: oldAppointment.scheduledFor,
        toDate: appointmentInfo.scheduledFor,
        reason: 'User requested new appointment',
        timestamp: new Date()
      });

      // Add to history
      profile.appointmentHistory.unshift(oldAppointment);
      
      // Limit history size
      if (profile.appointmentHistory.length > this.config.maxAppointmentHistory) {
        profile.appointmentHistory = profile.appointmentHistory.slice(0, this.config.maxAppointmentHistory);
      }
    }

    // Set new appointment
    profile.currentAppointment = {
      ...appointmentInfo,
      createdAt: new Date(),
      status: AppointmentStatus.SCHEDULED
    };

    // Update interest level to committed
    profile.interestLevel = InterestLevel.COMMITTED;
    profile.updatedAt = new Date();
    profile.lastContactAt = new Date();

    await this.saveProfile(profile);
    
    console.log(`📅 Set appointment for ${phoneNumber}:`, {
      title: appointmentInfo.title,
      scheduledFor: appointmentInfo.scheduledFor,
      eventId: appointmentInfo.eventId
    });

    return profile;
  }

  /**
   * Cancel current appointment
   */
  async cancelAppointment(phoneNumber: string, reason?: string): Promise<UserProfile | null> {
    const profile = await this.getProfile(phoneNumber);
    
    if (!profile || !profile.currentAppointment) {
      console.log(`⚠️ No appointment to cancel for ${phoneNumber}`);
      return profile;
    }

    // Move current appointment to history with cancelled status
    const cancelledAppointment = { ...profile.currentAppointment };
    cancelledAppointment.status = AppointmentStatus.CANCELLED;
    cancelledAppointment.cancelledAt = new Date();
    cancelledAppointment.updatedAt = new Date();

    profile.appointmentHistory.unshift(cancelledAppointment);
    profile.currentAppointment = undefined;
    profile.updatedAt = new Date();

    await this.saveProfile(profile);
    
    console.log(`❌ Cancelled appointment for ${phoneNumber}:`, {
      title: cancelledAppointment.title,
      reason
    });

    return profile;
  }

  /**
   * Check if user can schedule a new appointment
   */
  async canScheduleAppointment(phoneNumber: string): Promise<{ canSchedule: boolean; reason?: string }> {
    const profile = await this.getProfile(phoneNumber);
    
    if (!profile || !profile.currentAppointment) {
      return { canSchedule: true };
    }

    if (profile.currentAppointment.status === AppointmentStatus.SCHEDULED) {
      return {
        canSchedule: false,
        reason: `Hai già un appuntamento programmato per ${profile.currentAppointment.scheduledFor.toLocaleDateString('it-IT')}. Per fissare un nuovo appuntamento, devi prima cancellare o riprogrammare quello esistente.`
      };
    }

    return { canSchedule: true };
  }

  /**
   * Update profile from conversation and return updated profile
   */
  async updateFromConversation(phoneNumber: string, conversationText: string): Promise<UserProfile> {
    const existingProfile = await this.getProfile(phoneNumber);
    const extraction = this.extractProfileFromText(conversationText, existingProfile || undefined);
    
    if (extraction.extractedFields.length > 0 && extraction.confidence > 0.1) {
      console.log(`🔄 Auto-updating profile for ${phoneNumber} based on conversation`);
      return await this.updateProfile(phoneNumber, extraction.extractedData);
    }

    // If no extraction but user contacted, update contact info
    if (existingProfile) {
      existingProfile.lastContactAt = new Date();
      existingProfile.totalConversations += 1;
      await this.saveProfile(existingProfile);
      return existingProfile;
    }

    // Create minimal profile for new user
    return await this.updateProfile(phoneNumber, {});
  }

  private createEmptyProfile(phoneNumber: string): UserProfile {
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(now.getDate() + this.config.defaultExpirationDays);
    
    return {
      phoneNumber,
      interestLevel: InterestLevel.UNKNOWN,
      serviceInterests: [],
      appointmentHistory: [],
      conversationHistory: [],
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
      lastContactAt: now,
      totalConversations: 0,
      expiresAt: expiresAt,
      isComplete: false,
      completionPercentage: 0
    };
  }

  private calculateCompletionPercentage(profile: UserProfile): number {
    let score = 0;
    const weights = {
      phoneNumber: 0.1, // Always present
      firstName: 0.15,
      lastName: 0.15,
      email: 0.3,
      interestLevel: 0.2,
      serviceInterests: 0.1
    };

    score += weights.phoneNumber; // Phone number always present
    
    // firstName/lastName removed
    if (profile.email && isValidEmail(profile.email)) score += weights.email;
    if (profile.interestLevel !== InterestLevel.UNKNOWN) score += weights.interestLevel;
    if (profile.serviceInterests.length > 0) score += weights.serviceInterests;

    return score;
  }

  private isHigherInterestLevel(newLevel: InterestLevel, currentLevel: InterestLevel): boolean {
    const levels = [
      InterestLevel.UNKNOWN,
      InterestLevel.CURIOUS,
      InterestLevel.INTERESTED,
      InterestLevel.ENGAGED,
      InterestLevel.COMMITTED
    ];
    
    return levels.indexOf(newLevel) > levels.indexOf(currentLevel);
  }

  private async saveProfile(profile: UserProfile): Promise<void> {
    if (!this.initialized) return;

    try {
      // Update expiresAt to extend TTL for active users (rolling window)
      const now = new Date();
      profile.expiresAt = new Date();
      profile.expiresAt.setDate(now.getDate() + this.config.defaultExpirationDays);
      
      const profileData = JSON.stringify(profile);
      const expirationSeconds = this.config.defaultExpirationDays * 24 * 60 * 60;
      
      await this.redisClient.setEx(
        this.getProfileKey(profile.phoneNumber),
        expirationSeconds,
        profileData
      );
      
      console.log(`💾 Saved profile for ${profile.phoneNumber} with ${expirationSeconds}s TTL (expires: ${profile.expiresAt.toISOString()})`);
    } catch (error) {
      console.error(`Error saving profile for ${profile.phoneNumber}:`, error);
    }
  }

  /**
   * Get all profiles (for admin/analytics)
   */
  async getAllProfiles(): Promise<UserProfile[]> {
    if (!this.initialized) return [];

    try {
      const keys = await this.redisClient.keys(`${this.config.redisKeyPrefix}*`);
      const profiles: UserProfile[] = [];

      for (const key of keys) {
        const profileData = await this.redisClient.get(key);
        if (profileData) {
          const profile: UserProfile = JSON.parse(profileData, (key, value) => {
            if (key.includes('At') || key === 'scheduledFor') {
              return new Date(value);
            }
            return value;
          });
          profiles.push(profile);
        }
      }

      console.log(`📊 Retrieved ${profiles.length} user profiles`);
      return profiles;
    } catch (error) {
      console.error('Error getting all profiles:', error);
      return [];
    }
  }

  /**
   * Add a message to the user's conversation history
   */
  async addConversationMessage(
    phoneNumber: string, 
    role: 'user' | 'assistant', 
    content: string,
    messageId?: string
  ): Promise<void> {
    try {
      const profile = await this.getProfile(phoneNumber);
      if (!profile) {
        console.error(`Failed to add conversation message: No profile found for ${phoneNumber}`);
        return;
      }
      
      const message: ConversationMessage = {
        id: messageId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role,
        content,
        timestamp: new Date(),
        messageId
      };

      // Add new message
      profile.conversationHistory.push(message);
      profile.lastMessageAt = new Date();

      // Maintain max conversation history limit (49 messages)
      if (profile.conversationHistory.length > this.config.maxConversationHistory) {
        const excess = profile.conversationHistory.length - this.config.maxConversationHistory;
        profile.conversationHistory.splice(0, excess);
        console.log(`🗑️ Trimmed ${excess} old messages for ${phoneNumber}, keeping last ${this.config.maxConversationHistory}`);
      }

      await this.saveProfile(profile);
      console.log(`💬 Added ${role} message to conversation history for ${phoneNumber} (${profile.conversationHistory.length}/${this.config.maxConversationHistory})`);
      
    } catch (error) {
      console.error('Failed to add conversation message:', error);
    }
  }

  /**
   * Get conversation history for a user
   */
  async getConversationHistory(phoneNumber: string): Promise<ConversationMessage[]> {
    try {
      const profile = await this.getProfile(phoneNumber);
      if (!profile) {
        return [];
      }
      return profile.conversationHistory || [];
    } catch (error) {
      console.error('Failed to get conversation history:', error);
      return [];
    }
  }

  /**
   * Clear conversation history for a user while preserving profile data
   */
  async clearConversationHistory(phoneNumber: string): Promise<void> {
    try {
      const profile = await this.getProfile(phoneNumber);
      if (!profile) {
        console.error(`Failed to clear conversation history: No profile found for ${phoneNumber}`);
        return;
      }
      profile.conversationHistory = [];
      await this.saveProfile(profile);
      console.log(`🗑️ Cleared conversation history for ${phoneNumber}`);
    } catch (error) {
      console.error('Failed to clear conversation history:', error);
    }
  }

  /**
   * Get the last N messages from conversation history
   */
  async getRecentMessages(phoneNumber: string, count: number = 10): Promise<ConversationMessage[]> {
    try {
      const history = await this.getConversationHistory(phoneNumber);
      return history.slice(-count);
    } catch (error) {
      console.error('Failed to get recent messages:', error);
      return [];
    }
  }

  /**
   * Find appointment by Google Calendar event ID
   */
  async findAppointmentByGoogleCalendarId(googleCalendarId: string): Promise<{profile: UserProfile, appointment: AppointmentInfo} | null> {
    try {
      const allProfiles = await this.getAllProfiles();
      
      for (const profile of allProfiles) {
        // Check current appointment
        if (profile.currentAppointment?.googleCalendarId === googleCalendarId) {
          console.log(`📅 Found appointment by Google Calendar ID ${googleCalendarId} in current appointment for ${profile.phoneNumber}`);
          return { profile, appointment: profile.currentAppointment };
        }
        
        // Check appointment history
        const historicalAppointment = profile.appointmentHistory.find(
          appointment => appointment.googleCalendarId === googleCalendarId
        );
        
        if (historicalAppointment) {
          console.log(`📅 Found appointment by Google Calendar ID ${googleCalendarId} in history for ${profile.phoneNumber}`);
          return { profile, appointment: historicalAppointment };
        }
      }
      
      console.log(`❌ No appointment found with Google Calendar ID: ${googleCalendarId}`);
      return null;
    } catch (error) {
      console.error('Failed to find appointment by Google Calendar ID:', error);
      return null;
    }
  }

  /**
   * Update appointment Google Calendar details
   */
  async updateAppointmentCalendarDetails(
    phoneNumber: string, 
    googleCalendarId: string, 
    updates: Partial<Pick<AppointmentInfo, 'googleCalendarId' | 'calendarEventUrl' | 'eventId'>>
  ): Promise<UserProfile | null> {
    try {
      const profile = await this.getProfile(phoneNumber);
      if (!profile) {
        console.error(`Failed to update appointment: No profile found for ${phoneNumber}`);
        return null;
      }

      let updated = false;

      // Update current appointment if it matches
      if (profile.currentAppointment?.googleCalendarId === googleCalendarId) {
        Object.assign(profile.currentAppointment, updates);
        profile.currentAppointment.updatedAt = new Date();
        updated = true;
        console.log(`📅 Updated current appointment calendar details for ${phoneNumber}`);
      }

      // Update in appointment history
      const historyIndex = profile.appointmentHistory.findIndex(
        appointment => appointment.googleCalendarId === googleCalendarId
      );
      
      if (historyIndex !== -1) {
        Object.assign(profile.appointmentHistory[historyIndex], updates);
        profile.appointmentHistory[historyIndex].updatedAt = new Date();
        updated = true;
        console.log(`📅 Updated appointment history calendar details for ${phoneNumber}`);
      }

      if (updated) {
        profile.updatedAt = new Date();
        await this.saveProfile(profile);
        return profile;
      } else {
        console.log(`⚠️ No appointment found with Google Calendar ID ${googleCalendarId} for ${phoneNumber}`);
        return null;
      }
    } catch (error) {
      console.error('Failed to update appointment calendar details:', error);
      return null;
    }
  }

  /**
   * Get appointment by Google Calendar ID for a specific user
   */
  async getUserAppointmentByGoogleCalendarId(phoneNumber: string, googleCalendarId: string): Promise<AppointmentInfo | null> {
    try {
      const profile = await this.getProfile(phoneNumber);
      if (!profile) {
        return null;
      }

      // Check current appointment
      if (profile.currentAppointment?.googleCalendarId === googleCalendarId) {
        return profile.currentAppointment;
      }

      // Check appointment history
      const historicalAppointment = profile.appointmentHistory.find(
        appointment => appointment.googleCalendarId === googleCalendarId
      );

      return historicalAppointment || null;
    } catch (error) {
      console.error('Failed to get appointment by Google Calendar ID:', error);
      return null;
    }
  }

  /**
   * Clean up expired profiles (for maintenance)
   */
  async cleanupExpiredProfiles(): Promise<number> {
    if (!this.initialized) return 0;

    try {
      const keys = await this.redisClient.keys(this.config.redisKeyPrefix + '*');
      let cleanedCount = 0;
      
      for (const key of keys) {
        try {
          const profileData = await this.redisClient.get(key);
          if (profileData) {
            const profile: UserProfile = JSON.parse(profileData);
            const now = new Date();
            
            if (profile.expiresAt && new Date(profile.expiresAt) < now) {
              await this.redisClient.del(key);
              cleanedCount++;
              console.log(`🗑️ Cleaned up expired profile: ${profile.phoneNumber}`);
            }
          }
        } catch (error) {
          console.error(`Error processing profile key ${key}:`, error);
        }
      }
      
      console.log(`🧹 Cleanup completed: removed ${cleanedCount} expired profiles`);
      return cleanedCount;
    } catch (error) {
      console.error('Failed to cleanup expired profiles:', error);
      return 0;
    }
  }
}

// Global singleton instance
let userProfileManagerInstance: UserProfileManager | null = null;

export function getUserProfileManager(): UserProfileManager {
  if (!userProfileManagerInstance) {
    userProfileManagerInstance = new UserProfileManager();
  }
  return userProfileManagerInstance;
}
