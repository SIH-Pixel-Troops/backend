// =====================
// Import Dependencies
// =====================
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const geolib = require("geolib");
const crypto = require("crypto");
require("dotenv").config();

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
// App Setup
// =====================
const app = express();
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
// Location API (SAFE)
// =====================
app.post("/api/location", (req, res) => {
  try {
    const { touristId, latitude, longitude } = req.body;

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (!touristId || Number.isNaN(lat) || Number.isNaN(lon)) {
      console.warn("Invalid location payload:", req.body);
      return res.status(400).json({
        error: "Invalid or missing coordinates",
        received: req.body
      });
    }

    console.log("Location update:", { touristId, lat, lon });

    const alerts = [];

    geoFences.forEach((zone) => {
      // Defensive geofence validation
      if (
        !zone.center ||
        typeof zone.center.latitude !== "number" ||
        typeof zone.center.longitude !== "number" ||
        typeof zone.radius !== "number"
      ) {
        console.warn("Skipping invalid geofence:", zone);
        return;
      }

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
    console.error("Location API error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =====================
// Panic API (SAFE)
// =====================
app.post("/api/panic", (req, res) => {
  const { touristId, latitude, longitude } = req.body;

  const lat = Number(latitude);
  const lon = Number(longitude);

  if (!touristId || Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({
      error: "Invalid or missing coordinates",
      received: req.body
    });
  }

  console.log("PANIC ALERT:", { touristId, lat, lon });

  res.json({
    status: "success",
    message: "Panic alert received (mock)",
    data: { touristId, latitude: lat, longitude: lon }
  });
});

// =====================
// Blockchain Registration API
// =====================
app.post("/api/generate-id", async (req, res) => {
  try {
    const { touristId, name, tripStart, tripEnd } = req.body;

    if (!touristId || !name) {
      return res.status(400).json({ error: "Missing touristId or name" });
    }

    const dataString = `${touristId}|${name}|${tripStart}|${tripEnd}`;
    const tripHash = crypto.createHash("sha256").update(dataString).digest("hex");

    const tx = contract.methods.registerTourist(touristId, name, tripHash);
    const gas = await tx.estimateGas({ from: account.address });
    const gasPrice = await web3.eth.getGasPrice();

    const receipt = await tx.send({
      from: account.address,
      gas,
      gasPrice: BigInt(gasPrice) * 2n // 🔥 force higher gas
    });
    
    res.json({
      touristId,
      name,
      tripStart,
      tripEnd,
      blockchainProof: tripHash,
      transactionHash: receipt.transactionHash,
      explorerUrl: `https://mumbai.polygonscan.com/tx/${receipt.transactionHash}`
    });
  } catch (err) {
    console.error("Blockchain error:", err);
    res.status(500).json({
      error: "Blockchain write failed",
      details: err.message
    });
  }
});

// =====================
// Global Error Handler
// =====================
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// =====================
// Start Server
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
