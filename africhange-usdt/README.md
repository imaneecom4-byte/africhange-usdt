# AfriChange USDT

Plateforme d'échange **Mobile Money ↔ USDT** pour l'Afrique de l'Ouest (Burkina Faso, Côte d'Ivoire, Bénin, Togo), avec parcours client en étapes (wizard) et tableau de bord administrateur.

⚠️ **Avant de lancer ce service en production**, renseignez-vous sur la réglementation applicable à l'échange de devises et à la crypto-monnaie dans chacun des pays visés (BCEAO, autorités monétaires nationales). L'activité d'échange de fonds contre crypto-actifs peut nécessiter un agrément ou une licence selon les juridictions.

## Arborescence du projet

```
africhange-usdt/
├── supabase-setup.sql            # Script SQL complet (tables, RLS, triggers, données)
├── package.json
├── server.js                     # API Express (transactions, admin, uploads)
├── .env.example
├── netlify.toml                  # Configuration de déploiement Netlify
├── netlify/
│   └── functions/
│       └── api.js                # Adapte server.js en fonction serverless Netlify
└── public/
    ├── index.html                # Accueil : choix Achat / Vente
    ├── achat-step1.html … step5.html
    ├── vente-step1.html … step5.html
    ├── admin-login.html
    ├── admin-dashboard.html
    ├── css/style.css
    └── js/
        ├── main.js                # Logique client partagée
        ├── qrcode-generator.js    # Affichage du QR code USDT
        └── admin.js               # Logique admin
```

## 1. Créer le projet Supabase

1. Rendez-vous sur [supabase.com](https://supabase.com) et créez un nouveau projet.
2. Une fois le projet prêt, notez :
   - `Project URL` → variable `SUPABASE_URL`
   - `anon public key` → variable `SUPABASE_ANON_KEY`
   - `service_role key` → variable `SUPABASE_SERVICE_ROLE_KEY` (⚠️ ne jamais l'exposer côté client)

## 2. Exécuter le script SQL

1. Dans Supabase, ouvrez **SQL Editor**.
2. Copiez-collez l'intégralité du fichier `supabase-setup.sql`.
3. Cliquez sur **Run**. Cela crée les tables `admins`, `config`, `agents`, `transactions`, les triggers de calcul automatique, les politiques RLS et insère les données par défaut (taux, adresse USDT, numéros agents).
4. Vérifiez dans **Table Editor** que les tables sont bien peuplées.
5. Dans **Storage**, créez un bucket nommé `preuves-transactions` (public en lecture) pour les captures d'écran envoyées par les clients.

## 3. Créer un compte administrateur

La table `admins` stocke un hash bcrypt du mot de passe (jamais le mot de passe en clair). Générez ce hash localement :

```bash
node -e "console.log(require('bcryptjs').hashSync('VotreMotDePasse123', 10))"
```

Puis insérez l'administrateur dans Supabase (SQL Editor) :

```sql
insert into admins (email, password_hash, full_name)
values ('admin@africhange.com', 'COLLEZ_LE_HASH_ICI', 'Administrateur');
```

## 4. Configurer les variables d'environnement

Copiez `.env.example` en `.env` pour le développement local, puis renseignez vos valeurs Supabase et une clé `JWT_SECRET` aléatoire.

Pour la production, ajoutez les mêmes variables dans **Netlify → Site settings → Environment variables** :
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`

## 5. Tester en local

```bash
npm install
npm start
```

Le site est accessible sur `http://localhost:3000`, servi statiquement via `public/` (vous pouvez utiliser `npx serve public` en parallèle du serveur API, ou adapter `server.js` avec `express.static('public')` si vous préférez un seul processus).

## 6. Déployer sur Netlify

1. Poussez ce projet sur un dépôt Git (GitHub, GitLab…).
2. Sur [app.netlify.com](https://app.netlify.com), cliquez sur **Add new site → Import an existing project**, puis sélectionnez votre dépôt.
3. Netlify détecte automatiquement `netlify.toml` :
   - Dossier publié : `public`
   - Fonctions serverless : `netlify/functions`
4. Ajoutez les variables d'environnement (étape 4).
5. Déployez. Les appels du frontend vers `/api/...` sont automatiquement redirigés vers la fonction serverless qui exécute `server.js`.

## 7. Utilisation du tableau de bord admin

- Connectez-vous sur `/admin-login.html` avec le compte créé à l'étape 3.
- Onglet **Transactions** : filtrez par statut/type, visualisez les preuves (clic sur "Voir"), validez ou rejetez chaque transaction. Le client voit le changement de statut en temps réel (l'écran d'attente interroge le serveur toutes les 6 secondes).
- Onglet **Configuration** : modifiez les taux d'achat/vente, la marge, l'adresse USDT et les numéros d'agents — ces changements sont immédiatement pris en compte côté client.

## Notes techniques

- Le calcul du montant en FCFA et du bénéfice par transaction est effectué **automatiquement en base de données** par un trigger PostgreSQL, à partir des taux enregistrés au moment de la transaction (traçabilité même si les taux changent ensuite).
- Le RLS Supabase autorise la création publique de transactions et la lecture publique des taux/agents, mais réserve la lecture des transactions existantes et toute modification au rôle `service_role`, utilisé uniquement côté serveur.
- Le QR code de l'adresse USDT est généré côté serveur (librairie `qrcode`) pour garantir qu'il reflète toujours l'adresse actuellement configurée par l'admin.
