@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Environment identifier.')
param environment string = 'dev'

@description('Project tag value.')
param projectName string = 'project-marvin'

@description('Cost center tag value.')
param costCenter string = 'hcs-internal'

@description('Owner tag value.')
param owner string = 'project-marvin'

@description('Managed by tag value.')
param managedBy string = 'bicep'

@description('Container image for Keeper services.')
param containerImage string = 'ghcr.io/ridafkih/keeper-services:2.9'

@description('Container image for the Marvin operator UI.')
param marvinUiImage string

@description('Managed environment name for Azure Container Apps.')
param containerAppEnvironmentName string

@description('Container app name for the public Marvin UI.')
param marvinAppName string

@description('Container app name for the public Keeper runtime.')
param keeperAppName string

@description('Log Analytics workspace name.')
param logAnalyticsWorkspaceName string

@description('PostgreSQL flexible server name.')
param postgresServerName string

@description('Container registry server for the Marvin UI image.')
param registryServer string

@description('Container registry username for the Marvin UI image.')
param registryUsername string

@secure()
@description('Container registry password for the Marvin UI image.')
param registryPassword string

@description('PostgreSQL admin username.')
param postgresAdminUser string = 'keeperadmin'

@secure()
@description('PostgreSQL admin password.')
param postgresAdminPassword string

@description('Keeper PostgreSQL database name.')
param postgresDatabaseName string = 'postgres'

@description('PostgreSQL SKU name.')
param postgresSkuName string = 'Standard_B2s'

@description('PostgreSQL tier.')
param postgresTier string = 'Burstable'

@description('PostgreSQL version.')
param postgresVersion string = '16'

@description('CPU allocation for the Keeper container.')
param containerCpu string = '0.5'

@description('Memory allocation for the Keeper container.')
param containerMemory string = '1Gi'

@description('CPU allocation for the Marvin UI container.')
param marvinUiCpu string = '0.25'

@description('Memory allocation for the Marvin UI container.')
param marvinUiMemory string = '0.5Gi'

@description('Minimum number of replicas to keep running.')
param minReplicas int = 1

@description('Maximum number of replicas.')
param maxReplicas int = 1

@secure()
@description('Keeper auth secret.')
param betterAuthSecret string

@secure()
@description('Keeper encryption key.')
param encryptionKey string

@secure()
@description('Microsoft OAuth client ID.')
param microsoftClientId string

@secure()
@description('Microsoft OAuth client secret.')
param microsoftClientSecret string

@description('Google OAuth client ID. Leave empty if not used.')
param googleClientId string = ''

@secure()
@description('Google OAuth client secret. Leave empty if not used.')
param googleClientSecret string = ''

@description('Comma-separated trusted origins for Keeper.')
param trustedOrigins string = 'https://placeholder.invalid'

@description('Base URL used by Keeper auth callbacks.')
param betterAuthUrl string = 'https://placeholder.invalid'

var tags = {
  Owner: owner
  Project: projectName
  Environment: environment
  CostCenter: costCenter
  ManagedBy: managedBy
}

var workspaceSkuName = 'PerGB2018'
var useGoogle = !empty(trim(googleClientId)) && !empty(trim(googleClientSecret))
var postgresHost = '${postgresServerName}.postgres.database.azure.com'
var databaseUrl = 'postgresql://${uriComponent(postgresAdminUser)}:${uriComponent(postgresAdminPassword)}@${postgresHost}:5432/${postgresDatabaseName}?sslmode=require'

resource workspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  tags: tags
  properties: {
    features: {
      disableLocalAuth: false
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    retentionInDays: 30
    sku: {
      name: workspaceSkuName
    }
    workspaceCapping: {
      dailyQuotaGb: -1
    }
  }
}

resource postgresServer 'Microsoft.DBforPostgreSQL/flexibleServers@2022-12-01' = {
  name: postgresServerName
  location: location
  tags: tags
  sku: {
    name: postgresSkuName
    tier: postgresTier
  }
  properties: {
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {}
    storage: {
      storageSizeGB: 32
    }
    version: postgresVersion
  }
}

resource postgresAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2022-12-01' = {
  parent: postgresServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppEnvironmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
  }
}

resource marvinApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: marvinAppName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3001
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
      containers: [
        {
          name: 'marvin-ui'
          image: marvinUiImage
          env: [
            {
              name: 'MARVIN_UI_PORT'
              value: '3001'
            }
            {
              name: 'MARVIN_DEPLOY_ENABLED'
              value: 'false'
            }
            {
              name: 'MARVIN_HOSTED'
              value: 'true'
            }
          ]
          resources: {
            cpu: json(marvinUiCpu)
            memory: marvinUiMemory
          }
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

resource keeperApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: keeperAppName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      secrets: concat([
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          name: 'better-auth-secret'
          value: betterAuthSecret
        }
        {
          name: 'encryption-key'
          value: encryptionKey
        }
        {
          name: 'microsoft-client-id'
          value: microsoftClientId
        }
        {
          name: 'microsoft-client-secret'
          value: microsoftClientSecret
        }
      ], useGoogle ? [
        {
          name: 'google-client-id'
          value: googleClientId
        }
        {
          name: 'google-client-secret'
          value: googleClientSecret
        }
      ] : [])
    }
    template: {
      containers: [
        {
          name: 'keeper'
          image: containerImage
          env: concat([
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'REDIS_URL'
              value: 'redis://localhost:6379'
            }
            {
              name: 'WORKER_JOB_QUEUE_ENABLED'
              value: 'true'
            }
            {
              name: 'BETTER_AUTH_URL'
              value: betterAuthUrl
            }
            {
              name: 'BETTER_AUTH_SECRET'
              secretRef: 'better-auth-secret'
            }
            {
              name: 'ENCRYPTION_KEY'
              secretRef: 'encryption-key'
            }
            {
              name: 'TRUSTED_ORIGINS'
              value: trustedOrigins
            }
            {
              name: 'MICROSOFT_CLIENT_ID'
              secretRef: 'microsoft-client-id'
            }
            {
              name: 'MICROSOFT_CLIENT_SECRET'
              secretRef: 'microsoft-client-secret'
            }
          ], useGoogle ? [
            {
              name: 'GOOGLE_CLIENT_ID'
              secretRef: 'google-client-id'
            }
            {
              name: 'GOOGLE_CLIENT_SECRET'
              secretRef: 'google-client-secret'
            }
          ] : [])
          resources: {
            cpu: json(containerCpu)
            memory: containerMemory
          }
        }
        {
          name: 'redis'
          image: 'redis:7-alpine'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output marvinUrl string = 'https://${marvinApp.properties.configuration.ingress.fqdn}'
output marvinFqdn string = marvinApp.properties.configuration.ingress.fqdn
output keeperUrl string = 'https://${keeperApp.properties.configuration.ingress.fqdn}'
output keeperFqdn string = keeperApp.properties.configuration.ingress.fqdn
output postgresHost string = postgresHost
output postgresAdminUser string = postgresAdminUser

