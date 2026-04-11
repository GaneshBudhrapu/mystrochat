import { createServer } from "http";
import { Server } from "socket.io";

const PORT = process.env.PORT || 3000;

// ✅ Create HTTP server (IMPORTANT FIX)
const httpServer = createServer();

// ✅ Attach socket.io
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

httpServer.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

// 🧠 Store waiting user
let waitingUser: any = null;

// 🧠 Online users count
let onlineUsers = 0;

// 🎮 Pokémon names
const names = [
  "Pikachu", "Charizard", "Bulbasaur", "Squirtle",
  "Eevee", "Snorlax", "Gengar", "Lucario",
  "Greninja", "Mewtwo", "Dragonite", "Blaziken"
];

// 🎲 Random username generator
function getRandomName() {
  return names[Math.floor(Math.random() * names.length)];
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // ✅ Increase online users
  onlineUsers++;

  const username = getRandomName() + "#" + Math.floor(Math.random() * 1000);
  socket.data.username = username;

  socket.emit("your name", username);
  io.emit("online users", onlineUsers);

  // 👥 Matchmaking
  if (waitingUser) {
    socket.data.partner = waitingUser;
    waitingUser.data.partner = socket;

    socket.emit("chat start");
    waitingUser.emit("chat start");

    waitingUser = null;
  } else {
    waitingUser = socket;
    socket.emit("waiting");
  }

  // 💬 Message
  socket.on("message", (msg) => {
    socket.data.partner?.emit("message", msg);
  });

  // ✍️ Typing
  socket.on("typing", () => {
    socket.data.partner?.emit("typing");
  });

  // 🔁 Next user
  socket.on("next", () => {
    if (socket.data.partner) {
      socket.data.partner.emit("partner disconnected");
      socket.data.partner.data.partner = null;
    }

    socket.data.partner = null;

    if (waitingUser && waitingUser !== socket) {
      socket.data.partner = waitingUser;
      waitingUser.data.partner = socket;

      socket.emit("chat start");
      waitingUser.emit("chat start");

      waitingUser = null;
    } else {
      waitingUser = socket;
      socket.emit("waiting");
    }
  });

  // ❌ Disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    onlineUsers--;
    io.emit("online users", onlineUsers);

    if (socket.data.partner) {
      socket.data.partner.emit("partner disconnected");
      socket.data.partner.data.partner = null;
    }

    if (waitingUser === socket) {
      waitingUser = null;
    }
  });
});