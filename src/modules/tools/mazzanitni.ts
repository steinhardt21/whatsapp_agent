import { tool } from 'ai';
import { z } from 'zod';
import { 
  isRelevantMazzantiniQuery, 
  researchMazzantiniQuery,
  handleMazzantiniResearch 
} from '../agents/research-agent.js';

/**
 * Advanced research tool using functional programming approach
 * Delegates to pure functions for Mazzantini & Associati research
 */
export const mazzantiniResearchTool = tool({
  description: 'COMPREHENSIVE research tool for Mazzantini & Associati SA. Access complete company information including: 30+ years history, all services (digital marketing, Web3, blockchain, NFT, AI, traditional), team details (Roberto Mazzantini CEO bio, 8 specialists), innovative approaches (Comunicazione Integrata Multicanale©, YouChainSwiss partnership), philosophy ("we use prompts, we stay humans"), MazzantiniNext division, and detailed service capabilities.',
  parameters: z.object({
    query: z.string().describe('Any question about Mazzantini & Associati: services, prices, team, history, capabilities, AI approach, Web3, blockchain, NFT, events, digital marketing, traditional services, philosophy, or company information'),
    category: z.string().optional().describe('Optional category: company_overview, traditional_services, innovation_services, ai_approach, team_expertise, partnerships, web3_blockchain, history')
  }),
  execute: async ({ query, category }) => {
    try {
      // Use the functional approach with automatic relevance checking
      const result = await handleMazzantiniResearch(query, 'WhatsApp conversation context');
      
      if (!result) {
        // Query not relevant for Mazzantini research
        return {
          type: 'not_relevant',
          message: 'This query is not related to Mazzantini & Associati. I can only help with questions about our company, services, and capabilities.',
          confidence: 0.2
        };
      }

      return {
        type: 'research_result',
        answer: result.answer,
        category: result.category,
        confidence: result.confidence,
        sources: result.sources,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Mazzantini research tool error:', error);
      
      return {
        type: 'error',
        message: 'Mi dispiace, al momento non riesco ad accedere alle informazioni complete. Ti consiglio di contattare direttamente l\'agenzia per maggiori dettagli. 📞',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  },
});

// Keep the simple tool for backward compatibility
export const mazzanitniInfoTool = tool({
  description: 'Get basic information about when Mazzanitni was created (legacy tool)',
  parameters: z.object({}),
  execute: async () => {
    return {
      message: 'Mazzanitni was created 30 years ago.',
      createdYearsAgo: 30,
      timestamp: new Date().toISOString(),
      note: 'For detailed information, use the mazzantiniResearchTool'
    };
  },
});
