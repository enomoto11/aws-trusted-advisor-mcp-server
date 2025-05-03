# AWS Trusted Advisor MCP サーバー

このプロジェクトは、AWS Trusted Advisorの機能を活用するMCP (Multimodal Conversational Processing) サーバーを提供します。AWS Trusted Advisorのチェック結果に基づいて、EC2インスタンスの停止、EBSスナップショットの作成など、自動的に問題を修正するツールが含まれています。

## 機能

- **低利用率EC2インスタンスの停止**: Trusted Advisorによって検出された低利用率のEC2インスタンスを特定し、タグに基づいて停止します
- **EBSスナップショットの作成**: バックアップが不足しているEBSボリュームのスナップショットを自動的に作成します
- **公開されたアクセスキーの無効化**: 公開されたIAMアクセスキーを検出し、無効化します
- **S3バケットバージョニングの有効化**: バージョニングが有効になっていないS3バケットを特定し、バージョニングを有効化します
- その他の基本機能 (hello_world, calculator)

## セットアップ

### 前提条件

- Node.js 14以上
- npm または yarn
- AWS アカウントとIAMユーザー (Trusted Advisor および関連サービスへのアクセス権が必要)

### インストール

```bash
# リポジトリをクローン
git clone <リポジトリURL>
cd trusted-advisor

# 依存関係のインストール
npm install

# 開発モードで実行
npm run dev
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

## 使用方法

サーバーが起動すると、以下のエンドポイントが利用可能になります：

- `GET /`: サーバーステータスの確認
- `GET /tools`: 利用可能なツールの一覧を取得
- `POST /execute`: ツールを実行

### ツールの実行例

#### 低利用率EC2インスタンスの停止

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "name": "low_utilization_ec2_instances",
    "parameters": {
      "region": "us-east-1",
      "tagKey": "environment",
      "tagValue": "dev",
      "dryRun": true
    }
  }'
```

#### EBSスナップショットの作成

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ebs_snapshots",
    "parameters": {
      "region": "all",
      "dryRun": true
    }
  }'
```

#### 公開されたアクセスキーの無効化

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "name": "exposed_access_keys",
    "parameters": {
      "dryRun": true
    }
  }'
```

#### S3バケットバージョニングの有効化

```bash
curl -X POST http://localhost:3000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "name": "s3_bucket_versioning",
    "parameters": {
      "dryRun": true
    }
  }'
```

**注意**: 実際の環境で実行する前に、`dryRun: true` で実行してテストすることをお勧めします。`dryRun: false` に設定すると、実際の変更が適用されます。

## カスタムツールの追加

新しいツールを追加するには：

1. `src/config.ts` にツール定義を追加
2. `src/tools.ts` に実装を追加
3. 実装を `toolImplementations` オブジェクトに登録

## ライセンス

このプロジェクトは [MITライセンス](LICENSE) の下で公開されています。 