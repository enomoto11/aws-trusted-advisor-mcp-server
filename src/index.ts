import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { config } from './config';
import { implementTools } from './tools';

// サーバーの初期化
const app = express();
app.use(bodyParser.json());

// ルートエンドポイント - サーバーのステータスを返す
app.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: 'MCPサーバーが正常に動作しています',
    version: '1.0.0'
  });
});

// ツールのリストを取得するエンドポイント
app.get('/tools', (req: Request, res: Response) => {
  res.json({
    tools: config.tools
  });
});

// ツールを実行するエンドポイント
app.post('/execute', function(req: Request, res: Response) {
  const executeToolAsync = async () => {
    try {
      const { toolName, parameters } = req.body;
      
      // ツールの存在確認
      const tool = config.tools.find(t => t.name === toolName);
      if (!tool) {
        return res.status(404).json({
          status: 'error',
          error: `ツール "${toolName}" は存在しません`
        });
      }
      
      // ツールの実装を取得
      const toolImplementation = implementTools[toolName];
      if (!toolImplementation) {
        return res.status(500).json({
          status: 'error',
          error: `ツール "${toolName}" の実装が見つかりません`
        });
      }
      
      // ツールを実行
      const result = await toolImplementation.execute(parameters || {});
      
      // 結果を返す
      res.json({
        status: 'success',
        data: result
      });
    } catch (error: any) {
      console.error('ツール実行中にエラーが発生しました:', error);
      res.status(500).json({
        status: 'error',
        error: error.message || '不明なエラーが発生しました'
      });
    }
  };

  executeToolAsync();
});

// サーバーの起動
const port = config.port;
app.listen(port, () => {
  console.log(`MCPサーバーが起動しました: http://localhost:${port}`);
  console.log(`利用可能なツール数: ${config.tools.length}`);
}); 