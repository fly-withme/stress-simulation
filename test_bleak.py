import asyncio
from bleak import BleakScanner
async def main():
    print(hasattr(BleakScanner, "find_device_by_filter"))
asyncio.run(main())
