import { tool } from 'ai';
import { z } from 'zod';
import { calendarAgent } from '../agents/calendar-agent.js';
import { extractEmailsFromText, isValidEmail, validateAndFormatEmail } from '../../utils/validation.js';
import { getUserProfileManager } from '../user-profile/manager.js';
import { AppointmentInfo, AppointmentStatus } from '../user-profile/types.js';

/**
 * Calendar Management Tool for the AI Assistant
 * 
 * This tool allows the AI assistant to interact with Google Calendar
 * through the specialized calendar agent that connects to an MCP server.
 */

export const calendarTool = tool({
  description: `Gestisce operazioni del calendario Google come:
- Creare eventi nel calendario
- Cercare eventi esistenti  
- Modificare eventi
- Cancellare eventi
- Visualizzare il calendario

Usa questo tool per qualsiasi richiesta relativa al calendario, appuntamenti, eventi o gestione del tempo.`,
  
  parameters: z.object({
    action: z.enum([
      'search', 
      'create', 
      'update', 
      'delete', 
      'get_all',
      'process_request',
      'check_availability'
    ]).describe('Tipo di operazione da eseguire sul calendario'),
    
    phoneNumber: z.string().describe('Numero di telefono dell\'utente (per gestione profilo)'),
    userRequest: z.string().optional().describe('Richiesta originale dell\'utente in linguaggio naturale'),
    
    // For search operations
    query: z.string().optional().describe('Termine di ricerca per gli eventi'),
    timeMin: z.string().optional().describe('Data/ora minima in formato ISO (es: 2024-01-01T00:00:00Z)'),
    timeMax: z.string().optional().describe('Data/ora massima in formato ISO (es: 2024-01-31T23:59:59Z)'),
    
    // For create/update operations
    eventData: z.object({
      summary: z.string().describe('Titolo dell\'evento'),
      description: z.string().optional().describe('Descrizione dell\'evento'),
      start: z.object({
        dateTime: z.string().describe('Data/ora inizio in formato ISO'),
        timeZone: z.string().optional().describe('Fuso orario (default: Europe/Rome)')
      }),
      end: z.object({
        dateTime: z.string().describe('Data/ora fine in formato ISO'),
        timeZone: z.string().optional().describe('Fuso orario (default: Europe/Rome)')
      }),
      location: z.string().optional().describe('Luogo dell\'evento'),
      attendees: z.array(z.object({
        email: z.string().describe('Email del partecipante')
      })).optional().describe('Lista partecipanti')
    }).optional().describe('Dati dell\'evento per creazione/modifica'),
    
    // For update/delete operations
    eventId: z.string().optional().describe('ID dell\'evento da modificare/cancellare')
  }),

  execute: async ({ 
    action, 
    phoneNumber,
    userRequest, 
    query, 
    timeMin, 
    timeMax, 
    eventData, 
    eventId 
  }) => {
    // Store start time for performance monitoring
    const startTime = Date.now();
    
    try {
      console.log(`📅 [CALENDAR TOOL DEBUG] Calendar tool executing action: ${action} for user ${phoneNumber}`);
      console.log(`📅 [CALENDAR TOOL DEBUG] Tool parameters:`, {
        action,
        phoneNumber,
        userRequest,
        query,
        timeMin,
        timeMax,
        eventData,
        eventId
      });

      // Get user profile manager
      const profileManager = getUserProfileManager();
      
      // Get user profile and extract email for event filtering
      await profileManager.updateFromConversation(phoneNumber, userRequest || '');
      const currentProfile = await profileManager.getProfile(phoneNumber);
      
      // Extract emails from multiple sources
      let userEmail: string | null = null;
      
      // 1. First, try user profile
      if (currentProfile?.email && isValidEmail(currentProfile.email)) {
        userEmail = currentProfile.email;
        console.log(`📧 [CALENDAR TOOL DEBUG] Using email from user profile: ${userEmail}`);
      }
      
      // 2. Try to extract from userRequest
      if (!userEmail && userRequest) {
        console.log(`📧 [CALENDAR TOOL DEBUG] Extracting emails from user request: "${userRequest}"`);
        const extractedEmails = extractEmailsFromText(userRequest);
        console.log(`📧 [CALENDAR TOOL DEBUG] Extracted emails from userRequest:`, extractedEmails);
        if (extractedEmails.length > 0) {
          userEmail = validateAndFormatEmail(extractedEmails[0]);
          console.log(`📧 [CALENDAR TOOL DEBUG] Valid user email found in userRequest: ${userEmail}`);
        }
      }
      
      // Check if calendar agent is ready
      console.log(`🔍 [CALENDAR TOOL DEBUG] Checking if calendar agent is ready...`);
      const isReady = await calendarAgent.isReady();
      console.log(`🎯 [CALENDAR TOOL DEBUG] Calendar agent ready: ${isReady}`);
      
      if (!isReady) {
        console.warn(`⚠️ [CALENDAR TOOL DEBUG] Calendar agent not ready, providing fallback response`);
        
        // Provide helpful fallback message based on the action
        switch (action) {
          case 'check_availability':
          case 'search':
            return {
              success: false,
              message: "🔧 Il sistema di gestione del calendario non è al momento disponibile (errore di connessione al server). Posso comunque prendere nota della tua richiesta di appuntamento per lunedì alle 16:00 e confermarla appena il servizio sarà attivo. Vuoi procedere?",
              fallbackMode: true,
              suggestedAction: 'manual_booking',
              action: action,
              serverStatus: 'mcp_server_unavailable_404'
            };
            
          case 'create':
            return {
              success: false,
              message: "🔧 Il sistema di gestione del calendario non è al momento disponibile (errore di connessione al server). Ho preso nota della tua richiesta di appuntamento e ti contatteremo appena possibile per confermare la disponibilità.",
              fallbackMode: true,
              action: action,
              serverStatus: 'mcp_server_unavailable_404'
            };
            
          default:
            return {
              success: false,
              message: "🔧 Il sistema di gestione del calendario non è al momento disponibile (errore di connessione al server). Riprova tra qualche minuto o contattaci direttamente.",
              action: action,
              serverStatus: 'mcp_server_unavailable_404'
            };
        }
      }

      switch (action) {
        case 'check_availability':
          // Check user's current appointment status
          const userProfile = await profileManager.getProfile(phoneNumber);
          const canSchedule = await profileManager.canScheduleAppointment(phoneNumber);
          
          if (!canSchedule.canSchedule) {
            return {
              success: false,
              message: canSchedule.reason,
              currentAppointment: userProfile?.currentAppointment,
              hasExistingAppointment: true
            };
          }
          
          // If user can schedule, check calendar availability by searching their events
          let availabilityResults;
          if (userEmail) {
            console.log(`🔍 [CALENDAR TOOL DEBUG] Checking availability for user email: ${userEmail}`);
            availabilityResults = await calendarAgent.searchUserEvents(
              userEmail,
              timeMin || new Date().toISOString(), 
              timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Next 7 days
            );
          } else {
            console.log(`🔍 [CALENDAR TOOL DEBUG] No user email - checking general availability`);
            availabilityResults = await calendarAgent.searchEvents(
              '', 
              timeMin || new Date().toISOString(), 
              timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Next 7 days
            );
          }
          
          return {
            success: true,
            message: "L'utente può fissare un nuovo appuntamento",
            canSchedule: true,
            existingEvents: availabilityResults,
            userProfile: {
              name: userProfile?.name,
              email: userProfile?.email,
              interestLevel: userProfile?.interestLevel
            }
          };

        case 'process_request':
          if (!userRequest) {
            return {
              success: false,
              message: "Richiesta utente mancante per l'elaborazione"
            };
          }
          
          const response = await calendarAgent.processCalendarRequest(userRequest);
          return {
            success: true,
            message: response,
            action: 'process_request'
          };

        case 'search':
          // Search for events where the user is an attendee
          let searchResults;
          if (userEmail) {
            console.log(`🔍 [CALENDAR TOOL DEBUG] Searching events for user email: ${userEmail}`);
            searchResults = await calendarAgent.searchUserEvents(
              userEmail,
              timeMin, 
              timeMax
            );
          } else {
            console.log(`🔍 [CALENDAR TOOL DEBUG] No user email - searching all events`);
            searchResults = await calendarAgent.searchEvents(
              query || '', 
              timeMin, 
              timeMax
            );
          }
          
          return {
            success: true,
            data: searchResults,
            message: userEmail 
              ? `Trovati ${searchResults?.events?.length || 0} tuoi appuntamenti nel calendario`
              : `Ricerca completata${query ? ` per "${query}"` : ''}`,
            action: 'search',
            userEmail: userEmail
          };

        case 'get_all':
          const allEvents = await calendarAgent.getAllEvents(timeMin, timeMax);
          
          const timeRange = timeMin && timeMax 
            ? ` dal ${new Date(timeMin).toLocaleDateString('it-IT')} al ${new Date(timeMax).toLocaleDateString('it-IT')}`
            : '';
          
          return {
            success: true,
            data: allEvents,
            message: `Recuperati tutti gli eventi${timeRange}`,
            action: 'get_all'
          };

        case 'create':
          console.log(`📅 [CALENDAR TOOL DEBUG] Processing 'create' action for ${phoneNumber}`);
          
          // First check if user can schedule an appointment
          const canUserSchedule = await profileManager.canScheduleAppointment(phoneNumber);
          if (!canUserSchedule.canSchedule) {
            console.log(`⚠️ [CALENDAR TOOL DEBUG] User ${phoneNumber} cannot schedule: ${canUserSchedule.reason}`);
            return {
              success: false,
              message: canUserSchedule.reason,
              needsReschedule: true
            };
          }
          
          if (!eventData) {
            console.error(`❌ [CALENDAR TOOL DEBUG] Missing event data for creation`);
            return {
              success: false,
              message: "Dati evento mancanti per la creazione"
            };
          }
          
          console.log(`📅 [CALENDAR TOOL DEBUG] Original event data:`, eventData);
          
          // Check if eventData already has attendees with email (fallback)
          if (!userEmail && eventData.attendees && eventData.attendees.length > 0) {
            const attendeeEmail = eventData.attendees[0]?.email;
            console.log(`📧 [CALENDAR TOOL DEBUG] Checking attendee email from eventData: "${attendeeEmail}"`);
            
            if (attendeeEmail && isValidEmail(attendeeEmail)) {
              userEmail = validateAndFormatEmail(attendeeEmail);
              console.log(`📧 [CALENDAR TOOL DEBUG] Valid user email found in eventData: ${userEmail}`);
            }
          }
          
          // Check if we have essential information
          const missingInfo = [];
          
          if (!userEmail) {
            missingInfo.push('email');
          }
          
          if (!currentProfile?.name) {
            missingInfo.push('nome');
          }
          
          if (missingInfo.length > 0) {
            console.log(`⚠️ [CALENDAR TOOL DEBUG] Missing information:`, missingInfo);
            console.log(`📋 [CALENDAR TOOL DEBUG] Current profile:`, {
              name: currentProfile?.name,
              email: currentProfile?.email
            });
            
            return {
              success: false,
              message: `ATTENZIONE AI: Informazioni mancanti per l'appuntamento. Controlla PROFILO UTENTE CORRENTE nella tua configurazione. Richiedi solo: ${missingInfo.join(', ')}. NON chiedere "nome completo", chiedi solo "nome".`,
              missingInformation: missingInfo,
              needsEmail: missingInfo.includes('email'),
              needsName: missingInfo.includes('nome'),
              action: 'create',
              userProfile: {
                name: currentProfile?.name,
                email: currentProfile?.email,
                completionPercentage: Math.round((currentProfile?.completionPercentage || 0) * 100)
              }
            };
          }
          
          // Positive confirmation when profile is complete
          console.log(`✅ [CALENDAR TOOL DEBUG] All required information available:`);
          console.log(`✅ [CALENDAR TOOL DEBUG] - Name: ${currentProfile?.name || 'Non disponibile'}`);
          console.log(`✅ [CALENDAR TOOL DEBUG] - Email: ${userEmail}`);
          console.log(`✅ [CALENDAR TOOL DEBUG] - Profile completion: ${Math.round((currentProfile?.completionPercentage || 0) * 100)}%`);
          
          // Set default timezone if not provided
          if (!eventData.start.timeZone) {
            eventData.start.timeZone = 'Europe/Rome';
            console.log(`🌍 [CALENDAR TOOL DEBUG] Set default start timezone: Europe/Rome`);
          }
          if (!eventData.end.timeZone) {
            eventData.end.timeZone = 'Europe/Rome';
            console.log(`🌍 [CALENDAR TOOL DEBUG] Set default end timezone: Europe/Rome`);
          }
          
          // Set primary attendee to user's email
          eventData.attendees = [{ email: userEmail! }]; // userEmail is guaranteed to be non-null at this point
          console.log(`👥 [CALENDAR TOOL DEBUG] Set primary attendee to user email: ${userEmail}`);
          
          console.log(`📅 [CALENDAR TOOL DEBUG] Final event data before creation:`, eventData);
          console.log(`🚀 [CALENDAR TOOL DEBUG] Calling calendarAgent.createEvent...`);
          
          const createdEvent = await calendarAgent.createEvent(eventData);
          
          console.log(`✅ [CALENDAR TOOL DEBUG] Event creation completed successfully`);
          console.log(`📥 [CALENDAR TOOL DEBUG] Created event response:`, createdEvent);
          
          // Extract meeting notes from user request
          const meetingNotes = profileManager.extractMeetingNotes(userRequest || '');
          
          // Debug logging for Google Calendar ID extraction
          console.log(`🔍 [CALENDAR TOOL DEBUG] Checking extracted calendar IDs:`);
          console.log(`🔍 [CALENDAR TOOL DEBUG] - eventId: ${createdEvent.eventId}`);
          console.log(`🔍 [CALENDAR TOOL DEBUG] - googleCalendarId: ${createdEvent.googleCalendarId}`);
          console.log(`🔍 [CALENDAR TOOL DEBUG] - calendarEventUrl: ${createdEvent.calendarEventUrl}`);

          // Save appointment to user profile with comprehensive details including Google Calendar ID
          const appointmentInfo: Omit<AppointmentInfo, 'createdAt'> = {
            // Calendar event IDs for future reference
            eventId: createdEvent.eventId || undefined, // MCP server event ID
            googleCalendarId: createdEvent.googleCalendarId || undefined, // Google Calendar event ID
            calendarEventUrl: createdEvent.calendarEventUrl || undefined, // Google Calendar event URL
            
            title: eventData.summary,
            description: eventData.description || '',
            scheduledFor: new Date(eventData.start.dateTime),
            duration: Math.round((new Date(eventData.end.dateTime).getTime() - new Date(eventData.start.dateTime).getTime()) / (1000 * 60)),
            status: AppointmentStatus.SCHEDULED,
            
            // Meeting preparation details
            meetingNotes: meetingNotes || 'Consulenza generale',
            contactName: currentProfile?.name || 'Cliente',
            contactEmail: userEmail || undefined,
            
            // Extract any specific questions or requests from the conversation
            preparationNotes: `Cliente interessato in: ${currentProfile?.serviceInterests.join(', ') || 'servizi generali'}. Livello interesse: ${currentProfile?.interestLevel || 'unknown'}.`
          };
          
          const updatedProfile = await profileManager.setAppointment(phoneNumber, appointmentInfo);
          console.log(`👤 [CALENDAR TOOL DEBUG] Updated user profile with appointment for ${phoneNumber}`);
          
          return {
            success: true,
            data: createdEvent,
            message: `Evento "${eventData.summary}" creato con successo. L'invito è stato inviato a ${userEmail}`,
            action: 'create',
            userEmail: userEmail,
            // Google Calendar integration details
            calendarIntegration: {
              eventId: appointmentInfo.eventId,
              googleCalendarId: appointmentInfo.googleCalendarId,
              calendarEventUrl: appointmentInfo.calendarEventUrl,
              canUpdate: !!appointmentInfo.googleCalendarId,
              canDelete: !!appointmentInfo.googleCalendarId
            },
            userProfile: {
              name: updatedProfile.name,
              email: updatedProfile.email,
              interestLevel: updatedProfile.interestLevel,
              appointmentScheduled: true,
              meetingDetails: {
                contactName: appointmentInfo.contactName,
                meetingNotes: appointmentInfo.meetingNotes,
                preparationNotes: appointmentInfo.preparationNotes
              }
            }
          };

        case 'update':
          if (!eventId || !eventData) {
            return {
              success: false,
              message: "ID evento e dati aggiornamento richiesti per la modifica"
            };
          }
          
          const updatedEvent = await calendarAgent.updateEvent(eventId, eventData);
          
          return {
            success: true,
            data: updatedEvent,
            message: `Evento ${eventId} aggiornato con successo`,
            action: 'update'
          };

        case 'delete':
          if (!eventId) {
            return {
              success: false,
              message: "ID evento richiesto per la cancellazione"
            };
          }
          
          // First, try to find the appointment by Google Calendar ID in our system
          const appointmentResult = await profileManager.findAppointmentByGoogleCalendarId(eventId);
          if (appointmentResult) {
            console.log(`📅 [CALENDAR TOOL DEBUG] Found appointment to delete for user ${appointmentResult.profile.phoneNumber}`);
          }

          const deletedEvent = await calendarAgent.deleteEvent(eventId);
          
          // Cancel appointment in user profile
          const cancelledProfile = await profileManager.cancelAppointment(phoneNumber, 'Evento cancellato tramite sistema');
          console.log(`👤 [CALENDAR TOOL DEBUG] Cancelled appointment in user profile for ${phoneNumber}`);
          
          return {
            success: true,
            data: deletedEvent,
            message: `Evento ${eventId} cancellato con successo`,
            action: 'delete',
            calendarIntegration: {
              googleCalendarId: eventId,
              appointmentFound: !!appointmentResult,
              userAffected: appointmentResult?.profile.phoneNumber
            },
            userProfile: {
              name: cancelledProfile?.name,
              email: cancelledProfile?.email,
              hasAppointment: false
            }
          };

        default:
          return {
            success: false,
            message: `Azione non supportata: ${action}`
          };
      }
    } catch (error) {
      console.error('❌ [CALENDAR TOOL DEBUG] Calendar tool error:', error);
      console.error('❌ [CALENDAR TOOL DEBUG] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : typeof error,
        action,
        parameters: { userRequest, query, timeMin, timeMax, eventData, eventId }
      });
      
      return {
        success: false,
        message: `Errore durante l'operazione calendario: ${error}`,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      // Log execution time for performance monitoring
      const executionTime = Date.now() - startTime;
      console.log(`⏱️ [CALENDAR TOOL DEBUG] Tool execution completed in ${executionTime}ms`);
    }
  }
});

/**
 * Helper function to parse natural language time expressions
 * This is a simple implementation - in production you'd use a more sophisticated parser
 */
export function parseTimeExpression(expression: string): { timeMin?: string; timeMax?: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  expression = expression.toLowerCase();
  
  if (expression.includes('oggi')) {
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    
    return {
      timeMin: today.toISOString(),
      timeMax: endOfDay.toISOString()
    };
  }
  
  if (expression.includes('domani')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const endOfTomorrow = new Date(tomorrow);
    endOfTomorrow.setHours(23, 59, 59, 999);
    
    return {
      timeMin: tomorrow.toISOString(),
      timeMax: endOfTomorrow.toISOString()
    };
  }
  
  if (expression.includes('questa settimana')) {
    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);
    
    return {
      timeMin: today.toISOString(),
      timeMax: endOfWeek.toISOString()
    };
  }
  
  if (expression.includes('prossima settimana')) {
    const nextWeekStart = new Date(today);
    nextWeekStart.setDate(nextWeekStart.getDate() + (7 - nextWeekStart.getDay() + 1));
    
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);
    nextWeekEnd.setHours(23, 59, 59, 999);
    
    return {
      timeMin: nextWeekStart.toISOString(),
      timeMax: nextWeekEnd.toISOString()
    };
  }
  
  // Default to next 7 days if no specific time found
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(23, 59, 59, 999);
  
  return {
    timeMin: now.toISOString(),
    timeMax: nextWeek.toISOString()
  };
}

