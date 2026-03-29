import asyncio
import collections
import json
import logging
import time
from typing import List, Optional

import numpy as np
import scipy.signal
import serial # type: ignore
import websockets

# --- Configuration ---
# WebSocket server configuration
WS_HOST = "0.0.0.0"
WS_PORT = 8765

# Serial Port Configuration
SERIAL_PORT = "/dev/cu.usbmodem1101"
SERIAL_BAUD = 115200

# --- Logging Setup ---
logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# --- Global State ---
data_queue: asyncio.Queue = asyncio.Queue()
connected_clients = set()
serial_state = "scanning"

async def broadcast_status(state: str):
    global serial_state
    serial_state = state
    payload = {"type": "ble_status", "state": state} # keeping ble_status type so frontend doesn't break
    message = json.dumps(payload)
    if connected_clients:
        websockets.broadcast(connected_clients, message)

rr_buffer = collections.deque(maxlen=300) # Erhöht, um 60-180 Sekunden zu speichern (Ultra-Short-Term)
current_rmssd = 0.0
last_valid_rr: Optional[int] = None
consecutive_rejects: int = 0
current_bpm = 0

def is_valid_rr(new_rr: int, current_last_rr: Optional[int]) -> bool:
    global consecutive_rejects
    if new_rr < 300 or new_rr > 3000:
        return False
        
    if current_last_rr is not None:
        diff_percent = abs(new_rr - current_last_rr) / current_last_rr
        # Erhöht auf 0.45 aufgrund der sehr niedrigen 8Hz Sampling-Rate (viel Jitter bei RR-Distanzen)
        if diff_percent > 0.45:
            consecutive_rejects += 1
            if consecutive_rejects >= 3:
                consecutive_rejects = 0
                return True
            return False
            
    consecutive_rejects = 0
    return True

def calculate_rmssd(buffer_list: List[tuple], time_window_sec=60) -> float:
    if len(buffer_list) < 2:
        return 0.0
    try:
        now = time.time()
        # 3. Messdauer-Filter: Exakt das vorgegebene Zeitfenster (z.B. 60s Ultra-Short Term) heranziehen
        windowed_rrs = [rr for (ts, rr) in buffer_list if (now - ts) <= time_window_sec]
        
        if len(windowed_rrs) < 2:
            return 0.0
            
        arr = np.array(windowed_rrs)
        
        # 2. Artefakt-Korrektur: Filtert Ektopen/Fehlmessungen (alles, was > 20% vom lokalen Median abweicht)
        median_rr = np.median(arr)
        valid_arr = arr[np.abs(arr - median_rr) < (0.20 * median_rr)]
        
        if len(valid_arr) < 2:
            return 0.0

        diffs = np.diff(valid_arr)
        if len(diffs) == 0:
            return 0.0
        mean_sq_diff = np.mean(diffs ** 2)
        return float(np.sqrt(mean_sq_diff))
    except Exception as e:
        logger.error(f"Error calculating RMSSD: {e}")
        return 0.0

async def rmssd_worker():
    global current_rmssd
    while True:
        await asyncio.sleep(1.0)
        snapshot = list(rr_buffer)
        rmssd_val = float(calculate_rmssd(snapshot))
        current_rmssd = round(rmssd_val, 1)

async def ws_handler(websocket):
    client_address = getattr(websocket, 'remote_address', 'Unknown')
    logger.info(f"New WebSocket client connected: {client_address}")
    
    connected_clients.add(websocket)
    await websocket.send(json.dumps({"type": "ble_status", "state": serial_state}))
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                cmd = data.get("command")
                if cmd == "start":
                    logger.info("Received START command.")
                elif cmd == "stop":
                    logger.info("Received STOP command.")
                elif cmd == "rescan":
                    logger.info("Received RESCAN command.")
            except json.JSONDecodeError:
                pass
    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        logger.error(f"WebSocket client error: {e}")
    finally:
        connected_clients.remove(websocket)
        logger.info(f"WebSocket client disconnected: {client_address}")

async def broadcast_worker():
    logger.info("Started WebSocket broadcast worker")
    while True:
        try:
            payload = await data_queue.get()
            if not connected_clients:
                continue
            message = json.dumps(payload)
            websockets.broadcast(connected_clients, message)
            data_queue.task_done()
        except Exception as e:
            logger.error(f"Error broadcasting message: {e}", exc_info=True)

# Peak detection variables
ecg_window: List[float] = []
time_window: List[float] = []
last_detected_peak_time = 0.0

def process_ecg_chunk(times, values):
    global last_detected_peak_time, last_valid_rr, current_rmssd, current_bpm
    
    try:
        if len(values) < 20:
            return
            
        y_raw = np.array(values)
        t_raw = np.array(times)
        
        # Simple smoothing (moving average) to reduce high frequency noise
        window_size = 5
        if len(y_raw) >= window_size:
            y = np.convolve(y_raw, np.ones(window_size)/window_size, mode='valid')
            t = t_raw[(window_size-1)//2 : -(window_size//2)]
        else:
            y = y_raw
            t = t_raw
        
        # Simple derivative and squaring for emphasis on R-peaks
        dy = np.diff(y)
        dy = np.append(dy, 0)
        sq = dy ** 2
        
        # Peak Detektion: distance ist die Mindestanzahl an Samples zwischen zwei Peaks.
        # Bei ~134 Hz bedeuten 60 Samples = 450 ms (was max. 133 BPM entspricht).
        # Wir müssen auch überprüfen, ob das Signal nur "Rauschen" ist (Sensor nicht am Körper).
        # Liegt die Signalvarianz extrem niedrig, sind wir disconnected.
        is_disconnected = np.max(sq) < 0.5 or np.std(sq) < 0.2

        if is_disconnected:
            # Falls nicht verbunden, lösche aktuelle BPM/RMSSD und detektiere keine Peaks
            current_bpm = 0
            current_rmssd = 0.0
            return

        # Etwas höheres Thresholding um Rauschen auszufiltern
        base_threshold = np.mean(sq) + 2.5 * np.std(sq)
        threshold = max(base_threshold, 2.0) # Assume some min amplitude for a real peak
        
        # Distance von 45 auf 60 erhöht, um falsche Peaks durch Jitter zu reduzieren
        peaks, _ = scipy.signal.find_peaks(sq, height=threshold, distance=60)
        
        if len(peaks) > 0:
            logger.info(f"Detected {len(peaks)} peaks in chunk. sq mean: {np.mean(sq):.2f}, threshold: {threshold:.2f}")

        rr_intervals_ms = []
        for p in peaks:
            # 1. R-R Sub-Sample Interpolation
            if 0 < p < len(sq) - 1:
                y1, y2, y3 = sq[p-1], sq[p], sq[p+1]
                t1, t2, t3 = t[p-1], t[p], t[p+1]
                denom = 2 * (y1 - 2*y2 + y3)
                if denom != 0:
                    offset = (t2 - t1) * ((y1 - y3) / denom)
                    peak_time = t2 + offset
                else:
                    peak_time = t[p]
            else:
                peak_time = t[p]

            if peak_time - last_detected_peak_time > 300: # lock-out of 300ms
                rr_interval = peak_time - last_detected_peak_time
                if last_detected_peak_time > 0 and rr_interval < 2000:
                    rr_ms = int(rr_interval)
                    if is_valid_rr(rr_ms, last_valid_rr):
                        rr_intervals_ms.append(rr_ms)
                        rr_buffer.append((time.time(), rr_ms))
                        last_valid_rr = rr_ms

                last_detected_peak_time = peak_time
                
        if rr_intervals_ms:
            snapshot = list(rr_buffer)
            current_rmssd = round(float(calculate_rmssd(snapshot)), 1)
            
            # calculate average BPM over last few RRs
            if len(snapshot) > 0:
                recent_rrs = [rr for (ts, rr) in snapshot[-5:]]
                avg_rr = np.mean(recent_rrs) if recent_rrs else 0
                current_bpm = int(60000 / avg_rr) if avg_rr > 0 else 0
            
    except Exception as e:
        logger.error(f"Error in peak detection: {e}")

def blocking_serial_read():
    global ecg_window, time_window
    
    try:
        ser = serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=1.0)
        ser.dtr = True # Wichtig für CircuitPython USB-Verbindungen
        ser.rts = True
        logger.info(f"Connected to {SERIAL_PORT} successfully.")
        
        debug_lines_printed = 0
        
        while True:
            line = ser.readline()
            if not line:
                continue
                
            try:
                line_str = line.decode('utf-8', errors='ignore').strip()
                if not line_str:
                    continue
                    
                if debug_lines_printed < 5:
                    logger.info(f"RAW SERIAL: {line_str}")
                    debug_lines_printed += 1
                    
                # Parse the incoming format: 'Yeda0:(41.3737,) MOI1:(0.0,) MOI2:(0.0,)'
                if "Yeda0:" in line_str:
                    try:
                        # Extract the value inside the parentheses for Yeda0
                        # z.B. split by 'Yeda0:(' -> '41.3737,) MOI1...' -> split by ',' -> '41.3737'
                        yeda_part = line_str.split("Yeda0:(")[1].split(",")[0]
                        yeda_val = float(yeda_part)
                        
                        timestamp_ms = time.time() * 1000
                        
                        ecg_window.append(yeda_val)
                        time_window.append(timestamp_ms)
                        
                        # Process chunks more frequently
                        # 150 Hz = 150 samples per second. Wir verarbeiten 1.5 Sekunden am Stück.
                        if len(ecg_window) >= 225: 
                            process_ecg_chunk(time_window, ecg_window)
                            
                            # Keep 75 overlap (~0.5s) für Peak-Ränder
                            ecg_window = ecg_window[-75:]
                            time_window = time_window[-75:]
                            
                        # Continually broadcast data so the UI timeline stays responsive
                        payload = {
                            "timestamp": int(timestamp_ms),
                            "bpm": current_bpm if current_bpm > 0 else None,
                            "rr_intervals": [], 
                            "rmssd": current_rmssd if current_rmssd > 0 else None,
                            "type": "polar_data"
                        }
                        data_queue.put_nowait(payload)

                    except (IndexError, ValueError) as e:
                        logger.info(f"Could not parse line: {line_str}")
                        pass
                        
            except ValueError:
                pass # Unparseable line, ignore
                
    except serial.SerialException as e:
        logger.error(f"Serial connection error: {e}. Retrying in 3s...")
        time.sleep(3)
        return

async def serial_loop():
    while True:
        await broadcast_status("scanning")
        try:
            logger.info(f"Attempting connection to {SERIAL_PORT}...")
            # Ideally we'd set status to 'connected' when successfully connected,
            # but since blocking_serial_read blocks, we just assume scanning until data flows, 
            # or we set it before. We can set it to connected just before blocking, 
            # and if it fails immediately, it returns.
            # wait 0.5s for thread to start connection
            await asyncio.sleep(0.1)
            await broadcast_status("connected")
            await asyncio.to_thread(blocking_serial_read)
        except Exception as e:
            logger.error(f"Serial loop failure: {e}", exc_info=True)
            await asyncio.sleep(3)
            
async def main():
    logger.info("Initializing Edge Computing Backend with Serial (Pico DIY ECG)...")
    
    ws_server = await websockets.serve(ws_handler, WS_HOST, WS_PORT)
    logger.info(f"Starting WebSocket server on ws://{WS_HOST}:{WS_PORT}")
    
    broadcast_task = asyncio.create_task(broadcast_worker())
    rmssd_task = asyncio.create_task(rmssd_worker())
    serial_task = asyncio.create_task(serial_loop())
    
    await asyncio.gather(
        ws_server.wait_closed(),
        broadcast_task,
        rmssd_task,
        serial_task
    )

if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    try:
        loop.run_until_complete(main())
    except KeyboardInterrupt:
        logger.info("Process manually interrupted by user.")