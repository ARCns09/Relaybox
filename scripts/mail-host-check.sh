#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
SHOW_IP=false
[[ "${1:-}" == "--show-ip" ]] && SHOW_IP=true

pass() { printf 'PASS    %s\n' "$*"; }
warn() { printf 'WARNING %s\n' "$*"; }
fail() { printf 'FAIL    %s\n' "$*"; }
unknown() { printf 'UNKNOWN %s\n' "$*"; }

has() { command -v "$1" >/dev/null 2>&1; }

read_setting() {
  local name="$1" value=""
  if [[ -n "${!name:-}" ]]; then
    value="${!name}"
  elif [[ -f "${PROJECT_DIR}/.env" ]]; then
    value="$(sed -n "s/^${name}=//p" "${PROJECT_DIR}/.env" | tail -n 1)"
  elif [[ -f "${PROJECT_DIR}/.env.example" ]]; then
    value="$(sed -n "s/^${name}=//p" "${PROJECT_DIR}/.env.example" | tail -n 1)"
  fi
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}

redact_ipv4() {
  if $SHOW_IP; then printf '%s' "$1"; else printf '%s' "$1" | sed -E 's/^([0-9]+\.[0-9]+\.[0-9]+)\.[0-9]+$/\1.x/'; fi
}

redact_ipv6() {
  if $SHOW_IP; then printf '%s' "$1"; else printf '%s' "$1" | awk -F: '{ print $1 ":" $2 ":" $3 ":" $4 "::/64" }'; fi
}

is_private_ipv4() {
  local ip="$1" first second
  IFS=. read -r first second _ _ <<< "$ip"
  [[ "$first" == "10" ]] || [[ "$first" == "192" && "$second" == "168" ]] || [[ "$first" == "172" && "$second" -ge 16 && "$second" -le 31 ]]
}

is_cgnat_ipv4() {
  local ip="$1" first second
  IFS=. read -r first second _ _ <<< "$ip"
  [[ "$first" == "100" && "$second" -ge 64 && "$second" -le 127 ]]
}

tcp_check() {
  local label="$1" host="$2" port="$3" family="${4:--4}"
  if ! has nc; then unknown "${label}: netcat is not installed"; return 2; fi
  if timeout 8 nc "$family" -z -w 6 "$host" "$port" >/dev/null 2>&1; then
    pass "${label}: outbound TCP connection succeeded (${host}:${port})"; return 0
  fi
  fail "${label}: outbound TCP connection failed or timed out (${host}:${port})"; return 1
}

printf '\nRELAYBOX MAIL HOST CHECK\n'
printf 'Read-only diagnostics; no DNS, firewall, package, or service changes are made.\n'
printf 'Run with --show-ip to print complete public addresses.\n\n'

local_ipv4=""
if has ip; then local_ipv4="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i=1; i<=NF; i++) if ($i == "src") { print $(i+1); exit } }')"; fi
if [[ -n "$local_ipv4" ]]; then pass "Local IPv4 detected: $(redact_ipv4 "$local_ipv4")"; else unknown "Local IPv4 could not be detected"; fi

public_ipv4=""
if has curl; then
  for endpoint in https://api.ipify.org https://ipv4.icanhazip.com https://ifconfig.me/ip; do
    public_ipv4="$(curl -4fsS --max-time 6 "$endpoint" 2>/dev/null | tr -d '[:space:]' || true)"
    [[ "$public_ipv4" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && break
  done
fi
if [[ "$public_ipv4" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  pass "Public IPv4 detected: $(redact_ipv4 "$public_ipv4")"
else
  public_ipv4=""; fail "Public IPv4 was not detected"
fi

local_ipv6=""
if has ip; then local_ipv6="$(ip -6 -o addr show scope global 2>/dev/null | awk 'NR == 1 { sub(/\/.*/, "", $4); print $4 }')"; fi
public_ipv6=""
if has curl; then
  for endpoint in https://api6.ipify.org https://icanhazip.com; do
    public_ipv6="$(curl -6fsS --max-time 6 "$endpoint" 2>/dev/null | tr -d '[:space:]' || true)"
    [[ "$public_ipv6" == *:* ]] && break
  done
fi
if [[ -n "$local_ipv6" && "$public_ipv6" == *:* ]]; then pass "Public IPv6 detected: $(redact_ipv6 "$public_ipv6")"; else warn "No working public IPv6 was detected"; fi

cgnat="UNKNOWN"
if [[ -n "$local_ipv4" && -n "$public_ipv4" ]]; then
  if is_cgnat_ipv4 "$local_ipv4"; then
    cgnat="YES"; fail "CGNAT is likely: the host-facing IPv4 is in 100.64.0.0/10"
  elif [[ "$local_ipv4" == "$public_ipv4" ]]; then
    cgnat="NO"; pass "CGNAT: no address translation detected"
  elif is_private_ipv4 "$local_ipv4"; then
    unknown "CGNAT: private LAN plus public IPv4 detected; router WAN status is required to distinguish normal NAT from CGNAT"
  else
    unknown "CGNAT could not be determined from host-visible addresses"
  fi
else
  unknown "CGNAT could not be evaluated"
fi

inbound_status="UNKNOWN"
if has ss && ss -ltnH '( sport = :25 )' 2>/dev/null | grep -q .; then
  unknown "TCP 25 inbound: a local listener exists, but internet reachability requires an external probe and router/firewall verification"
else
  unknown "TCP 25 inbound: no local SMTP listener; install nothing yet—external reachability cannot be proven from this host alone"
fi

outbound25="FAIL"
outbound25_ipv4="FAIL"
outbound25_ipv6="UNAVAILABLE"
if tcp_check "TCP 25 outbound over IPv4" "gmail-smtp-in.l.google.com" 25 -4; then outbound25="PASS"; outbound25_ipv4="PASS"; fi
if [[ -n "$public_ipv6" ]]; then
  outbound25_ipv6="FAIL"
  if tcp_check "TCP 25 outbound over IPv6" "gmail-smtp-in.l.google.com" 25 -6; then outbound25="PASS"; outbound25_ipv6="PASS"; fi
fi
tcp_check "TCP 587 outbound over IPv4" "smtp.gmail.com" 587 -4 || true
tcp_check "TCP 465 outbound over IPv4" "smtp.gmail.com" 465 -4 || true

ptr_status="FAIL"
ptr4_status="FAIL"
ptr6_status="FAIL"
ptr_name=""
if [[ -n "$public_ipv4" ]] && has dig; then
  ptr_name="$(dig +time=3 +tries=1 +short -x "$public_ipv4" 2>/dev/null | grep -v '^;' | head -n 1 | sed 's/\.$//')"
  if [[ -n "$ptr_name" && "$ptr_name" == *.* && "$ptr_name" != *.local ]]; then
    forward_ips="$(dig +time=3 +tries=1 +short A "$ptr_name" 2>/dev/null)"
    if grep -Fxq "$public_ipv4" <<< "$forward_ips"; then ptr4_status="PASS"; pass "PTR: ${ptr_name} forward-confirms to the public IPv4"
    else warn "PTR: ${ptr_name} exists but does not forward-confirm to the public IPv4"; fi
  elif [[ -n "$ptr_name" ]]; then
    fail "PTR: '${ptr_name}' is not a usable fully qualified mail hostname"
  else
    fail "PTR: no reverse-DNS hostname exists for the public IPv4"
  fi
else
  unknown "PTR could not be checked"
fi
if [[ -n "$public_ipv6" ]] && has dig; then
  ptr6_name="$(dig +time=3 +tries=1 +short -x "$public_ipv6" 2>/dev/null | grep -v '^;' | head -n 1 | sed 's/\.$//')"
  if [[ -n "$ptr6_name" && "$ptr6_name" == *.* && "$ptr6_name" != *.local ]]; then
    forward_ipv6="$(dig +time=3 +tries=1 +short AAAA "$ptr6_name" 2>/dev/null)"
    if grep -Fxiq "$public_ipv6" <<< "$forward_ipv6"; then
      pass "IPv6 PTR: ${ptr6_name} forward-confirms to the public IPv6"
      ptr6_status="PASS"
    else warn "IPv6 PTR: ${ptr6_name} exists but does not forward-confirm to the public IPv6"; fi
  elif [[ -n "$ptr6_name" ]]; then
    fail "IPv6 PTR: '${ptr6_name}' is not a usable fully qualified mail hostname"
  else
    fail "IPv6 PTR: no reverse-DNS hostname exists for the public IPv6"
  fi
fi
if [[ "$outbound25_ipv4" == "PASS" && "$ptr4_status" == "PASS" ]] || [[ "$outbound25_ipv6" == "PASS" && "$ptr6_status" == "PASS" ]]; then ptr_status="PASS"; fi

domains_value="$(read_setting MAIL_DOMAINS)"
[[ -z "$domains_value" ]] && domains_value="$(read_setting MAIL_DOMAIN)"
dkim_selector="$(read_setting DKIM_SELECTOR)"
[[ -z "$dkim_selector" ]] && dkim_selector="relaybox"
dns_status="READY"

printf '\nDNS READINESS\n'
if [[ -z "$domains_value" ]]; then
  fail "No MAIL_DOMAINS configuration was found"; dns_status="NOT READY"
elif ! has dig; then
  unknown "dig is unavailable, so DNS records cannot be inspected"; dns_status="NOT READY"
else
  IFS=',' read -r -a domains <<< "$domains_value"
  for raw_domain in "${domains[@]}"; do
    domain="$(printf '%s' "$raw_domain" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
    [[ -z "$domain" ]] && continue
    printf '\nDomain: %s\n' "$domain"
    mx_records="$(dig +time=3 +tries=1 +short MX "$domain" 2>/dev/null)"
    if [[ -n "$mx_records" ]]; then
      pass "MX exists: $(tr '\n' ' ' <<< "$mx_records" | sed 's/[[:space:]]*$//')"
      mx_self=false
      while read -r _ mx_host; do
        mx_host="${mx_host%.}"
        [[ -z "$mx_host" ]] && continue
        if [[ -n "$public_ipv4" ]] && dig +short A "$mx_host" 2>/dev/null | grep -Fxq "$public_ipv4"; then mx_self=true; fi
        if [[ -n "$public_ipv6" ]] && dig +short AAAA "$mx_host" 2>/dev/null | grep -Fxiq "$public_ipv6"; then mx_self=true; fi
      done <<< "$mx_records"
      if $mx_self; then pass "MX resolves to a detected public host address"; else warn "MX does not currently resolve to this host's detected public IPs"; dns_status="NOT READY"; fi
    else fail "MX is missing"; dns_status="NOT READY"; fi

    txt_records="$(dig +time=3 +tries=1 +short TXT "$domain" 2>/dev/null | tr -d '"')"
    spf_record="$(grep -i '^v=spf1' <<< "$txt_records" | head -n 1 || true)"
    if [[ -n "$spf_record" ]]; then
      pass "SPF exists: ${spf_record}"
      spf_authorized=false
      [[ -n "$public_ipv4" && "$spf_record" == *"ip4:${public_ipv4}"* ]] && spf_authorized=true
      [[ -n "$public_ipv6" && "$spf_record" == *"ip6:${public_ipv6}"* ]] && spf_authorized=true
      if ! $spf_authorized; then warn "SPF does not explicitly authorize either detected public IP"; dns_status="NOT READY"; fi
    else fail "SPF is missing"; dns_status="NOT READY"; fi

    dkim_record="$(dig +time=3 +tries=1 +short TXT "${dkim_selector}._domainkey.${domain}" 2>/dev/null | tr -d '"')"
    if grep -qi 'v=DKIM1\|p=' <<< "$dkim_record"; then pass "DKIM exists for selector '${dkim_selector}'"; else warn "DKIM was not found for selector '${dkim_selector}' (set DKIM_SELECTOR if another selector is in use)"; dns_status="NOT READY"; fi

    dmarc_record="$(dig +time=3 +tries=1 +short TXT "_dmarc.${domain}" 2>/dev/null | tr -d '"')"
    if grep -qi '^v=DMARC1' <<< "$dmarc_record"; then pass "DMARC exists: ${dmarc_record}"; else fail "DMARC is missing"; dns_status="NOT READY"; fi
  done
fi

direct_status="UNKNOWN"
if [[ -n "$local_ipv4" && "$local_ipv4" == "$public_ipv4" ]] && has ss && ss -ltnH '( sport = :25 )' 2>/dev/null | grep -q .; then direct_status="PASS"; fi

overall="PARTIALLY READY"
if [[ -z "$public_ipv4" && -z "$public_ipv6" ]] || [[ "$cgnat" == "YES" ]] || [[ "$outbound25" == "FAIL" ]]; then overall="BLOCKED"
elif [[ "$inbound_status" == "PASS" && "$ptr_status" == "PASS" && "$dns_status" == "READY" && "$direct_status" == "PASS" ]]; then overall="READY"
fi

printf '\nSELF-HOSTED SMTP READINESS\n'
printf 'Inbound SMTP: %s\n' "$inbound_status"
printf 'Outbound SMTP: %s\n' "$outbound25"
printf 'Public IP: %s\n' "$([[ -n "$public_ipv4" || -n "$public_ipv6" ]] && echo PASS || echo FAIL)"
printf 'Direct reachability: %s\n' "$direct_status"
printf 'CGNAT: %s\n' "$cgnat"
printf 'PTR: %s\n' "$ptr_status"
printf 'DNS: %s\n' "$dns_status"
printf '\nOverall: %s\n' "$overall"

if [[ "$inbound_status" == "UNKNOWN" ]]; then
  printf '\nNext diagnostic prerequisite: verify the router WAN address, configure a temporary TCP-25 listener/firewall rule, and probe it from a genuinely external network.\n'
fi
if [[ "$overall" == "BLOCKED" ]]; then
  printf 'Do not replace Resend or install the production mail stack until the blocking network condition is resolved.\n'
fi
