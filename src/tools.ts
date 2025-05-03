import AWS from 'aws-sdk';

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

// 低利用率EC2インスタンスの特定と停止提案
const lowUtilizationEC2InstancesTool: ToolImplementation = {
  async execute(params) {
    const { region = 'all', tagKey = 'environment', tagValue = 'dev' } = params;
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
            
            const instanceDetail = {
              ...filteredInstances.find(i => i.instanceId === instance.InstanceId),
              tagMatch,
              tags: tags.map(tag => ({ key: tag.Key, value: tag.Value })),
              instanceType: instance.InstanceType || 'N/A',
              state: instance.State?.Name || 'N/A',
              launchTime: instance.LaunchTime ? instance.LaunchTime.toISOString() : 'N/A'
            };
            
            instancesWithTags.push(instanceDetail);
            
            // 条件に一致するインスタンスを停止対象に追加
            if (tagMatch && instance.State?.Name !== 'stopped') {
              instancesToStop.push({
                ...instanceDetail,
                currentState: instance.State?.Name,
                // TerraformやCloudFormationで管理されているかチェックするタグを探す
                managedBy: tags.find(tag => 
                  ['terraform:managed', 'aws:cloudformation:stack-name'].includes(tag.Key || '')
                )
              });
            }
          }
        }
      }
      
      // 結果を返す
      const stoppableCount = instancesToStop.length;
      const managedCount = instancesToStop.filter(i => i.managedBy).length;
      
      // 提案を生成
      const recommendations = instancesToStop.map(instance => {
        const managedWarning = instance.managedBy 
          ? `※注意: このインスタンスは ${instance.managedBy.key}=${instance.managedBy.value} で管理されています。変更はIaCツールを通じて行ってください。` 
          : '';
        
        return {
          instanceId: instance.instanceId,
          region: instance.region,
          instanceType: instance.instanceType,
          currentState: instance.currentState,
          utilizationData: instance.utilizationData,
          recommendedAction: `EC2インスタンスを停止する: aws ec2 stop-instances --instance-ids ${instance.instanceId} --region ${instance.region}`,
          terraformExample: instance.managedBy ? `# Terraformの例:
resource "aws_instance" "${instance.instanceId.replace('i-', '')}" {
  # 他の設定はそのままに
  instance_id = "${instance.instanceId}"
  # インスタンスを停止状態に設定
  instance_initiated_shutdown_behavior = "stop"
}` : null,
          managedWarning
        };
      });
      
      return {
        message: `${stoppableCount}個のインスタンスを停止することを提案します（${managedCount}個はIaCで管理されています）`,
        summary: {
          totalLowUtilizationInstances: filteredInstances.length,
          matchingTaggedInstances: instancesToStop.length,
          managedByIaC: managedCount
        },
        recommendations,
        allInstances: instancesWithTags
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

// EBSスナップショットの作成提案ツール
const ebsSnapshotsTool: ToolImplementation = {
  async execute(params) {
    const { region = 'all' } = params;
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
      
      // 管理ステータスを確認するためにボリュームの詳細情報とタグを取得
      const volumesWithDetails: any[] = [];
      
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
            // ボリュームの詳細情報を取得
            const { Volumes } = await ec2.describeVolumes({
              VolumeIds: [volume.volumeId]
            }).promise();
            
            if (!Volumes || Volumes.length === 0) continue;
            
            const volumeDetail = Volumes[0];
            const tags = volumeDetail.Tags || [];
            
            // TerraformやCloudFormationで管理されているかチェックするタグを探す
            const managedBy = tags.find(tag => 
              ['terraform:managed', 'aws:cloudformation:stack-name'].includes(tag.Key || '')
            );
            
            volumesWithDetails.push({
              ...volume,
              size: volumeDetail.Size,
              volumeType: volumeDetail.VolumeType,
              availabilityZone: volumeDetail.AvailabilityZone,
              state: volumeDetail.State,
              createTime: volumeDetail.CreateTime ? volumeDetail.CreateTime.toISOString() : 'N/A',
              tags: tags.map(tag => ({ key: tag.Key, value: tag.Value })),
              managedBy
            });
          } catch (error: any) {
            console.error(`EBSボリューム ${volume.volumeId} の詳細取得中にエラーが発生しました:`, error);
            volumesWithDetails.push({
              ...volume,
              error: error.message || 'Unknown error'
            });
          }
        }
      }
      
      // 提案を生成
      const recommendations = volumesWithDetails.map(volume => {
        const managedWarning = volume.managedBy 
          ? `※注意: このボリュームは ${volume.managedBy.key}=${volume.managedBy.value} で管理されています。変更はIaCツールを通じて行ってください。` 
          : '';
        
        const snapshotDescription = `Backup-${volume.volumeId}-${new Date().toISOString()}`;
        
        return {
          volumeId: volume.volumeId,
          region: volume.region,
          lastSnapshot: volume.lastSnapshot,
          volumeType: volume.volumeType,
          size: volume.size,
          recommendedAction: `スナップショットを作成する: aws ec2 create-snapshot --volume-id ${volume.volumeId} --description "${snapshotDescription}" --region ${volume.region}`,
          terraformExample: volume.managedBy ? `# Terraformの例:
resource "aws_ebs_snapshot" "${volume.volumeId.replace('vol-', '')}" {
  volume_id    = "${volume.volumeId}"
  description  = "${snapshotDescription}"
  tags = {
    Name = "Backup-${volume.volumeId}"
  }
}` : null,
          managedWarning
        };
      });
      
      const managedCount = volumesWithDetails.filter(v => v.managedBy).length;
      
      // 結果を返す
      return {
        message: `${volumesWithDetails.length}個のEBSボリュームのスナップショットを作成することを提案します（${managedCount}個はIaCで管理されています）`,
        summary: {
          totalVolumesNeedingBackup: filteredVolumes.length,
          managedByIaC: managedCount
        },
        recommendations,
        volumes: volumesWithDetails
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

// 公開されたIAMアクセスキーの無効化提案ツール
const exposedAccessKeysTool: ToolImplementation = {
  async execute(params) {
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
      
      // IAMユーザーの詳細情報を取得
      const iam = new AWS.IAM();
      const usersWithDetails: any[] = [];
      
      for (const key of exposedKeys) {
        if (!key.accessKeyId || !key.username) continue;
        
        try {
          // IAMユーザーの詳細情報を取得
          const { User } = await iam.getUser({
            UserName: key.username
          }).promise();
          
          // ユーザーのタグを取得
          const { Tags } = await iam.listUserTags({
            UserName: key.username
          }).promise();
          
          // TerraformやCloudFormationで管理されているかチェックするタグを探す
          const managedBy = Tags?.find(tag => 
            ['terraform:managed', 'aws:cloudformation:stack-name'].includes(tag.Key || '')
          );
          
          usersWithDetails.push({
            ...key,
            arn: User?.Arn,
            createDate: User?.CreateDate ? User.CreateDate.toISOString() : 'N/A',
            tags: Tags?.map(tag => ({ key: tag.Key, value: tag.Value })) || [],
            managedBy
          });
        } catch (error: any) {
          console.error(`IAMユーザー ${key.username} の詳細取得中にエラーが発生しました:`, error);
          usersWithDetails.push({
            ...key,
            error: error.message || 'Unknown error'
          });
        }
      }
      
      // 提案を生成
      const recommendations = usersWithDetails.map(user => {
        const managedWarning = user.managedBy 
          ? `※注意: このIAMユーザーは ${user.managedBy.key}=${user.managedBy.value} で管理されています。変更はIaCツールを通じて行ってください。` 
          : '';
        
        return {
          accessKeyId: user.accessKeyId,
          username: user.username,
          location: user.location,
          recommendedAction: `アクセスキーを無効化する: aws iam update-access-key --access-key-id ${user.accessKeyId} --status Inactive --user-name ${user.username}`,
          terraformExample: user.managedBy ? `# Terraformの例:
resource "aws_iam_access_key" "${user.username}_${user.accessKeyId.substring(0, 8)}" {
  user    = "${user.username}"
  status  = "Inactive"
}` : null,
          rotationExample: `# 新しいキーを作成し、古いキーを無効化、その後削除するプロセス:
# 1. 新しいキーを作成
aws iam create-access-key --user-name ${user.username}

# 2. アプリケーションを新しいキーに更新

# 3. 古いキーを無効化
aws iam update-access-key --access-key-id ${user.accessKeyId} --status Inactive --user-name ${user.username}

# 4. 適切なテスト後、古いキーを削除
aws iam delete-access-key --access-key-id ${user.accessKeyId} --user-name ${user.username}`,
          managedWarning
        };
      });
      
      const managedCount = usersWithDetails.filter(u => u.managedBy).length;
      
      // 結果を返す
      return {
        message: `${usersWithDetails.length}個の公開されたIAMアクセスキーの無効化を提案します（${managedCount}個はIaCで管理されています）`,
        summary: {
          totalExposedKeys: exposedKeys.length,
          managedByIaC: managedCount
        },
        securityRecommendation: '公開されたアクセスキーは直ちに無効化し、新しいキーにローテーションすることを強く推奨します。GitHubなどの公開リポジトリからも漏洩したキーを削除してください。',
        recommendations,
        exposedKeys: usersWithDetails
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

// S3バケットのバージョニング有効化提案ツール
const s3BucketVersioningTool: ToolImplementation = {
  async execute(params) {
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
      }).filter(bucket => bucket.bucketName); // 空のバケット名をフィルタリング
      
      // S3バケットの詳細情報とタグを取得
      const s3 = new AWS.S3();
      const bucketsWithDetails: any[] = [];
      
      for (const bucket of bucketsWithoutVersioning) {
        try {
          // バケットのタグを取得
          const { TagSet } = await s3.getBucketTagging({
            Bucket: bucket.bucketName
          }).promise().catch(() => ({ TagSet: [] }));
          
          // TerraformやCloudFormationで管理されているかチェックするタグを探す
          const managedBy = TagSet?.find((tag: any) => 
            ['terraform:managed', 'aws:cloudformation:stack-name'].includes(tag.Key || '')
          );
          
          bucketsWithDetails.push({
            ...bucket,
            tags: TagSet?.map((tag: any) => ({ key: tag.Key, value: tag.Value })) || [],
            managedBy
          });
        } catch (error: any) {
          console.error(`S3バケット ${bucket.bucketName} の詳細取得中にエラーが発生しました:`, error);
          bucketsWithDetails.push({
            ...bucket,
            error: error.message || 'Unknown error'
          });
        }
      }
      
      // 提案を生成
      const recommendations = bucketsWithDetails.map(bucket => {
        const managedWarning = bucket.managedBy 
          ? `※注意: このS3バケットは ${bucket.managedBy.key}=${bucket.managedBy.value} で管理されています。変更はIaCツールを通じて行ってください。` 
          : '';
        
        return {
          bucketName: bucket.bucketName,
          region: bucket.region,
          recommendedAction: `バージョニングを有効化する: aws s3api put-bucket-versioning --bucket ${bucket.bucketName} --versioning-configuration Status=Enabled`,
          terraformExample: bucket.managedBy ? `# Terraformの例:
resource "aws_s3_bucket_versioning" "${bucket.bucketName.replace(/[.-]/g, '_')}" {
  bucket = "${bucket.bucketName}"
  versioning_configuration {
    status = "Enabled"
  }
}` : null,
          managedWarning
        };
      });
      
      const managedCount = bucketsWithDetails.filter(b => b.managedBy).length;
      
      // 結果を返す
      return {
        message: `${bucketsWithDetails.length}個のS3バケットでバージョニングを有効化することを提案します（${managedCount}個はIaCで管理されています）`,
        summary: {
          totalBucketsWithoutVersioning: bucketsWithoutVersioning.length,
          managedByIaC: managedCount
        },
        recommendations,
        buckets: bucketsWithDetails
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