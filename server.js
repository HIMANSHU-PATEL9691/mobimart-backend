const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const storeRoutes = require("./routes/storeRoutes");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const allowedOrigins = process.env.BACKEND_CORS_ORIGIN 
  ? process.env.BACKEND_CORS_ORIGIN.split(",").map(o => o.trim()) 
  : ["http://localhost:5173"];

const corsOptions = {
  origin: true, // Allow all origins in development
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api", storeRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use((err, req, res, next) => {
  console.error(err);

  if (err.name === "ValidationError" && err.errors) {
    const messages = Object.values(err.errors).map((error) => error.message).join("; ");
    return res.status(400).json({ message: messages || "Validation failed", errors: err.errors });
  }

  res.status(500).json({ message: "Internal server error" });
});

const mongoUrl = process.env.MONGODB_URI;
if (!mongoUrl) {
  console.error("Missing MONGODB_URI in backend/.env");
  process.exit(1);
}

mongoose
  .connect(mongoUrl)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`Backend server is running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  });
