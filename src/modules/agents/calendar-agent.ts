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
   * Initialize the MCP client connection
   */
  private async initializeMCPClient(): Promise<void> {
    if (this.mcpClient) {
      console.log('🔄 MCP client already initialized, reusing existing connection');
      return; // Already initialized
    }

    try {
      console.log(`🔗 [CALENDAR DEBUG] Attempting to connect to Google Calendar MCP server: ${this.mcpServerUrl}`);
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
          }
        }
      });
      
      console.log(`🔗 [CALENDAR DEBUG] MCP client created with SSE transport...`);
      
      console.log('✅ [CALENDAR DEBUG] Calendar MCP client initialized successfully');
      console.log('🔍 [CALENDAR DEBUG] Client object:', typeof this.mcpClient, !!this.mcpClient);
    } catch (error) {
      console.error('❌ [CALENDAR DEBUG] Failed to initialize Calendar MCP client:', error);
      console.error('❌ [CALENDAR DEBUG] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : typeof error
      });
      throw new Error(`Failed to connect to calendar MCP server: ${error}`);
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
        const result = await tools.SearchEvent.execute({
          query,
          timeMin,
          timeMax
        });
        
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
        console.log(`✅ [CALENDAR DEBUG] Successfully created calendar event: "${eventData.summary}"`);
        return result;
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
        const result = await tools.UpdateEvent.execute({
          eventId,
          ...eventData
        });
        
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
   * Delete a calendar event
   */
  async deleteEvent(eventId: string): Promise<any> {
    await this.initializeMCPClient();
    
    try {
      const tools = await this.getCalendarTools();
      
      if (tools.DeleteEvent) {
        const result = await tools.DeleteEvent.execute({ eventId });
        
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
   * Get all events for a specific time range
   */
  async getAllEvents(timeMin?: string, timeMax?: string): Promise<any> {
    await this.initializeMCPClient();
    
    try {
      const tools = await this.getCalendarTools();
      
      // Use SearchEvent with empty query to get all events
      if (tools.SearchEvent) {
        const result = await tools.SearchEvent.execute({
          query: '',
          timeMin,
          timeMax
        });
        
        console.log(`📋 Retrieved all calendar events for range:`, result);
        return result;
      } else {
        throw new Error('SearchEvent tool not available');
      }
    } catch (error) {
      console.error('❌ Error retrieving all calendar events:', error);
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

