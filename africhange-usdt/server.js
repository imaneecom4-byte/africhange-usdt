// =====================================================================
// AfriChange USDT — Serveur Express
// Gère : soumission des transactions, upload des preuves (Supabase
// Storage), authentification admin, et les actions du dashboard admin.
// Ce fichier fonctionne aussi bien en local (node server.js) que sur
// Netlify grâce à l'export "serverless-http" utilisé par
// netlify/functions/api.js
// =====================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// ---------------------------------------------------------------------
// Configuration Supabase
// La clé "service_role" est utilisée UNIQUEMENT côté serveur, jamais
// exposée au navigateur : elle contourne le RLS pour l'admin.
// ---------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'changez-cette-cle-en-production';

const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const BUCKET_PREUVES = 'preuves-transactions';

// ---------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// En local (node server.js), sert aussi le site statique pour tester
// sans avoir à lancer un second serveur. Sur Netlify, les fichiers de
// "public" sont servis directement par le CDN, cette ligne est ignorée.
if (require.main === module) {
  app.use(express.static(require('path').join(__dirname, 'public')));
}

// Upload en mémoire (on transfère directement vers Supabase Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo max
});

// Vérifie le token JWT admin sur les routes protégées
function verifierAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ erreur: 'Authentification requise.' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ erreur: 'Session invalide ou expirée.' });
  }
}

// ---------------------------------------------------------------------
// ROUTES PUBLIQUES
// ---------------------------------------------------------------------

// Config actuelle (taux, adresse USDT) — utilisée par les écrans client
app.get('/api/config', async (req, res) => {
  const { data, error } = await supabasePublic.from('config').select('*').eq('id', 1).single();
  if (error) return res.status(500).json({ erreur: error.message });
  res.json(data);
});

// Liste des agents Mobile Money actifs
app.get('/api/agents', async (req, res) => {
  const { data, error } = await supabasePublic.from('agents').select('*').eq('actif', true);
  if (error) return res.status(500).json({ erreur: error.message });
  res.json(data);
});

// Génère un QR code (data URL PNG) pour l'adresse USDT, utilisé au module Vente
app.get('/api/qrcode-usdt', async (req, res) => {
  try {
    const { data: cfg } = await supabasePublic.from('config').select('adresse_usdt').eq('id', 1).single();
    const dataUrl = await QRCode.toDataURL(cfg.adresse_usdt, { margin: 1, width: 300 });
    res.json({ qrcode: dataUrl, adresse: cfg.adresse_usdt });
  } catch (e) {
    res.status(500).json({ erreur: 'Impossible de générer le QR code.' });
  }
});

// Création d'une transaction (Achat ou Vente) — écran 1
app.post('/api/transactions', async (req, res) => {
  const t = req.body;
  if (!t.type || !['achat', 'vente'].includes(t.type)) {
    return res.status(400).json({ erreur: 'Type de transaction invalide.' });
  }
  if (!t.montant_usdt || Number(t.montant_usdt) <= 0) {
    return res.status(400).json({ erreur: 'Le montant en USDT doit être supérieur à 0.' });
  }

  const payload = {
    type: t.type,
    nom: t.nom,
    prenom: t.prenom || null,
    telephone: t.telephone,
    pays: t.pays || null,
    operateur: t.operateur || null,
    agent_numero: t.agent_numero || null,
    wallet_usdt_reception: t.wallet_usdt_reception || null,
    numero_reception: t.numero_reception || null,
    operateur_reception: t.operateur_reception || null,
    montant_usdt: t.montant_usdt,
  };

  const { data, error } = await supabaseAdmin.from('transactions').insert(payload).select().single();
  if (error) return res.status(500).json({ erreur: error.message });
  res.json(data);
});

// Upload de la preuve (capture d'écran mobile money OU TxID crypto) — écran 3
app.post('/api/transactions/:id/preuve', upload.single('preuve'), async (req, res) => {
  const { id } = req.params;
  const { txid_usdt } = req.body;

  let preuveUrl = null;
  if (req.file) {
    const nomFichier = `${id}-${Date.now()}-${req.file.originalname}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_PREUVES)
      .upload(nomFichier, req.file.buffer, { contentType: req.file.mimetype });
    if (uploadError) return res.status(500).json({ erreur: uploadError.message });

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET_PREUVES).getPublicUrl(nomFichier);
    preuveUrl = urlData.publicUrl;
  }

  const maj = {};
  if (preuveUrl) maj.preuve_url = preuveUrl;
  if (txid_usdt) maj.txid_usdt = txid_usdt;

  const { data, error } = await supabaseAdmin.from('transactions').update(maj).eq('id', id).select().single();
  if (error) return res.status(500).json({ erreur: error.message });
  res.json(data);
});

// Statut d'une transaction — utilisé par l'écran 4 (attente) pour "poller"
app.get('/api/transactions/:id/statut', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('id, statut, type, montant_usdt, montant_fcfa')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ erreur: 'Transaction introuvable.' });
  res.json(data);
});

// ---------------------------------------------------------------------
// AUTHENTIFICATION ADMIN
// ---------------------------------------------------------------------
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  const { data: admin, error } = await supabaseAdmin.from('admins').select('*').eq('email', email).eq('is_active', true).single();
  if (error || !admin) return res.status(401).json({ erreur: 'Identifiants incorrects.' });

  const motDePasseValide = await bcrypt.compare(password, admin.password_hash);
  if (!motDePasseValide) return res.status(401).json({ erreur: 'Identifiants incorrects.' });

  const token = jwt.sign({ id: admin.id, email: admin.email }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, admin: { id: admin.id, email: admin.email, nom: admin.full_name } });
});

// ---------------------------------------------------------------------
// ROUTES ADMIN (protégées par verifierAdmin)
// ---------------------------------------------------------------------

// Liste des transactions avec filtres (statut, type)
app.get('/api/admin/transactions', verifierAdmin, async (req, res) => {
  const { statut, type } = req.query;
  let requete = supabaseAdmin.from('transactions').select('*').order('created_at', { ascending: false });
  if (statut) requete = requete.eq('statut', statut);
  if (type) requete = requete.eq('type', type);

  const { data, error } = await requete;
  if (error) return res.status(500).json({ erreur: error.message });
  res.json(data);
});

// Valider ou rejeter une transaction
app.patch('/api/admin/transactions/:id', verifierAdmin, async (req, res) => {
  const { statut, note_admin } = req.body;
  if (!['valide', 'rejete', 'en_attente'].includes(statut)) {
    return res.status(400).json({ erreur: 'Statut invalide.' });
  }
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .update({ statut, note_admin: note_admin || null })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ erreur: error.message });
  res.json(data);
});

// Bénéfices totaux (vue SQL vue_benefices)
app.get('/api/admin/benefices', verifierAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('vue_benefices').select('*').single();
  if (error) return res.status(500).json({ erreur: error.message });
  res.json(data);
});

// Lire / modifier la configuration (taux, adresse USDT)
app.get('/api/admin/config', verifierAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('config').select('*').eq('id', 1).single();
  if (error) return res.status(500).json({ erreur: error.message });
  res.json(data);
});

app.put('/api/admin/config', verifierAdmin, async (req, res) => {
  const { taux_achat, taux_vente, marge_beneficiaire, adresse_usdt, reseau_usdt } = req.body;
  const { data, error } = await supabaseAdmin
    .from('config')
    .update({ taux_achat, taux_vente, marge_beneficiaire, adresse_usdt, reseau_usdt })
    .eq('id', 1)
    .select()
    .single();
  if (error) return res.status(500).json({ erreur: error.message });
  res.json(data);
});

// Lire / modifier les agents Mobile Money
app.get('/api/admin/agents', verifierAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('agents').select('*').order('pays');
  if (error) return res.status(500).json({ erreur: error.message });
  res.json(data);
});

app.put('/api/admin/agents/:id', verifierAdmin, async (req, res) => {
  const { numero, actif } = req.body;
  const { data, error } = await supabaseAdmin
    .from('agents')
    .update({ numero, actif })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ erreur: error.message });
  res.json(data);
});

// ---------------------------------------------------------------------
// Démarrage local (ignoré quand le module est importé par Netlify)
// ---------------------------------------------------------------------
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`AfriChange USDT — serveur démarré sur le port ${PORT}`));
}

module.exports = app;
