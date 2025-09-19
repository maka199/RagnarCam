// RagnarCam Frontend JavaScript
class RagnarCam {
    constructor() {
        this.cameras = [];
        this.activeStreams = new Set();
        this.connectionTime = null;
        
        this.initializeUI();
        this.loadCameras();
        this.loadStatus();
    }

    initializeUI() {
        this.connectionTime = new Date();
        this.updateConnectionStatus('connected');
        
        // Update connection time every second
        setInterval(() => {
            this.updateSystemInfo();
        }, 1000);
        
        // Refresh status periodically
        setInterval(() => {
            this.loadStatus();
        }, 5000);
    }

    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');
        statusElement.className = `badge bg-${this.getStatusColor(status)} me-2`;
        statusElement.textContent = this.getStatusText(status);
    }

    getStatusColor(status) {
        switch(status) {
            case 'connected': return 'success';
            case 'disconnected': return 'danger';
            case 'connecting': return 'warning';
            default: return 'secondary';
        }
    }

    getStatusText(status) {
        switch(status) {
            case 'connected': return 'Connected';
            case 'disconnected': return 'Disconnected';
            case 'connecting': return 'Connecting...';
            default: return 'Unknown';
        }
    }

    updateSystemInfo() {
        const statusElement = document.getElementById('system-status');
        const streamsElement = document.getElementById('active-streams');
        const timeElement = document.getElementById('connected-time');

        statusElement.textContent = 'Online';
        streamsElement.textContent = this.activeStreams.size;
        
        if (this.connectionTime) {
            const elapsed = Math.floor((new Date() - this.connectionTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            timeElement.textContent = `${minutes}m ${seconds}s`;
        }
    }

    async loadStatus() {
        try {
            const response = await fetch('/api/status');
            if (response.ok) {
                const status = await response.json();
                // Update any status-specific UI here if needed
            }
        } catch (error) {
            console.error('Error loading status:', error);
        }
    }

    async loadCameras() {
        try {
            const response = await fetch('/api/cameras');
            if (response.ok) {
                this.cameras = await response.json();
                this.renderCamerasList();
            } else {
                this.showError('Failed to load cameras');
            }
        } catch (error) {
            console.error('Error loading cameras:', error);
            this.showError('Error connecting to server');
        }
    }

    renderCamerasList() {
        const container = document.getElementById('cameras-list');
        
        if (this.cameras.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-video-slash mb-2"></i>
                    <small class="d-block">No cameras detected</small>
                    <button class="btn btn-sm btn-outline-primary mt-2" onclick="ragnarCam.loadCameras()">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </div>
            `;
            return;
        }

        const cameraItems = this.cameras.map(camera => `
            <div class="camera-item ${this.activeStreams.has(camera.id) ? 'active' : ''}" 
                 data-camera-id="${camera.id}"
                 onclick="ragnarCam.toggleCamera(${camera.id})">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${camera.name}</strong>
                        <div class="camera-status available">
                            <i class="fas fa-circle"></i> ${camera.status}
                        </div>
                    </div>
                    <div>
                        ${this.activeStreams.has(camera.id) ? 
                            '<i class="fas fa-eye text-primary"></i>' : 
                            '<i class="fas fa-play text-success"></i>'
                        }
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = cameraItems;
    }

    async toggleCamera(cameraId) {
        if (this.activeStreams.has(cameraId)) {
            await this.stopCamera(cameraId);
        } else {
            await this.startCamera(cameraId);
        }
    }

    async startCamera(cameraId) {
        try {
            const response = await fetch(`/api/camera/${cameraId}/start`, {
                method: 'POST'
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.activeStreams.add(cameraId);
                    this.addVideoStream(cameraId);
                    this.renderCamerasList();
                    this.updateSystemInfo();
                } else {
                    this.showError(`Failed to start camera ${cameraId}`);
                }
            }
        } catch (error) {
            console.error('Error starting camera:', error);
            this.showError('Error starting camera');
        }
    }

    async stopCamera(cameraId) {
        try {
            const response = await fetch(`/api/camera/${cameraId}/stop`, {
                method: 'POST'
            });
            
            if (response.ok) {
                this.activeStreams.delete(cameraId);
                this.removeVideoStream(cameraId);
                this.renderCamerasList();
                this.updateSystemInfo();
            }
        } catch (error) {
            console.error('Error stopping camera:', error);
            this.showError('Error stopping camera');
        }
    }

    addVideoStream(cameraId) {
        const videoGrid = document.getElementById('video-grid');
        const template = document.getElementById('camera-card-template');
        const clone = template.content.cloneNode(true);
        
        const container = clone.querySelector('.camera-container');
        const cameraName = clone.querySelector('.camera-name');
        const cameraStream = clone.querySelector('.camera-stream');
        const stopBtn = clone.querySelector('.stop-camera-btn');
        
        const camera = this.cameras.find(c => c.id === cameraId);
        
        container.setAttribute('data-camera-id', cameraId);
        cameraName.textContent = camera ? camera.name : `Camera ${cameraId}`;
        cameraStream.src = `/video_feed/${cameraId}`;
        
        stopBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.stopCamera(cameraId);
        });

        // Clear welcome message if it exists
        if (videoGrid.children.length === 1 && videoGrid.querySelector('.text-center')) {
            videoGrid.innerHTML = '';
        }
        
        videoGrid.appendChild(clone);
    }

    removeVideoStream(cameraId) {
        const container = document.querySelector(`[data-camera-id="${cameraId}"]`);
        if (container) {
            container.remove();
        }

        // Show welcome message if no streams are active
        const videoGrid = document.getElementById('video-grid');
        if (videoGrid.children.length === 0) {
            videoGrid.innerHTML = `
                <div class="col-12 text-center mt-5">
                    <i class="fas fa-paw fa-3x text-muted mb-3"></i>
                    <h4 class="text-muted">Welcome to RagnarCam</h4>
                    <p class="text-muted">Select a camera from the left panel to start monitoring your dog.</p>
                </div>
            `;
        }
    }

    showError(message) {
        // Create a toast notification for errors
        console.error(message);
        
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-danger alert-dismissible fade show position-fixed';
        alertDiv.style.cssText = 'top: 70px; right: 20px; z-index: 1050; min-width: 300px;';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(alertDiv);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    showSuccess(message) {
        console.log(message);
        
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-success alert-dismissible fade show position-fixed';
        alertDiv.style.cssText = 'top: 70px; right: 20px; z-index: 1050; min-width: 300px;';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(alertDiv);
        
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 3000);
    }
}

// Global functions
function refreshCameras() {
    ragnarCam.loadCameras();
    ragnarCam.showSuccess('Camera list refreshed');
}

// Initialize the application when the page loads
let ragnarCam;
document.addEventListener('DOMContentLoaded', function() {
    ragnarCam = new RagnarCam();
});