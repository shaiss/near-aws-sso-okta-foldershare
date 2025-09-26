#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { S3ExplorerStack } from '../lib/s3-explorer-stack';

const app = new cdk.App();

// No external IDP configuration needed for native Cognito authentication
new S3ExplorerStack(app, 'S3ExplorerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  },
  description: 'Secure S3 Explorer with native Cognito authentication'
});

app.synth();
