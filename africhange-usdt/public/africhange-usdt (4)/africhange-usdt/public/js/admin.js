// =====================================================================
// AfriChange USDT — admin.js
// Authentification et appels API pour le tableau de bord administrateur.
// =====================================================================

const API = '/api';
const CLE_TOKEN = 'africhange_admin_token';

function recupererTokenAdmin() {
  return sessionStorage.getItem(CLE_TOKEN);
}

function deconnexionAdmin() {
  sessionStorage.removeItem(CLE_TOKEN);
  window.location.href = '/admin-login.html';
}

async function connexionAdmin(email, password) {
  const res = await fetch(`${API}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.erreur || 'Connexion impossible.');
  sessionStorage.setItem(CLE_TOKEN, data.token);
  return data;
}

// Appel générique authentifié vers l'API admin
async function appelAdmin(chemin, options = {}) {
  const token = recupererTokenAdmin();
  if (!token) {
    deconnexionAdmin();
    throw new Error('Session expirée.');
  }
  const res = await fetch(`${API}${chemin}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    deconnexionAdmin();
    throw new Error('Session expirée.');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.erreur || 'Une erreur est survenue.');
  return data;
}

async function chargerTransactions(filtres = {}) {
  const params = new URLSearchParams(filtres).toString();
  return appelAdmin(`/admin/transactions${params ? `?${params}` : ''}`);
}

async function changerStatutTransaction(id, statut, note_admin) {
  return appelAdmin(`/admin/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ statut, note_admin }),
  });
}

async function chargerBenefices() {
  return appelAdmin('/admin/benefices');
}

async function chargerConfig() {
  return appelAdmin('/admin/config');
}

async function enregistrerConfig(config) {
  return appelAdmin('/admin/config', { method: 'PUT', body: JSON.stringify(config) });
}

async function chargerAgentsAdmin() {
  return appelAdmin('/admin/agents');
}

async function enregistrerAgent(id, donnees) {
  return appelAdmin(`/admin/agents/${id}`, { method: 'PUT', body: JSON.stringify(donnees) });
}

function formaterFCFA(montant) {
  return `${Number(montant || 0).toLocaleString('fr-FR')} FCFA`;
}

function formaterDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function badgeStatut(statut) {
  const styles = {
    en_attente: 'background:rgba(245,185,66,0.15); color:#f5b942;',
    valide: 'background:rgba(38,161,123,0.15); color:#26a17b;',
    rejete: 'background:rgba(242,88,107,0.15); color:#f2586b;',
  };
  const libelles = { en_attente: 'En attente', valide: 'Validée', rejete: 'Rejetée' };
  return `<span class="text-xs px-2.5 py-1 rounded-full font-medium" style="${styles[statut]}">${libelles[statut]}</span>`;
}
