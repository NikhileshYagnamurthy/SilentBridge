# 🤟 HandSpeak – Gesture Video Call App

A free video call platform for people who can't speak.
Your hand gestures are detected by AI and shown as text to the other person.

---

## 📁 File Structure

```
gesture-call/
├── index.html      ← Main app UI
├── style.css       ← All styling
├── gesture-db.js   ← Saves gestures in browser
├── detector.js     ← MediaPipe AI hand detection
├── call.js         ← WebRTC video call
├── app.js          ← All button/page logic
├── server.js       ← Node.js server for Render
├── package.json    ← Render config
└── README.md
```

---

## 🚀 Deploy on Render (Free, Online)

### Step 1 — Put files on GitHub
1. Create free account: https://github.com
2. Create a new repository (e.g. `handspeak`)
3. Upload ALL files from this folder into that repo

### Step 2 — Deploy on Render
1. Create free account: https://render.com
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Settings:
   - Runtime: **Node**
   - Build Command: *(leave empty)*
   - Start Command: `node server.js`
   - Plan: **Free**
5. Click **Create Web Service**
6. Wait ~2 min → you get a link like `https://handspeak.onrender.com`
7. Share this link with anyone!

---

## 🤚 How to Use

### Step 1 — Train Gestures (FIRST!)
1. Go to **Train Gestures**
2. Type a label: `Hello`, `Yes`, `No`, `Thank you`, `Help`
3. Upload a clear photo of your hand doing that gesture
4. Click **Save** → repeat for each gesture

### Step 2 — Make a Call

**You (gesture user):**
- Go to **Start a Call** → click **Create New Room**
- Copy the 6-letter Room ID → send to other person via WhatsApp
- Wait for them to join → click **🤚 Gestures** to start

**Other person:**
- Open the same website
- Go to **Start a Call** → type the Room ID → click **Join**
- They see your gestures as text on their screen!

---

## ❓ Common Issues

- **Camera denied** → Click camera icon in browser bar → Allow
- **Room not found** → Type exact 6-letter Room ID, same case
- **No gesture detected** → Retrain with clearer photos in good lighting
- **Gesture not sent** → Make sure both people are connected first, then click Gestures ON
