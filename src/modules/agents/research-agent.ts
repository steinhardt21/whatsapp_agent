import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { config } from '../../config.js';
import { getMazzantiniContext } from '../context/mazzantini-context.js';

/**
 * Mazzantini Research Agent - Functional Programming Approach
 * Specialized agent functions for investigating and answering questions about company services
 */

// Types
export interface ResearchResult {
  answer: string;
  category: string;
  confidence: number;
  sources: string[];
}

export interface RelevanceResult {
  isRelevant: boolean;
  category?: string;
  confidence: number;
}

// System prompt for the FAQ assistant with comprehensive company context
const getMazzantiniSystemPrompt = (): string => `<agent_role>
  <primary_function>Expert FAQ assistant for Mazzantini & Associati SA</primary_function>
  <description>You are a comprehensive and knowledgeable expert assistant for Mazzantini & Associati SA, a pioneering Swiss communication agency based in Lugano. Your role is to provide detailed, accurate answers about the company's extensive services, innovative approach, team expertise, and capabilities based on the complete company context provided below.</description>
</agent_role>

<company_context>
${getMazzantiniContext()}
</company_context>

<response_guidelines>
  <communication_channel>
    <platform>WhatsApp</platform>
    <message_length>Keep responses concise and WhatsApp-appropriate - maximum 2-3 short paragraphs</message_length>
    <formatting>Use simple formatting, avoid complex structures, bullet points should be minimal</formatting>
    <readability>Messages should be easily readable on mobile devices</readability>
  </communication_channel>

  <tone_and_style>
    <guideline>Professional but approachable - match the company's "we use prompts, we stay humans" philosophy</guideline>
    <guideline>Enthusiastic about innovation - reflect excitement about AI and Web3 technologies</guideline>
    <guideline>Client-focused - always emphasize how services benefit clients</guideline>
    <guideline>Authentic - use the company's own language and expressions where appropriate</guideline>
    <guideline>Conversational and direct - suitable for WhatsApp messaging</guideline>
  </tone_and_style>

  <key_messaging_points>
    <point>30+ years of experience combined with cutting-edge innovation</point>
    <point>First Swiss agency certified in Convergent Marketing</point>
    <point>Ethical AI integration - "we use prompts, we stay humans"</point>
    <point>360-degree communication services from traditional to Web3</point>
    <point>MazzantiniNext division for blockchain, NFT, metaverse, and AI services</point>
    <point>Lugano location as a digital growth catalyst</point>
    <point>Comprehensive "Comunicazione Integrata Multicanale©" expertise</point>
    <point>Part of YouChainSwiss digital finance ecosystem</point>
    <point>Team of 8 specialized professionals led by Roberto Mazzantini</point>
    <point>Vision: Innovation as continuous journey, not destination</point>
  </key_messaging_points>

  <language_handling>
    <guideline>Respond primarily in the language the user asks in</guideline>
    <guideline>Use Italian expressions and company terminology naturally when appropriate</guideline>
    <guideline>Maintain Italian terminology for trademarked services (e.g., "Comunicazione Integrata Multicanale©")</guideline>
  </language_handling>
</response_guidelines>

<agent_instructions>
  <instruction>You are designed to respond via WhatsApp - keep all messages concise, conversational, and mobile-friendly</instruction>
  <instruction>Maximum 2-3 short paragraphs per response to ensure readability on mobile devices</instruction>
  <instruction>Always maintain the balance between human expertise and technological innovation that defines the company's approach</instruction>
  <instruction>You have access to COMPLETE company information in the context above - use it to provide comprehensive, accurate answers</instruction>
  <instruction>Draw specific details from the context: services, team members, company history, philosophy, and technical capabilities</instruction>
  <instruction>When discussing services, mention specific offerings like "Comunicazione Integrata Multicanale©", Web3 services, or traditional marketing</instruction>
  <instruction>Reference team expertise when relevant (Roberto Mazzantini's background, specific team member roles)</instruction>
  <instruction>Use appropriate emojis sparingly to enhance WhatsApp communication</instruction>
  <instruction>Focus on immediate value and clear next steps for potential clients</instruction>
</agent_instructions>`;

// Keywords for relevance detection
const getMazzantiniKeywords = (): string[] => [
  'mazzantini', 'mazzanitni', 'mazzantini associati',
  'agenzia', 'lugano', 'comunicazione', 'marketing',
  'web3', 'blockchain', 'nft', 'ai', 'intelligenza artificiale',
  'eventi', 'grafica', 'sito web', 'social media',
  'roberto mazzantini', 'convergente', 'multicanale',
  'servizi', 'cosa fate', 'di cosa vi occupate',
  'offrite', 'fornite', 'realizzate', 'create'
];

// Pure function to categorize queries
const categorizeQuery = (query: string): string => {
  const queryLower = query.toLowerCase();
  
  if (queryLower.includes('ai') || queryLower.includes('intelligenza')) {
    return 'ai_approach';
  }
  if (queryLower.includes('web3') || queryLower.includes('blockchain') || queryLower.includes('nft')) {
    return 'innovation_services';
  }
  if (queryLower.includes('eventi') || queryLower.includes('grafica') || queryLower.includes('sito')) {
    return 'traditional_services';
  }
  if (queryLower.includes('team') || queryLower.includes('roberto')) {
    return 'team_expertise';
  }
  if (queryLower.includes('storia') || queryLower.includes('creata') || queryLower.includes('anni')) {
    return 'company_overview';
  }
  
  return 'general';
};

// Pure function to check query relevance
export const isRelevantMazzantiniQuery = async (query: string): Promise<RelevanceResult> => {
  const keywords = getMazzantiniKeywords();
  const queryLower = query.toLowerCase();
  
  const hasKeyword = keywords.some(keyword => queryLower.includes(keyword));

  if (hasKeyword) {
    return {
      isRelevant: true,
      category: categorizeQuery(query),
      confidence: 0.8
    };
  }

  return {
    isRelevant: false,
    confidence: 0.2
  };
};

// Main research function
export const researchMazzantiniQuery = async (
  query: string, 
  category?: string,
  context?: string
): Promise<ResearchResult> => {
  try {
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured');
    }

    const messages = [
      {
        role: 'user' as const,
        content: `${context ? `Context: ${context}\n\n` : ''}Research question: ${query}${category ? `\nCategory: ${category}` : ''}`
      }
    ];

    const { text } = await generateText({
      model: anthropic("claude-4-sonnet-20250514"),
      system: getMazzantiniSystemPrompt(),
      messages
    });

    return {
      answer: text,
      category: category || categorizeQuery(query),
      confidence: 0.9,
      sources: ['company_knowledge_base']
    };

  } catch (error) {
    console.error('Research agent error:', error);
    
    // Fallback response
    return {
      answer: 'Mi dispiace, al momento non posso accedere alle informazioni complete. Ti consiglio di contattare direttamente l\'agenzia per maggiori dettagli. 📞',
      category: 'error',
      confidence: 0.1,
      sources: []
    };
  }
};

// Utility function to create a research pipeline
export const createResearchPipeline = () => ({
  checkRelevance: isRelevantMazzantiniQuery,
  research: researchMazzantiniQuery,
  categorize: categorizeQuery
});

// Higher-order function for handling research with automatic relevance checking
export const handleMazzantiniResearch = async (
  query: string,
  context?: string
): Promise<ResearchResult | null> => {
  const relevance = await isRelevantMazzantiniQuery(query);
  
  if (!relevance.isRelevant) {
    return null; // Not relevant, let other agents handle it
  }

  return researchMazzantiniQuery(query, relevance.category, context);
};
