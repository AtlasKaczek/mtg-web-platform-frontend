import { createSignal, createResource, onMount, For, Show } from 'solid-js';
import { UserManager, User } from 'oidc-client-ts';

// Configure the connection to Keycloak
const userManager = new UserManager({
  authority: 'http://localhost:8081/realms/mtg-realm',
  client_id: 'mtg-frontend',
  redirect_uri: 'http://localhost:3000',
  post_logout_redirect_uri: 'http://localhost:3000',
  response_type: 'code',
  scope: 'openid profile',
});

interface GameTable {
  id: string;
  name: string;
  hostName: string;
  format: string;
  playerCount: number;
  maxPlayers: number;
}

const fetchTables = async () => {
  const response = await fetch('http://localhost:8080/api/tables');
  if (!response.ok) throw new Error("Network response was not ok");
  return response.json() as Promise<GameTable[]>;
};

function App() {
  const [refetchTrigger, setRefetchTrigger] = createSignal(0);
  const [tables, { refetch }] = createResource(refetchTrigger, fetchTables);
  
  // State to hold our logged-in user
  const [user, setUser] = createSignal<User | null>(null);

  onMount(async () => {
    // 1. Check if we are returning from a Keycloak login redirect
    try {
      if (window.location.search.includes('code=')) {
        const loggedInUser = await userManager.signinCallback();
        setUser(loggedInUser);
        // Clean up the URL so the '?code=...' disappears
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        // 2. Otherwise, check if we already have a saved session
        const currentUser = await userManager.getUser();
        setUser(currentUser);
      }
    } catch (e) {
      console.error("Auth error:", e);
    }
  });

  const handleLogin = () => userManager.signinRedirect();
  const handleLogout = () => userManager.signoutRedirect();
  const handleRefresh = () => setRefetchTrigger(prev => prev + 1);

  const handleCreateTable = async () => {
    if (!user()) {
      alert("You must be logged in to create a table!");
      return;
    }

    const newTable = {
      name: `Table ${Math.floor(Math.random() * 1000)}`,
      hostName: user()?.profile.preferred_username || "Unknown Mage",
      format: "Modern",
      maxPlayers: 2
    };

    try {
      const response = await fetch('http://localhost:8080/api/tables', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // We will eventually verify this token on the Go backend!
          'Authorization': `Bearer ${user()?.access_token}` 
        },
        body: JSON.stringify(newTable)
      });

      if (response.ok) handleRefresh();
    } catch (error) {
      console.error("Failed to create table:", error);
    }
  };

  return (
    <div class="min-h-screen p-8">
      <header class="mb-8 flex justify-between items-center border-b border-gray-700 pb-4">
        <h1 class="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-600">
          MTG Arena Nexus
        </h1>
        
        {/* Authentication Controls */}
        <div class="flex items-center gap-4">
          <Show when={user()} fallback={
            <button onClick={handleLogin} class="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded font-bold transition shadow-lg border border-orange-400">
              Log In
            </button>
          }>
            <div class="flex items-center gap-4">
              <span class="text-gray-300 font-medium text-lg">
                Welcome, <span class="text-white font-bold">{user()?.profile.preferred_username}</span>
              </span>
              <button onClick={handleLogout} class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm transition">
                Log Out
              </button>
            </div>
          </Show>
        </div>
      </header>

      <main>
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold">Open Tables</h2>
          <div class="flex items-center gap-4">
            <Show when={tables.loading}>
              <span class="text-gray-400 text-sm animate-pulse">Fetching...</span>
            </Show>
            <button onClick={handleRefresh} class="text-gray-400 hover:text-white transition text-sm">
              Refresh
            </button>
            <button 
              onClick={handleCreateTable}
              class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold shadow-lg transition"
            >
              + Create Table
            </button>
          </div>
        </div>

        {/* The Grid of Tables */}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Show when={!tables.loading && tables()?.length === 0}>
             <div class="col-span-full text-center text-gray-500 py-10">
               No open tables right now. Be the first to create one!
             </div>
          </Show>

          <Show when={tables()}>
            <For each={tables()}>{(table) => (
              <div class="bg-gray-800 border-t-4 border-orange-500 rounded-lg shadow-xl p-5 flex flex-col justify-between hover:bg-gray-750 transition border border-gray-700">
                <div>
                  <div class="flex justify-between items-start mb-2">
                    <h3 class="text-xl font-bold truncate pr-2">{table.name}</h3>
                    <span class="bg-gray-700 text-xs px-2 py-1 rounded text-gray-300 whitespace-nowrap">
                      {table.format}
                    </span>
                  </div>
                  <p class="text-gray-400 text-sm mb-4">Host: <span class="text-gray-200">{table.hostName}</span></p>
                </div>
                
                <div class="flex justify-between items-center mt-auto pt-4 border-t border-gray-700">
                  <span class="text-sm font-medium text-gray-300">
                    Players: {table.playerCount} / {table.maxPlayers}
                  </span>
                  <button 
                    class="bg-orange-600 hover:bg-orange-500 px-4 py-2 rounded text-white text-sm font-bold transition disabled:opacity-50"
                    disabled={table.playerCount >= table.maxPlayers}
                  >
                    {table.playerCount >= table.maxPlayers ? 'Full' : 'Join'}
                  </button>
                </div>
              </div>
            )}</For>
          </Show>
        </div>
      </main>
    </div>
  );
}

export default App;