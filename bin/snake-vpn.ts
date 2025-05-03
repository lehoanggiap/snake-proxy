#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import { Environment } from '../lib/models';
import { SnakeMalwareProtectionStack } from '../lib/stacks/snake-malware-protection-stack';
import { SnakeVpnStack } from '../lib/stacks/snake-vpn-stack';
import { SnakeSubdomainStack } from '../lib/stacks/snake-vpn-subdomain-stack';

const app = new cdk.App();

// Determine environment from context
const configEnv = (app.node.tryGetContext('env') || process.env.CDK_ENV || 'dev') as Environment;
console.log(`Loading configuration for environment: ${configEnv}`);

// Read all context values from command line
const parentHostedZoneId = app.node.tryGetContext('parentHostedZoneId');
const parentDomainName = app.node.tryGetContext('parentDomainName');
const accountId = app.node.tryGetContext('accountId');
const region = app.node.tryGetContext('region') || 'us-east-1';
const vpcId = app.node.tryGetContext('vpcId');
const domainName = app.node.tryGetContext('domainName');
const subdomain = app.node.tryGetContext('subdomain');
const yourIp = app.node.tryGetContext('yourIp');
const whitelistDomainsParameter = app.node.tryGetContext('whitelistDomainsParameter');
const serverPrivateKey = app.node.tryGetContext('serverPrivateKey');
const serverPublicKey = app.node.tryGetContext('serverPublicKey');
const clientPrivateKey = app.node.tryGetContext('clientPrivateKey');
const clientPublicKey = app.node.tryGetContext('clientPublicKey');

// Build config objects
const commonConfig = {
  parentHostedZoneId,
  parentDomainName,
  region,
  accountId,
  whitelistDomainsParameter,
};

const envConfig = {
  vpcId,
  domainName,
  subdomain,
  yourIp,
  serverPrivateKey,
  serverPublicKey,
  clientPrivateKey,
  clientPublicKey,
};

// Log the configuration being used
console.log(`Environment: ${configEnv}`);
console.log(`Environment Configuration: ${JSON.stringify(envConfig, null, 2)}`);
console.log(`Common Configuration: ${JSON.stringify(commonConfig, null, 2)}`);

const env = {
  account: accountId,
  region: region,
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
  common: commonConfig,
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
