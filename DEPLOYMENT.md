# RagnarCam Deployment Guide

## Render Deployment (Recommended)

### Quick Start
1. **Fork or clone** this repository
2. **Connect to Render**: Link your GitHub account at [render.com](https://render.com)
3. **Create Web Service**: 
   - Click "New +" → "Web Service"
   - Connect your RagnarCam repository
   - Use service name: `doggycam`
4. **Auto-configuration**: Render will detect `render.yaml` and configure automatically
5. **Deploy**: Click "Deploy" and wait for build completion

### Manual Configuration (if needed)
If auto-detection doesn't work, use these settings:

- **Name**: `doggycam`
- **Environment**: `Python 3`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `gunicorn --bind 0.0.0.0:$PORT app:app`
- **Plan**: Free (sufficient for basic monitoring)

### Environment Variables
Render will automatically set:
- `PORT`: Service port (usually 10000)
- `SECRET_KEY`: Auto-generated secure key
- `FLASK_ENV`: Set to "production"

## Production Setup with Real Cameras

### Adding OpenCV Support
For real camera support, update `requirements.txt`:

```txt
Flask==2.3.3
gunicorn==21.2.0
Pillow==10.0.0
opencv-python-headless==4.10.0.84
numpy<2.0.0
```

### Camera Configuration
1. **USB Cameras**: Plug into server/device USB ports
2. **IP Cameras**: Configure network access and update camera discovery logic
3. **Built-in Cameras**: Usually detected automatically

### Security Considerations
- **Authentication**: Consider adding login system for production
- **HTTPS**: Render provides SSL certificates automatically
- **Network**: Restrict access via firewall if needed

## Local Development

### Prerequisites
- Python 3.11+
- pip package manager

### Setup
```bash
# Clone repository
git clone https://github.com/maka199/RagnarCam.git
cd RagnarCam

# Install dependencies
pip install -r requirements.txt

# Run locally
python app.py
```

### Development Mode
Set environment variable for development:
```bash
export FLASK_ENV=development
python app.py
```

## Usage

1. **Access Interface**: Open your Render URL or `http://localhost:5000`
2. **View Cameras**: Available cameras appear in the left panel
3. **Start Monitoring**: Click on a camera to start streaming
4. **Multiple Cameras**: Add multiple streams simultaneously
5. **Stop Streaming**: Use the "Stop" button on each camera card

## Troubleshooting

### Common Issues

**No Cameras Detected**
- Demo mode will activate automatically
- For real cameras, check USB connections
- Verify camera permissions on the system

**Deployment Fails**
- Check build logs in Render dashboard
- Verify `requirements.txt` format
- Ensure Python version compatibility

**Streaming Issues**
- Check browser console for errors
- Verify network connectivity
- Test with different browsers

### Demo Mode
RagnarCam automatically falls back to demo mode when:
- OpenCV is not available
- No cameras are detected
- Running in development without camera hardware

## Technical Architecture

- **Backend**: Flask (Python)
- **Frontend**: Bootstrap 5 + Vanilla JavaScript
- **Streaming**: HTTP multipart streams
- **Deployment**: Gunicorn WSGI server
- **Cloud**: Render platform ready

## Performance

- **Free Tier**: Sufficient for 1-2 cameras
- **Paid Tier**: Supports multiple high-resolution streams
- **Resource Usage**: Minimal when in demo mode
- **Bandwidth**: Depends on stream quality and number of cameras

## Support

For issues or questions:
1. Check this deployment guide
2. Review repository README.md
3. Open GitHub issue with details
4. Include browser console logs if applicable