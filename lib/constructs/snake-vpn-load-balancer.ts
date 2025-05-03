import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface SnakeVPNLoadBalancerProps {
  vpc: ec2.IVpc;
  environment: string;
  yourIp: string;
}

export class SnakeVPNLoadBalancer extends Construct {
  public readonly nlb: elbv2.NetworkLoadBalancer;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly udpListener: elbv2.NetworkListener;
  public readonly vpc: ec2.IVpc;
  public readonly environment: string;

  constructor(scope: Construct, id: string, props: SnakeVPNLoadBalancerProps) {
    super(scope, id);

    const { vpc, environment, yourIp } = props;

    this.vpc = vpc;
    this.environment = environment;

    // Create security group for NLB endpoints
    this.securityGroup = new ec2.SecurityGroup(this, `Snake-NLB-Security-Group-${environment}`, {
      vpc,
      description: `Security group for NLB endpoints (${environment})`,
      allowAllOutbound: true,
    });

    // Allow WireGuard VPN access only from your IP
    this.securityGroup.addIngressRule(
      ec2.Peer.ipv4(yourIp),
      ec2.Port.udp(51820),
      'Allow WireGuard VPN access from your IP',
    );

    // Create Network Load Balancer
    this.nlb = new elbv2.NetworkLoadBalancer(this, `Snake-Network-Load-Balancer-${environment}`, {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [this.securityGroup],
    });

    // Create UDP listener for WireGuard
    this.udpListener = this.nlb.addListener(`Snake-NLB-UDPListener-${environment}`, {
      port: 51820,
      protocol: elbv2.Protocol.UDP,
    });
  }

  public addTarget(asg: autoscaling.AutoScalingGroup) {
    // Only keep UDP target group and its attachment
    const ipTargetGroup = new elbv2.NetworkTargetGroup(this, `Snake-NLB-IPTargetGroup-${this.environment}`, {
      vpc: this.vpc,
      port: 51820,
      protocol: elbv2.Protocol.UDP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        protocol: elbv2.Protocol.TCP, // Health check over TCP (UDP health checks are not supported)
        port: '80', // Health check port (use TCP port 80 for health checks)
        healthyThresholdCount: 3,
        unhealthyThresholdCount: 3,
      },
    });
    ipTargetGroup.addTarget(asg);
    this.udpListener.addTargetGroups(`Snake-NLB-IPTargetGroup-${this.environment}`, ipTargetGroup);

    // Create a CodeDeploy Application
    const application = new codedeploy.ServerApplication(this, `Snake-CodeDeploy-Application-${this.environment}`, {
      applicationName: 'SnakeVPN',
    });

    // Create a CodeDeploy Deployment Group
    new codedeploy.ServerDeploymentGroup(this, `Snake-Deployment-Group-${this.environment}`, {
      application,
      deploymentGroupName: `SnakeDeploymentGroup-${this.environment}`,
      autoScalingGroups: [asg],
      deploymentConfig: codedeploy.ServerDeploymentConfig.ALL_AT_ONCE,
      installAgent: true,
      role: new iam.Role(this, `Snake-CodeDeploy-Role-${this.environment}`, {
        assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSCodeDeployRole'),
        ],
      }),
      loadBalancers: [
        codedeploy.LoadBalancer.network(ipTargetGroup),
      ],
    });
  }
}
