const express = require("express");

const {
    getAllPatients,
    getPatientById,
    createPatient,
    updatePatient,
    deactivatePatient
} = require("../controllers/patientController");

const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();


// View all patients
router.get(
    "/",
    authenticateToken,
    authorizeRoles("Admin", "Doctor", "Receptionist"),
    getAllPatients
);


// View one patient
router.get(
    "/:id",
    authenticateToken,
    authorizeRoles("Admin", "Doctor", "Receptionist"),
    getPatientById
);


// Create patient
router.post(
    "/",
    authenticateToken,
    authorizeRoles("Admin", "Receptionist"),
    createPatient
);


// Update patient
router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("Admin", "Receptionist"),
    updatePatient
);


// Deactivate patient
router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("Admin", "Receptionist"),
    deactivatePatient
);


module.exports = router;