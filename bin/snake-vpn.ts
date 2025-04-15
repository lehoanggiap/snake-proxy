#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import { Environment, EnvironmentConfig, CommonConfig } from '../lib/models';
import { SnakeMalwareProtectionStack } from '../lib/stacks/snake-malware-protection-stack';
import { SnakeVpnStack } from '../lib/stacks/snake-vpn-stack';
import { SnakeSubdomainStack } from '../lib/stacks/snake-vpn-subdomain-stack';

const app = new cdk.App();

// Determine environment from config option
const configEnv = (app.node.tryGetContext('config') || process.env.CDK_CONFIG || 'dev') as Environment;
console.log(`Loading configuration for environment: ${configEnv}`);

// Get environment-specific configuration and common configuration
const envConfig = app.node.tryGetContext(configEnv) as EnvironmentConfig;
const commonConfig = app.node.tryGetContext('common') as CommonConfig;

if (!envConfig) {
  throw new Error(`No configuration found for ${configEnv} environment in cdk.json`);
}

if (!commonConfig) {
  throw new Error('Common configuration not found in cdk.json');
}

// Log the configuration being used
console.log(`Environment: ${configEnv}`);
console.log(`Environment Configuration: ${JSON.stringify(envConfig, null, 2)}`);
console.log(`Common Configuration: ${JSON.stringify(commonConfig, null, 2)}`);

const env = {
  account: commonConfig.accountId,
  region: commonConfig.region,
};

// Create the Subdomain stack for the current environment
const subdomainStack = new SnakeSubdomainStack(app, `Snake-Subdomain-Stack-${configEnv}`, {
  parentHostedZoneId: commonConfig.parentHostedZoneId,
  parentDomainName: commonConfig.parentDomainName,
  environment: configEnv,
  env,
  tags: {
    Service: 'DNS',
    Environment: configEnv,
  },
});

// Create the Malware Protection stack with environment-specific configuration
const malwareProtectionStack = new SnakeMalwareProtectionStack(app, `Snake-Malware-Protection-Stack-${configEnv}`, {
  envConfig,
  environment: configEnv,
  common: commonConfig, // Pass the common configuration
  env,
  tags: {
    Service: 'MalwareProtection',
    Environment: configEnv,
  },
});

// Create the VPN stack with environment-specific configuration
const vpnStack = new SnakeVpnStack(app, `Snake-Vpn-Stack-${configEnv}`, {
  envConfig,
  environment: configEnv,
  common: commonConfig,
  malwareProtectionDnsIp: malwareProtectionStack.malwareDnsServer.privateIp,
  env,
  tags: {
    Environment: configEnv,
  },
});

// Make VPN stack depend on Subdomain stack
vpnStack.addDependency(subdomainStack);

// Make VPN stack depend on Malware Protection stack
vpnStack.addDependency(malwareProtectionStack);
