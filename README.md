# AWS Trusted Advisor MCP サーバー

このプロジェクトは、AWS Trusted Advisorの機能を活用するMCP (Multimodal Conversational Processing) サーバーを提供します。AWS Trusted Advisorのチェック結果に基づいて、EC2インスタンスの停止、EBSスナップショットの作成など、推奨される変更を提案します。**重要: このツールは実際に変更を行わず、IaCで管理された環境でも安全に使用できます。**

リポジトリURL: [https://github.com/enomoto11/aws-trusted-advisor-mcp-server](https://github.com/enomoto11/aws-trusted-advisor-mcp-server)

## 機能

- **低利用率EC2インスタンスの停止提案**: Trusted Advisorによって検出された低利用率のEC2インスタンスを特定し、タグに基づいて停止の提案をします
- **EBSスナップショットの作成提案**: バックアップが不足しているEBSボリュームのスナップショット作成を提案します
- **公開されたアクセスキーの無効化提案**: 公開されたIAMアクセスキーを検出し、無効化の提案をします
- **S3バケットバージョニングの有効化提案**: バージョニングが有効になっていないS3バケットを特定し、バージョニング有効化の提案をします

## セットアップ

### 前提条件

- Node.js 14以上
- npm または yarn
- AWS アカウントとIAMユーザー (Trusted Advisor および関連サービスへのアクセス権が必要)
- または Docker と Docker Compose (コンテナで実行する場合)

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/enomoto11/aws-trusted-advisor-mcp-server.git
cd aws-trusted-advisor-mcp-server

# 依存関係のインストール
npm install

# 開発モードで実行
npm run dev
```

### Dockerを使用した実行

プロジェクトはDockerコンテナとしても実行できます。

```bash
# イメージをビルドして起動
docker-compose up -d

# ログの確認
docker-compose logs -f

# コンテナの停止
docker-compose down
```

### AWS認証情報の設定

このプロジェクトはAWS SDKを使用するため、以下のいずれかの方法でAWS認証情報を設定する必要があります：

#### 1. .env ファイルを使用する方法

プロジェクトのルートディレクトリに `.env` ファイルを作成し、以下の内容を追加します：

```
AWS_ACCESS_KEY_ID=あなたのアクセスキーID
AWS_SECRET_ACCESS_KEY=あなたのシークレットアクセスキー
AWS_SESSION_TOKEN=あなたのセッショントークン（必要な場合）
AWS_REGION=us-east-1
```

#### 2. AWS設定ファイルを使用する方法

AWS CLIがインストールされている場合は、以下のコマンドで認証情報を設定します：

```bash
aws configure
```

#### 3. 環境変数を使用する方法

シェルで直接環境変数を設定します：

```bash
export AWS_ACCESS_KEY_ID=あなたのアクセスキーID
export AWS_SECRET_ACCESS_KEY=あなたのシークレットアクセスキー
export AWS_SESSION_TOKEN=あなたのセッショントークン（必要な場合）
export AWS_REGION=us-east-1
```

**重要**: Trusted Advisor APIを使用するには、IAMユーザーに適切な権限が必要です。少なくとも `support:DescribeTrustedAdvisorChecks` および `support:DescribeTrustedAdvisorCheckResult` アクセス許可が必要です。

## Cursorでの設定と使用方法

Cursorエディタでこのツールを使用するには、以下の手順に従ってください：

### 1. MCPサーバーの設定

1. このリポジトリをローカルにクローンします
2. 依存関係をインストールし、サーバーを起動します
   ```bash
   npm install
   npm run dev
   ```
3. サーバーが `http://localhost:3000` で起動していることを確認します

### 2. Cursor MCPプラグインの設定

1. Cursorエディタを開きます
2. 設定画面を開きます（macOSでは `Cmd+,`、Windowsでは `Ctrl+,`）
3. 左側のメニューから「Extensions」または「拡張機能」を選択します
4. 「MCP」セクションを探して選択します
5. 「Add MCP」または「MCPを追加」ボタンをクリックします
6. 以下の情報を入力します：
   - Name: `Trusted Advisor`
   - URL: `http://localhost:3000`（直接実行の場合）または `http://localhost:3001`（Dockerコンテナ実行の場合）
7. 「Add」または「追加」ボタンをクリックして保存します

### 3. Cursor内での使用方法

1. コマンドパレットを開きます（macOSでは `Cmd+Shift+P`、Windowsでは `Ctrl+Shift+P`）
2. `MCP: Switch MCP Server` と入力します
3. リストから「Trusted Advisor」を選択します
4. これで、AIアシスタントとのチャットでTrusted Advisorのツールが使用できるようになります
5. チャットで「低利用率EC2インスタンスをチェックしてください」などと指示すると、MCPサーバーを通じてAWS環境の分析結果が表示されます

### 4. チャットプロンプトの例

- 「低利用率のEC2インスタンスをチェックして、停止すべきインスタンスを提案してください」
- 「バックアップが必要なEBSボリュームをスキャンして、スナップショット作成が必要なものを教えてください」
- 「公開されているIAMアクセスキーがないか確認してください」
- 「バージョニングが有効になっていないS3バケットをチェックしてください」

## 使用方法

サーバーが起動すると、以下のエンドポイントが利用可能になります：

- `GET /`: サーバーステータスの確認
- `GET /tools`: 利用可能なツールの一覧を取得
- `POST /execute`: ツールを実行

### ツールの実行例

以下の例では、ローカル実行時のポート3000を使用しています。Dockerコンテナ実行時はポート3001に置き換えてください。

#### 低利用率EC2インスタンスの停止提案

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "low_utilization_ec2_instances",
    "parameters": {
      "region": "us-east-1",
      "tagKey": "environment",
      "tagValue": "dev"
    }
  }'
```

#### EBSスナップショットの作成提案

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "ebs_snapshots",
    "parameters": {
      "region": "all"
    }
  }'
```

#### 公開されたアクセスキーの無効化提案

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "exposed_access_keys",
    "parameters": {}
  }'
```

#### S3バケットバージョニングの有効化提案

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "s3_bucket_versioning",
    "parameters": {}
  }'
```

### 推奨事項のフォーマット

このツールは各リソースに対して以下の情報を含む推奨事項を提供します：

- **recommendedAction**: 実行すべきAWS CLIコマンド
- **terraformExample**: IaCで管理されているリソース向けのTerraformコード例
- **managedWarning**: リソースがIaCで管理されている場合の警告メッセージ

例：

```json
{
  "recommendations": [
    {
      "instanceId": "i-0123456789abcdef0",
      "region": "us-east-1",
      "recommendedAction": "aws ec2 stop-instances --instance-ids i-0123456789abcdef0 --region us-east-1",
      "terraformExample": "# Terraformの例:\nresource \"aws_instance\" \"0123456789abcdef0\" {\n  # 他の設定はそのままに\n  instance_id = \"i-0123456789abcdef0\"\n  # インスタンスを停止状態に設定\n  instance_initiated_shutdown_behavior = \"stop\"\n}",
      "managedWarning": "※注意: このインスタンスは terraform:managed=true で管理されています。変更はIaCツールを通じて行ってください。"
    }
  ]
}
```

## カスタムツールの追加

新しいツールを追加するには：

1. `src/config.ts` にツール定義を追加
2. `src/tools.ts` に実装を追加
3. 実装を `implementTools` オブジェクトに登録

## ライセンス

このプロジェクトは [MITライセンス](LICENSE) の下で公開されています。 