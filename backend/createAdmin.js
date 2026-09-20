const bcrypt = require("bcryptjs");
const pool = require("./config/db");

async function createAdmin() {
    try {
        const username = "admin";
        const password = "admin123";

        const passwordHash = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            `INSERT INTO users
            (username, password_hash, role, is_active)
            VALUES (?, ?, ?, TRUE)`,
            [username, passwordHash, "Admin"]
        );

        console.log("Admin user created successfully!");
        console.log("User ID:", result.insertId);
        console.log("Username:", username);
        console.log("Password:", password);

    } catch (error) {
        console.error("Error creating admin:", error);
    } finally {
        await pool.end();
    }
}

createAdmin();