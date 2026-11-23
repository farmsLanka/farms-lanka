#!/usr/bin/env node

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { FarmsLankaDnsStack } from '../lib/dns-stack';
import { FarmsLankaSiteStack } from '../lib/site-stack';


const DOMAIN_NAME = 'farmslanka.org';
const GITHUB_REPO = 'farmsLanka@360388904/farms-lanka@1456468154';
const GITHUB_BRANCH = 'main';

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1',
};

const app = new cdk.App();

/**
 * STACK 1 — DNS only.
 *
 * This creates the Route 53 hosted zone and nothing else. It is separate
 * because of a sequencing problem that will otherwise bite:
 *
 *   The ACM certificate in stack 2 is validated by DNS. AWS writes a special
 *   CNAME record into the hosted zone and then waits for the public internet
 *   to confirm it. That only works once farmslanka.org's nameservers at
 *   GoDaddy actually point at this Route 53 zone.
 *
 *   If you deploy everything at once on a fresh account, CloudFormation sits
 *   and waits on certificate validation — potentially for hours — then fails
 *   and rolls back, because the delegation does not exist yet.
 *
 * So: deploy this stack first, take the four nameservers it outputs, set them
 * at GoDaddy, wait for them to propagate, and only then deploy stack 2.
 */
const dns = new FarmsLankaDnsStack(app, 'FarmsLankaDns', {
  env,
  domainName: DOMAIN_NAME,
  description: 'Route 53 hosted zone for farmslanka.org (deploy this first)',
});

/**
 * STACK 2 — everything else: S3, CloudFront, ACM, DNS records, GitHub OIDC.
 *
 * Passing `dns.hostedZone` creates a dependency, so CDK always deploys the DNS
 * stack before this one.
 */
new FarmsLankaSiteStack(app, 'FarmsLankaSite', {
  env,
  domainName: DOMAIN_NAME,
  hostedZone: dns.hostedZone,
  githubRepo: GITHUB_REPO,
  githubBranch: GITHUB_BRANCH,
  description: 'S3 + CloudFront static hosting for farmslanka.org',
});

app.synth();
