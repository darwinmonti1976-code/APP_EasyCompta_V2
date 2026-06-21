# Checklist de soumission aux stores — EasyCompta

## Avant le build

- [ ] `eas.json` : renseigner `ascAppId` (App Store Connect → Mon App → ID Apple)
- [ ] `eas.json` : renseigner `appleTeamId` (developer.apple.com → Membership → Team ID)
- [ ] Héberger `privacy-policy.html` (GitHub Pages, Netlify, ou autre) et noter l'URL
- [ ] Mettre à jour l'URL de la politique dans App Store Connect et Play Console

## Build de production

```bash
# Installer les dépendances du module widget
cd modules/widget-bridge && npm install && cd ../..

# Build production (iOS + Android)
eas build --profile production --platform all
```

## App Store Connect (iOS)

- [ ] Créer l'app (Identifiant : com.darwinmonti.easycompta)
- [ ] Renseigner le nom : **EasyCompta**
- [ ] Sous-titre : **Finances vocales & intelligentes** (30 car.)
- [ ] Description FR : voir `store/description_fr.md`
- [ ] Mots-clés : `finances,budget,dépenses,vocal,IA,comptabilité,reçu,OCR,famille,partage,revenus,épargne`
- [ ] Notes de version : voir `store/description_fr.md`
- [ ] URL politique de confidentialité : (ton URL hébergée)
- [ ] Catégorie principale : **Finance**
- [ ] Captures d'écran iPhone 6.7" : minimum 3 (1290×2796 px)
- [ ] Captures d'écran iPhone 6.5" : minimum 3 (1242×2688 px)
- [ ] Icône marketing : `assets/icon.png` (1024×1024, sans arrondi, sans transparence) ✓
- [ ] Classification : 4+ (aucun contenu inapproprié)
- [ ] Conformité chiffrement : OUI (HTTPS standard)
- [ ] App Store Connect → App Group `group.com.darwinmonti.easycompta` activé
- [ ] Soumettre pour review

```bash
eas submit --platform ios
```

## Google Play Console (Android)

- [ ] Créer l'app (Package : com.darwinmonti.easycompta)
- [ ] Titre : **EasyCompta - Finances vocales IA** (50 car.)
- [ ] Description courte : **Enregistre tes dépenses à la voix ou en photo. IA, budgets, famille.**
- [ ] Description longue : voir `store/description_fr.md`
- [ ] Catégorie : **Finance**
- [ ] URL politique de confidentialité : (ton URL hébergée)
- [ ] Icône 512×512 : dériver de `assets/icon.png` ✓
- [ ] Feature graphic : 1024×500 px (à créer — fond #7C9EFF avec logo)
- [ ] Captures d'écran téléphone : minimum 2 (1080×1920 px ou similaire)
- [ ] Questionnaire sécurité des données (collecte : email, données financières, photos)
- [ ] Compte de service Google → générer `google-service-account.json`
- [ ] Track : **Production** (ou Internal → Alpha → Beta → Production)

```bash
eas submit --platform android
```

## Supabase (si pas encore fait)

- [ ] Exécuter `20260606_001_budgets.sql` dans le SQL Editor
- [ ] Exécuter `20260606_002_realtime.sql` dans le SQL Editor
- [ ] Exécuter `20260606_003_invite_webhook.sql` (après avoir remplacé les placeholders)
- [ ] `bash supabase/deploy.sh` (déploie invite-member + secrets Resend)

## Captures d'écran recommandées (à prendre via Simulator/Emulator)

1. **Écran d'accueil** — micro visible, résumé mensuel, dernières transactions
2. **Enregistrement vocal** — micro actif, feedback "Je t'écoute…"
3. **Transaction ajoutée** — banner succès + bouton Modifier
4. **Historique** — liste avec filtres et graphiques analytics
5. **Workspace partagé** — liste avec badges créateurs
6. **Réglages** — devise par défaut, thème sombre, budget

## Feature Graphic Android (1024×500 px)

Fond dégradé `#7C9EFF → #5B7FE8`, logo EasyCompta centré, texte :
"Finances vocales & intelligentes" en blanc, sous-texte "Parle. L'IA enregistre."
Outil suggéré : Canva (template Feature Graphic Google Play)
