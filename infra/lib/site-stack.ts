/**
 * Site stack — the actual hosting infrastructure.
 * Note that this stack does NOT upload the website files. It builds the empty
 * infrastructure and an IAM role; GitHub Actions pushes the content. Keeping
 * infrastructure and content separate means a copy change is a 30-second
 * `aws s3 sync`, not a CloudFormation deploy.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface FarmsLankaSiteStackProps extends cdk.StackProps {
  domainName: string;
  hostedZone: route53.IHostedZone;
  githubRepo: string;
  githubBranch: string;
}

export class FarmsLankaSiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FarmsLankaSiteStackProps) {
    super(scope, id, props);

    const { domainName, hostedZone, githubRepo, githubBranch } = props;
    const wwwDomainName = `www.${domainName}`;

    // -----------------------------------------------------------------------
    // 1. S3 BUCKET — where the built files live
    // -----------------------------------------------------------------------

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      /**
       * Block every form of public access. With Origin Access Control (set up
       * in step 4) CloudFront still reads the bucket fine — it authenticates
       * as a service rather than fetching a public URL.
       */
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,

      /** Encrypt objects at rest. S3-managed keys are free; KMS would cost per request. */
      encryption: s3.BucketEncryption.S3_MANAGED,

      /** Reject any plain-HTTP request to the bucket API. */
      enforceSSL: true,

      /**
       * Keep previous versions of every file.
       *
       * This is the "one-click rollback" from the proposal: if a bad deploy
       * ships, the previous version of each object is still there. It also
       * protects against an accidental `aws s3 rm`.
       */
      versioned: true,

      lifecycleRules: [
        {
          /**
           * Versioning without cleanup grows forever. Old versions are kept
           * for 90 days — long enough to recover from a mistake, short enough
           * that storage stays effectively free for a site this size.
           */
          noncurrentVersionExpiration: cdk.Duration.days(90),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],

      /**
       * RETAIN means `cdk destroy` leaves the bucket behind rather than
       * deleting the client's files. Deliberate: this is production data for
       * someone else's organisation.
       */
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // -----------------------------------------------------------------------
    // 2. TLS CERTIFICATE
    // -----------------------------------------------------------------------

    /**
     * A free ACM certificate covering both the apex and www.
     *
     * `validation: fromDns(hostedZone)` means CDK writes the validation CNAME
     * into Route 53 automatically — you do not copy anything by hand. But it
     * only completes once GoDaddy delegates to this zone, which is exactly why
     * the DNS stack is deployed separately and first.
     *
     * If this step hangs for more than ~15 minutes, your nameserver change at
     * GoDaddy has not propagated yet. Check with: dig NS farmslanka.org
     */
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName,
      subjectAlternativeNames: [wwwDomainName],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // -----------------------------------------------------------------------
    // 3. EDGE BEHAVIOUR — www redirect + security headers
    // -----------------------------------------------------------------------

    /**
     * A CloudFront Function: tiny JavaScript that runs at the edge on every
     * request, before the cache is consulted. Far cheaper and faster than
     * Lambda@Edge, and free at this traffic level.
     *
     * This one sends www.farmslanka.org → farmslanka.org with a 301, so the
     * site has exactly one canonical address. Two addresses serving identical
     * content splits your SEO signals between them.
     */
    const redirectToApex = new cloudfront.Function(this, 'RedirectToApex', {
      comment: 'Permanent redirect from www to the apex domain',
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var host = request.headers.host.value;

  if (host.indexOf('www.') === 0) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: 'https://' + host.substring(4) + request.uri }
      }
    };
  }

  return request;
}
      `),
    });

    /**
     * Security headers applied to every response.
     *
     * Deliberately no Content-Security-Policy here. The site embeds YouTube
     * and Google Maps and ships inline scripts, so a CSP needs careful
     * allowlisting and testing — a wrong one silently breaks the video and the
     * map. Worth adding later as its own task rather than guessing now.
     */
    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      comment: 'Baseline security headers for farmslanka.org',
      securityHeadersBehavior: {
        /** Tell browsers to only ever use HTTPS for this domain. */
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        /** Stop browsers guessing content types (MIME sniffing). */
        contentTypeOptions: { override: true },
        /** Refuse to be loaded inside someone else's iframe. */
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        /** Do not leak full URLs to third parties in the Referer header. */
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
    });

    // -----------------------------------------------------------------------
    // 4. CLOUDFRONT DISTRIBUTION — the CDN
    // -----------------------------------------------------------------------

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `Static site for ${domainName}`,

      defaultBehavior: {
        /**
         * Origin Access Control is the modern replacement for Origin Access
         * Identity. CDK writes the bucket policy for us, granting read access
         * to this distribution and nothing else.
         */
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),

        /** Anyone arriving on http:// is bounced to https://. */
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,

        /** AWS-managed policy tuned for static assets; enables compression too. */
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,

        responseHeadersPolicy: securityHeaders,

        /** Gzip/Brotli on the way out. */
        compress: true,

        functionAssociations: [
          {
            function: redirectToApex,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },

      /** Both names are served; the edge function redirects www to apex. */
      domainNames: [domainName, wwwDomainName],
      certificate,

      /** Requests for "/" serve "/index.html". */
      defaultRootObject: 'index.html',

      /**
       * With a private bucket, a missing object comes back from S3 as 403, not
       * 404 — S3 will not confirm whether the key exists. Both are mapped to
       * the real 404 page so visitors see something sensible and search
       * engines get a correct status code.
       *
       * Requires src/pages/404.astro to exist so the build emits /404.html.
       */
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: '/404.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: '/404.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],

      /**
       * PRICE_CLASS_ALL uses every edge location worldwide, including South
       * Asia. The cheaper classes exclude exactly the regions closest to Sri
       * Lanka, and CloudFront's perpetual free tier (1 TB out, 10M requests a
       * month) covers this site many times over either way — so there is no
       * saving to be had by going cheaper, only slower.
       */
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,

      /** HTTP/3 where the browser supports it, HTTP/2 otherwise. */
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,

      /** Refuse outdated TLS versions. */
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,

      enableIpv6: true,
    });

    // -----------------------------------------------------------------------
    // 5. DNS RECORDS — point the domain at CloudFront
    // -----------------------------------------------------------------------

    /**
     * Alias records, not CNAMEs.
     *
     * DNS forbids a CNAME at the apex of a domain — this is the exact reason
     * GoDaddy cannot point farmslanka.org at CloudFront on its own, and why we
     * moved DNS to Route 53. An alias is a Route 53 extension that behaves
     * like a CNAME but is legal at the apex, resolves faster, and costs
     * nothing to query.
     *
     * A records answer IPv4, AAAA records answer IPv6. Both are needed.
     */
    const cloudFrontTarget = route53.RecordTarget.fromAlias(
      new targets.CloudFrontTarget(distribution)
    );

    new route53.ARecord(this, 'ApexAliasIpv4', {
      zone: hostedZone,
      target: cloudFrontTarget,
      comment: 'farmslanka.org → CloudFront',
    });

    new route53.AaaaRecord(this, 'ApexAliasIpv6', {
      zone: hostedZone,
      target: cloudFrontTarget,
    });

    new route53.ARecord(this, 'WwwAliasIpv4', {
      zone: hostedZone,
      recordName: 'www',
      target: cloudFrontTarget,
      comment: 'www.farmslanka.org → CloudFront (redirected to apex at the edge)',
    });

    new route53.AaaaRecord(this, 'WwwAliasIpv6', {
      zone: hostedZone,
      recordName: 'www',
      target: cloudFrontTarget,
    });

    // -----------------------------------------------------------------------
    // 6. GITHUB ACTIONS ACCESS — via OIDC, with no stored credentials
    // -----------------------------------------------------------------------

    /**
     * Register GitHub as an identity provider AWS will trust.
     *
     * This is what lets us avoid IAM access keys entirely. When a workflow
     * runs, GitHub mints a short-lived signed token describing that specific
     * run — which repo, which branch. AWS verifies the signature and issues
     * temporary credentials that expire in an hour.
     *
     * Nothing secret is ever stored in GitHub, so there is no key to leak,
     * rotate, or accidentally commit.
     *
     * ⚠️ An AWS account can only have ONE provider for a given URL. On a brand
     * new account this is correct. If you ever get "provider already exists",
     * import the existing one instead of creating it here.
     */
    const githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    /**
     * The role GitHub Actions assumes.
     *
     * The trust policy is the security boundary, and it is strict on purpose:
     *
     *   aud = sts.amazonaws.com   — the token was minted for AWS specifically
     *   sub = repo:OWNER/REPO:ref:refs/heads/BRANCH
     *                             — this exact repo, on this exact branch
     *
     * Scoping `sub` matters. Without it, any repository on GitHub could assume
     * this role. With it, even a pull request against your own repo cannot —
     * only a push to the named branch.
     */
    const deployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'farms-lanka-github-deploy',
      description: 'Assumed by GitHub Actions to deploy the Farms Lanka site',
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(
        githubOidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${githubRepo}:ref:refs/heads/${githubBranch}`,
          },
        }
      ),
    });

    /**
     * Least privilege: the role can read, write and delete objects in this one
     * bucket, and invalidate this one distribution. It cannot create
     * infrastructure, touch other buckets, or read billing.
     *
     * grantDelete is listed separately because grantReadWrite does not include
     * it, and `aws s3 sync --delete` needs it to remove files you deleted
     * locally.
     */
    siteBucket.grantReadWrite(deployRole);
    siteBucket.grantDelete(deployRole);

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
        resources: [
          `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
        ],
      })
    );

    // -----------------------------------------------------------------------
    // 7. OUTPUTS — the values you paste into GitHub
    // -----------------------------------------------------------------------

    new cdk.CfnOutput(this, 'SiteUrl', {
      value: `https://${domainName}`,
      description: 'The live site',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: siteBucket.bucketName,
      description: 'Set as the AWS_S3_BUCKET variable in GitHub',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'Set as the AWS_CLOUDFRONT_DISTRIBUTION_ID variable in GitHub',
    });

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: deployRole.roleArn,
      description: 'Set as the AWS_DEPLOY_ROLE_ARN variable in GitHub',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront URL — useful for testing before DNS is live',
    });
  }
}
