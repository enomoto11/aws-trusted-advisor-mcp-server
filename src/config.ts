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

// Trusted Advisorツール
const lowUtilizationEC2InstancesTool: Tool = {
  name: 'low_utilization_ec2_instances',
  description: 'AWS Trusted Advisorを使用して低利用率のEC2インスタンスを特定して停止します',
  parameters: {
    type: 'object',
    properties: {
      region: {
        type: 'string',
        description: 'AWSリージョン（例：us-east-1、ap-northeast-1）、または "all" ですべてのリージョンを対象',
        default: 'all'
      },
      tagKey: {
        type: 'string',
        description: 'フィルタリングに使用するタグキー',
        default: 'environment'
      },
      tagValue: {
        type: 'string',
        description: 'フィルタリングに使用するタグ値',
        default: 'dev'
      },
      dryRun: {
        type: 'boolean',
        description: 'テストモード（実際にインスタンスを停止しない）',
        default: true
      }
    },
    required: ['region']
  }
};

const ebsSnapshotsTool: Tool = {
  name: 'ebs_snapshots',
  description: 'AWS Trusted Advisorを使用して最近バックアップされていないEBSボリュームを特定し、スナップショットを作成します',
  parameters: {
    type: 'object',
    properties: {
      region: {
        type: 'string',
        description: 'AWSリージョン（例：us-east-1、ap-northeast-1）、または "all" ですべてのリージョンを対象',
        default: 'all'
      },
      dryRun: {
        type: 'boolean',
        description: 'テストモード（実際にスナップショットを作成しない）',
        default: true
      }
    },
    required: ['region']
  }
};

const exposedAccessKeysTool: Tool = {
  name: 'exposed_access_keys',
  description: 'AWS Trusted Advisorを使用して公開されたIAMアクセスキーを特定して無効化します',
  parameters: {
    type: 'object',
    properties: {
      dryRun: {
        type: 'boolean',
        description: 'テストモード（実際にキーを無効化しない）',
        default: true
      }
    }
  }
};

const s3BucketVersioningTool: Tool = {
  name: 's3_bucket_versioning',
  description: 'AWS Trusted Advisorを使用してバージョニングが有効になっていないS3バケットを特定して有効化します',
  parameters: {
    type: 'object',
    properties: {
      dryRun: {
        type: 'boolean',
        description: 'テストモード（実際にバージョニングを有効化しない）',
        default: true
      }
    }
  }
};

// サーバー設定
export const config: MCPServerConfig = {
  port: Number(process.env.PORT) || 3000,
  tools: [
    helloWorldTool,
    calculatorTool,
    lowUtilizationEC2InstancesTool,
    ebsSnapshotsTool,
    exposedAccessKeysTool,
    s3BucketVersioningTool
  ]
}; 