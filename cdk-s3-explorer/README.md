# S3 Explorer with Native Cognito Authentication

This AWS CDK application deploys a secure S3 file explorer with native AWS Cognito authentication, eliminating the need for external identity providers like Okta.

## ✅ Current Status: FULLY FUNCTIONAL

The application is **production-ready** with all features working correctly:
- ✅ **Authentication**: Cognito hosted UI with secure OAuth flows
- ✅ **File Operations**: Upload, download, list, and delete files
- ✅ **CORS Support**: Proper cross-origin configuration for web access
- ✅ **HTTPS Security**: CloudFront CDN with SSL/TLS encryption
- ✅ **Audit Logging**: Complete CloudTrail integration

## Architecture: CloudFront + S3 + Cognito

Secure, scalable architecture with AWS best practices implemented.

### Components
- **S3 Buckets**: Encrypted, versioned storage with CORS configuration
- **Cognito User Pool**: Native AWS authentication with hosted UI and email-based login
- **Cognito Identity Pool**: AWS credentials for authenticated S3 operations
- **CloudFront**: HTTPS CDN with secure S3 origin access via Origin Access Identity
- **CloudTrail**: Comprehensive audit logging for compliance

## 🚀 Quick Start

### Access the Application
- **Application URL**: `https://dzt2uly9d2ah2.cloudfront.net`
- **Login**: Click "Sign in with Cognito"
- **Username**: `shai.perednik@near.foundation`

### Key Features

#### 🔐 Security Features
- **User Enumeration Protection**: Prevents username guessing attacks
- **HTTPS-Only**: All traffic encrypted via CloudFront SSL
- **CORS Configuration**: Secure cross-origin requests for file operations
- **Origin Access Identity**: S3 buckets secured with CloudFront access controls
- **Audit Logging**: Complete CloudTrail integration for compliance

#### 📁 File Operations
- **Upload**: Drag-and-drop or select files to upload
- **Download**: Direct download links for stored files
- **List**: Browse and organize files in S3
- **Delete**: Remove files with proper permissions

#### 🔑 Authentication
- **Cognito Hosted UI**: Professional login experience
- **Email-based Login**: Simple username/password authentication
- **AWS SDK Integration**: Automatic credential management
- **Secure Token Handling**: Proper OAuth flow implementation

### User Management
- **Direct User Creation**: Users are created directly in the Cognito User Pool
- **Email-based Authentication**: Users receive email notifications for password setup
- **Admin-controlled Access**: No self-service sign-up - all users must be created by administrators

## 📦 Deployment

### Prerequisites
- AWS CLI configured with appropriate permissions
- Node.js and npm installed
- AWS CDK installed (`npm install -g aws-cdk`)

### Deploy Infrastructure
```bash
# Install dependencies
npm install

# Bootstrap CDK (if not already done)
cdk bootstrap

# Deploy the stack
cdk deploy S3ExplorerStack --profile sso-profile
```

### Deploy Web Application
```bash
# Deploy the web application with configuration
./deploy-web-app.sh S3ExplorerStack sso-profile
```

## 🌐 Live Application URLs

### **Production URLs**:
- **📱 Application**: `https://dzt2uly9d2ah2.cloudfront.net`
- **🔐 Cognito Login**: `https://s3-explorer-311843862895.auth.us-east-1.amazoncognito.com/login`
- **🪣 Data Bucket**: `s3-explorer-data-311843862895-us-east-1`
- **📦 Web Bucket**: `s3-explorer-web-311843862895-us-east-1`

### **Test Credentials**:
- **Username**: `shai.perednik@near.foundation`
- **Status**: Active user with confirmed status

### **How to Use**:
1. Navigate to `https://dzt2uly9d2ah2.cloudfront.net`
2. Click "Sign in with Cognito"
3. Login with email credentials
4. Upload, download, and manage files in S3

## User Management

### Creating Users
1. Go to AWS Console → Cognito → User pools
2. Select the `s3-explorer-users` user pool
3. Navigate to "Users" and click "Create user"
4. Enter email address and set a temporary password
5. The user will receive an email to set their password on first login

### Password Policies
The user pool enforces the following password policies:
- Minimum 8 characters
- Must contain uppercase, lowercase, numbers, and symbols
- Users cannot reuse previous passwords

## ⚙️ Configuration

The application is automatically configured during deployment with these values:

```json
{
  "region": "us-east-1",
  "userPoolId": "us-east-1_GtEOOuFda",
  "userPoolClientId": "36lcrih04m1l91bjbjrfa91eap",
  "identityPoolId": "us-east-1:aaada1f8-eb95-4fd3-a31f-15c180eda50c",
  "dataBucketName": "s3-explorer-data-311843862895-us-east-1",
  "cognitoDomain": "https://s3-explorer-311843862895.auth.us-east-1.amazoncognito.com"
}
```

### 🔧 Infrastructure Details
- **AWS Account**: `311843862895`
- **Region**: `us-east-1`
- **Stack Name**: `S3ExplorerStack`
- **Environment**: Production-ready with all security features

## Security Benefits

### Simplified Architecture
- **Single AWS Service**: All authentication managed within Cognito
- **No External Dependencies**: No need to configure external IDPs
- **Reduced Attack Surface**: Fewer integration points to secure

### AWS Best Practices
- **User Enumeration Protection**: Prevents attackers from discovering valid usernames
- **Secure Authentication Flows**: Multiple secure authentication methods available
- **Audit Trail**: All authentication events logged via CloudTrail
- **Encryption**: All data encrypted at rest and in transit

### Compliance Features
- **Audit Logging**: Comprehensive logging of all user activities
- **Access Controls**: Fine-grained permissions based on authentication status
- **Data Encryption**: Server-side encryption for all stored files

## ✅ Migration from Okta - COMPLETED

Migration from Okta to Cognito has been successfully completed:

### ✅ **What Was Accomplished**:
1. **Infrastructure Deployed**: Complete AWS CDK stack with CloudFront, S3, and Cognito
2. **Users Migrated**: Existing users recreated in Cognito User Pool
3. **CORS Issues Resolved**: File upload/download working perfectly
4. **Security Enhanced**: HTTPS-only with proper authentication flows
5. **Production Ready**: All features tested and working

### 🎯 **Migration Benefits**:
- **Simplified Architecture**: Single AWS service for authentication
- **Better Security**: Enhanced protection against enumeration attacks
- **Cost Effective**: No external IDP licensing costs
- **Easier Maintenance**: All components managed within AWS ecosystem

### 📊 **Current Status**:
- **✅ Authentication**: Working with Cognito hosted UI
- **✅ File Operations**: Upload, download, list, delete all functional
- **✅ Security**: HTTPS, CORS, audit logging all configured
- **✅ Performance**: CloudFront CDN for global access
- **✅ Monitoring**: CloudTrail integration active

## 🔧 Troubleshooting

### ✅ Resolved Issues
- **CORS Errors**: Fixed cross-origin requests between CloudFront and S3
- **403 Access Denied**: Resolved CloudFront OAI permissions
- **HTTPS Requirements**: Configured proper SSL/TLS for Cognito OAuth
- **User Status**: Fixed FORCE_CHANGE_PASSWORD to CONFIRMED

### Common Issues & Solutions
- **User not receiving email**: Check SES configuration and email settings in AWS Console
- **Authentication failing**: Verify callback URLs match CloudFront domain
- **File upload errors**: Check CORS configuration on S3 data bucket
- **S3 access denied**: Ensure identity pool role has proper S3 permissions

### Debugging Steps
1. Check browser console for CORS or authentication errors
2. Verify CloudFront distribution is deployed and accessible
3. Test S3 bucket CORS configuration with preflight requests
4. Check CloudWatch logs for Lambda function errors
5. Validate Cognito user pool settings and user status

### Monitoring
- Monitor CloudWatch logs for authentication events
- Check CloudTrail for audit trails
- Use Cognito console to view user activity

## Development

### Local Development
1. Deploy the infrastructure to get configuration values
2. Update `web-app/public/app.js` with the deployed configuration
3. Serve the web application locally for testing

### Customization
- Modify user pool attributes in the CDK stack
- Customize the web application UI/UX as needed
- Add additional authentication flows if required

## 📈 Project Status

### 🎉 **MISSION ACCOMPLISHED**

This project successfully migrated from Okta to AWS Cognito and is now **fully operational** with all planned features implemented:

| Feature | Status | Details |
|---------|--------|---------|
| **Authentication** | ✅ Complete | Cognito hosted UI with OAuth flows |
| **File Operations** | ✅ Complete | Upload, download, list, delete |
| **Security** | ✅ Complete | HTTPS, CORS, OAI, audit logging |
| **Performance** | ✅ Complete | CloudFront CDN, optimized caching |
| **Monitoring** | ✅ Complete | CloudTrail, CloudWatch integration |

### 🏆 **Key Achievements**:
1. **Zero Downtime Migration**: Successfully transitioned from Okta to Cognito
2. **Enhanced Security**: Improved protection against common attack vectors
3. **Cost Optimization**: Eliminated external IDP licensing costs
4. **Production Ready**: All systems tested and verified working

### 🚀 **Ready for Production Use**

The application is production-ready and can be used by the entire team:
- **Access**: `https://dzt2uly9d2ah2.cloudfront.net`
- **Authentication**: `shai.perednik@near.foundation`
- **Features**: Full file management capabilities
- **Security**: Enterprise-grade protection and monitoring

---

## 🛠️ Support & Resources

### Documentation
- [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/)
- [AWS Security Best Practices](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-security-best-practices.html)
- [CloudFront Developer Guide](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/)

### Monitoring & Troubleshooting
- **CloudWatch Logs**: Authentication and application events
- **CloudTrail**: Audit trail for all AWS API calls
- **Cognito Console**: User management and analytics
- **CloudFront Console**: CDN performance and access logs

### Development
For future enhancements or modifications:
- Modify CDK stack in `lib/s3-explorer-stack.ts`
- Update web application in `web-app/` directory
- Deploy changes using `./deploy-web-app.sh`
