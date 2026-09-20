const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const patientRoutes = require("./routes/patientRoutes");
const departmentRoutes = require("./routes/departmentRoutes");
const hospitalRoutes = require("./routes/hospitalRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api", hospitalRoutes);

app.get("/", (req, res) => {
    res.json({
        message: "Hospital Management System API is running"
    });
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        message: "Backend server is healthy"
    });
});

app.get("/api/db-test", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT 1 AS result");

        res.json({
            status: "OK",
            database: "Connected",
            result: rows[0].result
        });
    } catch (error) {
        console.error("Database connection error:", error);

        res.status(500).json({
            status: "ERROR",
            message: "Database connection failed"
        });
    }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});