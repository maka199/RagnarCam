#!/usr/bin/env python3
"""
RagnarCam - Dog Monitoring Application
A web application for monitoring dogs using camera devices.
"""

import os
import base64
import threading
import time
from flask import Flask, render_template, jsonify, request, Response
import logging

# Try to import OpenCV, if not available, use mock functionality
try:
    import cv2
    OPENCV_AVAILABLE = True
except ImportError:
    OPENCV_AVAILABLE = False
    print("OpenCV not available. Running in demo mode.")

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CameraManager:
    """Manages multiple camera devices for dog monitoring."""
    
    def __init__(self):
        self.cameras = {}
        self.active_streams = {}
        self.lock = threading.Lock()
        self.demo_frame = None
        self._create_demo_frame()
    
    def _create_demo_frame(self):
        """Create a demo frame for when OpenCV is not available."""
        if not OPENCV_AVAILABLE:
            # Create a simple demo image placeholder
            import io
            from PIL import Image, ImageDraw, ImageFont
            
            try:
                # Create a simple demo image
                img = Image.new('RGB', (640, 480), color='lightblue')
                draw = ImageDraw.Draw(img)
                
                # Add text
                try:
                    # Try to use a default font
                    font = ImageFont.load_default()
                except:
                    font = None
                
                text = "RagnarCam Demo Mode\nCamera feed would appear here\nwhen OpenCV is available"
                draw.text((50, 200), text, fill='black', font=font)
                
                # Convert to bytes
                img_io = io.BytesIO()
                img.save(img_io, 'JPEG')
                self.demo_frame = img_io.getvalue()
            except ImportError:
                # If PIL is also not available, create a minimal response
                self.demo_frame = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C'
    
    def discover_cameras(self):
        """Discover available camera devices."""
        if not OPENCV_AVAILABLE:
            # Return mock cameras for demo
            return [
                {'id': 0, 'name': 'Demo Camera 1', 'status': 'available (demo)'},
                {'id': 1, 'name': 'Demo Camera 2', 'status': 'available (demo)'}
            ]
        
        available_cameras = []
        # Try to find available cameras (0-4 should be sufficient for most setups)
        for i in range(5):
            try:
                cap = cv2.VideoCapture(i)
                if cap.isOpened():
                    ret, frame = cap.read()
                    if ret:
                        available_cameras.append({
                            'id': i,
                            'name': f'Camera {i}',
                            'status': 'available'
                        })
                cap.release()
            except Exception as e:
                logger.warning(f"Error checking camera {i}: {e}")
        
        # If no real cameras found, add demo ones
        if not available_cameras:
            available_cameras = [
                {'id': 0, 'name': 'Demo Camera', 'status': 'demo mode'}
            ]
        
        return available_cameras
    
    def start_camera(self, camera_id):
        """Start streaming from a specific camera."""
        with self.lock:
            if camera_id in self.active_streams:
                return True
            
            if not OPENCV_AVAILABLE:
                # In demo mode, just mark as active
                self.active_streams[camera_id] = True
                logger.info(f"Started demo camera {camera_id}")
                return True
            
            try:
                cap = cv2.VideoCapture(camera_id)
                if cap.isOpened():
                    self.cameras[camera_id] = cap
                    self.active_streams[camera_id] = True
                    logger.info(f"Started camera {camera_id}")
                    return True
            except Exception as e:
                logger.error(f"Error starting camera {camera_id}: {e}")
            
            return False
    
    def stop_camera(self, camera_id):
        """Stop streaming from a specific camera."""
        with self.lock:
            if camera_id in self.cameras:
                self.cameras[camera_id].release()
                del self.cameras[camera_id]
            
            if camera_id in self.active_streams:
                del self.active_streams[camera_id]
            
            logger.info(f"Stopped camera {camera_id}")
    
    def get_frame(self, camera_id):
        """Get a frame from the specified camera."""
        if not OPENCV_AVAILABLE:
            return self.demo_frame
        
        if camera_id not in self.cameras:
            return None
        
        try:
            ret, frame = self.cameras[camera_id].read()
            if ret:
                return frame
        except Exception as e:
            logger.error(f"Error getting frame from camera {camera_id}: {e}")
        
        return None
    
    def cleanup(self):
        """Clean up all camera resources."""
        with self.lock:
            for camera_id in list(self.cameras.keys()):
                self.stop_camera(camera_id)

# Global camera manager
camera_manager = CameraManager()

@app.route('/')
def index():
    """Main dashboard page."""
    return render_template('index.html')

@app.route('/api/cameras')
def get_cameras():
    """Get list of available cameras."""
    cameras = camera_manager.discover_cameras()
    return jsonify(cameras)

@app.route('/api/camera/<int:camera_id>/start', methods=['POST'])
def start_camera(camera_id):
    """Start streaming from a camera."""
    success = camera_manager.start_camera(camera_id)
    return jsonify({'success': success, 'camera_id': camera_id})

@app.route('/api/camera/<int:camera_id>/stop', methods=['POST'])
def stop_camera(camera_id):
    """Stop streaming from a camera."""
    camera_manager.stop_camera(camera_id)
    return jsonify({'success': True, 'camera_id': camera_id})

@app.route('/video_feed/<int:camera_id>')
def video_feed(camera_id):
    """Video streaming route."""
    def generate_frames():
        while camera_id in camera_manager.active_streams:
            if OPENCV_AVAILABLE:
                frame = camera_manager.get_frame(camera_id)
                if frame is not None:
                    # Encode frame as JPEG
                    ret, buffer = cv2.imencode('.jpg', frame)
                    if ret:
                        frame_bytes = buffer.tobytes()
                        yield (b'--frame\r\n'
                               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
            else:
                # Use demo frame
                demo_frame = camera_manager.get_frame(camera_id)
                if demo_frame:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + demo_frame + b'\r\n')
            time.sleep(0.1)  # Control frame rate
    
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/status')
def get_status():
    """Get system status."""
    mode = "Demo Mode" if not OPENCV_AVAILABLE else "Full Mode"
    return jsonify({
        'mode': mode,
        'active_streams': len(camera_manager.active_streams),
        'opencv_available': OPENCV_AVAILABLE
    })

if __name__ == '__main__':
    try:
        port = int(os.environ.get('PORT', 5000))
        debug = os.environ.get('FLASK_ENV') == 'development'
        
        mode = "Demo Mode (OpenCV not available)" if not OPENCV_AVAILABLE else "Full Mode"
        logger.info(f"Starting RagnarCam on port {port} in {mode}")
        app.run(host='0.0.0.0', port=port, debug=debug, threaded=True)
    except KeyboardInterrupt:
        logger.info("Shutting down RagnarCam")
    finally:
        camera_manager.cleanup()