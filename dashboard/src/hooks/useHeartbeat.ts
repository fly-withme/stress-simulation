import { useState, useEffect, useRef } from 'react';

export interface RRPoint {
  index: number;
  rr: number;
}

export function useHeartbeat(url: string = 'ws://localhost:8765') {
  const [bpm, setBpm] = useState<number | null>(null);
  const [rrIntervals, setRrIntervals] = useState<RRPoint[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const indexRef = useRef<number>(0);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        console.log('WebSocket connected');
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (typeof data.bpm === 'number') {
            setBpm(data.bpm);
          }

          if (Array.isArray(data.rr_intervals) && data.rr_intervals.length > 0) {
            setRrIntervals((prev) => {
              const newPoints = data.rr_intervals.map((rr: number) => {
                const point = { index: indexRef.current, rr };
                indexRef.current += 1;
                return point;
              });
              
              const combined = [...prev, ...newPoints];
              // Keep rolling window of last 60 data points
              return combined.slice(-60);
            });
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        console.log('WebSocket disconnected. Reconnecting in 2s...');
        // Auto-reconnect
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 2000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close();
      };
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        // Prevent onclose handle from firing and triggering reconnect
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [url]);

  return { bpm, rrIntervals, connected };
}
