"""Render the PNG icons from www/icons/icon.svg with Playwright (Chromium). Run once; PNGs are committed."""
import asyncio, pathlib
from playwright.async_api import async_playwright

root = pathlib.Path(__file__).resolve().parent.parent
svg = (root / "www/icons/icon.svg").read_text()
FULL = "<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>" + svg
# maskable: content scaled into the central safe zone on a full-bleed background
MASK = ("<style>html,body{margin:0;background:#2457a6}svg{display:block;width:100vw;height:100vh}</style>"
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#2457a6"/>'
        '<g transform="translate(51 51) scale(.8)">' + svg.split("</rect>")[0].split(">", 1)[1].replace('<rect width="512" height="512" rx="112" fill="#2457a6"/>', "") + "</g></svg>")
FG = ('<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>'
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(86 86) scale(.66)">'
      + svg.replace('<rect width="512" height="512" rx="112" fill="#2457a6"/>', "").split('viewBox="0 0 512 512">')[1].replace("</svg>", "") + "</g></svg>")
BG = '<style>html,body{margin:0;background:#2457a6}</style>'

async def shot(page, html, size, out, transparent=False):
    await page.set_viewport_size({"width": size, "height": size})
    await page.set_content(html)
    await page.screenshot(path=str(root / out), omit_background=transparent)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page()
        for size, name in ((180, "icon-180"), (192, "icon-192"), (512, "icon-512")):
            await shot(page, FULL, size, f"www/icons/{name}.png", transparent=True)
        await shot(page, MASK, 512, "www/icons/icon-maskable-512.png")
        await shot(page, FULL, 1024, "assets/icon-only.png", transparent=True)
        await shot(page, FG, 1024, "assets/icon-foreground.png", transparent=True)
        await shot(page, BG, 1024, "assets/icon-background.png")
        await b.close()
asyncio.run(main())
