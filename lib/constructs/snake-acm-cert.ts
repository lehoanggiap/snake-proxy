import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

export interface SnakeACMProps {
  domainName: string;
  environment: string;
  domainHostedZone: route53.IHostedZone;
}

export class SnakeACM extends Construct {
  public readonly certificate?: acm.Certificate;

  constructor(scope: Construct, id: string, props: SnakeACMProps) {
    super(scope, id);

    const { domainName, domainHostedZone, environment } = props;

    // Create ACM certificate
    this.certificate = new acm.Certificate(this, `Snake-Wildcard-ACM-Cert-${environment}`, {
      domainName: `*.${domainName}`,
      validation: acm.CertificateValidation.fromDns(domainHostedZone),
    });
  }
}
