const bcrypt = require("bcryptjs");
const pool = require("./config/db");

async function createDoctor() {
    try {
        const username = "doctor";
        const password = "doctor123";

        const passwordHash = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            `INSERT INTO users
            (username, password_hash, role, is_active)
            VALUES (?, ?, ?, TRUE)`,
            [username, passwordHash, "Doctor"]
        );

        console.log("Doctor user created successfully!");
        console.log("User ID:", result.insertId);
        console.log("Username:", username);
        console.log("Password:", password);

    } catch (error) {
        console.error("Error creating doctor:", error);
    } finally {
        await pool.end();
    }
}

createDoctor();