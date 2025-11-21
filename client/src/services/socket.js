import { io } from "socket.io-client";
import { reactive } from "vue";

export const state = reactive({
  connected: false,
});

// "undefined" means the URL will be computed from the `window.location` object
const URL =
  import.meta.env.MODE === "production"
    ? undefined
    : "http://192.168.6.83:3000";

export const socket = io(URL, {
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
