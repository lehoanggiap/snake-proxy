import * as fs from 'fs';
import * as path from 'path';

import * as cdk from 'aws-cdk-lib';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface SnakeVPNServerProps {
  vpc: ec2.IVpc;
  yourIp: string;
  environment: string;
  domainName: string;
  subdomain: string;
  fullDomainName: string;
  nlbSecurityGroup: ec2.ISecurityGroup;
  vpcSubnets?: ec2.SubnetSelection;
  malwareProtectionDnsIp?: string;
}

export class SnakeVPNServer extends Construct {
  public readonly autoScalingGroup: autoscaling.AutoScalingGroup;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: SnakeVPNServerProps) {
    super(scope, id);

    const {
      vpc,
      environment,
      fullDomainName,
      nlbSecurityGroup,
      vpcSubnets,
      malwareProtectionDnsIp,
    } = props;

    // Create security group for EC2 instance
    this.securityGroup = new ec2.SecurityGroup(this, `Snake-Server-Security-Group-${environment}`, {
      vpc,
      description: `Security group for WireGuard VPN Server (${environment})`,
      allowAllOutbound: true,
    });

    // Allow HTTP access from NLB only
    this.securityGroup.addIngressRule(
      ec2.Peer.securityGroupId(nlbSecurityGroup.securityGroupId),
      ec2.Port.tcp(80),
      'Allow HTTP access from NLB only',
    );

    // Allow WireGuard VPN access from NLB only
    this.securityGroup.addIngressRule(
      ec2.Peer.securityGroupId(nlbSecurityGroup.securityGroupId),
      ec2.Port.udp(51820),
      'Allow WireGuard VPN access from NLB only',
    );

    // Create IAM role with additional permissions for CodeDeploy
    const role = new iam.Role(this, `Snake-Instance-Role-${environment}`, {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });

    const userData = ec2.UserData.custom(this.loadUserDataScript(
      fullDomainName,
      malwareProtectionDnsIp),
    );

    // ✅ Create an Auto Scaling Group (ASG)
    this.autoScalingGroup = new autoscaling.AutoScalingGroup(this, `Snake-Autoscaling-Group-${environment}`, {
      vpc,
      vpcSubnets: vpcSubnets || { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroup: this.securityGroup,

      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3A, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
      }),
      role,
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
      healthCheck: autoscaling.HealthCheck.elb({ grace: cdk.Duration.seconds(60) }),
      userData,
      updatePolicy: autoscaling.UpdatePolicy.replacingUpdate(),
    });

    // Outputs
    new cdk.CfnOutput(this, `Snake-VPN-URL-${environment}`, {
      value: `Access your WireGuard VPN configuration securely at: https://${fullDomainName}`,
      description: `Instructions to configure the WireGuard VPN (${environment})`,
    });
  }

  private loadUserDataScript(fullDomainName: string, malwareProtectionDnsIp?: string): string {
    // Load the base script
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'wireguard-setup.sh');
    let script = fs.readFileSync(scriptPath, 'utf8');

    // Replace placeholders with actual values
    script = script.replace('__FULL_DOMAIN_NAME__', fullDomainName);

    // If we have a malware protection DNS IP, add it to the script
    if (malwareProtectionDnsIp) {
      script = script.replace('__MALWARE_PROTECTION_DNS_IP__', malwareProtectionDnsIp);
    }

    return script;
  }
}
