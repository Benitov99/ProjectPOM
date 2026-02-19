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
      console.log("Spotify Player ready:", deviceId);
    });

    player.addListener("authentication_error", e => console.error("Auth error", e));
    player.addListener("account_error", e => console.error("Account error", e));
    player.addListener("initialization_error", e => console.error("Init error", e));

    player.addListener("player_state_changed", state => {
      if (!state || !state.track_window) {
        document.getElementById("currentTrackDisplay").textContent = "No track playing";
        return;
      }
      document.getElementById("currentTrackDisplay").textContent = "🔊 Playing...";
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
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(plain));
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
    "playlist-read-private",
    "playlist-read-collaborative"
  ];

  const authUrl =
    "https://accounts.spotify.com/authorize" +
    "?client_id=" + clientId +
    "&response_type=code" +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&scope=" + encodeURIComponent(scopes.join(" ")) +
    "&code_challenge_method=S256" +
    "&code_challenge=" + challenge;

  window.location.href = authUrl;
};

// ---------------------------
// TOKEN EXCHANGE
// ---------------------------
async function exchangeToken() {
  const code = new URLSearchParams(window.location.search).get("code");
  if (!code) return;

  const verifier = localStorage.getItem("code_verifier");
  if (!verifier) return;

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await res.json();
  if (data.error) {
    console.error("Token error", data);
    return;
  }

  accessToken = data.access_token;

  window.history.replaceState({}, document.title, redirectUri);

  document.getElementById("status").textContent = "Connected to Spotify ✅";
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
  if (!data.items) return;

  const select = document.getElementById("playlistSelect");
  select.innerHTML = `<option value="">Choose a playlist</option>`;
  select.style.display = "block";
  select.style.margin = "0 auto"; 

  data.items.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ---------------------------
// PLAYLIST TRACKS
// ---------------------------
let currentPlaylistTracks = [];
let currentTrackIndex = 0;
let score = 0;
let songHistory = []; // for history

async function loadPlaylistTracks(playlistId) {
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();

  currentPlaylistTracks = data.items
    .map(i => i.track)
    .filter(Boolean)
    .slice(0, 20);

  if (!currentPlaylistTracks.length) {
    alert("Playlist has no playable tracks");
    return;
  }

  shuffleArray(currentPlaylistTracks);

  currentTrackIndex = 0;
  score = 0;
  songHistory = [];
  updateScore();
  showQuizControls();
  renderHistory();

  playTrack(currentPlaylistTracks[0].uri);
}

document.getElementById("playlistSelect").addEventListener("change", e => {
  const playlistId = e.target.value;
  if (!playlistId) return;

  document.getElementById("quizSection").style.display = "block";
  loadPlaylistTracks(playlistId);
});


// ---------------------------
// PLAYBACK
// ---------------------------
async function playTrack(uri) {
  if (!deviceId || !accessToken) return;

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
// PLAY / PAUSE / NEXT
// ---------------------------
document.getElementById("playBtn").onclick = () => {
  if (!currentPlaylistTracks.length) return;
  playTrack(currentPlaylistTracks[currentTrackIndex].uri);
};

document.getElementById("pauseBtn").onclick = () => {
  if (!player) return;
  player.pause();
};

document.getElementById("nextBtn").onclick = () => {
  nextTrack();
};

// ---------------------------
// QUIZ LOGIC
// ---------------------------
document.getElementById("submitGuessBtn").onclick = () => {
  const titleInput = document.getElementById("guessTitle");
  const artistInput = document.getElementById("guessArtist");

  const titleGuess = titleInput.value.toLowerCase().trim();
  const artistGuess = artistInput.value.toLowerCase().trim();

  const track = currentPlaylistTracks[currentTrackIndex];
  if (!track) return;

  let pointsEarned = 0;
  let feedbackMsg = "";

  // Get main artist only
  const mainArtist = track.artists[0].name.toLowerCase();

  if (!titleInput.dataset.correct && isSimilar(titleGuess, track.name.toLowerCase())) {
    pointsEarned++;
    feedbackMsg += "✅ Title correct! ";
    titleInput.disabled = true;
    titleInput.dataset.correct = "true";
  }

  if (!artistInput.dataset.correct && isSimilar(artistGuess, mainArtist)) {
    pointsEarned++;
    feedbackMsg += "✅ Artist correct! ";
    artistInput.disabled = true;
    artistInput.dataset.correct = "true";
  }

  if (pointsEarned === 0) feedbackMsg = "❌ Try again!";
  else score += pointsEarned;

  updateScore();
  document.getElementById("feedback").textContent = feedbackMsg;

  // If both answered, move to next
  if (titleInput.disabled && artistInput.disabled) {
    songHistory.push({
      title: track.name,
      artist: mainArtist,
      image: track.album.images[0]?.url || "",
      points: pointsEarned
    });
    renderHistory();
    setTimeout(nextTrack, 1000);
  }
};

// ---------------------------
// PASS BUTTON
// ---------------------------
document.getElementById("passBtn").onclick = () => {
  const track = currentPlaylistTracks[currentTrackIndex];
  const mainArtist = track.artists[0].name.toLowerCase();
  songHistory.push({
    title: track.name,
    artist: mainArtist,
    image: track.album.images[0]?.url || "",
    points: 0
  });
  renderHistory();
  nextTrack();
};

// ---------------------------
// NEXT TRACK
// ---------------------------
function nextTrack() {
  currentTrackIndex++;
  if (currentTrackIndex >= currentPlaylistTracks.length) {
    document.getElementById("quizPrompt").textContent = "Quiz finished!";
    document.getElementById("quizSection").style.display = "none";
    document.getElementById("repeatBtn").style.display = "inline-block";
    return;
  }

  const titleInput = document.getElementById("guessTitle");
  const artistInput = document.getElementById("guessArtist");
  titleInput.value = "";
  artistInput.value = "";
  titleInput.disabled = false;
  artistInput.disabled = false;
  delete titleInput.dataset.correct;
  delete artistInput.dataset.correct;

  document.getElementById("feedback").textContent = "";
  document.getElementById("quizPrompt").textContent = `Track ${currentTrackIndex + 1} of ${currentPlaylistTracks.length}`;

  playTrack(currentPlaylistTracks[currentTrackIndex].uri);
}

// ---------------------------
// SCORE
// ---------------------------
function updateScore() {
  document.getElementById("score").textContent = score;
}

// ---------------------------
// HISTORY
// ---------------------------
function renderHistory() {
  const container = document.getElementById("history");
  container.innerHTML = "";
  songHistory.forEach(h => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `
      <img src="${h.image}" alt="cover" width="40" height="40">
      <span>${h.title} - ${h.artist} (${h.points} pts)</span>
    `;
    container.appendChild(div);
  });
}

// ---------------------------
// REPEAT QUIZ
// ---------------------------
document.getElementById("repeatBtn").onclick = () => {
  shuffleArray(currentPlaylistTracks);
  currentTrackIndex = 0;
  score = 0;
  songHistory = [];
  updateScore();
  renderHistory();
  showQuizControls();
  document.getElementById("repeatBtn").style.display = "none";
  playTrack(currentPlaylistTracks[0].uri);
};

// ---------------------------
// UTILS
// ---------------------------
function isSimilar(a, b) {
  if (!a || !b) return false;
  a = a.toLowerCase();
  b = b.toLowerCase();
  if (a === b) return true;
  // Allow up to 2 character differences
  let diff = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) diff++;
  }
  return diff <= 2;
}

// ---------------------------
// SHOW QUIZ
// ---------------------------
function showQuizControls() {
  document.getElementById("quizSection").style.display = "block";
}

// ---------------------------
// INIT
// ---------------------------
async function initApp() {
  document.getElementById("loginBtn").style.display = "inline-block";

  await exchangeToken();
  if (!accessToken) return;

  const user = await fetchUserProfile();
  if (user.product !== "premium") {
    document.getElementById("status").textContent = "Spotify Premium required ❌";
    return;
  }

  document.getElementById("status").textContent = "Premium account connected 🎧";
document.getElementById("loginBtn").style.display = "none";
document.getElementById("playlistSelect").style.display = "block";
document.getElementById("sidePanel").style.display = "block";

fetchPlaylists();

}

initApp();
