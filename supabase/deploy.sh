#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Script de déploiement Supabase — EasyCompta
#
# Prérequis :
#   - Supabase CLI installé  : npm install -g supabase
#   - Connecté               : supabase login
#   - project_id renseigné   : supabase/config.toml
#
# Usage : bash supabase/deploy.sh
# ─────────────────────────────────────────────────────────────

set -e

echo "🚀 Déploiement EasyCompta — Supabase"
echo ""

# ── 1. Migrations SQL ─────────────────────────────────────────
echo "📦 Application des migrations…"
supabase db push
echo "   ✓ Migrations appliquées"
echo ""

# ── 2. Edge Function invite-member ───────────────────────────
echo "⚡ Déploiement de l'Edge Function invite-member…"
supabase functions deploy invite-member --no-verify-jwt
echo "   ✓ Function déployée"
echo ""

# ── 3. Secrets ───────────────────────────────────────────────
echo "🔑 Configuration des secrets…"
echo "   Renseigne les valeurs ci-dessous :"
echo ""

read -rp "   RESEND_API_KEY    : " RESEND_KEY
read -rp "   FROM_EMAIL        : " FROM_EMAIL

supabase secrets set \
  RESEND_API_KEY="$RESEND_KEY" \
  FROM_EMAIL="$FROM_EMAIL"

echo "   ✓ Secrets enregistrés"
echo ""

# ── 4. Rappel webhook SQL ─────────────────────────────────────
echo "⚠️  Étape manuelle restante :"
echo "   Ouvre le SQL Editor du Dashboard Supabase et exécute :"
echo "   supabase/migrations/20260606_003_invite_webhook.sql"
echo "   (après avoir remplacé YOUR_PROJECT_REF et YOUR_SERVICE_KEY)"
echo ""

echo "✅ Déploiement terminé !"
