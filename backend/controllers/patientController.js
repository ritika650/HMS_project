const pool = require("../config/db");

// GET all patients
const getAllPatients = async (req, res) => {
    try {
        const { search } = req.query;

        let sql = `
            SELECT *
            FROM patients
            WHERE is_active = TRUE
        `;

        const params = [];

        if (search) {
            sql += `
                AND (
                    full_name LIKE ?
                    OR phone LIKE ?
                    OR email LIKE ?
                )
            `;

            const searchValue = `%${search}%`;

            params.push(
                searchValue,
                searchValue,
                searchValue
            );
        }

        sql += `
            ORDER BY patient_id DESC
        `;

        const [patients] = await pool.query(sql, params);

        res.json({
            count: patients.length,
            patients: patients
        });

    } catch (error) {
        console.error("Get patients error:", error);

        res.status(500).json({
            message: "Failed to fetch patients"
        });
    }
};


// GET one patient
const getPatientById = async (req, res) => {
    try {
        const { id } = req.params;

        const [patients] = await pool.query(
            `SELECT *
             FROM patients
             WHERE patient_id = ?
             AND is_active = TRUE`,
            [id]
        );

        if (patients.length === 0) {
            return res.status(404).json({
                message: "Patient not found"
            });
        }

        res.json(patients[0]);

    } catch (error) {
        console.error("Get patient error:", error);

        res.status(500).json({
            message: "Failed to fetch patient"
        });
    }
};


// CREATE patient
const createPatient = async (req, res) => {
    try {
        const {
            full_name,
            dob,
            gender,
            blood_group,
            phone,
            email,
            address,
            emergency_contact
        } = req.body;

        if (!full_name || !dob || !gender || !phone) {
            return res.status(400).json({
                message: "Full name, date of birth, gender and phone are required"
            });
        }

        const [result] = await pool.query(
            `INSERT INTO patients
            (
                full_name,
                dob,
                gender,
                blood_group,
                phone,
                email,
                address,
                emergency_contact
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                full_name,
                dob,
                gender,
                blood_group || null,
                phone,
                email || null,
                address || null,
                emergency_contact || null
            ]
        );

        const [newPatient] = await pool.query(
            `SELECT *
             FROM patients
             WHERE patient_id = ?`,
            [result.insertId]
        );

        res.status(201).json({
            message: "Patient created successfully",
            patient: newPatient[0]
        });

    } catch (error) {
        console.error("Create patient error:", error);

        res.status(500).json({
            message: "Failed to create patient"
        });
    }
};


// UPDATE patient
const updatePatient = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            full_name,
            dob,
            gender,
            blood_group,
            phone,
            email,
            address,
            emergency_contact
        } = req.body;

        if (!full_name || !dob || !gender || !phone) {
            return res.status(400).json({
                message: "Full name, date of birth, gender and phone are required"
            });
        }

        const [result] = await pool.query(
            `UPDATE patients
             SET
                full_name = ?,
                dob = ?,
                gender = ?,
                blood_group = ?,
                phone = ?,
                email = ?,
                address = ?,
                emergency_contact = ?
             WHERE patient_id = ?
             AND is_active = TRUE`,
            [
                full_name,
                dob,
                gender,
                blood_group || null,
                phone,
                email || null,
                address || null,
                emergency_contact || null,
                id
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Patient not found"
            });
        }

        const [updatedPatient] = await pool.query(
            `SELECT *
             FROM patients
             WHERE patient_id = ?`,
            [id]
        );

        res.json({
            message: "Patient updated successfully",
            patient: updatedPatient[0]
        });

    } catch (error) {
        console.error("Update patient error:", error);

        res.status(500).json({
            message: "Failed to update patient"
        });
    }
};


// DEACTIVATE patient
const deactivatePatient = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await pool.query(
            `UPDATE patients
             SET is_active = FALSE
             WHERE patient_id = ?
             AND is_active = TRUE`,
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Patient not found or already inactive"
            });
        }

        res.json({
            message: "Patient deactivated successfully"
        });

    } catch (error) {
        console.error("Deactivate patient error:", error);

        res.status(500).json({
            message: "Failed to deactivate patient"
        });
    }
};


module.exports = {
    getAllPatients,
    getPatientById,
    createPatient,
    updatePatient,
    deactivatePatient
};