const express = require("express");
const { login } = require("../controllers/authController");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/login", login);

router.get("/protected", authenticateToken, (req, res) => {
    res.json({
        message: "You accessed a protected route!",
        user: req.user
    });
});
router.get(
    "/admin-only",
    authenticateToken,
    authorizeRoles("Admin"),
    (req, res) => {
        res.json({
            message: "Welcome Admin! You have access to this route.",
            user: req.user
        });
    }
);

module.exports = router;