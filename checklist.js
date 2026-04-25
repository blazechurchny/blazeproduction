import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDU8B9qBZjOqlu2TrAg2EMe-gz_9hbs0xI",
  authDomain: "blaze-production-checklist.firebaseapp.com",
  projectId: "blaze-production-checklist",
  storageBucket: "blaze-production-checklist.firebasestorage.app",
  messagingSenderId: "32325211443",
  appId: "1:32325211443:web:5556a454b777138b945a46"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const STATE_KEY = "blazeProductionChecklistState.v1";
const RESET_KEY = "blazeProductionChecklistLastReset.v1";

let data = { roles: [] };
let settings = { resetHours: 24 };
let checkState = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
let selectedRoleId = "propresenter";
let selectedMode = "checklist";

function uid(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHTML(str = "") {
  return String(str).replace(/[&<>'"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[c]));
}

function currentRole() {
  return data.roles.find(r => r.id === selectedRoleId) || data.roles[0];
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(checkState));
}

async function loadSettings() {
  const snap = await getDoc(doc(db, "productionChecklist", "settings"));

  if (!snap.exists()) {
    await setDoc(doc(db, "productionChecklist", "settings"), settings);
    return;
  }

  settings = {
    resetHours: 24,
    ...snap.data()
  };
}

async function saveSettings() {
  const input = document.getElementById("resetHoursInput");
  const resetHours = Math.max(1, Number(input?.value || 24));

  settings.resetHours = resetHours;

  await setDoc(doc(db, "productionChecklist", "settings"), {
    resetHours
  }, { merge: true });
}

async function loadRolesFromFirestore() {
  const snapshot = await getDocs(collection(db, "roles"));
  const roles = [];

  snapshot.forEach(docSnap => {
    const role = {
      id: docSnap.id,
      ...docSnap.data()
    };

    role.info = Array.isArray(role.info) ? role.info : [];
    role.items = Array.isArray(role.items) ? role.items : [];
    role.cheatsheet = role.cheatsheet || {};
    role.cheatsheet.rackGear = Array.isArray(role.cheatsheet.rackGear) ? role.cheatsheet.rackGear : [];
    role.cheatsheet.apps = Array.isArray(role.cheatsheet.apps) ? role.cheatsheet.apps : [];

    roles.push(role);
  });

  roles.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  data.roles = roles;
  selectedRoleId = data.roles[0]?.id || "propresenter";
}

async function saveRoleToFirestore(role) {
  if (!role?.id) return;

  const cleanRole = {
    title: role.title || "Untitled Position",
    description: role.description || "",
    order: Number(role.order || 999),
    active: role.active !== false,
    info: Array.isArray(role.info) ? role.info : [],
    items: Array.isArray(role.items) ? role.items : [],
    cheatsheet: {
      rackGear: Array.isArray(role.cheatsheet?.rackGear) ? role.cheatsheet.rackGear : [],
      apps: Array.isArray(role.cheatsheet?.apps) ? role.cheatsheet.apps : []
    }
  };

  await setDoc(doc(db, "roles", role.id), cleanRole, { merge: true });
}

async function deleteRoleFromFirestore(roleId) {
  await deleteDoc(doc(db, "roles", roleId));
}

async function saveAllRolesToFirestore() {
  for (const role of data.roles) {
    await saveRoleToFirestore(role);
  }
}

async function handleAutoReset() {
  const resetHours = Math.max(1, Number(settings.resetHours || 24));
  const lastReset = Number(localStorage.getItem(RESET_KEY) || 0);
  const now = Date.now();
  const resetMs = resetHours * 60 * 60 * 1000;

  if (!lastReset || now - lastReset >= resetMs) {
    checkState = {};
    localStorage.removeItem(STATE_KEY);
    localStorage.setItem(RESET_KEY, String(now));
  }
}

/* VIEWER */

function initViewer() {
  renderRoleTabs();

  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedMode = btn.dataset.mode;
      document.querySelectorAll(".mode-btn").forEach(b => {
        b.classList.toggle("active", b === btn);
      });
      renderViewer();
    });
  });

  document.getElementById("resetCurrent")?.addEventListener("click", () => {
    const role = currentRole();
    if (!role) return;

    (role.items || []).forEach(item => {
      delete checkState[`${role.id}:${item.id}`];
    });

    saveState();
    renderViewer();
  });

  renderViewer();
}

function renderRoleTabs() {
  const wrap = document.getElementById("roleTabs");
  if (!wrap) return;

  const visibleRoles = data.roles.filter(role => role.active !== false);

  wrap.innerHTML = visibleRoles.map(role => `
    <button class="role-tab ${role.id === selectedRoleId ? "active" : ""}" data-role="${role.id}">
      ${escapeHTML(role.title)}
    </button>
  `).join("");

  wrap.querySelectorAll(".role-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedRoleId = btn.dataset.role;
      renderRoleTabs();
      renderViewer();
    });
  });
}

function renderViewer() {
  const role = currentRole();
  const content = document.getElementById("viewerContent");
  const progressCard = document.getElementById("progressCard");

  if (!role || !content) return;

  if (selectedMode === "info") {
    if (progressCard) progressCard.style.display = "none";
    content.innerHTML = renderInfo(role);
    return;
  }

  if (selectedMode === "cheatsheet") {
    if (progressCard) progressCard.style.display = "none";
    content.innerHTML = renderCheatSheet(role);
    return;
  }

  if (progressCard) progressCard.style.display = "grid";

  const activeItems = (role.items || []).filter(i => i.active !== false);
  const doneCount = activeItems.filter(i => checkState[`${role.id}:${i.id}`]).length;

  document.getElementById("progressText").textContent = `${doneCount} / ${activeItems.length} completed`;
  document.getElementById("progressFill").style.width = activeItems.length
    ? `${(doneCount / activeItems.length) * 100}%`
    : "0%";

  content.innerHTML = renderChecklist(role, activeItems);

  content.querySelectorAll("input[type='checkbox']").forEach(box => {
    box.addEventListener("change", () => {
      checkState[box.dataset.key] = box.checked;
      saveState();
      renderViewer();
    });
  });
}

function renderInfo(role) {
  const blocks = role.info || [];

  if (!blocks.length) {
    return `<div class="empty-state">No information added for ${escapeHTML(role.title)} yet.</div>`;
  }

  return blocks.map(block => `
    <article class="info-item">
      <h3>${escapeHTML(block.title)}</h3>
      ${block.description ? `<p class="muted">${escapeHTML(block.description)}</p>` : ""}
      ${block.imageUrl ? `<img class="info-img" src="${escapeHTML(block.imageUrl)}" alt="${escapeHTML(block.title)}" loading="lazy">` : ""}
    </article>
  `).join("");
}

function renderChecklist(role, items) {
  if (!items.length) {
    return `<div class="empty-state">No checklist items added for ${escapeHTML(role.title)} yet.</div>`;
  }

  const sections = [...new Set(items.map(i => i.section || "Checklist"))];

  return sections.map(section => `
    <h2 class="section-title">${escapeHTML(section)}</h2>

    ${items.filter(i => (i.section || "Checklist") === section).map(item => {
      const key = `${role.id}:${item.id}`;
      const done = !!checkState[key];

      return `
        <article class="check-item ${done ? "done" : ""}">
          <div class="check-main">
            <input type="checkbox" data-key="${key}" ${done ? "checked" : ""} aria-label="Mark ${escapeHTML(item.title)} complete">
            <div>
              <h3>${escapeHTML(item.title)}</h3>
              ${item.description ? `<p class="muted">${escapeHTML(item.description)}</p>` : ""}
              ${(item.subpoints || []).length ? `
                <ul class="subpoints">
                  ${item.subpoints.filter(Boolean).map(p => `<li>${escapeHTML(p)}</li>`).join("")}
                </ul>
              ` : ""}
              ${item.warning ? `<div class="warning">⚠️ ${escapeHTML(item.warning)}</div>` : ""}
              ${item.imageUrl ? `<img class="item-img" src="${escapeHTML(item.imageUrl)}" alt="${escapeHTML(item.title)}" loading="lazy">` : ""}
            </div>
          </div>
        </article>
      `;
    }).join("")}
  `).join("");
}

function renderCheatSheet(role) {
  const rackGear = role.cheatsheet?.rackGear || [];
  const apps = role.cheatsheet?.apps || [];

  if (!rackGear.length && !apps.length) {
    return `<div class="empty-state">No cheat sheet added for ${escapeHTML(role.title)} yet.</div>`;
  }

  return `
    <div class="cheatsheet-section">
      <h2 class="section-title">Rack Gear</h2>
      ${renderCheatSheetTable(rackGear, "pictureUrl", "deviceName", ["Picture", "Device Name", "Purpose"])}

      <h2 class="section-title">Apps</h2>
      ${renderCheatSheetTable(apps, "iconUrl", "appName", ["App Icon", "App Name", "Purpose"])}
    </div>
  `;
}

function renderCheatSheetTable(rows, imageField, nameField, headers) {
  if (!rows.length) {
    return `<div class="empty-state">No items added yet.</div>`;
  }

  return `
    <div class="cheatsheet-table-wrap">
      <table class="cheatsheet-table">
        <thead>
          <tr>
            <th>${escapeHTML(headers[0])}</th>
            <th>${escapeHTML(headers[1])}</th>
            <th>${escapeHTML(headers[2])}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>
                ${row[imageField]
                  ? `<img class="cheatsheet-img" src="${escapeHTML(row[imageField])}" alt="${escapeHTML(row[nameField])}" loading="lazy">`
                  : `<div class="cheatsheet-empty-img">No image</div>`
                }
              </td>
              <td><strong>${escapeHTML(row[nameField] || "")}</strong></td>
              <td>${escapeHTML(row.purpose || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* ADMIN */

function initAdmin() {
  const resetInput = document.getElementById("resetHoursInput");
  if (resetInput) resetInput.value = settings.resetHours || 24;

  renderAdminRoleSelect();
  renderAdmin();

document.getElementById("adminRoleSelect")?.addEventListener("change", e => {
  const newRoleId = e.target.value;

  collectAdmin(false);

  selectedRoleId = newRoleId;

  renderAdminRoleSelect();
  renderAdmin();
});

  document.getElementById("saveAdminBtn")?.addEventListener("click", async () => {
    try {
      collectAdmin();
      await saveSettings();
      await saveRoleToFirestore(currentRole());
      toast("Saved to Firebase.");
    } catch (error) {
      console.error(error);
      toast("Save failed. Check console.");
    }
  });

  document.getElementById("addRoleBtn")?.addEventListener("click", () => {
    collectAdmin();

    const role = {
      id: uid("role"),
      title: "New Position",
      description: "",
      order: data.roles.length + 1,
      active: true,
      info: [],
      items: [],
      cheatsheet: {
        rackGear: [],
        apps: []
      }
    };

    data.roles.push(role);
    selectedRoleId = role.id;

    renderAdminRoleSelect();
    renderAdmin();
    toast("New position added. Press Save Changes.");
  });

  document.getElementById("addInfoBtn")?.addEventListener("click", () => {
    collectAdmin();

    currentRole().info.push({
      title: "New Info",
      description: "",
      imageUrl: ""
    });

    renderAdmin();
  });

  document.getElementById("addItemBtn")?.addEventListener("click", () => {
    collectAdmin();

    currentRole().items.push({
      id: uid("item"),
      section: "Setup",
      title: "New Checklist Item",
      description: "",
      subpoints: [],
      imageUrl: "",
      type: "setup",
      warning: "",
      active: true
    });

    renderAdmin();
  });

  document.getElementById("addRackBtn")?.addEventListener("click", () => {
    collectAdmin();

    const role = currentRole();
    role.cheatsheet = role.cheatsheet || { rackGear: [], apps: [] };
    role.cheatsheet.rackGear = role.cheatsheet.rackGear || [];

    role.cheatsheet.rackGear.push({
      pictureUrl: "",
      deviceName: "New Device",
      purpose: ""
    });

    renderAdmin();
  });

  document.getElementById("addAppBtn")?.addEventListener("click", () => {
    collectAdmin();

    const role = currentRole();
    role.cheatsheet = role.cheatsheet || { rackGear: [], apps: [] };
    role.cheatsheet.apps = role.cheatsheet.apps || [];

    role.cheatsheet.apps.push({
      iconUrl: "",
      appName: "New App",
      purpose: ""
    });

    renderAdmin();
  });

  document.getElementById("exportBtn")?.addEventListener("click", () => {
    collectAdmin();

    const exportData = {
      settings,
      roles: data.roles
    };

    document.getElementById("dataBox").value = JSON.stringify(exportData, null, 2);
    toast("Exported JSON.");
  });

  document.getElementById("importBtn")?.addEventListener("click", async () => {
    try {
      const imported = JSON.parse(document.getElementById("dataBox").value);

      settings = {
        resetHours: 24,
        ...(imported.settings || {})
      };

      data.roles = Array.isArray(imported.roles) ? imported.roles : [];

      if (!data.roles.length) throw new Error("No roles found in import.");

      data.roles.forEach((role, index) => {
        role.id = role.id || uid("role");
        role.order = Number(role.order || index + 1);
        role.active = role.active !== false;
        role.info = Array.isArray(role.info) ? role.info : [];
        role.items = Array.isArray(role.items) ? role.items : [];
        role.cheatsheet = role.cheatsheet || {};
        role.cheatsheet.rackGear = Array.isArray(role.cheatsheet.rackGear) ? role.cheatsheet.rackGear : [];
        role.cheatsheet.apps = Array.isArray(role.cheatsheet.apps) ? role.cheatsheet.apps : [];
      });

      selectedRoleId = data.roles[0].id;

      await saveSettings();
      await saveAllRolesToFirestore();

      renderAdminRoleSelect();
      renderAdmin();

      toast("Imported and saved.");
    } catch (error) {
      console.error(error);
      toast("Import failed. JSON is cranky.");
    }
  });
}

function renderAdminRoleSelect() {
  const select = document.getElementById("adminRoleSelect");
  if (!select) return;

  select.innerHTML = data.roles.map(r => `
    <option value="${r.id}" ${r.id === selectedRoleId ? "selected" : ""}>
      ${escapeHTML(r.title)}
    </option>
  `).join("");
}

function renderAdmin() {
  const role = currentRole();
  if (!role) return;

  role.info = Array.isArray(role.info) ? role.info : [];
  role.items = Array.isArray(role.items) ? role.items : [];
  role.cheatsheet = role.cheatsheet || { rackGear: [], apps: [] };
  role.cheatsheet.rackGear = Array.isArray(role.cheatsheet.rackGear) ? role.cheatsheet.rackGear : [];
  role.cheatsheet.apps = Array.isArray(role.cheatsheet.apps) ? role.cheatsheet.apps : [];

  document.getElementById("roleTitleInput").value = role.title || "";
  document.getElementById("roleDescriptionInput").value = role.description || "";

  renderInfoEditor(role);
  renderItemEditor(role);
  renderCheatSheetEditor(role);
}

function renderInfoEditor(role) {
  const editor = document.getElementById("infoEditor");
  if (!editor) return;

  editor.innerHTML = role.info.map((info, idx) => `
    <div class="editor-block" data-info-index="${idx}">
      <div class="section-heading-row">
        <strong>Info ${idx + 1}</strong>
        <button class="remove-small" data-remove-info="${idx}">Remove</button>
      </div>

      <label>
        <span>Title</span>
        <input data-info-field="title" value="${escapeHTML(info.title)}">
      </label>

      <label>
        <span>Description</span>
        <textarea data-info-field="description" rows="3">${escapeHTML(info.description)}</textarea>
      </label>

      <label>
        <span>Image URL</span>
        <input data-info-field="imageUrl" value="${escapeHTML(info.imageUrl)}" placeholder="https://...">
      </label>
    </div>
  `).join("") || `<p class="muted">No information blocks yet.</p>`;

  document.querySelectorAll("[data-remove-info]").forEach(btn => {
    btn.addEventListener("click", () => {
      collectAdmin();
      role.info.splice(Number(btn.dataset.removeInfo), 1);
      renderAdmin();
    });
  });
}

function renderItemEditor(role) {
  const editor = document.getElementById("itemEditor");
  if (!editor) return;

  editor.innerHTML = role.items.map((item, idx) => `
    <div class="editor-block" data-item-index="${idx}">
      <div class="section-heading-row">
        <strong>Item ${idx + 1}</strong>
        <button class="remove-small" data-remove-item="${idx}">Remove</button>
      </div>

      <div class="editor-grid">
        <label>
          <span>Title</span>
          <input data-item-field="title" value="${escapeHTML(item.title)}">
        </label>

        <label>
          <span>Section</span>
          <input data-item-field="section" value="${escapeHTML(item.section)}" placeholder="Setup">
        </label>
      </div>

      <label>
        <span>Description</span>
        <textarea data-item-field="description" rows="3">${escapeHTML(item.description)}</textarea>
      </label>

      <div class="editor-grid">
        <label>
          <span>Type</span>
          <input data-item-field="type" value="${escapeHTML(item.type)}" placeholder="setup">
        </label>

        <label>
          <span>Image URL</span>
          <input data-item-field="imageUrl" value="${escapeHTML(item.imageUrl)}" placeholder="https://...">
        </label>
      </div>

      <label>
        <span>Warning</span>
        <textarea data-item-field="warning" rows="2">${escapeHTML(item.warning)}</textarea>
      </label>

      <label>
        <span>Active</span>
        <select data-item-field="active">
          <option value="true" ${item.active !== false ? "selected" : ""}>Show</option>
          <option value="false" ${item.active === false ? "selected" : ""}>Hide</option>
        </select>
      </label>

      <div>
        <div class="section-heading-row">
          <span class="muted">Subpoints</span>
          <button class="secondary-btn" data-add-subpoint="${idx}">Add Subpoint</button>
        </div>

        <div class="subpoint-list">
          ${(item.subpoints || []).map((point, pIdx) => `
            <div class="subpoint-row">
              <input data-subpoint-index="${pIdx}" value="${escapeHTML(point)}">
              <button class="remove-small" data-remove-subpoint="${idx}:${pIdx}">×</button>
            </div>
          `).join("") || `<p class="muted small">No subpoints.</p>`}
        </div>
      </div>
    </div>
  `).join("") || `<p class="muted">No checklist items yet.</p>`;

  document.querySelectorAll("[data-remove-item]").forEach(btn => {
    btn.addEventListener("click", () => {
      collectAdmin();
      role.items.splice(Number(btn.dataset.removeItem), 1);
      renderAdmin();
    });
  });

  document.querySelectorAll("[data-add-subpoint]").forEach(btn => {
    btn.addEventListener("click", () => {
      collectAdmin();
      role.items[Number(btn.dataset.addSubpoint)].subpoints.push("");
      renderAdmin();
    });
  });

  document.querySelectorAll("[data-remove-subpoint]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [i, p] = btn.dataset.removeSubpoint.split(":").map(Number);
      collectAdmin();
      role.items[i].subpoints.splice(p, 1);
      renderAdmin();
    });
  });
}

function renderCheatSheetEditor(role) {
  const rackEditor = document.getElementById("rackEditor");
  const appsEditor = document.getElementById("appsEditor");

  if (rackEditor) {
    rackEditor.innerHTML = role.cheatsheet.rackGear.map((item, idx) => `
      <div class="editor-block" data-rack-index="${idx}">
        <div class="section-heading-row">
          <strong>Rack Gear ${idx + 1}</strong>
          <button class="remove-small" data-remove-rack="${idx}">Remove</button>
        </div>

        <label>
          <span>Picture URL</span>
          <input data-rack-field="pictureUrl" value="${escapeHTML(item.pictureUrl)}" placeholder="https://...">
        </label>

        <label>
          <span>Device Name</span>
          <input data-rack-field="deviceName" value="${escapeHTML(item.deviceName)}">
        </label>

        <label>
          <span>Purpose</span>
          <textarea data-rack-field="purpose" rows="3">${escapeHTML(item.purpose)}</textarea>
        </label>
      </div>
    `).join("") || `<p class="muted">No rack gear added yet.</p>`;
  }

  if (appsEditor) {
    appsEditor.innerHTML = role.cheatsheet.apps.map((item, idx) => `
      <div class="editor-block" data-app-index="${idx}">
        <div class="section-heading-row">
          <strong>App ${idx + 1}</strong>
          <button class="remove-small" data-remove-app="${idx}">Remove</button>
        </div>

        <label>
          <span>App Icon URL</span>
          <input data-app-field="iconUrl" value="${escapeHTML(item.iconUrl)}" placeholder="https://...">
        </label>

        <label>
          <span>App Name</span>
          <input data-app-field="appName" value="${escapeHTML(item.appName)}">
        </label>

        <label>
          <span>Purpose</span>
          <textarea data-app-field="purpose" rows="3">${escapeHTML(item.purpose)}</textarea>
        </label>
      </div>
    `).join("") || `<p class="muted">No apps added yet.</p>`;
  }

  document.querySelectorAll("[data-remove-rack]").forEach(btn => {
    btn.addEventListener("click", () => {
      collectAdmin();
      role.cheatsheet.rackGear.splice(Number(btn.dataset.removeRack), 1);
      renderAdmin();
    });
  });

  document.querySelectorAll("[data-remove-app]").forEach(btn => {
    btn.addEventListener("click", () => {
      collectAdmin();
      role.cheatsheet.apps.splice(Number(btn.dataset.removeApp), 1);
      renderAdmin();
    });
  });
}

function collectAdmin() {
  const role = currentRole();
  if (!role) return;

  role.title = document.getElementById("roleTitleInput")?.value.trim() || role.title;
  role.description = document.getElementById("roleDescriptionInput")?.value.trim() || "";
  role.active = role.active !== false;
  role.order = Number(role.order || data.roles.indexOf(role) + 1);

  role.cheatsheet = role.cheatsheet || { rackGear: [], apps: [] };
  role.cheatsheet.rackGear = Array.isArray(role.cheatsheet.rackGear) ? role.cheatsheet.rackGear : [];
  role.cheatsheet.apps = Array.isArray(role.cheatsheet.apps) ? role.cheatsheet.apps : [];

  const resetInput = document.getElementById("resetHoursInput");
  if (resetInput) {
    settings.resetHours = Math.max(1, Number(resetInput.value || 24));
  }

  document.querySelectorAll("[data-info-index]").forEach(block => {
    const info = role.info[Number(block.dataset.infoIndex)];
    block.querySelectorAll("[data-info-field]").forEach(field => {
      info[field.dataset.infoField] = field.value.trim();
    });
  });

  document.querySelectorAll("[data-item-index]").forEach(block => {
    const item = role.items[Number(block.dataset.itemIndex)];

    if (!item.id) item.id = uid("item");

    block.querySelectorAll("[data-item-field]").forEach(field => {
      const name = field.dataset.itemField;
      item[name] = name === "active" ? field.value === "true" : field.value.trim();
    });

    item.subpoints = [...block.querySelectorAll("[data-subpoint-index]")]
      .map(input => input.value.trim())
      .filter(Boolean);
  });

  document.querySelectorAll("[data-rack-index]").forEach(block => {
    const item = role.cheatsheet.rackGear[Number(block.dataset.rackIndex)];

    block.querySelectorAll("[data-rack-field]").forEach(field => {
      item[field.dataset.rackField] = field.value.trim();
    });
  });

  document.querySelectorAll("[data-app-index]").forEach(block => {
    const item = role.cheatsheet.apps[Number(block.dataset.appIndex)];

    block.querySelectorAll("[data-app-field]").forEach(field => {
      item[field.dataset.appField] = field.value.trim();
    });
  });

  renderAdminRoleSelect();
}

function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  setTimeout(() => el.classList.remove("show"), 1800);
}

async function boot() {
  try {
    await loadSettings();
    await loadRolesFromFirestore();

    if (document.body.dataset.page === "viewer") {
      await handleAutoReset();
      initViewer();
    }

    if (document.body.dataset.page === "admin") {
      initAdmin();
    }
  } catch (error) {
    console.error(error);

    const viewerContent = document.getElementById("viewerContent");
    if (viewerContent) {
      viewerContent.innerHTML = `
        <div class="empty-state">
          Firebase connection failed. Check Firestore rules, project config, and browser console.
        </div>
      `;
    }

    toast("Firebase failed. Check console.");
  }
}

boot();