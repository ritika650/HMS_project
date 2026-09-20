const pool = require("./config/db");

async function checkUsers() {
    try {
        const [info] = await pool.query(`
            SELECT
                DATABASE() AS database_name,
                @@hostname AS hostname,
                @@port AS port,
                @@version AS version
        `);

        console.log("Node is connected to:");
        console.table(info);

        const [users] = await pool.query(
            "SELECT user_id, username, role, is_active FROM users"
        );

        console.log("Users found by Node:");
        console.table(users);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await pool.end();
    }
}

checkUsers();