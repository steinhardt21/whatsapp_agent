import { tool, generateText } from 'ai';
import { z } from 'zod';
import { anthropic } from '@ai-sdk/anthropic';

/**
 * Calendar Management Tool for Call Scheduling
 * 
 * This tool allows the AI assistant to schedule, modify, and cancel calls/meetings 
 * through Google Calendar via an MCP (Model Context Protocol) server.
 * It's specifically designed for call scheduling with Francesco di Gyver.
 */

export const calendarTool = tool({
  description: `
   Strumento per la gestione del calendario per la programmazione di chiamate con Francesco di Gyver:
    - Programmare nuove chiamate/appuntamenti nel calendario
    - Modificare chiamate esistenti (orario, durata, dettagli)
    - Cancellare chiamate programmate
    - Visualizzare disponibilità del calendario.`,

  inputSchema: z.object({
    action: z.enum(['create', 'delete', 'modify', 'view']),
    userId: z.string().describe('ID dell\'utente'),
    userRequest: z.string().describe('Richiesta dell\'utente in linguaggio naturale per la gestione del calendario'),
    phoneNumber: z.string().optional().describe('Numero di telefono del chiamante (per eventi di tipo chiamata)'),
    googleCalendarId: z.string().optional().describe('ID specifico del calendario Google (opzionale) dell\'appuntamento se esiste'),
    currentAppointmentInfo: z.string().optional().describe('Informazioni sull\'appuntamento corrente (opzionale) se ne esiste uno')
  }),

  execute: async ({ action, userRequest, phoneNumber, googleCalendarId, userId, currentAppointmentInfo }: {
    action: 'create' | 'delete' | 'modify' | 'view',
    userRequest: string,
    phoneNumber?: string,
    googleCalendarId?: string,
    userId: string,
    currentAppointmentInfo?: string
  }) => {

    console.log('🟠111**** User request:', userRequest);

    try {
      console.log(`🗓️ [CALENDAR TOOL] Executing ${action} action for user request: "${userRequest}"`);
      const now = new Date();
      const romeTime = new Intl.DateTimeFormat('it-IT', {
        timeZone: 'Europe/Rome',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      const currentDateTime = romeTime.format(now);

      const { text, reasoningText, reasoning, toolCalls, toolResults: toolResults2 } = await generateText({
        model: anthropic("claude-4-sonnet-20250514"),
        toolChoice: "auto",
        tools: {
          updateEventCalendar: tool({
            name: 'updateEventCalendar',
            description: 'Update an existing event in the calendar. To use when the user wants to change the time of an existing event.',
            inputSchema: z.object({
              newEventStartTime: z.string().describe('New start time of the event in ISO 8601 format with timezone (e.g., 2025-08-16T17:14:40.959+02:00)'),
              newEventEndTime: z.string().describe('New end time of the event in ISO 8601 format with timezone (e.g., 2025-08-16T18:14:40.959+02:00)'),
              googleCalendarId: z.string().describe('Google Calendar ID of the event necessary to update the event'),
            }),
            execute: async ({ newEventStartTime, newEventEndTime, googleCalendarId }) => {
              console.log(`🗓️ [CALENDAR TOOL] Updating event: ${googleCalendarId}`);

              const response = await fetch('https://gyver.app.n8n.cloud/webhook/00912b7c-b6c2-46dc-9ebd-5add9efafe79', {
                method: 'POST',
                body: JSON.stringify({
                  type: 'updateEvent',
                  userId,
                  googleCalendarId,
                  newEventStartTime,
                  newEventEndTime
                })
              });

              const data = await response.json();

              console.log(`🗓️ [CALENDAR TOOL] MCP Response:`, data);

              return {
                success: true,
                message: data
              };
            }
          }),
          deleteEventCalendar: tool({
            name: 'deleteEventCalendar',
            description: 'Delete an existing event in the calendar. To use when the user wants to cancel an existing event.',
            inputSchema: z.object({
              googleCalendarIdEvent: z.string().describe('Google Calendar ID of the event necessary to delete the event'),
            }),
            execute: async ({ googleCalendarIdEvent }) => {

              console.log(`🗓️ [CALENDAR TOOL] Deleting event: ${googleCalendarIdEvent}`);

              const response = await fetch('https://gyver.app.n8n.cloud/webhook/00912b7c-b6c2-46dc-9ebd-5add9efafe79', {
                method: 'POST',
                body: JSON.stringify({
                  type: 'deleteEvent',
                  userId,
                  googleCalendarId
                })
              });

              const data = await response.json();


              // Control in the database if the event exists

              console.log(`🗓️ [CALENDAR TOOL] MCP Response:`, data);

              return {
                success: true,
                message: data
              };
            }
          }),
          createEventCalendar: tool({
            name: 'createEventCalendar',
            description: 'Create a new event in the calendar',
            inputSchema: z.object({
              eventName: z.string(),
              eventDescription: z.string(),
              eventStartTime: z.string().describe('Event start time in ISO 8601 format with timezone (e.g., 2025-08-16T17:14:40.959+02:00)'),
              eventEndTime: z.string().describe('Event end time in ISO 8601 format with timezone (e.g., 2025-08-16T18:14:40.959+02:00)'),
            }),
            execute: async ({ eventName, eventDescription, eventStartTime, eventEndTime }) => {
              console.log(`🗓️ [CALENDAR TOOL] Creating event: ${eventName} on ${eventStartTime} at ${eventEndTime}`);

              const response = await fetch('https://gyver.app.n8n.cloud/webhook/00912b7c-b6c2-46dc-9ebd-5add9efafe79', {
                method: 'POST',
                body: JSON.stringify({
                  type: 'createEvent',
                  userId,
                  eventName,
                  eventDescription,
                  eventStartTime,
                  eventEndTime
                })
              });

              const data = await response.json();

              console.log(`🗓️ [CALENDAR TOOL] MCP Response:`, data);

              return {
                success: true,
                message: data
              };
            }
          }),
        },
        system: 
        `   <role>
              You are a professional calendar assistant for Francesco di Gyver.
              Your current task is to ${action.toUpperCase()} calendar events/calls based on the user's request.

              At the end summaries the result obtained from your operations. Specifically, if you have created, modified or deleted an event, you must return the result of the operation.
            </role>

            <context>
            <current_time>
            The current time in Rome is: ${currentDateTime}
            </current_time>
            <timezone>Europe/Rome (+01:00 or +02:00 depending on DST)</timezone>
            <default_duration>30 minutes unless specified otherwise</default_duration>
            ${currentAppointmentInfo ? `
            <existing_appointments>
            ${currentAppointmentInfo}
            </existing_appointments>` : ''}

            <google_calendar_id>
            ${googleCalendarId ? `
            The Google Calendar ID of the appointment is: ${googleCalendarId}
            ` : ''}
            </google_calendar_id>
            </context>

            <tools>
            <tool name="createEventCalendar">
              <description>Creates new calendar events</description>
              <when_to_use>
                <trigger_phrases>
                  - "vorrei un appuntamento"
                  - "programma una chiamata" 
                  - "book a meeting"
                </trigger_phrases>
                <conditions>User wants to schedule a new appointment/call</conditions>
              </when_to_use>
              <required_parameters>
                - eventName
                - eventDescription
                - eventStartTime (ISO 8601 format with timezone)
                - eventEndTime (ISO 8601 format with timezone)
              </required_parameters>
              <example>Creating "Chiamata con Alex Enache" for tomorrow at 14:00</example>
            </tool>

            <tool name="updateEventCalendar">
              <description>Modifies existing calendar events</description>
              <when_to_use>
                <trigger_phrases>
                  - "cambia l'orario"
                  - "sposta alle"
                  - "modifica l'appuntamento"
                </trigger_phrases>
                <conditions>User wants to change the time/date of an existing appointment</conditions>
              </when_to_use>
              <required_parameters>
                - eventId (from existing appointments)
                - newEventStartTime (ISO 8601 format with timezone)
                - newEventEndTime (ISO 8601 format with timezone)
              </required_parameters>
              <important_notes>
                - Format all dates and times in ISO 8601 format with timezone information
                - Example format: 2025-08-16T17:14:40.959+02:00
                - Duration remains 30 minutes if not specified
              </important_notes>
              <example>Moving existing appointment from 15:00 to 16:00</example>
            </tool>

            <tool name="deleteEventCalendar">
              <description>Removes calendar events</description>
              <when_to_use>
                <trigger_phrases>
                  - "cancella l'appuntamento"
                  - "elimina"
                  - "annulla la chiamata"
                </trigger_phrases>
                <conditions>User wants to cancel/delete an existing appointment</conditions>
              </when_to_use>
              <required_parameters>
                - eventId (from existing appointments)
              </required_parameters>
              <example>Cancelling today's appointment at 14:00</example>
            </tool>


            <behavior_guidelines>
            <datetime_formatting>
            - Always use ISO 8601 format with timezone information
            - Use Europe/Rome timezone (+01:00 or +02:00 depending on DST)
            - Example: 2025-08-16T17:14:40.959+02:00
            </datetime_formatting>

            <response_approach>
            - Identify user intent from trigger phrases
            - If the user request requires calendar action, select appropriate tool based on the action requested
            - If the user request is informational or unclear, provide a helpful text response without calling tools
            - Ensure all required parameters are available before executing tools
            - After executing tools, always provide a clear text summary of what was accomplished
            - Include specific details about created, modified, or deleted events in your response
            - Always respond in text when tools are not needed or when clarification is required
            ${currentAppointmentInfo ? `
            - IMPORTANT: When existing appointments are provided, use the Google Calendar IDs from that information for delete/modify operations
            - Match appointment details (date, time) from user requests with the existing appointments to identify which event to modify/delete
            - Use the appointment ID and Google Calendar ID from the existing appointments data when calling tools` : ''}
            </response_approach>

            <language_handling>
            - Respond in Italian when user communicates in Italian
            - Support multilingual calendar event names and descriptions
            - Maintain professional tone throughout interactions
            </language_handling>
            </behavior_guidelines>`,
        messages: [{ role: 'user', content: userRequest }],
      });

      console.log('🟠111**** User Request:', userRequest)

      // console.log(`🗓️ [CALENDAR TOOL] MCP Response:`, response.text);


      // console.log(`🗓️ [CALENDAR TOOL] Response:`, response);


      console.log('🟠111**** Response AGENT CALENDAR:', text);
      console.log('🟠111**** Tool Calls:', toolCalls);
      console.log('🟠111**** Tool Results:', toolResults2);
      console.log('🟠111**** Reasoning:', reasoning);
      console.log('🟠111**** Reasoning Text:', reasoningText);

      // Compile tool execution results for the orchestrator from toolResults2
      let processedToolResults: any[] = [];
      let fullMessage = text;

      // Process toolResults2 which contains the actual tool execution results
      if (toolResults2 && toolResults2.length > 0) {
        console.log('🟠 Processing toolResults2:', toolResults2);
        
        for (const toolResult of toolResults2) {
          // Extract data from the toolResults2 structure
          const toolName = toolResult.toolName || 'Unknown Tool';
          const input = toolResult.input || {};
          const output = toolResult.output || {};
          
          processedToolResults.push({
            toolCallId: toolResult.toolCallId,
            toolName: toolName,
            input: input,
            output: output,
            success: (output as any)?.success ?? false,
            message: (output as any)?.message
          });
        }

        // Create comprehensive summary for the orchestrator
        if (processedToolResults.length > 0) {
          const toolSummaries = processedToolResults.map(tr => {
            try {
              const success = tr.success ? 'Success' : 'Failed';
              const toolName = tr.toolName;
              
              // Create a more detailed summary based on tool type
              let detailMessage = '';
              if (tr.message) {
                if (typeof tr.message === 'object') {
                  // Handle different tool response formats
                  if (toolName === 'getEventsCalendar' && Array.isArray(tr.message)) {
                    detailMessage = `Found ${tr.message.length} events`;
                  } else if (toolName === 'createEventCalendar' && tr.message.id) {
                    detailMessage = `Event created with ID: ${tr.message.id}`;
                  } else if (toolName === 'updateEventCalendar') {
                    detailMessage = 'Event updated successfully';
                  } else if (toolName === 'deleteEventCalendar') {
                    detailMessage = 'Event deleted successfully';
                  } else {
                    detailMessage = JSON.stringify(tr.message);
                  }
                } else {
                  detailMessage = String(tr.message);
                }
              } else {
                detailMessage = 'No details available';
              }
              
              return `${toolName}: ${success} - ${detailMessage}`;
            } catch (e) {
              return `${tr.toolName}: Result processing error - ${e}`;
            }
          }).join('\n');

          // Add the summary to the full message
          fullMessage = text + (text ? '\n\n' : '') + `📋 Riepilogo operazioni:\n${toolSummaries}`;
        }
      }

      console.log('🟠 Processed Tool Results Count:', processedToolResults.length);
      console.log('🟠 Full Message for Orchestrator:', fullMessage);

      return {
        success: true,
        message: text + '\n\n' + fullMessage,
        action: action,
        phoneNumber: phoneNumber,
        toolCalls: toolCalls?.length || 0,
        toolResults: processedToolResults, // Include detailed tool results for orchestrator
        rawToolResults: toolResults2 // Include raw tool results for debugging
      };

    } catch (error) {
      console.error(`❌ [CALENDAR TOOL] Error executing ${action}:`, error);

      return {
        success: false,
        message: `Errore durante l'operazione del calendario: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
        action: action,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  },

  name: 'calendarManagement'

});

/**
 * Helper function to parse natural language time expressions
 * This is a simple implementation - in production you'd use a more sophisticated parser
 */
// export function parseTimeExpression(expression: string): { timeMin?: string; timeMax?: string } {
//   const now = new Date();
//   const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

//   expression = expression.toLowerCase();

//   if (expression.includes('oggi')) {
//     const endOfDay = new Date(today);
//     endOfDay.setHours(23, 59, 59, 999);

//     return {
//       timeMin: today.toISOString(),
//       timeMax: endOfDay.toISOString()
//     };
//   }

//   if (expression.includes('domani')) {
//     const tomorrow = new Date(today);
//     tomorrow.setDate(tomorrow.getDate() + 1);

//     const endOfTomorrow = new Date(tomorrow);
//     endOfTomorrow.setHours(23, 59, 59, 999);

//     return {
//       timeMin: tomorrow.toISOString(),
//       timeMax: endOfTomorrow.toISOString()
//     };
//   }

//   if (expression.includes('questa settimana')) {
//     const endOfWeek = new Date(today);
//     endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
//     endOfWeek.setHours(23, 59, 59, 999);

//     return {
//       timeMin: today.toISOString(),
//       timeMax: endOfWeek.toISOString()
//     };
//   }

//   if (expression.includes('prossima settimana')) {
//     const nextWeekStart = new Date(today);
//     nextWeekStart.setDate(nextWeekStart.getDate() + (7 - nextWeekStart.getDay() + 1));

//     const nextWeekEnd = new Date(nextWeekStart);
//     nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);
//     nextWeekEnd.setHours(23, 59, 59, 999);

//     return {
//       timeMin: nextWeekStart.toISOString(),
//       timeMax: nextWeekEnd.toISOString()
//     };
//   }

//   // Default to next 7 days if no specific time found
//   const nextWeek = new Date(today);
//   nextWeek.setDate(nextWeek.getDate() + 7);
//   nextWeek.setHours(23, 59, 59, 999);

//   return {
//     timeMin: now.toISOString(),
//     timeMax: nextWeek.toISOString()
//   };
// }

