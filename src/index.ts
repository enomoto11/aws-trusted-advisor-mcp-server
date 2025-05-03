import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { config } from './config';
import { handleToolRequest } from './tools';
import { ToolRequest } from './types';

// 環境変数を読み込む
dotenv.config();

const app = express();
const PORT = config.port;

// ミドルウェアの設定
app.use(cors());
app.use(express.json());

// ルートエンドポイント
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'MCPサーバーが正常に動作しています',
    version: '1.0.0'
  });
});

// 利用可能なツールのリストを返すエンドポイント
app.get('/tools', (req: Request, res: Response) => {
  res.json({ 
    tools: config.tools 
  });
});

// ツール実行エンドポイント
app.post('/execute', (req: Request, res: Response) => {
  const handleAsync = async () => {
    try {
      const toolRequest: ToolRequest = req.body;
      
      if (!toolRequest || !toolRequest.name) {
        return res.status(400).json({ 
          status: 'error', 
          error: 'ツール名が指定されていません' 
        });
      }
      
      const result = await handleToolRequest(toolRequest);
      
      if (result.status === 'error') {
        return res.status(400).json(result);
      }
      
      res.json(result);
    } catch (error) {
      res.status(500).json({
        status: 'error',
        error: error instanceof Error ? error.message : '不明なエラーが発生しました'
      });
    }
  };
  
  handleAsync();
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`MCPサーバーが起動しました: http://localhost:${PORT}`);
  console.log(`利用可能なツール数: ${config.tools.length}`);
}); 