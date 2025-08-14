/**
 * User Profile Management Tool
 * 
 * Allows the AI to directly update user profile information
 * when it detects names, emails, or other details in conversation.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { getUserProfileManager } from '../user-profile/index.js';
import { InterestLevel } from '../user-profile/types.js';

export const userProfileTool = tool({
  description: 'Update user profile information when detected in conversation (name, email, interests, etc.)',
  parameters: z.object({
    phoneNumber: z.string().describe('The user phone number (from context)'),
    updates: z.object({
      name: z.string().optional().describe('Full name of the user (e.g., "Alex Enache")'),
      email: z.string().email().optional().describe('Email address'),
      interestLevel: z.enum(['unknown', 'curious', 'interested', 'engaged', 'committed']).optional().describe('Level of interest in services'),
      serviceInterests: z.array(z.string()).optional().describe('Array of services user is interested in'),
      meetingNotes: z.string().optional().describe('What the user wants to discuss in the meeting')
    }).describe('Profile fields to update'),
    detectedFrom: z.string().describe('The exact text/message where this information was detected'),
    confidence: z.enum(['high', 'medium', 'low']).describe('How confident you are about this extraction')
  }),
  execute: async ({ phoneNumber, updates, detectedFrom, confidence }) => {
    const startTime = Date.now();
    
    try {
      console.log(`🧠 [USER PROFILE TOOL] AI detected profile info for ${phoneNumber}`);
      console.log(`📝 [USER PROFILE TOOL] Detected from: "${detectedFrom}"`);
      console.log(`🎯 [USER PROFILE TOOL] Confidence: ${confidence}`);
      console.log(`📋 [USER PROFILE TOOL] Updates:`, updates);

      const profileManager = getUserProfileManager();
      
      // Get current profile
      const currentProfile = await profileManager.getProfile(phoneNumber);
      if (!currentProfile) {
        console.error(`❌ [USER PROFILE TOOL] No profile found for ${phoneNumber}`);
        return {
          success: false,
          message: 'User profile not found',
          action: 'error'
        };
      }

      // Apply updates with type conversion
      const profileUpdates = {
        ...updates,
        interestLevel: updates.interestLevel as InterestLevel | undefined
      };
      const updatedProfile = await profileManager.updateProfile(phoneNumber, profileUpdates);
      
      // Generate response based on what was updated
      const updatedFields = Object.keys(updates).filter(key => updates[key as keyof typeof updates] !== undefined);
      let responseMessage = '';
      
      if (updates.name) {
        responseMessage = `Perfetto! Ho aggiornato il tuo profilo con il nome "${updates.name}".`;
      } else if (updates.email) {
        responseMessage = `Ottimo! Ho salvato il tuo indirizzo email: ${updates.email}`;
      } else if (updates.meetingNotes) {
        responseMessage = `Ho preso nota di cosa vuoi discutere: ${updates.meetingNotes}`;
      } else {
        responseMessage = `Ho aggiornato il tuo profilo con le nuove informazioni.`;
      }

      const executionTime = Date.now() - startTime;
      console.log(`✅ [USER PROFILE TOOL] Profile updated successfully in ${executionTime}ms`);
      console.log(`👤 [USER PROFILE TOOL] Updated fields: ${updatedFields.join(', ')}`);
      console.log(`📊 [USER PROFILE TOOL] Profile completion: ${Math.round((updatedProfile.completionPercentage || 0) * 100)}%`);

      return {
        success: true,
        message: responseMessage,
        action: 'profile_updated',
        updatedFields: updatedFields,
        profileCompletion: Math.round((updatedProfile.completionPercentage || 0) * 100),
        userProfile: {
          name: updatedProfile.name,
          email: updatedProfile.email,
          interestLevel: updatedProfile.interestLevel,
          hasAppointment: !!updatedProfile.currentAppointment,
          serviceInterests: updatedProfile.serviceInterests
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ [USER PROFILE TOOL] Error updating profile:`, error);
      
      return {
        success: false,
        message: 'Si è verificato un errore durante l\'aggiornamento del profilo',
        action: 'error',
        error: error instanceof Error ? error.message : String(error),
        executionTime
      };
    }
  }
});
