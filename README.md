<h1 align="center"><p style="display: inline-flex; align-items: center; gap: 0.25em"><img style="width: 1.5em; height: 1.5em;" src="public/icons/favicon.png">wplacer</p></h1>

<p align="center"><img src="https://img.shields.io/github/package-json/v/luluwaffless/wplacer">
<a href="LICENSE"><img src="https://img.shields.io/github/license/luluwaffless/wplacer"></a>
<a href="https://discord.gg/qbtcWrHJvR"><img src="https://img.shields.io/badge/Support-gray?style=flat&logo=Discord&logoColor=white&logoSize=auto&labelColor=5562ea"></a>
<a href="LEIAME.md"><img src="https://img.shields.io/badge/tradução-português_(brasil)-green"></a>
<a href="LISEZMOI.md"><img src="https://img.shields.io/badge/traduction-français-blue"></a></p>

A massively updated auto-drawing bot for [wplace.live](https://wplace.live/).

## Features ✅

-   **Simple and easy-to-use web UI:** For managing users and templates
-   **Advanced Multi-Account System:** Run templates with multiple users simultaneously. The system intelligently prioritizes users with the most charges available to maximize efficiency.
-   **Multiple Drawing Modes:** Choose from several drawing strategies (Top to Bottom, Bottom to Top, Edges First, Random Color, etc.) to optimize your approach for different templates.
-   **Automatic Upgrade Purchasing:** If enabled, the bot will automatically purchase max charge upgrades or extra charges when running out for your accounts whenever they have enough droplets.
-   **Account Status Checker:** A tool in the "Manage Users" tab allows you to quickly check if your accounts' cookies are still valid.
-   **Advanced Template Controls:** Options such as restarting, replacing a template's image, or pausing on the fly make management more flexible as well as providing you with real time updates on the template's status.
-   **Automatic Captcha (Turnstile) Token Handling:** Turnstile handling lets you babysit the bot much less
-   **Desktop Notifications:** The program will now send a desktop notification when it needs a new Turnstile token, so you don't have to constantly check the console.

## Installation and Usage 💻

[Video Tutorial](https://youtu.be/YR978U84LSY)

### Requirements:
- [Node.js and NPM](https://nodejs.org/en/download)
   - Use LTS Version of Node
   - Download Windows Installer (.msi) with express installation
- [git](https://git-scm.com/downloads)
   - optional but highly recommended for receiving future updates
- Brave browser (recommended) or Google Chrome

Check if you have these installed by opening a terminal and separately entering `git -v` and `node -v`. These should output the version of node/git that you have installed. If any error comes out it means you do not have these correctly installed.
 
### Installation:
#### 1. Start by downloading the code from this repository.
   - If using [git](https://git-scm.com/downloads): find a folder you want to store this in, [navigate there in the terminal](https://johnwargo.com/posts/2024/launch-windows-terminal/) and then run `git clone https://github.com/luluwaffless/wplacer.git`
   - Otherwise, download the ZIP directly from GitHub (not recommended).
#### 2. Install the wplacer extension on your browser.
   - This is not published on the Chrome Web Store so manual installation is needed
   - Open your browser settings, open the "Extensions" menu and then turn on "Enable Developer Mode". This should give you the option to install the wplacer extension. Click on "Load Unpacked", find the folder where you downloaded the code and select the `LOAD_UNPACKED` folder itself (not the folder contents)
   -  This extension is for sending tokens to your local server and automatically solving Turnstiles (CAPTCHAs)
   -  If you are using multiple accounts, do this for every browser profile you have.
#### 3. In the terminal, install the dependencies by running `npm i`.
   - If you'd like, you can change the host and port of the local server by creating a `.env` file.
### Usage:
1. To start the bot, run `npm start` in the terminal.
2. Open the URL printed in the console (usually `http://127.0.0.1/`) in your browser.
3. In each browser window with the extension installed, log into your account on wplace.live. If your account does not show up in the manager after refreshing it, you can press on the extension to manually send it to wplacer.
4. Go to the "Add Template" page to create your drawing templates.
   - The coordinates (`Tile X/Y`, `Pixel X/Y`) are for the top-left corner of your image. You can find these by clicking a pixel on wplace.live and inspecting the `pixel` request in the Network tab of DevTools. You can also use the [Blue Marble](https://github.com/SwingTheVine/Wplace-BlueMarble) userscript (user TamperMonkey) to see a pixel's coordinates.
   - You can assign multiple users to a single template.
5. Finally, go to "Manage Templates" and click "Start" on any template to begin drawing.
   - The script will occasionally refresh one of the active bot windows on [wplace.live](https://wplace.live/). This is required to refresh the Turnstile token needed for painting.

## Notes 📝

> [!CAUTION]
> This bot is not affiliated with [wplace.live](https://wplace.live/) and its use may be against the site's rules. The developers are not responsible for any punishments against your accounts. Use at your own risk.

### To-dos ✅
- [ ] **Add support for paid colors**
- [ ] **Proxy support**
- [ ] **Auto-farm EXP and droplets function for users**
- [x] ~~Support for painting between multiple tiles~~
- [x] ~~Easier multi-account support for one template~~
- [x] ~~Queueing system for multi-accounts~~

### Credits 🙏

-   [luluwaffless](https://github.com/luluwaffless)
-   [Jinx](https://github.com/JinxTheCatto)

And to our amazing contributors!
<p align="center"><img src="https://contrib.rocks/image?repo=luluwaffless/wplacer"></p>

### License 📜

[GNU AGPL v3](LICENSE)




