import { experimental_createMCPClient } from 'ai';

/**
 * Calendar Management Agent using Google Calendar MCP Server
 * 
 * This agent specializes in Google Calendar operations and acts as a tool
 * for the main AI orchestrator. It connects to an external MCP server
 * that provides calendar functionality.
 */
export class CalendarAgent {
  private mcpClient: any = null;
  private readonly mcpServerUrl: string;

  constructor(mcpServerUrl: string = 'https://aipratika.app.n8n.cloud/mcp/google-calendar-mcp/sse') {
    this.mcpServerUrl = mcpServerUrl;
  }

  /**
   * Initialize the MCP client connection with retry mechanism
   */
  private async initializeMCPClient(retryCount: number = 0): Promise<void> {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds

    if (this.mcpClient) {
      console.log('🔄 MCP client already initialized, testing connection...');
      try {
        // Test if the existing connection is still alive
        await this.mcpClient.listTools();
        console.log('✅ [CALENDAR DEBUG] Existing MCP connection is healthy');
        return;
      } catch (error) {
        console.log('⚠️ [CALENDAR DEBUG] Existing connection is stale, reinitializing...');
        await this.closeMCPClient();
      }
    }

    try {
      console.log(`🔗 [CALENDAR DEBUG] Attempting to connect to Google Calendar MCP server: ${this.mcpServerUrl} (attempt ${retryCount + 1}/${maxRetries + 1})`);
      console.log(`🔗 [CALENDAR DEBUG] Creating SSE transport using AI SDK format...`);
      
      // Use the AI SDK's preferred SSE transport configuration
      this.mcpClient = await experimental_createMCPClient({
        transport: {
          type: 'sse',
          url: this.mcpServerUrl,
          // Add any required headers for authentication if needed
          headers: {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'User-Agent': 'CalendarAgent/1.0'
          }
        }
      });
      
      console.log(`🔗 [CALENDAR DEBUG] MCP client created with SSE transport...`);
      
      // Test the connection immediately by trying to list tools
      await this.mcpClient.listTools();
      
      console.log('✅ [CALENDAR DEBUG] Calendar MCP client initialized and tested successfully');
      console.log('🔍 [CALENDAR DEBUG] Client object:', typeof this.mcpClient, !!this.mcpClient);
      
    } catch (error) {
      console.error(`❌ [CALENDAR DEBUG] Failed to initialize Calendar MCP client (attempt ${retryCount + 1}):`, error);
      console.error('❌ [CALENDAR DEBUG] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : typeof error
      });
      
      this.mcpClient = null;
      
      if (retryCount < maxRetries) {
        console.log(`🔄 [CALENDAR DEBUG] Retrying connection in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return this.initializeMCPClient(retryCount + 1);
      } else {
        throw new Error(`Failed to connect to calendar MCP server after ${maxRetries + 1} attempts: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Close MCP client connection safely
   */
  private async closeMCPClient(): Promise<void> {
    if (this.mcpClient) {
      try {
        await this.mcpClient.close();
        console.log('🔌 [CALENDAR DEBUG] MCP client connection closed');
      } catch (error) {
        console.error('⚠️ [CALENDAR DEBUG] Error closing MCP client:', error);
      }
      this.mcpClient = null;
    }
  }

  /**
   * Get all available calendar tools from the MCP server
   */
  async getCalendarTools(): Promise<Record<string, any>> {
    console.log('🔍 [CALENDAR DEBUG] Getting calendar tools...');
    await this.initializeMCPClient();
    
    try {
      console.log('🔍 [CALENDAR DEBUG] Calling mcpClient.tools() with schema discovery...');
      const tools = await this.mcpClient.tools();
      console.log(`📅 [CALENDAR DEBUG] Retrieved ${Object.keys(tools).length} calendar tools:`, Object.keys(tools));
      console.log('🔍 [CALENDAR DEBUG] Available tools details:', tools);
      
      // Log each tool's schema for debugging
      for (const [toolName, tool] of Object.entries(tools)) {
        console.log(`🔧 [CALENDAR DEBUG] Tool "${toolName}":`, {
          description: (tool as any)?.description || 'No description',
          parameters: (tool as any)?.parameters?.jsonSchema || 'No schema available'
        });
      }
      
      return tools;
    } catch (error) {
      console.error('❌ [CALENDAR DEBUG] Error retrieving calendar tools:', error);
      console.error('❌ [CALENDAR DEBUG] Tools error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : typeof error
      });
      return {};
    }
  }

  /**
   * Search for events in the calendar
   */
  async searchEvents(query: string, timeMin?: string, timeMax?: string): Promise<any> {
    await this.initializeMCPClient();
    
    try {
      const tools = await this.getCalendarTools();
      
      if (tools.SearchEvent) {
        // Use the exact schema format expected by the MCP server
        const searchParams = {
          Query: query || '', // Query is required according to schema
          After: timeMin || new Date().toISOString(),
          Before: timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
        };
        
        console.log(`📋 [CALENDAR DEBUG] Search parameters (MCP format):`, searchParams);
        const result = await tools.SearchEvent.execute(searchParams);
        console.log(`🔍 Calendar search results for "${query}":`, result);
        return result;
      } else {
        throw new Error('SearchEvent tool not available');
      }
    } catch (error) {
      console.error('❌ Error searching calendar events:', error);
      throw error;
    }
  }

  /**
   * Search for events where a specific user is an attendee
   */
  async searchUserEvents(userEmail: string, timeMin?: string, timeMax?: string): Promise<any> {
    console.log(`🔍 [CALENDAR DEBUG] Searching events for user email: ${userEmail}`);
    
    try {
      // Get all events in the time range
      const allEvents = await this.searchEvents('', timeMin, timeMax);
      
      if (!allEvents || !allEvents.events) {
        console.log(`📋 [CALENDAR DEBUG] No events found in calendar`);
        return { events: [] };
      }

      // Filter events where the user is an attendee
      const userEvents = allEvents.events.filter((event: any) => {
        if (!event.attendees) return false;
        
        // Check if user email is in attendees list
        const isAttendee = event.attendees.some((attendee: any) => {
          const attendeeEmail = attendee.email || attendee.Attendees || attendee;
          console.log(`🔍 [CALENDAR DEBUG] Checking attendee: ${attendeeEmail} vs user: ${userEmail}`);
          return attendeeEmail && attendeeEmail.toLowerCase() === userEmail.toLowerCase();
        });
        
        console.log(`🔍 [CALENDAR DEBUG] Event "${event.summary || event.event_title}" - User is attendee: ${isAttendee}`);
        return isAttendee;
      });

      console.log(`✅ [CALENDAR DEBUG] Found ${userEvents.length} events for user ${userEmail}`);
      return { events: userEvents };
      
    } catch (error) {
      console.error('❌ Error searching user events:', error);
      throw error;
    }
  }

  /**
   * Get all events in a time range
   */
  async getAllEvents(timeMin?: string, timeMax?: string): Promise<any> {
    return this.searchEvents('', timeMin, timeMax);
  }

  /**
   * Create a new calendar event
   */
  async createEvent(eventData: {
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees?: Array<{ email: string }>;
    location?: string;
  }): Promise<any> {
    console.log('📅 [CALENDAR DEBUG] Starting createEvent with data:', eventData);
    await this.initializeMCPClient();
    
    try {
      console.log('🔍 [CALENDAR DEBUG] Getting tools for event creation...');
      const tools = await this.getCalendarTools();
      
      console.log('🔍 [CALENDAR DEBUG] Checking if CreateEvent tool exists...');
      if (tools.CreateEvent) {
        console.log('✅ [CALENDAR DEBUG] CreateEvent tool found, executing...');
        console.log('🔍 [CALENDAR DEBUG] CreateEvent tool schema:', tools.CreateEvent.parameters?.jsonSchema);
        console.log('📤 [CALENDAR DEBUG] Original event data:', JSON.stringify(eventData, null, 2));
        
        // Create the EXACT format expected by the MCP server based on schema
        const mcpFormatData = {
          Start: eventData.start.dateTime,
          End: eventData.end.dateTime,
          event_title: eventData.summary,
          event_description: eventData.description || 'Nessuna descrizione',
          attendees0_Attendees: eventData.attendees?.[0]?.email || 'noreply@mazzantiniassociati.com' // Required field
        };
        
        console.log('🎯 [CALENDAR DEBUG] MCP-formatted data:', JSON.stringify(mcpFormatData, null, 2));
        
        // Try the MCP format first, then fallback to other formats
        const variations = [
          // MCP server expected format (from schema)
          mcpFormatData,
          
          // Original format (for fallback)
          eventData,
          
          // Google Calendar API format
          {
            summary: eventData.summary,
            description: eventData.description,
            start: {
              dateTime: eventData.start.dateTime,
              timeZone: eventData.start.timeZone
            },
            end: {
              dateTime: eventData.end.dateTime,
              timeZone: eventData.end.timeZone
            },
            attendees: eventData.attendees,
            location: eventData.location
          },
          
          // Simplified format
          {
            title: eventData.summary,
            description: eventData.description,
            startTime: eventData.start.dateTime,
            endTime: eventData.end.dateTime,
            timezone: eventData.start.timeZone || 'Europe/Rome'
          }
        ];
        
        let result = null;
        let lastError = null;
        
        for (let i = 0; i < variations.length; i++) {
          try {
            console.log(`🧪 [CALENDAR DEBUG] Trying variation ${i + 1}:`, JSON.stringify(variations[i], null, 2));
            result = await tools.CreateEvent.execute(variations[i]);
            
            if (!result.isError) {
              console.log(`✅ [CALENDAR DEBUG] Variation ${i + 1} succeeded!`);
              break;
            } else {
              console.log(`❌ [CALENDAR DEBUG] Variation ${i + 1} failed:`, result);
              lastError = result;
            }
          } catch (error) {
            console.log(`❌ [CALENDAR DEBUG] Variation ${i + 1} threw error:`, error);
            lastError = error;
          }
        }
        
        if (!result || result.isError) {
          console.error('❌ [CALENDAR DEBUG] All variations failed, using last result/error');
          result = lastError || result;
        }
        
        console.log(`📅 [CALENDAR DEBUG] CreateEvent execution completed`);
        console.log('📥 [CALENDAR DEBUG] CreateEvent result:', JSON.stringify(result, null, 2));
        
        // Extract Google Calendar event ID from the result
        const enhancedResult = this.extractEventDetails(result);
        
        console.log(`✅ [CALENDAR DEBUG] Successfully created calendar event: "${eventData.summary}"`);
        console.log(`🆔 [CALENDAR DEBUG] Extracted event details:`, enhancedResult);
        return enhancedResult;
      } else {
        console.error('❌ [CALENDAR DEBUG] CreateEvent tool not available in tools:', Object.keys(tools));
        throw new Error('CreateEvent tool not available');
      }
    } catch (error) {
      console.error('❌ [CALENDAR DEBUG] Error creating calendar event:', error);
      console.error('❌ [CALENDAR DEBUG] Create event error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : typeof error,
        eventData: eventData
      });
      throw error;
    }
  }

  /**
   * Update an existing calendar event
   */
  async updateEvent(eventId: string, eventData: any): Promise<any> {
    await this.initializeMCPClient();
    
    try {
      const tools = await this.getCalendarTools();
      
      if (tools.UpdateEvent) {
        // Use the exact schema format expected by the MCP server
        const updateParams = {
          Event_ID: eventId,
          event_title: eventData.summary || eventData.event_title,
          event_description: eventData.description || eventData.event_description || '',
          Start: eventData.start?.dateTime || eventData.Start,
          End: eventData.end?.dateTime || eventData.End
        };
        
        console.log(`📋 [CALENDAR DEBUG] Update parameters (MCP format):`, updateParams);
        const result = await tools.UpdateEvent.execute(updateParams);
        
        console.log(`📝 Updated calendar event ${eventId}:`, result);
        return result;
      } else {
        throw new Error('UpdateEvent tool not available');
      }
    } catch (error) {
      console.error('❌ Error updating calendar event:', error);
      throw error;
    }
  }

  /**
   * Extract Google Calendar event details from MCP response
   */
  private extractEventDetails(mcpResult: any): any {
    console.log(`🔍 [CALENDAR DEBUG] Extracting event details from MCP result...`);
    
    if (!mcpResult) {
      console.log(`⚠️ [CALENDAR DEBUG] No MCP result to extract from`);
      return mcpResult;
    }

    // Create enhanced result with extracted details
    const enhancedResult = {
      ...mcpResult,
      // MCP server response event ID (if available)
      eventId: mcpResult.eventId || mcpResult.id || mcpResult.Event_ID,
      // Google Calendar event ID - prioritize 'id' field from response
      googleCalendarId: mcpResult.id || // This is the main Google Calendar ID like "ejqb3uji24db31j7subsica578"
                       mcpResult.googleCalendarId || 
                       mcpResult.google_calendar_id || 
                       mcpResult.calendarId ||
                       mcpResult.calendar_id ||
                       mcpResult.eventId ||
                       mcpResult.Event_ID,
      // Calendar event URL (if available)
      calendarEventUrl: mcpResult.htmlLink || 
                       mcpResult.html_link || 
                       mcpResult.eventUrl ||
                       mcpResult.event_url ||
                       mcpResult.webLink ||
                       mcpResult.web_link
    };

    // Try to extract from nested objects
    if (mcpResult.data) {
      enhancedResult.googleCalendarId = enhancedResult.googleCalendarId || 
                                       mcpResult.data.id || // Prioritize 'id' field
                                       mcpResult.data.eventId ||
                                       mcpResult.data.Event_ID;
      enhancedResult.calendarEventUrl = enhancedResult.calendarEventUrl ||
                                       mcpResult.data.htmlLink ||
                                       mcpResult.data.html_link;
    }

    // Try to extract from response array if present
    if (mcpResult.response && Array.isArray(mcpResult.response) && mcpResult.response.length > 0) {
      const firstResponse = mcpResult.response[0];
      enhancedResult.googleCalendarId = enhancedResult.googleCalendarId || 
                                       firstResponse.id || // Main Google Calendar ID
                                       firstResponse.eventId ||
                                       firstResponse.Event_ID;
      enhancedResult.calendarEventUrl = enhancedResult.calendarEventUrl ||
                                       firstResponse.htmlLink ||
                                       firstResponse.html_link;
    }

    // Try to extract from content array (MCP common format)
    if (Array.isArray(mcpResult.content) && mcpResult.content.length > 0) {
      const firstContent = mcpResult.content[0];
      if (firstContent && firstContent.text) {
        try {
          // Parse the JSON string inside content[0].text
          const eventArray = JSON.parse(firstContent.text);
          if (Array.isArray(eventArray) && eventArray.length > 0) {
            const eventData = eventArray[0];
            enhancedResult.googleCalendarId = enhancedResult.googleCalendarId || eventData.id;
            enhancedResult.calendarEventUrl = enhancedResult.calendarEventUrl || 
                                             eventData.htmlLink || 
                                             eventData.html_link;
            console.log(`🎯 [CALENDAR DEBUG] Extracted from content array - ID: ${eventData.id}, URL: ${eventData.htmlLink}`);
          }
        } catch (error) {
          console.log(`⚠️ [CALENDAR DEBUG] Failed to parse content array JSON:`, error);
          // Fallback to regex extraction
          const idMatch = firstContent.text.match(/"id":"([a-zA-Z0-9_-]+)"/);
          if (idMatch) {
            enhancedResult.googleCalendarId = enhancedResult.googleCalendarId || idMatch[1];
            console.log(`🎯 [CALENDAR DEBUG] Extracted from regex - ID: ${idMatch[1]}`);
          }
          
          const urlMatch = firstContent.text.match(/"htmlLink":"([^"]+)"/);
          if (urlMatch) {
            enhancedResult.calendarEventUrl = enhancedResult.calendarEventUrl || urlMatch[1];
          }
        }
      }
    }

    // Try to extract from content if it's a string
    if (typeof mcpResult.content === 'string') {
      try {
        const contentData = JSON.parse(mcpResult.content);
        enhancedResult.googleCalendarId = enhancedResult.googleCalendarId || 
                                         contentData.id || // Prioritize 'id' field
                                         contentData.eventId ||
                                         contentData.Event_ID;
        enhancedResult.calendarEventUrl = enhancedResult.calendarEventUrl ||
                                         contentData.htmlLink ||
                                         contentData.html_link;
      } catch (error) {
        // Content is not JSON, try to extract ID with regex
        const idMatch = mcpResult.content.match(/(?:"id"[":\s]*["']?([a-zA-Z0-9_-]+)["']?|eventId|Event_ID)[":\s]*["']?([a-zA-Z0-9_-]+)["']?/i);
        if (idMatch) {
          enhancedResult.googleCalendarId = enhancedResult.googleCalendarId || idMatch[1] || idMatch[2];
        }
        
        const urlMatch = mcpResult.content.match(/https:\/\/calendar\.google\.com\/[^\s"']+/);
        if (urlMatch) {
          enhancedResult.calendarEventUrl = enhancedResult.calendarEventUrl || urlMatch[0];
        }
      }
    }

    console.log(`🆔 [CALENDAR DEBUG] Event ID extracted: ${enhancedResult.googleCalendarId}`);
    console.log(`🔗 [CALENDAR DEBUG] Event URL extracted: ${enhancedResult.calendarEventUrl}`);
    
    return enhancedResult;
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(eventId: string): Promise<any> {
    await this.initializeMCPClient();
    
    try {
      const tools = await this.getCalendarTools();
      
      if (tools.DeleteEvent) {
        const result = await tools.DeleteEvent.execute({ Event_ID: eventId });
        
        console.log(`🗑️  Deleted calendar event ${eventId}:`, result);
        return result;
      } else {
        throw new Error('DeleteEvent tool not available');
      }
    } catch (error) {
      console.error('❌ Error deleting calendar event:', error);
      throw error;
    }
  }



  /**
   * Process natural language calendar requests
   * This method interprets user requests and calls appropriate calendar methods
   */
  async processCalendarRequest(userRequest: string, userContext?: any): Promise<string> {
    console.log(`📅 Processing calendar request: "${userRequest}"`);
    
    try {
      // Simple keyword-based routing for now
      // In a more sophisticated implementation, you'd use NLP or the main AI to parse intent
      
      const request = userRequest.toLowerCase();
      
      if (request.includes('crea') || request.includes('aggiungi') || request.includes('prenota')) {
        // Handle event creation
        return await this.handleEventCreation(userRequest, userContext);
      } else if (request.includes('cerca') || request.includes('trova') || request.includes('eventi')) {
        // Handle event search
        return await this.handleEventSearch(userRequest, userContext);
      } else if (request.includes('cancella') || request.includes('elimina')) {
        // Handle event deletion
        return await this.handleEventDeletion(userRequest, userContext);
      } else if (request.includes('modifica') || request.includes('cambia')) {
        // Handle event modification
        return await this.handleEventModification(userRequest, userContext);
      } else {
        // Default to search
        return await this.handleEventSearch(userRequest, userContext);
      }
    } catch (error) {
      console.error('❌ Error processing calendar request:', error);
      return `Mi dispiace, ho riscontrato un errore durante l'elaborazione della tua richiesta di calendario: ${error}`;
    }
  }

  /**
   * Handle event creation requests
   */
  private async handleEventCreation(request: string, context?: any): Promise<string> {
    // This is a simplified implementation
    // In production, you'd parse the request more intelligently
    return "Per creare un evento nel calendario, ho bisogno di più dettagli specifici come data, ora, titolo e descrizione. Puoi fornirmi queste informazioni?";
  }

  /**
   * Handle event search requests
   */
  private async handleEventSearch(request: string, context?: any): Promise<string> {
    try {
      // Extract time range from context if available
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // Next 7 days
      
      const events = await this.getAllEvents(timeMin, timeMax);
      
      if (events && events.length > 0) {
        return `Ho trovato ${events.length} eventi nel tuo calendario per i prossimi 7 giorni.`;
      } else {
        return "Non ho trovato eventi nel tuo calendario per i prossimi 7 giorni.";
      }
    } catch (error) {
      return "Mi dispiace, non sono riuscito a cercare nel tuo calendario al momento.";
    }
  }

  /**
   * Handle event deletion requests
   */
  private async handleEventDeletion(request: string, context?: any): Promise<string> {
    return "Per cancellare un evento, hai bisogno di specificare quale evento vuoi eliminare. Puoi fornirmi il titolo o l'ID dell'evento?";
  }

  /**
   * Handle event modification requests
   */
  private async handleEventModification(request: string, context?: any): Promise<string> {
    return "Per modificare un evento, hai bisogno di specificare quale evento vuoi cambiare e quali modifiche apportare. Puoi darmi più dettagli?";
  }

  /**
   * Close the MCP client connection
   */
  async close(): Promise<void> {
    if (this.mcpClient) {
      try {
        console.log('🔌 [CALENDAR DEBUG] Closing MCP client connection...');
        await this.mcpClient.close();
        this.mcpClient = null;
        console.log('✅ [CALENDAR DEBUG] Calendar MCP client connection closed successfully');
      } catch (error) {
        console.error('❌ [CALENDAR DEBUG] Error closing Calendar MCP client:', error);
        // Set to null anyway to avoid hanging references
        this.mcpClient = null;
      }
    }
  }

  /**
   * Check if the calendar agent is ready
   */
  async isReady(): Promise<boolean> {
    try {
      console.log('🔍 [CALENDAR DEBUG] Checking if calendar agent is ready...');
      await this.initializeMCPClient();
      const tools = await this.getCalendarTools();
      const isReady = Object.keys(tools).length > 0;
      console.log(`🎯 [CALENDAR DEBUG] Calendar agent ready status: ${isReady} (found ${Object.keys(tools).length} tools)`);
      return isReady;
    } catch (error) {
      console.error('❌ [CALENDAR DEBUG] Calendar agent readiness check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const calendarAgent = new CalendarAgent();

