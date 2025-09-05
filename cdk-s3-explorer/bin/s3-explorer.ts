#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { S3ExplorerStack } from '../lib/s3-explorer-stack';

const app = new cdk.App();

// Get configuration from context or environment
const oktaDomain = app.node.tryGetContext('oktaDomain') || process.env.OKTA_DOMAIN || 'nearfoundation.okta.com';
const oktaClientId = app.node.tryGetContext('oktaClientId') || process.env.OKTA_CLIENT_ID;

if (!oktaClientId) {
  throw new Error('Okta Client ID is required. Set via context (-c oktaClientId=xxx) or OKTA_CLIENT_ID env var');
}

new S3ExplorerStack(app, 'S3ExplorerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
  },
  oktaDomain,
  oktaClientId,
  description: 'Secure S3 Explorer with Okta SSO authentication'
});

app.synth();
