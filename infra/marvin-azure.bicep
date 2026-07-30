param managedBy string = 'bicep'
param location string
param workloadName string = 'marvin'
param environment string = 'dev'
param regionShort string = 'wus3'
param instance string = '01'
param tags object = {}
param logAnalyticsWorkspaceName string
param storageAccountName string
param fileShareName string = 'marvinstate'
param storageLinkName string = 'marvinstate'
param containerAppEnvironmentName string
param marvinAppName string
param containerImage string
param registryServer string
param registryUsername string
@secure()
param registryPassword string
param stateMountPath string = '/data'
param marvinUiPort int = 4177
param runtimeIntervalSeconds int = 300
param runtimeWindowDays int = 45
param containerCpu string = '0.5'
param containerMemory string = '1Gi'

var combinedTags = union({
  ManagedBy: managedBy
  Workload: workloadName
  Environment: environment
  Region: regionShort
  Instance: instance
}, tags)

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  tags: combinedTags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  tags: combinedTags
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  name: '${storage.name}/default/${fileShareName}'
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppEnvironmentName
  location: location
  tags: combinedTags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource managedEnvironmentStorage 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: managedEnvironment
  name: storageLinkName
  properties: {
    azureFile: {
      accountName: storage.name
      accountKey: storage.listKeys().keys[0].value
      shareName: fileShareName
      accessMode: 'ReadWrite'
    }
  }
}

resource marvinApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: marvinAppName
  location: location
  tags: combinedTags
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: marvinUiPort
        transport: 'auto'
      }
      registries: [
        {
          server: registryServer
          username: registryUsername
          passwordSecretRef: 'registry-password'
        }
      ]
      secrets: [
        {
          name: 'registry-password'
          value: registryPassword
        }
      ]
    }
    template: {
      volumes: [
        {
          name: 'marvin-state'
          storageType: 'AzureFile'
          storageName: storageLinkName
        }
      ]
      containers: [
        {
          name: 'marvin'
          image: containerImage
          resources: {
            cpu: json(containerCpu)
            memory: containerMemory
          }
          env: [
            {
              name: 'MARVIN_ROOT_DIR'
              value: stateMountPath
            }
            {
              name: 'MARVIN_APP_DIR'
              value: '/app'
            }
            {
              name: 'MARVIN_UI_PORT'
              value: string(marvinUiPort)
            }
            {
              name: 'MARVIN_HOSTED'
              value: 'true'
            }
            {
              name: 'MARVIN_AUTO_START'
              value: 'true'
            }
            {
              name: 'MARVIN_DEPLOY_ENABLED'
              value: 'false'
            }
            {
              name: 'MARVIN_SYNC_INTERVAL_SECONDS'
              value: string(runtimeIntervalSeconds)
            }
            {
              name: 'MARVIN_WINDOW_DAYS'
              value: string(runtimeWindowDays)
            }
          ]
          volumeMounts: [
            {
              mountPath: stateMountPath
              volumeName: 'marvin-state'
            }
          ]
          probes: [
            {
              type: 'Readiness'
              httpGet: {
                path: '/marvin-api/status'
                port: marvinUiPort
              }
              initialDelaySeconds: 10
              periodSeconds: 15
              timeoutSeconds: 5
              failureThreshold: 6
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/marvin-api/status'
                port: marvinUiPort
              }
              initialDelaySeconds: 30
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }

    }
  }
}

output marvinUrl string = 'https://${marvinApp.properties.configuration.ingress.fqdn}'
output marvinFqdn string = marvinApp.properties.configuration.ingress.fqdn
output storageAccount string = storage.name
output fileShare string = fileShare.name
output containerEnvironment string = managedEnvironment.name