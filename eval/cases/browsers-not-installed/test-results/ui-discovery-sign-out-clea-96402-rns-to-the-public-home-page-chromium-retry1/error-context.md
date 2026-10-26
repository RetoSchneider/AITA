# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui\discovery.spec.ts >> sign-out clears the session and returns to the public home page
- Location: tests\ui\discovery.spec.ts:3:1

# Error details

```
Error: browserType.launch: Executable doesn't exist at /workspace/seatwise/.missing-browsers/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe
╔════════════════════════════════════════════════════════════╗
║ Looks like Playwright was just installed or updated.       ║
║ Please run the following command to download new browsers: ║
║                                                            ║
║     npx playwright install                                 ║
║                                                            ║
║ <3 Playwright Team                                         ║
╚════════════════════════════════════════════════════════════╝
```