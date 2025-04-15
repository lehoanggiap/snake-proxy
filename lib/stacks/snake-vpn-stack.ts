import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';

import { SnakeACM } from '../constructs/snake-acm-cert';
import { SnakeVPNLoadBalancer } from '../constructs/snake-vpn-load-balancer';
import { SnakeVPNServer } from '../constructs/snake-vpn-server';
import { CommonConfig, EnvironmentConfig } from '../models';

export interface SnakeVpnStackProps extends cdk.StackProps {
  envConfig: EnvironmentConfig;
  environment: string;
  common: CommonConfig;
  malwareProtectionDnsIp?: string; // Optional: DNS IP from malware protection stack
}

export class SnakeVpnStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SnakeVpnStackProps) {
    super(scope, id, props);

    const { envConfig, environment, common, malwareProtectionDnsIp } = props;

    // Import the existing VPC using the exported VPC ID
    const snakeVpc = ec2.Vpc.fromLookup(this, `Snake-Imported-VPC-${environment}`, {
      vpcId: envConfig.vpcId,
      region: common.region,
      ownerAccountId: common.accountId,
    });

    const domainHostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'ImportedHostedZone', {
      hostedZoneId: cdk.Fn.importValue(`${envConfig.domainName.replace(/\./g, '-')}-zone-id`),
      zoneName: envConfig.domainName,
    });

    // Create DNS configuration and ACM certificate first
    const snakeACM = new SnakeACM(this, `Snake-ACM-${environment}`, {
      domainName: envConfig.domainName,
      environment,
      domainHostedZone,
    });

    // Create Network Load Balancer with the certificate from SnakeACM
    if (!snakeACM.certificate) {
      throw new Error('Certificate is required for NLB');
    }

    const snakeNlb = new SnakeVPNLoadBalancer(this, `Snake-VPN-Load-Balancer-${environment}`, {
      vpc: snakeVpc,
      environment,
      yourIp: envConfig.yourIp,
      certificateArn: snakeACM.certificate.certificateArn,
    });

    // Get the malware protection DNS IP from either props or import from CloudFormation
    let malwareDnsIp = malwareProtectionDnsIp;
    if (!malwareDnsIp) {
      try {
        malwareDnsIp = cdk.Fn.importValue(`Snake-Malware-DNS-IP-${environment}`).toString();
        console.log(`Imported Malware Protection DNS IP: ${malwareDnsIp}`);
      } catch (error) {
        console.warn('Could not import Malware Protection DNS IP. DNS protection might not work properly.');
        malwareDnsIp = '';
      }
    }

    // Create VPN server in private subnet
    const snakeServer = new SnakeVPNServer(this, `Snake-VPN-Server-${environment}`, {
      vpc: snakeVpc,
      yourIp: envConfig.yourIp,
      environment,
      domainName: envConfig.domainName,
      subdomain: envConfig.subdomain,
      fullDomainName: `${envConfig.subdomain}.${envConfig.domainName}`,
      nlbSecurityGroup: snakeNlb.securityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      malwareProtectionDnsIp: malwareDnsIp, // Pass the DNS IP directly to the VPN server
    });

    // Add VPN server as target to NLB
    snakeNlb.addTarget(snakeServer.autoScalingGroup);

    // Update DNS record to point to NLB
    new route53.ARecord(this, `Snake-VPN-Record-${environment}`, {
      zone: domainHostedZone,
      recordName: envConfig.subdomain,
      target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(snakeNlb.nlb)),
    });
  }
}
