#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FlappyKiroPipelineStack } from '../lib/flappy-kiro-pipeline-stack';

const app = new cdk.App();

new FlappyKiroPipelineStack(app, 'FlappyKiroPipelineStack', {
  // Account/region are taken from the ambient CLI credentials/profile.
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description:
    'CodeCommit repository connected to an Amplify app with automatic build and deploy on push to main.',
  // Use the legacy synthesizer so deployment does NOT depend on the CDK
  // bootstrap asset bucket or its publishing roles. This stack has no file
  // assets, and its template is small (<51 KB), so CloudFormation receives
  // the template inline via the CLI's own credentials. This is required in
  // this environment where the bootstrap bucket is KMS-locked and the
  // participant role cannot assume the bootstrap deploy/publish roles or
  // write to the asset bucket.
  synthesizer: new cdk.LegacyStackSynthesizer(),
});
