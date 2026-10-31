pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timeout(time: 60, unit: 'MINUTES')
  }

  parameters {
    string(
      name: 'DOCKERHUB_CREDENTIALS_ID',
      defaultValue: 'dockerhub-jktsoft',
      description: 'Jenkins credential ID (Docker Hub username + access token)'
    )
    string(
      name: 'DOCKER_IMAGE_REPO',
      defaultValue: 'jktsoft/traverior-api',
      description: 'Docker Hub repository (username/name)'
    )
    string(
      name: 'INFISICAL_CREDENTIALS_ID',
      defaultValue: 'infisical-universal-auth',
      description: 'Jenkins Username/password credential: Client ID + Client Secret (Universal Auth)'
    )
    string(
      name: 'INFISICAL_PROJECT_ID',
      defaultValue: '870cd5c6-03ea-441c-a052-3a1c186109f2',
      description: 'Infisical Project ID (Project Settings)'
    )
    string(
      name: 'INFISICAL_ENV',
      defaultValue: 'prod',
      description: 'Infisical environment slug (e.g. prod, staging)'
    )
    string(
      name: 'INFISICAL_SECRET_PATH',
      defaultValue: '/traverior/backend',
      description: 'Infisical folder path where secrets live (e.g. /traverior-api). Use / for root.'
    )
    string(
      name: 'INFISICAL_DOMAIN',
      defaultValue: 'https://app.infisical.com',
      description: 'Infisical Cloud US. Use https://eu.infisical.com for EU'
    )
    string(
      name: 'HOST_PORT',
      defaultValue: '8002',
      description: 'Host port mapped to container PORT 3000'
    )
    booleanParam(
      name: 'PRUNE_IMAGES',
      defaultValue: true,
      description: 'Prune unused Docker images after deploy'
    )
  }

  environment {
    HOST_PORT                  = "${params.HOST_PORT ?: '8002'}"
    CONTAINER_NAME             = 'traverior-api'
    CONTAINER_PORT             = '3000'
    ENV_FILE                   = 'api/.env'
    DOCKER_CONTEXT             = 'api'
    DOCKERHUB_CREDENTIALS_ID   = "${params.DOCKERHUB_CREDENTIALS_ID ?: 'dockerhub-jktsoft'}"
    DOCKER_IMAGE_REPO          = "${params.DOCKER_IMAGE_REPO ?: 'jktsoft/traverior-api'}"
    INFISICAL_CREDENTIALS_ID   = "${params.INFISICAL_CREDENTIALS_ID ?: 'infisical-universal-auth'}"
    INFISICAL_PROJECT_ID       = "${params.INFISICAL_PROJECT_ID ?: '870cd5c6-03ea-441c-a052-3a1c186109f2'}"
    INFISICAL_ENV              = "${params.INFISICAL_ENV ?: 'prod'}"
    INFISICAL_SECRET_PATH      = "${params.INFISICAL_SECRET_PATH ?: '/products/traverior-api'}"
    INFISICAL_DOMAIN           = "${params.INFISICAL_DOMAIN ?: 'https://app.infisical.com'}"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        sh '''
          set -euo pipefail
          echo "Commit : $(git rev-parse --short HEAD)"
          echo "Branch : ${GIT_BRANCH:-unknown}"
          echo "Image  : ${DOCKER_IMAGE_REPO}"
          echo "Context: ${DOCKER_CONTEXT}"
          echo "Port   : ${HOST_PORT} -> ${CONTAINER_PORT}"
          echo "Infisical env : ${INFISICAL_ENV}"
          test -f "${DOCKER_CONTEXT}/Dockerfile"
          docker version
        '''
      }
    }

    stage('Build & push image') {
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: "${env.DOCKERHUB_CREDENTIALS_ID}",
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS'
          )
        ]) {
          sh '''
            set -euxo pipefail

            IMAGE_TAG="$(git rev-parse --short HEAD)"
            FULL_IMAGE="${DOCKER_IMAGE_REPO}:${IMAGE_TAG}"
            LATEST_IMAGE="${DOCKER_IMAGE_REPO}:latest"

            echo "Disk before build:"
            df -h / /var/lib/docker 2>/dev/null || df -h /

            docker builder prune -f || true
            docker container prune -f || true

            echo "Building ${FULL_IMAGE} (context=${DOCKER_CONTEXT})"
            build_ok=0
            for attempt in 1 2 3; do
              echo "docker build attempt ${attempt}/3"
              if docker build --pull -t "${FULL_IMAGE}" -t "${LATEST_IMAGE}" "${DOCKER_CONTEXT}"; then
                build_ok=1
                break
              fi
              echo "Build attempt ${attempt} failed — pruning builder cache and retrying..."
              docker builder prune -af || true
              sleep 5
            done
            if [ "${build_ok}" != "1" ]; then
              echo "ERROR: docker build failed after 3 attempts"
              exit 1
            fi

            echo "Pushing to Docker Hub"
            echo "${DOCKER_PASS}" | docker login -u "${DOCKER_USER}" --password-stdin
            docker push "${FULL_IMAGE}"
            docker push "${LATEST_IMAGE}"
            docker logout || true

            echo "${FULL_IMAGE}" > image-tag.txt
          '''
        }
      }
    }

    stage('Fetch secrets → .env') {
      steps {
        sh '''#!/usr/bin/env bash
          set -eo pipefail
          echo "=============================================="
          echo "STAGE: Fetch secrets → .env (start)"
          echo "=============================================="
          echo "Time               : $(date -Is 2>/dev/null || date)"
          echo "PWD                : $(pwd)"
          echo "ENV_FILE           : ${ENV_FILE:-api/.env}"
          echo "INFISICAL_DOMAIN   : ${INFISICAL_DOMAIN:-unset}"
          echo "INFISICAL_PROJECT_ID: ${INFISICAL_PROJECT_ID:-UNSET}"
          echo "INFISICAL_ENV      : ${INFISICAL_ENV:-unset}"
          echo "INFISICAL_SECRET_PATH: ${INFISICAL_SECRET_PATH:-unset}"
          echo "INFISICAL_CREDENTIALS_ID: ${INFISICAL_CREDENTIALS_ID:-unset}"
          if [ -z "${INFISICAL_PROJECT_ID:-}" ]; then
            echo "ERROR: INFISICAL_PROJECT_ID is missing from the job environment."
            echo "Use Build with Parameters and set INFISICAL_PROJECT_ID (Project Settings → Project ID)."
            exit 1
          fi
          if ! command -v curl >/dev/null 2>&1; then
            echo "ERROR: curl not found in Jenkins agent"
            exit 1
          fi
          echo "curl: $(command -v curl) ($(curl --version | head -n1))"
          if command -v python3 >/dev/null 2>&1; then
            echo "python3: $(command -v python3) ($(python3 --version))"
          elif command -v docker >/dev/null 2>&1; then
            echo "python3: not installed — will parse JSON via docker run python:3.12-alpine"
            docker version >/dev/null
          else
            echo "ERROR: need python3 or docker on the Jenkins agent to parse Infisical JSON"
            exit 1
          fi
          mkdir -p api
          echo "Will load Client ID/Secret from Jenkins credential: ${INFISICAL_CREDENTIALS_ID}"
          echo "Pre-check OK" | tee infisical-fetch.log
        '''

        withCredentials([
          usernamePassword(
            credentialsId: "${env.INFISICAL_CREDENTIALS_ID}",
            usernameVariable: 'INFISICAL_CLIENT_ID',
            passwordVariable: 'INFISICAL_CLIENT_SECRET'
          )
        ]) {
          sh '''#!/usr/bin/env bash
          set -eo pipefail
          LOG="infisical-fetch.log"
          exec > >(tee -a "${LOG}") 2>&1
          set -x

          run_py_stdin() {
            local pyfile="$1"
            if command -v python3 >/dev/null 2>&1; then
              python3 "${pyfile}"
            else
              local b64
              b64="$(base64 -w0 < "${pyfile}" 2>/dev/null || base64 < "${pyfile}" | tr -d '\n')"
              docker run --rm -i -e PYB64="${b64}" python:3.12-alpine \
                python3 -c 'import base64,os; exec(base64.b64decode(os.environ["PYB64"]))'
            fi
          }

          cat > infisical_token.py <<'PY'
import json, sys
data = json.load(sys.stdin)
token = data.get("accessToken") or data.get("access_token")
if not token:
    raise SystemExit("login JSON missing accessToken: " + json.dumps(data)[:800])
print(token)
PY

          cat > infisical_to_env.py <<'PY'
import json, sys
data = json.load(sys.stdin)
secrets = data.get("secrets") or data.get("data") or []
items = []
if isinstance(secrets, dict):
    for k, v in secrets.items():
        if isinstance(v, dict):
            v = v.get("secretValue") or v.get("value") or ""
        items.append((str(k), str(v)))
else:
    for s in secrets:
        if not isinstance(s, dict):
            continue
        k = s.get("secretKey") or s.get("key") or s.get("secret_key")
        v = s.get("secretValue") or s.get("value") or s.get("secret_value")
        if k is not None and v is not None:
            items.append((str(k), str(v)))

nl = chr(10)
cr = chr(13)
esc_nl = chr(92) + "n"
lines = [
    "NODE_ENV=production",
    "PORT=3000",
    "AUTH_MODE=firebase",
    "MCP_MODE=inprocess",
    "LOG_DIR=logs",
    "LOG_LEVEL=info",
    "CACHE_ENABLED=true",
    "",
    "# --- from Infisical ---",
]
seen = {
    "NODE_ENV",
    "PORT",
    "AUTH_MODE",
    "MCP_MODE",
    "LOG_DIR",
    "LOG_LEVEL",
    "CACHE_ENABLED",
}
for k, v in items:
    v = v.replace(cr, "").replace(nl, esc_nl)
    if k in seen:
        lines = [ln for ln in lines if not ln.startswith(k + "=")]
    lines.append("%s=%s" % (k, v))
    seen.add(k)

sys.stdout.write(nl.join(lines) + nl)
sys.stderr.write("Infisical secret count: %d%s" % (len(items), nl))
if len(items) == 0:
    sys.stderr.write("WARNING: 0 secrets returned - check environment slug / secretPath / permissions%s" % nl)
PY

          echo "=============================================="
          echo "STAGE: Infisical API fetch (Jenkins credentials)"
          echo "=============================================="
          echo "Credential ID       : ${INFISICAL_CREDENTIALS_ID}"
          echo "Client ID length    : ${#INFISICAL_CLIENT_ID}"
          echo "Client Secret length: ${#INFISICAL_CLIENT_SECRET}"

          if [ -z "${INFISICAL_PROJECT_ID:-}" ]; then
            echo "ERROR: INFISICAL_PROJECT_ID is empty."
            exit 1
          fi
          if [ -z "${INFISICAL_CLIENT_ID:-}" ] || [ -z "${INFISICAL_CLIENT_SECRET:-}" ]; then
            echo "ERROR: Jenkins credential '${INFISICAL_CREDENTIALS_ID}' returned empty username/password."
            echo "Expected Username=Infisical Client ID, Password=Client Secret."
            exit 1
          fi

          echo "==> POST ${INFISICAL_DOMAIN}/api/v1/auth/universal-auth/login"
          LOGIN_BODY="infisical-login.json"
          HTTP_CODE="$(curl -sS -o "${LOGIN_BODY}" -w '%{http_code}' \
            -X POST "${INFISICAL_DOMAIN}/api/v1/auth/universal-auth/login" \
            -H 'Content-Type: application/x-www-form-urlencoded' \
            --data-urlencode "clientId=${INFISICAL_CLIENT_ID}" \
            --data-urlencode "clientSecret=${INFISICAL_CLIENT_SECRET}" \
            || echo "curl_failed")"
          echo "Login HTTP status: ${HTTP_CODE}"
          if [ "${HTTP_CODE}" != "200" ]; then
            echo "ERROR: Infisical login failed"
            echo "----- login response (safe) -----"
            sed -E 's/"accessToken":"[^"]+"/"accessToken":"***"/g; s/"clientSecret":"[^"]+"/"clientSecret":"***"/g' "${LOGIN_BODY}" || cat "${LOGIN_BODY}" || true
            echo "----- end -----"
            rm -f "${LOGIN_BODY}" || true
            exit 1
          fi
          echo "Login OK"

          ACCESS_TOKEN="$(run_py_stdin infisical_token.py < "${LOGIN_BODY}")"
          echo "Access token received (length=${#ACCESS_TOKEN})"

          SECRET_PATH="${INFISICAL_SECRET_PATH:-/}"
          case "${SECRET_PATH}" in
            /*) ;;
            *) SECRET_PATH="/${SECRET_PATH}" ;;
          esac
          echo "==> GET secrets raw env=${INFISICAL_ENV} project=${INFISICAL_PROJECT_ID} path=${SECRET_PATH}"
          SECRETS_BODY="infisical-secrets.json"
          HTTP_CODE="$(curl -sS -o "${SECRETS_BODY}" -w '%{http_code}' \
            -G "${INFISICAL_DOMAIN}/api/v3/secrets/raw" \
            -H "Authorization: Bearer ${ACCESS_TOKEN}" \
            --data-urlencode "workspaceId=${INFISICAL_PROJECT_ID}" \
            --data-urlencode "environment=${INFISICAL_ENV}" \
            --data-urlencode "secretPath=${SECRET_PATH}" \
            --data-urlencode "include_imports=true" \
            || echo "curl_failed")"
          echo "Secrets HTTP status (workspaceId): ${HTTP_CODE}"

          if [ "${HTTP_CODE}" != "200" ]; then
            echo "Retry with projectId query param..."
            HTTP_CODE="$(curl -sS -o "${SECRETS_BODY}" -w '%{http_code}' \
              -G "${INFISICAL_DOMAIN}/api/v3/secrets/raw" \
              -H "Authorization: Bearer ${ACCESS_TOKEN}" \
              --data-urlencode "projectId=${INFISICAL_PROJECT_ID}" \
              --data-urlencode "environment=${INFISICAL_ENV}" \
              --data-urlencode "secretPath=${SECRET_PATH}" \
              --data-urlencode "include_imports=true" \
              || echo "curl_failed")"
            echo "Secrets HTTP status (projectId): ${HTTP_CODE}"
          fi

          if [ "${HTTP_CODE}" != "200" ]; then
            echo "ERROR: secrets fetch failed"
            echo "----- secrets response -----"
            cat "${SECRETS_BODY}" || true
            echo "----- end -----"
            echo "Checklist:"
            echo "  - INFISICAL_PROJECT_ID must be Project ID from Project Settings"
            echo "  - INFISICAL_ENV must match env slug exactly (prod/staging/dev)"
            echo "  - INFISICAL_SECRET_PATH must match folder path (e.g. /products/traverior-api)"
            echo "  - Identity must be in that project"
            rm -f "${LOGIN_BODY}" "${SECRETS_BODY}" || true
            exit 1
          fi
          echo "Secrets fetch OK (path=${SECRET_PATH})"

          mkdir -p "$(dirname "${ENV_FILE}")"
          run_py_stdin infisical_to_env.py < "${SECRETS_BODY}" > "${ENV_FILE}"

          echo "Wrote ${ENV_FILE} ($(wc -l < "${ENV_FILE}") lines)"
          echo "Env key names only:"
          sed -n 's/=.*//p' "${ENV_FILE}" | grep -v '^#' | grep -v '^$' || true
          echo "STAGE: Fetch secrets → api/.env (success)"
          rm -f "${LOGIN_BODY}" "${SECRETS_BODY}" infisical_token.py infisical_to_env.py || true
          '''
        }

        archiveArtifacts artifacts: 'infisical-fetch.log', allowEmptyArchive: true, fingerprint: false
      }
    }

    stage('Pull & run') {
      steps {
        sh '''
          set -euxo pipefail

          FULL_IMAGE="$(cat image-tag.txt)"
          echo "Deploying ${FULL_IMAGE} as ${CONTAINER_NAME}"
          test -f "${ENV_FILE}"

          docker pull "${FULL_IMAGE}"

          docker stop "${CONTAINER_NAME}" 2>/dev/null || true
          docker rm "${CONTAINER_NAME}" 2>/dev/null || true

          if docker volume inspect backend_traverior_api_logs >/dev/null 2>&1; then
            VOLUME_NAME="backend_traverior_api_logs"
          elif docker volume inspect traverior_api_logs >/dev/null 2>&1; then
            VOLUME_NAME="traverior_api_logs"
          else
            VOLUME_NAME="traverior_api_logs"
            docker volume create "${VOLUME_NAME}" >/dev/null
          fi
          echo "Using volume: ${VOLUME_NAME}"

          docker run -d \
            --name "${CONTAINER_NAME}" \
            --restart unless-stopped \
            -p "0.0.0.0:${HOST_PORT}:${CONTAINER_PORT}" \
            --env-file "${ENV_FILE}" \
            -v "${VOLUME_NAME}:/app/logs" \
            "${FULL_IMAGE}"

          docker ps --filter "name=${CONTAINER_NAME}"
          docker logs --tail=80 "${CONTAINER_NAME}" || true
        '''
      }
    }

    stage('Cleanup') {
      when {
        expression { return params.PRUNE_IMAGES }
      }
      steps {
        sh '''
          rm -f "${ENV_FILE}" || true
          docker image prune -f
        '''
      }
    }
  }

  post {
    success {
      echo "Deploy succeeded → traverior-api on port ${env.HOST_PORT} (secrets from Infisical → api/.env → container)"
    }
    failure {
      echo "Deploy failed — check: docker logs traverior-api"
    }
    always {
      sh 'rm -f api/.env || true'
      cleanWs(deleteDirs: true, notFailBuild: true)
    }
  }
}
