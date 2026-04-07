import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig, blazeConfig } from "./firebase-config.js";

const portalApp = getApps().some(app => app.name === "portal")
  ? getApp("portal")
  : initializeApp(firebaseConfig, "portal");

const blazeApp = getApps().some(app => app.name === "blaze")
  ? getApp("blaze")
  : initializeApp(blazeConfig, "blaze");

const auth = getAuth(portalApp);
const db = getFirestore(portalApp);
const functions = getFunctions(blazeApp);

const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginMessage = document.getElementById("login-message");
const resetPasswordBtn = document.getElementById("reset-password-btn");
const logoutBtn = document.getElementById("logout-btn");
const userRoleBadge = document.getElementById("user-role-badge");
const createUserForm = document.getElementById("create-user-form");
const createUserMessage = document.getElementById("create-user-message");

const pageIds = ["page-login", "page-employee", "page-supervisor", "page-admin"];
let currentAuthUser = null;
let currentProfile = null;

function showPage(pageId) {
  pageIds.forEach((id) => {
    const page = document.getElementById(id);
    if (!page) return;
    page.classList.toggle("active-page", id === pageId);
  });
}

function setMessage(text = "") {
  loginMessage.textContent = text;
}

function setCreateUserMessage(text = "", isError = false) {
  if (!createUserMessage) return;
  createUserMessage.textContent = text;
  createUserMessage.style.color = isError ? "#b42318" : "#027a48";
}

function showTopbarForLoggedInUser(profile) {
  logoutBtn.classList.remove("hidden");
  userRoleBadge.classList.remove("hidden");
  userRoleBadge.textContent = `Rolle: ${profile.role}`;
}

function hideTopbarUserControls() {
  logoutBtn.classList.add("hidden");
  userRoleBadge.classList.add("hidden");
  userRoleBadge.textContent = "";
}

function formatDate(value) {
  if (!value) return "-";
  if (typeof value === "string") return value;
  if (value?.toDate) return value.toDate().toLocaleDateString("de-DE");
  return "-";
}

function createInfoCard({ title, lines = [], buttonText = "", onClick = null, status = "" }) {
  const card = document.createElement("div");
  card.className = "list-card";

  const heading = document.createElement("h4");
  heading.textContent = title;
  card.appendChild(heading);

  lines.forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    card.appendChild(p);
  });

  if (status) {
    const badge = document.createElement("span");
    badge.className = "status";
    badge.textContent = status;
    card.appendChild(badge);
  }

  if (buttonText && typeof onClick === "function") {
    const btn = document.createElement("button");
    btn.className = "primary-btn inline-btn";
    btn.textContent = buttonText;
    btn.addEventListener("click", onClick);
    card.appendChild(btn);
  }

  return card;
}
async function getUserProfile(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error("Kein Benutzerprofil in Firestore gefunden.");
  }
  return { id: snap.id, ...snap.data() };
}

async function updateLastLogin(uid) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, {
    lastLogin: serverTimestamp()
  });
}

function parseLocalDate(dateString) {
  if (!dateString) return null;

  const parts = String(dateString).split("-");
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  return new Date(year, month, day);
}

function isUserActive(profile) {
  if (profile.active === false) return false;

  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const start = parseLocalDate(profile.startDate);
  const end = parseLocalDate(profile.endDate);

  if (start && todayOnly < start) return false;
  if (end && todayOnly > end) return false;

  return true;
}

async function getAllTrainings() {
  const snap = await getDocs(collection(db, "trainings"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function getVisibleTrainingsForProfile(trainings, profile) {
  const userBereiche = Array.isArray(profile.bereiche) ? profile.bereiche : [];
  return trainings.filter((training) => {
    if (training.active === false) return false;
    if (!Array.isArray(training.bereiche) || training.bereiche.length === 0) return true;
    return training.bereiche.some((bereich) => userBereiche.includes(bereich));
  });
}

async function getProgressEntriesForUser(userId) {
  const q = query(collection(db, "trainingProgress"), where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function renderEmployeeView(profile) {
  document.getElementById("employee-welcome").textContent =
    `Willkommen ${profile.name || ""}. Hier sehen Sie Ihre freigegebenen Schulungen.`;

  const trainingList = document.getElementById("employee-training-list");
  const progressList = document.getElementById("employee-progress-list");
  trainingList.innerHTML = "";
  progressList.innerHTML = "";

  const trainings = await getAllTrainings();
  const visibleTrainings = getVisibleTrainingsForProfile(trainings, profile);
  const progressEntries = await getProgressEntriesForUser(profile.id);

  if (visibleTrainings.length === 0) {
    trainingList.appendChild(createInfoCard({
      title: "Keine Schulungen vorhanden",
      lines: ["Aktuell sind Ihnen keine aktiven Schulungen zugeordnet."]
    }));
  }

  visibleTrainings.forEach((training) => {
    const progress = progressEntries.find((entry) => entry.trainingId === training.id);
    const status = progress?.status || "nicht begonnen";

    trainingList.appendChild(createInfoCard({
      title: training.title,
      lines: [
        `Bereiche: ${(training.bereiche || []).join(", ") || "alle"}`,
        `Link: ${training.url || "kein Link hinterlegt"}`
      ],
      status,
      buttonText: "Schulung öffnen",
      onClick: () => {
        if (training.url) window.open(training.url, "_blank", "noopener,noreferrer");
      }
    }));
  });

  if (progressEntries.length === 0) {
    progressList.appendChild(createInfoCard({
      title: "Noch kein Bearbeitungsstand",
      lines: ["Sobald Schulungen geöffnet oder abgeschlossen werden, erscheint der Status hier."]
    }));
  }

  progressEntries.forEach((entry) => {
    progressList.appendChild(createInfoCard({
      title: entry.trainingTitle || "Schulung",
      lines: [
        `Geöffnet: ${formatDate(entry.openedAt)}`,
        `Abgeschlossen: ${formatDate(entry.completedAt)}`
      ],
      status: entry.status || "offen"
    }));
  });
}

async function getEmployeesForSupervisor(supervisorId) {
  const q = query(collection(db, "users"), where("supervisorId", "==", supervisorId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function renderSupervisorView(profile) {
  document.getElementById("supervisor-welcome").textContent =
    `Willkommen ${profile.name || ""}. Hier sehen Sie Ihre eigenen Schulungen und den Stand Ihrer Mitarbeiter.`;

  const ownTrainingList = document.getElementById("supervisor-own-training-list");
  const employeeList = document.getElementById("supervisor-employee-list");
  const progressList = document.getElementById("supervisor-progress-list");

  ownTrainingList.innerHTML = "";
  employeeList.innerHTML = "";
  progressList.innerHTML = "";

  const trainings = await getAllTrainings();
  const visibleTrainings = getVisibleTrainingsForProfile(trainings, profile);

  visibleTrainings.forEach((training) => {
    ownTrainingList.appendChild(createInfoCard({
      title: training.title,
      lines: [
        `Bereiche: ${(training.bereiche || []).join(", ") || "alle"}`,
        `Link: ${training.url || "kein Link hinterlegt"}`
      ],
      buttonText: "Schulung öffnen",
      onClick: () => {
        if (training.url) window.open(training.url, "_blank", "noopener,noreferrer");
      }
    }));
  });

  if (visibleTrainings.length === 0) {
    ownTrainingList.appendChild(createInfoCard({
      title: "Keine eigenen Schulungen vorhanden",
      lines: ["Ihnen sind aktuell keine Schulungen zugeordnet."]
    }));
  }

  const employees = await getEmployeesForSupervisor(profile.id);

  if (employees.length === 0) {
    employeeList.appendChild(createInfoCard({
      title: "Keine Mitarbeiter zugeordnet",
      lines: ["Aktuell sind diesem Vorgesetzten noch keine Mitarbeiter zugeordnet."]
    }));
    progressList.appendChild(createInfoCard({
      title: "Keine Bearbeitungsstände vorhanden",
      lines: ["Sobald Mitarbeiter zugeordnet sind, erscheinen ihre Schulungsstände hier."]
    }));
    return;
  }

  for (const employee of employees) {
    employeeList.appendChild(createInfoCard({
      title: employee.name || employee.email,
      lines: [
        `E-Mail: ${employee.email || "-"}`,
        `Bereiche: ${(employee.bereiche || []).join(", ") || "-"}`,
        `Letzter Login: ${formatDate(employee.lastLogin)}`
      ],
      status: employee.active === false ? "inaktiv" : "aktiv"
    }));

    const progressEntries = await getProgressEntriesForUser(employee.id);

    if (progressEntries.length === 0) {
      progressList.appendChild(createInfoCard({
        title: employee.name || employee.email,
        lines: ["Noch keine Bearbeitungsstände vorhanden."],
        status: "offen"
      }));
      continue;
    }

    progressEntries.forEach((entry) => {
      progressList.appendChild(createInfoCard({
        title: `${employee.name || employee.email} – ${entry.trainingTitle || "Schulung"}`,
        lines: [
          `Geöffnet: ${formatDate(entry.openedAt)}`,
          `Abgeschlossen: ${formatDate(entry.completedAt)}`
        ],
        status: entry.status || "offen"
      }));
    });
  }
}

async function renderAdminView(profile) {
  document.getElementById("admin-welcome").textContent =
    `Willkommen ${profile.name || ""}. Hier befindet sich der Verwaltungsbereich.`;

  const ownTrainingList = document.getElementById("admin-own-training-list");
  ownTrainingList.innerHTML = "";

  const trainings = await getAllTrainings();
  const visibleTrainings = getVisibleTrainingsForProfile(trainings, profile);

  if (visibleTrainings.length === 0) {
    ownTrainingList.appendChild(createInfoCard({
      title: "Keine eigenen Schulungen vorhanden",
      lines: ["Auch Admins können eigene Schulungen haben."]
    }));
  }

  visibleTrainings.forEach((training) => {
    ownTrainingList.appendChild(createInfoCard({
      title: training.title,
      lines: [
        `Bereiche: ${(training.bereiche || []).join(", ") || "alle"}`,
        `Link: ${training.url || "kein Link hinterlegt"}`
      ],
      buttonText: "Schulung öffnen",
      onClick: () => {
        if (training.url) window.open(training.url, "_blank", "noopener,noreferrer");
      }
    }));
  });
}

async function loadAdminUsers() {
  const list = document.getElementById("admin-user-list");
  list.innerHTML = "";

  const snap = await getDocs(collection(db, "users"));
  const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (users.length === 0) {
    list.appendChild(createInfoCard({
      title: "Keine Benutzer vorhanden",
      lines: ["In Firestore wurden noch keine Benutzerprofile angelegt."]
    }));
    return;
  }

  users.forEach((user) => {
    list.appendChild(createInfoCard({
      title: user.name || user.email,
      lines: [
        `E-Mail: ${user.email || "-"}`,
        `Rolle: ${user.role || "-"}`,
        `Bereiche: ${(user.bereiche || []).join(", ") || "-"}`,
        `Vorgesetzter-ID: ${user.supervisorId || "-"}`
      ],
      status: user.active === false ? "inaktiv" : "aktiv"
    }));
  });
}

async function createPortalUserFromForm(formData) {
  if (!currentAuthUser) {
    throw new Error("Nicht angemeldet.");
  }

  const idToken = await currentAuthUser.getIdToken();

  const response = await fetch(
    "https://us-central1-kalkpro-4cc29.cloudfunctions.net/createPortalUserHttp",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`
      },
      body: JSON.stringify(formData)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Benutzer konnte nicht angelegt werden.");
  }

  return data;
}

 async function loadAdminTrainings() {
  const list = document.getElementById("admin-training-list");
  list.innerHTML = "";

  const trainings = await getAllTrainings();

  if (trainings.length === 0) {
    list.appendChild(createInfoCard({
      title: "Keine Schulungen vorhanden",
      lines: ["In Firestore wurden noch keine Schulungen angelegt."]
    }));
    return;
  }

  trainings.forEach((training) => {
    list.appendChild(createInfoCard({
      title: training.title,
      lines: [
        `URL: ${training.url || "-"}`,
        `Bereiche: ${(training.bereiche || []).join(", ") || "alle"}`
      ],
      status: training.active === false ? "inaktiv" : "aktiv"
    }));
  });
}

async function routeUser(profile) {
  showTopbarForLoggedInUser(profile);

  if (profile.role === "employee") {
    showPage("page-employee");
    await renderEmployeeView(profile);
    return;
  }

  if (profile.role === "supervisor") {
    showPage("page-supervisor");
    await renderSupervisorView(profile);
    return;
  }

  if (profile.role === "admin") {
    showPage("page-admin");
    await renderAdminView(profile);
    return;
  }

  throw new Error("Unbekannte Rolle im Benutzerprofil.");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();

  if (!email || !password) {
    setMessage("Bitte E-Mail und Passwort eingeben.");
    return;
  }

  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    currentAuthUser = result.user;
  } catch (error) {
    console.error(error);
    setMessage("Anmeldung fehlgeschlagen. Bitte Eingaben prüfen.");
  }
});

resetPasswordBtn.addEventListener("click", async () => {
  const email = loginEmail.value.trim();
  setMessage("");

  if (!email) {
    setMessage("Bitte zuerst die E-Mail-Adresse eingeben.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    setMessage("E-Mail zum Zurücksetzen wurde versendet.");
  } catch (error) {
    console.error(error);
    setMessage("Passwort-Reset konnte nicht ausgelöst werden.");
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
  }
});

document.getElementById("btn-load-users").addEventListener("click", async () => {
  try {
    await loadAdminUsers();
  } catch (error) {
    console.error(error);
    alert("Benutzer konnten nicht geladen werden.");
  }
});

document.getElementById("btn-load-trainings").addEventListener("click", async () => {
  try {
    await loadAdminTrainings();
  } catch (error) {
    console.error(error);
    alert("Schulungen konnten nicht geladen werden.");
  }
});

createUserForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setCreateUserMessage("");

  try {
    const name = document.getElementById("new-user-name").value.trim();
    const email = document.getElementById("new-user-email").value.trim();
    const password = document.getElementById("new-user-password").value.trim();
    const role = document.getElementById("new-user-role").value;
    const bereicheRaw = document.getElementById("new-user-bereiche").value.trim();
    const supervisorId = document.getElementById("new-user-supervisor").value.trim();
    const startDate = document.getElementById("new-user-start").value;
    const endDate = document.getElementById("new-user-end").value;
    const active = document.getElementById("new-user-active").value === "true";

    if (!name || !email || !password || !role) {
      setCreateUserMessage("Bitte alle Pflichtfelder ausfüllen.", true);
      return;
    }

    const bereiche = bereicheRaw
      ? bereicheRaw
          .split(",")
          .map(v => parseInt(v.trim(), 10))
          .filter(v => !Number.isNaN(v))
      : [];

    const result = await createPortalUserFromForm({
      name,
      email,
      password,
      role,
      bereiche,
      supervisorId,
      startDate,
      endDate,
      active
    });

    setCreateUserMessage(`Benutzer wurde angelegt. UID: ${result.uid}`, false);
    createUserForm.reset();
    await loadAdminUsers();
  } catch (error) {
    console.error(error);
    setCreateUserMessage(`Fehler: ${error.message}`, true);
  }
});

onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      currentAuthUser = null;
      currentProfile = null;
      hideTopbarUserControls();
      showPage("page-login");
      return;
    }

    currentAuthUser = user;
    const profile = await getUserProfile(user.uid);

    if (!isUserActive(profile)) {
      await signOut(auth);
      setMessage("Ihr Zugang ist derzeit nicht aktiv.");
      return;
    }

    currentProfile = profile;
    await updateLastLogin(user.uid);
    await routeUser(profile);
  } catch (error) {
    console.error(error);
    setMessage("Benutzerprofil konnte nicht geladen werden.");
    await signOut(auth);
  }
});