let currentTrack = null;
let accessToken = null;
const clientId = "fe93600360614cf7b243cf847d35077e";
const redirectUri = "https://magnificent-begonia-310bcc.netlify.app/";
const playlists = {
  Decade20: {
    name: "20's",
    id: "4B4qiCCCGGv3W7YthvdR1K"
  },
  ultratop: {
    name: "Ultratop",
    id: "0dtfWpzj3tg2bA2a10USa0"
  }
};


function generateRandomString(length) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest("SHA-256", data);
}

function base64encode(input) {
  return btoa(
    String.fromCharCode(...new Uint8Array(input))
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const scopes = [
  "streaming",
  "user-read-private",
  "user-read-email",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-read-private"
];


document.getElementById("loginBtn").addEventListener("click", async () => {
  const codeVerifier = generateRandomString(128);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  localStorage.setItem("code_verifier", codeVerifier);

  const authUrl =
    "https://accounts.spotify.com/authorize" +
    "?client_id=" + clientId +
    "&response_type=code" +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&scope=" + encodeURIComponent(scopes.join(" ")) +
    "&code_challenge_method=S256" +
    "&code_challenge=" + codeChallenge;

  window.location.href = authUrl;
});

async function getAccessTokenFromCode() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  if (!code) return;

  const codeVerifier = localStorage.getItem("code_verifier");

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code: code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body
  });

  const data = await response.json();
  return data.access_token;
}


(async () => {
  accessToken = await getAccessTokenFromCode();
  if (!accessToken) return;

  document.getElementById("status").textContent =
    "Connected to Spotify ✅";

  const user = await fetchUserProfile();

  if (user.product === "premium") {
    document.getElementById("status").textContent =
      "Premium account detected 🎧";

 populatePlaylistDropdown();
  document.getElementById("playlistSelect").style.display = "block";

 }
})();



async function fetchUserProfile() {
  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  return await response.json();
}

async function fetchPlaylistTracks(playlistId) {
  let allTracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&market=BE`;

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      console.error("Spotify API error:", response.status);
      break;
    }

    const data = await response.json();

    if (!data.items) break;

    const validTracks = data.items
      .filter(item => item.track)
      .map(item => ({
        id: item.track.id,
        title: item.track.name,
        artist: item.track.artists[0].name,
        uri: item.track.uri
      }));

    allTracks.push(...validTracks);
    url = data.next;
  }

  return allTracks;
}


function populatePlaylistDropdown() {
  const dropdown = document.getElementById("playlistDropdown");

  Object.values(playlists).forEach(playlist => {
    const option = document.createElement("option");
    option.value = playlist.id;
    option.textContent = playlist.name;
    dropdown.appendChild(option);
  });
}

document.getElementById("startGameBtn").addEventListener("click", async () => {
  const playlistId =
    document.getElementById("playlistDropdown").value;

  document.getElementById("status").textContent =
    "Loading playlist… ⏳";

  const tracks = await fetchPlaylistTracks(playlistId);

  console.log("Total tracks loaded:", tracks.length);

  document.getElementById("status").textContent =
    `Loaded ${tracks.length} tracks 🎶`;

function getRandomTrack(tracks) {
  const index = Math.floor(Math.random() * tracks.length);
  return tracks[index];
}
currentTrack = getRandomTrack(tracks);
console.log("Selected track:", currentTrack);

playTrack(currentTrack.uri);
document.querySelector('.now-playing').textContent = "🎵 Playing a song… guess the title and artist!";

document.getElementById("quizArea").classList.remove("hidden");

});

  let player = null;

function initPlayer() {
  window.onSpotifyWebPlaybackSDKReady = () => {
    player = new Spotify.Player({
      name: 'Music Quiz Player',
      getOAuthToken: cb => { cb(accessToken); },
      volume: 0.5
    });

    // Error handling
    player.addListener('initialization_error', ({ message }) => { console.error(message); });
    player.addListener('authentication_error', ({ message }) => { console.error(message); });
    player.addListener('account_error', ({ message }) => { console.error(message); });
    player.addListener('playback_error', ({ message }) => { console.error(message); });

    // Playback status updates
    player.addListener('player_state_changed', state => {
      console.log('Player state changed:', state);
    });

    // Ready
    player.addListener('ready', ({ device_id }) => {
      console.log('Ready with Device ID', device_id);
      player.device_id = device_id; // store device id for later playback
    });

    // Connect
    player.connect();
  };
}


async function playTrack(trackUri) {
  if (!player || !player.device_id) {
    console.error("Player not ready yet");
    return;
  }

  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${player.device_id}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [trackUri] }),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
  });
}


