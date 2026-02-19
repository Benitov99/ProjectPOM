// ---------------------------
// CONFIG
// ---------------------------
const clientId = "fe93600360614cf7b243cf847d35077e";
const redirectUri = window.location.origin + window.location.pathname;

let accessToken = null;

// ---------------------------
// PKCE helpers
// ---------------------------
function generateRandomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest("SHA-256", data);
}

function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ---------------------------
// LOGIN BUTTON
// ---------------------------
document.getElementById("loginBtn").onclick = async () => {
  localStorage.removeItem("code_verifier");

  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  localStorage.setItem("code_verifier", codeVerifier);

  const scopes = [
    "user-read-private",
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
    "&code_challenge=" + codeChallenge;

  window.location.href = authUrl;
};

// ---------------------------
// EXCHANGE TOKEN
// ---------------------------
async function exchangeToken() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return;

  const verifier = localStorage.getItem("code_verifier");
  if (!verifier) {
    console.error("No code verifier found. Please login again.");
    return;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });

  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    const data = await response.json();

    if (data.error) {
      console.error("Token exchange failed:", data);
      alert("Token exchange failed. Please login again.");
      return;
    }

    accessToken = data.access_token;
    document.getElementById("status").textContent = "Connected to Spotify ✅";

    await initPlaylists();
  } catch (err) {
    console.error("Network or fetch error during token exchange:", err);
  }
}

// ---------------------------
// FETCH PLAYLISTS
// ---------------------------
async function initPlaylists() {
  const select = document.getElementById("playlistSelect");
  const status = document.getElementById("playlistStatus");

  select.disabled = true;
  status.textContent = "Loading playlists...";

  try {
    let playlists = [];
    let url = "https://api.spotify.com/v1/me/playlists?limit=50";

    while (url) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const data = await response.json();

      if (data.error) {
        console.error("Spotify API error:", data.error);
        status.textContent = `Error loading playlists: ${data.error.message}`;
        return;
      }

      playlists.push(...data.items);
      url = data.next;
    }

    playlists.sort((a, b) => a.name.localeCompare(b.name));

    select.innerHTML = '<option value="">Select a playlist</option>';
    playlists.forEach(p => {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = `${p.name} (${p.owner.display_name})`;
      select.appendChild(option);
    });

    select.disabled = false;
    status.textContent = `Loaded ${playlists.length} playlists ✅`;
  } catch (err) {
    console.error("Error fetching playlists:", err);
    status.textContent = "Error fetching playlists";
  }
}

// ---------------------------
// FETCH TRACKS
// ---------------------------
async function fetchAllTracks(playlistId) {
  let tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  try {
    while (url) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();

      if (data.error) {
        console.error("Spotify API error:", data.error);
        break;
      }

     tracks.push(
  ...data.items
    .filter(item => item.track)
    .map(item => ({
      title: item.track.name,
      artist: item.track.artists.map(a => a.name).join(", "),
      uri: item.track.uri   // <-- added for playback
    }))
);


      url = data.next;
    }
  } catch (err) {
    console.error("Error fetching tracks:", err);
  }

  return tracks;
}



// ---------------------------
// QUIZ ENGINE
// ---------------------------
let currentPlaylistTracks = [];
let currentTrackIndex = 0;
let score = 0;

document.getElementById("startQuizBtn").onclick = () => {
  if (!currentPlaylistTracks.length) return;

  currentTrackIndex = 0;
  score = 0;
  document.getElementById("score").textContent = score;

  document.getElementById("startQuizBtn").style.display = "none";
  document.getElementById("quizSection").style.display = "block";

  showTrack();
};

document.getElementById("nextTrackBtn").onclick = () => {
  currentTrackIndex++;
  if (currentTrackIndex >= currentPlaylistTracks.length) {
    document.getElementById("quizPrompt").textContent = "Quiz finished!";
    document.getElementById("nextTrackBtn").disabled = true;
    return;
  }
  showTrack();
  document.getElementById("feedback").textContent = "";
  document.getElementById("guessInput").value = "";
};

function showTrack() {
  const track = currentPlaylistTracks[currentTrackIndex];
  document.getElementById("quizPrompt").textContent =
    `Track ${currentTrackIndex + 1} of ${currentPlaylistTracks.length}`;
}

document.getElementById("submitGuessBtn").onclick = () => {
  const guess = document.getElementById("guessInput").value.toLowerCase().trim();
  const track = currentPlaylistTracks[currentTrackIndex];

  if (!track) return;

  const titleMatch = track.title.toLowerCase() === guess;
  const artistMatch = track.artist.toLowerCase() === guess;

  if (titleMatch || artistMatch) {
    document.getElementById("feedback").textContent = "✅ Correct!";
    score++;
    document.getElementById("score").textContent = score;
  } else {
    document.getElementById("feedback").textContent =
      `❌ Wrong! Title: ${track.title}, Artist: ${track.artist}`;
  }
};

// ---------------------------
// PLAYLIST SELECT HANDLER
// ---------------------------
document.getElementById("playlistSelect").addEventListener("change", async (e) => {
  const playlistId = e.target.value;
  if (!playlistId) return;

  const status = document.getElementById("playlistStatus");
  status.textContent = "Loading tracks...";

  currentPlaylistTracks = await fetchAllTracks(playlistId);

  status.textContent = `Loaded ${currentPlaylistTracks.length} tracks ✅`;

  if (currentPlaylistTracks.length > 0) {
    document.getElementById("startQuizBtn").style.display = "inline-block";
  }
});

// ---------------------------
// INIT
// ---------------------------
exchangeToken();

let player;
let deviceId = null;

async function initSpotifyPlayer() {
  if (!accessToken) return;

  window.onSpotifyWebPlaybackSDKReady = () => {
    player = new Spotify.Player({
      name: "Music Quiz Player",
      getOAuthToken: cb => { cb(accessToken); }
    });

    // Error handling
    player.addListener('initialization_error', ({ message }) => console.error(message));
    player.addListener('authentication_error', ({ message }) => console.error(message));
    player.addListener('account_error', ({ message }) => console.error(message));
    player.addListener('playback_error', ({ message }) => console.error(message));

    // Playback status
    player.addListener('player_state_changed', state => {
      if (!state) return;
      document.getElementById("currentTrackDisplay").textContent =
        `${state.track_window.current_track.name} - ${state.track_window.current_track.artists.map(a=>a.name).join(", ")}`;
    });

    // Ready
    player.addListener('ready', ({ device_id }) => {
      console.log('Ready with Device ID', device_id);
      deviceId = device_id;
      document.getElementById("playerControls").style.display = "block";
    });

    player.connect();
  };
}
document.getElementById("playBtn").onclick = async () => {
  if (!deviceId || !currentPlaylistTracks.length) return;
  const track = currentPlaylistTracks[currentTrackIndex];
  await playTrack(track.uri);
};

document.getElementById("pauseBtn").onclick = async () => {
  if (!player) return;
  await player.pause();
};

document.getElementById("nextBtn").onclick = () => {
  currentTrackIndex++;
  if (currentTrackIndex >= currentPlaylistTracks.length) {
    alert("Quiz finished!");
    return;
  }
  showTrack();
  document.getElementById("feedback").textContent = "";
  document.getElementById("guessInput").value = "";
  playCurrentTrack();
};

// Play current track helper
async function playCurrentTrack() {
  if (!deviceId) return;
  const track = currentPlaylistTracks[currentTrackIndex];
  if (!track.uri) return;

  await playTrack(track.uri);
}

// Generic play track function
async function playTrack(trackUri) {
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    body: JSON.stringify({ uris: [trackUri] }),
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    }
  });
}

const userProfile = await fetchUserProfile();
if (userProfile.product === "premium") {
  document.getElementById("status").textContent = "Premium account detected 🎧";
  await initSpotifyPlayer();  // initialize player
} else {
  document.getElementById("status").textContent = "Premium account required ❌";
}

