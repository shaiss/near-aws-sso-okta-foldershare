# Secure S3 Explorer with Okta SSO

A secure web-based file explorer for AWS S3 that uses Okta SSO for authentication through AWS Cognito. This production-ready implementation follows AWS best practices for securing S3 access in single-page applications.

## 🚀 Quick Start

```bash
# 1. Clone and install
git clone <this-repo>
cd cdk-s3-explorer
npm install

# 2. Deploy infrastructure (have Okta Client ID ready)
npm run deploy -- -c oktaClientId=YOUR_OKTA_CLIENT_ID

# 3. Update Okta with CloudFront URLs from output
# 4. Deploy web app
./deploy-web-app.sh S3ExplorerStack

# 5. Access your secure S3 explorer!
```

## Architecture Overview

```
User → CloudFront → S3 (Static Site) → Cognito → Okta (OIDC) → S3 API Operations
```

### Key Components:
- **Authentication**: Okta SSO via Cognito User Pool (OIDC)
- **Authorization**: Cognito Identity Pool provides temporary AWS credentials
- **Storage**: Encrypted S3 bucket with versioning
- **Audit**: CloudTrail logging for all S3 operations
- **Frontend**: Single-page application with drag-and-drop upload

### Why Cognito + Okta Instead of Direct SAML?

This implementation uses Cognito as an intermediary rather than direct Okta SAML federation because:

1. **Browser Compatibility**: OIDC/OAuth2 flows work natively in browsers, while SAML requires server-side processing
2. **Better SDK Support**: AWS SDK for JavaScript has built-in Cognito support
3. **Automatic Token Management**: Cognito handles token refresh automatically
4. **SPA-Friendly**: Designed for single-page applications without backend servers
5. **Security**: Implements PKCE (Proof Key for Code Exchange) for enhanced security

For more details, see [AWS documentation on Cognito identity pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-identity.html).

## Prerequisites

1. **AWS Account** with appropriate permissions:
   - IAM, Cognito, S3, CloudFront, CloudTrail administration
   - Ability to create IAM roles and policies
2. **Okta Admin Access** to create OIDC applications
3. **AWS CLI** configured with profile (default: `shai-sandbox-profile`)
4. **Node.js** (v14 or later) and npm
5. **AWS CDK** v2 (`npm install -g aws-cdk`)

## Setup Instructions

### Step 1: Create Okta Application

1. Log in to Okta Admin Console (https://nearfoundation.okta.com)
2. Navigate to **Applications** → **Create App Integration**
3. Choose:
   - Sign-in method: `OIDC - OpenID Connect`
   - Application type: `Single-Page Application`
4. Configure:
   - **App integration name**: `S3 Explorer`
   - **Grant types**: ✓ Authorization Code
   - **Sign-in redirect URIs**: (will be updated after deployment)
     - `http://localhost:3000/callback` (for testing)
   - **Sign-out redirect URIs**: (will be updated after deployment)
     - `http://localhost:3000/` (for testing)
5. Under **Assignments**, select the appropriate employee groups
6. Save and note the **Client ID**

### Step 2: Deploy AWS Infrastructure

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy CDK stack (replace YOUR_OKTA_CLIENT_ID with actual value)
npm run deploy -- -c oktaClientId=YOUR_OKTA_CLIENT_ID

# Or using environment variable
export OKTA_CLIENT_ID=YOUR_OKTA_CLIENT_ID
npm run deploy
```

The deployment will output:
- CloudFront URL
- Cognito configuration details
- S3 bucket names
- **Important**: Note the callback URL for Okta configuration

### Step 3: Update Okta Application

Go back to your Okta application and add the CloudFront URLs:
- **Sign-in redirect URIs**: Add `https://[cloudfront-domain]/callback`
- **Sign-out redirect URIs**: Add `https://[cloudfront-domain]/`

### Step 4: Deploy Web Application

```bash
# Deploy the web app with updated configuration
./deploy-web-app.sh S3ExplorerStack

# Or with a different profile
./deploy-web-app.sh S3ExplorerStack my-profile
```

## Usage

1. Navigate to your CloudFront URL
2. Click "Sign in with Okta"
3. Authenticate with your Okta credentials
4. You can now:
   - **Upload files**: Drag and drop or click to browse (max 100MB)
   - **Download files**: Click the download button
   - **Rename files**: Click the rename button
   - **View audit logs**: Check CloudTrail for all operations

## Security Features

- **No Public Access**: S3 buckets are completely private with BlockPublicAccess enabled
- **Encryption**: All files are encrypted at rest (AES256)
- **Versioning**: File versioning enabled for recovery from accidental deletions
- **Audit Trail**: CloudTrail logs all S3 operations with user identity
- **Temporary Credentials**: Uses STS temporary credentials via Cognito (no long-lived keys)
- **MFA**: Inherits Okta's MFA policies
- **PKCE**: Implements Proof Key for Code Exchange for secure OAuth flows
- **CORS**: Properly configured CORS policies for S3 access
- **Session Security**: Tokens stored in sessionStorage (cleared on tab close)
- **Least Privilege**: IAM roles grant only necessary S3 permissions

## File Structure

```
cdk-s3-explorer/
├── bin/
│   └── s3-explorer.ts       # CDK app entry point
├── lib/
│   └── s3-explorer-stack.ts # Main CDK stack
├── web-app/
│   └── public/
│       ├── index.html       # Main HTML file
│       └── app.js           # Application logic
├── deploy-web-app.sh        # Web app deployment script
├── cdk.json                 # CDK configuration
├── tsconfig.json            # TypeScript configuration
└── package.json             # Node.js dependencies
```

## Troubleshooting

### Authentication Issues
- Ensure Okta client ID is correct
- Verify redirect URIs match exactly (including https://)
- Check browser console for errors

### S3 Access Issues
- Verify IAM role has correct permissions
- Check if Cognito Identity Pool is configured correctly
- Ensure AWS credentials are refreshed

### Deployment Issues
- Run `npm run build` before deploying
- Check AWS CLI profile is configured: `aws sts get-caller-identity --profile shai-sandbox-profile`
- Verify you have the required AWS permissions

## Monitoring

- **CloudTrail**: View audit logs in AWS Console
- **CloudWatch**: Monitor Cognito authentication metrics
- **S3 Metrics**: Track storage usage and request patterns

## Clean Up

To remove all resources:

```bash
npm run destroy
```

⚠️ **Warning**: This will delete all uploaded files. Download any important files first.

## Comparison to Other Approaches

### vs. Direct Okta SAML → AWS
- ❌ SAML requires server-side processing, not suitable for SPAs
- ❌ Complex token management in browsers
- ❌ Limited to 1-12 hour sessions without refresh
- ✅ Our approach: Browser-native OIDC with automatic token refresh

### vs. AWS Sample ([aws-cognito-okta-federation](https://github.com/aws-samples/aws-cognito-okta-federation))
- ❌ Sample requires Express backend server
- ❌ No S3 integration (API Gateway only)
- ❌ Missing modern security features (PKCE, WAF)
- ✅ Our approach: Serverless, direct S3 access, production-ready security

### vs. Lambda@Edge Authentication
- ❌ Higher latency and cost (runs on every request)
- ❌ Complex implementation
- ✅ Our approach: Authentication handled once, efficient S3 access

### vs. AWS Amplify
- ⚠️ Amplify is opinionated and harder to customize
- ⚠️ Abstracts away infrastructure details
- ✅ Our approach: Full control with CDK, easier to understand and modify

## Future Enhancements

- [ ] Add folder organization
- [ ] Implement file sharing with presigned URLs
- [ ] Add bulk operations
- [ ] Implement file preview for images/PDFs
- [ ] Add search functionality
- [ ] Implement user quotas
- [ ] Add AWS WAF for additional protection
- [ ] Implement rate limiting for uploads

## References

- [AWS Cognito Best Practices](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-security-best-practices.html)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)

## Support

For issues or questions:
1. Check CloudWatch logs for errors
2. Review Okta system logs for authentication issues
3. Use AWS Support for infrastructure problems
