#!/bin/bash

# Ensure we're in the right directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=========================================="
echo "Starting Stress Simulation System"
echo "=========================================="

echo "[1/2] Starting Python backend..."
if [ -d "venv" ]; then
    ./venv/bin/python main.py &
else
    python3 main.py &
fi
BACKEND_PID=$!

echo "[2/2] Starting Next.js frontend..."
cd dashboard
npm run dev &
FRONTEND_PID=$!

# Handle shutdown gracefully
cleanup() {
    echo ""
    echo "=========================================="
    echo "Shutting down servers..."
    
    # Kill background processes
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    
    # Wait for processes to actually stop
    wait $BACKEND_PID 2>/dev/null
    wait $FRONTEND_PID 2>/dev/null
    
    echo "Servers stopped. Goodbye!"
    echo "=========================================="
    exit 0
}

# Catch Ctrl+C and termination signals
trap cleanup SIGINT SIGTERM

echo "=========================================="
echo "✅ Backend running on ws://localhost:8765"
echo "✅ Frontend running on http://localhost:3000"
echo "Press Ctrl+C to stop both servers gracefully."
echo "=========================================="

# Keep the script running to wait for signals
wait
