#!/usr/bin/env bash
# Checks who can open which dashboard page, by really signing in as each role.
# Needs the local sample data (npm run db:reset:local) and a running site:
#
#   npm run dev                      # in one terminal
#   bash test/access-check.sh        # in another (default: http://localhost:3000)
#   bash test/access-check.sh http://localhost:8787   # against `npm run preview`
#
# Uses the local test password from seed/dev-accounts.mts. Never point it at the live site.

BASE="${1:-http://localhost:3000}"
PASSWORD=$(sed -n 's/^const DEV_PASSWORD = "\(.*\)";$/\1/p' "$(dirname "$0")/../seed/dev-accounts.mts")
JAR_DIR=$(mktemp -d)
FAILED=0

check() { # check <description> <expected> <actual>
  if [[ "$3" == "$2" ]]; then echo "  ok    $1"; else echo "  FAIL  $1 (expected $2, got $3)"; FAILED=1; fi
}

sign_in() { # sign_in <email> -> prints HTTP status, saves cookies in $JAR_DIR/<email>
  # Better Auth limits sign-in attempts (in production builds); its counter resets only after
  # 10 quiet seconds, so wait that long between sign-ins. The whole check takes about a minute.
  sleep 11
  curl -s -o /dev/null -w "%{http_code}" -c "$JAR_DIR/$1" -H "Origin: $BASE" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" "$BASE/api/auth/sign-in/email"
}

# Where does <page> send this person? "200" if it opens, otherwise the redirect target.
visit() { # visit <cookie-jar or ""> <page>
  local jar=() result
  [[ -n "$1" ]] && jar=(-b "$JAR_DIR/$1")
  result=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "${jar[@]}" "$BASE$2")
  if [[ "$result" == 200* ]]; then echo 200; else echo "${result#* }" | sed "s|^$BASE||"; fi
}

# The plain HTTP status of <url> (for API routes, which answer 401/403 instead of redirecting).
status() { # status <cookie-jar or ""> <url>
  local jar=()
  [[ -n "$1" ]] && jar=(-b "$JAR_DIR/$1")
  curl -s -o /dev/null -w "%{http_code}" "${jar[@]}" "$BASE$2"
}

echo "Visitor (not signed in)"
check "dashboard -> sign-in page" "/sign-in" "$(visit "" /dashboard)"
check "users page -> sign-in page" "/sign-in" "$(visit "" /dashboard/users)"
check "a submission -> sign-in page" "/sign-in" "$(visit "" /dashboard/review/s_tucano)"
check "export download is refused" "401" "$(status "" /api/export/places)"
check "public map opens" "200" "$(visit "" /)"

echo "Wrong password"
check "is refused" "401" "$(sign_in admin@example.com wrong-password)"

echo "User (ana@example.com)"
check "signs in" "200" "$(sign_in ana@example.com "$PASSWORD")"
check "dashboard -> no-access page" "/no-access" "$(visit ana@example.com /dashboard)"
check "review queue -> no-access page" "/no-access" "$(visit ana@example.com /dashboard/review)"
check "a submission -> no-access page" "/no-access" "$(visit ana@example.com /dashboard/review/s_tucano)"

echo "Reviewer (reviewer@example.com)"
check "signs in" "200" "$(sign_in reviewer@example.com "$PASSWORD")"
check "dashboard opens" "200" "$(visit reviewer@example.com /dashboard)"
check "review queue opens" "200" "$(visit reviewer@example.com /dashboard/review)"
check "places list opens" "200" "$(visit reviewer@example.com /dashboard/places)"
check "a submission opens" "200" "$(visit reviewer@example.com /dashboard/review/s_tucano)"
check "an unknown submission is 404" "404" "$(status reviewer@example.com /dashboard/review/nope)"
check "users page -> no-access page" "/no-access" "$(visit reviewer@example.com /dashboard/users)"
check "change history -> no-access page" "/no-access" "$(visit reviewer@example.com /dashboard/history)"
check "export page -> no-access page" "/no-access" "$(visit reviewer@example.com /dashboard/export)"
check "export download is refused" "403" "$(status reviewer@example.com /api/export/places)"

echo "Admin (admin@example.com)"
check "signs in" "200" "$(sign_in admin@example.com "$PASSWORD")"
check "users page opens" "200" "$(visit admin@example.com /dashboard/users)"
check "change history opens" "200" "$(visit admin@example.com /dashboard/history)"
check "export page opens" "200" "$(visit admin@example.com /dashboard/export)"
check "export download works" "200" "$(status admin@example.com /api/export/places)"
check "unknown export is 404" "404" "$(status admin@example.com /api/export/passwords)"

echo "New sign-up that asks to be admin"
EMAIL="newcomer-$RANDOM@example.com"
curl -s -o /dev/null -c "$JAR_DIR/$EMAIL" -H "Origin: $BASE" -H "Content-Type: application/json" \
  -d "{\"name\":\"Newcomer\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"role\":\"admin\"}" "$BASE/api/auth/sign-up/email"
check "still gets no dashboard (role stays 'user')" "/no-access" "$(visit "$EMAIL" /dashboard)"

rm -rf "$JAR_DIR"
if [[ $FAILED == 0 ]]; then echo "All access checks passed."; else echo "Some access checks FAILED."; exit 1; fi
