// =====================================================================
// AfriChange USDT — admin.js (VERSION ULTIME CORRIGÉE)
// Authentification Supabase et gestion complète du tableau de bord.
// =====================================================================

// ⚠️ CONFIGURATION SUPABASE (TES VRAIES CLÉS SONT DÉJÀ INSÉRÉES)
const SUPABASE_URL = 'https://qlsetlqyejwrhztbesto.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsc2V0bHF5ZWp3cmh6dGJlc3RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTc1NzIsImV4cCI6MjEwNDQzMzU3Mn0.kcaf8RzfhPDGsAFhRfqDf6g7JiMSxh2Aoc2kk9v6gZ4'; 

// Initialisation du client Supabase avec vérification
let supabaseClient;
if (typeof window !== 'undefined') {
  try {
    if (typeof supabase !== 'undefined') {
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log("✅ Supabase client initialisé avec succès");
    } else {
      console.error("❌ Librairie Supabase non chargée");
    }
  } catch (error) {
    console.error(" Erreur lors de l'initialisation Supabase:", error);
  }
}

const CLE_SESSION = 'africhange_admin_session';

// =====================================================================
// FONCTIONS D'AUTHENTIFICATION
// =====================================================================

function recupererSessionAdmin() {
  return sessionStorage.getItem(CLE_SESSION);
}

function sauvegarderSessionAdmin(email) {
  sessionStorage.setItem(CLE_SESSION, email);
}

function supprimerSessionAdmin() {
  sessionStorage.removeItem(CLE_SESSION);
}

async function connexionAdmin(email, password) {
  if (!supabaseClient) {
    throw new Error("Configuration Supabase manquante. Vérifiez les clés API.");
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      console.error("Erreur de connexion:", error);
      if (error.message.includes('Invalid login credentials')) {
        throw new Error("Email ou mot de passe incorrect.");
      }
      throw new Error(error.message);
    }

    if (data.user) {
      sauvegarderSessionAdmin(data.user.email);
      console.log("✅ Connexion réussie pour:", data.user.email);
      return { success: true, user: data.user };
    } else {
      throw new Error("Échec de la connexion.");
    }
  } catch (err) {
    console.error("Erreur de connexion:", err);
    throw err;
  }
}

async function deconnexionAdmin() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  supprimerSessionAdmin();
  window.location.href = '/admin-login.html';
}

async function verifierAuthAdmin() {
  const sessionEmail = recupererSessionAdmin();
  
  if (!sessionEmail) {
    window.location.href = '/admin-login.html';
    return null;
  }

  if (supabaseClient) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      
      if (!session) {
        supprimerSessionAdmin();
        window.location.href = '/admin-login.html';
        return null;
      }
      return session.user;
    } catch (error) {
      console.error("Erreur vérification auth:", error);
      supprimerSessionAdmin();
      window.location.href = '/admin-login.html';
      return null;
    }
  }
  return null;
}

// =====================================================================
// GESTION DES TRANSACTIONS
// =====================================================================

async function chargerTransactions(filtres = {}) {
  if (!supabaseClient) throw new Error("Client Supabase non initialisé");

  try {
    let query = supabaseClient.from('transactions').select('*');

    if (filtres.statut) {
      query = query.eq('statut', filtres.statut);
    }
    if (filtres.type_transaction) {
      query = query.eq('type_transaction', filtres.type_transaction);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("Erreur chargement transactions:", error);
      throw error;
    }
    
    console.log("✅ Transactions chargées:", data?.length || 0);
    return data || [];
  } catch (err) {
    console.error("Erreur chargement transactions:", err);
    throw new Error("Impossible de charger les transactions.");
  }
}

async function changerStatutTransaction(id, statut, note_admin = '') {
  if (!supabaseClient) throw new Error("Client Supabase non initialisé");

  try {
    const { data, error } = await supabaseClient
      .from('transactions')
      .update({ 
        statut: statut,
        updated_at: new Date().toISOString(),
        note_admin: note_admin
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error("Erreur mise à jour statut:", error);
      throw error;
    }
    
    console.log("✅ Transaction mise à jour:", id, "statut:", statut);
    return data;
  } catch (err) {
    console.error("Erreur mise à jour statut:", err);
    throw new Error("Impossible de mettre à jour la transaction.");
  }
}

// =====================================================================
// GESTION DE LA CONFIGURATION
// =====================================================================

async function chargerConfig() {
  if (!supabaseClient) throw new Error("Client Supabase non initialisé");

  try {
    const { data, error } = await supabaseClient
      .from('config')
      .select('*')
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("Erreur chargement config:", error);
      throw error;
    }

    // Valeurs par défaut si rien n'existe
    if (!data) {
      console.log("️ Aucune config trouvée, utilisation des valeurs par défaut");
      return {
        adresse_usdt_reception: '0x5da17b728ab2d61ab273a1844b4ce0db4c545f95',
        taux_achat_client: 750,
        taux_vente_client: 730,
        marge_benefice: 20,
        frais_transaction: 0
      };
    }
    
    console.log("✅ Configuration chargée:", data);
    return data;
  } catch (err) {
    console.error("Erreur chargement config:", err);
    throw new Error("Impossible de charger la configuration.");
  }
}

async function enregistrerConfig(config) {
  if (!supabaseClient) throw new Error("Client Supabase non initialisé");

  try {
    // Vérifier si une config existe déjà
    const { data: existing } = await supabaseClient
      .from('config')
      .select('id')
      .limit(1)
      .single();

    let result;
    if (existing) {
      // Mettre à jour la config existante
      result = await supabaseClient
        .from('config')
        .update({
          adresse_usdt_reception: config.adresse_usdt_reception,
          taux_achat_client: config.taux_achat_client,
          taux_vente_client: config.taux_vente_client,
          marge_benefice: config.marge_benefice,
          frais_transaction: config.frais_transaction,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      // Créer une nouvelle config
      result = await supabaseClient
        .from('config')
        .insert([{
          adresse_usdt_reception: config.adresse_usdt_reception,
          taux_achat_client: config.taux_achat_client,
          taux_vente_client: config.taux_vente_client,
          marge_benefice: config.marge_benefice,
          frais_transaction: config.frais_transaction
        }])
        .select()
        .single();
    }

    if (result.error) {
      console.error("Erreur sauvegarde config:", result.error);
      throw result.error;
    }
    
    console.log("✅ Configuration sauvegardée:", result.data);
    return result.data;
  } catch (err) {
    console.error("Erreur sauvegarde config:", err);
    throw new Error("Impossible de sauvegarder la configuration.");
  }
}

// =====================================================================
// GESTION DES AGENTS (CORRIGÉ COMPLÈTEMENT)
// =====================================================================

async function chargerAgentsAdmin() {
  if (!supabaseClient) throw new Error("Client Supabase non initialisé");

  try {
    const { data, error } = await supabaseClient
      .from('agents')
      .select('*')
      .order('pays', { ascending: true });

    if (error) {
      console.error("Erreur chargement agents:", error);
      throw error;
    }
    
    console.log("✅ Agents chargés:", data?.length || 0);
    return data || [];
  } catch (err) {
    console.error("Erreur chargement agents:", err);
    throw new Error("Impossible de charger les agents.");
  }
}

async function enregistrerAgent(id, donnees) {
  if (!supabaseClient) throw new Error("Client Supabase non initialisé");

  try {
    console.log("🔄 Mise à jour agent ID:", id, "données:", donnees);
    
    const result = await supabaseClient
      .from('agents')
      .update({
        numero: donnees.numero,
        actif: donnees.actif !== undefined ? donnees.actif : true,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (result.error) {
      console.error("Erreur mise à jour agent:", result.error);
      throw result.error;
    }
    
    console.log("✅ Agent mis à jour:", id, "numéro:", donnees.numero);
    return result.data;
  } catch (err) {
    console.error("Erreur mise à jour agent:", err);
    throw new Error("Impossible de mettre à jour l'agent: " + (err.message || err));
  }
}

async function ajouterAgent(donnees) {
  if (!supabaseClient) throw new Error("Client Supabase non initialisé");

  try {
    console.log("🔄 Ajout agent:", donnees);
    
    const result = await supabaseClient
      .from('agents')
      .insert([{
        pays: donnees.pays,
        operateur: donnees.operateur,
        numero: donnees.numero,
        actif: donnees.actif !== undefined ? donnees.actif : true
      }])
      .select()
      .single();

    if (result.error) {
      console.error("Erreur ajout agent:", result.error);
      throw result.error;
    }
    
    console.log("✅ Agent ajouté:", result.data);
    return result.data;
  } catch (err) {
    console.error("Erreur ajout agent:", err);
    throw new Error("Impossible d'ajouter l'agent: " + (err.message || err));
  }
}

async function supprimerAgent(id) {
  if (!supabaseClient) throw new Error("Client Supabase non initialisé");

  try {
    console.log("🔄 Suppression agent ID:", id);
    
    const { error } = await supabaseClient
      .from('agents')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("Erreur suppression agent:", error);
      throw error;
    }
    
    console.log("✅ Agent supprimé:", id);
    return true;
  } catch (err) {
    console.error("Erreur suppression agent:", err);
    throw new Error("Impossible de supprimer l'agent: " + (err.message || err));
  }
}

// =====================================================================
// UTILITAIRES
// =====================================================================

function formaterFCFA(montant) {
  return `${Number(montant || 0).toLocaleString('fr-FR')} FCFA`;
}

function formaterDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('fr-FR', { 
    dateStyle: 'short', 
    timeStyle: 'short' 
  });
}

function badgeStatut(statut) {
  const styles = {
    en_attente: 'background:rgba(245,185,66,0.15); color:#f5b942;',
    valide: 'background:rgba(38,161,123,0.15); color:#26a17b;',
    rejete: 'background:rgba(242,88,107,0.15); color:#f2586b;',
    paye: 'background:rgba(59,130,246,0.15); color:#3b82f6;'
  };
  const libelles = { 
    en_attente: 'En attente', 
    valide: 'Validée', 
    rejete: 'Rejetée',
    paye: 'Payée'
  };
  return `<span class="text-xs px-2.5 py-1 rounded-full font-medium" style="${styles[statut] || styles.en_attente}">${libelles[statut] || 'Inconnu'}</span>`;
}

// Export global pour le HTML
if (typeof window !== 'undefined') {
  window.connexionAdmin = connexionAdmin;
  window.deconnexionAdmin = deconnexionAdmin;
  window.verifierAuthAdmin = verifierAuthAdmin;
  window.chargerTransactions = chargerTransactions;
  window.changerStatutTransaction = changerStatutTransaction;
  window.chargerConfig = chargerConfig;
  window.enregistrerConfig = enregistrerConfig;
  window.chargerAgentsAdmin = chargerAgentsAdmin;
  window.enregistrerAgent = enregistrerAgent;
  window.ajouterAgent = ajouterAgent;
  window.supprimerAgent = supprimerAgent;
  window.formaterFCFA = formaterFCFA;
  window.formaterDate = formaterDate;
  window.badgeStatut = badgeStatut;
  
  console.log("✅ Toutes les fonctions admin exportées globalement");
}
