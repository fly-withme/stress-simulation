import serial
import time

SERIAL_PORT = "/dev/cu.usbmodem1101"
SERIAL_BAUD = 115200

def test_sr():
    try:
        ser = serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=1.0)
        ser.dtr = True
        ser.rts = True
        
        start_time = time.time()
        count = 0
        values = []
        while count < 500:
            line = ser.readline()
            if line:
                decoded = line.decode('utf-8', errors='ignore').strip()
                if "Yeda0:" in decoded:
                    count += 1
                    try:
                        val = float(decoded.split("Yeda0:(")[1].split(",")[0])
                        values.append(val)
                    except:
                        pass
        end_time = time.time()
        
        print(f"Received {count} samples in {end_time - start_time:.3f} seconds.")
        if end_time > start_time:
            print(f"Sample rate: {count / (end_time - start_time):.2f} Hz")
            
        print("First 10 values:", values[:10])
        print("Min:", min(values), "Max:", max(values))
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_sr()
