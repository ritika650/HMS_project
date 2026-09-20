const pool = require("../config/db");


// GET all departments
const getAllDepartments = async (req, res) => {
    try {

        const { search } = req.query;

        let sql = `
            SELECT *
            FROM departments
        `;

        const params = [];

        if (search) {

            sql += `
                WHERE name LIKE ?
                OR description LIKE ?
            `;

            const searchValue = `%${search}%`;

            params.push(
                searchValue,
                searchValue
            );
        }

        sql += `
            ORDER BY department_id DESC
        `;

        const [departments] = await pool.query(
            sql,
            params
        );

        res.json({
            count: departments.length,
            departments: departments
        });

    } catch (error) {

        console.error(
            "Get departments error:",
            error
        );

        res.status(500).json({
            message: "Failed to fetch departments"
        });
    }
};


// GET one department
const getDepartmentById = async (req, res) => {
    try {

        const { id } = req.params;

        const [departments] = await pool.query(
            `
            SELECT *
            FROM departments
            WHERE department_id = ?
            `,
            [id]
        );

        if (departments.length === 0) {

            return res.status(404).json({
                message: "Department not found"
            });
        }

        res.json(departments[0]);

    } catch (error) {

        console.error(
            "Get department error:",
            error
        );

        res.status(500).json({
            message: "Failed to fetch department"
        });
    }
};


// CREATE department
const createDepartment = async (req, res) => {
    try {

        const {
            name,
            description
        } = req.body;

        if (!name) {

            return res.status(400).json({
                message: "Department name is required"
            });
        }

        const [result] = await pool.query(
            `
            INSERT INTO departments
            (name, description)
            VALUES (?, ?)
            `,
            [
                name.trim(),
                description || null
            ]
        );

        const [newDepartment] = await pool.query(
            `
            SELECT *
            FROM departments
            WHERE department_id = ?
            `,
            [result.insertId]
        );

        res.status(201).json({
            message: "Department created successfully",
            department: newDepartment[0]
        });

    } catch (error) {

        console.error(
            "Create department error:",
            error
        );

        // Duplicate department name
        if (error.code === "ER_DUP_ENTRY") {

            return res.status(409).json({
                message: "Department name already exists"
            });
        }

        res.status(500).json({
            message: "Failed to create department"
        });
    }
};


// UPDATE department
const updateDepartment = async (req, res) => {
    try {

        const { id } = req.params;

        const {
            name,
            description
        } = req.body;

        if (!name) {

            return res.status(400).json({
                message: "Department name is required"
            });
        }

        const [result] = await pool.query(
            `
            UPDATE departments
            SET
                name = ?,
                description = ?
            WHERE department_id = ?
            `,
            [
                name.trim(),
                description || null,
                id
            ]
        );

        if (result.affectedRows === 0) {

            return res.status(404).json({
                message: "Department not found"
            });
        }

        const [updatedDepartment] = await pool.query(
            `
            SELECT *
            FROM departments
            WHERE department_id = ?
            `,
            [id]
        );

        res.json({
            message: "Department updated successfully",
            department: updatedDepartment[0]
        });

    } catch (error) {

        console.error(
            "Update department error:",
            error
        );

        if (error.code === "ER_DUP_ENTRY") {

            return res.status(409).json({
                message: "Department name already exists"
            });
        }

        res.status(500).json({
            message: "Failed to update department"
        });
    }
};


// DELETE department
const deleteDepartment = async (req, res) => {
    try {

        const { id } = req.params;

        // Check whether doctors belong to this department
        const [doctors] = await pool.query(
            `
            SELECT COUNT(*) AS doctor_count
            FROM doctors
            WHERE department_id = ?
            `,
            [id]
        );

        if (doctors[0].doctor_count > 0) {

            return res.status(409).json({
                message:
                    "Cannot delete department because doctors are assigned to it."
            });
        }

        const [result] = await pool.query(
            `
            DELETE FROM departments
            WHERE department_id = ?
            `,
            [id]
        );

        if (result.affectedRows === 0) {

            return res.status(404).json({
                message: "Department not found"
            });
        }

        res.json({
            message: "Department deleted successfully"
        });

    } catch (error) {

        console.error(
            "Delete department error:",
            error
        );

        res.status(500).json({
            message: "Failed to delete department"
        });
    }
};


module.exports = {
    getAllDepartments,
    getDepartmentById,
    createDepartment,
    updateDepartment,
    deleteDepartment
};