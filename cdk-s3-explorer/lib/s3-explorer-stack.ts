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
  oktaDomain: string;
  oktaClientId: string;
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
      }]
    });

    // S3 bucket for hosting the web application
    const webBucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `s3-explorer-web-${this.account}-${this.region}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

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

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 's3-explorer-users',
      selfSignUpEnabled: false,
      signInAliases: {
        email: true
      },
      accountRecovery: cognito.AccountRecovery.NONE,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Configure Okta as OIDC provider
    const oktaProvider = new cognito.UserPoolIdentityProviderOidc(this, 'OktaProvider', {
      userPool,
      clientId: props.oktaClientId,
      clientSecret: '', // Okta doesn't require client secret for public clients
      issuerUrl: `https://${props.oktaDomain}`,
      name: 'Okta',
      scopes: ['openid', 'email', 'profile'],
      attributeMapping: {
        email: cognito.ProviderAttribute.other('email'),
        givenName: cognito.ProviderAttribute.other('given_name'),
        familyName: cognito.ProviderAttribute.other('family_name'),
        preferredUsername: cognito.ProviderAttribute.other('preferred_username')
      }
    });

    // User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      generateSecret: false,
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.custom(oktaProvider.providerName)
      ],
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
          'http://localhost:3000/callback',
          // CloudFront URL will be added after deployment
        ],
        logoutUrls: [
          'http://localhost:3000/',
          // CloudFront URL will be added after deployment
        ]
      }
    });

    // Ensure Okta provider is created before client
    userPoolClient.node.addDependency(oktaProvider);

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

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new cloudfront_origins.S3Origin(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN
      },
      defaultRootObject: 'index.html',
      errorResponses: [{
        httpStatus: 404,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: cdk.Duration.seconds(0)
      }]
    });

    // Grant CloudFront access to web bucket
    webBucket.grantRead(new iam.ServicePrincipal('cloudfront.amazonaws.com', {
      conditions: {
        StringEquals: {
          'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`
        }
      }
    }));

    // Deploy placeholder web app
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.data('index.html', `
<!DOCTYPE html>
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
            <li>Update the Okta application with the callback URL: <code>https://${distribution.distributionDomainName}/callback</code></li>
            <li>Deploy the S3 Explorer application (see next steps)</li>
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
    </div>
</body>
</html>
      `)],
      destinationBucket: webBucket,
      distribution,
      distributionPaths: ['/*']
    });

    // Outputs
    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL'
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

    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: `https://${cognitoDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito hosted UI domain'
    });

    new cdk.CfnOutput(this, 'OktaCallbackUrl', {
      value: `https://${distribution.distributionDomainName}/callback`,
      description: 'Add this to your Okta app redirect URIs'
    });
  }
}
