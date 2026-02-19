// ---------------------------
// CONFIG
// ---------------------------
const clientId = "fe93600360614cf7b243cf847d35077e";
const redirectUri = window.location.origin + window.location.pathname;

let accessToken = null;
let player = null;
let deviceId = null;

// ---------------------------
// DOM REFERENCES
// ---------------------------
const loginBtn = document.getElementById("loginBtn");
const quizSection = document.getElementById("quizSection");
const sidePanel = document.getElementById("sidePanel");
const playlistSelect = document.getElementById("playlistSelect");
const historyEl = document.getElementById("history");
const scoreEl = document.getElementById("score");
const guessTitle = document.getElementById("guessTitle");
const guessArtist = document.getElementById("guessArtist");
const repeatBtn = document.getElementById("repeatBtn");
const submitGuessBtn = document.getElementById("submitGuessBtn");
const passBtn = document.getElementById("passBtn");
const playBtn = document.getElementById("playBtn");
const pauseBtn = document.getElementById("pauseBtn");
const trackCounterEl = document.getElementById("trackCounter");

// Hide UI initially
quizSection.style.display = "none";
sidePanel.style.display = "none";
playlistSelect.style.display = "none";
repeatBtn.style.display = "none";

// ---------------------------
// SCORE
// ---------------------------
let score = 0;
function updateScore() {
  scoreEl.textContent = score;
}

// ---------------------------
// SPOTIFY SDK
// ---------------------------
window.onSpotifyWebPlaybackSDKReady = () => {
  const wait = setInterval(() => {
    if (!accessToken) return;
    clearInterval(wait);

    player = new Spotify.Player({
      name: "Music Quiz Player",
      getOAuthToken: cb => cb(accessToken),
      volume: 0.8
    });

    player.addListener("ready", ({ device_id }) => {
      deviceId = device_id;
    });

    player.connect();
  }, 300);
};

// ---------------------------
// PKCE HELPERS
// ---------------------------
function generateRandomString(len) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
async function sha256(text) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}
function base64encode(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------
// LOGIN
// ---------------------------
loginBtn.onclick = async () => {
  const verifier = generateRandomString(64);
  const challenge = base64encode(await sha256(verifier));
  localStorage.setItem("verifier", verifier);

  const scopes = [
    "streaming",
    "user-read-private",
    "user-modify-playback-state",
    "playlist-read-private"
  ];

  location.href =
    "https://accounts.spotify.com/authorize" +
    `?client_id=${clientId}` +
    "&response_type=code" +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scopes.join(" "))}` +
    "&code_challenge_method=S256" +
    `&code_challenge=${challenge}`;
};

// ---------------------------
// TOKEN
// ---------------------------
async function exchangeToken() {
  const code = new URLSearchParams(location.search).get("code");
  if (!code) return;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: localStorage.getItem("verifier")
    })
  });

  const data = await res.json();
  accessToken = data.access_token;
  history.replaceState({}, "", redirectUri);
showQuizUI();
}

// ---------------------------
// USER / PLAYLISTS
// ---------------------------
async function fetchPlaylists() {
  const res = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();

  playlistSelect.innerHTML = `<option value="">Choose a playlist</option>`;
  data.items.forEach(p => {
    playlistSelect.innerHTML += `<option value="${p.id}">${p.name}</option>`;
  });
}

// ---------------------------
// QUIZ STATE
// ---------------------------
let tracks = [];
let index = 0;
let history = [];
let songState = { title: false, artist: false, points: 0 };

// ---------------------------
// LOAD TRACKS
// ---------------------------
async function loadPlaylistTracks(id) {
  const res = await fetch(`https://api.spotify.com/v1/playlists/${id}/tracks?limit=50`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  tracks = (await res.json()).items.map(i => i.track).filter(Boolean).slice(0, 20);
  shuffle(tracks);

  index = 0;
  score = 0;
  history = [];
  updateScore();
  renderHistory();

  quizSection.style.display = "block";
  startSong();
}

// ---------------------------
// PLAYBACK
// ---------------------------
function playTrack(uri) {
  if (!deviceId) return;
  fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ uris: [uri] })
  });
}

playBtn.onclick = () => player?.resume();
pauseBtn.onclick = () => player?.pause();

// ---------------------------
// SONG FLOW
// ---------------------------
function startSong() {
  const track = tracks[index];
  songState = { title: false, artist: false, points: 0 };

  history.unshift({
    title: track.name,
    artist: track.artists[0].name,
    image: track.album.images[0]?.url || "",
    points: 0
  });
  if (history.length > 5) history.pop();

  trackCounterEl.textContent = `${index + 1} / ${tracks.length}`;
  renderHistory();
  playTrack(track.uri);
}

function nextSong() {
  index++;
  if (index >= tracks.length) {
    quizSection.style.display = "none";
    repeatBtn.style.display = "block";
    return;
  }
  guessTitle.value = "";
  guessArtist.value = "";
  guessTitle.disabled = false;
  guessArtist.disabled = false;
  startSong();
}

// ---------------------------
// GUESSING
// ---------------------------
submitGuessBtn.onclick = () => {
  const track = tracks[index];
  const mainArtist = track.artists[0].name;

  let gained = 0;

  if (!songState.title && isSimilar(guessTitle.value, track.name)) {
    songState.title = true;
    gained++;
    guessTitle.disabled = true;
  }
  if (!songState.artist && isSimilar(guessArtist.value, mainArtist)) {
    songState.artist = true;
    gained++;
    guessArtist.disabled = true;
  }

  if (gained) {
    songState.points += gained;
    score += gained;
    history[0].points = songState.points;
    updateScore();
    renderHistory();
  }

  if (songState.title && songState.artist) setTimeout(nextSong, 600);
};

passBtn.onclick = nextSong;
repeatBtn.onclick = () => location.reload();

// ---------------------------
// HISTORY
// ---------------------------
function renderHistory() {
  historyEl.innerHTML = history.map(h => `
    <div class="history-item">
      <img src="${h.image}" width="40">
      <span>${h.title} – ${h.artist} (${h.points} pts)</span>
    </div>
  `).join("");
}

// ---------------------------
// UTILS
// ---------------------------
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function isSimilar(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  let diff = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++)
    if (a[i] !== b[i]) diff++;
  return diff <= 2;
}

function showQuizUI() {
  loginBtn.style.display = "none";
  playlistSelect.style.display = "block";
  sidePanel.style.display = "block";
}


// ---------------------------
// INIT
// ---------------------------
(async function init() {
  await exchangeToken();
  if (!accessToken) return;

showQuizUI();
fetchPlaylists();

})();

playlistSelect.onchange = e => {
  if (e.target.value) loadPlaylistTracks(e.target.value);
};

