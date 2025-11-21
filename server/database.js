const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath);

// Initialize Tables
db.serialize(() => {
  // Added attendant_id to track who is chatting with whom
  db.run(`CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT,
    socket_id TEXT,
    status TEXT DEFAULT 'waiting',
    attendant_id TEXT,
    timestamp INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT,
    sender TEXT,
    text TEXT,
    timestamp INTEGER
  )`);
});

const dbOps = {
  addClient: (client) => {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(
        "INSERT OR REPLACE INTO clients (id, name, socket_id, status, attendant_id, timestamp) VALUES (?, ?, ?, ?, ?, ?)"
      );
      stmt.run(
        client.id,
        client.name,
        client.socket_id,
        client.status || "waiting",
        client.attendant_id || null,
        client.timestamp,
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
      stmt.finalize();
    });
  },

  getClient: (id) => {
    return new Promise((resolve, reject) => {
      db.get("SELECT * FROM clients WHERE id = ?", [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  getQueue: () => {
    return new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM clients WHERE status = 'waiting' ORDER BY timestamp ASC",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },

  getAttendantActiveChats: (attendantId) => {
    return new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM clients WHERE status = 'active' AND attendant_id = ? ORDER BY timestamp ASC",
        [attendantId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },

  getClosedChats: () => {
    return new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM clients WHERE status = 'closed' ORDER BY timestamp DESC",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },

  updateClientStatus: (id, status, attendantId = null) => {
    return new Promise((resolve, reject) => {
      let query = "UPDATE clients SET status = ? WHERE id = ?";
      let params = [status, id];

      if (attendantId !== null) {
        query = "UPDATE clients SET status = ?, attendant_id = ? WHERE id = ?";
        params = [status, attendantId, id];
      }

      db.run(query, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  addMessage: (msg) => {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(
        "INSERT INTO messages (chat_id, sender, text, timestamp) VALUES (?, ?, ?, ?)"
      );
      stmt.run(msg.chatId, msg.sender, msg.text, msg.timestamp, function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
      stmt.finalize();
    });
  },

  getMessages: (chatId) => {
    return new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC",
        [chatId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },

  cleanupOldData: () => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    db.run("DELETE FROM clients WHERE timestamp < ?", [oneDayAgo], (err) => {
      if (err) console.error("Error cleaning clients:", err);
      else console.log("Cleaned old clients");
    });
    db.run("DELETE FROM messages WHERE timestamp < ?", [oneDayAgo], (err) => {
      if (err) console.error("Error cleaning messages:", err);
      else console.log("Cleaned old messages");
    });
  },
};

module.exports = dbOps;
