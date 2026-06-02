import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDAoOLkCTikhUYcPd9gM6dPAYKYF8zX6qQ",
  authDomain: "pco-songs-blaze.firebaseapp.com",
  projectId: "pco-songs-blaze",
  storageBucket: "pco-songs-blaze.firebasestorage.app",
  messagingSenderId: "500197412941",
  appId: "1:500197412941:web:f319a0216c7881e1998c04",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const syncButton = document.getElementById("syncButton");
const syncKeyInput = document.getElementById("syncKeyInput");
const syncStatus = document.getElementById("syncStatus");

const songSearchInput = document.getElementById("songSearchInput");
const songSelect = document.getElementById("songSelect");
const leaderRows = document.getElementById("leaderRows");
const addLeaderRowButton = document.getElementById("addLeaderRowButton");
const saveLeaderKeysButton = document.getElementById("saveLeaderKeysButton");
const leaderKeysStatus = document.getElementById("leaderKeysStatus");

const syncUrl = "https://syncsongs-500197412941.us-central1.run.app";

let songs = [];

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSongOptions() {
  const search = String(songSearchInput.value || "").toLowerCase();

  const filteredSongs = songs
    .filter((song) => {
      return String(song.title || "").toLowerCase().includes(search);
    })
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));

  songSelect.innerHTML = `<option value="">Select a song...</option>`;

  filteredSongs.forEach((song) => {
    const option = document.createElement("option");
    option.value = song.id;
    option.textContent = song.title || "Untitled Song";
    songSelect.appendChild(option);
  });
}

function createLeaderRow(data = {}) {
  const row = document.createElement("div");
  row.className = "leader-row";

  row.innerHTML = `
    <input class="leader-name-input" type="text" placeholder="Worship leader name" value="${escapeHtml(data.leaderName || "")}" />
    <input class="leader-key-input" type="text" placeholder="Key, ex: G, Ab, F#" value="${escapeHtml(data.songKey || "")}" />
    <input class="leader-notes-input" type="text" placeholder="Notes optional" value="${escapeHtml(data.notes || "")}" />
    <button class="remove-row-button" type="button">Remove</button>
  `;

  row.querySelector(".remove-row-button").addEventListener("click", () => {
    row.remove();
  });

  leaderRows.appendChild(row);
}

async function loadSongs() {
  const snapshot = await getDocs(collection(db, "songs"));

  songs = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));

  renderSongOptions();
}

async function loadLeaderKeysForSong(songId) {
  leaderRows.innerHTML = "";
  leaderKeysStatus.textContent = "";

  if (!songId) return;

  const ref = doc(db, "worshipLeaderKeys", songId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    createLeaderRow();
    return;
  }

  const data = snap.data();
  const keys = Array.isArray(data.leaderKeys) ? data.leaderKeys : [];

  if (!keys.length) {
    createLeaderRow();
    return;
  }

  keys.forEach((item) => createLeaderRow(item));
}

function getSelectedSong() {
  const songId = songSelect.value;
  return songs.find((song) => song.id === songId);
}

function getLeaderRowsData() {
  return [...document.querySelectorAll(".leader-row")]
    .map((row) => ({
      leaderName: row.querySelector(".leader-name-input").value.trim(),
      songKey: row.querySelector(".leader-key-input").value.trim(),
      notes: row.querySelector(".leader-notes-input").value.trim(),
    }))
    .filter((item) => item.leaderName && item.songKey);
}

if (syncButton && syncKeyInput && syncStatus) {
  syncButton.addEventListener("click", async () => {
    const key = syncKeyInput.value.trim();

    if (!key) {
      syncStatus.textContent = "Enter the sync password first.";
      return;
    }

    syncButton.disabled = true;
    syncButton.textContent = "Refreshing...";
    syncStatus.textContent =
      "Pulling songs from Planning Center. This may take a minute.";

    try {
      const response = await fetch(`${syncUrl}?key=${encodeURIComponent(key)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Refresh failed.");
      }

      syncStatus.textContent = `Done. Synced ${data.count} songs.`;

      await loadSongs();
    } catch (error) {
      console.error(error);
      syncStatus.textContent = `Error: ${error.message}`;
    } finally {
      syncButton.disabled = false;
      syncButton.textContent = "Force Refresh Song Library";
    }
  });
}

songSearchInput.addEventListener("input", renderSongOptions);

songSelect.addEventListener("change", async () => {
  await loadLeaderKeysForSong(songSelect.value);
});

addLeaderRowButton.addEventListener("click", () => {
  createLeaderRow();
});

saveLeaderKeysButton.addEventListener("click", async () => {
  const selectedSong = getSelectedSong();

  if (!selectedSong) {
    leaderKeysStatus.textContent = "Choose a song first.";
    return;
  }

  const leaderKeys = getLeaderRowsData();

  saveLeaderKeysButton.disabled = true;
  saveLeaderKeysButton.textContent = "Saving...";
  leaderKeysStatus.textContent = "Saving worship leader keys...";

  try {
    await setDoc(
      doc(db, "worshipLeaderKeys", selectedSong.id),
      {
        songId: selectedSong.id,
        songTitle: selectedSong.title || "Untitled Song",
        leaderKeys,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    leaderKeysStatus.textContent = `Saved ${leaderKeys.length} worship leader key${
      leaderKeys.length === 1 ? "" : "s"
    }.`;
  } catch (error) {
    console.error(error);
    leaderKeysStatus.textContent = `Error: ${error.message}`;
  } finally {
    saveLeaderKeysButton.disabled = false;
    saveLeaderKeysButton.textContent = "Save Worship Leader Keys";
  }
});

loadSongs().catch((error) => {
  console.error(error);
  leaderKeysStatus.textContent = "Could not load songs.";
});