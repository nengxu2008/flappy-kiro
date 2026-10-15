#!/usr/bin/env bash
#
# Deploy the Flappy Kiro pipeline and push the local app code into the
# CodeCommit repository the stack creates.
#
# This single script covers the full request end to end:
#   1. Deploys FlappyKiroPipelineStack (creates the CodeCommit repo + Amplify
#      app with auto build/deploy and the hosted-URL output).
#   2. Reads the repo's git-remote-codecommit (GRC) clone URL from the stack
#      outputs.
#   3. Pushes the local application code (the project root, one level up from
#      infra/) to the repo's `main` branch, which triggers the first Amplify
#      build and deploy.
#   4. Prints the Amplify hosted URL.
#
# Prerequisites:
#   - AWS credentials in the environment (profile or env vars) with permission
#     to deploy the stack and push to CodeCommit.
#   - git-remote-codecommit installed so git can push over the `codecommit://`
#     protocol using your AWS credentials (no SSH keys / git credentials to
#     manage):  pip install git-remote-codecommit
#     Docs: https://docs.aws.amazon.com/codecommit/latest/userguide/setting-up-git-remote-codecommit.html
#
# Usage (from the infra/ directory):
#   ./deploy.sh
#
set -euo pipefail

# --- Resolve paths -----------------------------------------------------------
INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${INFRA_DIR}/.." && pwd)"

STACK_NAME="FlappyKiroPipelineStack"
BRANCH="main"

echo "==> Project root: ${PROJECT_ROOT}"
echo "==> Infra dir:    ${INFRA_DIR}"

# --- 0. Preflight: git-remote-codecommit must be installed -------------------
if ! command -v git-remote-codecommit >/dev/null 2>&1 \
   && ! python3 -c "import git_remote_codecommit" >/dev/null 2>&1; then
  echo "ERROR: git-remote-codecommit is not installed."
  echo "       Install it so git can push to CodeCommit with your AWS creds:"
  echo "         pip install git-remote-codecommit"
  exit 1
fi

# --- Amplify service role --------------------------------------------------
# In restricted environments (e.g. a workshop WSParticipantRole) the deploy
# identity cannot run iam:CreateRole, so the Amplify app must REUSE an existing
# role instead of letting CDK create one. Set AMPLIFY_SERVICE_ROLE_ARN (or
# _NAME) to that role and we pass it to the stack via context. If neither is
# set, the stack creates its own role (needs iam:CreateRole on your identity).
AMPLIFY_SERVICE_ROLE_ARN="${AMPLIFY_SERVICE_ROLE_ARN:-}"
AMPLIFY_SERVICE_ROLE_NAME="${AMPLIFY_SERVICE_ROLE_NAME:-}"

ROLE_CTX=()
if [ -n "${AMPLIFY_SERVICE_ROLE_ARN}" ]; then
  ROLE_CTX=(-c "amplifyServiceRoleArn=${AMPLIFY_SERVICE_ROLE_ARN}")
  echo "==> Amplify will reuse role ARN: ${AMPLIFY_SERVICE_ROLE_ARN}"
elif [ -n "${AMPLIFY_SERVICE_ROLE_NAME}" ]; then
  ROLE_CTX=(-c "amplifyServiceRoleName=${AMPLIFY_SERVICE_ROLE_NAME}")
  echo "==> Amplify will reuse role name: ${AMPLIFY_SERVICE_ROLE_NAME}"
else
  echo "==> No AMPLIFY_SERVICE_ROLE_ARN/_NAME set; stack will create its own"
  echo "    role (requires iam:CreateRole). In a restricted account, export"
  echo "    AMPLIFY_SERVICE_ROLE_ARN=<existing-role-arn> and re-run."
fi

# --- 1. Build + deploy the stack ---------------------------------------------
echo "==> Building CDK app..."
npm --prefix "${INFRA_DIR}" run build

# If a previous attempt left the stack in a failed/rollback state, CloudFormation
# will reject a redeploy. Delete it first (safe: nothing in this stack holds data
# we need to keep, and the repo/app would not have been created on a role failure).
STACK_STATUS="$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
  --query 'Stacks[0].StackStatus' --output text 2>/dev/null || true)"
if [ "${STACK_STATUS}" = "ROLLBACK_COMPLETE" ] || [ "${STACK_STATUS}" = "ROLLBACK_FAILED" ] \
   || [ "${STACK_STATUS}" = "CREATE_FAILED" ]; then
  echo "==> Found ${STACK_NAME} in ${STACK_STATUS}; deleting before redeploy..."
  aws cloudformation delete-stack --stack-name "${STACK_NAME}"
  aws cloudformation wait stack-delete-complete --stack-name "${STACK_NAME}"
fi

echo "==> Deploying ${STACK_NAME}..."
npx --prefix "${INFRA_DIR}" cdk deploy "${STACK_NAME}" \
  "${ROLE_CTX[@]}" \
  --require-approval never \
  --outputs-file "${INFRA_DIR}/cdk-outputs.json"

# --- 2. Read the GRC clone URL from the stack outputs ------------------------
# The stack emits RepositoryCloneUrlGrc, e.g. codecommit::<region>://flappy-kiro
GRC_URL="$(node -e "
  const o = require('${INFRA_DIR}/cdk-outputs.json');
  const s = o['${STACK_NAME}'] || {};
  process.stdout.write(s.RepositoryCloneUrlGrc || '');
")"

if [ -z "${GRC_URL}" ]; then
  echo "ERROR: Could not read RepositoryCloneUrlGrc from stack outputs."
  echo "       Check ${INFRA_DIR}/cdk-outputs.json."
  exit 1
fi
echo "==> CodeCommit (GRC) remote: ${GRC_URL}"

# --- 3. Push the local application code to the repo --------------------------
# Push the PROJECT ROOT (the app), not the infra/ directory. We use a scratch
# remote named `codecommit` so we never disturb the user's existing `origin`.
echo "==> Pushing local app code to CodeCommit ${BRANCH}..."
git -C "${PROJECT_ROOT}" remote remove codecommit 2>/dev/null || true
git -C "${PROJECT_ROOT}" remote add codecommit "${GRC_URL}"

# Push the current branch's content to the repo's `main`. Amplify is wired to
# build `main`, so this push triggers the first build + deploy.
CURRENT_BRANCH="$(git -C "${PROJECT_ROOT}" branch --show-current)"
git -C "${PROJECT_ROOT}" push codecommit "HEAD:refs/heads/${BRANCH}"

echo "==> Pushed ${CURRENT_BRANCH} -> codecommit/${BRANCH}. Amplify build started."

# --- 4. Print the hosted URL -------------------------------------------------
HOSTED_URL="$(node -e "
  const o = require('${INFRA_DIR}/cdk-outputs.json');
  const s = o['${STACK_NAME}'] || {};
  process.stdout.write(s.AmplifyHostedUrl || '');
")"

echo ""
echo "============================================================"
echo " Amplify hosted URL: ${HOSTED_URL}"
echo "============================================================"
echo " The first build is running now. The site is live once the"
echo " build for '${BRANCH}' finishes (watch it in the Amplify console)."
echo ""
echo " To update later, just push to codecommit/${BRANCH} again:"
echo "   git push codecommit HEAD:refs/heads/${BRANCH}"
