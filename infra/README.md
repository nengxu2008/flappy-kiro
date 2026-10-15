# Flappy Kiro — CDK deployment stack (CodeCommit source)

This CDK app (`FlappyKiroPipelineStack`) provisions an all-AWS
"repo → Amplify → URL" pipeline and ships a helper that pushes your local
code into it. It covers the full request:

1. **A source code repository** — an AWS **CodeCommit** repository named
   `flappy-kiro`, created by the stack (empty).
2. **Your local application code pushed to the repository** — `deploy.sh`
   pushes the project root to the repo's `main` branch after deploy, using
   `git-remote-codecommit` (your AWS credentials, no SSH keys or tokens).
3. **An Amplify app connected to the repository** — via the CodeCommit source
   provider. Amplify's service role is automatically granted `codecommit:GitPull`;
   there is no token/secret to manage.
4. **Automatic builds and deployments** — the `main` branch has `autoBuild`
   on, so every push triggers a build and deploy. The build spec is tuned for
   a static site (no build step; the repo contents are published as-is).
5. **The Amplify hosted URL** — emitted as the `AmplifyHostedUrl` output
   (`https://main.<appId>.amplifyapp.com`) and printed by `deploy.sh`.

> **Note on CodeCommit availability.** AWS closed CodeCommit to new customers
> in July 2024, then **returned it to full general availability in November
> 2025** — new customers can create repositories again. This stack therefore
> works for new and existing accounts.

## Prerequisites

- Node.js 18+ (the CDK CLI is invoked via `npx`, no global install needed).
- AWS credentials in your environment with permission to create Amplify and
  CodeCommit resources, and to push to CodeCommit.
- **`git-remote-codecommit`** so `git` can push over the `codecommit://`
  protocol with your AWS credentials:
  ```bash
  pip install git-remote-codecommit
  ```
  Docs: <https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-git-remote-codecommit.html>
- A CDK-bootstrapped account/region (only needed the first time):
  ```bash
  npx cdk bootstrap aws://<account-id>/<region>
  ```
  The stack uses the legacy synthesizer and has no file assets, so it deploys
  purely from the CloudFormation template even in restricted environments
  where the bootstrap asset bucket is locked down.

## Restricted accounts: supply an existing Amplify role

By default the Amplify app creates its own IAM service role, which needs
`iam:CreateRole`. In locked-down environments (e.g. a workshop / event-engine
`WSParticipantRole`) that action is denied and the deploy fails with:

```
User: .../WSParticipantRole/Participant is not authorized to perform: iam:CreateRole
```

To stay deployable there, reuse a role that already exists in the account
instead of creating one. Find a suitable role (one Amplify can assume, with
CodeCommit read access), then pass it in. The stack imports it and issues no
`iam:CreateRole` call:

```bash
# List roles already present in the account:
aws iam list-roles --query 'Roles[].RoleName' --output text | tr '\t' '\n'

# Then export its ARN (deploy.sh and cdk both read this):
export AMPLIFY_SERVICE_ROLE_ARN=arn:aws:iam::<account-id>:role/<existing-role>
```

Workshop accounts commonly pre-provision a role such as
`amplifyconsole-backend-role`; if present, use its ARN. The role's trust policy
must allow `amplify.amazonaws.com` to assume it, and it needs
`codecommit:GitPull` on the repository.

> You can also pass it directly to CDK with
> `-c amplifyServiceRoleArn=<arn>` (or `-c amplifyServiceRoleName=<name>`).

## Deploy (one command)

From the `infra/` directory:

```bash
cd infra
npm install
# In a restricted account, set the role first (see above):
export AMPLIFY_SERVICE_ROLE_ARN=arn:aws:iam::<account-id>:role/<existing-role>
./deploy.sh
```

`deploy.sh` will:

1. Build and `cdk deploy` the stack (writing outputs to `cdk-outputs.json`).
2. Read the repository's git-remote-codecommit (GRC) clone URL from the outputs.
3. Add a scratch `codecommit` git remote on the **project root** (your existing
   `origin` is left untouched) and push your code to the repo's `main` branch,
   triggering the first Amplify build.
4. Print the Amplify hosted URL.

The site is live once the first build for `main` finishes — watch it in the
Amplify console.

### Manual deploy (if you prefer)

```bash
cd infra
npm install
npm run build
npx cdk deploy --outputs-file cdk-outputs.json

# Push the app code (from the project root) to the created repo:
GRC_URL=$(node -e "console.log(require('./cdk-outputs.json').FlappyKiroPipelineStack.RepositoryCloneUrlGrc)")
git -C .. remote add codecommit "$GRC_URL"
git -C .. push codecommit HEAD:refs/heads/main
```

## Updating the app afterward

Push to the `codecommit` remote's `main` branch again — Amplify rebuilds and
redeploys automatically:

```bash
git push codecommit HEAD:refs/heads/main
```

## Stack outputs

| Output                   | Meaning                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `AmplifyHostedUrl`       | The public URL of the deployed app.                          |
| `AmplifyAppId`           | The Amplify application ID.                                  |
| `RepositoryCloneUrlHttp` | HTTPS clone URL for the CodeCommit repository.               |
| `RepositoryCloneUrlGrc`  | git-remote-codecommit clone URL (used by `deploy.sh`).       |

## Tear down

```bash
npx cdk destroy
```

Removes the Amplify app, branch, and the CodeCommit repository (and its
contents). Your local git repo and its `origin` remote are untouched.
