# ⚡ MystroChat - Multimodal Real-Time Hub

MystroChat is a full-stack, real-time communication platform that supports 1-on-1 anonymous text chatting, a global public chat room, and peer-to-peer Audio and Video calls. 

Built with scalability and modern web architecture in mind, it handles complex WebRTC handshakes, custom socket event routing, and robust state management to prevent ghost connections and hardware locks.

## 🚀 Features

* **💬 1-on-1 Text Chat:** Instantly match with random users for private text conversations.
* **🌍 Global Room:** A public broadcast room where all connected users can interact simultaneously.
* **📞 Audio Calls:** Anonymous voice-only peer-to-peer connections.
* **🎥 Video Calls:** High-fidelity, face-to-face video chatting with hardware lock prevention.
* **⚡ Instant Skip:** Skip to the next user instantly with auto-requeuing logic.
* **🛡️ Firewall Bypassing:** Integrated Google STUN servers to ensure WebRTC connections succeed across strict NATs and Wi-Fi networks.
* **👻 "Anti-Ghost" Socket Cleanup:** Custom lifecycle handlers that immediately sever dead connections when users close tabs or refresh, preventing queue gridlock.

## 🛠️ Tech Stack

**Frontend:**
* React 18 (Vite)
* TypeScript
* PeerJS (WebRTC Wrapper)
* Socket.IO Client
* Custom CSS (Modern Grid UI, Dark Mode)

**Backend:**
* Node.js
* Express
* Socket.IO (Room routing, custom match-making queues)
* HTTP Server

## ⚙️ Local Installation & Setup

If you want to run this project locally, you will need to run both the backend server and the frontend client simultaneously.

### 1. Clone the repository
```bash
git clone [https://github.com/YOUR_USERNAME/mystrochat.git](https://github.com/YOUR_USERNAME/mystrochat.git)
cd mystrochat
