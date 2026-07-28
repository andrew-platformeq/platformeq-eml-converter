# Chrome Web Store listing — paste into Developer Dashboard

Item: [PlatformEQ EML Viewer](https://chromewebstore.google.com/detail/dfhaanhlejilnnkbpabpdffhnecfhoam)  
Package to upload: `platformeq-eml-viewer.zip` (from `npm run package`)  
Version: **0.3.0**

## Short description (manifest / store subtitle)

Private local .eml and Outlook .msg file viewer

## Detailed description

```
PlatformEQ EML Viewer opens .eml and Outlook .msg email files on your computer for reading, including attachments.

WHAT IT DOES
• Open .eml and .msg files via drag-and-drop or file picker
• Read subject, from/to, date, and body
• Preview images and PDF attachments
• Download other attachment types
• Optional: Email to myself — sends the open message (with attachments) only to your signed-in Workspace Gmail address

PRIVACY
• Email content is processed and stored locally on your device while viewing
• Opened emails are cleared when you fully quit Chrome
• Email subject, body, filenames, and attachment content are never sent to PlatformEQ servers
• If you click Email to myself, the message is sent through your Google Workspace Gmail account to that same address only

USAGE ANALYTICS (internal)
• The extension sends usage statistics (e.g. import success, file size range) to an internal PlatformEQ service
• Your work email from Chrome may be included to measure adoption
• No email content is included in analytics

LIMITATIONS
• View only — no reply or forward
• Internal PlatformEQ use
```

## Submit steps

1. Open https://chrome.google.com/webstore/devconsole
2. Select **PlatformEQ EML Viewer**
3. **Package** → Upload new package → choose `platformeq-eml-viewer.zip`
4. **Store listing** → replace detailed description with the text above; update short description if shown
5. Remove any remaining “Outlook .msg files are not supported” wording
6. **Submit for review**
