# Friction log

Build, Ship, Shape. Bee track, with Amazon Bedrock in `eu-west-2` for the AWS Builder mini-challenge.

The Ordinary (theordinary.club) is a membership app. A signed-in member asks about their own week. Bee supplies the notes. WHOOP supplies recovery, sleep, and strain. Amazon Nova Lite on Bedrock writes the reply. The reply does not diagnose, and it does not write back to Bee or WHOOP.

Two places cost the most time.

## 1. Sign in to Bee from a hosted app

**Task.** Connect a member’s Bee account so the production app can read their conversations, daily summaries, facts, and todos.

**Steps.**

1. Turn on Developer Mode in the Bee app (tap the version five times). On Android, that row stays hidden until a Bee device is paired.
2. `pnpm add @beeai/cli`, then `bee login`. The connect link expires in about five minutes.
3. Locally, start `bee proxy` and point the app at `http://127.0.0.1:8787`.
4. In production, store a bearer token and call `https://app-api-developer.ce.bee.amazon.dev` with Bee’s private root CA bundled in the server.

**Expected.** A member signs in with Bee from theordinary.club, the way WHOOP OAuth already works.

**Actual.** `bee login` hung when the machine had no system keychain. `BEE_FORCE_FILE_STORE=1` and a file under `~/.bee` got past it. There is no “Sign in with Bee,” and a third-party app cannot register its own `app_id`. The proxy is unauthenticated and has to stay on localhost. Direct calls need Bee’s private CA, so the public Bee host is not usable. Production works only after someone pastes a developer token into `integration_secrets`.

**Severity.** High.

**Workaround.** Local reads go through `bee proxy`. The hosted app uses the pasted token and the bundled CA.

**Suggestion.** A member OAuth flow and a public API host, with an `app_id` a third-party app can register. Developer Mode should not depend on a paired device when the CLI is the client.

## 2. First Amazon Bedrock Claude call

**Task.** One `Converse` call from the membership chat, in London, using Claude.

**Steps.**

1. Create an IAM user allowed to call `bedrock:InvokeModel` on `eu.anthropic.claude-sonnet-5` in `eu-west-2`.
2. Run `aws bedrock-runtime converse` against that model.
3. Look for the access step in the hackathon resources.

**Expected.** A text reply, or a form that clearly unlocks the model.

**Actual.** The hackathon resources page never says how to request model access. An older AWS guide still points at the Bedrock Model access page, which has been retired. The first call returned `AccessDeniedException: Your account is currently being verified`. After that hold cleared, the same call returned `anthropic.claude-sonnet-5 is not available for this account` and pointed at AWS Sales. Claude Sonnet 4.6 and 4.5 failed the same way. Console sign-in stopped on a passkey, and the invoke-only user cannot call `iam:PutUserPolicy`, so the policy change had to be done by hand in the console.

**Severity.** High.

**Workaround.** Call `amazon.nova-lite-v1:0` in `eu-west-2` after adding that model id to the invoke policy. The first `Converse` after that save returned “Ready.” Nova Lite does not need the Anthropic use-case form. That is the model the chat ships with.

**Suggestion.** On the hackathon resources page, say that the Model access page is retired, that Anthropic needs the use-case form, and that some accounts still need AWS Sales before Claude will run. Say that Amazon Nova in the same region works without that form.
