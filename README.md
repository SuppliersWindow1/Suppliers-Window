# Suppliers Window – boutique en ligne

- `web/` : le site (hébergé sur **Vercel**)
- `api/` : l'API, la base PostgreSQL et la vérification des paiements KKiaPay (hébergée sur **Railway**)

## 1. Mettre le projet sur GitHub
Faites-le depuis un ordinateur (c'est très pénible depuis un téléphone).
1. Décompressez le fichier ZIP.
2. Sur github.com : **New repository** → nom `suppliers-window` → **Private** → Create.
3. Sur la page du dépôt : **uploading an existing file** → glissez le **contenu** du dossier (`api`, `web`, `README.md`, `.gitignore`) → **Commit changes**.

## 2. Railway (API + base de données)
1. railway.com → **New Project** → **Deploy from GitHub repo** → choisissez `suppliers-window`.
2. Ouvrez le service créé → **Settings** → **Root Directory** = `api`.
3. Dans le même projet : **+ New** → **Database** → **PostgreSQL**.
4. Service API → **Variables** : ajoutez `DATABASE_URL` avec la valeur `${{Postgres.DATABASE_URL}}` (référence au service Postgres), puis les variables de `api/.env.example` : clés KKiaPay (Developers > API Keys), `KKIAPAY_SANDBOX=true`, `ADMIN_TOKEN` (un long mot de passe), `WEB_ORIGIN` (à remplir à l'étape 3).
5. **Settings → Networking → Generate Domain**. Copiez l'adresse, par exemple `https://xxx.up.railway.app`, et mettez-la aussi dans `PUBLIC_API_URL`.
6. Testez `https://xxx.up.railway.app/products` : vous devez voir la liste des articles (les tables et les 12 articles d'exemple sont créés au premier démarrage).

## 3. Vercel (le site)
1. Sur GitHub, ouvrez `web/config.js` → crayon → remplacez `API` par l'adresse Railway et `KKIAPAY_KEY` par votre **clé publique** KKiaPay. Commit.
2. vercel.com → **Add New → Project** → importez `suppliers-window`.
3. **Root Directory** = `web`, **Framework Preset** = Other → **Deploy**.
4. Retournez sur Railway et mettez l'adresse Vercel dans `WEB_ORIGIN`.

## 4. Tester avant d'ouvrir
Gardez `KKIAPAY_SANDBOX=true` et `SANDBOX:true`, payez avec les numéros de test KKiaPay, puis regardez les logs Railway : la ligne « KKiaPay verify » montre la réponse réelle. Vérifiez que les champs `status` et `amount` correspondent à ce que le code attend.

## 5. Passer en production
Clés de production KKiaPay, `KKIAPAY_SANDBOX=false`, `SANDBOX:false` dans `web/config.js`, puis votre nom de domaine (Vercel → Settings → Domains). Le certificat HTTPS est automatique.

## Gérer vos produits et stocks (en attendant une interface)
`POST {API}/admin/products` avec l'en-tête `Authorization: Bearer VOTRE_ADMIN_TOKEN` et un JSON `{name,category,emoji,price,description,composition,stock}` (ajoutez `id` pour modifier un article existant). `GET {API}/admin/orders` liste les commandes. Vous pouvez aussi modifier les tables directement depuis l'onglet Data de Railway.

## Pas encore inclus
Interface d'administration, comptes clients, relance de panier abandonné, fidélité et parrainage, retours en libre-service, Google Analytics, vraies photos. Le site étant une page unique, chaque article n'a pas encore sa propre adresse : le référencement Google est donc limité. Une version Next.js avec une page par article est la prochaine étape.
