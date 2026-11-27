import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox", "--disable-setuid-sandbox"])
        page = await browser.new_page()
        
        # Listen for console logs
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        
        # Listen for unhandled errors
        page.on("pageerror", lambda err: print(f"PAGE ERROR: {err}"))
        
        try:
            print("Navigating to local server...")
            await page.goto("http://localhost:8090", wait_until="networkidle", timeout=10000)
            print("Page loaded successfully.")
            
            # Wait a few seconds for SSE or rendering errors
            await page.wait_for_timeout(3000)
        except Exception as e:
            print(f"Navigation/Load Exception: {e}")
            
        await browser.close()

asyncio.run(main())
