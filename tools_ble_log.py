import asyncio
from bleak import BleakScanner

async def main():
    def match(device, adv_data):
        name = device.name or adv_data.local_name or ""
        print(f"[{device.address}] {name} - UUIDs: {adv_data.service_uuids}")
        return False
    await BleakScanner.find_device_by_filter(match, timeout=3.0)

asyncio.run(main())
