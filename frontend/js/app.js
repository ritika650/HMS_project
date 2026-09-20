const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value;

        loginMessage.classList.remove("d-none");
        loginMessage.className = "alert alert-info mt-3";
        loginMessage.textContent = "Logging in...";

        try {
            const response = await fetch(
                "http://localhost:5000/api/auth/login",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        username: username,
                        password: password
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                loginMessage.className = "alert alert-danger mt-3";
                loginMessage.textContent =
                    data.message || "Login failed.";

                return;
            }

            // Save JWT and user information
            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));

            loginMessage.className = "alert alert-success mt-3";
            loginMessage.textContent = "Login successful! Redirecting...";

            // Redirect according to role
            if (data.user.role === "Admin") {
                window.location.href = "admin-dashboard.html";
            } else {
                loginMessage.className = "alert alert-warning mt-3";
                loginMessage.textContent =
                    "Login successful. Dashboard for " +
                    data.user.role +
                    " will be connected later.";
            }

        } catch (error) {
            console.error("Login error:", error);

            loginMessage.className = "alert alert-danger mt-3";
            loginMessage.textContent =
                "Cannot connect to the server. Make sure the backend is running.";
        }
    });
}
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem("token");

    if (!token) {
        throw new Error("No authentication token found.");
    }

    const headers = {
        ...(options.headers || {}),
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
    };

    return fetch(url, {
        ...options,
        headers: headers
    });
}
async function testProtectedRoute() {
    try {
        const response = await fetchWithAuth(
            "http://localhost:5000/api/auth/protected"
        );

        const data = await response.json();

        console.log("Protected API response:", data);

    } catch (error) {
        console.error("Protected API error:", error);
    }
}
function requireLogin(requiredRole = null) {
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");

    if (!token || !userData) {
        window.location.href = "login.html";
        return null;
    }

    const user = JSON.parse(userData);

    if (requiredRole && user.role !== requiredRole) {
        alert("Access denied.");
        window.location.href = "login.html";
        return null;
    }

    return user;
}
function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    window.location.href = "login.html";
}
async function loadPatients(search = "") {
    const tableBody = document.getElementById("patientTableBody");
    const patientCount = document.getElementById("patientCount");

    if (!tableBody || !patientCount) {
        return;
    }

    try {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4">
                    Loading patients...
                </td>
            </tr>
        `;

        let url = "http://localhost:5000/api/patients";

        if (search) {
            url += `?search=${encodeURIComponent(search)}`;
        }

        const response = await fetchWithAuth(url);

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Failed to load patients");
        }

        patientCount.textContent =
            `${data.count} patient(s) found`;

        if (data.patients.length === 0) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="8"
                        class="text-center text-secondary py-4">
                        No patients found.
                    </td>
                </tr>
            `;

            return;
        }

        tableBody.innerHTML = "";

        data.patients.forEach(patient => {

            const row = document.createElement("tr");

            row.innerHTML = `
                <td>${patient.patient_id}</td>

                <td>
                    <strong>${patient.full_name}</strong>
                </td>

                <td>${patient.dob}</td>

                <td>${patient.gender}</td>

                <td>${patient.blood_group || "-"}</td>

                <td>${patient.phone}</td>

                <td>${patient.email || "-"}</td>

                <td>
                    <div class="d-flex gap-1">

    <button
        class="btn btn-sm btn-outline-primary"
        onclick="viewPatient(${patient.patient_id})">
        View
    </button>

    <button
        class="btn btn-sm btn-outline-warning"
        onclick="editPatient(${patient.patient_id})">
        Edit
    </button>

    <button
        class="btn btn-sm btn-outline-danger"
        onclick="deactivatePatient(${patient.patient_id})">
        Delete
    </button>

</div>
                </td>
            `;

            tableBody.appendChild(row);
        });

    } catch (error) {

        console.error("Load patients error:", error);

        tableBody.innerHTML = `
            <tr>
                <td colspan="8"
                    class="text-center text-danger py-4">
                    Failed to load patients.
                </td>
            </tr>
        `;

        patientCount.textContent = "Unable to load patient records.";
    }
}
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");

if (searchBtn) {

    searchBtn.addEventListener("click", () => {

        const searchValue = searchInput.value.trim();

        loadPatients(searchValue);

    });
}
if (searchInput) {

    searchInput.addEventListener("keydown", (event) => {

        if (event.key === "Enter") {

            const searchValue = searchInput.value.trim();

            loadPatients(searchValue);
        }
    });
}
if (document.getElementById("patientTableBody")) {
    loadPatients();
}
const addPatientBtn = document.getElementById("addPatientBtn");
const patientFormCard = document.getElementById("patientFormCard");
const patientForm = document.getElementById("patientForm");
const cancelPatientBtn = document.getElementById("cancelPatientBtn");
const cancelPatientBtn2 = document.getElementById("cancelPatientBtn2");
const patientFormMessage = document.getElementById("patientFormMessage");


if (addPatientBtn) {

    addPatientBtn.addEventListener("click", () => {

        patientFormCard.classList.remove("d-none");

        addPatientBtn.classList.add("d-none");

        document.getElementById("full_name").focus();

    });

}
// Open registration form when coming from Dashboard
const urlParams = new URLSearchParams(window.location.search);

if (urlParams.get("register") === "true" && addPatientBtn) {
    addPatientBtn.click();

    // Remove ?register=true from the address bar
    window.history.replaceState(
        {},
        document.title,
        "patients.html"
    );
}


function closePatientForm() {

    patientFormCard.classList.add("d-none");

    addPatientBtn.classList.remove("d-none");

    patientForm.reset();

    delete patientForm.dataset.editingId;

    document.querySelector("#patientFormCard h5").textContent =
        "Register New Patient";

    document.querySelector("#patientFormCard small").textContent =
        "Enter the patient's basic information.";

    patientFormMessage.classList.add("d-none");

}


if (cancelPatientBtn) {

    cancelPatientBtn.addEventListener(
        "click",
        closePatientForm
    );

}


if (cancelPatientBtn2) {

    cancelPatientBtn2.addEventListener(
        "click",
        closePatientForm
    );

}


if (patientForm) {

    patientForm.addEventListener("submit", async (event) => {

        event.preventDefault();


        patientFormMessage.className =
            "alert alert-info";

        patientFormMessage.textContent =
            "Saving patient...";


        const patientData = {

            full_name:
                document.getElementById("full_name").value.trim(),

            dob:
                document.getElementById("dob").value,

            gender:
                document.getElementById("gender").value,

            blood_group:
                document.getElementById("blood_group").value,

            phone:
                document.getElementById("phone").value.trim(),

            email:
                document.getElementById("email").value.trim(),

            address:
                document.getElementById("address").value.trim(),

            emergency_contact:
                document.getElementById("emergency_contact").value.trim()

        };


        try {

    const editingId = patientForm.dataset.editingId;

const url = editingId
    ? `http://localhost:5000/api/patients/${editingId}`
    : "http://localhost:5000/api/patients";

const method = editingId
    ? "PUT"
    : "POST";

const response = await fetchWithAuth(
    url,
    {
        method: method,
        body: JSON.stringify(patientData)
    }
);

            const data = await response.json();


            if (!response.ok) {

                patientFormMessage.className =
                    "alert alert-danger";

                patientFormMessage.textContent =
                    data.message || "Failed to register patient.";

                return;

            }


            patientFormMessage.className =
                "alert alert-success";

            patientFormMessage.textContent =
                "Patient registered successfully!";


            patientForm.reset();

delete patientForm.dataset.editingId;

await loadPatients();

setTimeout(() => {

    closePatientForm();

}, 1000);

        } catch (error) {

            console.error(
                "Register patient error:",
                error
            );

            patientFormMessage.className =
                "alert alert-danger";

            patientFormMessage.textContent =
                "Cannot connect to the server.";

        }

    });

}
async function editPatient(patientId) {

    try {

        const response = await fetchWithAuth(
            `http://localhost:5000/api/patients/${patientId}`
        );

        const patient = await response.json();

        if (!response.ok) {
            alert(patient.message || "Patient not found.");
            return;
        }

        // Open the patient form
        patientFormCard.classList.remove("d-none");
        addPatientBtn.classList.add("d-none");

        // Change form heading
        document.querySelector("#patientFormCard h5").textContent =
            "Edit Patient";

        document.querySelector("#patientFormCard small").textContent =
            "Update the patient's information.";

        // Fill existing patient data
        document.getElementById("full_name").value =
            patient.full_name || "";

        document.getElementById("dob").value =
            patient.dob
                ? patient.dob.substring(0, 10)
                : "";

        document.getElementById("gender").value =
            patient.gender || "";

        document.getElementById("blood_group").value =
            patient.blood_group || "";

        document.getElementById("phone").value =
            patient.phone || "";

        document.getElementById("email").value =
            patient.email || "";

        document.getElementById("address").value =
            patient.address || "";

        document.getElementById("emergency_contact").value =
            patient.emergency_contact || "";

        // VERY IMPORTANT:
        // Store the patient ID so submit knows this is an edit
        patientForm.dataset.editingId = patientId;

        patientFormMessage.className = "alert d-none";

        document.getElementById("full_name").focus();

    } catch (error) {

        console.error("Edit patient error:", error);

        alert("Cannot connect to the server.");

    }
}
let patientToDelete = null;


function deactivatePatient(patientId) {

    patientToDelete = patientId;

    const modalElement =
        document.getElementById("deletePatientModal");

    const modal =
        bootstrap.Modal.getOrCreateInstance(modalElement);

    modal.show();
}


const confirmDeletePatientBtn =
    document.getElementById("confirmDeletePatientBtn");


if (confirmDeletePatientBtn) {

    confirmDeletePatientBtn.addEventListener(
        "click",
        async () => {

            if (!patientToDelete) {
                return;
            }

            try {

                const response = await fetchWithAuth(
                    `http://localhost:5000/api/patients/${patientToDelete}`,
                    {
                        method: "DELETE"
                    }
                );

                const data = await response.json();

                if (!response.ok) {

                    alert(
                        data.message ||
                        "Failed to deactivate patient."
                    );

                    return;
                }


                // Close modal
                const modalElement =
                    document.getElementById("deletePatientModal");

                const modal =
                    bootstrap.Modal.getOrCreateInstance(
                        modalElement
                    );

                modal.hide();


                // Clear selected patient
                patientToDelete = null;


                // Refresh patient list
                await loadPatients();


            } catch (error) {

                console.error(
                    "Deactivate patient error:",
                    error
                );

                alert(
                    "Cannot connect to the server."
                );
            }

        }
    );
}
async function viewPatient(patientId) {
    try {
        const response = await fetchWithAuth(
            `http://localhost:5000/api/patients/${patientId}`
        );

        const patient = await response.json();

        if (!response.ok) {
            alert(patient.message || "Failed to load patient.");
            return;
        }

        document.getElementById("viewPatientId").textContent =
            patient.patient_id || "-";

        document.getElementById("viewPatientName").textContent =
            patient.full_name || "-";

        document.getElementById("viewPatientDob").textContent =
            patient.dob || "-";

        document.getElementById("viewPatientGender").textContent =
            patient.gender || "-";

        document.getElementById("viewPatientBloodGroup").textContent =
            patient.blood_group || "-";

        document.getElementById("viewPatientPhone").textContent =
            patient.phone || "-";

        document.getElementById("viewPatientEmail").textContent =
            patient.email || "-";

        document.getElementById("viewPatientEmergency").textContent =
            patient.emergency_contact || "-";

        document.getElementById("viewPatientAddress").textContent =
            patient.address || "-";

        const modalElement =
            document.getElementById("viewPatientModal");

        const modal =
            bootstrap.Modal.getOrCreateInstance(modalElement);

        modal.show();

    } catch (error) {
        console.error("View patient error:", error);
        alert("Unable to load patient details.");
    }
}