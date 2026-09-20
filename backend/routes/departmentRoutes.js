const express = require("express");

const {
    getAllDepartments,
    getDepartmentById,
    createDepartment,
    updateDepartment,
    deleteDepartment
} = require("../controllers/departmentController");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();


// Get all departments
router.get(
    "/",
    authenticateToken,
    authorizeRoles("Admin", "Doctor", "Receptionist"),
    getAllDepartments
);


// Get one department
router.get(
    "/:id",
    authenticateToken,
    authorizeRoles("Admin", "Doctor", "Receptionist"),
    getDepartmentById
);


// Create department
router.post(
    "/",
    authenticateToken,
    authorizeRoles("Admin"),
    createDepartment
);


// Update department
router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("Admin"),
    updateDepartment
);


// Delete department
router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("Admin"),
    deleteDepartment
);


module.exports = router;