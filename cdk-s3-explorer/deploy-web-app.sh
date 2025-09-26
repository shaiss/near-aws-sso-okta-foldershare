#!/bin/bash

# Deploy S3 Explorer Web Application
# This script updates the app configuration and deploys it to S3

set -e

echo "🚀 Deploying S3 Explorer Web Application"

# Check if required environment variables or parameters are set
if [ -z "$1" ]; then
    echo "❌ Error: Stack name required"
    echo "Usage: ./deploy-web-app.sh <stack-name> [profile]"
    exit 1
fi

STACK_NAME=$1
PROFILE=${2:-shai-sandbox-profile}

echo "📋 Getting stack outputs..."

# Get CloudFormation outputs
USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --profile $PROFILE \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
    --output text)

USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --profile $PROFILE \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
    --output text)

IDENTITY_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --profile $PROFILE \
    --query 'Stacks[0].Outputs[?OutputKey==`IdentityPoolId`].OutputValue' \
    --output text)

DATA_BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --profile $PROFILE \
    --query 'Stacks[0].Outputs[?OutputKey==`DataBucketName`].OutputValue' \
    --output text)

COGNITO_DOMAIN=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --profile $PROFILE \
    --query 'Stacks[0].Outputs[?OutputKey==`HostedUIDomain`].OutputValue' \
    --output text)

WEB_BUCKET_NAME=$(aws s3api list-buckets \
    --profile $PROFILE \
    --query "Buckets[?starts_with(Name, 's3-explorer-web-')].Name" \
    --output text)

CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --profile $PROFILE \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
    --output text)

echo "✅ Retrieved stack outputs"

# Create temporary directory for deployment
TEMP_DIR=$(mktemp -d)
cp -r web-app/public/* $TEMP_DIR/

# Update app.js with actual configuration
echo "🔧 Updating configuration..."
sed -i.bak "s|YOUR_USER_POOL_ID|$USER_POOL_ID|g" $TEMP_DIR/app.js
sed -i.bak "s|YOUR_USER_POOL_CLIENT_ID|$USER_POOL_CLIENT_ID|g" $TEMP_DIR/app.js
sed -i.bak "s|YOUR_IDENTITY_POOL_ID|$IDENTITY_POOL_ID|g" $TEMP_DIR/app.js
sed -i.bak "s|YOUR_DATA_BUCKET_NAME|$DATA_BUCKET_NAME|g" $TEMP_DIR/app.js
sed -i.bak "s|YOUR_COGNITO_DOMAIN|$COGNITO_DOMAIN|g" $TEMP_DIR/app.js
rm $TEMP_DIR/app.js.bak

# Deploy to S3
echo "📦 Uploading to S3..."
aws s3 sync $TEMP_DIR/ s3://$WEB_BUCKET_NAME/ \
    --profile $PROFILE \
    --delete \
    --cache-control "no-cache"

echo "🔧 Updating Cognito User Pool Client callback URLs..."
# Update callback URLs to use CloudFront HTTPS URL
aws cognito-idp update-user-pool-client \
    --user-pool-id $USER_POOL_ID \
    --client-id $USER_POOL_CLIENT_ID \
    --callback-urls "[\"$CLOUDFRONT_URL/callback\"]" \
    --logout-urls "[\"$CLOUDFRONT_URL/\"]" \
    --allowed-o-auth-flows code \
    --allowed-o-auth-scopes openid email profile \
    --allowed-o-auth-flows-user-pool-client \
    --supported-identity-providers COGNITO \
    --profile $PROFILE > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Cognito User Pool Client updated successfully"
else
    echo "⚠️  Warning: Could not update Cognito User Pool Client (may need manual update)"
fi

echo "🔧 Updating S3 Data Bucket CORS configuration..."
# Update CORS configuration to allow CloudFront domain
cat > /tmp/cors-config.json << EOF
{
    "CORSRules": [
        {
            "AllowedHeaders": [
                "*"
            ],
            "AllowedMethods": [
                "GET",
                "PUT",
                "POST",
                "DELETE",
                "HEAD"
            ],
            "AllowedOrigins": [
                "$CLOUDFRONT_URL"
            ],
            "ExposeHeaders": [
                "ETag",
                "x-amz-version-id"
            ],
            "MaxAgeSeconds": 3000
        }
    ]
}
EOF

aws s3api put-bucket-cors \
    --bucket $DATA_BUCKET_NAME \
    --cors-configuration file:///tmp/cors-config.json \
    --profile $PROFILE > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ S3 Data Bucket CORS configuration updated successfully"
else
    echo "⚠️  Warning: Could not update S3 Data Bucket CORS configuration"
fi

# Invalidate CloudFront cache
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
    --profile $PROFILE \
    --query "DistributionList.Items[?Origins.Items[0].DomainName=='$WEB_BUCKET_NAME.s3.amazonaws.com'].Id" \
    --output text)

if [ ! -z "$DISTRIBUTION_ID" ]; then
    echo "🔄 Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id $DISTRIBUTION_ID \
        --paths "/*" \
        --profile $PROFILE > /dev/null
fi

# Cleanup
rm -rf $TEMP_DIR

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Create users in the Cognito User Pool:"
echo "   - Go to AWS Console → Cognito → User pools → s3-explorer-users"
echo "   - Create users with email addresses and set temporary passwords"
echo "   - Users will receive an email to set their password on first login"
echo ""
echo "2. Access your S3 Explorer:"
echo "   - Primary URL (HTTPS): $CLOUDFRONT_URL"
echo "   - Alternative URL (HTTP): $S3_WEBSITE_URL"
echo ""
echo "🔐 User Pool Client ID: $USER_POOL_CLIENT_ID"
echo "🔗 Current callback URLs: $CLOUDFRONT_URL/callback"
