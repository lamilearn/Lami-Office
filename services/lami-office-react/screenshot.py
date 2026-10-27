import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox", "--disable-setuid-sandbox"])
        page = await browser.new_page()
        page.on("console", lambda msg: print(f"console.log: {msg.text}"))
        await page.goto("http://localhost:8090", timeout=10000)
        await page.wait_for_timeout(3000)
        await page.screenshot(path="lami-office.png")
        await browser.close()

asyncio.run(run())
