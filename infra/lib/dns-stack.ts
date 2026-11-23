/**
 * reserve a Route 53 hosted zone and return the NS records
 */
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as route53 from 'aws-cdk-lib/aws-route53';

export interface FarmsLankaDnsStackProps extends cdk.StackProps {
  domainName: string;
}

export class FarmsLankaDnsStack extends cdk.Stack {
  public readonly hostedZone: route53.PublicHostedZone;

  constructor(scope: Construct, id: string, props: FarmsLankaDnsStackProps) {
    super(scope, id, props);

    this.hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
      zoneName: props.domainName,
      comment: 'Managed by CDK — do not edit records by hand in the console',
    });

    // keeping retain so destroying stack wont destroy the zone(have to  reconfigure DNS again then)
    this.hostedZone.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    new cdk.CfnOutput(this, 'NameServers', {
      value: cdk.Fn.join(' , ', this.hostedZone.hostedZoneNameServers ?? []),
      description:
        'Set these four as the custom nameservers for the domain at GoDaddy, then wait for propagation before deploying FarmsLankaSite',
    });

    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description: 'Route 53 hosted zone ID',
    });
  }
}
