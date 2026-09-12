const { io } = require("/Users/vatsalgupta/Developer/backend/node_modules/socket.io-client");
const socket = io("http://localhost:3000");

socket.on("connect", () => console.log("client connected:", socket.id));
socket.on("new-alert", (alert) => {
  console.log("RECEIVED new-alert:", JSON.stringify(alert));
  process.exit(0);
});

setTimeout(() => { console.log("TIMEOUT - no alert received"); process.exit(1); }, 5000);
