import { MCPServerConfig, Tool } from './types';

// Trusted Advisorツール
const lowUtilizationEC2InstancesTool: Tool = {
  name: 'low_utilization_ec2_instances',
  description: 'AWS Trusted Advisorを使用して低利用率のEC2インスタンスを特定し、停止の提案をします（実際に停止はしません）',
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
      }
    },
    required: ['region']
  }
};

const ebsSnapshotsTool: Tool = {
  name: 'ebs_snapshots',
  description: 'AWS Trusted Advisorを使用して最近バックアップされていないEBSボリュームを特定し、スナップショット作成の提案をします（実際に作成はしません）',
  parameters: {
    type: 'object',
    properties: {
      region: {
        type: 'string',
        description: 'AWSリージョン（例：us-east-1、ap-northeast-1）、または "all" ですべてのリージョンを対象',
        default: 'all'
      }
    },
    required: ['region']
  }
};

const exposedAccessKeysTool: Tool = {
  name: 'exposed_access_keys',
  description: 'AWS Trusted Advisorを使用して公開されたIAMアクセスキーを特定し、無効化の提案をします（実際に無効化はしません）',
  parameters: {
    type: 'object',
    properties: {}
  }
};

const s3BucketVersioningTool: Tool = {
  name: 's3_bucket_versioning',
  description: 'AWS Trusted Advisorを使用してバージョニングが有効になっていないS3バケットを特定し、バージョニング有効化の提案をします（実際に有効化はしません）',
  parameters: {
    type: 'object',
    properties: {}
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