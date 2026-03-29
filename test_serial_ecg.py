import serial
import time

SERIAL_PORT = "/dev/cu.usbmodem1101"
SERIAL_BAUD = 115200

def test_pico_stream():
    print(f"Versuche Verbindung zu {SERIAL_PORT} mit {SERIAL_BAUD} Baud...")
    try:
        # Timeout schützt davor, dass read() ewig hängt
        ser = serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=1.0)
        ser.dtr = True # WICHTIG: Sagt CircuitPython, dass wir zuhören!
        ser.rts = True
        print("✅ Erfolgreich verbunden! Lese Daten-Stream... (Abbruch mit Ctrl+C)\n")
        
        while True:
            # Eine Zeile lesen
            raw_line = ser.readline()
            
            if not raw_line:
                continue
            
            # Dekodieren z.B. b'512,1024\r\n' -> '512,1024'
            decoded_line = raw_line.decode('utf-8', errors='ignore').strip()
            
            if decoded_line:
                print(f"Empfangen: {decoded_line}")
                
    except serial.SerialException as e:
        print(f"❌ Fehler bei der seriellen Verbindung: {e}")
        print(f"Bitte prüfe, ob der Pico angeschlossen ist und der Port '{SERIAL_PORT}' stimmt.")
    except KeyboardInterrupt:
        print("\n⏹️ Test beendet.")
    finally:
        if 'ser' in locals() and ser.is_open:
            ser.close()

if __name__ == "__main__":
    test_pico_stream()
