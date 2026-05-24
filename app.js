const DB_NAME = "dhSatPractice";
const DB_VERSION = 1;
const STORES = ["users", "tests", "attempts", "settings"];
const MODULES = [
  { key: "rw1", title: "Reading and Writing Module 1", short: "RW 1", area: "rw", duration: 32 },
  { key: "rw2", title: "Reading and Writing Module 2", short: "RW 2", area: "rw", duration: 32 },
  { key: "math1", title: "Math Module 1", short: "Math 1", area: "math", duration: 35 },
  { key: "math2", title: "Math Module 2", short: "Math 2", area: "math", duration: 35 }
];

const DEFAULT_ADMIN = {
  username: "admin",
  password: "admin123",
  resetPhrase: "dnh-reset"
};

const app = document.querySelector("#app");
const state = {
  db: null,
  user: null,
  view: "login",
  authMode: "login",
  adminTab: "upload",
  message: null,
  tests: [],
  attempts: [],
  users: [],
  uploadDraft: null,
  editingTest: null,
  activeTest: null,
  activeAttempt: null,
  activeModule: "rw1",
  activeQuestion: 0,
  timer: null,
  timerLeft: 0,
  sortScores: "date"
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  state.db = await openDatabase();
  await seedAdmin();
  await refreshData();
  const savedUserId = localStorage.getItem("dhSatUserId");
  if (savedUserId) {
    const savedUser = await getById("users", savedUserId);
    if (savedUser) {
      state.user = savedUser;
      state.view = savedUser.role === "admin" ? "admin" : "dashboard";
    }
  }
  render();
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("users")) {
        const users = db.createObjectStore("users", { keyPath: "id" });
        users.createIndex("username", "username", { unique: true });
        users.createIndex("role", "role", { unique: false });
      }
      if (!db.objectStoreNames.contains("tests")) {
        const tests = db.createObjectStore("tests", { keyPath: "id" });
        tests.createIndex("folder", "folder", { unique: false });
        tests.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("attempts")) {
        const attempts = db.createObjectStore("attempts", { keyPath: "id" });
        attempts.createIndex("userId", "userId", { unique: false });
        attempts.createIndex("testId", "testId", { unique: false });
        attempts.createIndex("completedAt", "completedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeName, mode = "readonly") {
  return state.db.transaction(storeName, mode).objectStore(storeName);
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function getById(storeName, id) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function put(storeName, item) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").put(item);
    request.onsuccess = () => resolve(item);
    request.onerror = () => reject(request.error);
  });
}

function remove(storeName, id) {
  return new Promise((resolve, reject) => {
    const request = tx(storeName, "readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function seedAdmin() {
  const users = await getAll("users");
  if (users.some((u) => u.role === "admin")) return;
  const salt = makeId("salt");
  const resetSalt = makeId("salt");
  await put("users", {
    id: makeId("user"),
    role: "admin",
    name: "D&H Admin",
    username: DEFAULT_ADMIN.username,
    salt,
    passwordHash: await hashText(DEFAULT_ADMIN.password + salt),
    resetSalt,
    resetHash: await hashText(DEFAULT_ADMIN.resetPhrase + resetSalt),
    createdAt: new Date().toISOString()
  });
}

async function refreshData() {
  const [tests, attempts, users] = await Promise.all([getAll("tests"), getAll("attempts"), getAll("users")]);
  state.tests = tests.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  state.attempts = attempts.sort((a, b) => (b.completedAt || b.startedAt || "").localeCompare(a.completedAt || a.startedAt || ""));
  state.users = users.sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username));
}

async function hashText(text) {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function todayFolder() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textToHtml(value = "") {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function normalizeText(value = "") {
  return String(value)
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatDate(value) {
  if (!value) return "Not finished";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function render() {
  clearTimer();
  if (state.view === "test") {
    renderTest();
    return;
  }
  if (state.view === "score") {
    renderScore();
    return;
  }

  const isAuthed = Boolean(state.user);
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <img src="./assets/dnh-logo.png" alt="D&H College">
          <div class="brand-title">
            <strong>SAT Practice</strong>
            <span>D&H College styled personal practice portal</span>
          </div>
        </div>
        <div class="top-actions">
          ${isAuthed ? `<span class="pill blue">${escapeHtml(state.user.name || state.user.username)}</span>` : ""}
          ${isAuthed ? `<button class="btn" data-action="logout"><i data-lucide="log-out"></i>Log out</button>` : ""}
        </div>
      </header>
      ${isAuthed ? `<main class="main">${state.user.role === "admin" ? renderAdmin() : renderDashboard()}</main>` : renderAuth()}
    </div>
  `;
  bindGlobal();
  if (window.lucide) window.lucide.createIcons();
}

function renderAuth() {
  return `
    <main class="auth-wrap">
      <section class="auth-card">
        <div class="auth-info">
          <img src="./assets/dnh-logo.png" alt="D&H College">
          <h1>Digital SAT practice, kept simple.</h1>
          <p>Upload tests as an admin, review the extracted questions, then students can practice with SAT-style navigation, scoring, highlighting, and history.</p>
          <div class="pill-row">
            <span class="pill blue">Local private storage</span>
            <span class="pill green">Admin uploads</span>
            <span class="pill amber">PDF review step</span>
          </div>
        </div>
        <div class="auth-panel">
          <div class="tabs" aria-label="Account options">
            ${authTab("login", "Log in")}
            ${authTab("register", "Create account")}
            ${authTab("reset", "Reset password")}
          </div>
          ${state.message ? messageHtml(state.message) : ""}
          ${state.authMode === "register" ? renderRegisterForm() : state.authMode === "reset" ? renderResetForm() : renderLoginForm()}
        </div>
      </section>
    </main>
  `;
}

function authTab(mode, label) {
  return `<button class="tab-btn ${state.authMode === mode ? "active" : ""}" data-auth-mode="${mode}">${label}</button>`;
}

function renderLoginForm() {
  return `
    <form class="grid" data-form="login">
      <div class="field">
        <label for="login-username">Username</label>
        <input id="login-username" name="username" autocomplete="username" required>
      </div>
      <div class="field">
        <label for="login-password">Password</label>
        <input id="login-password" name="password" type="password" autocomplete="current-password" required>
      </div>
      <button class="btn primary" type="submit"><i data-lucide="log-in"></i>Log in</button>
      <p class="muted">Default admin: username <strong>admin</strong>, password <strong>admin123</strong>. Change it after first use.</p>
    </form>
  `;
}

function renderRegisterForm() {
  return `
    <form class="grid" data-form="register">
      <div class="form-grid">
        <div class="field">
          <label for="name">Student name</label>
          <input id="name" name="name" required>
        </div>
        <div class="field">
          <label for="username">Username</label>
          <input id="username" name="username" autocomplete="username" required>
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="new-password" minlength="6" required>
        </div>
        <div class="field">
          <label for="resetPhrase">Reset phrase</label>
          <input id="resetPhrase" name="resetPhrase" placeholder="A private phrase you can remember" required>
        </div>
      </div>
      <button class="btn primary" type="submit"><i data-lucide="user-plus"></i>Create student account</button>
    </form>
  `;
}

function renderResetForm() {
  return `
    <form class="grid" data-form="reset">
      <div class="form-grid">
        <div class="field">
          <label for="reset-username">Username</label>
          <input id="reset-username" name="username" autocomplete="username" required>
        </div>
        <div class="field">
          <label for="reset-phrase">Reset phrase</label>
          <input id="reset-phrase" name="resetPhrase" required>
        </div>
        <div class="field full">
          <label for="new-password">New password</label>
          <input id="new-password" name="password" type="password" autocomplete="new-password" minlength="6" required>
        </div>
      </div>
      <button class="btn primary" type="submit"><i data-lucide="key-round"></i>Reset password</button>
    </form>
  `;
}

function renderDashboard() {
  const studentAttempts = state.attempts.filter((a) => a.userId === state.user.id && a.status === "completed");
  const availableTests = state.tests.filter((t) => t.status !== "archived");
  const bestScore = studentAttempts.length ? Math.max(...studentAttempts.map((a) => a.score?.total || 0)) : 0;
  const lastAttempt = studentAttempts[0];
  return `
    <section class="view-title">
      <div>
        <h1>Practice Dashboard</h1>
        <p>Choose an uploaded SAT, move question to question, and keep a clear record of every score.</p>
      </div>
    </section>
    <div class="stat-row">
      <div class="stat"><span>Available tests</span><strong>${availableTests.length}</strong></div>
      <div class="stat"><span>Completed</span><strong>${studentAttempts.length}</strong></div>
      <div class="stat"><span>Best score</span><strong>${bestScore || "--"}</strong></div>
      <div class="stat"><span>Last score</span><strong>${lastAttempt?.score?.total || "--"}</strong></div>
    </div>
    <div class="grid two">
      <section class="panel">
        <h2>Uploaded SATs</h2>
        ${availableTests.length ? `<div class="test-list">${availableTests.map(renderStudentTestCard).join("")}</div>` : emptyState("No SATs have been uploaded yet.", "Ask the admin to upload a PDF and answer key first.")}
      </section>
      <section class="panel">
        <h2>Previous Scores</h2>
        ${studentAttempts.length ? renderAttemptTable(studentAttempts, false) : emptyState("No completed attempts yet.", "Your first finished practice test will appear here.")}
      </section>
    </div>
  `;
}

function renderStudentTestCard(test) {
  const count = countQuestions(test);
  const latest = state.attempts.find((a) => a.userId === state.user.id && a.testId === test.id && a.status === "completed");
  return `
    <article class="test-card">
      <header>
        <div>
          <h3>${escapeHtml(test.title)}</h3>
          <p class="muted">${escapeHtml(test.folder)} folder - ${count} questions</p>
        </div>
        <button class="btn primary" data-start-test="${test.id}"><i data-lucide="play"></i>Start</button>
      </header>
      <div class="pill-row">
        ${MODULES.map((m) => `<span class="pill">${m.short}: ${getModule(test, m.key).questions.length}</span>`).join("")}
        ${latest ? `<span class="pill green">Last: ${latest.score.total}</span>` : `<span class="pill amber">Not taken</span>`}
      </div>
    </article>
  `;
}

function renderAdmin() {
  return `
    <section class="view-title">
      <div>
        <h1>Admin Console</h1>
        <p>Upload SAT PDFs, review extracted questions, organize students, and monitor scores.</p>
      </div>
      <div class="button-row">
        <button class="btn secondary" data-action="export-data"><i data-lucide="download"></i>Export backup</button>
        <label class="btn">
          <i data-lucide="upload"></i>Import backup
          <input class="hidden" type="file" accept="application/json" data-action="import-data">
        </label>
      </div>
    </section>
    ${state.message ? messageHtml(state.message) : ""}
    <div class="admin-layout">
      <nav class="side-nav" aria-label="Admin navigation">
        ${adminNav("upload", "Upload SAT", "file-up")}
        ${adminNav("tests", "Saved Tests", "folder")}
        ${adminNav("students", "Students", "users")}
        ${adminNav("scores", "Scores", "bar-chart-3")}
        ${adminNav("settings", "Settings", "settings")}
      </nav>
      <section>
        ${state.adminTab === "tests" ? renderAdminTests() : ""}
        ${state.adminTab === "students" ? renderAdminStudents() : ""}
        ${state.adminTab === "scores" ? renderAdminScores() : ""}
        ${state.adminTab === "settings" ? renderAdminSettings() : ""}
        ${state.adminTab === "upload" ? renderUpload() : ""}
      </section>
    </div>
  `;
}

function adminNav(tab, label, icon) {
  return `<button class="btn ${state.adminTab === tab ? "primary" : "ghost"}" data-admin-tab="${tab}"><i data-lucide="${icon}"></i>${label}</button>`;
}

function renderUpload() {
  if (state.editingTest) return renderReviewEditor(state.editingTest, true);
  if (state.uploadDraft) return renderReviewEditor(state.uploadDraft, false);
  return `
    <section class="panel upload-zone">
      <div>
        <h2>Upload and Extract SAT</h2>
        <p class="muted">Upload the question PDF plus an answer sheet. The app extracts text, separates questions, matches answers, and then gives you a review screen before saving.</p>
      </div>
      <form class="grid" data-form="upload">
        <div class="form-grid">
          <div class="field">
            <label for="test-title">Test title</label>
            <input id="test-title" name="title" placeholder="December SAT Practice 2" required>
          </div>
          <div class="field">
            <label for="folder">Date folder</label>
            <input id="folder" name="folder" type="date" value="${todayFolder()}" required>
          </div>
          <div class="field full drop-panel">
            <label for="pdf-file">SAT question PDF</label>
            <input id="pdf-file" name="pdfFile" type="file" accept="application/pdf" required>
          </div>
          <div class="field drop-panel">
            <label for="answer-file">Answer sheet PDF, TXT, CSV, or JSON</label>
            <input id="answer-file" name="answerFile" type="file" accept="application/pdf,text/plain,text/csv,application/json">
          </div>
          <div class="field">
            <label for="answer-text">Or paste answer key</label>
            <textarea id="answer-text" name="answerText" placeholder="Example: RW1 1 A&#10;RW1 2 C&#10;Math 1 1 D"></textarea>
          </div>
          <div class="field drop-panel">
            <label for="grading-file">Optional grading system CSV or JSON</label>
            <input id="grading-file" name="gradingFile" type="file" accept="text/csv,application/json,text/plain">
          </div>
          <div class="field">
            <label for="grading-text">Or paste grading system</label>
            <textarea id="grading-text" name="gradingText" placeholder="section,raw,score&#10;rw,0,200&#10;rw,54,800&#10;math,0,200&#10;math,44,800"></textarea>
          </div>
          <div class="field full">
            <label>
              <input type="checkbox" name="ocrMode" value="on">
              Use OCR for scanned/image PDFs
            </label>
            <p class="muted">Text PDFs extract quickly. OCR is slower, but it helps with scanned practice PDFs like image-only answer sheets.</p>
          </div>
        </div>
        <div class="button-row">
          <button class="btn primary" type="submit"><i data-lucide="wand-sparkles"></i>Extract for review</button>
          <button class="btn" type="button" data-action="manual-test"><i data-lucide="plus"></i>Start manual editor</button>
        </div>
      </form>
    </section>
  `;
}

function renderReviewEditor(testLike, isExisting) {
  const total = countQuestions(testLike);
  const pdfUrl = testLike.pdfBlob ? URL.createObjectURL(testLike.pdfBlob) : "";
  return `
    <div class="review-layout">
      <section class="module-review">
        <div class="panel">
          <div class="folder-header">
            <div>
              <h2>${isExisting ? "Edit Saved Test" : "Review Extracted Test"}</h2>
              <p class="muted">${escapeHtml(testLike.title)} - ${escapeHtml(testLike.folder)} - ${total} questions</p>
            </div>
            <div class="button-row">
              <button class="btn" data-action="back-upload"><i data-lucide="arrow-left"></i>Back</button>
              <button class="btn secondary" data-action="auto-balance"><i data-lucide="shuffle"></i>Auto-balance</button>
              <button class="btn primary" data-action="${isExisting ? "update-test" : "save-test"}"><i data-lucide="save"></i>${isExisting ? "Update test" : "Save test"}</button>
            </div>
          </div>
        </div>
        ${MODULES.map((module) => renderModuleEditor(testLike, module)).join("")}
      </section>
      <aside class="review-tools">
        <section class="panel">
          <h3>Review Checklist</h3>
          <div class="pill-row">
            <span class="pill ${total ? "green" : "amber"}">${total} questions</span>
            <span class="pill ${missingAnswers(testLike) ? "amber" : "green"}">${missingAnswers(testLike)} missing answers</span>
            <span class="pill ${lowConfidence(testLike) ? "amber" : "green"}">${lowConfidence(testLike)} need review</span>
            <span class="pill ${testLike.scoring ? "green" : "amber"}">${testLike.scoring ? "Custom grading" : "Estimated grading"}</span>
          </div>
          <p class="muted">Open every amber item, compare it with the PDF, then save. You can edit text, answers, modules, and choices here.</p>
          <button class="btn" data-action="add-question"><i data-lucide="plus"></i>Add question</button>
        </section>
        <section class="panel">
          <h3>PDF Preview</h3>
          <div class="pdf-preview">
            ${pdfUrl ? `<iframe src="${pdfUrl}" title="Uploaded PDF preview"></iframe>` : `<div class="empty-state"><p>No PDF preview.</p></div>`}
          </div>
        </section>
      </aside>
    </div>
  `;
}

function renderModuleEditor(testLike, module) {
  const mod = getModule(testLike, module.key);
  return `
    <section class="panel" data-module-editor="${module.key}">
      <div class="folder-header">
        <div>
          <h3>${module.title}</h3>
          <p class="muted">${mod.questions.length} questions - ${module.duration} minutes default</p>
        </div>
        <button class="btn small" data-add-module-question="${module.key}"><i data-lucide="plus"></i>Add here</button>
      </div>
      <div class="grid">
        ${mod.questions.length ? mod.questions.map((q, index) => renderQuestionEditor(q, module.key, index)).join("") : `<div class="empty-state"><p>No questions in this module yet.</p></div>`}
      </div>
    </section>
  `;
}

function renderQuestionEditor(q, moduleKey, index) {
  const confidenceClass = q.confidence >= 80 ? "green" : q.confidence >= 55 ? "amber" : "";
  return `
    <article class="question-card" data-question-editor="${q.id}">
      <header>
        <div>
          <h3>Question ${index + 1}</h3>
          <span class="pill ${confidenceClass}">Confidence ${Math.round(q.confidence || 0)}%</span>
        </div>
        <div class="button-row">
          <select data-q-field="moduleKey" aria-label="Move question module">
            ${MODULES.map((m) => `<option value="${m.key}" ${moduleKey === m.key ? "selected" : ""}>${m.short}</option>`).join("")}
          </select>
          <button class="btn small danger" data-delete-question="${q.id}"><i data-lucide="trash-2"></i>Delete</button>
        </div>
      </header>
      <div class="form-grid">
        <div class="field full">
          <label>Question text / passage</label>
          <textarea data-q-field="stem">${escapeHtml(q.stem || "")}</textarea>
        </div>
        <div class="field">
          <label>Type</label>
          <select data-q-field="type">
            <option value="multiple" ${q.type !== "grid" ? "selected" : ""}>Multiple choice</option>
            <option value="grid" ${q.type === "grid" ? "selected" : ""}>Student-produced response</option>
          </select>
        </div>
        <div class="field">
          <label>Correct answer</label>
          <input data-q-field="correct" value="${escapeHtml(q.correct || "")}" placeholder="A, B, C, D, or numeric">
        </div>
        <div class="field full">
          <label>Choices</label>
          <div class="choice-grid">
            ${["A", "B", "C", "D"].map((letter) => `
              <input data-q-choice="${letter}" value="${escapeHtml(q.choices?.[letter] || "")}" placeholder="${letter}. answer text">
            `).join("")}
          </div>
        </div>
        <div class="field full">
          <label>Explanation or note</label>
          <textarea data-q-field="explanation">${escapeHtml(q.explanation || "")}</textarea>
        </div>
      </div>
    </article>
  `;
}

function renderAdminTests() {
  const grouped = groupBy(state.tests, (t) => t.folder || "No date");
  const folders = Object.keys(grouped).sort().reverse();
  return `
    <section class="panel">
      <h2>Saved Tests by Date Folder</h2>
      ${folders.length ? `<div class="folder-list">${folders.map((folder) => `
        <section class="test-card">
          <div class="folder-header">
            <div>
              <h3>${escapeHtml(folder)}</h3>
              <p class="muted">${grouped[folder].length} saved SAT${grouped[folder].length === 1 ? "" : "s"}</p>
            </div>
          </div>
          <div class="test-list">
            ${grouped[folder].map(renderAdminTestCard).join("")}
          </div>
        </section>
      `).join("")}</div>` : emptyState("No saved tests yet.", "Upload your first PDF from the Upload SAT tab.")}
    </section>
  `;
}

function renderAdminTestCard(test) {
  const attempts = state.attempts.filter((a) => a.testId === test.id && a.status === "completed");
  return `
    <article class="test-card">
      <header>
        <div>
          <h3>${escapeHtml(test.title)}</h3>
          <p class="muted">${countQuestions(test)} questions - ${attempts.length} completed attempt${attempts.length === 1 ? "" : "s"}</p>
        </div>
        <div class="button-row">
          <button class="btn small" data-edit-test="${test.id}"><i data-lucide="pencil"></i>Edit</button>
          <button class="btn small danger" data-delete-test="${test.id}"><i data-lucide="trash-2"></i>Delete</button>
        </div>
      </header>
      <div class="pill-row">
        ${MODULES.map((m) => `<span class="pill">${m.short}: ${getModule(test, m.key).questions.length}</span>`).join("")}
      </div>
    </article>
  `;
}

function renderAdminStudents() {
  const students = state.users.filter((u) => u.role === "student");
  return `
    <section class="grid">
      <div class="panel">
        <div class="folder-header">
          <div>
            <h2>Students</h2>
            <p class="muted">See student accounts, reset passwords, and open their attempt history.</p>
          </div>
          <button class="btn primary" data-action="show-create-student"><i data-lucide="user-plus"></i>Add student</button>
        </div>
      </div>
      ${state.message?.kind === "student-form" ? renderAdminCreateStudent() : ""}
      ${students.length ? `<div class="student-list">${students.map(renderStudentAdminCard).join("")}</div>` : emptyState("No students yet.", "Students can create accounts, or you can add one here.")}
    </section>
  `;
}

function renderAdminCreateStudent() {
  return `
    <section class="panel">
      <form class="grid" data-form="admin-create-student">
        <div class="form-grid">
          <div class="field"><label>Name</label><input name="name" required></div>
          <div class="field"><label>Username</label><input name="username" required></div>
          <div class="field"><label>Password</label><input name="password" type="password" minlength="6" required></div>
          <div class="field"><label>Reset phrase</label><input name="resetPhrase" required></div>
        </div>
        <div class="button-row">
          <button class="btn primary" type="submit"><i data-lucide="save"></i>Create student</button>
          <button class="btn" type="button" data-action="cancel-message">Cancel</button>
        </div>
      </form>
    </section>
  `;
}

function renderStudentAdminCard(user) {
  const attempts = state.attempts.filter((a) => a.userId === user.id && a.status === "completed");
  const best = attempts.length ? Math.max(...attempts.map((a) => a.score.total)) : "--";
  return `
    <article class="student-card">
      <header>
        <div>
          <h3>${escapeHtml(user.name || user.username)}</h3>
          <p class="muted">@${escapeHtml(user.username)} - ${attempts.length} attempt${attempts.length === 1 ? "" : "s"} - best ${best}</p>
        </div>
        <div class="button-row">
          <button class="btn small" data-reset-student="${user.id}"><i data-lucide="key-round"></i>Reset password</button>
          <button class="btn small danger" data-delete-student="${user.id}"><i data-lucide="user-x"></i>Delete</button>
        </div>
      </header>
      ${attempts.length ? renderAttemptTable(attempts, true) : `<p class="muted">No completed tests yet.</p>`}
    </article>
  `;
}

function renderAdminScores() {
  let attempts = state.attempts.filter((a) => a.status === "completed");
  if (state.sortScores === "score") {
    attempts = attempts.sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0));
  } else if (state.sortScores === "student") {
    attempts = attempts.sort((a, b) => userName(a.userId).localeCompare(userName(b.userId)));
  } else {
    attempts = attempts.sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  }
  return `
    <section class="panel">
      <div class="folder-header">
        <div>
          <h2>All Scores</h2>
          <p class="muted">Sortable completed attempts from every student.</p>
        </div>
        <div class="segmented">
          ${scoreSortButton("date", "Newest")}
          ${scoreSortButton("score", "Score")}
          ${scoreSortButton("student", "Student")}
        </div>
      </div>
      ${attempts.length ? renderAttemptTable(attempts, true) : emptyState("No completed attempts yet.", "Student scores will appear here after tests are submitted.")}
    </section>
  `;
}

function scoreSortButton(key, label) {
  return `<button class="segment-btn ${state.sortScores === key ? "active" : ""}" data-score-sort="${key}">${label}</button>`;
}

function renderAdminSettings() {
  const admin = state.users.find((u) => u.role === "admin");
  return `
    <section class="grid">
      <div class="panel">
        <h2>Admin Password</h2>
        <form class="grid" data-form="admin-password">
          <div class="form-grid">
            <div class="field"><label>Current password</label><input name="currentPassword" type="password" required></div>
            <div class="field"><label>New password</label><input name="newPassword" type="password" minlength="6" required></div>
            <div class="field full"><label>New reset phrase</label><input name="resetPhrase" required></div>
          </div>
          <button class="btn primary" type="submit"><i data-lucide="save"></i>Update admin login</button>
        </form>
      </div>
      <div class="panel">
        <h2>Storage</h2>
        <p class="muted">The site stores PDFs, tests, users, and attempts in this browser. Use backups before clearing browser data.</p>
        <div class="pill-row">
          <span class="pill blue">${state.tests.length} tests</span>
          <span class="pill green">${state.users.filter((u) => u.role === "student").length} students</span>
          <span class="pill amber">${state.attempts.length} attempts</span>
          <span class="pill">Admin: ${escapeHtml(admin?.username || "admin")}</span>
        </div>
      </div>
    </section>
  `;
}

function renderAttemptTable(attempts, includeStudent) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${includeStudent ? "<th>Student</th>" : ""}
            <th>Test</th>
            <th>Date</th>
            <th>Total</th>
            <th>Reading/Writing</th>
            <th>Math</th>
            <th>Raw</th>
          </tr>
        </thead>
        <tbody>
          ${attempts.map((a) => `
            <tr>
              ${includeStudent ? `<td>${escapeHtml(userName(a.userId))}</td>` : ""}
              <td>${escapeHtml(testTitle(a.testId))}</td>
              <td>${formatDate(a.completedAt)}</td>
              <td><strong>${a.score?.total || "--"}</strong></td>
              <td>${a.score?.rw || "--"}</td>
              <td>${a.score?.math || "--"}</td>
              <td>${a.score?.correct || 0}/${a.score?.totalQuestions || 0}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderTest() {
  const test = state.activeTest;
  const attempt = state.activeAttempt;
  const module = getModule(test, state.activeModule);
  const question = module.questions[state.activeQuestion] || module.questions[0];
  if (!question) {
    submitAttempt();
    return;
  }
  const answer = attempt.answers[question.id] || "";
  const isMath = MODULES.find((m) => m.key === state.activeModule)?.area === "math";
  const annotated = attempt.annotations[question.id] || textToHtml(question.stem);
  app.innerHTML = `
    <div class="test-shell">
      <header class="exam-topbar">
        <div class="exam-brand">
          <img src="./assets/dnh-logo.png" alt="D&H College">
          <div class="exam-title">
            <strong>${escapeHtml(test.title)}</strong>
            <span class="muted">${escapeHtml(module.title)}</span>
          </div>
        </div>
        <div class="timer" aria-label="Time remaining">${formatTime(state.timerLeft)}</div>
        <div class="exam-actions">
          ${isMath ? `<button class="btn" data-action="formula-sheet"><i data-lucide="calculator"></i>Formulas</button>` : ""}
          <button class="btn ${attempt.flags.includes(question.id) ? "warning" : ""}" data-action="toggle-flag"><i data-lucide="flag"></i>${attempt.flags.includes(question.id) ? "Flagged" : "Flag"}</button>
          <button class="btn" data-action="exit-test"><i data-lucide="x"></i>Exit</button>
        </div>
      </header>
      <main class="exam-body">
        <section class="stimulus-pane">
          <div class="question-number">
            <strong>${state.activeQuestion + 1}</strong>
            <div class="annotation-toolbar">
              <button class="btn small" data-annotate="highlight"><i data-lucide="highlighter"></i>Highlight</button>
              <button class="btn small" data-annotate="underline"><i data-lucide="underline"></i>Underline</button>
              <button class="btn small" data-annotate="clear"><i data-lucide="eraser"></i>Clear marks</button>
            </div>
          </div>
          <article id="stimulus" class="stimulus-content" contenteditable="true" spellcheck="false">${annotated}</article>
        </section>
        <section class="answer-pane">
          <div class="answer-card">
            <h2>Choose your answer</h2>
            ${question.type === "grid" ? renderGridAnswer(question, answer, isMath) : renderChoices(question, answer)}
          </div>
        </section>
      </main>
      <footer class="exam-footer">
        <nav class="question-nav" aria-label="Questions">
          ${module.questions.map((q, index) => `
            <button class="nav-cell ${index === state.activeQuestion ? "current" : ""} ${attempt.answers[q.id] ? "answered" : ""} ${attempt.flags.includes(q.id) ? "flagged" : ""}" data-go-question="${index}">${index + 1}</button>
          `).join("")}
        </nav>
        <div class="button-row">
          <button class="btn" data-action="prev-question"><i data-lucide="chevron-left"></i>Back</button>
          <button class="btn primary" data-action="next-question">${isLastQuestionInModule() ? "Next module" : "Next"}<i data-lucide="chevron-right"></i></button>
          <button class="btn warning" data-action="submit-test"><i data-lucide="send"></i>Submit</button>
        </div>
      </footer>
      ${renderFormulaSheet()}
    </div>
  `;
  bindTest();
  startTimer();
  if (window.lucide) window.lucide.createIcons();
}

function renderChoices(question, answer) {
  const choices = question.choices || {};
  const letters = ["A", "B", "C", "D"].filter((letter) => choices[letter]);
  const usableLetters = letters.length ? letters : ["A", "B", "C", "D"];
  return `
    <div class="choice-list">
      ${usableLetters.map((letter) => `
        <button class="choice-btn ${answer === letter ? "active" : ""}" data-answer="${letter}">
          <span class="choice-letter">${letter}</span>
          <span>${escapeHtml(choices[letter] || `${letter}.`)}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderGridAnswer(question, answer, isMath) {
  return `
    <div class="grid-answer">
      <label for="grid-answer">Answer</label>
      <input id="grid-answer" data-grid-answer value="${escapeHtml(answer)}" placeholder="Type your answer">
      ${isMath ? `
        <div class="formula-toolbar">
          ${["sqrt()", "pi", "^2", "/", "x"].map((symbol) => `<button class="btn small" data-insert-symbol="${escapeHtml(symbol)}">${escapeHtml(symbol)}</button>`).join("")}
        </div>
      ` : ""}
      <p class="muted">For numeric answers, type one value only, such as 3.5 or 7/2.</p>
      <label for="scratch">Scratch pad</label>
      <textarea id="scratch" class="scratch" placeholder="Use this for notes. It is not graded.">${escapeHtml(state.activeAttempt.scratch?.[question.id] || "")}</textarea>
    </div>
  `;
}

function renderFormulaSheet() {
  return `
    <div class="formula-sheet" id="formula-sheet">
      <div class="formula-box">
        <div class="folder-header">
          <div>
            <h2>SAT Math Formula Sheet</h2>
            <p class="muted">Common formulas for quick reference while practicing.</p>
          </div>
          <button class="btn" data-action="close-formula"><i data-lucide="x"></i>Close</button>
        </div>
        <div class="formula-grid">
          ${[
            ["Circle", "Area = pi r^2; circumference = 2 pi r"],
            ["Triangle", "Area = 1/2 bh; right triangle: a^2 + b^2 = c^2"],
            ["Rectangle", "Area = lw; perimeter = 2l + 2w"],
            ["Volume", "Rectangular prism = lwh; cylinder = pi r^2 h"],
            ["Slope", "m = (y2 - y1) / (x2 - x1)"],
            ["Line", "y = mx + b"],
            ["Quadratic", "x = (-b +/- sqrt(b^2 - 4ac)) / 2a"],
            ["Special triangles", "45-45-90: x, x, x sqrt(2); 30-60-90: x, x sqrt(3), 2x"]
          ].map(([name, formula]) => `<div class="formula-item"><strong>${name}</strong><span>${formula}</span></div>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderScore() {
  const attempt = state.activeAttempt;
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <img src="./assets/dnh-logo.png" alt="D&H College">
          <div class="brand-title"><strong>Score Report</strong><span>${escapeHtml(testTitle(attempt.testId))}</span></div>
        </div>
        <button class="btn primary" data-action="back-dashboard"><i data-lucide="layout-dashboard"></i>Dashboard</button>
      </header>
      <main class="main">
        <section class="score-hero">
          <p class="pill blue">SAT-style score</p>
          <h1>Your practice score</h1>
          <div class="score-number">${attempt.score.total}</div>
          <div class="score-breakdown">
            <div class="stat"><span>Reading and Writing</span><strong>${attempt.score.rw}</strong></div>
            <div class="stat"><span>Math</span><strong>${attempt.score.math}</strong></div>
            <div class="stat"><span>Correct answers</span><strong>${attempt.score.correct}/${attempt.score.totalQuestions}</strong></div>
            <div class="stat"><span>Completed</span><strong>${formatDate(attempt.completedAt)}</strong></div>
          </div>
      <p class="muted">${attempt.score.scoringMode === "custom" ? "This score used the custom raw-to-scale grading table saved with this SAT." : "Digital SAT scoring uses equating tables that are not included in most PDFs. This app converted raw correct answers onto the 200-800 section scale so your practice history stays organized and comparable."}</p>
        </section>
      </main>
    </div>
  `;
  document.querySelector("[data-action='back-dashboard']").addEventListener("click", async () => {
    await refreshData();
    state.view = state.user.role === "admin" ? "admin" : "dashboard";
    state.activeTest = null;
    state.activeAttempt = null;
    render();
  });
  if (window.lucide) window.lucide.createIcons();
}

function bindGlobal() {
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      state.message = null;
      render();
    });
  });
  document.querySelector("[data-action='logout']")?.addEventListener("click", logout);
  document.querySelector("[data-form='login']")?.addEventListener("submit", handleLogin);
  document.querySelector("[data-form='register']")?.addEventListener("submit", handleRegister);
  document.querySelector("[data-form='reset']")?.addEventListener("submit", handleReset);
  document.querySelectorAll("[data-start-test]").forEach((button) => button.addEventListener("click", () => beginTest(button.dataset.startTest)));

  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminTab = button.dataset.adminTab;
      state.message = null;
      state.uploadDraft = null;
      state.editingTest = null;
      render();
    });
  });
  document.querySelector("[data-form='upload']")?.addEventListener("submit", handleUpload);
  document.querySelector("[data-action='manual-test']")?.addEventListener("click", startManualTest);
  document.querySelector("[data-action='back-upload']")?.addEventListener("click", () => {
    state.uploadDraft = null;
    state.editingTest = null;
    state.message = null;
    render();
  });
  document.querySelector("[data-action='save-test']")?.addEventListener("click", saveDraftTest);
  document.querySelector("[data-action='update-test']")?.addEventListener("click", updateEditedTest);
  document.querySelector("[data-action='auto-balance']")?.addEventListener("click", autoBalanceDraft);
  document.querySelector("[data-action='add-question']")?.addEventListener("click", () => addQuestionToDraft("rw1"));
  document.querySelectorAll("[data-add-module-question]").forEach((button) => button.addEventListener("click", () => addQuestionToDraft(button.dataset.addModuleQuestion)));
  document.querySelectorAll("[data-question-editor]").forEach(bindQuestionEditor);
  document.querySelectorAll("[data-delete-question]").forEach((button) => button.addEventListener("click", () => deleteQuestionFromDraft(button.dataset.deleteQuestion)));
  document.querySelectorAll("[data-edit-test]").forEach((button) => button.addEventListener("click", () => editTest(button.dataset.editTest)));
  document.querySelectorAll("[data-delete-test]").forEach((button) => button.addEventListener("click", () => deleteTest(button.dataset.deleteTest)));
  document.querySelector("[data-action='show-create-student']")?.addEventListener("click", () => {
    state.message = { kind: "student-form" };
    render();
  });
  document.querySelector("[data-action='cancel-message']")?.addEventListener("click", () => {
    state.message = null;
    render();
  });
  document.querySelector("[data-form='admin-create-student']")?.addEventListener("submit", handleAdminCreateStudent);
  document.querySelector("[data-form='admin-password']")?.addEventListener("submit", handleAdminPassword);
  document.querySelectorAll("[data-reset-student]").forEach((button) => button.addEventListener("click", () => resetStudentPassword(button.dataset.resetStudent)));
  document.querySelectorAll("[data-delete-student]").forEach((button) => button.addEventListener("click", () => deleteStudent(button.dataset.deleteStudent)));
  document.querySelectorAll("[data-score-sort]").forEach((button) => button.addEventListener("click", () => {
    state.sortScores = button.dataset.scoreSort;
    render();
  }));
  document.querySelector("[data-action='export-data']")?.addEventListener("click", exportData);
  document.querySelector("[data-action='import-data']")?.addEventListener("change", importData);
}

function bindTest() {
  document.querySelectorAll("[data-answer]").forEach((button) => {
    button.addEventListener("click", () => {
      saveCurrentAnnotation();
      const q = currentQuestion();
      state.activeAttempt.answers[q.id] = button.dataset.answer;
      renderTest();
    });
  });
  document.querySelector("[data-grid-answer]")?.addEventListener("input", (event) => {
    const q = currentQuestion();
    state.activeAttempt.answers[q.id] = event.target.value.trim();
  });
  document.querySelector("#scratch")?.addEventListener("input", (event) => {
    const q = currentQuestion();
    state.activeAttempt.scratch[q.id] = event.target.value;
  });
  document.querySelectorAll("[data-insert-symbol]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector("[data-grid-answer]");
      input.value += button.dataset.insertSymbol;
      input.dispatchEvent(new Event("input"));
      input.focus();
    });
  });
  document.querySelectorAll("[data-go-question]").forEach((button) => button.addEventListener("click", () => {
    saveCurrentAnnotation();
    state.activeQuestion = Number(button.dataset.goQuestion);
    renderTest();
  }));
  document.querySelector("[data-action='prev-question']")?.addEventListener("click", () => moveQuestion(-1));
  document.querySelector("[data-action='next-question']")?.addEventListener("click", () => moveQuestion(1));
  document.querySelector("[data-action='toggle-flag']")?.addEventListener("click", toggleFlag);
  document.querySelector("[data-action='submit-test']")?.addEventListener("click", submitAttempt);
  document.querySelector("[data-action='exit-test']")?.addEventListener("click", exitTest);
  document.querySelector("[data-action='formula-sheet']")?.addEventListener("click", () => document.querySelector("#formula-sheet").classList.add("open"));
  document.querySelector("[data-action='close-formula']")?.addEventListener("click", () => document.querySelector("#formula-sheet").classList.remove("open"));
  document.querySelectorAll("[data-annotate]").forEach((button) => button.addEventListener("click", () => annotateSelection(button.dataset.annotate)));
  document.querySelector("#stimulus")?.addEventListener("beforeinput", (event) => {
    if (!event.inputType.startsWith("format")) event.preventDefault();
  });
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const username = String(form.get("username")).trim();
  const password = String(form.get("password"));
  const user = state.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user || user.passwordHash !== await hashText(password + user.salt)) {
    state.message = { type: "error", text: "Username or password is incorrect." };
    render();
    return;
  }
  state.user = user;
  localStorage.setItem("dhSatUserId", user.id);
  state.view = user.role === "admin" ? "admin" : "dashboard";
  state.message = null;
  render();
}

async function handleRegister(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const username = String(form.get("username")).trim();
  if (state.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    state.message = { type: "error", text: "That username is already taken." };
    render();
    return;
  }
  const user = await buildUser({
    role: "student",
    name: String(form.get("name")).trim(),
    username,
    password: String(form.get("password")),
    resetPhrase: String(form.get("resetPhrase"))
  });
  await put("users", user);
  await refreshData();
  state.message = { type: "success", text: "Account created. You can log in now." };
  state.authMode = "login";
  render();
}

async function handleReset(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const username = String(form.get("username")).trim();
  const user = state.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user || user.resetHash !== await hashText(String(form.get("resetPhrase")) + user.resetSalt)) {
    state.message = { type: "error", text: "The username or reset phrase does not match." };
    render();
    return;
  }
  const salt = makeId("salt");
  user.salt = salt;
  user.passwordHash = await hashText(String(form.get("password")) + salt);
  await put("users", user);
  await refreshData();
  state.message = { type: "success", text: "Password reset. You can log in now." };
  state.authMode = "login";
  render();
}

async function buildUser({ role, name, username, password, resetPhrase }) {
  const salt = makeId("salt");
  const resetSalt = makeId("salt");
  return {
    id: makeId("user"),
    role,
    name,
    username,
    salt,
    passwordHash: await hashText(password + salt),
    resetSalt,
    resetHash: await hashText(resetPhrase + resetSalt),
    createdAt: new Date().toISOString()
  };
}

function logout() {
  localStorage.removeItem("dhSatUserId");
  state.user = null;
  state.view = "login";
  state.authMode = "login";
  render();
}

async function handleUpload(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const pdfFile = form.get("pdfFile");
  const answerFile = form.get("answerFile");
  const gradingFile = form.get("gradingFile");
  const title = String(form.get("title")).trim();
  const folder = String(form.get("folder")).trim() || todayFolder();
  const useOcr = form.get("ocrMode") === "on";
  state.message = { text: useOcr ? "Extracting PDF text and running OCR on scanned pages. This can take several minutes for large files." : "Extracting PDF text. Large files can take a moment." };
  render();
  try {
    const pages = await extractPdfText(pdfFile, { useOcr, onProgress: setProgressMessage });
    let answerText = String(form.get("answerText") || "");
    if (answerFile && answerFile.size) {
      answerText += "\n" + await readAnswerFile(answerFile, useOcr);
    }
    const answerMap = parseAnswerKey(answerText);
    let gradingText = String(form.get("gradingText") || "");
    if (gradingFile && gradingFile.size) gradingText += "\n" + await gradingFile.text();
    const scoring = parseGradingSystem(gradingText);
    const draft = buildTestFromText({ title, folder, pdfFile, answerFile, gradingFile, pages, answerMap, scoring });
    state.uploadDraft = draft;
    const scannedWarning = !useOcr && countQuestions(draft) <= 1 && pages.every((p) => p.text.replace(/\s/g, "").length < 80);
    state.message = scannedWarning
      ? { type: "error", text: "This PDF looks scanned, so normal text extraction found almost no text. Go back, enable OCR, and extract again." }
      : { type: "success", text: `Extracted ${countQuestions(draft)} questions. Review before saving.` };
    render();
  } catch (error) {
    state.message = { type: "error", text: `Could not extract the PDF: ${error.message}. Use manual editor or try a text-based PDF.` };
    render();
  }
}

async function ensurePdfJs() {
  if (window.pdfjsLib) {
    configurePdfJs();
    return;
  }
  await loadScript("./vendor/pdf.min.js");
  configurePdfJs();
}

function configurePdfJs() {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.js";
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

function setProgressMessage(text) {
  const box = document.querySelector(".message");
  if (box) box.textContent = text;
}

async function extractPdfText(file, options = {}) {
  if (!file || !file.size) throw new Error("No PDF selected");
  const { useOcr = false, onProgress = () => {} } = options;
  await ensurePdfJs();
  const bytes = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = [];
  const worker = useOcr ? await createOcrWorker(onProgress) : null;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress(`Reading page ${pageNumber} of ${pdf.numPages}...`);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    let text = textContentToLines(content.items);
    if (useOcr && text.replace(/\s/g, "").length < 80) {
      onProgress(`OCR page ${pageNumber} of ${pdf.numPages}...`);
      text = await ocrPdfPage(page, worker);
    }
    pages.push({ page: pageNumber, text });
  }
  if (worker) await worker.terminate();
  return pages;
}

function textContentToLines(items) {
  const rows = new Map();
  for (const item of items) {
    const y = Math.round(item.transform[5]);
    const x = item.transform[4];
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ x, text: item.str });
  }
  return Array.from(rows.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function ensureTesseract() {
  if (window.Tesseract) return;
  await loadScript("./vendor/tesseract/tesseract.min.js");
}

async function createOcrWorker(onProgress) {
  await ensureTesseract();
  return window.Tesseract.createWorker("eng", 1, {
    workerPath: "./vendor/tesseract/worker.min.js",
    corePath: "./vendor/tesseract/tesseract-core.wasm.js",
    langPath: "./vendor/tesseract",
    gzip: true,
    logger: (message) => {
      if (message.status && typeof message.progress === "number") {
        onProgress(`OCR ${message.status}: ${Math.round(message.progress * 100)}%`);
      }
    }
  });
}

async function ocrPdfPage(page, worker) {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  const result = await worker.recognize(canvas);
  return normalizeText(result.data.text);
}

async function readAnswerFile(file, useOcr = false) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const pages = await extractPdfText(file, { useOcr, onProgress: setProgressMessage });
    return pages.map((p) => p.text).join("\n");
  }
  return file.text();
}

function parseAnswerKey(text) {
  const answerMap = { byModule: {}, byNumber: {}, byGlobal: [] };
  const clean = normalizeText(text);
  if (!clean) return answerMap;
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed.answers)) {
      parsed.answers.forEach((item, index) => addAnswer(answerMap, item.module || item.moduleKey, item.question || item.number || index + 1, item.answer));
      return answerMap;
    }
  } catch (_) {
    // Continue with text parsing.
  }
  let currentModule = "";
  const lines = clean.split(/\n+/);
  for (const line of lines) {
    const detected = detectModule(line);
    if (detected) currentModule = detected;
    if (/^\s*module\s*[,|\t]\s*question\s*[,|\t]\s*answer/i.test(line)) continue;
    const delimited = parseDelimitedAnswerLine(line);
    if (delimited) {
      addAnswer(answerMap, delimited.module, delimited.question, delimited.answer);
      currentModule = delimited.module || currentModule;
      continue;
    }
    const moduleInline = detectModule(line);
    const lineWithoutModule = moduleInline ? stripModuleLabel(line) : line;
    const matches = [...lineWithoutModule.matchAll(/(?:^|[\s,;|])(?:Q(?:uestion)?\s*)?(\d{1,2})(?:\s*[\).:-]\s*|\s+)([A-D]|[-+]?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)(?=\b|[\s,;|]|$)/gi)];
    for (const match of matches) addAnswer(answerMap, moduleInline || currentModule, Number(match[1]), match[2].toUpperCase());
  }
  return answerMap;
}

function stripModuleLabel(line) {
  return String(line)
    .replace(/\breading\s*(?:and|&)?\s*writing\s*(?:module\s*)?[12]\b/i, " ")
    .replace(/\brw\s*[12]\b/i, " ")
    .replace(/\bmath\s*(?:module\s*)?[12]\b/i, " ")
    .replace(/\bmodule\s*[12]\s*[:\-]?\s*(?:reading|writing|math)\b/i, " ");
}

function parseDelimitedAnswerLine(line) {
  const parts = line.split(/[,|\t]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const moduleKey = detectModule(parts[0]);
  const question = Number(parts[1]);
  const answer = parts[2];
  if (!moduleKey || !Number.isFinite(question) || !answer) return null;
  return { module: moduleKey, question, answer };
}

function addAnswer(answerMap, moduleName, number, answer) {
  const moduleKey = detectModule(moduleName || "") || "";
  const cleanAnswer = String(answer || "").trim().toUpperCase();
  if (!cleanAnswer) return;
  if (moduleKey) answerMap.byModule[`${moduleKey}:${number}`] = cleanAnswer;
  answerMap.byNumber[number] = cleanAnswer;
  answerMap.byGlobal.push(cleanAnswer);
}

function parseGradingSystem(text) {
  const clean = normalizeText(text);
  if (!clean) return null;
  try {
    const parsed = JSON.parse(clean);
    const rw = normalizeScoreMap(parsed.rw || parsed.readingWriting || parsed.reading_and_writing);
    const math = normalizeScoreMap(parsed.math);
    if (rw || math) return { name: parsed.name || "Custom grading table", rw: rw || {}, math: math || {} };
  } catch (_) {
    // Continue with CSV parsing.
  }
  const scoring = { name: "Custom grading table", rw: {}, math: {} };
  for (const line of clean.split(/\n+/)) {
    if (/^\s*(section|area)\s*,/i.test(line)) continue;
    const parts = line.split(/[,|\t]/).map((part) => part.trim());
    if (parts.length < 3) continue;
    const section = normalizeSection(parts[0]);
    const raw = Number(parts[1]);
    const score = Number(parts[2]);
    if (!section || !Number.isFinite(raw) || !Number.isFinite(score)) continue;
    scoring[section][raw] = clampSectionScore(score);
  }
  return Object.keys(scoring.rw).length || Object.keys(scoring.math).length ? scoring : null;
}

function normalizeScoreMap(map) {
  if (!map || typeof map !== "object") return null;
  const out = {};
  for (const [raw, score] of Object.entries(map)) {
    const rawNumber = Number(raw);
    const scoreNumber = Number(score);
    if (Number.isFinite(rawNumber) && Number.isFinite(scoreNumber)) out[rawNumber] = clampSectionScore(scoreNumber);
  }
  return Object.keys(out).length ? out : null;
}

function normalizeSection(section) {
  const clean = String(section || "").toLowerCase().replace(/[^a-z]/g, "");
  if (clean === "rw" || clean.includes("reading") || clean.includes("writing")) return "rw";
  if (clean.includes("math")) return "math";
  return "";
}

function clampSectionScore(score) {
  return Math.max(200, Math.min(800, Math.round(score / 10) * 10));
}

function buildTestFromText({ title, folder, pdfFile, answerFile, gradingFile, pages, answerMap, scoring }) {
  const test = createEmptyTest({ title, folder, pdfFile, answerFile, gradingFile, scoring });
  const fullText = pages.map((p) => `\n[Page ${p.page}]\n${p.text}`).join("\n");
  const moduleChunks = splitModuleChunks(fullText);
  let globalIndex = 0;
  for (const chunk of moduleChunks) {
    const questions = extractQuestions(chunk.text);
    const moduleKey = chunk.moduleKey || "rw1";
    for (const question of questions) {
      globalIndex += 1;
      const moduleQuestionNumber = getModule(test, moduleKey).questions.length + 1;
      question.correct = answerMap.byModule[`${moduleKey}:${question.number}`] || answerMap.byModule[`${moduleKey}:${moduleQuestionNumber}`] || answerMap.byGlobal[globalIndex - 1] || answerMap.byNumber[question.number] || "";
      question.confidence = confidence(question);
      getModule(test, moduleKey).questions.push(question);
    }
  }
  if (!countQuestions(test)) {
    const text = normalizeText(fullText);
    getModule(test, "rw1").questions.push(newQuestion({ stem: text || "Paste question text here.", confidence: text ? 20 : 0 }));
  }
  renumberTest(test);
  return test;
}

function createEmptyTest({ title, folder, pdfFile, answerFile, gradingFile, scoring } = {}) {
  return {
    id: makeId("test"),
    title,
    folder,
    status: "active",
    pdfName: pdfFile?.name || "",
    answerName: answerFile?.name || "",
    gradingName: gradingFile?.name || "",
    scoring: scoring || null,
    pdfBlob: pdfFile?.size ? pdfFile : null,
    answerBlob: answerFile?.size ? answerFile : null,
    createdBy: state.user?.id || "",
    createdAt: new Date().toISOString(),
    modules: MODULES.map((m) => ({ ...m, questions: [] }))
  };
}

function splitModuleChunks(text) {
  const headingRegex = /(reading\s*(?:and|&)?\s*writing\s*module\s*[12]|math\s*module\s*[12]|module\s*[12]\s*[:\-]?\s*(?:reading|writing|math)|section\s*[12]\s*[:\-]?\s*(?:reading|writing|math))/gi;
  const matches = [...text.matchAll(headingRegex)];
  if (!matches.length) return [{ moduleKey: "rw1", text }];
  const chunks = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = matches[i + 1]?.index ?? text.length;
    chunks.push({ moduleKey: detectModule(matches[i][0]) || "rw1", text: text.slice(start, end) });
  }
  return chunks;
}

function detectModule(value = "") {
  const text = String(value).toLowerCase().replace(/\s+/g, " ").trim();
  const compact = text.replace(/[^a-z0-9]/g, "");
  if (/\bmath\s*(?:module\s*)?2\b/.test(text) || /\bmodule\s*2\s*[:\-]?\s*math\b/.test(text) || compact.includes("math2")) return "math2";
  if (/\bmath\s*(?:module\s*)?1\b/.test(text) || /\bmodule\s*1\s*[:\-]?\s*math\b/.test(text) || compact.includes("math1")) return "math1";
  if (/\brw\s*2\b/.test(text) || /\breading\s*(?:and|&)?\s*writing\s*(?:module\s*)?2\b/.test(text) || compact.includes("rw2")) return "rw2";
  if (/\brw\s*1\b/.test(text) || /\breading\s*(?:and|&)?\s*writing\s*(?:module\s*)?1\b/.test(text) || compact.includes("rw1")) return "rw1";
  if (/\bmodule\s*2\b/.test(text) && !/\bmath\b/.test(text)) return "rw2";
  if (/\bmodule\s*1\b/.test(text) && !/\bmath\b/.test(text)) return "rw1";
  return "";
}

function extractQuestions(text) {
  const clean = normalizeText(text);
  const starts = [...clean.matchAll(/(?:^|\n)\s*(\d{1,2})\s*[\).]\s+/g)];
  const questions = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i].index + (starts[i][0].startsWith("\n") ? 1 : 0);
    const end = starts[i + 1]?.index ?? clean.length;
    const segment = clean.slice(start, end).trim();
    const parsed = parseQuestionSegment(segment, Number(starts[i][1]));
    if (parsed.stem.length > 10) questions.push(parsed);
  }
  return questions;
}

function parseQuestionSegment(segment, number) {
  const withoutNumber = segment.replace(/^\s*\d{1,2}\s*[\).]\s*/, "").trim();
  const optionStart = withoutNumber.search(/(?:^|\n)\s*A\s*[\).]\s+/i);
  const stem = optionStart >= 0 ? withoutNumber.slice(0, optionStart).trim() : withoutNumber;
  const optionText = optionStart >= 0 ? withoutNumber.slice(optionStart).trim() : "";
  const choices = {};
  const optionRegex = /(?:^|\n)\s*([A-D])\s*[\).]\s+([\s\S]*?)(?=(?:\n\s*[A-D]\s*[\).]\s+)|$)/gi;
  let match;
  while ((match = optionRegex.exec(optionText))) {
    choices[match[1].toUpperCase()] = normalizeText(match[2]);
  }
  return newQuestion({
    number,
    stem,
    choices,
    type: Object.keys(choices).length ? "multiple" : "grid"
  });
}

function newQuestion(overrides = {}) {
  const choices = overrides.choices || { A: "", B: "", C: "", D: "" };
  return {
    id: makeId("q"),
    number: overrides.number || 1,
    stem: overrides.stem || "",
    choices: { A: choices.A || "", B: choices.B || "", C: choices.C || "", D: choices.D || "" },
    type: overrides.type || "multiple",
    correct: overrides.correct || "",
    explanation: overrides.explanation || "",
    confidence: overrides.confidence ?? 0
  };
}

function confidence(question) {
  let score = 0;
  if ((question.stem || "").length > 35) score += 35;
  const choiceCount = Object.values(question.choices || {}).filter(Boolean).length;
  if (question.type === "grid" || choiceCount >= 4) score += 35;
  else if (choiceCount >= 2) score += 18;
  if (question.correct) score += 20;
  if (!/^\[Page \d+\]$/.test(question.stem || "")) score += 10;
  return Math.min(100, score);
}

function bindQuestionEditor(card) {
  const qid = card.dataset.questionEditor;
  card.querySelectorAll("[data-q-field]").forEach((input) => {
    input.addEventListener("input", () => updateDraftQuestion(qid, input.dataset.qField, input.value));
    input.addEventListener("change", () => updateDraftQuestion(qid, input.dataset.qField, input.value));
  });
  card.querySelectorAll("[data-q-choice]").forEach((input) => {
    input.addEventListener("input", () => updateDraftChoice(qid, input.dataset.qChoice, input.value));
  });
}

function currentDraft() {
  return state.editingTest || state.uploadDraft;
}

function findQuestionWithModule(test, qid) {
  for (const module of test.modules) {
    const index = module.questions.findIndex((q) => q.id === qid);
    if (index >= 0) return { module, question: module.questions[index], index };
  }
  return null;
}

function updateDraftQuestion(qid, field, value) {
  const draft = currentDraft();
  const found = findQuestionWithModule(draft, qid);
  if (!found) return;
  if (field === "moduleKey") {
    if (found.module.key === value) return;
    found.module.questions.splice(found.index, 1);
    getModule(draft, value).questions.push(found.question);
    renumberTest(draft);
    render();
    return;
  }
  found.question[field] = value;
  found.question.confidence = confidence(found.question);
}

function updateDraftChoice(qid, letter, value) {
  const draft = currentDraft();
  const found = findQuestionWithModule(draft, qid);
  if (!found) return;
  found.question.choices[letter] = value;
  found.question.confidence = confidence(found.question);
}

function addQuestionToDraft(moduleKey) {
  const draft = currentDraft();
  getModule(draft, moduleKey).questions.push(newQuestion({ stem: "Paste or type the question text here.", choices: { A: "", B: "", C: "", D: "" } }));
  renumberTest(draft);
  render();
}

function deleteQuestionFromDraft(qid) {
  const draft = currentDraft();
  const found = findQuestionWithModule(draft, qid);
  if (!found) return;
  found.module.questions.splice(found.index, 1);
  renumberTest(draft);
  render();
}

function autoBalanceDraft() {
  const draft = currentDraft();
  const all = draft.modules.flatMap((m) => m.questions);
  draft.modules.forEach((m) => (m.questions = []));
  const targets = [
    ["rw1", 27],
    ["rw2", 27],
    ["math1", 22],
    ["math2", 22]
  ];
  let cursor = 0;
  for (const [key, size] of targets) {
    getModule(draft, key).questions.push(...all.slice(cursor, cursor + size));
    cursor += size;
  }
  if (cursor < all.length) getModule(draft, "math2").questions.push(...all.slice(cursor));
  renumberTest(draft);
  render();
}

function startManualTest() {
  state.uploadDraft = createEmptyTest({ title: "Manual SAT Practice", folder: todayFolder() });
  MODULES.forEach((m) => getModule(state.uploadDraft, m.key).questions.push(newQuestion({ stem: `Paste question 1 for ${m.title}.` })));
  render();
}

async function saveDraftTest() {
  const draft = state.uploadDraft;
  if (!draft || !countQuestions(draft)) return;
  renumberTest(draft);
  await put("tests", draft);
  await refreshData();
  state.uploadDraft = null;
  state.adminTab = "tests";
  state.message = { type: "success", text: "SAT saved into its date folder." };
  render();
}

async function updateEditedTest() {
  const draft = state.editingTest;
  if (!draft) return;
  renumberTest(draft);
  draft.updatedAt = new Date().toISOString();
  await put("tests", draft);
  await refreshData();
  state.editingTest = null;
  state.adminTab = "tests";
  state.message = { type: "success", text: "Test updated." };
  render();
}

async function editTest(id) {
  state.editingTest = structuredClone(await getById("tests", id));
  state.adminTab = "upload";
  render();
}

async function deleteTest(id) {
  if (!confirm("Delete this test and its attempts?")) return;
  const attempts = state.attempts.filter((a) => a.testId === id);
  await Promise.all(attempts.map((a) => remove("attempts", a.id)));
  await remove("tests", id);
  await refreshData();
  render();
}

async function handleAdminCreateStudent(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const username = String(form.get("username")).trim();
  if (state.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    state.message = { type: "error", text: "That username is already taken." };
    render();
    return;
  }
  await put("users", await buildUser({
    role: "student",
    name: String(form.get("name")).trim(),
    username,
    password: String(form.get("password")),
    resetPhrase: String(form.get("resetPhrase"))
  }));
  await refreshData();
  state.message = { type: "success", text: "Student created." };
  render();
}

async function handleAdminPassword(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const admin = state.users.find((u) => u.id === state.user.id);
  if (admin.passwordHash !== await hashText(String(form.get("currentPassword")) + admin.salt)) {
    state.message = { type: "error", text: "Current password is incorrect." };
    render();
    return;
  }
  admin.salt = makeId("salt");
  admin.passwordHash = await hashText(String(form.get("newPassword")) + admin.salt);
  admin.resetSalt = makeId("salt");
  admin.resetHash = await hashText(String(form.get("resetPhrase")) + admin.resetSalt);
  await put("users", admin);
  state.user = admin;
  await refreshData();
  state.message = { type: "success", text: "Admin login updated." };
  render();
}

async function resetStudentPassword(id) {
  const user = await getById("users", id);
  const password = prompt(`New password for ${user.username}:`);
  if (!password || password.length < 6) return;
  user.salt = makeId("salt");
  user.passwordHash = await hashText(password + user.salt);
  await put("users", user);
  await refreshData();
  state.message = { type: "success", text: "Student password reset." };
  render();
}

async function deleteStudent(id) {
  if (!confirm("Delete this student and their attempts?")) return;
  const attempts = state.attempts.filter((a) => a.userId === id);
  await Promise.all(attempts.map((a) => remove("attempts", a.id)));
  await remove("users", id);
  await refreshData();
  render();
}

async function beginTest(id) {
  const test = await getById("tests", id);
  state.activeTest = test;
  state.activeModule = firstModuleWithQuestions(test)?.key || "rw1";
  state.activeQuestion = 0;
  state.activeAttempt = {
    id: makeId("attempt"),
    testId: test.id,
    userId: state.user.id,
    status: "in-progress",
    startedAt: new Date().toISOString(),
    answers: {},
    flags: [],
    annotations: {},
    scratch: {},
    moduleStartedAt: new Date().toISOString(),
    moduleTimes: {}
  };
  state.timerLeft = moduleMeta(state.activeModule).duration * 60;
  state.view = "test";
  renderTest();
}

function startTimer() {
  clearTimer();
  state.timer = setInterval(() => {
    state.timerLeft -= 1;
    const timerEl = document.querySelector(".timer");
    if (timerEl) timerEl.textContent = formatTime(Math.max(0, state.timerLeft));
    if (state.timerLeft <= 0) {
      clearTimer();
      moveToNextModuleOrSubmit();
    }
  }, 1000);
}

function clearTimer() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function currentQuestion() {
  return getModule(state.activeTest, state.activeModule).questions[state.activeQuestion];
}

function saveCurrentAnnotation() {
  const q = currentQuestion();
  const stimulus = document.querySelector("#stimulus");
  if (q && stimulus) state.activeAttempt.annotations[q.id] = stimulus.innerHTML;
}

function moveQuestion(direction) {
  saveCurrentAnnotation();
  if (direction > 0 && isLastQuestionInModule()) {
    moveToNextModuleOrSubmit();
    return;
  }
  const module = getModule(state.activeTest, state.activeModule);
  state.activeQuestion = Math.min(Math.max(0, state.activeQuestion + direction), module.questions.length - 1);
  renderTest();
}

function isLastQuestionInModule() {
  return state.activeQuestion >= getModule(state.activeTest, state.activeModule).questions.length - 1;
}

function moveToNextModuleOrSubmit() {
  saveCurrentAnnotation();
  const modulesWithQuestions = state.activeTest.modules.filter((m) => m.questions.length);
  const currentIndex = modulesWithQuestions.findIndex((m) => m.key === state.activeModule);
  if (currentIndex < modulesWithQuestions.length - 1) {
    state.activeModule = modulesWithQuestions[currentIndex + 1].key;
    state.activeQuestion = 0;
    state.timerLeft = moduleMeta(state.activeModule).duration * 60;
    renderTest();
  } else {
    submitAttempt();
  }
}

function toggleFlag() {
  saveCurrentAnnotation();
  const qid = currentQuestion().id;
  const flags = state.activeAttempt.flags;
  if (flags.includes(qid)) state.activeAttempt.flags = flags.filter((id) => id !== qid);
  else flags.push(qid);
  renderTest();
}

function annotateSelection(action) {
  const stimulus = document.querySelector("#stimulus");
  stimulus.focus();
  if (action === "highlight") document.execCommand("backColor", false, "#fff0a8");
  if (action === "underline") document.execCommand("underline", false, null);
  if (action === "clear") {
    stimulus.innerHTML = textToHtml(currentQuestion().stem);
  }
  saveCurrentAnnotation();
}

async function submitAttempt() {
  saveCurrentAnnotation();
  clearTimer();
  const attempt = state.activeAttempt;
  attempt.status = "completed";
  attempt.completedAt = new Date().toISOString();
  attempt.score = scoreAttempt(state.activeTest, attempt);
  await put("attempts", attempt);
  await refreshData();
  state.view = "score";
  renderScore();
}

function exitTest() {
  if (!confirm("Exit this test? Your unfinished answers will not be saved as a completed score.")) return;
  clearTimer();
  state.view = "dashboard";
  state.activeTest = null;
  state.activeAttempt = null;
  render();
}

function scoreAttempt(test, attempt) {
  let rwCorrect = 0;
  let rwTotal = 0;
  let mathCorrect = 0;
  let mathTotal = 0;
  for (const module of test.modules) {
    for (const question of module.questions) {
      const student = String(attempt.answers[question.id] || "").trim().toUpperCase();
      const correct = String(question.correct || "").trim().toUpperCase();
      const isCorrect = correct && answerMatches(student, correct);
      if (module.area === "math") {
        mathTotal += 1;
        if (isCorrect) mathCorrect += 1;
      } else {
        rwTotal += 1;
        if (isCorrect) rwCorrect += 1;
      }
    }
  }
  const rw = scaleSection(rwCorrect, rwTotal, test.scoring?.rw);
  const math = scaleSection(mathCorrect, mathTotal, test.scoring?.math);
  return {
    rw,
    math,
    total: rw + math,
    correct: rwCorrect + mathCorrect,
    totalQuestions: rwTotal + mathTotal,
    rwCorrect,
    rwTotal,
    mathCorrect,
    mathTotal,
    scoringMode: test.scoring ? "custom" : "estimated"
  };
}

function answerMatches(student, correct) {
  const accepted = String(correct || "").split(/[|;]/).map((part) => part.trim()).filter(Boolean);
  return accepted.some((value) => {
    if (student === value.toUpperCase()) return true;
    const studentNumber = parseNumberAnswer(student);
    const correctNumber = parseNumberAnswer(value);
    return Number.isFinite(studentNumber) && Number.isFinite(correctNumber) && Math.abs(studentNumber - correctNumber) < 0.0001;
  });
}

function parseNumberAnswer(value) {
  const text = String(value || "").trim();
  if (/^[-+]?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const fraction = text.match(/^([-+]?\d+(?:\.\d+)?)\/([-+]?\d+(?:\.\d+)?)$/);
  if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
  return NaN;
}

function scaleSection(correct, total, scoreMap = null) {
  if (!total) return 200;
  if (scoreMap && Object.keys(scoreMap).length) return lookupScaledScore(scoreMap, correct);
  const score = 200 + (correct / total) * 600;
  return clampSectionScore(score);
}

function lookupScaledScore(scoreMap, raw) {
  const exact = scoreMap[String(raw)] ?? scoreMap[raw];
  if (exact) return clampSectionScore(exact);
  const entries = Object.entries(scoreMap)
    .map(([key, value]) => [Number(key), Number(value)])
    .filter(([key, value]) => Number.isFinite(key) && Number.isFinite(value))
    .sort((a, b) => a[0] - b[0]);
  if (!entries.length) return 200;
  if (raw <= entries[0][0]) return clampSectionScore(entries[0][1]);
  if (raw >= entries[entries.length - 1][0]) return clampSectionScore(entries[entries.length - 1][1]);
  const below = entries.filter(([key]) => key <= raw).at(-1);
  const above = entries.find(([key]) => key >= raw);
  if (!below || !above || below[0] === above[0]) return clampSectionScore((below || above)[1]);
  const ratio = (raw - below[0]) / (above[0] - below[0]);
  return clampSectionScore(below[1] + (above[1] - below[1]) * ratio);
}

function getModule(test, key) {
  let module = test.modules.find((m) => m.key === key);
  if (!module) {
    module = { ...MODULES.find((m) => m.key === key), questions: [] };
    test.modules.push(module);
  }
  return module;
}

function moduleMeta(key) {
  return MODULES.find((m) => m.key === key) || MODULES[0];
}

function firstModuleWithQuestions(test) {
  return test.modules.find((m) => m.questions.length);
}

function countQuestions(test) {
  return test.modules.reduce((sum, m) => sum + m.questions.length, 0);
}

function missingAnswers(test) {
  return test.modules.flatMap((m) => m.questions).filter((q) => !String(q.correct || "").trim()).length;
}

function lowConfidence(test) {
  return test.modules.flatMap((m) => m.questions).filter((q) => (q.confidence || 0) < 70).length;
}

function renumberTest(test) {
  for (const module of test.modules) {
    module.questions.forEach((question, index) => {
      question.number = index + 1;
      question.confidence = confidence(question);
    });
  }
}

function groupBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] ||= [];
    acc[key].push(item);
    return acc;
  }, {});
}

function userName(id) {
  const user = state.users.find((u) => u.id === id);
  return user?.name || user?.username || "Unknown student";
}

function testTitle(id) {
  const test = state.tests.find((t) => t.id === id) || state.activeTest;
  return test?.title || "Unknown test";
}

function messageHtml(message) {
  if (!message.text) return "";
  return `<div class="message ${message.type || ""}">${escapeHtml(message.text)}</div>`;
}

function emptyState(title, detail) {
  return `<div class="empty-state"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p></div></div>`;
}

async function exportData() {
  const data = {
    exportedAt: new Date().toISOString(),
    users: state.users,
    tests: await serializeTests(),
    attempts: state.attempts
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  downloadBlob(blob, `dh-sat-backup-${todayFolder()}.json`);
}

async function serializeTests() {
  return Promise.all(state.tests.map(async (test) => ({
    ...test,
    pdfBlob: test.pdfBlob ? await blobToDataUrl(test.pdfBlob) : null,
    answerBlob: test.answerBlob ? await blobToDataUrl(test.answerBlob) : null
  })));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: reader.result, type: blob.type, name: blob.name || "file" });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.users) || !Array.isArray(data.tests) || !Array.isArray(data.attempts)) throw new Error("Backup file is missing data.");
    for (const user of data.users) await put("users", user);
    for (const test of data.tests) {
      if (test.pdfBlob?.dataUrl) test.pdfBlob = dataUrlToBlob(test.pdfBlob);
      if (test.answerBlob?.dataUrl) test.answerBlob = dataUrlToBlob(test.answerBlob);
      await put("tests", test);
    }
    for (const attempt of data.attempts) await put("attempts", attempt);
    await refreshData();
    state.message = { type: "success", text: "Backup imported." };
    render();
  } catch (error) {
    state.message = { type: "error", text: `Could not import backup: ${error.message}` };
    render();
  }
}

function dataUrlToBlob(saved) {
  const [meta, raw] = saved.dataUrl.split(",");
  const type = saved.type || meta.match(/data:(.*?);/)?.[1] || "application/octet-stream";
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
