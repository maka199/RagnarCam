# RagnarCam 🐕📹
**Monitor your dog when left alone using multiple camera devices**

RagnarCam is a web-based dog monitoring application that allows you to connect to multiple camera devices and stream live video feeds. Perfect for keeping an eye on your furry friend while you're away!

## Features

- 🎥 **Multi-camera support** - Connect and monitor multiple camera devices simultaneously
- 🌐 **Web-based interface** - Access from any device with a web browser
- ☁️ **Cloud deployment ready** - Designed to run on Render and other cloud platforms
- 📱 **Responsive design** - Works on desktop, tablet, and mobile devices
- 🔄 **Real-time streaming** - Live video feeds with minimal latency
- 🎛️ **Easy camera management** - Start/stop cameras with simple controls

## Quick Start

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/maka199/RagnarCam.git
   cd RagnarCam
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application**
   ```bash
   python app.py
   ```

4. **Open in browser**
   Navigate to `http://localhost:5000`

### Deploy on Render

1. **Connect your GitHub repository** to Render
2. **Use these build settings:**
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT app:app`
3. **Deploy** and access your app at your Render URL

## Usage

1. **Access the web interface** - Open RagnarCam in your web browser
2. **Discover cameras** - The app will automatically detect available camera devices
3. **Start monitoring** - Click on a camera in the left panel to start streaming
4. **Multiple views** - Add multiple cameras for comprehensive monitoring
5. **Mobile friendly** - Access from your phone while away from home

## System Requirements

- **Python 3.11+**
- **Camera devices** (USB webcams, built-in cameras, or IP cameras)
- **Modern web browser** with JavaScript enabled

## Technical Details

- **Backend:** Flask + Socket.IO for real-time communication
- **Frontend:** Bootstrap 5 + Vanilla JavaScript
- **Video processing:** OpenCV for camera handling and streaming
- **Deployment:** Gunicorn with Eventlet for WebSocket support

## Environment Variables

- `PORT` - Server port (default: 5000)
- `SECRET_KEY` - Flask secret key for sessions
- `FLASK_ENV` - Environment (development/production)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License.

## Support

For issues and questions, please open a GitHub issue or contact the maintainer.

---

**Happy Dog Monitoring! 🐾**
