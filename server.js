// =====================
// Import Dependencies
// =====================
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const geolib = require("geolib");
const crypto = require("crypto");
require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");

const geoFences = require("./geofences");
const { Web3 } = require("web3");

// =====================
// Blockchain Setup
// =====================
const web3 = new Web3(process.env.ALCHEMY_RPC);

const contractABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "string", "name": "touristId", "type": "string" },
      { "indexed": false, "internalType": "string", "name": "name", "type": "string" },
      { "indexed": false, "internalType": "string", "name": "tripHash", "type": "string" }
    ],
    "name": "TouristRegistered",
    "type": "event"
  },
  {
    "inputs": [
      { "internalType": "string", "name": "touristId", "type": "string" },
      { "internalType": "string", "name": "name", "type": "string" },
      { "internalType": "string", "name": "tripHash", "type": "string" }
    ],
    "name": "registerTourist",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const contractAddress = process.env.CONTRACT_ADDRESS;
const contract = new web3.eth.Contract(contractABI, contractAddress);

const account = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
web3.eth.accounts.wallet.add(account);
web3.eth.defaultAccount = account.address;

console.log("Wallet Address:", account.address);

// =====================
// App + Server Setup
// =====================
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("connected:", socket.id);
});

app.use(bodyParser.json());
app.use(cors({ origin: "*" }));

// =====================
// Health Check
// =====================
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "SafarSuraksha Backend",
    uptime: process.uptime()
  });
});

// =====================
// Location API
// =====================
app.post("/api/location", (req, res) => {
  try {
    const { touristId, latitude, longitude } = req.body;

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (!touristId || Number.isNaN(lat) || Number.isNaN(lon)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const alerts = [];

    geoFences.forEach((zone) => {
      if (!zone.center || !zone.radius) return;

      const inside = geolib.isPointWithinRadius(
        { latitude: lat, longitude: lon },
        zone.center,
        zone.radius
      );

      if (inside) {
        alerts.push({
          zoneId: zone.id,
          zoneName: zone.name,
          message: `Entered ${zone.name}`
        });
      }
    });

    res.json({
      touristId,
      location: { latitude: lat, longitude: lon },
      alerts,
      safetyScore: alerts.length ? 50 : 90
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =====================
// 🚨 PANIC API (REAL-TIME FIX)
// =====================
app.post("/api/panic", (req, res) => {
  const { touristId, latitude, longitude } = req.body;

  const lat = Number(latitude);
  const lon = Number(longitude);

  if (!touristId || Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({ error: "Invalid panic payload" });
  }

  const alert = {
    id: Date.now(),
    touristId,
    location: {
      latitude: lat,
      longitude: lon,
    },
    severity: "HIGH",
    status: "ACTIVE",
    time: new Date().toISOString(),
  };

  console.log("PANIC ALERT:", alert);

  // 🔥 THIS LINE MAKES DASHBOARD UPDATE
  io.emit("new-alert", alert);

  res.json({
    status: "success",
    message: "Panic alert received",
    data: alert,
  });
});

// =====================
// Blockchain Registration
// =====================
app.post("/api/generate-id", async (req, res) => {
  const { touristId, name, tripStart, tripEnd } = req.body;

  const dataString = `${touristId}|${name}|${tripStart}|${tripEnd}`;
  const tripHash = crypto.createHash("sha256").update(dataString).digest("hex");

  try {
    const tx = contract.methods.registerTourist(touristId, name, tripHash);
    const gas = await tx.estimateGas({ from: account.address });
    const gasPrice = await web3.eth.getGasPrice();

    const nonce = await web3.eth.getTransactionCount(
      account.address,
      "pending"
    );

    const receipt = await tx.send({
      from: account.address,
      gas,
      gasPrice: BigInt(gasPrice) * 5n,
      nonce
    });

    res.json({
      touristId,
      name,
      blockchainProof: tripHash,
      transactionHash: receipt.transactionHash,
      mode: "blockchain"
    });

  } catch (err) {
    console.warn("Blockchain failed", err.message);

    res.json({
      touristId,
      name,
      blockchainProof: tripHash,
      transactionHash: null,
      mode: "fallback"
    });

    const balance = await web3.eth.getBalance(account.address);
    console.log("Wallet balance:", web3.utils.fromWei(balance, "ether"));
  }
});

// =====================
// Start Server (IMPORTANT)
// =====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
