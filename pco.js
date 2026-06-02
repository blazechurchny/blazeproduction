import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
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

const songGrid = document.getElementById("songGrid");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const songCount = document.getElementById("songCount");
const emptyState = document.getElementById("emptyState");
const tabButtons = document.querySelectorAll(".tab-button");

let activeTab = "active";
let songs = [];
let worshipLeaderKeys = [];

function formatDate(value) {
  if (!value) return "Not listed";

  try {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Not listed";
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Not listed";
  }
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSongSearchText(song) {
  return [
    song.title,
    song.author,
    song.ccliNumber,
    song.admin,
    song.themes,
    Array.isArray(song.tags) ? song.tags.join(" ") : "",
  ]
    .map(normalize)
    .join(" ");
}

function sortSongs(songList, sort) {
  return [...songList].sort((a, b) => {
    if (sort === "lastScheduled") {
      return new Date(b.lastScheduledAt || 0) - new Date(a.lastScheduledAt || 0);
    }

    if (sort === "updated") {
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    }

    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

function renderSongs() {
  const search = normalize(searchInput.value);
  const sort = sortSelect.value;

  if (activeTab === "leaderKeys") {
    renderLeaderKeysTab(search);
    return;
  }

  if (activeTab === "tagGroups") {
    renderTagGroupsTab(search);
    return;
  }

  let filteredSongs = songs.filter((song) => {
    const isArchived = song.hidden === true;

    if (activeTab === "active" && isArchived) return false;
    if (activeTab === "archived" && !isArchived) return false;

    return getSongSearchText(song).includes(search);
  });

  filteredSongs = sortSongs(filteredSongs, sort);

  songGrid.innerHTML = "";

  filteredSongs.forEach((song) => {
    const card = document.createElement("article");
    card.className = "song-card";

const tags = Array.isArray(song.tags) ? song.tags : [];

card.innerHTML = `
  <h2 class="song-title">${escapeHtml(song.title || "Untitled Song")}</h2>

  <p class="song-meta">
    <span class="song-label">Author:</span>
    ${escapeHtml(song.author || "Not listed")}
  </p>

  <p class="song-meta">
    <span class="song-label">CCLI:</span>
    ${escapeHtml(song.ccliNumber || "Not listed")}
  </p>

  <p class="song-meta">
    <span class="song-label">Last Scheduled:</span>
    ${escapeHtml(formatDate(song.lastScheduledAt))}
  </p>

  ${
    song.hidden
      ? `<p class="song-meta"><span class="song-label">Status:</span> Archived</p>`
      : ""
  }

  ${
    tags.length
      ? `<div>${tags
          .map((tag) => `<span class="theme-pill">${escapeHtml(tag)}</span>`)
          .join("")}</div>`
      : ""
  }
`;

    songGrid.appendChild(card);
  });

  const label = activeTab === "active" ? "active song" : "archived song";

  songCount.textContent = `${filteredSongs.length} ${label}${
    filteredSongs.length === 1 ? "" : "s"
  } found`;

  emptyState.textContent =
    activeTab === "active"
      ? "No active songs found."
      : "No archived songs found.";

  emptyState.classList.toggle("hidden", filteredSongs.length > 0);
}

function renderLeaderKeysTab(search) {
  songGrid.innerHTML = "";

  const filtered = worshipLeaderKeys
    .filter((item) => {
      const text = [
        item.songTitle,
        ...(Array.isArray(item.leaderKeys)
          ? item.leaderKeys.flatMap((key) => [
              key.leaderName,
              key.songKey,
              key.notes,
            ])
          : []),
      ]
        .map(normalize)
        .join(" ");

      return text.includes(search);
    })
    .sort((a, b) =>
      String(a.songTitle || "").localeCompare(String(b.songTitle || ""))
    );

  filtered.forEach((item) => {
    const card = document.createElement("article");
    card.className = "song-card";

    const rows = Array.isArray(item.leaderKeys) ? item.leaderKeys : [];

    card.innerHTML = `
      <h2 class="song-title">${escapeHtml(item.songTitle || "Untitled Song")}</h2>

      ${
        rows.length
          ? rows
              .map(
                (row) => `
                  <p class="song-meta">
                    <span class="song-label">${escapeHtml(row.leaderName)}:</span>
                    ${escapeHtml(row.songKey)}
                    ${
                      row.notes
                        ? `<br><span class="song-label">Notes:</span> ${escapeHtml(row.notes)}`
                        : ""
                    }
                  </p>
                `
              )
              .join("")
          : `<p class="song-meta">No worship leader keys listed.</p>`
      }
    `;

    songGrid.appendChild(card);
  });

  songCount.textContent = `${filtered.length} worship leader key record${
    filtered.length === 1 ? "" : "s"
  } found`;

  emptyState.textContent = "No worship leader keys found.";
  emptyState.classList.toggle("hidden", filtered.length > 0);
}

function renderTagGroupsTab(search) {
  songGrid.innerHTML = "";

  const tagMap = new Map();

  songs.forEach((song) => {
    const tags = Array.isArray(song.tags) ? song.tags : [];

    tags.forEach((tag) => {
      const cleanTag = String(tag || "").trim();
      if (!cleanTag) return;

      if (!tagMap.has(cleanTag)) {
        tagMap.set(cleanTag, []);
      }

      tagMap.get(cleanTag).push(song);
    });
  });

  const groups = [...tagMap.entries()]
    .map(([tag, taggedSongs]) => ({
      tag,
      songs: taggedSongs.sort((a, b) =>
        String(a.title || "").localeCompare(String(b.title || ""))
      ),
    }))
    .filter((group) => {
      const text = [group.tag, ...group.songs.map((song) => song.title)]
        .map(normalize)
        .join(" ");

      return text.includes(search);
    })
    .sort((a, b) => a.tag.localeCompare(b.tag));

  groups.forEach((group) => {
    const card = document.createElement("article");
    card.className = "song-card";

    card.innerHTML = `
      <h2 class="song-title">${escapeHtml(group.tag)}</h2>

      <p class="song-meta">
        <span class="song-label">${group.songs.length}</span>
        song${group.songs.length === 1 ? "" : "s"}
      </p>

      <div class="tag-song-list">
        ${group.songs
          .map(
            (song) => `
              <p class="song-meta tag-song-item">
                ${escapeHtml(song.title || "Untitled Song")}
                ${
                  song.hidden
                    ? `<span class="archive-pill">Archived</span>`
                    : ""
                }
              </p>
            `
          )
          .join("")}
      </div>
    `;

    songGrid.appendChild(card);
  });

  songCount.textContent = `${groups.length} tag group${
    groups.length === 1 ? "" : "s"
  } found`;

  emptyState.textContent = "No song tag groups found.";
  emptyState.classList.toggle("hidden", groups.length > 0);
}

async function loadSongs() {
  songCount.textContent = "Loading songs...";

  const songSnapshot = await getDocs(collection(db, "songs"));
  const leaderKeysSnapshot = await getDocs(collection(db, "worshipLeaderKeys"));

  songs = songSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  worshipLeaderKeys = leaderKeysSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  renderSongs();
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeTab = button.dataset.tab;

    tabButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");

    renderSongs();
  });
});

searchInput.addEventListener("input", renderSongs);
sortSelect.addEventListener("change", renderSongs);

loadSongs().catch((error) => {
  console.error(error);
  songCount.textContent = "Could not load songs.";
  emptyState.textContent = error.message || "Something went wrong.";
  emptyState.classList.remove("hidden");
});