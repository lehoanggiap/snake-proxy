import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

export interface SnakeSubdomainProps {
  parentHostedZoneId: string;
  parentDomainName: string;
  environment: string;
}

export class SnakeSubdomain extends Construct {
  public readonly hostedZone: route53.PublicHostedZone;
  public readonly subdomainName: string;

  constructor(scope: Construct, id: string, props: SnakeSubdomainProps) {
    super(scope, id);

    const { parentHostedZoneId, parentDomainName, environment } = props;

    this.subdomainName = `${environment}.${parentDomainName}`;

    // Create a new hosted zone for the subdomain
    this.hostedZone = new route53.PublicHostedZone(this, `Snake-Subdomain-${environment}`, {
      zoneName: this.subdomainName,
      comment: `Hosted zone for ${this.subdomainName}`,
    });

    // Look up the parent hosted zone
    const parentHostedZone = route53.HostedZone.fromHostedZoneAttributes(this, `Snake-Parent-Hosted-Zone-${environment}`, {
      hostedZoneId: parentHostedZoneId,
      zoneName: parentDomainName,
    });

    // Create NS record in parent zone
    new route53.NsRecord(this, `Snake-Domain-NS-Record-${environment}`, {
      zone: parentHostedZone,
      recordName: environment, // Just the subdomain part (e.g., 'dev' or 'prod')
      values: this.hostedZone.hostedZoneNameServers || [],
      ttl: cdk.Duration.minutes(30),
    });

    // Output the subdomain hosted zone ID and name servers
    new cdk.CfnOutput(this, 'SubdomainHostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description: `Hosted zone ID for ${this.subdomainName}`,
      exportName: `${environment}-${parentDomainName.replace(/\./g, '-')}-zone-id`,
    });

    new cdk.CfnOutput(this, 'SubdomainNameServers', {
      value: cdk.Fn.join(', ', this.hostedZone.hostedZoneNameServers || []),
      description: `Name servers for ${this.subdomainName}`,
      exportName: `${environment}-${parentDomainName.replace(/\./g, '-')}-name-servers`,
    });
  }
}
