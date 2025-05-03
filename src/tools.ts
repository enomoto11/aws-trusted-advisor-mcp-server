import AWS from 'aws-sdk';
import { Tool } from './types';

// ツール実装の型定義
type ToolImplementation = {
  execute: (params: any) => Promise<any>;
};

// AWS認証情報設定関数
function configureAWS(region: string = 'us-east-1'): void {
  // リージョンを設定（引数で指定されたリージョンまたはデフォルト値）
  AWS.config.update({ region });
  
  // 環境変数、共有認証情報ファイル、またはIAMロールから認証情報を自動的にロード
  // 特に何もする必要はなく、AWS SDKが自動的に処理します
}

// Trusted Advisor チェック結果を取得する関数
async function getTrustedAdvisorCheckResults(
  support: AWS.Support,
  checkId: string
): Promise<AWS.Support.TrustedAdvisorCheckResult> {
  try {
    // チェックIDに基づいてTrusted Advisorチェックの結果を取得
    const { result } = await support.describeTrustedAdvisorCheckResult({
      checkId,
      language: 'en'
    }).promise();
    
    if (!result) {
      throw new Error(`No results found for check ID: ${checkId}`);
    }
    
    return result;
  } catch (error) {
    console.error('Error fetching Trusted Advisor check results:', error);
    throw error;
  }
}

// 低利用率EC2インスタンスの特定と停止
const lowUtilizationEC2InstancesTool: ToolImplementation = {
  async execute(params) {
    const { region = 'all', tagKey = 'environment', tagValue = 'dev', dryRun = true } = params;
    const regionToUse = region === 'all' ? 'us-east-1' : region;
    
    try {
      // AWS認証情報を設定
      configureAWS(regionToUse);
      
      // AWS Support APIを初期化
      const support = new AWS.Support({ region: 'us-east-1' }); // Support APIは米国東部 (バージニア北部)でのみ利用可能
      
      // 低利用率EC2インスタンスのチェックID
      const lowUtilizationEC2CheckId = 'Qch7DwouX1';
      
      console.log('Trusted Advisorから低利用率EC2インスタンスの情報を取得中...');
      const checkResult = await getTrustedAdvisorCheckResults(support, lowUtilizationEC2CheckId);
      
      if (!checkResult.flaggedResources || checkResult.flaggedResources.length === 0) {
        return {
          message: '低利用率のEC2インスタンスは見つかりませんでした。',
          instances: []
        };
      }
      
      // リージョンとタグでフィルタリング
      const filteredInstances = checkResult.flaggedResources
        .filter(resource => {
          const metadata = resource.metadata || [];
          const resourceRegion = metadata[2]; // メタデータの3番目の要素がリージョン
          
          // 特定のリージョンが指定された場合のみフィルタリング
          return region === 'all' || resourceRegion === region;
        })
        .map(resource => {
          const metadata = resource.metadata || [];
          return {
            instanceId: metadata[1] || '', // インスタンスID
            region: metadata[2] || '', // リージョン
            utilizationData: {
              cpu: metadata[4] || 'N/A', // CPU使用率
              network: metadata[5] || 'N/A', // ネットワーク使用率
              diskIO: metadata[6] || 'N/A' // ディスクI/O
            }
          };
        });
      
      if (filteredInstances.length === 0) {
        return {
          message: `指定されたリージョン(${region})で低利用率のEC2インスタンスは見つかりませんでした。`,
          instances: []
        };
      }
      
      // タグでフィルタリングするためのEC2クライアントを各リージョンで初期化
      const regionsToProcess = region === 'all'
        ? [...new Set(filteredInstances.map(instance => instance.region))]
        : [region];
      
      const instancesWithTags: any[] = [];
      const instancesToStop: any[] = [];
      
      // 各リージョンのインスタンスをタグでフィルタリング
      for (const regionToProcess of regionsToProcess) {
        // リージョン固有のEC2クライアントを初期化
        const ec2 = new AWS.EC2({ region: regionToProcess });
        
        // そのリージョンのインスタンスIDを取得
        const regionInstanceIds = filteredInstances
          .filter(instance => instance.region === regionToProcess)
          .map(instance => instance.instanceId)
          .filter(id => id !== ''); // 空のIDをフィルタリング
        
        if (regionInstanceIds.length === 0) {
          continue;
        }
        
        // インスタンスの詳細情報（タグを含む）を取得
        const { Reservations } = await ec2.describeInstances({
          InstanceIds: regionInstanceIds
        }).promise();
        
        if (!Reservations) {
          continue;
        }
        
        // すべてのインスタンスを処理
        for (const reservation of Reservations) {
          if (!reservation.Instances) {
            continue;
          }
          
          for (const instance of reservation.Instances) {
            if (!instance.InstanceId) continue;
            
            const tags = instance.Tags || [];
            const tagMatch = tags.some(tag => 
              tag.Key === tagKey && tag.Value === tagValue
            );
            
            const instanceWithTag = {
              ...filteredInstances.find(i => i.instanceId === instance.InstanceId),
              tagMatch,
              tags: tags.map(tag => ({ key: tag.Key, value: tag.Value }))
            };
            
            instancesWithTags.push(instanceWithTag);
            
            // 条件に一致するインスタンスを停止対象に追加
            if (tagMatch && instance.State?.Name !== 'stopped') {
              instancesToStop.push({
                ...instanceWithTag,
                currentState: instance.State?.Name
              });
            }
          }
        }
      }
      
      // インスタンスの停止ロジック
      const stoppedInstances: any[] = [];
      
      if (!dryRun) {
        for (const instance of instancesToStop) {
          if (!instance.instanceId || !instance.region) continue;
          
          try {
            const ec2 = new AWS.EC2({ region: instance.region });
            
            // インスタンスを停止
            const stopResult = await ec2.stopInstances({
              InstanceIds: [instance.instanceId]
            }).promise();
            
            const stoppedInstance = {
              ...instance,
              stopped: true,
              stopResult
            };
            
            stoppedInstances.push(stoppedInstance);
            console.log(`EC2インスタンス ${instance.instanceId} を停止しました。`);
          } catch (error: any) {
            console.error(`EC2インスタンス ${instance.instanceId} の停止中にエラーが発生しました:`, error);
            
            const failedInstance = {
              ...instance,
              stopped: false,
              error: error.message || 'Unknown error'
            };
            
            stoppedInstances.push(failedInstance);
          }
        }
      }
      
      // 結果を返す
      return {
        message: dryRun 
          ? `${instancesToStop.length}個のインスタンスが停止条件に一致しました（ドライラン）`
          : `${stoppedInstances.filter(i => i.stopped).length}/${instancesToStop.length}個のインスタンスを停止しました`,
        dryRun,
        allLowUtilizationInstances: filteredInstances.length,
        matchingTaggedInstances: instancesToStop.length,
        stoppedInstances: dryRun ? [] : stoppedInstances,
        instancesWithTags
      };
    } catch (error: any) {
      console.error('低利用率EC2インスタンスの処理中にエラーが発生しました:', error);
      return {
        error: true,
        message: `エラーが発生しました: ${error.message || 'Unknown error'}`,
        details: error
      };
    }
  }
};

// EBSスナップショットの作成ツール
const ebsSnapshotsTool: ToolImplementation = {
  async execute(params) {
    const { region = 'all', dryRun = true } = params;
    const regionToUse = region === 'all' ? 'us-east-1' : region;
    
    try {
      // AWS認証情報を設定
      configureAWS(regionToUse);
      
      // AWS Support APIを初期化
      const support = new AWS.Support({ region: 'us-east-1' });
      
      // EBSボリュームのスナップショットのチェックID
      const ebsSnapshotsCheckId = 'H7IgTzjTYb';
      
      console.log('Trusted AdvisorからバックアップのないEBSボリュームの情報を取得中...');
      const checkResult = await getTrustedAdvisorCheckResults(support, ebsSnapshotsCheckId);
      
      if (!checkResult.flaggedResources || checkResult.flaggedResources.length === 0) {
        return {
          message: 'バックアップが必要なEBSボリュームは見つかりませんでした。',
          volumes: []
        };
      }
      
      // リージョンでフィルタリング
      const filteredVolumes = checkResult.flaggedResources
        .filter(resource => {
          const metadata = resource.metadata || [];
          const resourceRegion = metadata[2]; // メタデータの3番目の要素がリージョン
          
          // 特定のリージョンが指定された場合のみフィルタリング
          return region === 'all' || resourceRegion === region;
        })
        .map(resource => {
          const metadata = resource.metadata || [];
          return {
            volumeId: metadata[1] || '', // ボリュームID
            region: metadata[2] || '', // リージョン
            instanceId: metadata[3] || 'Not attached', // インスタンスID（もしあれば）
            deviceName: metadata[4] || 'N/A', // デバイス名
            lastSnapshot: metadata[5] || 'Never' // 最後のスナップショット
          };
        });
      
      if (filteredVolumes.length === 0) {
        return {
          message: `指定されたリージョン(${region})でバックアップが必要なEBSボリュームは見つかりませんでした。`,
          volumes: []
        };
      }
      
      // スナップショットの作成ロジック
      const createdSnapshots: any[] = [];
      
      if (!dryRun) {
        // 各リージョンのボリュームを処理
        const regionsToProcess = region === 'all'
          ? [...new Set(filteredVolumes.map(volume => volume.region))]
          : [region];
        
        for (const regionToProcess of regionsToProcess) {
          // リージョン固有のEC2クライアントを初期化
          const ec2 = new AWS.EC2({ region: regionToProcess });
          
          // そのリージョンのボリュームを取得
          const regionVolumes = filteredVolumes.filter(volume => volume.region === regionToProcess);
          
          for (const volume of regionVolumes) {
            if (!volume.volumeId) continue;
            
            try {
              // スナップショットの説明
              const description = `自動スナップショット - Trusted Advisor - ${new Date().toISOString()}`;
              
              // スナップショットを作成
              const snapshot = await ec2.createSnapshot({
                VolumeId: volume.volumeId,
                Description: description
              }).promise();
              
              const createdSnapshot = {
                ...volume,
                snapshotCreated: true,
                snapshotId: snapshot.SnapshotId,
                snapshotDescription: description,
                timestamp: new Date().toISOString()
              };
              
              createdSnapshots.push(createdSnapshot);
              console.log(`EBSボリューム ${volume.volumeId} のスナップショットを作成しました: ${snapshot.SnapshotId}`);
            } catch (error: any) {
              console.error(`EBSボリューム ${volume.volumeId} のスナップショット作成中にエラーが発生しました:`, error);
              
              const failedSnapshot = {
                ...volume,
                snapshotCreated: false,
                error: error.message || 'Unknown error'
              };
              
              createdSnapshots.push(failedSnapshot);
            }
          }
        }
      }
      
      // 結果を返す
      return {
        message: dryRun 
          ? `${filteredVolumes.length}個のEBSボリュームがバックアップの対象です（ドライラン）`
          : `${createdSnapshots.filter(s => s.snapshotCreated).length}/${filteredVolumes.length}個のEBSボリュームのスナップショットを作成しました`,
        dryRun,
        volumesNeedingBackup: filteredVolumes.length,
        createdSnapshots: dryRun ? [] : createdSnapshots,
        volumes: filteredVolumes
      };
    } catch (error: any) {
      console.error('EBSスナップショット処理中にエラーが発生しました:', error);
      return {
        error: true,
        message: `エラーが発生しました: ${error.message || 'Unknown error'}`,
        details: error
      };
    }
  }
};

// 公開されたIAMアクセスキーの無効化ツール
const exposedAccessKeysTool: ToolImplementation = {
  async execute(params) {
    const { dryRun = true } = params;
    
    try {
      // AWS認証情報を設定（Support APIのリージョンはus-east-1のみ）
      configureAWS('us-east-1');
      
      // AWS Support APIを初期化
      const support = new AWS.Support({ region: 'us-east-1' });
      
      // 公開されたIAMアクセスキーのチェックID
      const exposedAccessKeysCheckId = '12Fnkpl8Y5';
      
      console.log('Trusted Advisorから公開されたIAMアクセスキーの情報を取得中...');
      const checkResult = await getTrustedAdvisorCheckResults(support, exposedAccessKeysCheckId);
      
      if (!checkResult.flaggedResources || checkResult.flaggedResources.length === 0) {
        return {
          message: '公開されたIAMアクセスキーは見つかりませんでした。',
          exposedKeys: []
        };
      }
      
      // 公開されたアクセスキーの情報を抽出
      const exposedKeys = checkResult.flaggedResources.map(resource => {
        const metadata = resource.metadata || [];
        return {
          accessKeyId: metadata[1] || '', // アクセスキーID
          username: metadata[2] || '', // IAMユーザー名
          location: metadata[3] || '', // 公開された場所/サービス
          caseId: metadata[4] || 'N/A', // AWSケースID（ある場合）
          updatedAt: metadata[5] || 'Unknown' // 最終更新日
        };
      });
      
      // アクセスキーの無効化ロジック
      const disabledKeys: any[] = [];
      
      if (!dryRun) {
        // IAMクライアントを初期化
        const iam = new AWS.IAM();
        
        for (const key of exposedKeys) {
          if (!key.accessKeyId || !key.username) continue;
          
          try {
            // アクセスキーを無効化
            await iam.updateAccessKey({
              AccessKeyId: key.accessKeyId,
              Status: 'Inactive',
              UserName: key.username
            }).promise();
            
            const disabledKey = {
              ...key,
              disabled: true,
              disabledAt: new Date().toISOString()
            };
            
            disabledKeys.push(disabledKey);
            console.log(`IAMアクセスキー ${key.accessKeyId} を無効化しました (ユーザー: ${key.username})`);
          } catch (error: any) {
            console.error(`IAMアクセスキー ${key.accessKeyId} の無効化中にエラーが発生しました:`, error);
            
            const failedKey = {
              ...key,
              disabled: false,
              error: error.message || 'Unknown error'
            };
            
            disabledKeys.push(failedKey);
          }
        }
      }
      
      // 結果を返す
      return {
        message: dryRun 
          ? `${exposedKeys.length}個の公開されたIAMアクセスキーが見つかりました（ドライラン）`
          : `${disabledKeys.filter(k => k.disabled).length}/${exposedKeys.length}個の公開されたIAMアクセスキーを無効化しました`,
        dryRun,
        exposedKeysCount: exposedKeys.length,
        disabledKeys: dryRun ? [] : disabledKeys,
        exposedKeys
      };
    } catch (error: any) {
      console.error('公開されたIAMアクセスキーの処理中にエラーが発生しました:', error);
      return {
        error: true,
        message: `エラーが発生しました: ${error.message || 'Unknown error'}`,
        details: error
      };
    }
  }
};

// S3バケットのバージョニング有効化ツール
const s3BucketVersioningTool: ToolImplementation = {
  async execute(params) {
    const { dryRun = true } = params;
    
    try {
      // AWS認証情報を設定（Support APIのリージョンはus-east-1のみ）
      configureAWS('us-east-1');
      
      // AWS Support APIを初期化
      const support = new AWS.Support({ region: 'us-east-1' });
      
      // S3バケットのバージョニングのチェックID
      const s3BucketVersioningCheckId = 'R365s2Qddf';
      
      console.log('Trusted Advisorからバージョニングが有効になっていないS3バケットの情報を取得中...');
      const checkResult = await getTrustedAdvisorCheckResults(support, s3BucketVersioningCheckId);
      
      if (!checkResult.flaggedResources || checkResult.flaggedResources.length === 0) {
        return {
          message: 'バージョニングが有効になっていないS3バケットは見つかりませんでした。',
          buckets: []
        };
      }
      
      // バージョニングが有効になっていないバケットの情報を抽出
      const bucketsWithoutVersioning = checkResult.flaggedResources.map(resource => {
        const metadata = resource.metadata || [];
        return {
          bucketName: metadata[1] || '', // バケット名
          region: metadata[2] || 'Unknown', // リージョン（わかる場合）
          createdAt: metadata[3] || 'Unknown' // 作成日
        };
      });
      
      // バージョニング有効化ロジック
      const updatedBuckets: any[] = [];
      
      if (!dryRun) {
        // S3クライアントを初期化
        const s3 = new AWS.S3();
        
        for (const bucket of bucketsWithoutVersioning) {
          if (!bucket.bucketName) continue;
          
          try {
            // バケットのバージョニングを有効化
            await s3.putBucketVersioning({
              Bucket: bucket.bucketName,
              VersioningConfiguration: {
                Status: 'Enabled'
              }
            }).promise();
            
            const updatedBucket = {
              ...bucket,
              versioningEnabled: true,
              enabledAt: new Date().toISOString()
            };
            
            updatedBuckets.push(updatedBucket);
            console.log(`S3バケット ${bucket.bucketName} のバージョニングを有効化しました`);
          } catch (error: any) {
            console.error(`S3バケット ${bucket.bucketName} のバージョニング有効化中にエラーが発生しました:`, error);
            
            const failedBucket = {
              ...bucket,
              versioningEnabled: false,
              error: error.message || 'Unknown error'
            };
            
            updatedBuckets.push(failedBucket);
          }
        }
      }
      
      // 結果を返す
      return {
        message: dryRun 
          ? `${bucketsWithoutVersioning.length}個のS3バケットがバージョニング有効化の対象です（ドライラン）`
          : `${updatedBuckets.filter(b => b.versioningEnabled).length}/${bucketsWithoutVersioning.length}個のS3バケットでバージョニングを有効化しました`,
        dryRun,
        bucketsWithoutVersioningCount: bucketsWithoutVersioning.length,
        updatedBuckets: dryRun ? [] : updatedBuckets,
        buckets: bucketsWithoutVersioning
      };
    } catch (error: any) {
      console.error('S3バケットバージョニングの処理中にエラーが発生しました:', error);
      return {
        error: true,
        message: `エラーが発生しました: ${error.message || 'Unknown error'}`,
        details: error
      };
    }
  }
};

// ツールの実装をエクスポート
export const implementTools: Record<string, ToolImplementation> = {
  low_utilization_ec2_instances: lowUtilizationEC2InstancesTool,
  ebs_snapshots: ebsSnapshotsTool,
  exposed_access_keys: exposedAccessKeysTool,
  s3_bucket_versioning: s3BucketVersioningTool
}; 