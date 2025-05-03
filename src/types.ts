export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPServerConfig {
  port: number;
  tools: Tool[];
}

export interface ToolRequest {
  name: string;
  parameters: Record<string, any>;
}

export interface ToolResponse {
  status: 'success' | 'error';
  data?: any;
  error?: string;
} 