const express = require("express");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");
const controller = require("../controllers/hospitalController");

const router = express.Router();
const protect = roles => [authenticateToken, authorizeRoles(...roles)];
const route = (method, path, roles, handler) => router[method](path, ...protect(roles), handler);

route("get", "/dashboard", ["Admin"], controller.dashboardStats);

route("get", "/doctors", controller.roles.clinical, controller.doctorList);
route("get", "/doctors/:id", controller.roles.clinical, controller.getById("doctors", "doctor_id"));
route("post", "/doctors", controller.roles.admin, controller.createDoctor);
route("put", "/doctors/:id", controller.roles.admin, controller.updateDoctor);
route("delete", "/doctors/:id", controller.roles.admin, controller.deactivateDoctor);

route("get", "/appointments", controller.roles.clinical, controller.appointmentList);
route("get", "/appointments/:id", controller.roles.clinical, controller.getById("appointments", "appointment_id"));
route("post", "/appointments", ["Admin", "Doctor", "Receptionist"], controller.createAppointment);
route("put", "/appointments/:id", ["Admin", "Doctor", "Receptionist"], controller.updateAppointment);

route("get", "/consultations", ["Admin", "Doctor"], controller.list("consultations", "consultation_id", "*"));
route("get", "/consultations/:id", ["Admin", "Doctor"], controller.getById("consultations", "consultation_id"));
route("post", "/consultations", ["Admin", "Doctor"], controller.createConsultation);
route("put", "/consultations/:id", ["Admin", "Doctor"], controller.updateConsultation);

route("get", "/medical-records", ["Admin", "Doctor"], controller.list("medical_records", "record_id", "*"));
route("get", "/medical-records/patient/:patientId", ["Admin", "Doctor"], controller.medicalRecordsByPatient);
route("get", "/medical-records/:id", ["Admin", "Doctor"], controller.getById("medical_records", "record_id"));
route("post", "/medical-records", ["Admin", "Doctor"], controller.createMedicalRecord);
route("put", "/medical-records/:id", ["Admin", "Doctor"], controller.updateMedicalRecord);

route("get", "/prescriptions", ["Admin", "Doctor", "Pharmacist"], controller.prescriptionList);
route("get", "/prescriptions/:id", ["Admin", "Doctor", "Pharmacist"], controller.prescriptionById);
route("post", "/prescriptions", ["Admin", "Doctor"], controller.createPrescription);

route("get", "/medicines", ["Admin", "Doctor", "Pharmacist"], controller.list("medicines", "medicine_id", "*", ["name", "generic_name", "manufacturer", "category"]));
route("get", "/medicines/:id", ["Admin", "Doctor", "Pharmacist"], controller.getById("medicines", "medicine_id"));
route("post", "/medicines", controller.roles.pharmacy, controller.createMedicine);
route("put", "/medicines/:id", controller.roles.pharmacy, controller.updateMedicine);
route("delete", "/medicines/:id", controller.roles.pharmacy, controller.deactivateMedicine);

route("get", "/inventory", controller.roles.pharmacy, controller.listBatches);
route("post", "/inventory/batches", controller.roles.pharmacy, controller.createBatch);
route("post", "/inventory/transactions", controller.roles.pharmacy, controller.stockTransaction);

route("get", "/lab-tests", ["Admin", "Doctor", "Lab Technician"], controller.list("lab_tests", "test_id", "*", ["name", "category"]));
route("get", "/lab-tests/:id", ["Admin", "Doctor", "Lab Technician"], controller.getById("lab_tests", "test_id"));
route("post", "/lab-tests", controller.roles.admin, controller.createSimple("lab_tests", ["name", "category", "description", "price"], ["name"]));
route("put", "/lab-tests/:id", controller.roles.admin, controller.updateSimple("lab_tests", "test_id", ["name", "category", "description", "price"]));

route("get", "/lab-orders", ["Admin", "Doctor", "Lab Technician"], controller.listLabOrders);
route("post", "/lab-orders", ["Admin", "Doctor"], controller.createLabOrder);
route("put", "/lab-orders/:id", ["Admin", "Lab Technician"], controller.updateLabOrder);
route("get", "/lab-results", ["Admin", "Doctor", "Lab Technician"], controller.labResultsList);
route("post", "/lab-results", ["Admin", "Lab Technician"], controller.createLabResult);

route("get", "/rooms", controller.roles.clinical, controller.list("rooms", "room_id", "*"));
route("get", "/rooms/:id", controller.roles.clinical, controller.getById("rooms", "room_id"));
route("post", "/rooms", controller.roles.admin, controller.createRoom);
route("put", "/rooms/:id", controller.roles.admin, controller.updateSimple("rooms", "room_id", ["room_number", "room_type", "floor", "charges_per_day", "status"]));

route("get", "/beds", controller.roles.clinical, controller.listBeds);
route("get", "/beds/available", controller.roles.clinical, (req,res)=>{ req.query.status="Available"; return controller.listBeds(req,res); });
route("get", "/beds/:id", controller.roles.clinical, controller.getById("beds", "bed_id"));
route("post", "/beds", controller.roles.admin, controller.createBed);
route("put", "/beds/:id", controller.roles.admin, controller.updateBed);

route("get", "/admissions", controller.roles.clinical, controller.list("admissions", "admission_id", "*"));
route("get", "/admissions/:id", controller.roles.clinical, controller.getById("admissions", "admission_id"));
route("post", "/admissions", ["Admin", "Receptionist"], controller.admitPatient);
route("post", "/admissions/:id/discharge", ["Admin", "Receptionist"], controller.dischargePatient);

route("get", "/bills", controller.roles.billing, controller.list("bills", "bill_id", "*"));
route("get", "/bills/:id", controller.roles.billing, controller.billById);
route("post", "/bills", controller.roles.billing, controller.createBill);
route("post", "/bills/:id/payments", controller.roles.billing, controller.recordPayment);
route("get", "/payments", controller.roles.billing, controller.list("payments", "payment_id", "*"));

module.exports = router;
