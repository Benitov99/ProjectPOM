// ---------------------------
// CONFIG
// ---------------------------
const clientId = "fe93600360614cf7b243cf847d35077e";
const redirectUri = window.location.origin + window.location.pathname;

let accessToken = null;
let player = null;
let deviceId = null;

document.getElementById("quizSection").style.display = "none";
document.getElementById("sidePanel").style.display = "none";
document.getElementById("playlistSelect").style.display = "none";

// ---------------------------
// SPOTIFY SDK CALLBACK
// ---------------------------
window.onSpotifyWebPlaybackSDKReady = () => {
  const waitForToken = setInterval(() => {
    if (!accessToken) return;

    clearInterval(waitForToken);

    player = new Spotify.Player({
      name: "Music Quiz Player",
      getOAuthToken: cb => cb(accessToken),
      volume: 0.8
    });

    player.addListener("ready", ({ device_id }) => {
      deviceId = device_id;
      document.getElementById("playerControls").style.display = "block";
    });

    player.addListener("player_state_changed", state => {
      document.getElementById("currentTrackDisplay").textContent =
        state ? "🔊 Playing..." : "No track playing";
    });

    player.connect();
  }, 300);
};

// ---------------------------
// PKCE HELPERS
// ---------------------------
function generateRandomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

async function sha256(plain) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain));
}

function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ---------------------------
// LOGIN
// ---------------------------
document.getElementById("loginBtn").onclick = async () => {
  localStorage.removeItem("code_verifier");

  const verifier = generateRandomString(64);
  const challenge = base64encode(await sha256(verifier));
  localStorage.setItem("code_verifier", verifier);

  const scopes = [
    "streaming",
    "user-read-private",
    "user-read-email",
    "user-read-playback-state",
    "user-modify-playback-state",
    "playlist-read-private"
  ];

  window.location.href =
    "https://accounts.spotify.com/authorize" +
    `?client_id=${clientId}` +
    "&response_type=code" +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scopes.join(" "))}` +
    "&code_challenge_method=S256" +
    `&code_challenge=${challenge}`;
};

// ---------------------------
// TOKEN EXCHANGE
// ---------------------------
async function exchangeToken() {
  const code = new URLSearchParams(window.location.search).get("code");
  if (!code) return;

  const verifier = localStorage.getItem("code_verifier");
  if (!verifier) return;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier
    })
  });

  const data = await res.json();
  if (data.error) return;

  accessToken = data.access_token;
  window.history.replaceState({}, document.title, redirectUri);
}

// ---------------------------
// USER PROFILE
// ---------------------------
async function fetchUserProfile() {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return res.json();
}

// ---------------------------
// PLAYLISTS
// ---------------------------
async function fetchPlaylists() {
  const res = await fetch("https://api.spotify.com/v1/me/playlists?limit=50", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();

  const select = document.getElementById("playlistSelect");
  select.innerHTML = `<option value="">Choose a playlist</option>`;
  select.style.display = "block";

  data.items.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
}

// ---------------------------
// QUIZ STATE
// ---------------------------
let currentPlaylistTracks = [];
let currentTrackIndex = 0;
let score = 0;
let songHistory = [];

let songScoreState = {
  title: false,
  artist: false,
  points: 0
};

// ---------------------------
// PLAYLIST TRACKS
// ---------------------------
async function loadPlaylistTracks(playlistId) {
  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await res.json();
  currentPlaylistTracks = data.items.map(i => i.track).filter(Boolean).slice(0, 20);
  shuffleArray(currentPlaylistTracks);

  currentTrackIndex = 0;
  score = 0;
  songHistory = [];
  updateScore();
  renderHistory();

  startSong();
}

// ---------------------------
// PLAYBACK
// ---------------------------
async function playTrack(uri) {
  if (!deviceId) return;
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ uris: [uri] })
  });
}

// ---------------------------
// QUIZ LOGIC
// ---------------------------
document.getElementById("submitGuessBtn").onclick = () => {
  const track = currentPlaylistTracks[currentTrackIndex];
  const titleGuess = guessTitle.value.trim();
  const artistGuess = guessArtist.value.trim();
  const mainArtist = track.artists[0].name;

  let gained = 0;

  if (!songScoreState.title && isSimilar(titleGuess, track.name)) {
    songScoreState.title = true;
    gained++;
    guessTitle.disabled = true;
  }

  if (!songScoreState.artist && isSimilar(artistGuess, mainArtist)) {
    songScoreState.artist = true;
    gained++;
    guessArtist.disabled = true;
  }

  if (gained > 0) {
    songScoreState.points += gained;
    score += gained;
    updateScore();
    updateHistoryCurrent();
  }

  if (songScoreState.title && songScoreState.artist) {
    setTimeout(nextTrack, 600);
  }
};

// ---------------------------
// PASS
// ---------------------------
document.getElementById("passBtn").onclick = () => {
  nextTrack();
};

// ---------------------------
// SONG FLOW
// ---------------------------
function startSong() {
  const track = currentPlaylistTracks[currentTrackIndex];

  songScoreState = { title: false, artist: false, points: 0 };

  songHistory.unshift({
    title: track.name,
    artist: track.artists[0].name,
    image: track.album.images[0]?.url || "",
    points: 0
  });

  if (songHistory.length > 5) songHistory.pop();

  renderHistory();
  playTrack(track.uri);
}

function updateHistoryCurrent() {
  songHistory[0].points = songScoreState.points;
  renderHistory();
}

function nextTrack() {
  currentTrackIndex++;
  if (currentTrackIndex >= currentPlaylistTracks.length) {
    repeatBtn.style.display = "inline-block";
    quizSection.style.display = "none";
    return;
  }

  guessTitle.value = "";
  guessArtist.value = "";
  guessTitle.disabled = false;
  guessArtist.disabled = false;

  startSong();
}

// ---------------------------
// HISTORY
// ---------------------------
function renderHistory() {
  history.innerHTML = "";
  songHistory.forEach(h => {
    history.innerHTML += `
      <div class="history-item">
        <img src="${h.image}" width="40">
        <span>${h.title} – ${h.artist} (${h.points} pts)</span>
      </div>`;
  });
}

// ---------------------------
// UTILS
// ---------------------------
function shuffleArray(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function isSimilar(a, b) {
  if (!a || !b) return false;
  a = a.toLowerCase();
  b = b.toLowerCase();
  let diff = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) diff++;
  }
  return diff <= 2;
}

// ---------------------------
// SCORE
// ---------------------------
function updateScore() {
  document.getElementById("score").textContent = score;
}


// ---------------------------
// INIT
// ---------------------------
async function initApp() {
  await exchangeToken();
  if (!accessToken) return;

  const user = await fetchUserProfile();
  if (user.product !== "premium") return;

  loginBtn.style.display = "none";
  playlistSelect.style.display = "block";
  sidePanel.style.display = "block";

  fetchPlaylists();
}

playlistSelect.addEventListener("change", e => {
  if (e.target.value) {
    quizSection.style.display = "block";
    loadPlaylistTracks(e.target.value);
  }
});

initApp();
