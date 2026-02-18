const clientId = "fe93600360614cf7b243cf847d35077e";
const redirectUri = window.location.origin + window.location.pathname;
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



let accessToken = null;

// ---------- PKCE helpers ----------
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
  return crypto.subtle.digest("SHA-256", data);
}

function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ---------- Login ----------
document.getElementById("loginBtn").onclick = async () => {
  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  localStorage.setItem("code_verifier", codeVerifier);

  const authUrl =
    "https://accounts.spotify.com/authorize" +
    "?client_id=" + clientId +
    "&response_type=code" +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&scope=user-read-private" +
    "&code_challenge_method=S256" +
    "&code_challenge=" + codeChallenge;

  window.location.href = authUrl;
};

// ---------- Token exchange ----------
async function exchangeToken() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return;

  const verifier = localStorage.getItem("code_verifier");

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });

  const response = await fetch(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }
  );

  const data = await response.json();
  accessToken = data.access_token;

 document.getElementById("status").textContent =
  "Connected to Spotify ✅";

await initPlaylists();

}

// ---------- Init ----------
exchangeToken();

async function fetchUserPlaylists() {
  let playlists = [];
  let url = "https://api.spotify.com/v1/me/playlists?limit=50";

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const data = await response.json();
    playlists.push(...data.items);
    url = data.next;
  }

  return playlists;
}

async function initPlaylists() {
  const select = document.getElementById("playlistSelect");
  const status = document.getElementById("playlistStatus");

  // Disable dropdown while loading
  select.disabled = true;
  status.textContent = "Loading playlists...";

  // Fetch all playlists (pagination-safe)
  let playlists = [];
  let url = "https://api.spotify.com/v1/me/playlists?limit=50";

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await response.json();
    playlists.push(...data.items);
    url = data.next; // fetch next page automatically
  }

  // Sort playlists alphabetically by name
  playlists.sort((a, b) => a.name.localeCompare(b.name));

  // Clear dropdown and add placeholder
  select.innerHTML = '<option value="">Select a playlist</option>';

  // Add all playlists to dropdown
  playlists.forEach(p => {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = `${p.name} (${p.owner.display_name})`;
    select.appendChild(option);
  });

  select.disabled = false;
  status.textContent = `Loaded ${playlists.length} playlists ✅`;
}


async function fetchAllTracks(playlistId) {
  let tracks = [];
  let url =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const data = await response.json();

    tracks.push(
      ...data.items
        .filter(item => item.track)
        .map(item => ({
          title: item.track.name,
          artist: item.track.artists.map(a => a.name).join(", ")
        }))
    );

    url = data.next;
  }

  return tracks;
}

document
  .getElementById("playlistSelect")
  .addEventListener("change", async (e) => {

    const playlistId = e.target.value;
    if (!playlistId) return;

    document.getElementById("playlistStatus").textContent =
      "Loading tracks...";

    const tracks = await fetchAllTracks(playlistId);

    document.getElementById("playlistStatus").textContent =
      `Loaded ${tracks.length} tracks ✅`;

    console.log("Tracks ready:", tracks);
  });

