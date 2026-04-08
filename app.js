import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  updatePassword
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
  deleteDoc,
  setDoc,
  addDoc,
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
const functions = getFunctions(blazeApp, "europe-west1");
const uploadTrainingProofFn = httpsCallable(functions, "uploadTrainingProof");
const deleteTrainingProofFn = httpsCallable(functions, "deleteTrainingProof");
const getTrainingProofDownloadUrlFn = httpsCallable(functions, "getTrainingProofDownloadUrl");
const getEmployeeProofDownloadsFn = httpsCallable(functions, "getEmployeeProofDownloads");

const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginMessage = document.getElementById("login-message");
const resetPasswordBtn = document.getElementById("reset-password-btn");
const changePasswordBtn = document.getElementById("change-password-btn");
const logoutBtn = document.getElementById("logout-btn");
const userRoleBadge = document.getElementById("user-role-badge");
const createUserForm = document.getElementById("create-user-form");
const createUserMessage = document.getElementById("create-user-message");
const editUserIdInput = document.getElementById("edit-user-id");
const saveUserBtn = document.getElementById("save-user-btn");
const cancelUserEditBtn = document.getElementById("cancel-user-edit-btn");
const createTrainingForm = document.getElementById("create-training-form");
const createTrainingMessage = document.getElementById("create-training-message");
const editTrainingIdInput = document.getElementById("edit-training-id");
const saveTrainingBtn = document.getElementById("save-training-btn");
const cancelTrainingEditBtn = document.getElementById("cancel-training-edit-btn");

const pageIds = ["page-login", "page-employee", "page-supervisor", "page-admin"];
let currentAuthUser = null;
let currentProfile = null;

changePasswordBtn?.addEventListener("click", async () => {
  const newPassword = prompt("Bitte neues Passwort eingeben:");

  if (!newPassword || newPassword.length < 6) {
    alert("Passwort muss mindestens 6 Zeichen haben.");
    return;
  }

  try {
    await updatePassword(auth.currentUser, newPassword);
    alert("Passwort erfolgreich geändert.");
  } catch (error) {
    console.error(error);
    alert("Passwort konnte nicht geändert werden.");
  }
});

function showPage(pageId) {
  pageIds.forEach((id) => {
    const page = document.getElementById(id);
    if (!page) return;
    page.classList.toggle("active-page", id === pageId);
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result || "";
      const base64 = String(result).split(",")[1] || "";
      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error("Datei konnte nicht gelesen werden."));
    };

    reader.readAsDataURL(file);
  });
}

async function getPortalIdToken() {
  if (!currentAuthUser) {
    throw new Error("Nicht angemeldet.");
  }
  return await currentAuthUser.getIdToken();
}

function triggerBrowserDownload(url, fileName = "") {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  if (fileName) {
    a.download = fileName;
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function downloadSingleTrainingProof(employeeId, trainingId) {
  const idToken = await getPortalIdToken();

  const result = await getTrainingProofDownloadUrlFn({
    idToken,
    employeeId,
    trainingId
  });

  const data = result.data || {};

  if (!data.url) {
    throw new Error("Download-Link konnte nicht erzeugt werden.");
  }

  triggerBrowserDownload(data.url, data.fileName || "");
}

async function downloadAllProofsForEmployee(employeeId) {
  const idToken = await getPortalIdToken();

  const result = await getEmployeeProofDownloadsFn({
    idToken,
    employeeId
  });

  const data = result.data || {};
  const files = Array.isArray(data.files) ? data.files : [];

  if (files.length === 0) {
    alert("Für diesen Mitarbeiter liegen keine Nachweise vor.");
    return;
  }

  for (const file of files) {
    triggerBrowserDownload(file.url, file.fileName || "");
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
}

function setMessage(text = "") {
  loginMessage.textContent = text;
}

function setCreateUserMessage(text = "", isError = false) {
  if (!createUserMessage) return;
  createUserMessage.textContent = text;
  createUserMessage.style.color = isError ? "#b42318" : "#027a48";
}

function setCreateTrainingMessage(text = "", isError = false) {
  if (!createTrainingMessage) return;
  createTrainingMessage.textContent = text;
  createTrainingMessage.style.color = isError ? "#b42318" : "#027a48";
}

function showTopbarForLoggedInUser(profile) {
  logoutBtn.classList.remove("hidden");
  changePasswordBtn.classList.remove("hidden");
  userRoleBadge.classList.remove("hidden");
  userRoleBadge.textContent = `Rolle: ${profile.role}`;
}

function hideTopbarUserControls() {
  logoutBtn.classList.add("hidden");
  userRoleBadge.classList.add("hidden");
  changePasswordBtn.classList.add("hidden");
  userRoleBadge.textContent = "";
}

function formatDate(value) {
  if (!value) return "-";
  if (typeof value === "string") return value;
  if (value?.toDate) return value.toDate().toLocaleDateString("de-DE");
  return "-";
}

const MAX_PROOF_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function sanitizeFileName(name = "") {
  return String(name)
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

function isAllowedProofFile(file) {
  if (!file) return false;

  const allowedMimeTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  return allowedMimeTypes.includes(file.type);
}

function formatFileSize(bytes) {
  if (!bytes || Number.isNaN(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatExtraTrainingTitles(user, trainings = []) {
  const extraIds = Array.isArray(user?.extraTrainings) ? user.extraTrainings : [];

  if (extraIds.length === 0) {
    return "-";
  }

  const titles = extraIds.map((id) => {
    const training = trainings.find((t) => t.id === id);
    return training?.title || id;
  });

  return titles.join(", ");
}

async function getTrainingProgressDoc(userId, trainingId) {
  const progressId = `${userId}_${trainingId}`;
  const progressRef = doc(db, "trainingProgress", progressId);
  const snap = await getDoc(progressRef);

  return {
    progressId,
    progressRef,
    exists: snap.exists(),
    data: snap.exists() ? snap.data() : null
  };
}

async function trainingHasProof(userId, trainingId) {
  const progressDoc = await getTrainingProgressDoc(userId, trainingId);
  return !!(progressDoc.data?.proofPath && progressDoc.data?.proofName);
}

async function uploadTrainingProof(userId, training, file, statusElement) {
  if (!userId || !training?.id) {
    throw new Error("Benutzer oder Schulung fehlen.");
  }

  if (!file) {
    throw new Error("Bitte eine Datei auswählen.");
  }

  if (!isAllowedProofFile(file)) {
    throw new Error("Erlaubt sind nur PDF, JPG, PNG, WEBP oder GIF.");
  }

  if (file.size > MAX_PROOF_FILE_SIZE) {
    throw new Error("Die Datei ist zu groß. Maximal 10 MB sind erlaubt.");
  }

  if (statusElement) {
    statusElement.textContent = "Datei wird gelesen...";
  }

  const base64Data = await fileToBase64(file);

  if (statusElement) {
    statusElement.textContent = "Datei wird hochgeladen...";
  }

  const progressDoc = await getTrainingProgressDoc(userId, training.id);

  // Alte Datei löschen
  if (progressDoc.data?.proofPath) {
    try {
      await deleteTrainingProofFn({
        proofPath: progressDoc.data.proofPath
      });
    } catch (error) {
      console.warn("Alter Nachweis konnte nicht gelöscht werden:", error);
    }
  }

  const result = await uploadTrainingProofFn({
    portalUserId: userId,
    trainingId: training.id,
    trainingTitle: training.title || "Schulung",
    fileName: file.name,
    contentType: file.type,
    base64Data
  });

  const uploadData = result.data || {};

  await setDoc(progressDoc.progressRef, {
    userId,
    trainingId: training.id,
    trainingTitle: training.title || "Schulung",
    proofName: uploadData.proofName || file.name,
    proofPath: uploadData.proofPath || "",
    proofSize: uploadData.proofSize || file.size,
    proofContentType: uploadData.proofContentType || file.type || "",
    proofUploadedAt: serverTimestamp()
  }, { merge: true });
}

async function deleteTrainingProof(userId, trainingId) {
  const progressDoc = await getTrainingProgressDoc(userId, trainingId);

  if (progressDoc.data?.proofPath) {
    try {
      await deleteTrainingProofFn({
        proofPath: progressDoc.data.proofPath
      });
    } catch (error) {
      console.warn("Nachweis konnte nicht aus Storage gelöscht werden:", error);
    }
  }

  await setDoc(progressDoc.progressRef, {
    proofName: null,
    proofPath: null,
    proofSize: null,
    proofContentType: null,
    proofUploadedAt: null,
    status: "in_progress",
    completedAt: null
  }, { merge: true });
}

function createTrainingActionCard({
  userId,
  training,
  progress,
  rerender,
  showBereiche = false
}) {
  const card = document.createElement("div");
  card.className = "list-card";

  const heading = document.createElement("h4");
  heading.textContent = training.title || "Schulung";
  card.appendChild(heading);

  if (showBereiche) {
    const bereicheLine = document.createElement("p");
    bereicheLine.textContent = `Bereiche: ${(training.bereiche || []).join(", ") || "alle"}`;
    card.appendChild(bereicheLine);
  }

  const linkLine = document.createElement("p");
  linkLine.textContent = `Link: ${training.url || "kein Link hinterlegt"}`;
  card.appendChild(linkLine);

  const proofLine = document.createElement("p");
  proofLine.textContent = progress?.proofName
    ? `Nachweis: ${progress.proofName} (${formatFileSize(progress.proofSize)})`
    : "Nachweis: noch nicht hochgeladen";
  card.appendChild(proofLine);

  const statusBadge = document.createElement("span");
  statusBadge.className = "status";
  statusBadge.textContent = progress?.status || "nicht begonnen";
  card.appendChild(statusBadge);

  const uploadStatus = document.createElement("p");
  uploadStatus.style.marginTop = "10px";
  uploadStatus.style.fontWeight = "700";
  uploadStatus.style.color = "#b42318";
  uploadStatus.textContent = "";
  card.appendChild(uploadStatus);

  const openBtn = document.createElement("button");
  openBtn.className = "primary-btn inline-btn";
  openBtn.textContent = "Schulung öffnen";
  openBtn.addEventListener("click", async () => {
    try {
      await markTrainingOpened(userId, training);
      if (training.url) {
        window.open(training.url, "_blank", "noopener,noreferrer");
      }
      await rerender();
    } catch (error) {
      console.error(error);
      alert("Bearbeitungsstand konnte nicht gespeichert werden.");
    }
  });
  card.appendChild(openBtn);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/pdf,image/*";
  fileInput.style.display = "none";

  const uploadBtn = document.createElement("button");
  uploadBtn.className = "secondary-btn inline-btn";
  uploadBtn.textContent = progress?.proofName ? "Nachweis ersetzen" : "Nachweis auswählen";
  uploadBtn.addEventListener("click", () => {
    fileInput.click();
  });
  card.appendChild(uploadBtn);

  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      uploadStatus.textContent = "Wählen Sie eine Datei mit dem Nachweis aus.";
      return;
    }

    try {
      uploadStatus.style.color = "#1f2328";
      uploadStatus.textContent = "Upload wird vorbereitet...";
      await uploadTrainingProof(userId, training, file, uploadStatus);
      uploadStatus.style.color = "#027a48";
      uploadStatus.textContent = "Nachweis erfolgreich hochgeladen.";
      await rerender();
    } catch (error) {
      console.error(error);
      uploadStatus.style.color = "#b42318";
      uploadStatus.textContent = error.message || "Upload fehlgeschlagen.";
    } finally {
      event.target.value = "";
    }
  });

  card.appendChild(fileInput);

  if (progress?.proofPath) {
    const removeProofBtn = document.createElement("button");
    removeProofBtn.className = "secondary-btn inline-btn";
    removeProofBtn.textContent = "Nachweis entfernen";
    removeProofBtn.addEventListener("click", async () => {
      try {
        await deleteTrainingProof(userId, training.id);
        await rerender();
      } catch (error) {
        console.error(error);
        alert("Nachweis konnte nicht entfernt werden.");
      }
    });
    card.appendChild(removeProofBtn);
  }

  const completeBtn = document.createElement("button");
  completeBtn.className = "secondary-btn inline-btn";
  completeBtn.textContent = "Als abgeschlossen markieren";
  completeBtn.addEventListener("click", async () => {
    try {
      const hasProof = await trainingHasProof(userId, training.id);

      if (!hasProof) {
        uploadStatus.style.color = "#b42318";
        uploadStatus.textContent = "Wählen Sie eine Datei mit dem Nachweis aus.";
        return;
      }

      await markTrainingCompleted(userId, training);
      await rerender();
    } catch (error) {
      console.error(error);
      alert("Abschluss konnte nicht gespeichert werden.");
    }
  });
  card.appendChild(completeBtn);

  return card;
}

function createInfoCard({
  title,
  lines = [],
  buttonText = "",
  onClick = null,
  secondaryButtonText = "",
  onSecondaryClick = null,
  status = ""
}) {
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

  if (secondaryButtonText && typeof onSecondaryClick === "function") {
    const secondBtn = document.createElement("button");
    secondBtn.className = "secondary-btn inline-btn";
    secondBtn.textContent = secondaryButtonText;
    secondBtn.addEventListener("click", onSecondaryClick);
    card.appendChild(secondBtn);
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
  const extraTrainings = Array.isArray(profile.extraTrainings) ? profile.extraTrainings : [];

  return trainings.filter((training) => {
    if (training.active === false) return false;

    // 1. Bereich passt
    const matchesBereich =
      !Array.isArray(training.bereiche) ||
      training.bereiche.length === 0 ||
      training.bereiche.some((bereich) => userBereiche.includes(bereich));

    // 2. Oder individuell zugewiesen
    const isExtra = extraTrainings.includes(training.id);

    return matchesBereich || isExtra;
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

    trainingList.appendChild(createTrainingActionCard({
      userId: profile.id,
      training,
      progress,
      rerender: async () => {
        await renderEmployeeView(profile);
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
        `Abgeschlossen: ${formatDate(entry.completedAt)}`,
        `Nachweis: ${entry.proofName || "-"}`
      ],
      status: entry.status || "offen"
    }));
  });
}

async function updateUserProfile(userId, data) {
  await updateDoc(doc(db, "users", userId), data);
}

async function deleteUserProfile(userId) {
  await deleteDoc(doc(db, "users", userId));
}

function resetUserForm() {
  if (!createUserForm) return;

  createUserForm.reset();
  if (editUserIdInput) editUserIdInput.value = "";
  if (saveUserBtn) saveUserBtn.textContent = "Benutzer anlegen";
  setCreateUserMessage("");
}

function fillUserFormForEdit(user) {
  if (!user) return;

  if (editUserIdInput) editUserIdInput.value = user.id;

  document.getElementById("new-user-name").value = user.name || "";
  document.getElementById("new-user-email").value = user.email || "";
  document.getElementById("new-user-password").value = "";
  document.getElementById("new-user-role").value = user.role || "employee";
  document.getElementById("new-user-active").value = String(user.active !== false);
  document.getElementById("new-user-supervisor").value = user.supervisorId || "";
  document.getElementById("new-user-start").value = user.startDate || "";
  document.getElementById("new-user-end").value = user.endDate || "";

  document
    .querySelectorAll('#new-user-bereiche input[type="checkbox"]')
    .forEach((checkbox) => {
      const value = parseInt(checkbox.value, 10);
      checkbox.checked = Array.isArray(user.bereiche) && user.bereiche.includes(value);
    });

  document
    .querySelectorAll('#new-user-extra-trainings input[type="checkbox"]')
    .forEach((checkbox) => {
      checkbox.checked = Array.isArray(user.extraTrainings) &&
        user.extraTrainings.includes(checkbox.value);
    });

  if (saveUserBtn) saveUserBtn.textContent = "Benutzer speichern";
  setCreateUserMessage("Bearbeitungsmodus aktiv.", false);
}

async function markTrainingOpened(userId, training) {
  if (!userId || !training?.id) return;

  const progressId = `${userId}_${training.id}`;
  const progressRef = doc(db, "trainingProgress", progressId);

  await setDoc(progressRef, {
    userId,
    trainingId: training.id,
    trainingTitle: training.title || "Schulung",
    status: "in_progress",
    openedAt: serverTimestamp(),
    completedAt: null
  }, { merge: true });
}

async function markTrainingCompleted(userId, training) {
  if (!userId || !training?.id) return;

  const progressDoc = await getTrainingProgressDoc(userId, training.id);

  if (!progressDoc.data?.proofPath || !progressDoc.data?.proofName) {
    throw new Error("Wählen Sie eine Datei mit dem Nachweis aus.");
  }

  await setDoc(progressDoc.progressRef, {
    userId,
    trainingId: training.id,
    trainingTitle: training.title || "Schulung",
    status: "completed",
    completedAt: serverTimestamp()
  }, { merge: true });
}

async function loadTrainingCheckboxesForUserForm() {
  const container = document.getElementById("new-user-extra-trainings");
  if (!container) return;

  container.innerHTML = "";

  const trainings = await getAllTrainings();

  trainings.forEach((training) => {
    const label = document.createElement("label");
    label.style.display = "block";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = training.id;

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(" " + training.title));

    container.appendChild(label);
  });
}

async function getEmployeesForSupervisor(supervisorId) {
  const q = query(collection(db, "users"), where("supervisorId", "==", supervisorId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function renderAdminProofOverview() {
  const list = document.getElementById("admin-proof-overview-list");
  if (!list) return;

  list.innerHTML = "";

  const usersSnap = await getDocs(collection(db, "users"));
  const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const employees = users.filter((user) => user.role === "employee");

  if (employees.length === 0) {
    list.appendChild(createInfoCard({
      title: "Keine Mitarbeiter vorhanden",
      lines: ["Aktuell sind keine Mitarbeiterprofile vorhanden."]
    }));
    return;
  }

  for (const employee of employees) {
    const progressEntries = await getProgressEntriesForUser(employee.id);
    const proofEntries = progressEntries.filter((entry) => entry.proofPath && entry.proofName);

    list.appendChild(createInfoCard({
      title: employee.name || employee.email,
      lines: [
        `E-Mail: ${employee.email || "-"}`,
        `Nachweise vorhanden: ${proofEntries.length}`
      ],
      status: proofEntries.length > 0 ? "Download möglich" : "kein Nachweis",
      buttonText: proofEntries.length > 0 ? "Alle Nachweise herunterladen" : "",
      onClick: proofEntries.length > 0
        ? async () => {
          try {
            await downloadAllProofsForEmployee(employee.id);
          } catch (error) {
            console.error(error);
            alert("Sammel-Download konnte nicht gestartet werden.");
          }
        }
        : null
    }));
  }
}

async function renderSupervisorView(profile) {
  document.getElementById("supervisor-welcome").textContent =
    `Willkommen ${profile.name || ""}. Hier sehen Sie Ihre eigenen Schulungen und den Stand Ihrer Mitarbeiter.`;

  const ownTrainingList = document.getElementById("supervisor-own-training-list");
  const ownProgressList = document.getElementById("supervisor-own-progress-list");
  const employeeList = document.getElementById("supervisor-employee-list");
  const progressList = document.getElementById("supervisor-progress-list");

  ownTrainingList.innerHTML = "";
  ownProgressList.innerHTML = "";
  employeeList.innerHTML = "";
  progressList.innerHTML = "";

  const trainings = await getAllTrainings();
  const visibleTrainings = getVisibleTrainingsForProfile(trainings, profile);
  const ownProgressEntries = await getProgressEntriesForUser(profile.id);

  visibleTrainings.forEach((training) => {
    const progress = ownProgressEntries.find((entry) => entry.trainingId === training.id);

    ownTrainingList.appendChild(createTrainingActionCard({
      userId: profile.id,
      training,
      progress,
      rerender: async () => {
        await renderSupervisorView(profile);
      }
    }));
  });

  if (visibleTrainings.length === 0) {
    ownTrainingList.appendChild(createInfoCard({
      title: "Keine eigenen Schulungen vorhanden",
      lines: ["Ihnen sind aktuell keine Schulungen zugeordnet."]
    }));
  }

  if (ownProgressEntries.length === 0) {
    ownProgressList.appendChild(createInfoCard({
      title: "Noch kein Bearbeitungsstand",
      lines: ["Sobald Schulungen geöffnet oder abgeschlossen werden, erscheint der Status hier."]
    }));
  }

  ownProgressEntries.forEach((entry) => {
    ownProgressList.appendChild(createInfoCard({
      title: entry.trainingTitle || "Schulung",
      lines: [
        `Geöffnet: ${formatDate(entry.openedAt)}`,
        `Abgeschlossen: ${formatDate(entry.completedAt)}`,
        `Nachweis: ${entry.proofName || "-"}`
      ],
      status: entry.status || "offen"
    }));
  });

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
        `Bereiche: ${(employee.bereiche || []).join(", ") || "-"}`, ,
        `Zusatzschulungen: ${formatExtraTrainingTitles(employee, trainings)}`,
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
          `Abgeschlossen: ${formatDate(entry.completedAt)}`,
          `Nachweis: ${entry.proofName || "-"}`
        ],
        status: entry.status || "offen",
        buttonText: entry.proofPath ? "Nachweis herunterladen" : "",
        onClick: entry.proofPath
          ? async () => {
            try {
              await downloadSingleTrainingProof(employee.id, entry.trainingId);
            } catch (error) {
              console.error(error);
              alert("Nachweis konnte nicht heruntergeladen werden.");
            }
          }
          : null
      }));
    });
  }
}

async function renderAdminView(profile) {
  document.getElementById("admin-welcome").textContent =
    `Willkommen ${profile.name || ""}. Hier befindet sich der Verwaltungsbereich.`;
  await loadSupervisorOptions();
  await renderAdminProofOverview();
  await loadTrainingCheckboxesForUserForm();

  const ownTrainingList = document.getElementById("admin-own-training-list");
  const ownProgressList = document.getElementById("admin-own-progress-list");
  ownTrainingList.innerHTML = "";
  ownProgressList.innerHTML = "";

  const trainings = await getAllTrainings();
  const visibleTrainings = getVisibleTrainingsForProfile(trainings, profile);
  const ownProgressEntries = await getProgressEntriesForUser(profile.id);

  if (visibleTrainings.length === 0) {
    ownTrainingList.appendChild(createInfoCard({
      title: "Keine eigenen Schulungen vorhanden",
      lines: ["Auch Admins können eigene Schulungen haben."]
    }));
  }

  if (ownProgressEntries.length === 0) {
    ownProgressList.appendChild(createInfoCard({
      title: "Noch kein Bearbeitungsstand",
      lines: ["Sobald Schulungen geöffnet oder abgeschlossen werden, erscheint der Status hier."]
    }));
  }

  ownProgressEntries.forEach((entry) => {
    ownProgressList.appendChild(createInfoCard({
      title: entry.trainingTitle || "Schulung",
      lines: [
        `Geöffnet: ${formatDate(entry.openedAt)}`,
        `Abgeschlossen: ${formatDate(entry.completedAt)}`,
        `Nachweis: ${entry.proofName || "-"}`
      ],
      status: entry.status || "offen"
    }));
  });

  visibleTrainings.forEach((training) => {
    const progress = ownProgressEntries.find((entry) => entry.trainingId === training.id);

    ownTrainingList.appendChild(createTrainingActionCard({
      userId: profile.id,
      training,
      progress,
      rerender: async () => {
        await renderAdminView(profile);
      },
      showBereiche: true
    }));
  });
}

async function loadAdminUsers() {
  const list = document.getElementById("admin-user-list");
  list.innerHTML = "";

  const snap = await getDocs(collection(db, "users"));
  const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const trainings = await getAllTrainings();

  if (users.length === 0) {
    list.appendChild(createInfoCard({
      title: "Keine Benutzer vorhanden",
      lines: ["In Firestore wurden noch keine Benutzerprofile angelegt."]
    }));
    return;
  }

  users.forEach((user) => {
    list.appendChild(createInfoCard({
      title: user.email,
      lines: [
        `Rolle: ${user.role}`,
        `Bereiche: ${(user.bereiche || []).join(", ")}`,
        `Zusatzschulungen: ${formatExtraTrainingTitles(user, trainings)}`
      ],
      status: user.active === false ? "inaktiv" : "aktiv",
      buttonText: "Bearbeiten",
      onClick: () => {
        fillUserFormForEdit(user);
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
      secondaryButtonText: "Löschen",
      onSecondaryClick: async () => {
        const confirmed = confirm(`Soll der Benutzer "${user.email}" gelöscht werden?`);
        if (!confirmed) return;

        try {
          await deleteUserProfile(user.id);
          await loadAdminUsers();
        } catch (error) {
          console.error(error);
          alert("Benutzer konnte nicht gelöscht werden.");
        }
      }
    }));
  });
}

async function loadSupervisorOptions() {
  const select = document.getElementById("new-user-supervisor");
  if (!select) return;

  select.innerHTML = `<option value="">Kein Vorgesetzter</option>`;

  const snap = await getDocs(collection(db, "users"));
  const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const supervisors = users.filter(
    (user) => user.role === "supervisor" || user.role === "admin"
  );

  supervisors.forEach((user) => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.name || user.email} (${user.role})`;
    select.appendChild(option);
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
      status: training.active === false ? "inaktiv" : "aktiv",
      buttonText: "Bearbeiten",
      onClick: () => {
        fillTrainingFormForEdit(training);
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
      secondaryButtonText: "Löschen",
      onSecondaryClick: async () => {
        const confirmed = confirm(`Soll die Schulung "${training.title}" wirklich gelöscht werden?`);
        if (!confirmed) return;

        try {
          await deleteTrainingById(training.id);
          await loadAdminTrainings();
        } catch (error) {
          console.error(error);
          alert("Schulung konnte nicht gelöscht werden.");
        }
      }
    }));
  });
}

async function createTrainingFromForm(formData) {
  await addDoc(collection(db, "trainings"), formData);
}

async function updateTrainingFromForm(trainingId, formData) {
  await updateDoc(doc(db, "trainings", trainingId), formData);
}

async function deleteTrainingById(trainingId) {
  await deleteDoc(doc(db, "trainings", trainingId));
}

function resetTrainingForm() {
  if (!createTrainingForm) return;

  createTrainingForm.reset();
  if (editTrainingIdInput) editTrainingIdInput.value = "";
  if (saveTrainingBtn) saveTrainingBtn.textContent = "Schulung anlegen";
  setCreateTrainingMessage("");
}

function fillTrainingFormForEdit(training) {
  if (!training) return;

  if (editTrainingIdInput) editTrainingIdInput.value = training.id;
  document.getElementById("new-training-title").value = training.title || "";
  document.getElementById("new-training-url").value = training.url || "";
  document.getElementById("new-training-active").value = String(training.active !== false);

  document
    .querySelectorAll('#new-training-bereiche input[type="checkbox"]')
    .forEach((checkbox) => {
      const value = parseInt(checkbox.value, 10);
      checkbox.checked = Array.isArray(training.bereiche) && training.bereiche.includes(value);
    });

  if (saveTrainingBtn) saveTrainingBtn.textContent = "Schulung speichern";
  setCreateTrainingMessage("Bearbeitungsmodus aktiv.", false);
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
    const userId = editUserIdInput?.value || "";

    const name = document.getElementById("new-user-name").value.trim();
    const email = document.getElementById("new-user-email").value.trim();
    const password = document.getElementById("new-user-password").value.trim();
    const role = document.getElementById("new-user-role").value;
    const bereiche = Array.from(
      document.querySelectorAll('#new-user-bereiche input[type="checkbox"]:checked')
    ).map((checkbox) => parseInt(checkbox.value, 10));
    const extraTrainings = Array.from(
      document.querySelectorAll('#new-user-extra-trainings input[type="checkbox"]:checked')
    ).map(cb => cb.value);
    const supervisorId = document.getElementById("new-user-supervisor").value;
    const startDate = document.getElementById("new-user-start").value;
    const endDate = document.getElementById("new-user-end").value;
    const active = document.getElementById("new-user-active").value === "true";

    if (!name || !email || !role) {
      setCreateUserMessage("Bitte alle Pflichtfelder ausfüllen.", true);
      return;
    }

    const data = {
      name,
      email,
      role,
      bereiche,
      supervisorId,
      startDate,
      endDate,
      active,
      extraTrainings
    };

    if (userId) {
      await updateUserProfile(userId, data);
      setCreateUserMessage("Benutzer wurde aktualisiert.", false);
    } else {
      if (!password) {
        setCreateUserMessage("Für neue Benutzer ist ein Start-Passwort erforderlich.", true);
        return;
      }

      const result = await createPortalUserFromForm({
        ...data,
        password
      });

      setCreateUserMessage(`Benutzer wurde angelegt. UID: ${result.uid}`, false);
    }

    resetUserForm();
    await loadAdminUsers();
  } catch (error) {
    console.error(error);
    setCreateUserMessage(`Fehler: ${error.message}`, true);
  }
});

createTrainingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setCreateTrainingMessage("");

  try {
    const trainingId = editTrainingIdInput?.value || "";
    const title = document.getElementById("new-training-title").value.trim();
    const url = document.getElementById("new-training-url").value.trim();
    const active = document.getElementById("new-training-active").value === "true";

    const bereiche = Array.from(
      document.querySelectorAll('#new-training-bereiche input[type="checkbox"]:checked')
    ).map((checkbox) => parseInt(checkbox.value, 10));

    if (!title || !url) {
      setCreateTrainingMessage("Bitte Titel und Link eingeben.", true);
      return;
    }

    const formData = {
      title,
      url,
      bereiche,
      active
    };

    if (trainingId) {
      await updateTrainingFromForm(trainingId, formData);
      setCreateTrainingMessage("Schulung wurde gespeichert.", false);
    } else {
      await createTrainingFromForm(formData);
      setCreateTrainingMessage("Schulung wurde angelegt.", false);
    }

    resetTrainingForm();
    await loadAdminTrainings();
  } catch (error) {
    console.error(error);
    setCreateTrainingMessage("Schulung konnte nicht gespeichert werden.", true);
  }
});

cancelTrainingEditBtn?.addEventListener("click", () => {
  resetTrainingForm();
});

cancelUserEditBtn?.addEventListener("click", () => {
  resetUserForm();
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