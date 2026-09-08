// =====================================================================
// AfriChange USDT — main.js
// Logique commune à tous les écrans clients (achat et vente) :
// - lecture/écriture de l'état du parcours dans sessionStorage
// - appels à l'API (config, agents, création/màj de transaction)
// - rendu des cartes opérateur avec leurs couleurs de marque
// =====================================================================

const API = '/api';
const CLE_PARCOURS = 'africhange_parcours';

// Couleurs de marque des opérateurs (pour les logos/pastilles)
const COULEURS_OPERATEUR = {
  'Orange Money': '#ff7900',
  'Moov Money': '#005baa',
  'Wave': '#1dc8e0',
  'MTN Money': '#ffcb05',
  'Celtiis': '#7c3aed',
  'Mix Bay Yas': '#e4032e',
};

function initiales(operateur) {
  return operateur
    .split(' ')
    .map((mot) => mot[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

// --- Gestion de l'état du parcours (persiste entre les pages step1..step5) ---
function lireParcours() {
  try {
    return JSON.parse(sessionStorage.getItem(CLE_PARCOURS)) || {};
  } catch {
    return {};
  }
}

function ecrireParcours(donnees) {
  const actuel = lireParcours();
  sessionStorage.setItem(CLE_PARCOURS, JSON.stringify({ ...actuel, ...donnees }));
}

function reinitialiserParcours() {
  sessionStorage.removeItem(CLE_PARCOURS);
}

// --- Appels API ---
async function recupererConfig() {
  const res = await fetch(`${API}/config`);
  if (!res.ok) throw new Error('Impossible de charger la configuration.');
  return res.json();
}

async function recupererAgents() {
  const res = await fetch(`${API}/agents`);
  if (!res.ok) throw new Error('Impossible de charger les agents.');
  return res.json();
}

async function creerTransaction(payload) {
  const res = await fetch(`${API}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.erreur || 'Erreur lors de la création de la transaction.');
  return data;
}

async function envoyerPreuve(id, { fichier, txid }) {
  const form = new FormData();
  if (fichier) form.append('preuve', fichier);
  if (txid) form.append('txid_usdt', txid);
  const res = await fetch(`${API}/transactions/${id}/preuve`, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.erreur || "Erreur lors de l'envoi de la preuve.");
  return data;
}

async function verifierStatut(id) {
  const res = await fetch(`${API}/transactions/${id}/statut`);
  if (!res.ok) throw new Error('Transaction introuvable.');
  return res.json();
}

// --- Rendu des cartes de sélection opérateur ---
function creerCarteOperateur(agent, selectionne, onClick) {
  const div = document.createElement('button');
  div.type = 'button';
  div.className = `choix-carte${selectionne ? ' selectionne' : ''}`;
  const couleur = COULEURS_OPERATEUR[agent.operateur] || '#26a17b';
  div.innerHTML = `
    <div class="logo-pastille" style="background:${couleur}">${initiales(agent.operateur)}</div>
    <div class="text-sm font-medium">${agent.operateur}</div>
    <div class="text-xs text-slate-400 mt-0.5">${agent.pays}</div>
  `;
  div.addEventListener('click', () => onClick(agent));
  return div;
}

// --- Barre d'étapes (5 segments) ---
function rendreEtapes(conteneur, etapeActuelle) {
  conteneur.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const seg = document.createElement('div');
    seg.className = 'etape-point';
    if (i < etapeActuelle) seg.classList.add('faite');
    if (i === etapeActuelle) seg.classList.add('active');
    conteneur.appendChild(seg);
  }
}

// --- Redirection avec petite protection : si aucune donnée de parcours,
// renvoyer à l'écran 1 correspondant ---
function exigerParcours(champsRequis, urlRetour) {
  const p = lireParcours();
  const manquant = champsRequis.some((c) => !p[c]);
  if (manquant) window.location.href = urlRetour;
  return p;
}

function afficherErreur(element, message) {
  element.textContent = message;
  element.classList.remove('hidden');
}
