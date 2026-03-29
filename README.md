# Stress Simulation System (BioTrace)

A real-time ECG monitoring and stress level analysis system. This project consists of a Python backend that interacts with an ECG sensor (e.g., Raspberry Pi Pico DIY ECG) via serial communication and a Next.js dashboard for visualization.

## 🚀 Overview

The **Stress Simulation System** leverages edge computing to process live ECG data stream, providing real-time heart rate (BPM) and heart rate variability (HRV) metrics.

### Key Features:
- **🫀 Real-time ECG Data Acquisition**: Streams ECG data via serial port (115200 baud).
- **📉 Live Peak Detection**: Automated R-peak detection using derivative-based thresholding and peak interpolation.
- **📊 HRV Metrics**: Calculates RMSSD (Root Mean Square of Successive Differences) in real-time over sliding time windows.
- **📡 WebSocket Streaming**: Low-latency data transmission from the backend to the frontend.
- **💻 Interactive Dashboard**: Modern UI built with Next.js and Recharts for live signal and metric visualization.

---

## 🛠 Project Structure

- **`main.py`**: Python backend script. Handles serial acquisition, signal processing (Peak detection, BPM, RMSSD), and the WebSocket server.
- **`dashboard/`**: Next.js application for the frontend UI.
- **`run.sh`**: Convenience script to start both the backend and frontend simultaneously.
- **`requirements.txt`**: Python dependencies for the backend.

---

## 🏗 Setup & Installation

### Prerequisites
- **Python 3.8+**
- **Node.js 18+**
- **Hardware**: An ECG device supporting serial output (e.g., Pico DIY ECG) connected via USB.

### Backend Setup
1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # macOS/Linux
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Frontend Setup
1. Navigate to the dashboard directory:
   ```bash
   cd dashboard
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```

---

## 🚦 Running the Application

The easiest way to start the system is using the provided shell script:

```bash
chmod +x run.sh
./run.sh
```

- **Backend**: Listens on `ws://localhost:8765`
- **Frontend**: Accessible at `http://localhost:3000`

---

## ⚙ Configuration

You can configure the serial port and baud rate in `main.py`:

```python
# --- Configuration ---
SERIAL_PORT = "/dev/cu.usbmodem1101" # Adjust to your device's port
SERIAL_BAUD = 115200
```

---

## 📈 Technical Details

- **Sampling Rate**: Optimized for approximately 150Hz signal processing.
- **Filtering**: Implements smoothing and squaring for robust R-peak identification.
- **RMSSD Calculation**: Uses a 60-second ultra-short-term window for HRV analysis.
- **Signal Resilience**: Includes artifact rejection for ectopic or erroneous measurements.

---

## ⚖ License

Created for Uni TSS Project. All rights reserved.
