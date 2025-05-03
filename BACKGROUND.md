# AWS Trusted Advisor MCP サーバーの開発背景

## 背景

このプロジェクトは、AWS Trusted Advisorの推奨事項に自然言語でアクセスしたいという要望から生まれました。AWS CliやAWSコンソールにログインすることなく、Amazon Q、Claude Desktop、Cursorなどのお気に入りのAIツールを使って、シンプルにプロンプトを書くだけでTrusted Advisorの情報にアクセスできる環境が必要でした。また、組織内の複数のプロジェクト/チームで同様の機能を簡単に利用できるようにしたいという要望もありました。

[AWS Communityの記事](https://community.aws/content/2ac8rqvERHpbPhJUWaB2j9fVBED/build-a-trusted-advisor-mcp-server)を読んで、Trusted AdvisorをMCPサーバー経由で操作できる可能性を知り、このプロジェクトを開始しました。AWS Trusted Advisorは、コスト、パフォーマンス、セキュリティなどの観点からAWSインフラストラクチャを最適化するのに役立つサービスですが、自然言語インターフェイスが欠けていました。

## なぜMCPサーバーなのか？

[AWSLabsのMCPリポジトリ](https://github.com/awslabs/mcp/tree/main/samples/)には多くのMCPサーバーのサンプルがありますが、AWS Trusted Advisorの推奨事項に特化したものは存在しませんでした。カスタムMCP実装やAWS CLIの使用なしでは、必要なアクションを実行することができません。

MCPサーバーは、Anthropicによってオープンプロトコルとして開発され、AIモデルを事実上あらゆるデータソースやツールに接続するための標準化された方法を提供します。クライアント・サーバーアーキテクチャを使用することで、開発者は自分たちのデータを軽量なMCPサーバーを通じて公開し、これらのサーバーに接続するMCPクライアントとしてAIアプリケーションを構築できます。

## このプロジェクトの目標

1. AWS Trusted Advisorの推奨事項に自然言語でアクセスできるようにする
2. CursorやClaude Desktopなどの既存のAIツールとシームレスに統合できるMCPサーバーを作成する
3. 低利用率EC2インスタンスの停止やEBSスナップショットの作成など、Trusted Advisorの推奨事項に基づいて具体的なアクションを簡単に実行できるようにする
4. IaCで管理されたリソースにも安全に使用できるよう、実際の変更は提案のみとし、最終的な判断はユーザーに委ねる

## 今後の展望

このMCPサーバーは、AWS Bedrock Agentのような他のAWSサービスとも連携できる可能性があります。例えば、AWS Bedrock AgentがAction Groupを使用して外部MCPサーバーを呼び出すアーキテクチャは、非常に有効で強力な選択肢になり得ます。

---

このプロジェクトが、AWS環境の管理と最適化をより簡単かつ効率的にする一助となれば幸いです。ご質問やフィードバックがございましたら、お気軽にIssueを開いてください。 