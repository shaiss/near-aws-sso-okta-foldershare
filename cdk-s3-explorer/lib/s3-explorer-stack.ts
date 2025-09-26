import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfront_origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import { Construct } from 'constructs';

export interface S3ExplorerStackProps extends cdk.StackProps {
  // No external IDP configuration needed for native Cognito
}

export class S3ExplorerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: S3ExplorerStackProps) {
    super(scope, id, props);

    // S3 bucket for storing uploaded files (with versioning and encryption)
    const dataBucket = new s3.Bucket(this, 'DataBucket', {
      bucketName: `s3-explorer-data-${this.account}-${this.region}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{
        noncurrentVersionExpiration: cdk.Duration.days(30)
      }],
      cors: [{
        allowedMethods: [
          s3.HttpMethods.GET,
          s3.HttpMethods.PUT,
          s3.HttpMethods.POST,
          s3.HttpMethods.DELETE,
          s3.HttpMethods.HEAD
        ],
        allowedOrigins: ['https://dzt2uly9d2ah2.cloudfront.net'], // Will be updated in deployment
        allowedHeaders: ['*'],
        exposedHeaders: ['ETag', 'x-amz-version-id'],
        maxAge: 3000
      }]
    });

    // S3 bucket for hosting the web application with public read access
    const webBucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `s3-explorer-web-${this.account}-${this.region}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Will be overridden for public read
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    // S3BucketOrigin automatically creates Origin Access Identity and grants permissions

    // CloudTrail for audit logging
    const trail = new cloudtrail.Trail(this, 'S3ExplorerTrail', {
      trailName: 's3-explorer-audit-trail',
      sendToCloudWatchLogs: true,
      includeGlobalServiceEvents: false,
      isMultiRegionTrail: false
    });

    // Add S3 data events for the data bucket
    trail.addS3EventSelector([{
      bucket: dataBucket,
      objectPrefix: '',
    }], {
      readWriteType: cloudtrail.ReadWriteType.ALL,
      includeManagementEvents: false
    });

    // CloudFront distribution for HTTPS support
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new cloudfront_origins.S3StaticWebsiteOrigin(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED
      },
      defaultRootObject: 'index.html',
      errorResponses: [{
        httpStatus: 404,
        responseHttpStatus: 200,
        responsePagePath: '/index.html'
      }]
    });

    // Cognito User Pool with proper hosted UI configuration
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 's3-explorer-users',
      selfSignUpEnabled: false,
      signInAliases: {
        email: true
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY, // Enable email-based recovery for hosted UI
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Configure user pool for native Cognito authentication with enhanced security

    // User Pool Client with proper hosted UI configuration
    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      generateSecret: false,
      preventUserExistenceErrors: true, // Security best practice: prevent user enumeration
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO
      ],
      // OAuth configuration for hosted UI - removed conflicting authFlows
      oAuth: {
        flows: {
          authorizationCodeGrant: true
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE
        ],
        callbackUrls: [
          `https://${distribution.distributionDomainName}/callback`
        ],
        logoutUrls: [
          `https://${distribution.distributionDomainName}/`
        ]
      }
    });

    // Cognito Domain
    const cognitoDomain = new cognito.UserPoolDomain(this, 'CognitoDomain', {
      userPool,
      cognitoDomain: {
        domainPrefix: `s3-explorer-${this.account}`
      }
    });

    // Identity Pool
    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: 's3-explorer-identity-pool',
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [{
        clientId: userPoolClient.userPoolClientId,
        providerName: userPool.userPoolProviderName
      }]
    });

    // IAM role for authenticated users
    const authenticatedRole = new iam.Role(this, 'AuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          'StringEquals': {
            'cognito-identity.amazonaws.com:aud': identityPool.ref
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated'
          }
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      description: 'Role for authenticated S3 Explorer users'
    });

    // Grant S3 permissions to authenticated role
    dataBucket.grantRead(authenticatedRole);
    dataBucket.grantPut(authenticatedRole);
    // Note: rename operations in S3 are copy+delete, so we need these permissions
    authenticatedRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:DeleteObject',
        's3:PutObjectAcl',
        's3:GetObjectAcl',
        's3:ListBucketVersions'
      ],
      resources: [
        dataBucket.bucketArn,
        `${dataBucket.bucketArn}/*`
      ]
    }));

    // Attach role to identity pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        'authenticated': authenticatedRole.roleArn
      }
    });

    // Deploy placeholder web app
    const setupHtmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>S3 Explorer - Setup Required</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 800px; margin: auto; }
        code { background: #f4f4f4; padding: 2px 5px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>S3 Explorer - Setup Required</h1>
        <p>The infrastructure has been deployed successfully. Now you need to:</p>
        <ol>
            <li>Create users in the Cognito User Pool (see next steps)</li>
            <li>Deploy the S3 Explorer application</li>
        </ol>
        <h2>Configuration:</h2>
        <pre>
{
  "region": "${this.region}",
  "userPoolId": "${userPool.userPoolId}",
  "userPoolClientId": "${userPoolClient.userPoolClientId}",
  "identityPoolId": "${identityPool.ref}",
  "dataBucketName": "${dataBucket.bucketName}",
  "cognitoDomain": "https://${cognitoDomain.domainName}.auth.${this.region}.amazoncognito.com"
}
        </pre>
        <h2>User Management:</h2>
        <p>Users can be managed directly in the Cognito User Pool:</p>
        <ul>
            <li>Go to AWS Console → Cognito → User pools → s3-explorer-users</li>
            <li>Create users with email addresses and set temporary passwords</li>
            <li>Users will receive an email to set their password on first login</li>
        </ul>
        <h2>Access URLs:</h2>
        <ul>
            <li><strong>Application (HTTPS):</strong> <code>https://${distribution.distributionDomainName}</code></li>
            <li><strong>Application (HTTP):</strong> <code>http://s3-explorer-web-${this.account}-${this.region}.s3-website-${this.region}.amazonaws.com</code></li>
            <li><strong>Cognito Login:</strong> <code>https://${cognitoDomain.domainName}.auth.${this.region}.amazoncognito.com/login</code></li>
        </ul>
    </div>
</body>
</html>`;

    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.data('index.html', setupHtmlContent)],
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ['/*']
    });

    // CloudFront URL output
    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL with HTTPS support'
    });

    // S3 Website URL output
    new cdk.CfnOutput(this, 'S3WebsiteURL', {
      value: `http://s3-explorer-web-${this.account}-${this.region}.s3-website-${this.region}.amazonaws.com`,
      description: 'S3 Website URL for direct access'
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID'
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID'
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: identityPool.ref,
      description: 'Cognito Identity Pool ID'
    });

    new cdk.CfnOutput(this, 'DataBucketName', {
      value: dataBucket.bucketName,
      description: 'S3 bucket for storing uploaded files'
    });

    new cdk.CfnOutput(this, 'HostedUIDomain', {
      value: `https://${cognitoDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito hosted UI domain'
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: `https://${cognitoDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito User Pool domain for authentication'
    });
  }
}
