# Cognito Deployment Guide

This guide provides detailed instructions for deploying and managing the S3 Explorer with native AWS Cognito authentication.

## Quick Start

### 1. Deploy Infrastructure
```bash
cdk deploy S3ExplorerStack
```

### 2. Create Users in Cognito
1. Open AWS Console → Cognito → User pools
2. Select `s3-explorer-users` user pool
3. Click "Users" → "Create user"
4. Enter email address and temporary password
5. User will receive email to set password

### 3. Deploy Web Application
```bash
./deploy-web-app.sh S3ExplorerStack
```

## Detailed User Management

### Creating Users via AWS Console
1. **Navigate to User Pool**:
   - AWS Console → Cognito → User pools
   - Select `s3-explorer-users`

2. **Create User**:
   - Click "Users" tab
   - Click "Create user" button
   - Fill in user details:
     - **Username**: Email address (required)
     - **Email address**: Same as username
     - **Phone number**: Optional
   - Set temporary password (user will change on first login)
   - Click "Create user"

3. **User Setup Flow**:
   - User receives email with temporary password
   - On first login, user must change password
   - After password change, user can access S3 Explorer

### Creating Users via AWS CLI
```bash
# Create user with temporary password
aws cognito-idp admin-create-user \
    --user-pool-id YOUR_USER_POOL_ID \
    --username user@example.com \
    --temporary-password TempPassword123! \
    --message-action SUPPRESS  # Don't send email

# Set permanent password (user will be forced to change)
aws cognito-idp admin-set-user-password \
    --user-pool-id YOUR_USER_POOL_ID \
    --username user@example.com \
    --password PermanentPassword123! \
    --permanent false
```

### Bulk User Import
For bulk user creation, you can:
1. Prepare a CSV file with user data
2. Use AWS Console: User pools → s3-explorer-users → Users → Import users
3. Or use the AWS CLI import functionality

## Security Configuration

### User Pool Security Settings
The deployment includes these security best practices:

- **Self-service sign-up**: Disabled (admin-only user creation)
- **User enumeration protection**: Enabled
- **Password policy**: Minimum 8 characters with complexity requirements
- **Account recovery**: Email-based (no phone fallback)
- **MFA**: Available but not required by default

### Authentication Flows
The application supports multiple secure authentication flows:
- **SRP (Secure Remote Password)**: Recommended for browser applications
- **Password-based**: Traditional username/password
- **Custom authentication**: For advanced use cases

### Callback URL Configuration
After deployment, ensure these URLs are configured in the User Pool Client:
- **Sign-in redirect**: `https://your-domain.com/callback`
- **Sign-out redirect**: `https://your-domain.com/`

## Monitoring and Troubleshooting

### Monitoring User Activity
1. **CloudWatch Logs**: Check for authentication events
2. **CloudTrail**: Audit user activities
3. **Cognito Console**: View user sign-in history

### Common Issues and Solutions

**Issue**: Users not receiving password reset emails
**Solution**: Check SES configuration and verify email addresses

**Issue**: Authentication failing with "Invalid credentials"
**Solution**: Ensure users have changed their temporary password

**Issue**: S3 access denied after login
**Solution**: Verify identity pool role permissions

### User Lifecycle Management
- **Disable User**: Temporarily block access
- **Reset Password**: Force password change
- **Delete User**: Permanently remove user account
- **View User Events**: Check authentication history

## Advanced Configuration

### Custom User Attributes
You can add custom attributes to the user pool for additional user data:

```typescript
// In the CDK stack, add to user pool configuration
userPool.addStringAttribute('department');
userPool.addStringAttribute('jobTitle');
```

### Group-based Access Control
Create user groups for different permission levels:

```typescript
// Create user groups
const adminGroup = new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
  userPoolId: userPool.userPoolId,
  groupName: 'AdminGroup',
  description: 'Administrators with full access'
});
```

### Lambda Triggers
Add custom logic for user events:
- **Pre-sign-up**: Validate user data before creation
- **Post-confirmation**: Send welcome emails or setup resources
- **Pre-authentication**: Add custom authentication logic

## Best Practices

### Security
1. **Regular password rotation** for admin users
2. **Monitor failed login attempts** via CloudWatch
3. **Use HTTPS** for all authentication endpoints
4. **Enable MFA** for sensitive applications
5. **Audit user activities** regularly

### User Management
1. **Document user creation process** for team members
2. **Regularly review user accounts** for inactive users
3. **Implement user onboarding/offboarding** procedures
4. **Train users** on password security best practices

### Performance
1. **Monitor user pool performance** via CloudWatch
2. **Set up alerts** for authentication failures
3. **Use appropriate instance sizes** for high-traffic applications

## Support and Resources

- [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/)
- [AWS Security Best Practices](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-security-best-practices.html)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [Cognito Developer Guide](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools.html)
