# MCP サーバープロジェクト

TypeScriptで実装されたMCP（Model Control Protocol）サーバーのサンプルプロジェクトです。

## 機能

- Express.jsを使用したRESTful API
- 設定可能なツールのコレクション
- TypeScriptによる型安全性

## 利用可能なツール

1. **hello_world** - シンプルな挨拶を返すサンプルツール
2. **calculator** - 基本的な計算を行うツール（加算、減算、乗算、除算）

## セットアップ方法

```bash
# リポジトリをクローン
git clone <repository-url>
cd mcp-server

# 依存関係をインストール
npm install

# 開発モードで実行
npm run dev

# プロダクションビルド
npm run build

# プロダクションモードで実行
npm start
```

## 環境変数

`.env`ファイルを作成して環境変数を設定できます：

```
PORT=3000
```

## API エンドポイント

- **GET /** - サーバーステータスを確認
- **GET /tools** - 利用可能なツールのリストを取得
- **POST /execute** - ツールを実行

### ツール実行リクエスト例

```json
// hello_world ツールのリクエスト
{
  "name": "hello_world",
  "parameters": {
    "name": "太郎"
  }
}

// calculator ツールのリクエスト
{
  "name": "calculator",
  "parameters": {
    "operation": "add",
    "a": 5,
    "b": 3
  }
}
```

## カスタムツールの追加方法

1. `src/config.ts`ファイルに新しいツール定義を追加
2. `src/tools.ts`ファイルに新しいツール実装を追加
3. `toolImplementations`マップに新しいツールを登録

## ライセンス

ISC 