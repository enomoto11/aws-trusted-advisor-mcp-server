import { MCPServerConfig, Tool } from './types';

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
    lowUtilizationEC2InstancesTool,
    ebsSnapshotsTool,
    exposedAccessKeysTool,
    s3BucketVersioningTool
  ]
}; 