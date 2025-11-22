const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dbOps = require("./database");

const app = express();
app.use(
  cors({
    origin: "*",
  })
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity in this mini-system
    methods: ["GET", "POST"],
  },
});

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure audios directory exists
const audioDir = path.join(__dirname, "audios");
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir);
}

// Ensure images directory exists
const imageDir = path.join(__dirname, "images");
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir);
}

// Configure Multer for Audio
const audioStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, audioDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + ".webm");
  },
});

// Configure Multer for Images
const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, imageDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, uniqueSuffix + ext);
  },
});

const uploadAudio = multer({ storage: audioStorage });
const uploadImage = multer({ storage: imageStorage });

// Serve static files
app.use("/audios", express.static(audioDir));
app.use("/images", express.static(imageDir));

// Upload Audio Endpoint
app.post("/api/upload-audio", uploadAudio.single("audio"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }
  const fileUrl = `/audios/${req.file.filename}`;
  res.json({ url: fileUrl });
});

// Upload Image Endpoint
app.post("/api/upload-image", uploadImage.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }
  const fileUrl = `/images/${req.file.filename}`;
  res.json({ url: fileUrl });
});

// Run cleanup on startup
dbOps.cleanupOldData();
// Run cleanup every hour
setInterval(() => {
  dbOps.cleanupOldData();
}, 60 * 60 * 1000);

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Client joins the queue
  socket.on("join_queue", async (clientName) => {
    const client = {
      id: socket.id,
      name: clientName,
      socket_id: socket.id,
      timestamp: Date.now(),
      status: "waiting",
    };

    try {
      console.log("Adding client to DB:", client);
      await dbOps.addClient(client);
      const queue = await dbOps.getQueue();
      console.log("Current queue:", queue);
      io.emit("queue_update", queue);

      // Find actual position
      const position = queue.findIndex((c) => c.id === socket.id) + 1;
      socket.emit("joined_queue", { position });
    } catch (err) {
      console.error("Error joining queue:", err);
    }
  });

  // Attendant joins
  socket.on("attendant_join", async () => {
    try {
      const queue = await dbOps.getQueue();
      socket.emit("queue_update", queue);

      // Also send active chats for this attendant
      const activeChats = await dbOps.getAttendantActiveChats(socket.id);
      socket.emit("active_chats_update", activeChats);
    } catch (err) {
      console.error("Error fetching queue for attendant:", err);
    }
  });

  // Attendant picks a client
  socket.on("pick_client", async (clientId) => {
    try {
      // Update status and assign attendant
      await dbOps.updateClientStatus(clientId, "active", socket.id);

      // Get client details to send correct name
      const client = await dbOps.getClient(clientId);

      // Notify the specific client
      io.to(clientId).emit("chat_started", {
        attendantId: socket.id,
        chatId: clientId,
        attendant: "Agente",
      });

      // Notify the attendant
      socket.emit("chat_started", {
        chatId: clientId,
        client: client || { name: "Client" },
      });

      // Update queue for everyone
      const queue = await dbOps.getQueue();
      io.emit("queue_update", queue);

      // Update active chats for this attendant
      const activeChats = await dbOps.getAttendantActiveChats(socket.id);
      socket.emit("active_chats_update", activeChats);

      // Load previous messages if any
      const messages = await dbOps.getMessages(clientId);
      socket.emit("chat_history", { chatId: clientId, messages }); // Send chatId so frontend knows where to put them
      io.to(clientId).emit("chat_history", messages);
    } catch (err) {
      console.error("Error picking client:", err);
    }
  });

  // Message handling
  socket.on("send_message", async (data) => {
    const { chatId, text, sender, type, replyTo } = data;

    const msgRecord = {
      chatId: chatId,
      sender: sender,
      text: text,
      type: type || "text",
      timestamp: Date.now(),
      replyTo: replyTo || null,
    };

    try {
      // Save all messages to DB (text, audio, image)
      await dbOps.addMessage(msgRecord);

      if (sender === "client") {
        // Client sent message.
        // We need to find who is the attendant for this client.
        const client = await dbOps.getClient(chatId); // chatId is clientId
        if (client && client.attendant_id) {
          io.to(client.attendant_id).emit("receive_message", msgRecord);
          // Also echo back to client so they see their own message
          io.to(chatId).emit("receive_message", msgRecord);
        } else {
          // Fallback if no attendant assigned yet or lost?
          io.emit("receive_message", msgRecord); // Keep broadcast for safety in this mini-app if attendant_id fails
        }
      } else {
        // Attendant sent message to client (to = clientId)
        io.to(chatId).emit("receive_message", msgRecord);
      }
    } catch (err) {
      console.error("Error saving/sending message:", err);
    }
  });

  socket.on("end_chat", async (clientId) => {
    try {
      await dbOps.updateClientStatus(clientId, "closed");

      // Notify client
      io.to(clientId).emit("chat_ended");

      // Notify attendant (sender)
      socket.emit("chat_ended", { chatId: clientId });

      // Update queue for everyone
      const queue = await dbOps.getQueue();
      io.emit("queue_update", queue);

      // Update active chats for this attendant
      const activeChats = await dbOps.getAttendantActiveChats(socket.id);
      socket.emit("active_chats_update", activeChats);
    } catch (err) {
      console.error("Error ending chat:", err);
    }
  });

  socket.on("get_closed_chats", async () => {
    try {
      const closedChats = await dbOps.getClosedChats();
      socket.emit("closed_chats_list", closedChats);
    } catch (err) {
      console.error("Error fetching closed chats:", err);
    }
  });

  socket.on("fetch_history_messages", async (chatId) => {
    try {
      const messages = await dbOps.getMessages(chatId);
      socket.emit("history_messages_received", { chatId, messages });
    } catch (err) {
      console.error("Error fetching history messages:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    // Optional: Mark client as disconnected in DB or remove from queue if waiting
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
