import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as amplify from '@aws-cdk/aws-amplify-alpha';

/**
 * Provisions the "repo -> Amplify -> URL" pipeline for Flappy Kiro:
 *
 *   1. A CodeCommit repository (the source code repository), created empty.
 *   2. An Amplify app connected to that repository as its source provider.
 *   3. A `main` branch with auto build + deploy enabled, plus a static-site
 *      build spec (Flappy Kiro has no build step; artifacts are the repo root).
 *   4. A CfnOutput with the Amplify-hosted URL for the branch.
 *
 * The local application code is pushed to the repo with `git` after deploy
 * (see the README / deploy.sh), which triggers the first Amplify build. The
 * stack is deliberately asset-free so it deploys purely from the template —
 * important in restricted environments where the CDK bootstrap asset bucket
 * is KMS-locked and the deploy role can't publish assets to it.
 *
 * The CodeCommit source provider needs no secret: Amplify's service role is
 * granted `codecommit:GitPull` automatically.
 */
export class FlappyKiroPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The branch Amplify builds from.
    const branchName = 'main';

    // ------------------------------------------------------------------
    // Amplify service role.
    //
    // The Amplify `App` construct creates an IAM service role for the app
    // unless one is supplied. In restricted environments (e.g. a workshop /
    // event-engine `WSParticipantRole`) the deploy identity is NOT allowed to
    // perform `iam:CreateRole`, so letting CDK create the role fails with:
    //
    //   User: .../WSParticipantRole/Participant is not authorized to perform:
    //   iam:CreateRole on resource: .../FlappyKiroPipelineStack-AmplifyAppRole...
    //
    // To stay deployable there, we DO NOT create a role. Instead we import an
    // existing role by name or ARN, supplied via context, and pass it to the
    // Amplify app. Importing a role issues no `iam:CreateRole` call.
    //
    //   -c amplifyServiceRoleArn=arn:aws:iam::<acct>:role/<name>   (preferred)
    //   -c amplifyServiceRoleName=<name>                            (by name)
    //
    // If neither is provided we fall back to letting the construct create its
    // own role (works in accounts where you CAN create roles).
    // ------------------------------------------------------------------
    const roleArnCtx = this.node.tryGetContext('amplifyServiceRoleArn') as
      | string
      | undefined;
    const roleNameCtx = this.node.tryGetContext('amplifyServiceRoleName') as
      | string
      | undefined;

    let amplifyRole: iam.IRole | undefined;
    if (roleArnCtx) {
      amplifyRole = iam.Role.fromRoleArn(this, 'AmplifyAppRole', roleArnCtx, {
        // The role already exists and is managed outside this stack; never try
        // to mutate (and therefore never need to create) it.
        mutable: false,
      });
    } else if (roleNameCtx) {
      amplifyRole = iam.Role.fromRoleName(this, 'AmplifyAppRole', roleNameCtx, {
        mutable: false,
      });
    }

    // ------------------------------------------------------------------
    // 1. Source repository (created empty).
    //
    // NOTE: we intentionally do NOT use `Code.fromDirectory` to seed the
    // initial commit. That path makes CDK publish a zipped asset to the
    // bootstrap S3 bucket, which in this (KMS-locked, restricted-role)
    // environment the deploy role cannot write to. Instead the repo is
    // created empty and the local code is pushed to it with `git` right
    // after deploy — see the deploy script / README. This keeps the stack
    // asset-free so it deploys purely from the CloudFormation template.
    // ------------------------------------------------------------------
    const repository = new codecommit.Repository(this, 'AppRepository', {
      repositoryName: 'flappy-kiro',
      description: 'Source code repository for the Flappy Kiro game.',
    });

    // ------------------------------------------------------------------
    // 2. Amplify app connected to the repository.
    //
    // The CodeCommit source provider automatically grants the Amplify app's
    // service role permission to pull the repository.
    // ------------------------------------------------------------------
    const amplifyApp = new amplify.App(this, 'AmplifyApp', {
      appName: 'flappy-kiro',
      // Use the imported role when supplied so CDK does not attempt
      // `iam:CreateRole`. When undefined, the construct creates its own role
      // (requires `iam:CreateRole` permission on the deploy identity).
      role: amplifyRole,
      sourceCodeProvider: new amplify.CodeCommitSourceCodeProvider({
        repository,
      }),
      // Static site: no build step. Amplify just publishes the repo contents.
      // `baseDirectory: /` serves the files exactly as they sit in the repo
      // (index.html at the root, with src/ and assets/ alongside it).
      buildSpec: cdk.aws_codebuild.BuildSpec.fromObjectToYaml({
        version: 1,
        frontend: {
          phases: {
            preBuild: {
              commands: ['echo "No install step: Flappy Kiro ships as static files."'],
            },
            build: {
              commands: ['echo "No build step: publishing static files as-is."'],
            },
          },
          artifacts: {
            // Serve the repository root directly.
            baseDirectory: '/',
            files: ['**/*'],
          },
          cache: {
            paths: [],
          },
        },
      }),
    });

    // ------------------------------------------------------------------
    // 3. Branch with automatic builds + deployments.
    //
    // `autoBuild` is on by default: every push to `main` triggers a build
    // and deploy. We make it explicit for clarity.
    // ------------------------------------------------------------------
    const mainBranch = amplifyApp.addBranch(branchName, {
      autoBuild: true,
      stage: 'PRODUCTION',
    });

    // ------------------------------------------------------------------
    // 4. Outputs: the hosted URL plus handy repo/app references.
    // ------------------------------------------------------------------
    new cdk.CfnOutput(this, 'AmplifyHostedUrl', {
      description: 'The Amplify-hosted URL for the Flappy Kiro app.',
      value: `https://${mainBranch.branchName}.${amplifyApp.defaultDomain}`,
    });

    new cdk.CfnOutput(this, 'AmplifyAppId', {
      description: 'The Amplify application ID.',
      value: amplifyApp.appId,
    });

    new cdk.CfnOutput(this, 'RepositoryCloneUrlHttp', {
      description: 'HTTPS clone URL for the CodeCommit repository.',
      value: repository.repositoryCloneUrlHttp,
    });

    new cdk.CfnOutput(this, 'RepositoryCloneUrlGrc', {
      description:
        'git-remote-codecommit (GRC) clone URL. Use with git-remote-codecommit to push updates.',
      value: repository.repositoryCloneUrlGrc,
    });
  }
}
