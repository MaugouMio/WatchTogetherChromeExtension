## How to start a server
1. Install python 3.8+.
2. Modify `settings.txt` and set the IP and Port to which you want to open the server.
3. Run `WatchTogetherServer.py` with python.
4. Seeing the message `Server started at ...` means you have started the server successfully.

## How to install the Chrome Extension
1. Open the extension page in a chromium browser.
2. Enable the `Developer mode` toggle.
3. Click `Load Unpacked` to select the extension
4. Select `Watch Together Extension` folder which contains `mainifest.json` file.
5. Click the `Watch Together` extension and it will start a new tab.
6. Enter `IP:Port` and your nickname to join the server.

## Notice
- This extension will affect your Youtube account watch history, you may pause your watch history in Youtube settings or run this extension in [incognito mode](https://support.google.com/chrome/a/answer/13130396).
- You may call a shell script on specific events, for more details please check `config_template.json`.
