import { tool } from 'ai';
import { z } from 'zod';
import { calendarAgent } from '../agents/calendar-agent.js';

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
      'process_request'
    ]).describe('Tipo di operazione da eseguire sul calendario'),
    
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
      console.log(`📅 [CALENDAR TOOL DEBUG] Calendar tool executing action: ${action}`);
      console.log(`📅 [CALENDAR TOOL DEBUG] Tool parameters:`, {
        action,
        userRequest,
        query,
        timeMin,
        timeMax,
        eventData,
        eventId
      });
      
      // Check if calendar agent is ready
      console.log(`🔍 [CALENDAR TOOL DEBUG] Checking if calendar agent is ready...`);
      const isReady = await calendarAgent.isReady();
      console.log(`🎯 [CALENDAR TOOL DEBUG] Calendar agent ready: ${isReady}`);
      
      if (!isReady) {
        console.warn(`⚠️ [CALENDAR TOOL DEBUG] Calendar agent not ready, returning error response`);
        return {
          success: false,
          message: "Il servizio calendario non è al momento disponibile. Riprova più tardi."
        };
      }

      switch (action) {
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
          const searchResults = await calendarAgent.searchEvents(
            query || '', 
            timeMin, 
            timeMax
          );
          
          return {
            success: true,
            data: searchResults,
            message: `Ricerca completata${query ? ` per "${query}"` : ''}`,
            action: 'search'
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
          console.log(`📅 [CALENDAR TOOL DEBUG] Processing 'create' action`);
          if (!eventData) {
            console.error(`❌ [CALENDAR TOOL DEBUG] Missing event data for creation`);
            return {
              success: false,
              message: "Dati evento mancanti per la creazione"
            };
          }
          
          console.log(`📅 [CALENDAR TOOL DEBUG] Original event data:`, eventData);
          
          // Set default timezone if not provided
          if (!eventData.start.timeZone) {
            eventData.start.timeZone = 'Europe/Rome';
            console.log(`🌍 [CALENDAR TOOL DEBUG] Set default start timezone: Europe/Rome`);
          }
          if (!eventData.end.timeZone) {
            eventData.end.timeZone = 'Europe/Rome';
            console.log(`🌍 [CALENDAR TOOL DEBUG] Set default end timezone: Europe/Rome`);
          }
          
          // Ensure attendees array exists (required by MCP server)
          if (!eventData.attendees || eventData.attendees.length === 0) {
            eventData.attendees = [{ email: 'info@mazzantiniassociati.com' }];
            console.log(`👥 [CALENDAR TOOL DEBUG] Set default attendee: info@mazzantiniassociati.com`);
          }
          
          console.log(`📅 [CALENDAR TOOL DEBUG] Final event data before creation:`, eventData);
          console.log(`🚀 [CALENDAR TOOL DEBUG] Calling calendarAgent.createEvent...`);
          
          const createdEvent = await calendarAgent.createEvent(eventData);
          
          console.log(`✅ [CALENDAR TOOL DEBUG] Event creation completed successfully`);
          console.log(`📥 [CALENDAR TOOL DEBUG] Created event response:`, createdEvent);
          
          return {
            success: true,
            data: createdEvent,
            message: `Evento "${eventData.summary}" creato con successo`,
            action: 'create'
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
          
          await calendarAgent.deleteEvent(eventId);
          
          return {
            success: true,
            message: `Evento ${eventId} cancellato con successo`,
            action: 'delete'
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

