import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { SnakeSubdomain } from '../constructs/snake-subdomain';

interface SnakeSubdomainStackProps extends cdk.StackProps {
  parentHostedZoneId: string;
  parentDomainName: string;
  environment: string;
}

export class SnakeSubdomainStack extends cdk.Stack {
  public readonly hostedZone: string;
  public readonly domainName: string;

  constructor(scope: Construct, id: string, props: SnakeSubdomainStackProps) {
    super(scope, id, props);

    const { parentHostedZoneId, parentDomainName, environment } = props;

    // Create subdomain for the environment
    const subdomainConfig = new SnakeSubdomain(this, `Snake-Subdomain-${environment}`, {
      parentHostedZoneId,
      parentDomainName,
      environment,
    });

    this.hostedZone = subdomainConfig.hostedZone.hostedZoneId;
    this.domainName = subdomainConfig.subdomainName;

    // Export the hosted zone ID for cross-stack reference
    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone,
      description: `Hosted zone ID for ${environment}.${parentDomainName}`,
      exportName: `${environment}-${parentDomainName.replace(/\./g, '-')}-zone`,
    });

    // Export the domain name for cross-stack reference
    new cdk.CfnOutput(this, 'DomainName', {
      value: this.domainName,
      description: `Domain name for ${environment} environment`,
      exportName: `${environment}-${parentDomainName.replace(/\./g, '-')}-domain`,
    });
  }
}
