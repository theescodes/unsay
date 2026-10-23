# Publishing to the Chrome Web Store

The first version goes into the store by hand (see [store-listing.md](store-listing.md)): the API
can only update an item that already exists. Every release after that reaches the store through
CI:

1. [release.yml](../.github/workflows/release.yml) publishes the release, then starts
   [store.yml](../.github/workflows/store.yml) for its tag.
2. store.yml waits in the `chrome-web-store` environment until the maintainer approves the run.
3. It downloads the zip from the published release, checks it against the immutable release and
   its build attestation, uploads it to the store and submits it for review. Google publishes it
   once the review passes.

[store-check.yml](../.github/workflows/store-check.yml) runs weekly and checks that the store
serves the same files as the release of the same version (`scripts/compare-store.mjs`, which
anyone can run: `node scripts/compare-store.mjs <item id> <dir>`).

To submit a release again, for example after a rejected review, run store.yml by hand on `main`
with the release's tag.

## No stored credentials

store.yml holds no Google key, client secret or refresh token. The job's GitHub OIDC token is
exchanged through Workload Identity Federation for a service account access token that lives 15
minutes and only carries the Chrome Web Store scope. Google only makes that exchange for jobs in
the `chrome-web-store` environment of this repository (matched by repository ID, so a renamed or
recreated repository gets nothing), and the environment only runs on `main` after approval.

The service account has no Google Cloud roles. Its only power is what the Chrome Web Store
dashboard grants it: updating this publisher's items.

## One-time setup

Until `CWS_ITEM_ID` is set, store.yml and store-check.yml are skipped and release.yml does not
start them. Set it last.

**1. Google Cloud.** In a project of your own (`PROJECT`, with its number `PROJECT_NUMBER`):

```sh
gcloud services enable chromewebstore.googleapis.com iamcredentials.googleapis.com \
  sts.googleapis.com --project "$PROJECT"

gcloud iam service-accounts create unsay-store --project "$PROJECT" \
  --display-name "Unsay store upload"

gcloud iam workload-identity-pools create github --project "$PROJECT" --location global

gcloud iam workload-identity-pools providers create-oidc unsay --project "$PROJECT" \
  --location global --workload-identity-pool github \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping google.subject=assertion.sub,attribute.repository_id=assertion.repository_id \
  --attribute-condition "assertion.repository_id == '1419889137' && assertion.sub == 'repo:theescodes/unsay:environment:chrome-web-store'"

gcloud iam service-accounts add-iam-policy-binding \
  "unsay-store@$PROJECT.iam.gserviceaccount.com" --project "$PROJECT" \
  --role roles/iam.workloadIdentityUser \
  --member "principal://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/subject/repo:theescodes/unsay:environment:chrome-web-store"
```

`1419889137` is this repository's ID (`gh api repos/theescodes/unsay --jq .id`).

**2. Chrome Web Store dashboard.** Under **Account**, add the service account's email
(`unsay-store@PROJECT.iam.gserviceaccount.com`). Note the publisher ID (**Publisher > Settings**)
and the item ID. The account needs 2-step verification.

**3. GitHub environment.** Create `chrome-web-store` with the maintainer as required reviewer and
`main` as the only deployment branch:

```sh
gh api -X PUT repos/theescodes/unsay/environments/chrome-web-store --input - <<EOF
{"reviewers": [{"type": "User", "id": $(gh api user --jq .id)}],
 "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
EOF
gh api -X POST repos/theescodes/unsay/environments/chrome-web-store/deployment-branch-policies \
  -f name=main -f type=branch
```

**4. Repository variables.** None of these is secret; `CWS_ITEM_ID` goes last, because it switches
the store jobs on:

```sh
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER \
  --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/unsay"
gh variable set GCP_SERVICE_ACCOUNT --body "unsay-store@$PROJECT.iam.gserviceaccount.com"
gh variable set CWS_PUBLISHER_ID --body "<publisher id>"
gh variable set CWS_ITEM_ID --body "<item id>"
```

Then run store-check.yml by hand once the hand-submitted version is live. Its first run is also
the check that the store changes nothing beyond `_metadata/` and manifest.json's `update_url`, the
two differences the script allows for.
