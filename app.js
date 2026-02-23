// ---------------------------
// WAIT FOR DOM
// ---------------------------
document.addEventListener("DOMContentLoaded", () => {

  // ---------------------------
  // CONFIG
  // ---------------------------
  const clientId = "fe93600360614cf7b243cf847d35077e";
  const redirectUri = window.location.origin + window.location.pathname;

  let accessToken = null;
  let player = null;
  let deviceId = null;
let totalPossiblePoints = 0;
let missed = 0;


  // ---------------------------
  // DOM REFERENCES
  // ---------------------------
  const loginBtn = document.getElementById("loginBtn");
  const quizSection = document.getElementById("quizSection");
  const sidePanel = document.getElementById("sidePanel");
  const playlistSelect = document.getElementById("playlistSelect");
  const historyPanel = document.getElementById("history");
  const scoreEl = document.getElementById("score");
  const guessTitle = document.getElementById("guessTitle");
  const guessArtist = document.getElementById("guessArtist");
  const repeatBtn = document.getElementById("repeatBtn");
  const submitGuessBtn = document.getElementById("submitGuessBtn");
  const passBtn = document.getElementById("passBtn");
  const playBtn = document.getElementById("playBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const trackCounterEl = document.getElementById("trackCounter");
const trackYearEl = document.getElementById("trackYear");
const guessArtist2 = document.getElementById("guessArtist2");
const songLimitSelect = document.getElementById("songLimitSelect");



  // Hide UI initially
  quizSection.style.display = "none";
  sidePanel.style.display = "none";
  playlistSelect.style.display = "none";
  repeatBtn.style.display = "none";

function cleanTitle(title) {
  return title
    .replace(/\s*\(feat\.?.*?\)/gi, "")
.replace(/\s*\(featuring\.?.*?\)/gi, "")
    .replace(/\s*\(with.*?\)/gi, "")
    .replace(/\s*\(remaster.*?\)/gi, "")
    .replace(/\s*\(edit.?\)/gi, "")
.replace(/\s*\(radio edit.?\)/gi, "")
.replace(/\s*\uit liefde voor muziek/gi, "")
    .trim();
}


  // ---------------------------
  // SCORE
  // ---------------------------
  let score = 0;
function updateScore() {
  document.getElementById("totalScore").textContent =` ${score}`;

  
  document.getElementById("missedScore").textContent =
    `Missed: ${missed}`;
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
    localStorage.setItem("code_verifier", verifier);

    const scopes = [
      "streaming",
      "user-read-private",
      "user-read-email",
      "user-read-playback-state",
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
    if (accessToken) return; // prevent double run

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
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
    if (data.error) {
      console.error("Token error:", data);
      return;
    }

    accessToken = data.access_token;
    window.history.replaceState({}, document.title, redirectUri);

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
  let songHistory = [];
  let songState = { title: false, artist1: false, artist2: false, points: 0 };
let songLimit = 25; // default

  // ---------------------------
  // LOAD TRACKS
  // ---------------------------
async function loadPlaylistTracks(id) {
  let allTracks = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await fetch(
      `https://api.spotify.com/v1/playlists/${id}/tracks?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const data = await res.json();

    const tracksBatch = data.items
      .map(i => i.track)
      .filter(Boolean);

    allTracks.push(...tracksBatch);

    if (data.items.length < limit) break;
    offset += limit;
  }

  // Shuffle ALL songs
  shuffle(allTracks);

  // OPTIONAL: limit quiz length (recommended for performance)
  tracks = allTracks.slice(0, 50); // or remove this line to allow all

  index = 0;
  score = 0;
  totalPossiblePoints = 0;
  songHistory = [];

  updateScore();
  renderHistoryPanel();

  quizSection.style.display = "block";
  sidePanel.style.display = "block";

  startSong();
}


  // ---------------------------
  // PLAYBACK
  // ---------------------------
  function playTrack(uri) {
    if (!deviceId) return;
    fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
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
const artists = track.artists.map(a => a.name);

// reset state
songState = {
  title: false,
  artist1: false,
  artist2: false,
  needsTwoArtists: artists.length >= 2,
  points: 0
};

// show / hide second artist input
if (songState.needsTwoArtists) {
  guessArtist2.style.display = "block";
  guessArtist2.value = "";
  guessArtist2.disabled = false;
} else {
  guessArtist2.style.display = "none";
}

// reset artist 1
guessArtist.value = "";
guessArtist.disabled = false;




// Show release year
if (track.album?.release_date) {
  trackYearEl.textContent = `Year: ${track.album.release_date.slice(0, 4)}`;
} else {
  trackYearEl.textContent = "Year: ?";
}


 renderHistoryPanel();
    

updateScore();
totalPossiblePoints += 2;


songHistory.unshift({
  title: track.name,
  artist1: track.artists[0].name,
  artist2: track.artists[1]?.name || null,
guessedTitle: false,
  guessedArtist1: songState.artist1,
  guessedArtist2: songState.needsTwoArtists ? songState.artist2 : null,
  points: songState.points,
  image: track.album.images[0]?.url
});
    if (songHistory.length > 5) songHistory.pop();


    trackCounterEl.textContent = `${index + 1} / ${tracks.length}`;

playTrack(track.uri);
   
  }

  function nextSong() {
missed = totalPossiblePoints - score;
renderHistoryPanel();
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
    const artists = track.artists.map(a => a.name);
    let gained = 0;

  
    if (!songState.artist1 && isSimilar(guessArtist.value, artists[0])) {

      songState.artist1 = true;
 songHistory[0].guessedArtist1 = true;
if(!songState.needsTwoArtists){
      gained++;}
      guessArtist.disabled = true;
    }

  // ARTIST 2 (only if needed)
  if (
    songState.needsTwoArtists &&
    !songState.artist2 &&
    isSimilar(guessArtist2.value, artists[1])
  ) {

    songState.artist2 = true;
songHistory[0].guessedArtist2 = true;
    guessArtist2.disabled = true;
  }

if (songState.needsTwoArtists && songState.artist1 && songState.artist2){
if (songState.title && gained === 1){
gained ++}
if (!songState.title && gained === 0){
gained++}};

  if (!songState.title && isSimilar(guessTitle.value, cleanTitle(track.name))) {
      songState.title = true;
 songHistory[0].guessedTitle = true;
      gained++;
      guessTitle.disabled = true;
    }


    if (gained) {
      songState.points += gained;
      score += gained;
      songHistory[0].points = songState.points;
      updateScore();
     
    }

 const artistDone =
    songState.needsTwoArtists
      ? songState.artist1 && songState.artist2
      : songState.artist1;

  if (songState.title && artistDone) {
    setTimeout(nextSong, 600);
}
  };

  passBtn.onclick = nextSong;
  repeatBtn.onclick = () => location.reload();

  // ---------------------------
  // HISTORY PANEL
  // ---------------------------
 function renderHistoryPanel() {
  historyPanel.innerHTML = "";

  songHistory.forEach(h => {
    historyPanel.innerHTML += `
      <div class="history-item">
          <img src="${h.image}" width="40">
        <div class="history-text">
       <div class="${h.guessedTitle ? "" : "wrong"}">${h.title}</div>

          <div>
            <span class=" ${h.guessedArtist1 ? "" : "wrong"}">${h.artist1}</span>
            ${
              h.artist2
                ? ` & <span class="${h.guessedArtist2 ? "" : "wrong"}">${h.artist2}</span>`
                : ""
            }
        </div>

        <span class="points">${h.points} pts</span>
      </div>
    `;
  });
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
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) diff++;
    return diff <= 2;
  }

  function showQuizUI() {
    loginBtn.style.display = "none";
    playlistSelect.style.display = "block";
    
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
songLimitSelect.onchange = e => {
  songLimit = Number(e.target.value);
};


}); // DOMContentLoaded
