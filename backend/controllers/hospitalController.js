const pool = require("../config/db");
const bcrypt = require("bcryptjs");

const roles = {
    clinical: ["Admin", "Doctor", "Receptionist"],
    admin: ["Admin"],
    pharmacy: ["Admin", "Pharmacist"],
    laboratory: ["Admin", "Doctor", "Lab Technician"],
    billing: ["Admin", "Receptionist"]
};

const VALID_APPOINTMENT_STATUSES = ["Scheduled", "Completed", "Cancelled", "No Show"];
const VALID_BED_STATUSES = ["Available", "Occupied", "Maintenance"];
const VALID_LAB_STATUSES = ["Pending", "Completed"];

const isPositiveNumber = value => Number.isFinite(Number(value)) && Number(value) > 0;
const isNonNegativeNumber = value => Number.isFinite(Number(value)) && Number(value) >= 0;

const list = (table, id, columns, searchColumns = []) => async (req, res) => {
    try {
        const search = (req.query.search || "").trim();
        const params = [];
        let sql = `SELECT ${columns} FROM ${table}`;

        if (search && searchColumns.length) {
            sql += ` WHERE ${searchColumns.map(column => `${column} LIKE ?`).join(" OR ")}`;
            searchColumns.forEach(() => params.push(`%${search}%`));
        }

        sql += ` ORDER BY ${id} DESC`;
        const [rows] = await pool.query(sql, params);
        res.json({ count: rows.length, [table]: rows });
    } catch (error) {
        console.error(`List ${table} error:`, error);
        res.status(500).json({ message: `Failed to fetch ${table}` });
    }
};

const getById = (table, id, columns = "*") => async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT ${columns} FROM ${table} WHERE ${id} = ?`, [req.params.id]);
        if (!rows.length) return res.status(404).json({ message: `${table} record not found` });
        res.json(rows[0]);
    } catch (error) {
        console.error(`Get ${table} error:`, error);
        res.status(500).json({ message: `Failed to fetch ${table} record` });
    }
};

const doctorList = async (req, res) => {
    try {
        const search = (req.query.search || "").trim();
        const params = [];
        let sql = `
            SELECT d.*, dep.name AS department_name, u.username
            FROM doctors d
            LEFT JOIN departments dep ON dep.department_id = d.department_id
            LEFT JOIN users u ON u.user_id = d.user_id
            WHERE d.is_active = TRUE
        `;
        if (search) {
            sql += " AND (d.full_name LIKE ? OR d.specialization LIKE ? OR d.phone LIKE ? OR dep.name LIKE ? OR u.username LIKE ?)";
            params.push(...Array(5).fill(`%${search}%`));
        }
        sql += " ORDER BY d.doctor_id DESC";
        const [doctors] = await pool.query(sql, params);
        res.json({ count: doctors.length, doctors });
    } catch (error) {
        console.error("List doctors error:", error);
        res.status(500).json({ message: "Failed to fetch doctors" });
    }
};

const createDoctor = async (req, res) => {
    const { username, password, full_name, specialization, phone, email, department_id } = req.body;
    if (!username?.trim() || !password || !full_name?.trim() || !department_id) {
        return res.status(400).json({ message: "Username, password, full name and department are required" });
    }
    if (password.length < 6) return res.status(400).json({ message: "Password must contain at least 6 characters" });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [departments] = await connection.query(
            "SELECT department_id FROM departments WHERE department_id = ?",
            [department_id]
        );
        if (!departments.length) {
            await connection.rollback();
            return res.status(400).json({ message: "Department not found" });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const [userResult] = await connection.query(
            "INSERT INTO users (username, password_hash, role, is_active) VALUES (?, ?, 'Doctor', TRUE)",
            [username.trim(), passwordHash]
        );
        const [doctorResult] = await connection.query(
            `INSERT INTO doctors
            (user_id, department_id, full_name, specialization, phone, email, is_active)
            VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
            [userResult.insertId, department_id, full_name.trim(), specialization || null, phone || null, email || null]
        );

        await connection.commit();
        res.status(201).json({ message: "Doctor created successfully", doctor_id: doctorResult.insertId, username: username.trim() });
    } catch (error) {
        await connection.rollback();
        console.error("Create doctor error:", error);
        res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
            message: error.code === "ER_DUP_ENTRY" ? "Username already exists" : "Failed to create doctor"
        });
    } finally {
        connection.release();
    }
};

const updateDoctor = async (req, res) => {
    const { full_name, specialization, phone, email, department_id } = req.body;
    if (!full_name?.trim() || !department_id) return res.status(400).json({ message: "Full name and department are required" });
    try {
        const [result] = await pool.query(
            `UPDATE doctors
             SET full_name = ?, specialization = ?, phone = ?, email = ?, department_id = ?
             WHERE doctor_id = ? AND is_active = TRUE`,
            [full_name.trim(), specialization || null, phone || null, email || null, department_id, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ message: "Doctor not found" });
        res.json({ message: "Doctor updated successfully" });
    } catch (error) {
        console.error("Update doctor error:", error);
        res.status(500).json({ message: "Failed to update doctor" });
    }
};

const deactivateDoctor = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [doctor] = await connection.query(
            "SELECT user_id FROM doctors WHERE doctor_id = ? AND is_active = TRUE FOR UPDATE",
            [req.params.id]
        );
        if (!doctor.length) {
            await connection.rollback();
            return res.status(404).json({ message: "Doctor not found" });
        }
        await connection.query("UPDATE doctors SET is_active = FALSE WHERE doctor_id = ?", [req.params.id]);
        await connection.query("UPDATE users SET is_active = FALSE WHERE user_id = ?", [doctor[0].user_id]);
        await connection.commit();
        res.json({ message: "Doctor deactivated successfully" });
    } catch (error) {
        await connection.rollback();
        console.error("Deactivate doctor error:", error);
        res.status(500).json({ message: "Failed to deactivate doctor" });
    } finally {
        connection.release();
    }
};

const appointmentList = async (req, res) => {
    try {
        const { search, status, date } = req.query;
        const params = [];
        let sql = `
            SELECT a.*, p.full_name AS patient_name, d.full_name AS doctor_name
            FROM appointments a
            JOIN patients p ON p.patient_id = a.patient_id
            JOIN doctors d ON d.doctor_id = a.doctor_id
            WHERE 1 = 1
        `;
        if (search) {
            sql += " AND (p.full_name LIKE ? OR d.full_name LIKE ? OR a.reason LIKE ?)";
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (status) {
            if (!VALID_APPOINTMENT_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid appointment status" });
            sql += " AND a.status = ?";
            params.push(status);
        }
        if (date) {
            sql += " AND a.appointment_date = ?";
            params.push(date);
        }
        sql += " ORDER BY a.appointment_date DESC, a.appointment_time DESC";
        const [appointments] = await pool.query(sql, params);
        res.json({ count: appointments.length, appointments });
    } catch (error) {
        console.error("List appointments error:", error);
        res.status(500).json({ message: "Failed to fetch appointments" });
    }
};

const createAppointment = async (req, res) => {
    const { patient_id, doctor_id, appointment_date, appointment_time, reason } = req.body;
    if (!patient_id || !doctor_id || !appointment_date || !appointment_time) {
        return res.status(400).json({ message: "Patient, doctor, date and time are required" });
    }
    try {
        const [[patient], [doctor]] = await Promise.all([
            pool.query("SELECT patient_id FROM patients WHERE patient_id = ? AND is_active = TRUE", [patient_id]),
            pool.query("SELECT doctor_id FROM doctors WHERE doctor_id = ? AND is_active = TRUE", [doctor_id])
        ]);
        if (!patient.length) return res.status(400).json({ message: "Patient not found or inactive" });
        if (!doctor.length) return res.status(400).json({ message: "Doctor not found or inactive" });

        const [result] = await pool.query(
            `INSERT INTO appointments
            (patient_id, doctor_id, appointment_date, appointment_time, reason, status)
            VALUES (?, ?, ?, ?, ?, 'Scheduled')`,
            [patient_id, doctor_id, appointment_date, appointment_time, reason || null]
        );
        res.status(201).json({ message: "Appointment created successfully", appointment_id: result.insertId });
    } catch (error) {
        console.error("Create appointment error:", error);
        res.status(500).json({ message: "Failed to create appointment" });
    }
};

const updateAppointment = async (req, res) => {
    const { status, appointment_date, appointment_time, reason } = req.body;
    if (status !== undefined && !VALID_APPOINTMENT_STATUSES.includes(status)) {
        return res.status(400).json({ message: "Invalid appointment status" });
    }
    try {
        const [result] = await pool.query(
            `UPDATE appointments SET
                status = COALESCE(?, status),
                appointment_date = COALESCE(?, appointment_date),
                appointment_time = COALESCE(?, appointment_time),
                reason = COALESCE(?, reason)
             WHERE appointment_id = ?`,
            [status ?? null, appointment_date || null, appointment_time || null, reason ?? null, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ message: "Appointment not found" });
        res.json({ message: "Appointment updated successfully" });
    } catch (error) {
        console.error("Update appointment error:", error);
        res.status(500).json({ message: "Failed to update appointment" });
    }
};

const createConsultation = async (req, res) => {
    const { appointment_id, patient_id, doctor_id, consultation_date, diagnosis, notes } = req.body;
    if (!patient_id || !doctor_id || !diagnosis?.trim()) {
        return res.status(400).json({ message: "Patient, doctor and diagnosis are required" });
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        if (appointment_id) {
            const [appointments] = await connection.query(
                "SELECT patient_id, doctor_id, status FROM appointments WHERE appointment_id = ? FOR UPDATE",
                [appointment_id]
            );
            if (!appointments.length) {
                await connection.rollback();
                return res.status(400).json({ message: "Appointment not found" });
            }
            if (Number(appointments[0].patient_id) !== Number(patient_id) || Number(appointments[0].doctor_id) !== Number(doctor_id)) {
                await connection.rollback();
                return res.status(400).json({ message: "Consultation patient/doctor must match the appointment" });
            }
        }

        const [result] = await connection.query(
            `INSERT INTO consultations
            (appointment_id, patient_id, doctor_id, consultation_date, diagnosis, notes)
            VALUES (?, ?, ?, COALESCE(?, CURRENT_DATE), ?, ?)`,
            [appointment_id || null, patient_id, doctor_id, consultation_date || null, diagnosis.trim(), notes || null]
        );
        if (appointment_id) {
            await connection.query("UPDATE appointments SET status = 'Completed' WHERE appointment_id = ?", [appointment_id]);
        }

        await connection.commit();
        res.status(201).json({ message: "Consultation created successfully", consultation_id: result.insertId });
    } catch (error) {
        await connection.rollback();
        console.error("Create consultation error:", error);
        res.status(500).json({ message: "Failed to create consultation" });
    } finally {
        connection.release();
    }
};

const updateConsultation = async (req, res) => {
    const { diagnosis, notes, consultation_date } = req.body;
    if (!diagnosis?.trim()) return res.status(400).json({ message: "Diagnosis is required" });
    try {
        const [result] = await pool.query(
            "UPDATE consultations SET diagnosis = ?, notes = ?, consultation_date = COALESCE(?, consultation_date) WHERE consultation_id = ?",
            [diagnosis.trim(), notes || null, consultation_date || null, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ message: "Consultation not found" });
        res.json({ message: "Consultation updated successfully" });
    } catch (error) {
        console.error("Update consultation error:", error);
        res.status(500).json({ message: "Failed to update consultation" });
    }
};

const medicalRecordsByPatient = async (req, res) => {
    try {
        const [records] = await pool.query(
            `SELECT mr.*, p.full_name AS patient_name, d.full_name AS doctor_name
             FROM medical_records mr
             JOIN patients p ON p.patient_id = mr.patient_id
             JOIN doctors d ON d.doctor_id = mr.doctor_id
             WHERE mr.patient_id = ?
             ORDER BY mr.visit_date DESC, mr.record_id DESC`,
            [req.params.patientId]
        );
        res.json({ count: records.length, records });
    } catch (error) {
        console.error("Medical history error:", error);
        res.status(500).json({ message: "Failed to fetch medical history" });
    }
};

const createMedicalRecord = async (req, res) => {
    const { patient_id, doctor_id, consultation_id, visit_date, notes, vital_signs } = req.body;
    if (!patient_id || !doctor_id) return res.status(400).json({ message: "Patient and doctor are required" });
    try {
        const [result] = await pool.query(
            `INSERT INTO medical_records
            (patient_id, doctor_id, consultation_id, visit_date, notes, vital_signs)
            VALUES (?, ?, ?, COALESCE(?, CURRENT_DATE), ?, ?)`,
            [patient_id, doctor_id, consultation_id || null, visit_date || null, notes || null, vital_signs || null]
        );
        res.status(201).json({ message: "Medical record created successfully", record_id: result.insertId });
    } catch (error) {
        console.error("Create medical record error:", error);
        res.status(500).json({ message: "Failed to create medical record" });
    }
};

const updateMedicalRecord = async (req, res) => {
    const { visit_date, notes, vital_signs, consultation_id } = req.body;
    try {
        const [result] = await pool.query(
            `UPDATE medical_records SET
                visit_date = COALESCE(?, visit_date),
                notes = ?,
                vital_signs = ?,
                consultation_id = ?
             WHERE record_id = ?`,
            [visit_date || null, notes || null, vital_signs || null, consultation_id || null, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ message: "Medical record not found" });
        res.json({ message: "Medical record updated successfully" });
    } catch (error) {
        console.error("Update medical record error:", error);
        res.status(500).json({ message: "Failed to update medical record" });
    }
};

const prescriptionList = async (req, res) => {
    try {
        const [prescriptions] = await pool.query(
            `SELECT pr.*, p.full_name AS patient_name, d.full_name AS doctor_name
             FROM prescriptions pr
             JOIN patients p ON p.patient_id = pr.patient_id
             JOIN doctors d ON d.doctor_id = pr.doctor_id
             ORDER BY pr.prescription_id DESC`
        );
        res.json({ count: prescriptions.length, prescriptions });
    } catch (error) {
        console.error("List prescriptions error:", error);
        res.status(500).json({ message: "Failed to fetch prescriptions" });
    }
};

const prescriptionById = async (req, res) => {
    try {
        const [prescriptions] = await pool.query(
            `SELECT pr.*, p.full_name AS patient_name, d.full_name AS doctor_name
             FROM prescriptions pr
             JOIN patients p ON p.patient_id = pr.patient_id
             JOIN doctors d ON d.doctor_id = pr.doctor_id
             WHERE pr.prescription_id = ?`,
            [req.params.id]
        );
        if (!prescriptions.length) return res.status(404).json({ message: "Prescription not found" });

        const [items] = await pool.query(
            `SELECT pi.*, m.name AS medicine_name, m.generic_name
             FROM prescription_items pi
             JOIN medicines m ON m.medicine_id = pi.medicine_id
             WHERE pi.prescription_id = ?
             ORDER BY pi.item_id`,
            [req.params.id]
        );
        res.json({ ...prescriptions[0], items });
    } catch (error) {
        console.error("Prescription detail error:", error);
        res.status(500).json({ message: "Failed to fetch prescription" });
    }
};

const createPrescription = async (req, res) => {
    const { patient_id, doctor_id, consultation_id, diagnosis, notes, items } = req.body;
    if (!patient_id || !doctor_id || !Array.isArray(items) || !items.length) {
        return res.status(400).json({ message: "Patient, doctor and at least one medicine are required" });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [result] = await connection.query(
            `INSERT INTO prescriptions
            (patient_id, doctor_id, consultation_id, prescription_date, diagnosis, notes)
            VALUES (?, ?, ?, CURRENT_DATE, ?, ?)`,
            [patient_id, doctor_id, consultation_id || null, diagnosis || null, notes || null]
        );

        for (const item of items) {
            if (!item.medicine_id || !isPositiveNumber(item.quantity)) {
                throw Object.assign(new Error("Each prescription item needs a medicine and positive quantity"), { statusCode: 400 });
            }
            await connection.query(
                `INSERT INTO prescription_items
                (prescription_id, medicine_id, dosage, frequency, duration, quantity, instructions)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [result.insertId, item.medicine_id, item.dosage || null, item.frequency || null, item.duration || null, Number(item.quantity), item.instructions || null]
            );
        }

        await connection.commit();
        res.status(201).json({ message: "Prescription created successfully", prescription_id: result.insertId });
    } catch (error) {
        await connection.rollback();
        console.error("Create prescription error:", error);
        res.status(error.statusCode || (error.code === "ER_NO_REFERENCED_ROW_2" ? 400 : 500)).json({
            message: error.statusCode ? error.message : "Failed to create prescription"
        });
    } finally {
        connection.release();
    }
};

const createMedicine = async (req, res) => {
    const { name, generic_name, manufacturer, category, unit_price } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Medicine name is required" });
    if (unit_price !== undefined && !isNonNegativeNumber(unit_price)) return res.status(400).json({ message: "Unit price must be zero or greater" });
    try {
        const [result] = await pool.query(
            "INSERT INTO medicines (name, generic_name, manufacturer, category, unit_price, is_active) VALUES (?, ?, ?, ?, ?, TRUE)",
            [name.trim(), generic_name || null, manufacturer || null, category || null, unit_price ?? 0]
        );
        res.status(201).json({ message: "Medicine created successfully", medicine_id: result.insertId });
    } catch (error) {
        console.error("Create medicine error:", error);
        res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({ message: error.code === "ER_DUP_ENTRY" ? "Medicine already exists" : "Failed to create medicine" });
    }
};

const updateMedicine = async (req, res) => {
    const { name, generic_name, manufacturer, category, unit_price, is_active } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Medicine name is required" });
    if (unit_price !== undefined && !isNonNegativeNumber(unit_price)) return res.status(400).json({ message: "Unit price must be zero or greater" });
    try {
        const [result] = await pool.query(
            `UPDATE medicines SET name = ?, generic_name = ?, manufacturer = ?, category = ?, unit_price = ?, is_active = COALESCE(?, is_active)
             WHERE medicine_id = ?`,
            [name.trim(), generic_name || null, manufacturer || null, category || null, unit_price ?? 0, is_active === undefined ? null : Boolean(is_active), req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ message: "Medicine not found" });
        res.json({ message: "Medicine updated successfully" });
    } catch (error) {
        console.error("Update medicine error:", error);
        res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({ message: error.code === "ER_DUP_ENTRY" ? "Medicine name already exists" : "Failed to update medicine" });
    }
};

const deactivateMedicine = async (req, res) => {
    try {
        const [result] = await pool.query("UPDATE medicines SET is_active = FALSE WHERE medicine_id = ? AND is_active = TRUE", [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ message: "Medicine not found or already inactive" });
        res.json({ message: "Medicine deactivated successfully" });
    } catch (error) {
        console.error("Deactivate medicine error:", error);
        res.status(500).json({ message: "Failed to deactivate medicine" });
    }
};

const listBatches = async (req, res) => {
    try {
        const [batches] = await pool.query(
            `SELECT mb.*, m.name AS medicine_name
             FROM medicine_batches mb
             JOIN medicines m ON m.medicine_id = mb.medicine_id
             ORDER BY mb.batch_id DESC`
        );
        res.json({ count: batches.length, medicine_batches: batches });
    } catch (error) {
        console.error("List inventory error:", error);
        res.status(500).json({ message: "Failed to fetch inventory" });
    }
};

const createBatch = async (req, res) => {
    const { medicine_id, batch_number, manufacture_date, expiry_date, quantity, unit_price } = req.body;
    if (!medicine_id || !batch_number?.trim() || !expiry_date) return res.status(400).json({ message: "Medicine, batch number and expiry date are required" });
    if (!isNonNegativeNumber(quantity ?? 0) || !isNonNegativeNumber(unit_price ?? 0)) return res.status(400).json({ message: "Quantity and unit price must be zero or greater" });
    if (new Date(expiry_date) < new Date()) return res.status(400).json({ message: "Expiry date cannot be in the past" });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [medicine] = await connection.query("SELECT medicine_id FROM medicines WHERE medicine_id = ? AND is_active = TRUE", [medicine_id]);
        if (!medicine.length) {
            await connection.rollback();
            return res.status(400).json({ message: "Medicine not found or inactive" });
        }
        const [result] = await connection.query(
            `INSERT INTO medicine_batches
            (medicine_id, batch_number, manufacture_date, expiry_date, quantity, unit_price)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [medicine_id, batch_number.trim(), manufacture_date || null, expiry_date, Number(quantity ?? 0), Number(unit_price ?? 0)]
        );
        if (Number(quantity ?? 0) > 0) {
            await connection.query(
                `INSERT INTO medicine_transactions
                (medicine_id, batch_id, transaction_type, quantity, reference_id, remarks)
                VALUES (?, ?, 'Stock In', ?, NULL, 'Opening batch stock')`,
                [medicine_id, result.insertId, Number(quantity)]
            );
        }
        await connection.commit();
        res.status(201).json({ message: "Medicine batch created successfully", batch_id: result.insertId });
    } catch (error) {
        await connection.rollback();
        console.error("Create batch error:", error);
        res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({ message: error.code === "ER_DUP_ENTRY" ? "Batch number already exists" : "Failed to create batch" });
    } finally {
        connection.release();
    }
};

const stockTransaction = async (req, res) => {
    const { medicine_id, batch_id, quantity, transaction_type, reference_id, remarks } = req.body;
    if (!medicine_id || !batch_id || !isPositiveNumber(quantity) || !["Stock In", "Dispensing"].includes(transaction_type)) {
        return res.status(400).json({ message: "Medicine, batch, positive quantity and valid transaction type are required" });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [batches] = await connection.query(
            "SELECT quantity, expiry_date FROM medicine_batches WHERE batch_id = ? AND medicine_id = ? FOR UPDATE",
            [batch_id, medicine_id]
        );
        if (!batches.length) {
            await connection.rollback();
            return res.status(404).json({ message: "Batch not found" });
        }

        if (transaction_type === "Dispensing" && String(batches[0].expiry_date).slice(0, 10) < new Date().toISOString().slice(0, 10)) {
            await connection.rollback();
            return res.status(409).json({ message: "Cannot dispense expired medicine" });
        }

        const currentQuantity = Number(batches[0].quantity);
        const requested = Number(quantity);
        const nextQuantity = transaction_type === "Stock In" ? currentQuantity + requested : currentQuantity - requested;

        if (nextQuantity < 0) {
            await connection.rollback();
            return res.status(409).json({ message: "Insufficient stock" });
        }

        await connection.query("UPDATE medicine_batches SET quantity = ? WHERE batch_id = ?", [nextQuantity, batch_id]);
        const [result] = await connection.query(
            `INSERT INTO medicine_transactions
            (medicine_id, batch_id, transaction_type, quantity, reference_id, remarks)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [medicine_id, batch_id, transaction_type, requested, reference_id || null, remarks || null]
        );
        await connection.commit();
        res.status(201).json({ message: "Stock transaction recorded successfully", transaction_id: result.insertId, remaining_quantity: nextQuantity });
    } catch (error) {
        await connection.rollback();
        console.error("Stock transaction error:", error);
        res.status(500).json({ message: "Failed to record stock transaction" });
    } finally {
        connection.release();
    }
};

const listLabOrders = async (req, res) => {
    try {
        const { search, status } = req.query;
        const params = [];
        let sql = `
            SELECT lo.*, p.full_name AS patient_name, d.full_name AS doctor_name, lt.name AS test_name
            FROM lab_orders lo
            JOIN patients p ON p.patient_id = lo.patient_id
            JOIN doctors d ON d.doctor_id = lo.doctor_id
            JOIN lab_tests lt ON lt.test_id = lo.test_id
            WHERE 1 = 1
        `;
        if (search) {
            sql += " AND (p.full_name LIKE ? OR d.full_name LIKE ? OR lt.name LIKE ?)";
            params.push(...Array(3).fill(`%${search}%`));
        }
        if (status) {
            if (!VALID_LAB_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid lab order status" });
            sql += " AND lo.status = ?";
            params.push(status);
        }
        sql += " ORDER BY lo.order_id DESC";
        const [orders] = await pool.query(sql, params);
        res.json({ count: orders.length, lab_orders: orders });
    } catch (error) {
        console.error("List lab orders error:", error);
        res.status(500).json({ message: "Failed to fetch lab orders" });
    }
};

const createLabOrder = async (req, res) => {
    const { patient_id, doctor_id, test_id, order_date, status, notes } = req.body;
    if (!patient_id || !doctor_id || !test_id) return res.status(400).json({ message: "Patient, doctor and test are required" });
    if (status && !VALID_LAB_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid lab order status" });
    try {
        const [result] = await pool.query(
            `INSERT INTO lab_orders (patient_id, doctor_id, test_id, order_date, status, notes)
             VALUES (?, ?, ?, COALESCE(?, CURRENT_DATE), ?, ?)`,
            [patient_id, doctor_id, test_id, order_date || null, status || "Pending", notes || null]
        );
        res.status(201).json({ message: "Lab order created successfully", order_id: result.insertId });
    } catch (error) {
        console.error("Create lab order error:", error);
        res.status(error.code === "ER_NO_REFERENCED_ROW_2" ? 400 : 500).json({ message: error.code === "ER_NO_REFERENCED_ROW_2" ? "Patient, doctor or test not found" : "Failed to create lab order" });
    }
};

const updateLabOrder = async (req, res) => {
    const { status, notes } = req.body;
    if (status && !VALID_LAB_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid lab order status" });
    try {
        const [result] = await pool.query(
            "UPDATE lab_orders SET status = COALESCE(?, status), notes = COALESCE(?, notes) WHERE order_id = ?",
            [status || null, notes ?? null, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ message: "Lab order not found" });
        res.json({ message: "Lab order updated successfully" });
    } catch (error) {
        console.error("Update lab order error:", error);
        res.status(500).json({ message: "Failed to update lab order" });
    }
};

const createLabResult = async (req, res) => {
    const { order_id, technician_id, result_value, unit, reference_range, result_date, remarks } = req.body;
    if (!order_id || !technician_id || result_value === undefined || result_value === "") {
        return res.status(400).json({ message: "Order, technician and result are required" });
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [orders] = await connection.query("SELECT order_id FROM lab_orders WHERE order_id = ? FOR UPDATE", [order_id]);
        if (!orders.length) {
            await connection.rollback();
            return res.status(404).json({ message: "Lab order not found" });
        }
        const [result] = await connection.query(
            `INSERT INTO lab_results
            (order_id, technician_id, result_value, unit, reference_range, result_date, remarks)
            VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_DATE), ?)`,
            [order_id, technician_id, result_value, unit || null, reference_range || null, result_date || null, remarks || null]
        );
        await connection.query("UPDATE lab_orders SET status = 'Completed' WHERE order_id = ?", [order_id]);
        await connection.commit();
        res.status(201).json({ message: "Lab result recorded successfully", result_id: result.insertId });
    } catch (error) {
        await connection.rollback();
        console.error("Create lab result error:", error);
        res.status(error.code === "ER_NO_REFERENCED_ROW_2" ? 400 : 500).json({ message: error.code === "ER_NO_REFERENCED_ROW_2" ? "Order or technician not found" : "Failed to record lab result" });
    } finally {
        connection.release();
    }
};

const labResultsList = async (req, res) => {
    try {
        const [results] = await pool.query(
            `SELECT lr.*, lo.patient_id, lo.doctor_id, lt.name AS test_name, p.full_name AS patient_name
             FROM lab_results lr
             JOIN lab_orders lo ON lo.order_id = lr.order_id
             JOIN lab_tests lt ON lt.test_id = lo.test_id
             JOIN patients p ON p.patient_id = lo.patient_id
             ORDER BY lr.result_id DESC`
        );
        res.json({ count: results.length, lab_results: results });
    } catch (error) {
        console.error("Lab results error:", error);
        res.status(500).json({ message: "Failed to fetch lab results" });
    }
};

const createSimple = (table, fields, required = []) => async (req, res) => {
    const missing = required.find(field => req.body[field] === undefined || req.body[field] === "");
    if (missing) return res.status(400).json({ message: `${missing} is required` });
    try {
        const values = fields.map(field => req.body[field] === undefined ? null : req.body[field]);
        const [result] = await pool.query(
            `INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`,
            values
        );
        res.status(201).json({ message: `${table} record created successfully`, id: result.insertId });
    } catch (error) {
        console.error(`Create ${table} error:`, error);
        res.status(error.code === "ER_DUP_ENTRY" ? 409 : error.code === "ER_NO_REFERENCED_ROW_2" ? 400 : 500).json({
            message: error.code === "ER_DUP_ENTRY" ? "Duplicate record" : error.code === "ER_NO_REFERENCED_ROW_2" ? "Referenced record not found" : `Failed to create ${table} record`
        });
    }
};

const updateSimple = (table, idColumn, fields) => async (req, res) => {
    try {
        const values = fields.map(field => req.body[field] === undefined ? null : req.body[field]);
        values.push(req.params.id);
        const [result] = await pool.query(
            `UPDATE ${table} SET ${fields.map(field => `${field} = ?`).join(", ")} WHERE ${idColumn} = ?`,
            values
        );
        if (!result.affectedRows) return res.status(404).json({ message: "Record not found" });
        res.json({ message: "Record updated successfully" });
    } catch (error) {
        console.error(`Update ${table} error:`, error);
        res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({ message: error.code === "ER_DUP_ENTRY" ? "Duplicate record" : `Failed to update ${table} record` });
    }
};

const createRoom = createSimple("rooms", ["room_number", "room_type", "floor", "charges_per_day", "status"], ["room_number"]);
const createBed = async (req, res) => {
    const { room_id, bed_number, status } = req.body;
    if (!room_id || !bed_number) return res.status(400).json({ message: "Room and bed number are required" });
    if (status && !VALID_BED_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid bed status" });
    return createSimple("beds", ["room_id", "bed_number", "status"], ["room_id", "bed_number"])(req, res);
};

const updateBed = async (req, res) => {
    const { room_id, bed_number, status } = req.body;
    if (status && !VALID_BED_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid bed status" });
    return updateSimple("beds", "bed_id", ["room_id", "bed_number", "status"])(req, res);
};

const listBeds = async (req, res) => {
    try {
        const { status } = req.query;
        const params = [];
        let sql = `
            SELECT b.*, r.room_number, r.room_type, r.floor
            FROM beds b JOIN rooms r ON r.room_id = b.room_id
        `;
        if (status) {
            if (!VALID_BED_STATUSES.includes(status)) return res.status(400).json({ message: "Invalid bed status" });
            sql += " WHERE b.status = ?";
            params.push(status);
        }
        sql += " ORDER BY b.bed_id DESC";
        const [beds] = await pool.query(sql, params);
        res.json({ count: beds.length, beds });
    } catch (error) {
        console.error("List beds error:", error);
        res.status(500).json({ message: "Failed to fetch beds" });
    }
};

const admitPatient = async (req, res) => {
    const { patient_id, doctor_id, department_id, room_id, bed_id, admission_date, reason } = req.body;
    if (!patient_id || !doctor_id || !department_id || !room_id || !bed_id) {
        return res.status(400).json({ message: "Patient, doctor, department, room and bed are required" });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [beds] = await connection.query(
            "SELECT status FROM beds WHERE bed_id = ? AND room_id = ? FOR UPDATE",
            [bed_id, room_id]
        );
        if (!beds.length) {
            await connection.rollback();
            return res.status(404).json({ message: "Bed not found in the selected room" });
        }
        if (beds[0].status !== "Available") {
            await connection.rollback();
            return res.status(409).json({ message: "Bed is not available" });
        }

        const [existing] = await connection.query(
            "SELECT admission_id FROM admissions WHERE patient_id = ? AND status = 'Admitted' FOR UPDATE",
            [patient_id]
        );
        if (existing.length) {
            await connection.rollback();
            return res.status(409).json({ message: "Patient already has an active admission" });
        }

        const [result] = await connection.query(
            `INSERT INTO admissions
            (patient_id, doctor_id, department_id, room_id, bed_id, admission_date, reason, status)
            VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, 'Admitted')`,
            [patient_id, doctor_id, department_id, room_id, bed_id, admission_date || null, reason || null]
        );
        await connection.query("UPDATE beds SET status = 'Occupied' WHERE bed_id = ?", [bed_id]);

        await connection.commit();
        res.status(201).json({ message: "Patient admitted successfully", admission_id: result.insertId });
    } catch (error) {
        await connection.rollback();
        console.error("Admission error:", error);
        res.status(error.code === "ER_NO_REFERENCED_ROW_2" ? 400 : 500).json({ message: error.code === "ER_NO_REFERENCED_ROW_2" ? "Patient, doctor, department, room or bed not found" : "Failed to admit patient" });
    } finally {
        connection.release();
    }
};

const dischargePatient = async (req, res) => {
    const { diagnosis, discharge_summary, instructions, final_bill_status } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [admissions] = await connection.query(
            "SELECT bed_id FROM admissions WHERE admission_id = ? AND status = 'Admitted' FOR UPDATE",
            [req.params.id]
        );
        if (!admissions.length) {
            await connection.rollback();
            return res.status(404).json({ message: "Active admission not found" });
        }

        await connection.query(
            `INSERT INTO discharges
            (admission_id, discharge_date, diagnosis, discharge_summary, instructions, final_bill_status)
            VALUES (?, NOW(), ?, ?, ?, ?)`,
            [req.params.id, diagnosis || null, discharge_summary || null, instructions || null, final_bill_status || "Pending"]
        );
        await connection.query("UPDATE admissions SET status = 'Discharged' WHERE admission_id = ?", [req.params.id]);
        await connection.query("UPDATE beds SET status = 'Available' WHERE bed_id = ?", [admissions[0].bed_id]);

        await connection.commit();
        res.json({ message: "Patient discharged successfully" });
    } catch (error) {
        await connection.rollback();
        console.error("Discharge error:", error);
        res.status(500).json({ message: "Failed to discharge patient" });
    } finally {
        connection.release();
    }
};

const createBill = async (req, res) => {
    const { patient_id, admission_id, items } = req.body;
    if (!patient_id || !Array.isArray(items) || !items.length) {
        return res.status(400).json({ message: "Patient and bill items are required" });
    }

    const normalized = [];
    let total = 0;
    for (const item of items) {
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unit_price);
        if (!item.service_type || !isPositiveNumber(quantity) || !isNonNegativeNumber(unitPrice)) {
            return res.status(400).json({ message: "Every bill item needs a service type, positive quantity and non-negative unit price" });
        }
        const amount = quantity * unitPrice;
        total += amount;
        normalized.push({ ...item, quantity, unit_price: unitPrice, amount });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        if (admission_id) {
            const [admission] = await connection.query("SELECT admission_id FROM admissions WHERE admission_id = ? AND patient_id = ?", [admission_id, patient_id]);
            if (!admission.length) {
                await connection.rollback();
                return res.status(400).json({ message: "Admission does not belong to the selected patient" });
            }
        }

        const [bill] = await connection.query(
            `INSERT INTO bills
            (patient_id, admission_id, bill_date, total_amount, status, outstanding_amount)
            VALUES (?, ?, CURRENT_DATE, ?, 'Unpaid', ?)`,
            [patient_id, admission_id || null, total, total]
        );

        for (const item of normalized) {
            await connection.query(
                `INSERT INTO bill_items
                (bill_id, service_type, reference_id, description, quantity, unit_price, amount)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [bill.insertId, item.service_type, item.reference_id || null, item.description || null, item.quantity, item.unit_price, item.amount]
            );
        }

        await connection.commit();
        res.status(201).json({ message: "Bill created successfully", bill_id: bill.insertId, total_amount: total, outstanding_amount: total });
    } catch (error) {
        await connection.rollback();
        console.error("Create bill error:", error);
        res.status(500).json({ message: "Failed to create bill" });
    } finally {
        connection.release();
    }
};

const billById = async (req, res) => {
    try {
        const [bills] = await pool.query(
            `SELECT b.*, p.full_name AS patient_name
             FROM bills b JOIN patients p ON p.patient_id = b.patient_id
             WHERE b.bill_id = ?`,
            [req.params.id]
        );
        if (!bills.length) return res.status(404).json({ message: "Bill not found" });
        const [items] = await pool.query("SELECT * FROM bill_items WHERE bill_id = ? ORDER BY item_id", [req.params.id]);
        const [payments] = await pool.query("SELECT * FROM payments WHERE bill_id = ? ORDER BY payment_id DESC", [req.params.id]);
        res.json({ ...bills[0], items, payments });
    } catch (error) {
        console.error("Bill detail error:", error);
        res.status(500).json({ message: "Failed to fetch bill" });
    }
};

const recordPayment = async (req, res) => {
    const { amount, payment_method, reference_no, remarks, payment_date } = req.body;
    if (!isPositiveNumber(amount)) return res.status(400).json({ message: "A positive payment amount is required" });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [bills] = await connection.query("SELECT outstanding_amount FROM bills WHERE bill_id = ? FOR UPDATE", [req.params.id]);
        if (!bills.length) {
            await connection.rollback();
            return res.status(404).json({ message: "Bill not found" });
        }

        const outstanding = Number(bills[0].outstanding_amount);
        const payment = Number(amount);
        if (payment > outstanding) {
            await connection.rollback();
            return res.status(409).json({ message: "Payment cannot exceed outstanding amount" });
        }

        const nextOutstanding = outstanding - payment;
        await connection.query(
            `INSERT INTO payments
            (bill_id, payment_date, amount, payment_method, reference_no, remarks)
            VALUES (?, COALESCE(?, CURRENT_DATE), ?, ?, ?, ?)`,
            [req.params.id, payment_date || null, payment, payment_method || "Cash", reference_no || null, remarks || null]
        );
        await connection.query(
            "UPDATE bills SET outstanding_amount = ?, status = ? WHERE bill_id = ?",
            [nextOutstanding, nextOutstanding === 0 ? "Paid" : "Partially Paid", req.params.id]
        );

        await connection.commit();
        res.status(201).json({ message: "Payment recorded successfully", outstanding_amount: nextOutstanding });
    } catch (error) {
        await connection.rollback();
        console.error("Payment error:", error);
        res.status(500).json({ message: "Failed to record payment" });
    } finally {
        connection.release();
    }
};

const dashboardStats = async (req, res) => {
    try {
        const [[stats]] = await Promise.all([
            pool.query(`
                SELECT
                    (SELECT COUNT(*) FROM patients WHERE is_active = TRUE) AS active_patients,
                    (SELECT COUNT(*) FROM doctors WHERE is_active = TRUE) AS doctors,
                    (SELECT COUNT(*) FROM appointments WHERE appointment_date = CURRENT_DATE) AS todays_appointments,
                    (SELECT COUNT(*) FROM beds WHERE status = 'Available') AS available_beds,
                    (SELECT COUNT(*) FROM lab_orders WHERE status = 'Pending') AS pending_lab_orders,
                    (SELECT COALESCE(SUM(outstanding_amount), 0) FROM bills WHERE outstanding_amount > 0) AS outstanding_bills,
                    (SELECT COUNT(*) FROM medicine_batches WHERE quantity <= 10 AND expiry_date >= CURRENT_DATE) AS stock_alerts
            `)
        ]);

        const [appointments] = await pool.query(`
            SELECT a.appointment_date, a.appointment_time, a.status,
                   p.full_name AS patient_name, d.full_name AS doctor_name
            FROM appointments a
            JOIN patients p ON p.patient_id = a.patient_id
            JOIN doctors d ON d.doctor_id = a.doctor_id
            ORDER BY a.appointment_date DESC, a.appointment_time DESC
            LIMIT 8
        `);

        res.json({ stats, appointments });
    } catch (error) {
        console.error("Dashboard stats error:", error);
        res.status(500).json({ message: "Failed to fetch dashboard statistics" });
    }
};

module.exports = {
    roles,
    doctorList,
    createDoctor,
    updateDoctor,
    deactivateDoctor,
    appointmentList,
    createAppointment,
    updateAppointment,
    createConsultation,
    updateConsultation,
    medicalRecordsByPatient,
    createMedicalRecord,
    updateMedicalRecord,
    prescriptionList,
    prescriptionById,
    createPrescription,
    createMedicine,
    updateMedicine,
    deactivateMedicine,
    listBatches,
    createBatch,
    stockTransaction,
    listLabOrders,
    createLabOrder,
    updateLabOrder,
    createLabResult,
    labResultsList,
    createSimple,
    updateSimple,
    createRoom,
    createBed,
    updateBed,
    listBeds,
    admitPatient,
    dischargePatient,
    createBill,
    billById,
    recordPayment,
    dashboardStats,
    list,
    getById
};