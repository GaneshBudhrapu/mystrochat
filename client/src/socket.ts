import { io } from "socket.io-client";

// Turn off autoConnect so it waits for React!
export const socket = io("https://mystrochat.onrender.com", {
  autoConnect: false
});