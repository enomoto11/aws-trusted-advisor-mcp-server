import { ToolRequest, ToolResponse } from './types';

// ツールの実装をマップ
type ToolImplementation = (params: Record<string, any>) => Promise<any>;

// hello_world ツールの実装
const helloWorldTool: ToolImplementation = async (params) => {
  const { name } = params;
  return `こんにちは、${name}さん！`;
};

// calculator ツールの実装
const calculatorTool: ToolImplementation = async (params) => {
  const { operation, a, b } = params;
  
  switch (operation) {
    case 'add':
      return a + b;
    case 'subtract':
      return a - b;
    case 'multiply':
      return a * b;
    case 'divide':
      if (b === 0) {
        throw new Error('0で割ることはできません');
      }
      return a / b;
    default:
      throw new Error(`サポートされていない操作: ${operation}`);
  }
};

// ツール実装のマップ
const toolImplementations: Record<string, ToolImplementation> = {
  hello_world: helloWorldTool,
  calculator: calculatorTool
};

// ツールリクエストの処理ハンドラー
export const handleToolRequest = async (request: ToolRequest): Promise<ToolResponse> => {
  try {
    const { name, parameters } = request;
    
    // ツールの存在チェック
    const toolImplementation = toolImplementations[name];
    if (!toolImplementation) {
      return {
        status: 'error',
        error: `ツール "${name}" は存在しません`
      };
    }
    
    // ツールの実行
    const result = await toolImplementation(parameters);
    
    return {
      status: 'success',
      data: result
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : '不明なエラーが発生しました'
    };
  }
}; 