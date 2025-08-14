/**
 * Tool types for the AI agent
 */
export interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface Tool {
  name: string;
  description: string;
  parameters: any;
  execute: (params: any) => Promise<ToolResult>;
}

/**
 * Research Agent types (re-exported for convenience)
 */
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
