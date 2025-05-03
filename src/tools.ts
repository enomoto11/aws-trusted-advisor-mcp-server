import { ToolRequest, ToolResponse } from './types';
import AWS from 'aws-sdk';

// ツールの実装をマップ
type ToolImplementation = (params: Record<string, any>) => Promise<any>;

// リソースデータの型定義
interface ResourceData {
  [key: string]: any;
}

// hello_world ツールの実装
const helloWorldTool: ToolImplementation = async (params) => {
  const { name } = params;
  return `こんにちは、${name}さん！`;
};

// calculator ツールの実装
const calculatorTool: ToolImplementation = async (params) => {
  const { operation, a, b } = params;
  
  switch (operation) {
    case 'add':
      return a + b;
    case 'subtract':
      return a - b;
    case 'multiply':
      return a * b;
    case 'divide':
      if (b === 0) {
        throw new Error('0で割ることはできません');
      }
      return a / b;
    default:
      throw new Error(`サポートされていない操作: ${operation}`);
  }
};

// AWS 認証情報の設定
const configureAWS = (region: string = 'us-east-1') => {
  AWS.config.update({ region });
  
  // 環境変数から認証情報を取得
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  
  if (accessKeyId && secretAccessKey) {
    AWS.config.update({
      accessKeyId,
      secretAccessKey,
      sessionToken
    });
  }
  
  return AWS;
};

// Trusted Advisor チェックの結果を取得する関数
const getTrustedAdvisorChecks = async (region: string = 'us-east-1') => {
  configureAWS(region);
  const support = new AWS.Support({ region: 'us-east-1' }); // Support APIは us-east-1 リージョンのみでサポート
  
  try {
    // 全チェックの説明を取得
    const checkDescriptions = await support.describeTrustedAdvisorChecks({
      language: 'en'
    }).promise();
    
    // チェック結果を取得
    const checkResults = await Promise.all(
      checkDescriptions.checks.map(async (check) => {
        const result = await support.describeTrustedAdvisorCheckResult({
          checkId: check.id,
          language: 'en'
        }).promise();
        
        return {
          check,
          result: result.result
        };
      })
    );
    
    return checkResults;
  } catch (error) {
    console.error('Trusted Advisor チェックの取得に失敗しました:', error);
    throw error;
  }
};

// low_utilization_ec2_instances ツールの実装
const lowUtilizationEC2InstancesTool: ToolImplementation = async (params) => {
  const { region = 'all', tagKey = 'environment', tagValue = 'dev', dryRun = true } = params;
  
  try {
    configureAWS('us-east-1'); // Support APIは us-east-1 リージョンのみでサポート
    const support = new AWS.Support({ region: 'us-east-1' });
    
    // 低利用率EC2インスタンスチェックのIDを取得
    const checksResponse = await support.describeTrustedAdvisorChecks({
      language: 'en'
    }).promise();
    
    const lowUtilizationCheck = checksResponse.checks.find(
      check => check.name === 'Low Utilization Amazon EC2 Instances'
    );
    
    if (!lowUtilizationCheck) {
      throw new Error('低利用率EC2インスタンスのチェックが見つかりませんでした');
    }
    
    // チェック結果を取得
    const checkResult = await support.describeTrustedAdvisorCheckResult({
      checkId: lowUtilizationCheck.id,
      language: 'en'
    }).promise();
    
    if (!checkResult.result?.flaggedResources || checkResult.result.flaggedResources.length === 0) {
      return {
        message: '低利用率のEC2インスタンスは見つかりませんでした',
        instances: []
      };
    }
    
    // 処理済みインスタンスのリスト
    const processedInstances: ResourceData[] = [];
    
    // 各フラグ付きリソースに対して処理
    for (const resource of checkResult.result.flaggedResources) {
      const resourceData: ResourceData = {};
      const metadata = resource.metadata;
      
      // メタデータから情報を抽出
      if (metadata && metadata.length >= 5) {
        const instanceId = metadata[1]; // Instance ID
        const instanceRegion = metadata[0].replace(/[a-z]$/, ''); // Region/AZ から AZ を取り除く
        
        // 指定されたリージョンまたは 'all' でない場合はスキップ
        if (region !== 'all' && instanceRegion !== region) {
          continue;
        }
        
        resourceData.instanceId = instanceId;
        resourceData.region = instanceRegion;
        resourceData.utilizationData = {
          cpu: metadata[3], // CPU使用率
          network: metadata[4], // ネットワーク I/O
          hourlyPrice: metadata[5] || 'N/A' // 時間料金
        };
        
        // EC2インスタンスのタグをチェック
        configureAWS(instanceRegion);
        const ec2 = new AWS.EC2({ region: instanceRegion });
        
        try {
          const tagsResponse = await ec2.describeTags({
            Filters: [
              {
                Name: 'resource-id',
                Values: [instanceId]
              },
              {
                Name: 'key',
                Values: [tagKey]
              }
            ]
          }).promise();
          
          // タグ値がマッチしたらインスタンスを停止
          if (tagsResponse.Tags && tagsResponse.Tags.length > 0 && 
              tagsResponse.Tags[0].Value === tagValue) {
            
            resourceData.tagMatch = true;
            
            // 実際に停止処理を行うか（dryRunがfalseの場合）
            if (!dryRun) {
              const stopParams = {
                InstanceIds: [instanceId],
                DryRun: false
              };
              
              const stopResult = await ec2.stopInstances(stopParams).promise();
              resourceData.stopped = true;
              resourceData.stopResult = stopResult;
            } else {
              resourceData.dryRun = true;
              resourceData.message = 'テストモードのため、インスタンスは停止されませんでした';
            }
          } else {
            resourceData.tagMatch = false;
            resourceData.message = `タグ ${tagKey}=${tagValue} が一致しないためスキップされました`;
          }
        } catch (error) {
          resourceData.error = `インスタンスの処理中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
        
        processedInstances.push(resourceData);
      }
    }
    
    return {
      message: `${processedInstances.length}件の低利用率EC2インスタンスを処理しました`,
      dryRun,
      instances: processedInstances
    };
  } catch (error) {
    console.error('低利用率EC2インスタンスの処理中にエラーが発生しました:', error);
    throw error;
  }
};

// ebs_snapshots ツールの実装
const ebsSnapshotsTool: ToolImplementation = async (params) => {
  const { region = 'all', dryRun = true } = params;
  
  try {
    configureAWS('us-east-1');
    const support = new AWS.Support({ region: 'us-east-1' });
    
    // EBSスナップショットチェックのIDを取得
    const checksResponse = await support.describeTrustedAdvisorChecks({
      language: 'en'
    }).promise();
    
    const ebsCheck = checksResponse.checks.find(
      check => check.name === 'Amazon EBS Snapshots'
    );
    
    if (!ebsCheck) {
      throw new Error('EBSスナップショットのチェックが見つかりませんでした');
    }
    
    // チェック結果を取得
    const checkResult = await support.describeTrustedAdvisorCheckResult({
      checkId: ebsCheck.id,
      language: 'en'
    }).promise();
    
    if (!checkResult.result?.flaggedResources || checkResult.result.flaggedResources.length === 0) {
      return {
        message: 'バックアップが必要なEBSボリュームは見つかりませんでした',
        volumes: []
      };
    }
    
    // 処理済みボリュームのリスト
    const processedVolumes: ResourceData[] = [];
    
    // 各フラグ付きリソースに対して処理
    for (const resource of checkResult.result.flaggedResources) {
      const resourceData: ResourceData = {};
      const metadata = resource.metadata;
      
      // メタデータから情報を抽出
      if (metadata && metadata.length >= 3) {
        const volumeId = metadata[1]; // Volume ID
        const volumeRegion = metadata[0].replace(/[a-z]$/, ''); // Region/AZ から AZ を取り除く
        
        // 指定されたリージョンまたは 'all' でない場合はスキップ
        if (region !== 'all' && volumeRegion !== region) {
          continue;
        }
        
        resourceData.volumeId = volumeId;
        resourceData.region = volumeRegion;
        resourceData.lastBackupDate = metadata[2] || 'Never';
        
        // スナップショットを作成
        if (!dryRun) {
          configureAWS(volumeRegion);
          const ec2 = new AWS.EC2({ region: volumeRegion });
          
          try {
            const description = `Automated snapshot created by Trusted Advisor MCP - ${new Date().toISOString()}`;
            const createSnapshotResult = await ec2.createSnapshot({
              VolumeId: volumeId,
              Description: description
            }).promise();
            
            resourceData.snapshotCreated = true;
            resourceData.snapshotId = createSnapshotResult.SnapshotId;
            resourceData.snapshotDescription = description;
          } catch (error) {
            resourceData.error = `スナップショット作成中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        } else {
          resourceData.dryRun = true;
          resourceData.message = 'テストモードのため、スナップショットは作成されませんでした';
        }
        
        processedVolumes.push(resourceData);
      }
    }
    
    return {
      message: `${processedVolumes.length}件のEBSボリュームを処理しました`,
      dryRun,
      volumes: processedVolumes
    };
  } catch (error) {
    console.error('EBSスナップショット処理中にエラーが発生しました:', error);
    throw error;
  }
};

// exposed_access_keys ツールの実装
const exposedAccessKeysTool: ToolImplementation = async (params) => {
  const { dryRun = true } = params;
  
  try {
    configureAWS('us-east-1');
    const support = new AWS.Support({ region: 'us-east-1' });
    
    // 公開されたアクセスキーチェックのIDを取得
    const checksResponse = await support.describeTrustedAdvisorChecks({
      language: 'en'
    }).promise();
    
    const accessKeyCheck = checksResponse.checks.find(
      check => check.name === 'Exposed Access Keys'
    );
    
    if (!accessKeyCheck) {
      throw new Error('公開されたアクセスキーのチェックが見つかりませんでした');
    }
    
    // チェック結果を取得
    const checkResult = await support.describeTrustedAdvisorCheckResult({
      checkId: accessKeyCheck.id,
      language: 'en'
    }).promise();
    
    if (!checkResult.result?.flaggedResources || checkResult.result.flaggedResources.length === 0) {
      return {
        message: '公開されたアクセスキーは見つかりませんでした',
        keys: []
      };
    }
    
    // 処理済みキーのリスト
    const processedKeys: ResourceData[] = [];
    const iam = new AWS.IAM();
    
    // 各フラグ付きリソースに対して処理
    for (const resource of checkResult.result.flaggedResources) {
      const resourceData: ResourceData = {};
      const metadata = resource.metadata;
      
      // メタデータから情報を抽出
      if (metadata && metadata.length >= 3) {
        const accessKeyId = metadata[1]; // Access Key ID
        const username = metadata[2]; // IAM ユーザー名
        const location = metadata[3] || 'Unknown'; // 漏洩場所
        
        resourceData.accessKeyId = accessKeyId;
        resourceData.username = username;
        resourceData.location = location;
        
        // アクセスキーを無効化
        if (!dryRun) {
          try {
            const updateResult = await iam.updateAccessKey({
              AccessKeyId: accessKeyId,
              Status: 'Inactive',
              UserName: username
            }).promise();
            
            resourceData.keyDisabled = true;
            resourceData.updateResult = 'アクセスキーを無効化しました';
          } catch (error) {
            resourceData.error = `アクセスキーの無効化中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        } else {
          resourceData.dryRun = true;
          resourceData.message = 'テストモードのため、アクセスキーは無効化されませんでした';
        }
        
        processedKeys.push(resourceData);
      }
    }
    
    return {
      message: `${processedKeys.length}件の公開されたアクセスキーを処理しました`,
      dryRun,
      keys: processedKeys
    };
  } catch (error) {
    console.error('公開されたアクセスキーの処理中にエラーが発生しました:', error);
    throw error;
  }
};

// s3_bucket_versioning ツールの実装
const s3BucketVersioningTool: ToolImplementation = async (params) => {
  const { dryRun = true } = params;
  
  try {
    configureAWS('us-east-1');
    const support = new AWS.Support({ region: 'us-east-1' });
    
    // S3バケットバージョニングチェックのIDを取得
    const checksResponse = await support.describeTrustedAdvisorChecks({
      language: 'en'
    }).promise();
    
    const s3Check = checksResponse.checks.find(
      check => check.name === 'Amazon S3 Bucket Versioning'
    );
    
    if (!s3Check) {
      throw new Error('S3バケットバージョニングのチェックが見つかりませんでした');
    }
    
    // チェック結果を取得
    const checkResult = await support.describeTrustedAdvisorCheckResult({
      checkId: s3Check.id,
      language: 'en'
    }).promise();
    
    if (!checkResult.result?.flaggedResources || checkResult.result.flaggedResources.length === 0) {
      return {
        message: 'バージョニングが必要なS3バケットは見つかりませんでした',
        buckets: []
      };
    }
    
    // 処理済みバケットのリスト
    const processedBuckets: ResourceData[] = [];
    const s3 = new AWS.S3();
    
    // 各フラグ付きリソースに対して処理
    for (const resource of checkResult.result.flaggedResources) {
      const resourceData: ResourceData = {};
      const metadata = resource.metadata;
      
      // メタデータから情報を抽出
      if (metadata && metadata.length >= 2) {
        const bucketName = metadata[1]; // バケット名
        
        resourceData.bucketName = bucketName;
        
        // バージョニングを有効化
        if (!dryRun) {
          try {
            const versioningResult = await s3.putBucketVersioning({
              Bucket: bucketName,
              VersioningConfiguration: {
                Status: 'Enabled'
              }
            }).promise();
            
            resourceData.versioningEnabled = true;
            resourceData.message = 'バージョニングを有効化しました';
          } catch (error) {
            resourceData.error = `バージョニングの有効化中にエラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        } else {
          resourceData.dryRun = true;
          resourceData.message = 'テストモードのため、バージョニングは有効化されませんでした';
        }
        
        processedBuckets.push(resourceData);
      }
    }
    
    return {
      message: `${processedBuckets.length}件のS3バケットを処理しました`,
      dryRun,
      buckets: processedBuckets
    };
  } catch (error) {
    console.error('S3バケットバージョニングの処理中にエラーが発生しました:', error);
    throw error;
  }
};

// ツール実装のマップ
const toolImplementations: Record<string, ToolImplementation> = {
  hello_world: helloWorldTool,
  calculator: calculatorTool,
  low_utilization_ec2_instances: lowUtilizationEC2InstancesTool,
  ebs_snapshots: ebsSnapshotsTool,
  exposed_access_keys: exposedAccessKeysTool,
  s3_bucket_versioning: s3BucketVersioningTool
};

// ツールリクエストの処理ハンドラー
export const handleToolRequest = async (request: ToolRequest): Promise<ToolResponse> => {
  try {
    const { name, parameters } = request;
    
    // ツールの存在チェック
    const toolImplementation = toolImplementations[name];
    if (!toolImplementation) {
      return {
        status: 'error',
        error: `ツール "${name}" は存在しません`
      };
    }
    
    // ツールの実行
    const result = await toolImplementation(parameters);
    
    return {
      status: 'success',
      data: result
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : '不明なエラーが発生しました'
    };
  }
}; 