import asyncio
import collections
import json
import logging
import time
from typing import List, Optional

import numpy as np  # type: ignore
from bleak import BleakClient, BleakScanner  # type: ignore
from bleak.exc import BleakError  # type: ignore
import websockets  # type: ignore

# --- Configuration ---
# Standard BLE SIG UUIDs for Heart Rate
HR_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb"
HR_MEASUREMENT_CHAR_UUID = "00002a37-0000-1000-8000-00805f9b34fb"

# WebSocket server configuration
WS_HOST = "0.0.0.0"
WS_PORT = 8765

# --- Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# --- Global State ---
# asyncio Queue to transfer data from the BLE thread/callback to the WebSocket task
data_queue: asyncio.Queue = asyncio.Queue()

# Thread-safe set of connected WebSocket clients
connected_clients = set()

# Thread-safe rolling buffer for RR intervals (roughly last 60-80 beats)
rr_buffer = collections.deque(maxlen=80)
current_rmssd = 0.0
last_valid_rr: Optional[int] = None


def is_valid_rr(new_rr: int, last_valid_rr: Optional[int]) -> bool:
    """
    Validates an RR interval to filter out artifacts and ectopic beats.
    - Absolute limits: Reject < 300ms or > 2000ms.
    - Relative limits: Reject if > 25% change from the previous valid RR.
    """
    if new_rr < 300 or new_rr > 2000:
        return False
        
    if last_valid_rr is not None:
        diff_percent = abs(new_rr - last_valid_rr) / last_valid_rr
        if diff_percent > 0.25:
            return False
            
    return True


def calculate_rmssd(buffer_list: List[int]) -> float:
    """
    Calculates RMSSD (Root Mean Square of Successive Differences) from a list of RR intervals.
    """
    if len(buffer_list) < 15:
        return 0.0
    try:
        arr = np.array(buffer_list)
        diffs = np.diff(arr)
        if len(diffs) == 0:
            return 0.0
        mean_sq_diff = np.mean(diffs ** 2)
        return float(np.sqrt(mean_sq_diff))
    except (ZeroDivisionError, ValueError) as e:
        logger.error(f"Math error calculating RMSSD: {e}")
        return 0.0
    except Exception as e:
        logger.error(f"Unexpected error calculating RMSSD: {e}")
        return 0.0

async def rmssd_worker():
    """
    Periodically calculates the RMSSD in the background to avoid blocking the BLE event loop.
    """
    global current_rmssd
    while True:
        await asyncio.sleep(1.0)
        # Create a thread-safe snapshot of the deque to avoid mutation during iteration
        snapshot = list(rr_buffer)
        rmssd_val = float(calculate_rmssd(snapshot))
        current_rmssd = round(rmssd_val, 1)  # type: ignore
        
        if len(snapshot) >= 15:
            logger.info(f"Calculating RMSSD... Buffer size: {len(snapshot)} | RMSSD: {current_rmssd}")


async def ws_handler(websocket):
    """
    WebSocket handler for new incoming client connections.
    """
    # Note: websocket.remote_address usually contains ip and port
    client_address = getattr(websocket, 'remote_address', 'Unknown')
    logger.info(f"New WebSocket client connected: {client_address}")
    
    # Add new client to the connected set
    connected_clients.add(websocket)
    try:
        # Keep the connection open and wait for the client to close it
        # We don't expect messages from the client in this dashboard use case,
        # but we iterate to maintain the connection state.
        async for message in websocket:
            pass
    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        logger.error(f"WebSocket client error: {e}")
    finally:
        # Clean up the client on disconnect
        connected_clients.remove(websocket)
        logger.info(f"WebSocket client disconnected: {client_address}")


async def broadcast_worker():
    """
    Continuously reads from the data_queue and broadcasts to all connected WS clients.
    """
    logger.info("Started WebSocket broadcast worker")
    while True:
        try:
            # Wait asynchronously for the next parsed payload from the BLE callback
            payload = await data_queue.get()
            
            # If no clients are connected, just drop the data and continue
            if not connected_clients:
                continue
            
            # Serialize the dictionary to a JSON string payload
            message = json.dumps(payload)
            
            # Broadcast to all currently connected clients
            # (websockets.broadcast is optimized for concurrent fan-out)
            websockets.broadcast(connected_clients, message)
            
            # Notify the queue that the task is done (optional queue management)
            data_queue.task_done()
            
        except Exception as e:
            logger.error(f"Error broadcasting message: {e}", exc_info=True)


def hr_measurement_callback(sender: int, data: bytearray):
    """
    Callback function triggered for every notification from the HR characteristic.
    
    Parses the GATT specification for Heart Rate Measurement:
    - Byte 0: Flags
    - Bit 0: HR Format (0 = 8-bit, 1 = 16-bit)
    - Bit 1-2: Sensor Contact Status
    - Bit 3: Energy Expended Status
    - Bit 4: RR-Interval Status (1 = Present)
    """
    global last_valid_rr
    try:
        flags = data[0]
        
        # Bit 0 determines the BPM format (UINT8 vs UINT16)
        hr_format_16bit = (flags & 0x01) != 0
        
        # Bit 4 determines if RR intervals are present
        rr_intervals_present = (flags & 0x10) != 0
        
        offset = 1
        
        # Extract BPM
        if hr_format_16bit:
            bpm = data[offset] | (data[offset+1] << 8)
            offset += 2
        else:
            bpm = int(data[offset])
            offset += 1
            
        # Optional: Energy Expended (Bit 3)
        # If present, it occupies the next 2 bytes. We skip them to reach RR intervals.
        energy_expended_present = (flags & 0x08) != 0
        if energy_expended_present:
            offset += 2
            
        # Extract RR intervals (if Bit 4 is set)
        rr_intervals_ms: List[int] = []
        if rr_intervals_present:
            # The remaining bytes are RR intervals, each is 2 bytes (UINT16)
            # The unit per GATT spec is 1/1024 seconds
            while offset + 2 <= len(data):
                rr_raw = data[offset] | (data[offset+1] << 8)
                
                # Convert from 1/1024s to milliseconds (ms) as integer
                # mathematically: (rr_raw / 1024) * 1000 = (rr_raw * 1000) // 1024
                rr_ms = (rr_raw * 1000) // 1024
                
                if is_valid_rr(rr_ms, last_valid_rr):
                    rr_intervals_ms.append(rr_ms)
                    rr_buffer.append(rr_ms)
                    last_valid_rr = rr_ms
                else:
                    rr_val = rr_ms
                    logger.warning(f"Artifact rejected: {rr_val} ms")
                    
                offset += 2
                
        # Generate absolute Unix timestamp in milliseconds
        timestamp_ms = int(time.time() * 1000)
        
        # Construct JSON payload
        payload = {
            "timestamp": timestamp_ms,
            "bpm": bpm,
            "rr_intervals": rr_intervals_ms,
            "rmssd": current_rmssd
        }
        
        # Log parsed data to terminal for visual debugging
        logger.info(f"Broadcasting Payload: {payload}")
        
        # Push to the asyncio Queue
        # put_nowait is thread-safe for the asyncio event loop here because
        # bleak callbacks typically run in the same asyncio event loop.
        data_queue.put_nowait(payload)
        
    except Exception as e:
        logger.error(f"Error parsing BLE data: {e}", exc_info=True)


async def find_polar_device() -> Optional[str]:
    """
    Scans for BLE devices and returns the MAC address of the first device 
    advertising the Heart Rate Service or containing 'Polar' / 'H9' in its name.
    """
    logger.info("Scanning for Polar/Heart Rate devices...")
    try:
        # return_adv=True returns a dict: {address: (BLEDevice, AdvertisementData)}
        devices_dict = await BleakScanner.discover(timeout=5.0, return_adv=True)
        
        for address, (device, adv_data) in devices_dict.items():
            # Check by service UUIDs in advertisement data
            if adv_data.service_uuids and HR_SERVICE_UUID in adv_data.service_uuids:
                name_to_check = device.name or adv_data.local_name or "Unknown"
                logger.info(f"Found device via UUID: {name_to_check} [{address}]")
                return address
            
            # Fallback text search just in case UUIDs are hidden
            name_to_check = device.name or adv_data.local_name or ""
            if "Polar" in name_to_check or "H9" in name_to_check or "H10" in name_to_check:
                logger.info(f"Found device via Name: {name_to_check} [{address}]")
                return address
    except Exception as e:
        logger.error(f"Error during BLE scanning: {e}")
        
    return None


def handle_disconnect(client: BleakClient):
    """
    Callback triggered by BleakClient if it disconnects outside our control.
    """
    logger.warning(f"Device disconnected from callback: {client.address}")


async def ble_client_loop():
    """
    Manages the BLE connection, including automatic reconnection on disconnect/BleakError.
    If the script loses connection, it will not crash, but infinitely try to reconnect.
    """
    target_address = None
    
    while True: # Main auto-reconnect loop
        try:
            # Phase 1: Scan if we don't know the address yet
            if not target_address:
                target_address = await find_polar_device()
                if not target_address:
                    logger.warning("No Polar device found. Retrying in 5 seconds...")
                    await asyncio.sleep(5)
                    continue
                    
            logger.info(f"Attempting connection to {target_address}...")
            
            # Phase 2: Connect to the device
            async with BleakClient(target_address, disconnected_callback=handle_disconnect) as client:
                logger.info(f"Connected to {target_address}!")
                
                # Verify that the expected service exists
                # In more recent bleak versions, 'services' is a property once connected.
                hr_service = client.services.get_service(HR_SERVICE_UUID)
                if not hr_service:
                    logger.error("Device connected, but does not offer the expected Heart Rate Service.")
                    target_address = None # force rescan, maybe wrong device
                    continue
                    
                # Phase 3: Subscribe to the Characteristic
                await client.start_notify(HR_MEASUREMENT_CHAR_UUID, hr_measurement_callback)
                logger.info("Successfully subscribed to Heart Rate Measurement stream.")
                
                # Keep the loop alive while connected
                while client.is_connected:
                    await asyncio.sleep(1)
                    
                logger.warning("Device is not connected anymore (exited inner loop).")
                
        except BleakError as e:
            # Log BleakErrors gracefully instead of crashing
            logger.error(f"BLE BleakError occurred: {e}")
        except asyncio.TimeoutError:
            logger.error("BLE connection attempt timed out.")
        except Exception as e:
            logger.error(f"Unexpected error in BLE loop: {e}", exc_info=True)
            
        # Reconnection cooldown
        logger.info("Reconnecting in 3 seconds...")
        await asyncio.sleep(3)


async def main():
    """
    Main entrypoint: orchestrates the WebSocket server, the broadcasting task, and BLE.
    """
    logger.info("Initializing Raspberry Pi Edge Computing Backend...")
    
    # 1. Start WebSocket server (0.0.0.0 binds to all network interfaces on the Pi)
    logger.info(f"Starting WebSocket server on ws://{WS_HOST}:{WS_PORT}")
    ws_server = await websockets.serve(ws_handler, WS_HOST, WS_PORT)
    
    # 2. Start WebSocket broadcast worker task
    broadcast_task = asyncio.create_task(broadcast_worker())
    
    # 3. Start periodic RMSSD calculator task
    rmssd_task = asyncio.create_task(rmssd_worker())
    
    # 4. Start BLE auto-reconnect loop
    ble_task = asyncio.create_task(ble_client_loop())
    
    # Run indefinitely until user aborts
    await asyncio.gather(
        ws_server.wait_closed(),
        broadcast_task,
        rmssd_task,
        ble_task
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Process manually interrupted by user. Shutting down gracefully...")
