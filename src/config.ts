import { MCPServerConfig, Tool } from './types';

// サンプルツールの定義
const helloWorldTool: Tool = {
  name: 'hello_world',
  description: 'シンプルな挨拶を返すサンプルツール',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '挨拶する相手の名前'
      }
    },
    required: ['name']
  }
};

const calculatorTool: Tool = {
  name: 'calculator',
  description: '基本的な計算を行うツール',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        description: '実行する操作（加算、減算、乗算、除算）',
        enum: ['add', 'subtract', 'multiply', 'divide']
      },
      a: {
        type: 'number',
        description: '最初のオペランド'
      },
      b: {
        type: 'number',
        description: '2番目のオペランド'
      }
    },
    required: ['operation', 'a', 'b']
  }
};

// サーバー設定
export const config: MCPServerConfig = {
  port: Number(process.env.PORT) || 3000,
  tools: [
    helloWorldTool,
    calculatorTool
  ]
}; 