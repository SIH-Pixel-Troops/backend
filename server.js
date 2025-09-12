// =====================
// Import Dependencies
// =====================
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const geolib = require("geolib");
const crypto = require("crypto");
require("dotenv").config(); // <-- To securely load env vars

const geoFences = require("./geofences");
const { Web3 } = require("web3");

// =====================
// Blockchain Setup
// =====================
const web3 = new Web3(process.env.ALCHEMY_RPC); // e.g., "https://polygon-mumbai.g.alchemy.com/v2/your-key"

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

// Load private key for signing
const account = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
web3.eth.accounts.wallet.add(account);
web3.eth.defaultAccount = account.address;

console.log("Current Wallet Address:", account.address);


const app = express();
app.use(bodyParser.json());
app.use(cors());

// =====================
// Root Route
// =====================
app.get("/", (req, res) => {
  console.log("Health check received");
  res.send("SafarSuraksha Backend is now running");
});

// =====================
// Geo-fencing API
// =====================
app.post("/api/location", (req, res) => {
  const { touristId, latitude, longitude } = req.body;

  console.log(`Location update from ${touristId}:`, { latitude, longitude });

  if (!touristId || latitude === undefined || longitude === undefined) {
    console.warn("Missing touristId or coordinates in /api/location");
    return res.status(400).json({ error: "Missing touristId or coordinates" });
  }

  let alerts = [];

  geoFences.forEach((zone) => {
    const inside = geolib.isPointWithinRadius(
      { latitude, longitude },
      zone.center,
      zone.radius
    );

    if (inside) {
      console.log(`${touristId} entered zone: ${zone.name}`);
      alerts.push({
        zoneId: zone.id,
        zoneName: zone.name,
        message: `Tourist ${touristId} entered ${zone.name}`,
      });
    }
  });

  res.json({
    touristId,
    location: { latitude, longitude },
    alerts,
    safetyScore: alerts.length > 0 ? 50 : 90, // Mock scoring
  });
});

// =====================
// Panic Button API
// =====================
app.post("/api/panic", (req, res) => {
  const { touristId, latitude, longitude } = req.body;

  console.log(`PANIC BUTTON PRESSED:`, req.body);

  if (!touristId || latitude === undefined || longitude === undefined) {
    console.warn("Missing touristId or coordinates in /api/panic");
    return res.status(400).json({ error: "Missing touristId or coordinates" });
  }

  res.json({
    status: "success",
    message: "Panic alert received. Authorities notified (mock).",
    data: { touristId, latitude, longitude },
  });
});

// =====================
// Blockchain ID + QR Generation API
// =====================
app.post("/api/generate-id", async (req, res) => {
  try {
    const { touristId, name, tripStart, tripEnd } = req.body;

    if (!touristId || !name) {
      console.warn("Missing touristId or name in /api/generate-id");
      return res.status(400).json({ error: "Missing touristId or name" });
    }

    // Generate trip hash (off-chain for uniqueness)
    const dataString = `${touristId}|${name}|${tripStart}|${tripEnd}`;
    const tripHash = crypto.createHash("sha256").update(dataString).digest("hex");

    console.log(`Registering tourist ${touristId} on blockchain...`);

    const tx = contract.methods.registerTourist(touristId, name, tripHash);
    const gas = await tx.estimateGas({ from: account.address });

    const receipt = await tx.send({ from: account.address, gas });

    console.log(`Tourist registered! Hashed: ${receipt.transactionHash}`);

    res.json({
      touristId,
      name,
      tripStart,
      tripEnd,
      blockchainProof: tripHash,
      transactionHash: receipt.transactionHash,
      explorerUrl: `https://mumbai.polygonscan.com/tx/${receipt.transactionHash}`, // 👈 Now included
      qrPayload: JSON.stringify({
        touristId,
        name,
        tripStart,
        tripEnd,
        txHash: receipt.transactionHash,
      }),
    });
  } catch (err) {
    console.error("Blockchain Error:", err);
    res.status(500).json({ error: "Blockchain write failed", details: err.message });
  }
});

// =====================
// Start Server
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
