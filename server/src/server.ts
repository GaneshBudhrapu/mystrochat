import { createServer } from "http";
import { Server, Socket } from "socket.io";

const PORT = process.env.PORT || 3000;

type Mode = "chat" | "audio" | "video";
type MessagePayload = string | { kind?: "text" | "image" | "gif"; content?: string; };

// --- TIC TAC TOE TYPES ---
type TicTacToeCell = "X" | "O" | null;
type TicTacToeStatus = "waiting" | "playing" | "finished";
type TicTacToeGame = {
  id: string;
  players: [string, string?];
  names: Record<string, string>;
  symbols: Record<string, "X" | "O">;
  board: TicTacToeCell[];
  turn: "X" | "O";
  status: TicTacToeStatus;
  winner: "X" | "O" | "draw" | null;
};

// --- DRAWING GUESS TYPES ---
type DrawingGame = {
  id: string;
  players: string[];
  drawerId: string;
  word: string;
  status: "waiting" | "playing" | "finished";
  winner: string | null;
};

const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: "*" } });

httpServer.listen(PORT, () => console.log("Server running on port", PORT));

// --- GLOBAL STATE ---
const waitingQueues: Record<Mode, Socket[]> = { chat: [], audio: [], video: [] };
const reports = new Map<string, Array<{ reporterId: string; reporterName: string; reason: string; createdAt: string; }>>();

const ticTacToeGames = new Map<string, TicTacToeGame>();
let waitingTicTacToe: Socket | null = null;

const drawingGames = new Map<string, DrawingGame>();
let waitingDrawing: Socket | null = null;

let onlineUsers = 0;

// --- CONSTANTS & HELPERS ---
const names = ["Pikachu", "Charizard", "Bulbasaur", "Squirtle", "Eevee", "Snorlax", "Gengar", "Lucario", "Greninja", "Mewtwo", "Dragonite", "Blaziken"];
const abusiveWords = ["abuse", "badword", "bastard", "bitch", "damn", "fuck", "idiot", "moron", "stupid", "shit"];

// 🎨 MASSIVELY EXPANDED WORD LIST
const drawingWords = [
  "sword", "pirate", "demon", "dragon", "cake", "laptop", "ninja", "pizza", "mountain", "robot", "ocean", "guitar",
  "elephant", "telephone", "spaceship", "castle", "bridge", "volcano", "glasses", "penguin", "bicycle", "umbrella", 
  "giraffe", "hamburger", "spider", "camera", "snowman", "mermaid", "vampire", "zombie", "alien", "basketball", 
  "rainbow", "helicopter", "butterfly", "crocodile", "dinosaur", "kangaroo", "submarine", "tornado", "waterfall", 
  "windmill", "pyramid", "compass", "telescope", "hospital", "strawberry", "mosquito", "octopus", "parachute"
];

function getRandomName() { return names[Math.floor(Math.random() * names.length)]; }
function getRandomWord() { return drawingWords[Math.floor(Math.random() * drawingWords.length)]; }
function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function filterProfanity(text: string) {
  let filtered = text;
  let changed = false;
  for (const word of abusiveWords) {
    const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
    filtered = filtered.replace(pattern, (match) => {
      changed = true;
      return "*".repeat(Math.max(match.length, 3));
    });
  }
  return { filtered, changed };
}

function filterMessagePayload(payload: MessagePayload) {
  if (typeof payload === "string") {
    const result = filterProfanity(payload);
    return { payload: result.filtered, changed: result.changed };
  }
  if (payload.kind === "text" && typeof payload.content === "string") {
    const result = filterProfanity(payload.content);
    return { payload: { ...payload, content: result.filtered }, changed: result.changed };
  }
  return { payload, changed: false };
}

function removeFromQueues(socket: Socket) {
  for (const mode of Object.keys(waitingQueues) as Mode[]) {
    waitingQueues[mode] = waitingQueues[mode].filter((s) => s !== socket);
  }
}

function leaveCurrentMatch(socket: Socket) {
  removeFromQueues(socket);
  const partner = socket.data.partner as Socket | null | undefined;
  if (partner) {
    partner.emit("partner disconnected");
    partner.data.partner = null;
    socket.data.partner = null;
  }
}

function getBlockedUsers(socket: Socket) { return socket.data.blockedUsers as Set<string>; }
function usersCanMatch(first: Socket, second: Socket) {
  return !getBlockedUsers(first).has(second.data.userId) && !getBlockedUsers(second).has(first.data.userId);
}

function findPartner(socket: Socket, mode: Mode) {
  const queue = waitingQueues[mode];
  for (let i = 0; i < queue.length; i++) {
    const candidate = queue[i];
    if (!candidate.connected || candidate === socket || candidate.data.partner) {
      queue.splice(i, 1);
      i--;
      continue;
    }
    if (!usersCanMatch(socket, candidate)) continue;
    queue.splice(i, 1);
    return candidate;
  }
  return null;
}

// --- GAME SPECIFIC HELPERS ---

// TicTacToe
function serializeTicTacToe(game: TicTacToeGame) {
  return {
    id: game.id, board: game.board, turn: game.turn, status: game.status, winner: game.winner,
    players: game.players.filter((id): id is string => Boolean(id)).map((id) => ({ id, name: game.names[id], symbol: game.symbols[id] })),
  };
}
function getTicTacToeWinner(board: TicTacToeCell[]) {
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(Boolean) ? "draw" : null;
}
function leaveTicTacToe(socket: Socket) {
  if (waitingTicTacToe === socket) waitingTicTacToe = null;
  const gameId = socket.data.ticTacToeGameId as string | undefined;
  if (!gameId) return;
  const game = ticTacToeGames.get(gameId);
  socket.leave(gameId);
  socket.data.ticTacToeGameId = null;
  if (!game) return;
  const opponentId = game.players.find((id) => id && id !== socket.id);
  ticTacToeGames.delete(gameId);
  if (opponentId) {
    io.to(opponentId).emit("tictactoe-ended", "Opponent left the game.");
    const opSocket = io.sockets.sockets.get(opponentId);
    if (opSocket) { opSocket.leave(gameId); opSocket.data.ticTacToeGameId = null; }
  }
}

// Drawing Guess
function leaveDrawing(socket: Socket) {
  if (waitingDrawing === socket) waitingDrawing = null;
  const gameId = socket.data.drawingGameId;
  if (!gameId) return;
  const game = drawingGames.get(gameId);
  socket.leave(gameId);
  socket.data.drawingGameId = null;
  if (game) {
    const opponentId = game.players.find(id => id !== socket.id);
    drawingGames.delete(gameId);
    if (opponentId) {
      io.to(opponentId).emit("drawing-ended", { message: "Opponent left the game." });
      const opSocket = io.sockets.sockets.get(opponentId);
      if (opSocket) opSocket.data.drawingGameId = null;
    }
  }
}

// --- MIDDLEWARE ---
function applyModerationMiddleware(socket: Socket) {
  socket.use((packet, next) => {
    const [eventName] = packet;
    if (eventName === "message") {
      const result = filterMessagePayload(packet[1] as MessagePayload);
      packet[1] = result.payload;
      if (result.changed) socket.emit("moderation notice", "Abusive words were filtered.");
    }
    if (eventName === "send-global-msg" && typeof packet[1] === "string") {
      const result = filterProfanity(packet[1]);
      packet[1] = result.filtered;
      if (result.changed) socket.emit("moderation notice", "Abusive words were filtered.");
    }
    next();
  });
}

// --- MAIN SOCKET CONNECTION ---
io.on("connection", (socket) => {
  onlineUsers++;
  const username = getRandomName() + "#" + Math.floor(Math.random() * 1000);
  socket.data = { userId: socket.id, username, blockedUsers: new Set<string>(), partner: null };

  applyModerationMiddleware(socket);
  socket.emit("your name", username);
  io.emit("online users", onlineUsers);

  // Core Chat / Video Routing
  socket.on("join-mode", (mode: Mode) => {
    leaveTicTacToe(socket);
    leaveDrawing(socket);
    leaveCurrentMatch(socket);
    socket.leave("global_room");

    const partner = findPartner(socket, mode);
    if (partner) {
      socket.data.partner = partner;
      partner.data.partner = socket;
      socket.emit("chat start", partner.data.username);
      partner.emit("chat start", socket.data.username);
      return;
    }
    if (!waitingQueues[mode].includes(socket)) waitingQueues[mode].push(socket);
    socket.emit("waiting");
  });

  socket.on("join-global-room", () => {
    leaveTicTacToe(socket);
    leaveDrawing(socket);
    leaveCurrentMatch(socket);
    socket.join("global_room");
  });

  socket.on("send-global-msg", (msg: string) => io.to("global_room").emit("receive-global-msg", { text: msg, sender: socket.data.username }));
  socket.on("message", (msg: MessagePayload) => socket.data.partner?.emit("message", msg));
  socket.on("typing", () => socket.data.partner?.emit("typing"));
  socket.on("next", () => leaveCurrentMatch(socket));
  socket.on("signal", (data) => socket.data.partner?.emit("signal", data));

  // Moderation
  socket.on("report-user", (reason = "No reason provided") => {
    const partner = socket.data.partner as Socket | null;
    if (!partner) return socket.emit("moderation notice", "No active user to report.");
    const targetId = partner.data.userId as string;
    const targetReports = reports.get(targetId) ?? [];
    targetReports.push({ reporterId: socket.data.userId, reporterName: socket.data.username, reason: String(reason).slice(0, 200), createdAt: new Date().toISOString() });
    reports.set(targetId, targetReports);
    socket.emit("moderation notice", "Report submitted. Thanks for helping keep MystroChat safer.");
  });

  socket.on("block-user", () => {
    const partner = socket.data.partner as Socket | null;
    if (!partner) return socket.emit("moderation notice", "No active user to block.");
    getBlockedUsers(socket).add(partner.data.userId);
    socket.emit("user blocked", partner.data.username);
    leaveCurrentMatch(socket);
  });

  // Tic Tac Toe Events
  socket.on("join-tictactoe", () => {
    leaveCurrentMatch(socket); leaveDrawing(socket); socket.leave("global_room");
    if (waitingTicTacToe && waitingTicTacToe.connected && waitingTicTacToe !== socket) {
      const opponent = waitingTicTacToe;
      waitingTicTacToe = null;
      const gameId = `tictactoe:${opponent.id}:${socket.id}:${Date.now()}`;
      const game: TicTacToeGame = {
        id: gameId, players: [opponent.id, socket.id], board: Array(9).fill(null), turn: "X", status: "playing", winner: null,
        names: { [opponent.id]: opponent.data.username, [socket.id]: socket.data.username },
        symbols: { [opponent.id]: "X", [socket.id]: "O" }
      };
      ticTacToeGames.set(gameId, game);
      opponent.data.ticTacToeGameId = gameId; socket.data.ticTacToeGameId = gameId;
      opponent.join(gameId); socket.join(gameId);
      io.to(gameId).emit("tictactoe-state", serializeTicTacToe(game));
      return;
    }
    waitingTicTacToe = socket;
    socket.emit("tictactoe-waiting");
  });

  socket.on("tictactoe-move", (cellIndex: number) => {
    const gameId = socket.data.ticTacToeGameId;
    if (!gameId) return;
    const game = ticTacToeGames.get(gameId);
    if (!game || game.status !== "playing") return;
    const symbol = game.symbols[socket.id];
    if (!symbol || game.turn !== symbol || game.board[cellIndex]) return;

    game.board[cellIndex] = symbol;
    const winner = getTicTacToeWinner(game.board);
    if (winner) { game.winner = winner; game.status = "finished"; } 
    else { game.turn = symbol === "X" ? "O" : "X"; }
    io.to(game.id).emit("tictactoe-state", serializeTicTacToe(game));
  });

  socket.on("tictactoe-restart", () => {
    const gameId = socket.data.ticTacToeGameId;
    const game = gameId ? ticTacToeGames.get(gameId) : null;
    if (!game) return;
    game.board = Array(9).fill(null); game.turn = "X"; game.status = "playing"; game.winner = null;
    io.to(game.id).emit("tictactoe-state", serializeTicTacToe(game));
  });
  socket.on("leave-tictactoe", () => leaveTicTacToe(socket));

  // Drawing Guess Events
  socket.on("join-drawing", () => {
    leaveCurrentMatch(socket); leaveTicTacToe(socket); socket.leave("global_room");
    if (waitingDrawing && waitingDrawing.connected && waitingDrawing !== socket) {
      const opponent = waitingDrawing;
      waitingDrawing = null;
      const gameId = `drawing:${opponent.id}:${socket.id}:${Date.now()}`;
      const drawerId = Math.random() > 0.5 ? opponent.id : socket.id;
      
      const game: DrawingGame = { id: gameId, players: [opponent.id, socket.id], drawerId, word: getRandomWord(), status: "playing", winner: null };
      drawingGames.set(gameId, game);
      opponent.data.drawingGameId = gameId; socket.data.drawingGameId = gameId;
      opponent.join(gameId); socket.join(gameId);
      io.to(gameId).emit("drawing-start", game);
      return;
    }
    waitingDrawing = socket;
    socket.emit("drawing-waiting");
  });

  socket.on("drawing-path", (data) => {
    const gameId = socket.data.drawingGameId;
    if (gameId) socket.to(gameId).emit("drawing-path", data);
  });

  socket.on("drawing-chat", (data) => {
    const gameId = socket.data.drawingGameId;
    if (gameId) socket.to(gameId).emit("drawing-chat", data);
  });

  socket.on("drawing-guess", (guess: string) => {
    const gameId = socket.data.drawingGameId;
    const game = gameId ? drawingGames.get(gameId) : null;
    if (!game || game.status !== "playing") return;

    // 🐛 FIX: Trim hidden spaces and lowercase perfectly
    const sanitizedGuess = guess.trim().toLowerCase();
    const targetWord = game.word.trim().toLowerCase();

    if (sanitizedGuess === targetWord && socket.id !== game.drawerId) {
      game.status = "finished"; game.winner = socket.id;
      io.to(gameId).emit("drawing-ended", { message: `${socket.data.username} guessed it! The word was "${game.word}".`, winner: socket.id, word: game.word });
    } else {
      io.to(gameId).emit("drawing-chat", { sender: socket.data.username, text: guess.trim() });
    }
  });
  socket.on("leave-drawing", () => leaveDrawing(socket));

  // Disconnect Handling
  socket.on("disconnect", () => {
    onlineUsers--;
    io.emit("online users", onlineUsers);
    leaveTicTacToe(socket);
    leaveDrawing(socket);
    leaveCurrentMatch(socket);
  });
});