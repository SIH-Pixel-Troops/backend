const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const geolib = require("geolib");
const geoFences = require("./geofences");

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Root test route
app.get("/", (req, res) => {
  res.send("🚀 Tourist Safety Backend is running");
});

// Geo-fencing: Location API
app.post("/api/location", (req, res) => {
  const { touristId, latitude, longitude } = req.body;

  if (!touristId || !latitude || !longitude) {
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

// Panic Button API
app.post("/api/panic", (req, res) => {
  const { touristId, latitude, longitude } = req.body;

  if (!touristId || !latitude || !longitude) {
    return res.status(400).json({ error: "Missing touristId or coordinates" });
  }

  console.log(`🚨 PANIC ALERT: ${touristId} at [${latitude}, ${longitude}]`);

  res.json({
    status: "success",
    message: "🚨 Panic alert received. Authorities notified (mock).",
    data: { touristId, latitude, longitude },
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
