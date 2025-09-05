// Configuration - will be replaced during deployment
const config = {
    region: 'us-east-1',
    userPoolId: 'YOUR_USER_POOL_ID',
    userPoolClientId: 'YOUR_USER_POOL_CLIENT_ID',
    identityPoolId: 'YOUR_IDENTITY_POOL_ID',
    dataBucketName: 'YOUR_DATA_BUCKET_NAME',
    cognitoDomain: 'YOUR_COGNITO_DOMAIN'
};

// Initialize AWS SDK
AWS.config.region = config.region;

// Auth module
const auth = {
    currentUser: null,
    
    init() {
        // Check for authorization code in URL (OAuth callback)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        
        if (code) {
            this.handleAuthCallback(code);
        } else {
            // Check if user is already logged in
            this.checkSession();
        }
    },
    
    async handleAuthCallback(code) {
        showLoading(true);
        try {
            // Exchange authorization code for tokens
            const tokenEndpoint = `${config.cognitoDomain}/oauth2/token`;
            const response = await fetch(tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: config.userPoolClientId,
                    code: code,
                    redirect_uri: window.location.origin + '/callback'
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to exchange authorization code');
            }
            
            const tokens = await response.json();
            this.saveTokens(tokens);
            
            // Get user info
            await this.getUserInfo(tokens.access_token);
            
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Show main app
            this.showApp();
        } catch (error) {
            console.error('Auth callback error:', error);
            alert('Authentication failed. Please try again.');
            this.signOut();
        } finally {
            showLoading(false);
        }
    },
    
    saveTokens(tokens) {
        sessionStorage.setItem('idToken', tokens.id_token);
        sessionStorage.setItem('accessToken', tokens.access_token);
        sessionStorage.setItem('refreshToken', tokens.refresh_token);
    },
    
    async getUserInfo(accessToken) {
        const userInfoEndpoint = `${config.cognitoDomain}/oauth2/userInfo`;
        const response = await fetch(userInfoEndpoint, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to get user info');
        }
        
        this.currentUser = await response.json();
        document.getElementById('userEmail').textContent = this.currentUser.email || this.currentUser.preferred_username;
    },
    
    async checkSession() {
        const idToken = sessionStorage.getItem('idToken');
        const accessToken = sessionStorage.getItem('accessToken');
        
        if (idToken && accessToken) {
            try {
                // Verify token is still valid by getting user info
                await this.getUserInfo(accessToken);
                this.showApp();
            } catch (error) {
                console.error('Session invalid:', error);
                this.signOut();
            }
        }
    },
    
    signIn() {
        const authEndpoint = `${config.cognitoDomain}/oauth2/authorize`;
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.userPoolClientId,
            redirect_uri: window.location.origin + '/callback',
            scope: 'openid email profile',
            identity_provider: 'Okta'
        });
        
        window.location.href = `${authEndpoint}?${params}`;
    },
    
    signOut() {
        sessionStorage.clear();
        this.currentUser = null;
        
        // Redirect to Cognito logout
        const logoutEndpoint = `${config.cognitoDomain}/logout`;
        const params = new URLSearchParams({
            client_id: config.userPoolClientId,
            logout_uri: window.location.origin
        });
        
        window.location.href = `${logoutEndpoint}?${params}`;
    },
    
    async showApp() {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('appSection').style.display = 'block';
        document.getElementById('userInfo').style.display = 'block';
        
        // Configure AWS credentials
        await this.configureAWSCredentials();
        
        // Initialize S3 operations
        s3Operations.init();
    },
    
    async configureAWSCredentials() {
        const idToken = sessionStorage.getItem('idToken');
        
        AWS.config.credentials = new AWS.CognitoIdentityCredentials({
            IdentityPoolId: config.identityPoolId,
            Logins: {
                [`cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`]: idToken
            }
        });
        
        await AWS.config.credentials.getPromise();
    }
};

// S3 Operations module
const s3Operations = {
    s3: null,
    
    init() {
        this.s3 = new AWS.S3({
            apiVersion: '2006-03-01',
            params: { Bucket: config.dataBucketName }
        });
        
        this.listFiles();
        this.setupEventListeners();
    },
    
    setupEventListeners() {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        
        // Click to browse
        dropZone.addEventListener('click', () => fileInput.click());
        
        // File selection
        fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });
        
        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            this.handleFiles(e.dataTransfer.files);
        });
        
        // Refresh button
        document.getElementById('refreshButton').addEventListener('click', () => {
            this.listFiles();
        });
    },
    
    async handleFiles(files) {
        const maxSize = 100 * 1024 * 1024; // 100MB
        
        for (const file of files) {
            if (file.size > maxSize) {
                alert(`File "${file.name}" exceeds 100MB limit`);
                continue;
            }
            
            await this.uploadFile(file);
        }
        
        this.listFiles();
    },
    
    async uploadFile(file) {
        const uploadProgress = document.getElementById('uploadProgress');
        const progressBar = document.getElementById('progressBar');
        const uploadStatus = document.getElementById('uploadStatus');
        
        uploadProgress.style.display = 'block';
        uploadStatus.textContent = `Uploading ${file.name}...`;
        
        const params = {
            Key: file.name,
            Body: file,
            ContentType: file.type || 'application/octet-stream',
            ServerSideEncryption: 'AES256',
            Metadata: {
                'uploaded-by': auth.currentUser.email || auth.currentUser.preferred_username,
                'upload-time': new Date().toISOString()
            }
        };
        
        try {
            await this.s3.upload(params)
                .on('httpUploadProgress', (progress) => {
                    const percentage = Math.round((progress.loaded / progress.total) * 100);
                    progressBar.style.width = percentage + '%';
                    progressBar.textContent = percentage + '%';
                })
                .promise();
                
            uploadStatus.textContent = `Successfully uploaded ${file.name}`;
            setTimeout(() => {
                uploadProgress.style.display = 'none';
                progressBar.style.width = '0%';
            }, 2000);
        } catch (error) {
            console.error('Upload error:', error);
            alert(`Failed to upload ${file.name}: ${error.message}`);
            uploadProgress.style.display = 'none';
        }
    },
    
    async listFiles() {
        showLoading(true);
        const fileList = document.getElementById('fileList');
        
        try {
            const data = await this.s3.listObjectsV2().promise();
            
            if (data.Contents.length === 0) {
                fileList.innerHTML = `
                    <div class="text-center text-muted">
                        <i class="bi bi-inbox" style="font-size: 3rem;"></i>
                        <p>No files uploaded yet</p>
                    </div>
                `;
            } else {
                fileList.innerHTML = data.Contents.map(item => this.createFileItem(item)).join('');
            }
        } catch (error) {
            console.error('List files error:', error);
            fileList.innerHTML = '<div class="alert alert-danger">Failed to load files</div>';
        } finally {
            showLoading(false);
        }
    },
    
    createFileItem(item) {
        const fileName = item.Key;
        const fileSize = this.formatFileSize(item.Size);
        const lastModified = new Date(item.LastModified).toLocaleString();
        
        return `
            <div class="file-item">
                <i class="bi bi-file-earmark file-icon"></i>
                <div class="flex-grow-1">
                    <div class="fw-semibold">${fileName}</div>
                    <div class="text-muted small">${fileSize} • Modified: ${lastModified}</div>
                </div>
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline-primary" onclick="s3Operations.downloadFile('${fileName}')">
                        <i class="bi bi-download"></i> Download
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="s3Operations.renameFile('${fileName}')">
                        <i class="bi bi-pencil"></i> Rename
                    </button>
                </div>
            </div>
        `;
    },
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    async downloadFile(key) {
        showLoading(true);
        try {
            const url = await this.s3.getSignedUrlPromise('getObject', {
                Key: key,
                Expires: 300 // 5 minutes
            });
            
            // Create temporary link and click it
            const a = document.createElement('a');
            a.href = url;
            a.download = key;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (error) {
            console.error('Download error:', error);
            alert('Failed to download file');
        } finally {
            showLoading(false);
        }
    },
    
    renameFile(oldKey) {
        const modal = new bootstrap.Modal(document.getElementById('renameModal'));
        const newFileNameInput = document.getElementById('newFileName');
        const confirmButton = document.getElementById('confirmRename');
        
        // Pre-fill with current name
        newFileNameInput.value = oldKey;
        
        // Remove old event listener and add new one
        const newConfirmButton = confirmButton.cloneNode(true);
        confirmButton.parentNode.replaceChild(newConfirmButton, confirmButton);
        
        newConfirmButton.addEventListener('click', async () => {
            const newKey = newFileNameInput.value.trim();
            
            if (!newKey || newKey === oldKey) {
                modal.hide();
                return;
            }
            
            modal.hide();
            showLoading(true);
            
            try {
                // Copy to new key
                await this.s3.copyObject({
                    CopySource: `${config.dataBucketName}/${oldKey}`,
                    Key: newKey,
                    ServerSideEncryption: 'AES256',
                    MetadataDirective: 'COPY'
                }).promise();
                
                // Delete old key
                await this.s3.deleteObject({
                    Key: oldKey
                }).promise();
                
                // Refresh list
                this.listFiles();
            } catch (error) {
                console.error('Rename error:', error);
                alert('Failed to rename file');
            } finally {
                showLoading(false);
            }
        });
        
        modal.show();
    }
};

// Helper functions
function showLoading(show) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Login button
    document.getElementById('loginButton').addEventListener('click', () => {
        auth.signIn();
    });
    
    // Initialize auth
    auth.init();
});
