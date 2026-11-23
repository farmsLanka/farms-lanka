# FARMS LANKA website

Static website for **FARMS LANKA**, a Christian humanitarian organization in Sri Lanka.
Live at **https://farmslanka.org**.

Built pro bono by Irosh Mathews. The site is a single static page, hosted on AWS
(S3 + CloudFront + Route 53), and deploys automatically when `main` is pushed.

---

## Contents

1. [How it fits together](#how-it-fits-together)
2. [Run it locally](#run-it-locally)
3. [Editing content](#editing-content)
4. [Deploying](#deploying)
5. [Infrastructure (AWS CDK)](#infrastructure-aws-cdk)
6. [Rolling back](#rolling-back)
7. [Troubleshooting](#troubleshooting)
8. [Running costs](#running-costs)

---

## How it fits together

```
 git push to main
        |
        v
 GitHub Actions  --(OIDC, no stored keys)-->  IAM role  farms-lanka-github-deploy
        |
        | npm run build  ->  dist/
        v
   S3 bucket (private)  <--  CloudFront (CDN, HTTPS, www -> apex redirect)
                                   ^
                          Route 53 (farmslanka.org)
                                   ^
              domain registered at GoDaddy, nameservers point to Route 53
```

| Layer | Choice |
| --- | --- |
| Framework | Astro 7 (static output) |
| Styling | Tailwind CSS v4 |
| Icons / fonts | astro-icon with Phosphor, @fontsource (Source Serif 4, Work Sans) |
| Images | `astro:assets` (automatic WebP and responsive sizes) |
| SEO | Sitemap, Open Graph and Twitter cards, NGO JSON-LD, robots.txt |
| Hosting | S3 (private) behind CloudFront with Origin Access Control |
| DNS and certificate | Route 53 and ACM (certificate must live in `us-east-1`) |
| Infrastructure as code | AWS CDK v2, TypeScript, in `infra/` |
| CI/CD | GitHub Actions with OIDC, in `.github/workflows/deploy.yml` |

There are no AWS access keys stored anywhere. GitHub proves its identity to AWS
with a short-lived token, and the IAM role only trusts this repository's `main` branch.

---

## Run it locally

Requires Node 22.

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # outputs to dist/
npm run preview    # serve the built site locally
```

---

## Editing content

Everything is under `src/`. Change it, commit, push to `main`, and the site updates
in about two minutes.

| What | Where |
| --- | --- |
| Hero text | `src/components/Hero.astro` |
| Who we are | `src/components/WhoWeAre.astro` |
| Programs and their photos | `src/components/Programs.astro` |
| Awards and certifications | `src/components/Certifications.astro` |
| Address, hours, phone, map coordinates | `src/components/Contact.astro` and `src/components/Footer.astro` |
| Video | `src/components/VideoMessage.astro` |
| Page title, description, JSON-LD, Search Console token | `src/layouts/Layout.astro` |
| Photos | `src/assets/photos/` |
| Logo (vector) | `src/assets/brand/logo.svg` |
| Colors | `src/styles/global.css` |

Notes:

- The address and map coordinates appear in more than one place (Contact, Footer and the
  JSON-LD in `Layout.astro`). Change all of them together.
- Photos should be JPEG or PNG. Astro converts and resizes them at build time, so
  full-size originals are fine, though keeping them under about 2 MB each keeps builds quick.

---

## Deploying

### Normal deploys (automatic)

Push or merge to `main`. The workflow in `.github/workflows/deploy.yml`:

1. Installs dependencies and runs `npm run build`.
2. Assumes the AWS role through OIDC.
3. Syncs `dist/` to S3 in two passes:
   - hashed files in `_astro/` with `Cache-Control: max-age=31536000, immutable`
   - everything else with `max-age=0, must-revalidate`, deleting files that no longer exist
4. Invalidates the CloudFront cache (`/*`).

Watch it under the repository's **Actions** tab. A green run means the change is live.
You can also start it by hand: **Actions, Deploy, Run workflow**.

### Required GitHub repository variables

Settings, Secrets and variables, Actions, **Variables** (not Secrets). All three come from
the `FarmsLankaSite` stack outputs.

| Variable | Value |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `DeployRoleArn` output |
| `AWS_S3_BUCKET` | `BucketName` output |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | `DistributionId` output |

To read the outputs again at any time:

```bash
aws cloudformation describe-stacks --stack-name FarmsLankaSite \
  --region us-east-1 --query "Stacks[0].Outputs"
```

---

## Infrastructure (AWS CDK)

Everything in AWS is defined in `infra/`. Region is **us-east-1** for both stacks.

| Stack | What it creates |
| --- | --- |
| `FarmsLankaDns` | The Route 53 hosted zone for `farmslanka.org` |
| `FarmsLankaSite` | Private S3 bucket, ACM certificate, CloudFront distribution, www-to-apex redirect function, security headers, DNS records, GitHub OIDC provider and deploy role |

The bucket and hosted zone have a **retain** policy, so deleting a stack never deletes the
data or the DNS zone.

### First-time setup in a new AWS account

```bash
cd infra
npm install
export AWS_PROFILE=<your-profile>      # confirm with: aws sts get-caller-identity
npx cdk bootstrap                      # once per account and region

npm run deploy:dns                     # prints four nameservers
```

Then, at the domain registrar, set the domain's nameservers to those four values.
Wait until `nslookup -type=NS farmslanka.org` returns the `awsdns` servers, then:

```bash
npm run deploy:site                    # 5 to 15 minutes; waits on certificate validation
```

Order matters. The certificate is validated through DNS, so the site stack stalls if the
nameserver change has not taken effect yet.

### Changing the infrastructure

```bash
cd infra
export AWS_PROFILE=<your-profile>
npx cdk diff        # preview
npm run deploy:site # apply
```

### Important: the GitHub repository identifier

The IAM role trusts a specific GitHub identity. GitHub's OIDC token now includes the
immutable numeric **owner ID and repository ID**, so the constant in `infra/bin/farms-lanka.ts`
must look like this and not like plain `owner/repo`:

```ts
const GITHUB_REPO = 'farmsLanka@360388904/farms-lanka@1456468154';
```

Do not "tidy" this into `farmsLanka/farms-lanka`. The deploy will fail with
`Not authorized to perform sts:AssumeRoleWithWebIdentity`.

If the repository is ever transferred to a different owner, the IDs change. To find the
new subject, add a temporary workflow step that prints the OIDC token's `sub` claim,
update the constant, and run `npm run deploy:site` again.

---

## Rolling back

Easiest: revert the bad commit and push.

```bash
git revert <commit>
git push
```

The pipeline redeploys the previous state. The S3 bucket is also versioned (old object
versions are kept for 90 days), so individual files can be restored from the S3 console
if ever needed.

---

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Actions fails at *Configure AWS credentials* with `Not authorized to perform sts:AssumeRoleWithWebIdentity` | The `GITHUB_REPO` constant does not match the token's subject. See the section above. |
| Actions fails because a variable is empty | One of the three repository variables is missing or misspelled. They are case-sensitive. |
| `deploy:site` sits on the certificate for a long time | The nameserver change has not propagated. Check `nslookup -type=NS farmslanka.org`. |
| Site shows the old version after a deploy | CloudFront invalidation is still running (about a minute), or the browser has it cached. Try a private window. |
| Domain shows an old page on one device only | Local DNS cache. Run `ipconfig /flushdns` (Windows) or try mobile data. |
| Random URLs show a raw XML error | `404.html` is missing from the build. Confirm `src/pages/404.astro` exists. |
| Video will not play on one device | Usually a browser shield or extension blocking the YouTube embed. Try another browser. |

---

## Running costs

A small static site on this architecture costs roughly **US$1 to 2 per month**, mostly the
Route 53 hosted zone. S3 and CloudFront usage at this traffic level is close to free.
Set an AWS Budgets alert so an unexpected spike is noticed early.

---

## Search Console

The site is verified in Google Search Console with an HTML meta tag. The token lives in
`googleSiteVerification` at the top of `src/layouts/Layout.astro`. Do not remove it, or
verification lapses. The sitemap is at `https://farmslanka.org/sitemap-index.xml`.
