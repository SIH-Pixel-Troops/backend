const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const geolib = require("geolib");
const crypto = require("crypto");
const geoFences = require("./geofences");

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Root route
app.get("/", (req, res) => {
  console.log("✅ Health check received");
  res.send("🚀 Tourist Safety Backend is running");
});

// =====================
// Geo-fencing: Location API
// =====================
app.post("/api/location", (req, res) => {
  const { touristId, latitude, longitude } = req.body;

  console.log(`📍 Location update from ${touristId}:`, { latitude, longitude });

  if (!touristId || latitude === undefined || longitude === undefined) {
    console.warn("⚠️ Missing touristId or coordinates in /api/location");
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
      console.log(`🚨 ${touristId} entered zone: ${zone.name}`);
      alerts.push({
        zoneId: zone.id,
        zoneName: zone.name,
        message: `⚠️ Tourist ${touristId} entered ${zone.name}`,
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

  console.log(`🚨 PANIC BUTTON PRESSED:`, req.body);

  if (!touristId || latitude === undefined || longitude === undefined) {
    console.warn("⚠️ Missing touristId or coordinates in /api/panic");
    return res.status(400).json({ error: "Missing touristId or coordinates" });
  }

  res.json({
    status: "success",
    message: "🚨 Panic alert received. Authorities notified (mock).",
    data: { touristId, latitude, longitude },
  });
});

// =====================
// Blockchain ID + QR Generation API
// =====================
app.post("/api/generate-id", (req, res) => {
  const { touristId, name, tripStart, tripEnd } = req.body;

  if (!touristId || !name) {
    console.warn("⚠️ Missing touristId or name in /api/generate-id");
    return res.status(400).json({ error: "Missing touristId or name" });
  }

  const dataString = `${touristId}|${name}|${tripStart}|${tripEnd}`;
  const hash = crypto.createHash("sha256").update(dataString).digest("hex");

  console.log(`🔗 Generated blockchain proof for ${touristId}: ${hash}`);

  res.json({
    touristId,
    name,
    tripStart,
    tripEnd,
    blockchainProof: hash,
    qrPayload: JSON.stringify({
      touristId,
      name,
      tripStart,
      tripEnd,
      txHash: hash,
    }),
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
