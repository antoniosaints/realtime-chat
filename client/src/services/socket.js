import { io } from "socket.io-client";
import { reactive } from "vue";

export const state = reactive({
  connected: false,
});

// "undefined" means the URL will be computed from the `window.location` object
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";

export const socket = io(SERVER_URL, {
  autoConnect: false,
  auth: (cb) => {
    const token = localStorage.getItem("authToken");
    cb({ token });
  },
});

socket.on("connect", () => {
  state.connected = true;
});

socket.on("disconnect", () => {
  state.connected = false;
});
